from __future__ import annotations

import io
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image as RLImage,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.core.config import settings

# Brand Colors matching Plus91Design.pdf
COLOR_ROYAL_BLUE = colors.HexColor("#004AAC")
COLOR_HEADING_BLUE = colors.HexColor("#004AAD")
COLOR_ACCENT_BLUE = colors.HexColor("#2578E7")
COLOR_LIGHT_BLUE_BG = colors.HexColor("#CCD5FF")
COLOR_CREAM_LOGO_BG = colors.HexColor("#F2EFEA")
COLOR_DARK_TEXT = colors.HexColor("#111111")
COLOR_MUTED_TEXT = colors.HexColor("#4B5563")
COLOR_WHITE = colors.white
COLOR_BLACK = colors.black

DEFAULT_RESORT_SETTINGS: Dict[str, Any] = {
    "business_name": "Blueberry Farm and Resort",
    "business_tagline": "A Pure Nature Farm Stay & Agri-Tourism Destination",
    "contact": {
        "address": "At. Post - Mandawane, Tal - Karjat, Dist - Raigad, Maharashtra - 410201",
        "phone": "+91 86694 08484",
        "email": "blueberrykarjat@gmail.com",
        "website": "www.blueberryresort.com",
    },
    "tax_gst": {
        "enabled": False,
        "gstin": "",
        "cgst_rate": 6.0,
        "sgst_rate": 6.0,
    },
    "payment_info": {
        "bank_name": "State Bank of India",
        "account_name": "Pranit Dabhade",
        "account_number": "---------------------",
        "ifsc": "SBIN0000000",
        "branch": "Karjat",
        "gpay_number": "8669408484",
        "upi_id": "8669408484@upi",
    },
    "documents": {
        "signature_image_path": "",
        "signature_title": "Authorized Signatory",
        "default_terms": "1. Check-in: 12:00 PM | Check-out: 10:00 AM\n2. 50% advance payment required for confirmation.\n3. Balance amount payable at check-in.\n4. Swimming pool rules: Proper nylon/polyester swimwear mandatory.\n5. Blueberry Farm and Resort reserves right of admission.",
    },
}


def format_inr(amount: float | int | None) -> str:
    """Format number in Indian numbering style with Rs. prefix (safe in Helvetica PDF)."""
    val = round(float(amount or 0.0), 2)
    negative = val < 0
    val = abs(val)
    whole = int(val)
    frac = round((val - whole) * 100)
    if frac == 100:
        whole += 1
        frac = 0

    s = str(whole)
    if len(s) > 3:
        last3 = s[-3:]
        rest = s[:-3]
        groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        formatted_whole = ",".join(groups) + "," + last3
    else:
        formatted_whole = s

    sign = "-" if negative else ""
    if frac > 0:
        return f"{sign}Rs. {formatted_whole}.{frac:02d}"
    return f"{sign}Rs. {formatted_whole}"


def format_pdf_date(date_str: Optional[str], style: str = "dmy") -> str:
    if not date_str:
        return "-"
    try:
        dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
        if style == "mdy":
            return dt.strftime("%b %d, %Y")
        return dt.strftime("%d %b %Y")
    except ValueError:
        return str(date_str)


def format_qty(qty: float) -> str:
    q = float(qty or 0)
    if abs(q - round(q)) < 1e-6:
        return str(int(round(q)))
    return f"{q:.2f}".rstrip("0").rstrip(".")


def _logo_path() -> Optional[Path]:
    for name in ("blueberry_logo_circle.png", "blueberry_logo_square.png", "blueberry_logo.png"):
        p = settings.PDF_ASSETS_DIR / name
        if p.exists():
            return p
    return None


def _draw_footer_icons(c: canvas.Canvas, cx: float, cy: float, kind: str) -> None:
    """Draw clean white circular badge with blue icon at (cx, cy)."""
    r = 5.5
    c.saveState()
    c.setFillColor(COLOR_WHITE)
    c.circle(cx, cy, r, stroke=0, fill=1)
    c.setStrokeColor(COLOR_ROYAL_BLUE)
    c.setFillColor(COLOR_ROYAL_BLUE)
    c.setLineWidth(0.9)
    if kind == "phone":
        # Simple handset curve
        p = c.beginPath()
        p.moveTo(cx - 2.2, cy + 2.2)
        p.lineTo(cx - 1.0, cy + 2.2)
        p.lineTo(cx - 0.8, cy + 0.8)
        p.lineTo(cx - 1.5, cy + 0.3)
        p.lineTo(cx + 0.3, cy - 1.5)
        p.lineTo(cx + 0.8, cy - 0.8)
        p.lineTo(cx + 2.2, cy - 1.0)
        p.lineTo(cx + 2.2, cy - 2.2)
        p.lineTo(cx + 1.0, cy - 2.4)
        p.lineTo(cx - 2.4, cy + 1.0)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
    elif kind == "globe":
        c.circle(cx, cy, 3.2, stroke=1, fill=0)
        c.ellipse(cx - 1.5, cy - 3.2, cx + 1.5, cy + 3.2, stroke=1, fill=0)
        c.line(cx - 3.1, cy, cx + 3.1, cy)
    elif kind == "mail":
        c.rect(cx - 3.0, cy - 2.0, 6.0, 4.0, stroke=1, fill=0)
        c.line(cx - 3.0, cy + 2.0, cx, cy - 0.2)
        c.line(cx + 3.0, cy + 2.0, cx, cy - 0.2)
    c.restoreState()


