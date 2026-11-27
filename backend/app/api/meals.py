from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Booking, BookingMealRequest, Meal
from app.validations.validators import clean_str

logger = logging.getLogger("blueberry.meals")
router = APIRouter(prefix="/api/meals", tags=["Meals & Food Management"])


# ==============================================================================
# SCHEMAS
# ==============================================================================

class MealCreate(BaseModel):
    meal_code: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=100)
    category: str = Field(default="Lunch")  # Breakfast, Lunch, Hi-Tea / Snacks, Dinner, Extra Meals, Beverages
    dietary_type: str = Field(default="Vegetarian")  # Vegetarian, Non-Vegetarian, Jain, All
    price: float = Field(default=0.0, ge=0)
    price_unit: str = Field(default="Per Plate")
    is_package_includable: bool = True
    serving_time: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class MealUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    dietary_type: Optional[str] = None
    price: Optional[float] = None
    price_unit: Optional[str] = None
    is_package_includable: Optional[bool] = None
    serving_time: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class BookingMealRequestCreate(BaseModel):
    booking_id: str
    meal_id: Optional[str] = None
    meal_name: str
    meal_category: str = "Lunch"
    dietary_type: str = "Vegetarian"
    quantity: int = Field(default=1, ge=1)
    unit_price: float = Field(default=0.0, ge=0)
    is_chargeable: bool = False
    preparation_date: str
    special_instructions: Optional[str] = None


class MealStatusUpdate(BaseModel):
    preparation_status: str = Field(..., pattern="^(Pending|Preparing|Ready|Served|Cancelled)$")


