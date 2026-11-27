from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.authentication.security import require_permission
from app.core.config import ist_now
from app.database.session import get_db
from app.logging.audit_logger import log_activity
from app.models.sql_models import WebsiteContent
from app.validations.validators import clean_str

logger = logging.getLogger("blueberry.cms")
router = APIRouter(prefix="/api/cms", tags=["Website Content Management (CMS)"])


class SectionContentUpdate(BaseModel):
    title: str
    content_json: Dict[str, Any]
    is_published: bool = True


DEFAULT_SECTIONS = {
    "hero_banner": {
        "title": "Escape to Nature, Pool & Authentic Farm Stay at Blueberry Farm & Resort",
        "tagline": "A serene agro-tourism haven nestled in Karjat's lush greenery just 90 mins from Mumbai & Pune",
        "badge": "Agri-Tourism Destination in Mandawane, Karjat",
        "primary_button_text": "Book Your Stay Enquiry",
        "secondary_button_text": "Explore Packages & Rates",
        "stats": [
            {"label": "Full Stay Experience", "value": "24-Hour"},
            {"label": "Meals & Snacks Included", "value": "4 Unlimited"},
            {"label": "Swimming Pool & Rain Dance", "value": "Large Pool"},
            {"label": "Safe Onsite Parking", "value": "Free Parking"},
        ],
    },
    "facilities": {
        "title": "Resort Facilities & Amenities",
        "description": "Designed for complete rest, family bonding, and fun agro-tourism experiences.",
        "items": [
            {"title": "Filtered Swimming Pool", "desc": "Clean, hygienic adult pool with shallow kids splash zone"},
            {"title": "Rain Dance System", "desc": "Overhead rain showers with high-bass outdoor party speakers"},
            {"title": "Air-Conditioned Cottages", "desc": "Cozy rooms with attached western bathrooms & 24/7 water"},
            {"title": "Open Dining Pavilion", "desc": "Covered outdoor seating serving fresh homemade meals"},
            {"title": "Lush Agro-Farm Grounds", "desc": "Coconut palms, plantation walks, and open cricket lawn"},
            {"title": "Secured Gated Parking", "desc": "Ample parking with security gate log for all vehicles"},
        ],
    },
    "dining": {
        "title": "Authentic Maharashtrian Dining Experience",
        "description": "Unlimited 4-meal plan with local farm provisions, pure spices, and chicken delicacies.",
        "meals": [
            {"time": "1:30 PM – 3:30 PM", "title": "Welcome Lunch", "menu": "Chicken Curry / Sukka, Paneer Bhaji, Dal Tadka, Steamed Rice, Chapati/Bhakri, Salad"},
            {"time": "5:00 PM – 6:30 PM", "title": "Evening Hi-Tea", "menu": "Hot Masala Tea / Coffee with crispy Onion Pakoda (Kanda Bhaji) or Batata Vada"},
            {"time": "8:30 PM – 10:30 PM", "title": "Grand Dinner", "menu": "Rich Village Chicken Gravy or Veg Kadhai, Jeera Rice, Gulab Jamun, and accompaniments"},
            {"time": "8:30 AM – 10:00 AM", "title": "Morning Breakfast", "menu": "Spicy Karjat Misal Pav, soft Kanda Poha, Boiled Eggs / Omelette, and piping hot tea"},
        ],
    },
    "faqs": {
        "title": "Frequently Asked Questions",
        "items": [
            {"q": "What are the check-in and check-out timings?", "a": "For 24-Hour Stay, check-in is 12:00 PM and check-out is 10:00 AM the next day. For One-Day Outings, timings are 9:00 AM to 6:00 PM."},
            {"q": "Is food included in the package?", "a": "Yes! All packages include unlimited home-style buffet meals (Lunch, Evening Hi-Tea, Dinner, and Breakfast for 24-hr stays)."},
            {"q": "Are unmarried couples or bachelor groups allowed?", "a": "Yes, all respectful family, friends, and couple groups with valid Government Photo ID are warmly welcome."},
            {"q": "Is swimming pool costume compulsory?", "a": "Yes, proper nylon or polyester swimwear is mandatory for pool hygiene and water safety."},
            {"q": "How can I confirm my reservation?", "a": "Submit a booking enquiry online. Our resort manager will review room availability and contact you on WhatsApp/Phone. A 50% advance secures your stay."},
        ],
    },
    "testimonials": {
        "title": "What Guests Say About Blueberry Resort",
        "items": [
            {"guest": "Rohit Deshmukh", "city": "Thane", "comment": "Amazing food! The authentic chicken curry and bhakri tasted like village homemade food. Kids enjoyed the clean pool."},
            {"guest": "Sneha Patil", "city": "Pune", "comment": "Peaceful farm stay. Mandawane is very scenic and calm. Pranit was very accommodating for our senior citizen parents."},
            {"guest": "Amit Joshi", "city": "Navi Mumbai", "comment": "Celebrated my son's 5th birthday here. Great rain dance, wide lawns for cricket, and excellent hospitality."},
        ],
    },
    "seo": {
        "title": "Blueberry Farm & Resort Karjat | Pure Nature Stay & Agri-Tourism",
        "description": "Best farm stay & resort in Karjat with swimming pool, rain dance, and unlimited Maharashtrian meals. Located at Mandawane, Karjat.",
        "keywords": "Karjat resort, farm stay Karjat, Mandawane resort, swimming pool resort Karjat, one day picnic Karjat",
    },
}


@router.get("/content/{section_key}")
def get_section_content(section_key: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    sec = db.query(WebsiteContent).filter(WebsiteContent.section_key == section_key).first()
    if sec and sec.is_published:
        return {"section_key": sec.section_key, "title": sec.title, "content": sec.content_json}

    # Return default fallback
    def_content = DEFAULT_SECTIONS.get(section_key)
    if def_content:
        return {
            "section_key": section_key,
            "title": def_content.get("title", section_key.replace("_", " ").title()),
            "content": def_content,
        }

    raise HTTPException(status_code=404, detail="Section content not found.")


@router.get("/content")
def get_all_sections(db: Session = Depends(get_db)) -> Dict[str, Any]:
    sections = db.query(WebsiteContent).all()
    res = {}
    for s in sections:
        res[s.section_key] = {"title": s.title, "content": s.content_json, "is_published": s.is_published}

    # Fill in defaults if not customized
    for k, v in DEFAULT_SECTIONS.items():
        if k not in res:
            res[k] = {"title": v.get("title", k), "content": v, "is_published": True}

    return {"sections": res}


@router.put("/content/{section_key}")
def update_section_content(
    section_key: str,
    payload: SectionContentUpdate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_permission("settings:manage")),
) -> Dict[str, Any]:
    sec = db.query(WebsiteContent).filter(WebsiteContent.section_key == section_key).first()
    if not sec:
        sec = WebsiteContent(
            section_key=section_key,
            title=clean_str(payload.title),
            content_json=payload.content_json,
            is_published=payload.is_published,
        )
        db.add(sec)
    else:
        sec.title = clean_str(payload.title)
        sec.content_json = payload.content_json
        sec.is_published = payload.is_published
        sec.updated_at = ist_now()

    db.commit()

    log_activity(
        action="CMS_SECTION_UPDATED",
        module="website",
        record_id=section_key,
        user_id=current_user["id"],
        username=current_user["username"],
        metadata={"title": sec.title},
    )

    return {"success": True, "section_key": section_key, "message": "Website section updated successfully."}