class BlueberryNumberedCanvas(canvas.Canvas):
    def __init__(self, *args: Any, resort_settings: Dict[str, Any], header_meta: Dict[str, Any], **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._saved_page_states: List[Dict[str, Any]] = []
        self._resort_settings = resort_settings
        self._header_meta = header_meta

    def showPage(self) -> None:
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_chrome(total_pages)
            super().showPage()
        super().save()

    def _draw_chrome(self, total_pages: int) -> None:
        page_w, page_h = A4
        page_num = self._pageNumber
        s = self._resort_settings
        m = self._header_meta

        self.saveState()

        if page_num == 1:
            # Full branded header matching Plus91Design.pdf
            header_h = 152.0
            stripe_h = 12.0
            header_y = page_h - header_h
            split_x = 186.0

            # Left cream block for logo
            self.setFillColor(COLOR_CREAM_LOGO_BG)
            self.rect(0, header_y, split_x, header_h, stroke=0, fill=1)

            # Logo image inside left block
            logo = _logo_path()
            if logo:
                logo_size = 136.0
                lx = (split_x - logo_size) / 2.0
                ly = header_y + (header_h - logo_size) / 2.0
                self.drawImage(str(logo), lx, ly, width=logo_size, height=logo_size, preserveAspectRatio=True, mask="auto")

            # Right royal blue block
            self.setFillColor(COLOR_ROYAL_BLUE)
            self.rect(split_x, header_y, page_w - split_x, header_h, stroke=0, fill=1)

            # Bright blue accent stripe under header
            self.setFillColor(COLOR_ACCENT_BLUE)
            self.rect(0, header_y - stripe_h, page_w, stripe_h, stroke=0, fill=1)

            # Business Name & Address
            self.setFillColor(COLOR_WHITE)
            right_center_x = split_x + (page_w - split_x) / 2.0
            bname = s.get("business_name", "Blueberry Farm and Resort")
            self.setFont("Helvetica-Bold", 21)
            self.drawCentredString(right_center_x, page_h - 34, bname)

            addr_line = s.get("address_line", "At. Post - Mandawane, Tal - Karjat, Dist - Raigad")
            self.setFont("Helvetica", 9.5)
            self.drawCentredString(right_center_x, page_h - 49, addr_line)

            # Document Title (auto-fit font size)
            doc_title = str(m.get("doc_title", "INVOICE")).upper()
            title_font_size = 24
            if len(doc_title) > 14:
                title_font_size = 18
            elif len(doc_title) > 11:
                title_font_size = 20
            self.setFont("Helvetica-Bold", title_font_size)
            self.drawString(split_x + 12, header_y + 34, doc_title)

            # Document Number & Date on right side of blue header
            self.setFont("Helvetica", 10.5)
            right_margin_x = page_w - 24
            num_label = m.get("number_label", "Invoice No:")
            num_val = m.get("number_value", "")
            date_label = m.get("date_label", "Invoice Date:")
            date_val = m.get("date_value", "")
            self.drawRightString(right_margin_x, header_y + 48, f"{num_label}  {num_val}")
            self.drawRightString(right_margin_x, header_y + 31, f"{date_label} {date_val}")
            if m.get("extra_header_line"):
                self.setFont("Helvetica", 9)
                self.drawRightString(right_margin_x, header_y + 15, m["extra_header_line"])
        else:
            # Continuation pages: compact royal blue top bar
            bar_h = 34.0
            self.setFillColor(COLOR_ROYAL_BLUE)
            self.rect(0, page_h - bar_h, page_w, bar_h, stroke=0, fill=1)
            self.setFillColor(COLOR_ACCENT_BLUE)
            self.rect(0, page_h - bar_h - 4, page_w, 4, stroke=0, fill=1)
            self.setFillColor(COLOR_WHITE)
            self.setFont("Helvetica-Bold", 11)
            self.drawString(42, page_h - 22, s.get("business_name", "Blueberry Farm and Resort"))
            self.setFont("Helvetica", 9.5)
            self.drawRightString(
                page_w - 42,
                page_h - 22,
                f"{m.get('doc_title', 'DOCUMENT')} | {m.get('number_value', '')}",
            )

        # Footer Bar (every page)
        footer_y = 30.0
        footer_h = 24.0
        self.setFillColor(COLOR_ROYAL_BLUE)
        self.rect(0, footer_y, page_w, footer_h, stroke=0, fill=1)

        phone = s.get("phone", "8669408484")
        website = s.get("website", "blueberryfarmandresort.com")
        email = s.get("email", "blueberrryfarmandresort.gmail.com")

        cy = footer_y + footer_h / 2.0
        self.setFillColor(COLOR_WHITE)
        self.setFont("Helvetica", 9)

        _draw_footer_icons(self, 52, cy, "phone")
        self.drawString(63, cy - 3, phone)

        _draw_footer_icons(self, 185, cy, "globe")
        self.drawString(196, cy - 3, website)

        _draw_footer_icons(self, 375, cy, "mail")
        self.drawString(386, cy - 3, email)

        # Page numbering below footer
        self.setFillColor(COLOR_MUTED_TEXT)
        self.setFont("Helvetica", 8)
        self.drawRightString(page_w - 36, 14, f"Page {page_num} of {total_pages}")

        self.restoreState()


def _build_styles() -> Dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "heading_blue": ParagraphStyle(
            "heading_blue",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=COLOR_HEADING_BLUE,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=13.5,
            textColor=COLOR_DARK_TEXT,
        ),
        "body_bold": ParagraphStyle(
            "body_bold",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13.5,
            textColor=COLOR_DARK_TEXT,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.8,
            leading=11.5,
            textColor=COLOR_DARK_TEXT,
        ),
        "small_muted": ParagraphStyle(
            "small_muted",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=COLOR_MUTED_TEXT,
        ),
        "item_desc": ParagraphStyle(
            "item_desc",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.8,
            leading=13,
            alignment=TA_CENTER,
            textColor=COLOR_DARK_TEXT,
        ),
        "tbl_hdr": ParagraphStyle(
            "tbl_hdr",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            alignment=TA_CENTER,
            textColor=COLOR_HEADING_BLUE,
        ),
        "total_box_lbl": ParagraphStyle(
            "total_box_lbl",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.8,
            leading=12,
            textColor=COLOR_HEADING_BLUE,
        ),
        "total_box_val": ParagraphStyle(
            "total_box_val",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=12,
            alignment=TA_RIGHT,
            textColor=COLOR_BLACK,
        ),
    }


