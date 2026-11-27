from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, EmailStr, Field

class VehicleItemInput(BaseModel):
    vehicle_type: str = Field(default="Car", description="Car, SUV, Bike, Tempo Traveller, Bus, Other")
    registration_number: str = Field(..., min_length=2, max_length=30)
    notes: Optional[str] = None

class PublicEnquirySubmit(BaseModel):
    # Customer Information
    full_name: str = Field(..., min_length=2, max_length=100)
    mobile: str = Field(..., min_length=10, max_length=20)
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = "Maharashtra"
    pin_code: Optional[str] = None
    company_name: Optional[str] = None
    gstin: Optional[str] = None

    # Stay Details
    check_in_date: str = Field(..., description="YYYY-MM-DD")
    check_in_time: Optional[str] = "12:00 PM"
    check_out_date: str = Field(..., description="YYYY-MM-DD")
    check_out_time: Optional[str] = "11:00 AM"
    package_id: Optional[str] = None

    # Guests
    adults: int = Field(default=2, ge=1)
    children: int = Field(default=0, ge=0)
    infants: int = Field(default=0, ge=0)
    number_of_rooms: int = Field(default=1, ge=1)
    dormitory_guests: int = Field(default=0, ge=0)

    # Vehicles
    vehicle_count: int = Field(default=0, ge=0)
    vehicles: List[VehicleItemInput] = Field(default_factory=list)

    # Occasion & Requirements
    occasion: Optional[str] = None
    food_preferences: Optional[str] = None
    special_requirements: Optional[str] = None

    # Anti-Spam Honeypot field (must be empty from genuine users)
    website_url_hp: Optional[str] = None

class EnquiryReviewRequest(BaseModel):
    status: str = Field(..., description="APPROVED, REJECTED, MORE_INFO_REQUESTED")
    remarks: Optional[str] = None

