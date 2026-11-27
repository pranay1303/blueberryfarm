from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.authentication.security import require_owner, require_permission
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import Package
from app.schemas.requests import PackageCreate, PackageQuoteRequest, PackageUpdate
from app.services.calculations import calculate_package_quote
from app.validations.validators import clean_str, validate_stay_dates

router = APIRouter(prefix="/api/packages", tags=["Packages"])


def serialize_package(p: Package) -> Dict[str, Any]:
    return {
        "id": p.id,
        "package_id": p.package_code,
        "package_code": p.package_code,
        "name": p.name,
        "description": p.description,
        "category": p.category,
        "weekday_rate": float(p.weekday_rate),
        "weekend_rate": float(p.weekend_rate),
        "adult_price": float(p.adult_price),
        "child_price": float(p.child_price),
        "infant_price": float(p.infant_price),
        "included_meals": p.included_meals,
        "room_inclusion": p.room_inclusion,
        "activities": p.activities,
        "check_in_policy": p.check_in_policy,
        "check_out_policy": p.check_out_policy,
        "additional_inclusions": p.additional_inclusions,
        "exclusions": p.exclusions,
        "is_active": p.is_active,
        "is_public": p.is_public,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
def list_packages(
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("packages:read")),
) -> Dict[str, Any]:
    q = db.query(Package)
    if active_only:
        q = q.filter(Package.is_active == True)
    pkgs = q.order_by(Package.created_at.asc()).all()
    return {"items": [serialize_package(p) for p in pkgs], "total": len(pkgs)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_package(
    payload: PackageCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    count = db.query(Package).count() + 1
    code = f"PKG-{count:03d}"
    pkg = Package(
        package_code=code,
        name=clean_str(payload.name) or "",
        description=clean_str(payload.description) or "",
        category=payload.category,
        weekday_rate=Decimal(str(payload.weekday_rate)),
        weekend_rate=Decimal(str(payload.weekend_rate)),
        adult_price=Decimal(str(payload.adult_price)),
        child_price=Decimal(str(payload.child_price)),
        infant_price=Decimal(str(payload.infant_price)),
        included_meals=payload.included_meals,
        room_inclusion=payload.room_inclusion,
        activities=payload.activities,
        check_in_policy=payload.check_in_policy,
        check_out_policy=payload.check_out_policy,
        additional_inclusions=clean_str(payload.additional_inclusions),
        exclusions=clean_str(payload.exclusions),
        is_active=payload.is_active,
        is_public=True,
    )
    db.add(pkg)
    db.commit()

    log_activity(
        action="package_created",
        module="packages",
        record_id=pkg.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"package_id": pkg.package_code, "name": pkg.name},
    )

    return {"package": serialize_package(pkg)}


@router.put("/{package_id}")
def update_package(
    package_id: str,
    payload: PackageUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_owner),
) -> Dict[str, Any]:
    pkg = db.query(Package).filter((Package.id == package_id) | (Package.package_code == package_id)).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found.")

    if payload.name is not None:
        pkg.name = clean_str(payload.name) or pkg.name
    if payload.description is not None:
        pkg.description = clean_str(payload.description)
    if payload.category is not None:
        pkg.category = payload.category
    if payload.weekday_rate is not None:
        pkg.weekday_rate = Decimal(str(payload.weekday_rate))
    if payload.weekend_rate is not None:
        pkg.weekend_rate = Decimal(str(payload.weekend_rate))
    if payload.adult_price is not None:
        pkg.adult_price = Decimal(str(payload.adult_price))
    if payload.child_price is not None:
        pkg.child_price = Decimal(str(payload.child_price))
    if payload.infant_price is not None:
        pkg.infant_price = Decimal(str(payload.infant_price))
    if payload.included_meals is not None:
        pkg.included_meals = payload.included_meals
    if payload.room_inclusion is not None:
        pkg.room_inclusion = payload.room_inclusion
    if payload.activities is not None:
        pkg.activities = payload.activities
    if payload.check_in_policy is not None:
        pkg.check_in_policy = payload.check_in_policy
    if payload.check_out_policy is not None:
        pkg.check_out_policy = payload.check_out_policy
    if payload.additional_inclusions is not None:
        pkg.additional_inclusions = clean_str(payload.additional_inclusions)
    if payload.exclusions is not None:
        pkg.exclusions = clean_str(payload.exclusions)
    if payload.is_active is not None:
        pkg.is_active = payload.is_active

    pkg.updated_at = ist_now()
    db.commit()

    log_activity(
        action="package_updated",
        module="packages",
        record_id=pkg.id,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"package_id": pkg.package_code},
    )

    return {"package": serialize_package(pkg)}


@router.post("/quote")
@router.post("/calculate")
def calculate_quote(
    payload: PackageQuoteRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("packages:read")),
) -> Dict[str, Any]:
    validate_stay_dates(payload.check_in_date, payload.check_out_date)
    pkg = db.query(Package).filter((Package.id == payload.package_id) | (Package.package_code == payload.package_id)).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Selected package does not exist.")

    pkg_dict = serialize_package(pkg)
    quote = calculate_package_quote(
        package=pkg_dict,
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
        adults=payload.adults,
        children=payload.children,
        infants=payload.infants,
    )
    return {"package": pkg_dict, "quote": quote}