def _render_pdf(
    story: List[Any],
    resort_settings: Dict[str, Any],
    header_meta: Dict[str, Any],
    output_path: Optional[Path] = None,
) -> bytes:
    buf = io.BytesIO()
    page_w, page_h = A4
    margin_x = 42.0

    # Frame for page 1 leaves room for 164pt header + 16pt gap
    frame_p1 = Frame(
        margin_x,
        66.0,
        page_w - 2 * margin_x,
        page_h - 178.0 - 66.0,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
        id="p1_frame",
    )
    frame_later = Frame(
        margin_x,
        66.0,
        page_w - 2 * margin_x,
        page_h - 50.0 - 66.0,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
        id="later_frame",
    )

    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        title=f"{header_meta.get('doc_title', 'Document')} - {header_meta.get('number_value', '')}",
        author=resort_settings.get("business_name", "Blueberry Farm and Resort"),
    )

    def _on_page(canv: canvas.Canvas, _doc: BaseDocTemplate) -> None:
        if _doc.page >= 1 and _doc.page == 1:
            _doc.handle_nextPageTemplate("later")

    doc.addPageTemplates(
        [
            PageTemplate(id="first", frames=[frame_p1], onPage=_on_page),
            PageTemplate(id="later", frames=[frame_later]),
        ]
    )

    doc.build(
        story,
        canvasmaker=lambda *a, **kw: BlueberryNumberedCanvas(
            *a, resort_settings=resort_settings, header_meta=header_meta, **kw
        ),
    )

    pdf_bytes = buf.getvalue()
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(pdf_bytes)
    return pdf_bytes


def _resolve_signature_path(resort_settings: Optional[Dict[str, Any]] = None) -> Optional[Path]:
    docs_cfg = resort_settings.get("documents", {}) if isinstance(resort_settings, dict) else {}
    sig_rel = docs_cfg.get("signature_image_path", "")
    if sig_rel:
        candidate = (settings.STORAGE_DIR / sig_rel).resolve()
        if candidate.exists() and candidate.stat().st_size > 0:
            return candidate
        candidate2 = Path(sig_rel).resolve()
        if candidate2.exists() and candidate2.stat().st_size > 0:
            return candidate2

    # Robust fallback cascade for official resort signature
    candidates = [
        settings.PDF_ASSETS_DIR / "signature.png",
        settings.PDF_ASSETS_DIR / "signature_crop.png",
        settings.STORAGE_DIR / "attachments" / "signatures" / "authorized_signature.png",
        settings.BASE_DIR / "backend" / "app" / "pdf" / "assets" / "signature.png",
        settings.BASE_DIR / "extracted_assets" / "signature.png",
        settings.BASE_DIR / "extracted_assets" / "signature_crop.png",
    ]
    for p in candidates:
        try:
            if p.exists() and p.stat().st_size > 0:
                return p
        except Exception:
            continue
    return None


