from __future__ import annotations

import re
from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException, status

MOBILE_RE = re.compile(r"^[+]?[0-9\s\-]{7,15}$")
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
PIN_RE = re.compile(r"^[0-9]{6}$")


def clean_str(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", val).strip()
    return cleaned if cleaned else None


def normalize_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[-10:]
    return digits


def validate_mobile(phone: str, field_name: str = "Mobile number") -> str:
    cleaned = clean_str(phone) or ""
    if not MOBILE_RE.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid {field_name}. Please enter 7–15 digits.",
        )
    return cleaned


def validate_gstin(gstin: Optional[str]) -> Optional[str]:
    cleaned = clean_str(gstin)
    if not cleaned:
        return None
    upper = cleaned.upper()
    if not GSTIN_RE.match(upper):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid GSTIN format (expected 15-character Indian GSTIN).",
        )
    return upper


def validate_pin(pin: Optional[str]) -> Optional[str]:
    cleaned = clean_str(pin)
    if not cleaned:
        return None
    if not PIN_RE.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid PIN code (expected 6 digits).",
        )
    return cleaned


def parse_iso_date(date_str: str, field_name: str = "Date") -> date:
    try:
        return datetime.strptime(date_str[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid {field_name} format. Expected YYYY-MM-DD.",
        ) from exc


def validate_stay_dates(check_in: str, check_out: str) -> tuple[date, date]:
    d_in = parse_iso_date(check_in, "Check-in date")
    d_out = parse_iso_date(check_out, "Check-out date")
    if d_out < d_in:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Check-out date cannot be earlier than check-in date.",
        )
    return d_in, d_out

