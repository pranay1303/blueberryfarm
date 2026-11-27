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
from app.models.sql_models import Booking, Room, RoomAllocation, RoomBlock
from app.validations.validators import clean_str, validate_stay_dates

logger = logging.getLogger("blueberry.rooms")
router = APIRouter(prefix="/api/rooms", tags=["Rooms & Accommodation"])


# ==============================================================================
# SCHEMAS
# ==============================================================================

class RoomCreate(BaseModel):
    room_number: str = Field(..., min_length=1, max_length=50)
    room_name: str = Field(..., min_length=2, max_length=100)
    accommodation_type: str = Field(default="Cottage")
    room_category: str = Field(default="Deluxe AC")
    capacity: int = Field(default=4, ge=1)
    number_of_beds: int = Field(default=2, ge=1)
    is_ac: bool = True
    base_rate: float = Field(default=2500.0, ge=0)
    extra_guest_charge: float = Field(default=800.0, ge=0)
    cleaning_status: str = Field(default="Clean")
    amenities: Optional[str] = "AC, Attached Bathroom, Double Bed, Hot Water"
    notes: Optional[str] = None
    is_active: bool = True


class RoomUpdate(BaseModel):
    room_number: Optional[str] = None
    room_name: Optional[str] = None
    accommodation_type: Optional[str] = None
    room_category: Optional[str] = None
    capacity: Optional[int] = None
    number_of_beds: Optional[int] = None
    is_ac: Optional[bool] = None
    base_rate: Optional[float] = None
    extra_guest_charge: Optional[float] = None
    cleaning_status: Optional[str] = None
    amenities: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class RoomAllocateRequest(BaseModel):
    booking_id: str
    room_ids: List[str] = Field(min_length=1)
    allocated_guests: Optional[int] = 2
    notes: Optional[str] = None


class RoomBlockRequest(BaseModel):
    room_id: str
    reason: str = Field(min_length=3, max_length=255)
    start_date: str
    end_date: str