def _build_signature_and_payment_block(
    *,
    styles: Dict[str, ParagraphStyle],
    resort_settings: Dict[str, Any],
    payment_lines: List[tuple[str, str]],
) -> KeepTogether:
    docs_cfg = resort_settings.get("documents", {}) if isinstance(resort_settings, dict) else {}
    sig_path = _resolve_signature_path(resort_settings)
    sig_title = docs_cfg.get("signature_title") or "Authorized Signature"

    # Left: Payment Information
    left_rows: List[List[Any]] = [
        [Paragraph("<b>Payment information:</b>", styles["heading_blue"]), ""],
    ]
    for lbl, val in payment_lines:
        left_rows.append(
            [
                Paragraph(f"<font color='#004AAD'><b>{escape(lbl)}</b></font>", styles["small"]),
                Paragraph(escape(val or "-"), ParagraphStyle("pv", parent=styles["small"], alignment=TA_RIGHT)),
            ]
        )

    pay_tbl = Table(left_rows, colWidths=[110, 125])
    pay_tbl.setStyle(
        TableStyle(
            [
                ("SPAN", (0, 0), (1, 0)),
                ("LINEBELOW", (0, 0), (1, 0), 0.75, COLOR_BLACK),
                ("LINEBELOW", (0, -1), (1, -1), 0.75, COLOR_BLACK),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (1, 0), 5),
                ("TOPPADDING", (0, 1), (1, 1), 6),
                ("BOTTOMPADDING", (0, -1), (1, -1), 7),
            ]
        )
    )

    # Right: Authorized Signature
    if sig_path:
        try:
            sig_cell: Any = RLImage(str(sig_path), width=125, height=44, kind="proportional")
        except Exception:
            sig_cell = Spacer(1, 38)
    else:
        sig_cell = Spacer(1, 38)

    sig_tbl = Table(
        [
            [sig_cell],
            [Paragraph(escape(sig_title), ParagraphStyle("sig", parent=styles["small"], alignment=TA_CENTER))],
        ],
        colWidths=[150],
    )
    sig_tbl.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (0, 0), "BOTTOM"),
                ("LINEBELOW", (0, 0), (0, 0), 0.8, COLOR_BLACK),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )

    outer = Table([[pay_tbl, "", sig_tbl]], colWidths=[235, 126, 150])
    outer.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return KeepTogether([Spacer(1, 18), outer])


def _build_items_table(items: List[Dict[str, Any]], styles: Dict[str, ParagraphStyle]) -> Table:
    rows: List[List[Any]] = [
        [
            Paragraph("DESCRIPTION", styles["tbl_hdr"]),
            Paragraph("QTY", styles["tbl_hdr"]),
            Paragraph("RATE (PP)", styles["tbl_hdr"]),
            Paragraph("AMOUNT", styles["tbl_hdr"]),
        ]
    ]

    for item in items:
        desc_parts = [f"<b>{escape(str(item.get('description', '')))}</b>"]
        inc = item.get("inclusion_text")
        if inc:
            desc_parts.append(f"<br/><br/>{escape(str(inc)).replace(chr(10), '<br/>')}")
        disc = float(item.get("discount", 0.0) or 0.0)
        if disc > 0:
            desc_parts.append(f"<br/><font size='8.5' color='#4B5563'>(Discount: {format_inr(disc)})</font>")

        rows.append(
            [
                Paragraph("".join(desc_parts), styles["item_desc"]),
                Paragraph(format_qty(item.get("quantity", 1)), styles["item_desc"]),
                Paragraph(format_inr(item.get("rate", 0)), styles["item_desc"]),
                Paragraph(format_inr(item.get("amount", 0)), styles["item_desc"]),
            ]
        )

    tbl = Table(rows, colWidths=[255, 58, 92, 106], repeatRows=1)
    tbl_style = [
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_LIGHT_BLUE_BG),
        ("BOX", (0, 0), (-1, -1), 0.8, COLOR_BLACK),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, COLOR_BLACK),
        ("LINEBEFORE", (1, 0), (1, -1), 0.8, COLOR_BLACK),
        ("LINEBEFORE", (2, 0), (2, -1), 0.8, COLOR_BLACK),
        ("LINEBEFORE", (3, 0), (3, -1), 0.8, COLOR_BLACK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for r_idx in range(1, len(rows) - 1):
        tbl_style.append(("LINEBELOW", (0, r_idx), (-1, r_idx), 0.5, colors.HexColor("#CBD5E1")))
    tbl.setStyle(TableStyle(tbl_style))
    return tbl


def _build_totals_section(
    *,
    styles: Dict[str, ParagraphStyle],
    summary_rows: List[tuple[str, str]],
    highlight_label: str,
    highlight_value: str,
) -> KeepTogether:
    # Right-aligned breakdown rows above light-blue highlight box
    elements: List[Any] = []
    if summary_rows:
        s_data = [
            [
                "",
                Paragraph(escape(lbl), styles["small"]),
                Paragraph(escape(val), ParagraphStyle("sv", parent=styles["small"], alignment=TA_RIGHT)),
            ]
            for lbl, val in summary_rows
        ]
        s_tbl = Table(s_data, colWidths=[275, 130, 106])
        s_tbl.setStyle(
            TableStyle(
                [
                    ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        elements.append(Spacer(1, 6))
        elements.append(s_tbl)

    # Highlighted box matching Plus91Design.pdf
    box_tbl = Table(
        [
            [
                "",
                Paragraph(escape(highlight_label), styles["total_box_lbl"]),
                Paragraph(escape(highlight_value), styles["total_box_val"]),
            ]
        ],
        colWidths=[275, 130, 106],
    )
    box_tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (1, 0), (2, 0), COLOR_LIGHT_BLUE_BG),
                ("BOX", (1, 0), (2, 0), 1.3, COLOR_BLACK),
                ("VALIGN", (1, 0), (2, 0), "MIDDLE"),
                ("TOPPADDING", (1, 0), (2, 0), 7),
                ("BOTTOMPADDING", (1, 0), (2, 0), 7),
                ("LEFTPADDING", (1, 0), (1, 0), 10),
                ("RIGHTPADDING", (2, 0), (2, 0), 8),
            ]
        )
    )
    elements.append(Spacer(1, 6))
    elements.append(box_tbl)
    return KeepTogether(elements)