def serialize_meal(m: Meal) -> Dict[str, Any]:
    return {
        "id": m.id,
        "meal_code": m.meal_code,
        "name": m.name,
        "category": m.category,
        "dietary_type": m.dietary_type,
        "price": float(m.price),
        "price_unit": m.price_unit,
        "is_package_includable": m.is_package_includable,
        "serving_time": m.serving_time,
        "description": m.description,
        "is_active": m.is_active,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def serialize_meal_request(r: BookingMealRequest) -> Dict[str, Any]:
    return {
        "id": r.id,
        "booking_id": r.booking_id,
        "booking_reference": r.booking.booking_reference if r.booking else None,
        "customer_name": r.booking.customer.full_name if r.booking and r.booking.customer else None,
        "meal_id": r.meal_id,
        "meal_name": r.meal_name,
        "meal_category": r.meal_category,
        "dietary_type": r.dietary_type,
        "quantity": r.quantity,
        "unit_price": float(r.unit_price),
        "total_price": float(r.total_price),
        "is_chargeable": r.is_chargeable,
        "preparation_date": r.preparation_date.isoformat(),
        "preparation_status": r.preparation_status,
        "special_instructions": r.special_instructions,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# ==============================================================================
# ENDPOINTS
# ==============================================================================

@router.get("")
def list_meals(
    category: Optional[str] = Query(default=None),
    dietary_type: Optional[str] = Query(default=None),
    active_only: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("packages:read")),
) -> Dict[str, Any]:
    q = db.query(Meal)
    if active_only:
        q = q.filter(Meal.is_active == True)
    if category and category != "ALL":
        q = q.filter(Meal.category == category)
    if dietary_type and dietary_type != "ALL":
        q = q.filter(Meal.dietary_type == dietary_type)

    meals = q.order_by(Meal.category.asc(), Meal.name.asc()).all()
    return {"items": [serialize_meal(m) for m in meals], "total": len(meals)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_meal(
    payload: MealCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("packages:write")),
) -> Dict[str, Any]:
    code = clean_str(payload.meal_code).upper()
    existing = db.query(Meal).filter(Meal.meal_code == code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Meal code '{code}' already exists.")

    meal = Meal(
        meal_code=code,
        name=clean_str(payload.name),
        category=payload.category,
        dietary_type=payload.dietary_type,
        price=Decimal(str(payload.price)),
        price_unit=clean_str(payload.price_unit) or "Per Plate",
        is_package_includable=payload.is_package_includable,
        serving_time=clean_str(payload.serving_time),
        description=clean_str(payload.description),
        is_active=payload.is_active,
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)

    return {"meal": serialize_meal(meal), "message": "Meal created successfully."}


@router.put("/{meal_id}")
def update_meal(
    meal_id: str,
    payload: MealUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("packages:write")),
) -> Dict[str, Any]:
    meal = db.query(Meal).filter(Meal.id == meal_id).first()
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found.")

    if payload.name is not None:
        meal.name = clean_str(payload.name)
    if payload.category is not None:
        meal.category = payload.category
    if payload.dietary_type is not None:
        meal.dietary_type = payload.dietary_type
    if payload.price is not None:
        meal.price = Decimal(str(payload.price))
    if payload.price_unit is not None:
        meal.price_unit = clean_str(payload.price_unit)
    if payload.is_package_includable is not None:
        meal.is_package_includable = payload.is_package_includable
    if payload.serving_time is not None:
        meal.serving_time = clean_str(payload.serving_time)
    if payload.description is not None:
        meal.description = clean_str(payload.description)
    if payload.is_active is not None:
        meal.is_active = payload.is_active

    db.commit()
    db.refresh(meal)
    return {"meal": serialize_meal(meal), "message": "Meal updated successfully."}


@router.get("/kitchen-daily-report")
def get_kitchen_daily_report(
    target_date: Optional[str] = Query(default=None, description="YYYY-MM-DD (defaults to today)"),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:read")),
) -> Dict[str, Any]:
    """
    Dedicated Kitchen Operations Report:
    Aggregates active guest headcounts staying on this date, food preferences,
    dietary breakdowns, special instructions, and meal requests.
    """
    if target_date:
        try:
            report_dt = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            report_dt = ist_now().date()
    else:
        report_dt = ist_now().date()

    # Active bookings in-house on report_dt: check_in <= report_dt <= check_out
    in_house_bookings = (
        db.query(Booking)
        .filter(
            Booking.booking_status.in_(["Confirmed", "Checked In"]),
            Booking.check_in_date <= report_dt,
            Booking.check_out_date >= report_dt,
        )
        .all()
    )

    total_guests = sum(b.total_guests for b in in_house_bookings)
    adults_count = sum(b.adults for b in in_house_bookings)
    children_count = sum(b.children for b in in_house_bookings)

    # Collect dietary preferences & booking instructions
    guest_groups = []
    veg_count = 0
    non_veg_count = 0
    jain_count = 0

    for b in in_house_bookings:
        food_pref = (b.enquiry.food_preferences if b.enquiry and b.enquiry.food_preferences else "") or (b.special_requests or "")
        diet = food_pref.lower()
        if "jain" in diet:
            jain_count += b.total_guests
        elif "non-veg" in diet or "both" in diet:
            non_veg_count += b.total_guests
        else:
            veg_count += b.total_guests

        guest_groups.append({
            "booking_reference": b.booking_reference,
            "guest_name": b.customer.full_name if b.customer else "Guest",
            "total_guests": b.total_guests,
            "adults": b.adults,
            "children": b.children,
            "dietary_preference": food_pref or "Standard Maharashtrian",
            "special_instructions": b.special_requests or "None",
            "check_in": b.check_in_date.isoformat(),
            "check_out": b.check_out_date.isoformat(),
            "package_name": b.package.name if b.package else "Stay Package",
        })

    # Fetch custom meal orders for this date
    meal_requests = (
        db.query(BookingMealRequest)
        .filter(BookingMealRequest.preparation_date == report_dt)
        .order_by(BookingMealRequest.created_at.desc())
        .all()
    )

    return {
        "report_date": report_dt.isoformat(),
        "summary": {
            "total_active_bookings": len(in_house_bookings),
            "total_headcount_to_feed": total_guests,
            "adults": adults_count,
            "children": children_count,
            "estimated_veg_guests": veg_count,
            "estimated_non_veg_guests": non_veg_count,
            "estimated_jain_guests": jain_count,
        },
        "guest_groups": guest_groups,
        "special_meal_orders": [serialize_meal_request(r) for r in meal_requests],
    }


@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_booking_meal_request(
    payload: BookingMealRequestCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    try:
        prep_dt = datetime.strptime(payload.preparation_date, "%Y-%m-%d").date()
    except ValueError:
        prep_dt = booking.check_in_date

    qty = max(1, payload.quantity)
    u_price = Decimal(str(payload.unit_price))
    t_price = u_price * Decimal(str(qty)) if payload.is_chargeable else Decimal("0.00")

    req = BookingMealRequest(
        booking_id=booking.id,
        meal_id=payload.meal_id,
        meal_name=clean_str(payload.meal_name),
        meal_category=payload.meal_category,
        dietary_type=payload.dietary_type,
        quantity=qty,
        unit_price=u_price,
        total_price=t_price,
        is_chargeable=payload.is_chargeable,
        preparation_date=prep_dt,
        preparation_status="Pending",
        special_instructions=clean_str(payload.special_instructions),
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    return {"meal_request": serialize_meal_request(req), "message": "Meal order registered for kitchen."}


@router.put("/requests/{request_id}/status")
def update_meal_preparation_status(
    request_id: str,
    payload: MealStatusUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    req = db.query(BookingMealRequest).filter(BookingMealRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Meal request not found.")

    req.preparation_status = payload.preparation_status
    db.commit()

    return {"success": True, "status": req.preparation_status, "message": "Preparation status updated."}