def serialize_room(r: Room) -> Dict[str, Any]:
    return {
        "id": r.id,
        "room_number": r.room_number,
        "room_name": r.room_name,
        "accommodation_type": r.accommodation_type,
        "room_category": r.room_category,
        "capacity": r.capacity,
        "number_of_beds": r.number_of_beds,
        "is_ac": r.is_ac,
        "base_rate": float(r.base_rate),
        "extra_guest_charge": float(r.extra_guest_charge),
        "cleaning_status": r.cleaning_status,
        "amenities": r.amenities,
        "notes": r.notes,
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# ==============================================================================
# ENDPOINTS
# ==============================================================================

@router.get("")
def list_rooms(
    accommodation_type: Optional[str] = Query(default=None),
    cleaning_status: Optional[str] = Query(default=None),
    is_ac: Optional[bool] = Query(default=None),
    active_only: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:read")),
) -> Dict[str, Any]:
    q = db.query(Room)
    if active_only:
        q = q.filter(Room.is_active == True)
    if accommodation_type and accommodation_type != "ALL":
        q = q.filter(Room.accommodation_type == accommodation_type)
    if cleaning_status and cleaning_status != "ALL":
        q = q.filter(Room.cleaning_status == cleaning_status)
    if is_ac is not None:
        q = q.filter(Room.is_ac == is_ac)

    rooms = q.order_by(Room.room_number.asc()).all()
    return {"items": [serialize_room(r) for r in rooms], "total": len(rooms)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_room(
    payload: RoomCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    num = clean_str(payload.room_number)
    existing = db.query(Room).filter(Room.room_number == num).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Room with number '{num}' already exists.")

    room = Room(
        room_number=num,
        room_name=clean_str(payload.room_name),
        accommodation_type=payload.accommodation_type,
        room_category=payload.room_category,
        capacity=payload.capacity,
        number_of_beds=payload.number_of_beds,
        is_ac=payload.is_ac,
        base_rate=Decimal(str(payload.base_rate)),
        extra_guest_charge=Decimal(str(payload.extra_guest_charge)),
        cleaning_status=payload.cleaning_status,
        amenities=clean_str(payload.amenities),
        notes=clean_str(payload.notes),
        is_active=payload.is_active,
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    log_activity(
        action="ROOM_CREATED",
        module="rooms",
        record_id=room.room_number,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"room_name": room.room_name},
    )

    return {"room": serialize_room(room), "message": "Room created successfully."}


@router.put("/{room_id}")
def update_room(
    room_id: str,
    payload: RoomUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    if payload.room_number is not None:
        new_num = clean_str(payload.room_number)
        dup = db.query(Room).filter(Room.room_number == new_num, Room.id != room.id).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Room number '{new_num}' is already in use.")
        room.room_number = new_num

    if payload.room_name is not None:
        room.room_name = clean_str(payload.room_name)
    if payload.accommodation_type is not None:
        room.accommodation_type = payload.accommodation_type
    if payload.room_category is not None:
        room.room_category = payload.room_category
    if payload.capacity is not None:
        room.capacity = payload.capacity
    if payload.number_of_beds is not None:
        room.number_of_beds = payload.number_of_beds
    if payload.is_ac is not None:
        room.is_ac = payload.is_ac
    if payload.base_rate is not None:
        room.base_rate = Decimal(str(payload.base_rate))
    if payload.extra_guest_charge is not None:
        room.extra_guest_charge = Decimal(str(payload.extra_guest_charge))
    if payload.cleaning_status is not None:
        room.cleaning_status = payload.cleaning_status
    if payload.amenities is not None:
        room.amenities = clean_str(payload.amenities)
    if payload.notes is not None:
        room.notes = clean_str(payload.notes)
    if payload.is_active is not None:
        room.is_active = payload.is_active

    db.commit()
    db.refresh(room)

    return {"room": serialize_room(room), "message": "Room updated successfully."}


@router.get("/availability")
def check_room_availability(
    check_in_date: Optional[str] = Query(default=None),
    check_out_date: Optional[str] = Query(default=None),
    check_in: Optional[str] = Query(default=None),
    check_out: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:read")),
) -> Dict[str, Any]:
    effective_check_in = check_in_date or check_in
    effective_check_out = check_out_date or check_out
    if not effective_check_in or not effective_check_out:
        raise HTTPException(status_code=400, detail="Both check-in and check-out dates are required.")

    d_in, d_out = validate_stay_dates(effective_check_in, effective_check_out)

    # 1. Fetch all active rooms
    all_rooms = db.query(Room).filter(Room.is_active == True).all()

    # 2. Find overlapping allocations: (start <= d_out AND end >= d_in)
    overlapping_allocations = (
        db.query(RoomAllocation)
        .filter(
            RoomAllocation.allocation_status.in_(["Allocated", "Checked In"]),
            RoomAllocation.check_in_date < d_out,
            RoomAllocation.check_out_date > d_in,
        )
        .all()
    )
    allocated_room_ids = {a.room_id for a in overlapping_allocations}

    # 3. Find overlapping blocks
    overlapping_blocks = (
        db.query(RoomBlock)
        .filter(RoomBlock.start_date < d_out, RoomBlock.end_date > d_in)
        .all()
    )
    blocked_room_ids = {b.room_id for b in overlapping_blocks}

    unavailable_ids = allocated_room_ids | blocked_room_ids

    available = [serialize_room(r) for r in all_rooms if r.id not in unavailable_ids]
    occupied = [serialize_room(r) for r in all_rooms if r.id in unavailable_ids]

    # Detailed status list for Calendar / Visual Grid
    rooms_status = []
    for r in all_rooms:
        if r.id in blocked_room_ids:
            st = "MAINTENANCE_BLOCKED"
        elif r.id in allocated_room_ids:
            st = "OCCUPIED"
        else:
            st = "AVAILABLE"
        rooms_status.append({
            "room_id": r.id,
            "room_number": r.room_number,
            "room_name": r.room_name,
            "accommodation_type": r.accommodation_type,
            "room_category": r.room_category,
            "capacity": r.capacity,
            "base_rate": float(r.base_rate),
            "status": st,
            "cleaning_status": r.cleaning_status,
        })

    return {
        "check_in_date": d_in.isoformat(),
        "check_out_date": d_out.isoformat(),
        "total_rooms": len(all_rooms),
        "available_count": len(available),
        "occupied_count": len(occupied),
        "available_rooms": available,
        "occupied_rooms": occupied,
        "rooms": rooms_status,
    }


@router.post("/allocate")
def allocate_rooms_to_booking(
    payload: RoomAllocateRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    # Verify no requested room is already allocated or blocked for overlapping dates
    for r_id in payload.room_ids:
        conflict_alloc = (
            db.query(RoomAllocation)
            .join(Booking, RoomAllocation.booking_id == Booking.id)
            .filter(
                RoomAllocation.room_id == r_id,
                RoomAllocation.booking_id != booking.id,
                Booking.booking_status.notin_(["Cancelled", "Checked Out"]),
                RoomAllocation.check_in_date < booking.check_out_date,
                RoomAllocation.check_out_date > booking.check_in_date,
            )
            .first()
        )
        if conflict_alloc:
            room_obj = db.query(Room).filter(Room.id == r_id).first()
            r_label = room_obj.room_number if room_obj else r_id
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Room {r_label} is already allocated to another booking for these dates.",
            )
        conflict_block = (
            db.query(RoomBlock)
            .filter(
                RoomBlock.room_id == r_id,
                RoomBlock.start_date < booking.check_out_date,
                RoomBlock.end_date > booking.check_in_date,
            )
            .first()
        )
        if conflict_block:
            room_obj = db.query(Room).filter(Room.id == r_id).first()
            r_label = room_obj.room_number if room_obj else r_id
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Room {r_label} is blocked for maintenance during these dates.",
            )

    # Remove existing allocations for this booking if any
    db.query(RoomAllocation).filter(RoomAllocation.booking_id == booking.id).delete()

    created_allocations = []
    for r_id in payload.room_ids:
        room = db.query(Room).filter(Room.id == r_id, Room.is_active == True).first()
        if not room:
            continue
        alloc = RoomAllocation(
            booking_id=booking.id,
            room_id=room.id,
            check_in_date=booking.check_in_date,
            check_out_date=booking.check_out_date,
            allocated_guests=payload.allocated_guests or 2,
            notes=clean_str(payload.notes),
        )
        db.add(alloc)
        created_allocations.append({"room_number": room.room_number, "room_name": room.room_name})

    db.commit()

    log_activity(
        action="ROOMS_ALLOCATED",
        module="rooms",
        record_id=booking.booking_reference,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"rooms": [c["room_number"] for c in created_allocations]},
    )

    return {
        "success": True,
        "booking_reference": booking.booking_reference,
        "allocated_rooms": created_allocations,
        "message": f"Allocated {len(created_allocations)} rooms to booking.",
    }


@router.post("/blocks")
def create_room_block(
    payload: RoomBlockRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("bookings:write")),
) -> Dict[str, Any]:
    d_in, d_out = validate_stay_dates(payload.start_date, payload.end_date)
    room = db.query(Room).filter(Room.id == payload.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    block = RoomBlock(
        room_id=room.id,
        reason=clean_str(payload.reason),
        start_date=d_in,
        end_date=d_out,
        blocked_by=current_user.get("full_name") or current_user.get("username"),
    )
    db.add(block)
    if d_in <= ist_now().date() <= d_out:
        room.cleaning_status = "Under Maintenance"
    db.commit()

    return {"success": True, "message": f"Room '{room.room_number}' blocked for maintenance."}