def generate_invoice_pdf(
    invoice: Dict[str, Any],
    resort_settings: Optional[Dict[str, Any]] = None,
    output_path: Optional[Path] = None,
) -> str:
    if resort_settings is None:
        resort_settings = DEFAULT_RESORT_SETTINGS

    inv_num = invoice.get("invoice_number", "INV")
    rel_path = f"invoices/{inv_num}.pdf"
    target_path = output_path or (settings.STORAGE_DIR / rel_path)

    styles = _build_styles()

    # Determine document title
    doc_title = invoice.get("document_title") or (
        "PAID INVOICE" if invoice.get("payment_status") == "Paid" else "INVOICE"
    )

    header_meta = {
        "doc_title": doc_title,
        "number_label": "Invoice No:",
        "number_value": invoice.get("invoice_number", ""),
        "date_label": "Invoice Date:",
        "date_value": format_pdf_date(invoice.get("invoice_date"), style="mdy"),
    }

    # Customer + Stay info two-column section
    bill_lines = [f"<b>{escape(invoice.get('customer_name', ''))}</b>"]
    if invoice.get("company_name"):
        bill_lines.append(escape(invoice["company_name"]))
    inv_addr = invoice.get("address") or invoice.get("customer_address")
    if inv_addr:
        bill_lines.append(escape(inv_addr).replace("\n", "<br/>"))
    inv_mob = invoice.get("contact_number") or invoice.get("customer_mobile")
    if inv_mob and inv_mob != "N/A":
        bill_lines.append(f"Mob: {escape(inv_mob)}")
    inv_gst = invoice.get("gstin") or invoice.get("customer_gstin")
    if inv_gst:
        bill_lines.append(f"GSTIN: {escape(inv_gst)}")

    left_block = [
        Paragraph("<b>BILL TO:</b>", styles["heading_blue"]),
        Spacer(1, 3),
        Paragraph("<br/>".join(bill_lines), styles["body"]),
    ]

    stay_rows = []
    if invoice.get("check_in_date"):
        stay_rows.append(
            [
                Paragraph("<font color='#004AAD'><b>Check In</b></font>", styles["body"]),
                Paragraph(format_pdf_date(invoice.get("check_in_date")), styles["body"]),
            ]
        )
    if invoice.get("check_out_date"):
        stay_rows.append(
            [
                Paragraph("<font color='#004AAD'><b>Check Out</b></font>", styles["body"]),
                Paragraph(format_pdf_date(invoice.get("check_out_date")), styles["body"]),
            ]
        )
    if invoice.get("booking_reference"):
        stay_rows.append(
            [
                Paragraph("<font color='#004AAD'><b>Booking Ref</b></font>", styles["body"]),
                Paragraph(escape(invoice["booking_reference"]), styles["body"]),
            ]
        )

    if stay_rows:
        right_tbl = Table(stay_rows, colWidths=[85, 115])
        right_tbl.setStyle(
            TableStyle(
                [
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
    else:
        right_tbl = Spacer(1, 1)

    info_tbl = Table([[left_block, right_tbl]], colWidths=[300, 211])
    info_tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    story: List[Any] = [info_tbl, Spacer(1, 16), _build_items_table(invoice.get("line_items", []), styles)]

    # Breakdown rows
    summary_rows: List[tuple[str, str]] = [("Subtotal", format_inr(invoice.get("subtotal", 0)))]
    if float(invoice.get("discount_total", 0) or 0) > 0:
        summary_rows.append(("Discount", f"- {format_inr(invoice['discount_total'])}"))
    if float(invoice.get("tax_total", 0) or 0) > 0:
        summary_rows.append(("Taxable Amount", format_inr(invoice.get("taxable_amount", 0))))
        if float(invoice.get("cgst_amount", 0) or 0) > 0:
            summary_rows.append(("CGST", format_inr(invoice["cgst_amount"])))
        if float(invoice.get("sgst_amount", 0) or 0) > 0:
            summary_rows.append(("SGST", format_inr(invoice["sgst_amount"])))
        if float(invoice.get("igst_amount", 0) or 0) > 0:
            summary_rows.append(("IGST", format_inr(invoice["igst_amount"])))
    if float(invoice.get("additional_charges", 0) or 0) > 0:
        summary_rows.append(("Additional Charges", format_inr(invoice["additional_charges"])))

    grand_total = float(invoice.get("grand_total", 0) or 0)
    total_paid = float(invoice.get("total_amount_paid", 0) or 0)
    balance_due = float(invoice.get("balance_due", 0) or 0)
    adv = float(invoice.get("advance_paid", 0) or 0)
    prev = float(invoice.get("previous_payments", 0) or 0)
    curr = float(invoice.get("current_payment", 0) or 0)

    if balance_due > 0 or total_paid != grand_total or len(summary_rows) > 1:
        summary_rows.append(("Grand Total", format_inr(grand_total)))
    if adv > 0:
        summary_rows.append(("Advance Paid", format_inr(adv)))
    if prev > 0 and prev != adv:
        summary_rows.append(("Previous Payments", format_inr(prev)))
    if curr > 0 and curr != total_paid:
        summary_rows.append(("Current Payment", format_inr(curr)))

    if balance_due > 0:
        if total_paid > 0:
            summary_rows.append(("Total Paid", format_inr(total_paid)))
        hl_label = "BALANCE DUE"
        hl_val = format_inr(balance_due)
    else:
        hl_label = "TOTAL AMOUNT PAID"
        hl_val = format_inr(total_paid if total_paid > 0 else grand_total)

    story.append(
        _build_totals_section(
            styles=styles,
            summary_rows=summary_rows,
            highlight_label=hl_label,
            highlight_value=hl_val,
        )
    )

    if invoice.get("notes"):
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"<b>Notes:</b> {escape(invoice['notes'])}", styles["small_muted"]))

    pay_cfg = resort_settings.get("payment_info", {})
    payment_lines = [
        ("GPay No.", str(invoice.get("gpay_number") or pay_cfg.get("gpay_number") or "8669408484")),
        ("Account Name:", str(invoice.get("account_name") or pay_cfg.get("account_name") or "Pranit Dabhade")),
        (
            "Account Number:",
            str(invoice.get("account_number") or pay_cfg.get("account_number") or "---------------------"),
        ),
    ]
    if invoice.get("payment_method"):
        payment_lines.append(("Payment Method:", str(invoice["payment_method"])))
    if invoice.get("payment_reference"):
        payment_lines.append(("Reference:", str(invoice["payment_reference"])))

    story.append(
        _build_signature_and_payment_block(
            styles=styles,
            resort_settings=resort_settings,
            payment_lines=payment_lines,
        )
    )

    _render_pdf(story, resort_settings, header_meta, output_path=target_path)
    return rel_path


def generate_quotation_pdf(
    quotation: Dict[str, Any],
    resort_settings: Optional[Dict[str, Any]] = None,
    output_path: Optional[Path] = None,
) -> str:
    if resort_settings is None:
        resort_settings = DEFAULT_RESORT_SETTINGS

    q_num = quotation.get("quotation_number", "QT")
    rel_path = f"quotations/{q_num}.pdf"
    target_path = output_path or (settings.STORAGE_DIR / rel_path)

    styles = _build_styles()
    header_meta = {
        "doc_title": "QUOTATION",
        "number_label": "Quotation No:",
        "number_value": quotation.get("quotation_number", ""),
        "date_label": "Date:",
        "date_value": format_pdf_date(quotation.get("quotation_date"), style="mdy"),
        "extra_header_line": f"Valid Until: {format_pdf_date(quotation.get('valid_until'), style='mdy')}",
    }

    cust_lines = [f"<b>{escape(quotation.get('customer_name', ''))}</b>"]
    if quotation.get("company_name"):
        cust_lines.append(escape(quotation["company_name"]))
    if quotation.get("customer_address"):
        cust_lines.append(escape(quotation["customer_address"]).replace("\n", "<br/>"))
    if quotation.get("customer_mobile"):
        cust_lines.append(f"Mob: {escape(quotation['customer_mobile'])}")
    if quotation.get("customer_email"):
        cust_lines.append(f"Email: {escape(quotation['customer_email'])}")
    if quotation.get("gstin"):
        cust_lines.append(f"GSTIN: {escape(quotation['gstin'])}")

    left_block = [
        Paragraph("<b>QUOTATION FOR:</b>", styles["heading_blue"]),
        Spacer(1, 3),
        Paragraph("<br/>".join(cust_lines), styles["body"]),
    ]

    guests_desc = f"{quotation.get('adults', 0)} Adults"
    if quotation.get("children", 0):
        guests_desc += f", {quotation['children']} Child"
    if quotation.get("infants", 0):
        guests_desc += f", {quotation['infants']} Infant"

    stay_rows = [
        [
            Paragraph("<font color='#004AAD'><b>Check In</b></font>", styles["body"]),
            Paragraph(
                f"{format_pdf_date(quotation.get('check_in_date'))} ({escape(str(quotation.get('check_in_time') or ''))})".strip(),
                styles["body"],
            ),
        ],
        [
            Paragraph("<font color='#004AAD'><b>Check Out</b></font>", styles["body"]),
            Paragraph(
                f"{format_pdf_date(quotation.get('check_out_date'))} ({escape(str(quotation.get('check_out_time') or ''))})".strip(),
                styles["body"],
            ),
        ],
        [
            Paragraph("<font color='#004AAD'><b>Guests</b></font>", styles["body"]),
            Paragraph(escape(guests_desc), styles["body"]),
        ],
        [
            Paragraph("<font color='#004AAD'><b>Rooms</b></font>", styles["body"]),
            Paragraph(str(quotation.get("rooms", 1)), styles["body"]),
        ],
    ]
    right_tbl = Table(stay_rows, colWidths=[72, 140])
    right_tbl.setStyle(
        TableStyle(
            [
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    info_tbl = Table([[left_block, right_tbl]], colWidths=[299, 212])
    info_tbl.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    story: List[Any] = [info_tbl, Spacer(1, 14)]
    if quotation.get("special_requirements"):
        story.append(
            Paragraph(
                f"<font color='#004AAD'><b>Special Requirements:</b></font> {escape(quotation['special_requirements'])}",
                styles["small"],
            )
        )
        story.append(Spacer(1, 8))

    story.append(_build_items_table(quotation.get("line_items", []), styles))

    summary_rows: List[tuple[str, str]] = [("Subtotal", format_inr(quotation.get("subtotal", 0)))]
    if float(quotation.get("discount_total", 0) or 0) > 0:
        summary_rows.append(("Discount", f"- {format_inr(quotation['discount_total'])}"))
    if float(quotation.get("tax_total", 0) or 0) > 0:
        summary_rows.append(("Taxable Amount", format_inr(quotation.get("taxable_amount", 0))))
        if float(quotation.get("cgst_amount", 0) or 0) > 0:
            summary_rows.append(("CGST", format_inr(quotation["cgst_amount"])))
        if float(quotation.get("sgst_amount", 0) or 0) > 0:
            summary_rows.append(("SGST", format_inr(quotation["sgst_amount"])))
        if float(quotation.get("igst_amount", 0) or 0) > 0:
            summary_rows.append(("IGST", format_inr(quotation["igst_amount"])))
    if float(quotation.get("additional_charges", 0) or 0) > 0:
        summary_rows.append(("Additional Charges", format_inr(quotation["additional_charges"])))
    if float(quotation.get("advance_required", 0) or 0) > 0:
        summary_rows.append(("Advance Required", format_inr(quotation["advance_required"])))

    story.append(
        _build_totals_section(
            styles=styles,
            summary_rows=summary_rows,
            highlight_label="GRAND TOTAL",
            highlight_value=format_inr(quotation.get("grand_total", 0)),
        )
    )

    terms = quotation.get("terms_and_conditions") or resort_settings.get("documents", {}).get("default_terms")
    if terms:
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>Terms & Conditions:</b>", styles["heading_blue"]))
        story.append(Spacer(1, 3))
        story.append(Paragraph(escape(terms).replace("\n", "<br/>"), styles["small_muted"]))

    pay_cfg = resort_settings.get("payment_info", {})
    payment_lines = [
        ("GPay No.", str(pay_cfg.get("gpay_number") or "8669408484")),
        ("Account Name:", str(pay_cfg.get("account_name") or "Pranit Dabhade")),
        ("Account Number:", str(pay_cfg.get("account_number") or "---------------------")),
    ]
    story.append(
        _build_signature_and_payment_block(
            styles=styles,
            resort_settings=resort_settings,
            payment_lines=payment_lines,
        )
    )

    _render_pdf(story, resort_settings, header_meta, output_path=target_path)
    return rel_path


def generate_receipt_pdf(
    payment: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
    resort_settings: Optional[Dict[str, Any]] = None,
    output_path: Optional[Path] = None,
) -> str:
    if context is None:
        context = payment
    if resort_settings is None:
        resort_settings = DEFAULT_RESORT_SETTINGS

    rec_num = payment.get("receipt_number") or payment.get("payment_id") or "REC"
    rel_path = f"receipts/{rec_num}.pdf"
    target_path = output_path or (settings.STORAGE_DIR / rel_path)

    styles = _build_styles()
    is_refund = payment.get("payment_type") == "Refund"
    header_meta = {
        "doc_title": "REFUND RECEIPT" if is_refund else "PAYMENT RECEIPT",
        "number_label": "Receipt No:",
        "number_value": payment.get("receipt_number") or payment.get("payment_id", ""),
        "date_label": "Date:",
        "date_value": format_pdf_date(payment.get("payment_date"), style="mdy"),
    }

    cust_name = payment.get("customer_name") or context.get("customer_name", "")
    left_block = [
        Paragraph("<b>PAID TO:</b>" if is_refund else "<b>RECEIVED FROM:</b>", styles["heading_blue"]),
        Spacer(1, 3),
        Paragraph(f"<b>{escape(cust_name)}</b>", styles["body"]),
    ]
    rec_mob = context.get("contact_number") or payment.get("customer_mobile") or payment.get("contact_number")
    if rec_mob and rec_mob != "N/A":
        left_block.append(Paragraph(f"Mob: {escape(rec_mob)}", styles["body"]))

    meta_rows = [
        [
            Paragraph("<font color='#004AAD'><b>Receipt / ID</b></font>", styles["body"]),
            Paragraph(escape(str(payment.get("receipt_number") or payment.get("payment_id") or payment.get("id") or "")), styles["body"]),
        ],
        [
            Paragraph("<font color='#004AAD'><b>Type</b></font>", styles["body"]),
            Paragraph(escape(payment.get("payment_type", "Payment")), styles["body"]),
        ],
        [
            Paragraph("<font color='#004AAD'><b>Method</b></font>", styles["body"]),
            Paragraph(escape(payment.get("payment_method", "")), styles["body"]),
        ],
    ]
    if context.get("invoice_number"):
        meta_rows.append(
            [
                Paragraph("<font color='#004AAD'><b>Invoice No</b></font>", styles["body"]),
                Paragraph(escape(context["invoice_number"]), styles["body"]),
            ]
        )
    if context.get("booking_reference"):
        meta_rows.append(
            [
                Paragraph("<font color='#004AAD'><b>Booking Ref</b></font>", styles["body"]),
                Paragraph(escape(context["booking_reference"]), styles["body"]),
            ]
        )

    right_tbl = Table(meta_rows, colWidths=[82, 130])
    right_tbl.setStyle(
        TableStyle(
            [
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    info_tbl = Table([[left_block, right_tbl]], colWidths=[299, 212])
    info_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))

    desc = f"{payment.get('payment_type', 'Payment')} received via {payment.get('payment_method', '')}"
    if payment.get("transaction_id"):
        desc += f"\nTransaction ID: {payment['transaction_id']}"
    if payment.get("notes"):
        desc += f"\nNotes: {payment['notes']}"

    items = [
        {
            "description": f"{'Refund Issued' if is_refund else 'Payment Received'} ({payment.get('payment_id', '')})",
            "inclusion_text": desc,
            "quantity": 1,
            "rate": float(payment.get("amount", 0)),
            "amount": float(payment.get("amount", 0)),
        }
    ]

    story: List[Any] = [info_tbl, Spacer(1, 18), _build_items_table(items, styles)]

    summary_rows: List[tuple[str, str]] = []
    if context.get("grand_total") is not None:
        summary_rows.append(("Total Bill Amount", format_inr(context["grand_total"])))
    if context.get("balance_due") is not None:
        summary_rows.append(("Remaining Balance", format_inr(context["balance_due"])))

    story.append(
        _build_totals_section(
            styles=styles,
            summary_rows=summary_rows,
            highlight_label="AMOUNT REFUNDED" if is_refund else "AMOUNT RECEIVED",
            highlight_value=format_inr(payment.get("amount", 0)),
        )
    )

    payment_lines = [
        ("Payment Method:", str(payment.get("payment_method", "-"))),
        ("Transaction ID:", str(payment.get("transaction_id") or "-")),
        ("Reference:", str(payment.get("payment_reference") or "-")),
        ("Received By:", str(payment.get("received_by") or "-")),
    ]
    story.append(
        _build_signature_and_payment_block(
            styles=styles,
            resort_settings=resort_settings,
            payment_lines=payment_lines,
        )
    )

    _render_pdf(story, resort_settings, header_meta, output_path=target_path)
    return rel_path

