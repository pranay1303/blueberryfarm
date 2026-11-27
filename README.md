# Blueberry Farm and Resort — Management, Billing & Quotation Software

**Business Address:** At. Post – Mandawane, Tal – Karjat, Dist – Raigad, Maharashtra  
**Architecture:** Mobile-First React + TypeScript PWA, FastAPI Backend, Database-Free Atomic JSON Storage, ReportLab PDF Generation.

---

## Key Features & Modules

1. **Home Dashboard**: Real-time KPIs calculated directly from `data/*.json` (no dummy numbers), date-range filters (`Today`, `Yesterday`, `Last 7 Days`, `Last 30 Days`, `This Month`, `Previous Month`, `This Year`, `Custom`), revenue trend & monthly booking charts, popular packages, expense breakdown, upcoming check-ins/check-outs, and recent activity.
2. **Customer Management**: Full guest/corporate CRM, duplicate detection, search/filtering, complete booking/quotation/invoice/payment ledger, and live outstanding balance tracking.
3. **Booking Management**: Full resort lifecycle (`Enquiry`, `Quotation Sent`, `Awaiting Confirmation`, `Confirmed`, `Checked In`, `Checked Out`, `Cancelled`), package pricing calculator integration, date validation, upcoming check-in/out views, cancellation, and one-click quotation-to-booking or booking-to-invoice conversion.
4. **Package & Pricing Master**: Preloaded with configurable initial packages (*24-Hour Stay Package* ₹1,800 weekday / ₹2,500 weekend; *One-Day Staycation Package* ₹1,300 weekday & weekend; complimentary children aged 1–5; ₹1,200 children aged 5–10), unlimited custom packages, holiday/special date overrides, and admin-only editing.
5. **Quotation Management**: Unlimited itemized charges, discounts, optional GST, server-calculated totals, live preview, official Blueberry Farm and Resort branded ReportLab PDF (`storage/quotations/`), mobile Share/WhatsApp integration, and one-click conversion to Booking or Invoice.
6. **Invoice & Billing Management**: Audit-protected invoice numbering, line-item billing, automatic payment status transitions (`Unpaid`, `Partially Paid`, `Paid`, `Refunded`), official ReportLab invoice PDF matching the Blueberry Farm & Resort template (`Plus91Design.pdf`), and cancellation/void handling.
7. **Payment, Advance & Receipt Management**: Multi-payment recording against bookings/invoices (Cash, UPI, Bank Transfer, Card, Cheque, Other), refund adjustments, advance tracking, and official Payment Receipt PDFs (`storage/receipts/`).
8. **Expense Management**: Operational expense ledger across resort categories with vendor tracking, bill/receipt attachment uploads (`storage/attachments/`) & authenticated downloads, and operating profit integration.
9. **Business Analytics & Reports**: Package popularity, booking source conversion, weekday vs. weekend split, revenue/expense/profit time series, plus 10 operational/financial reports exportable as ReportLab PDF, Excel (`.xlsx`), and JSON.
10. **Staff, Roles & Authentication**: Argon2 password hashing (`data/users.json`), short-lived JWT access tokens + `HttpOnly` refresh cookies with session revocation (`data/audit_metadata.json`), login rate limiting, and strict RBAC (`OWNER_ADMIN`, `MANAGER`, `RECEPTION_STAFF`, `ACCOUNTS_STAFF`).
11. **Branding, Settings, Backups & Logs**: Configurable business footer email (`blueberrryfarmandresort.gmail.com` by default), GST settings, optional owner signature image upload, automated daily & manual ZIP JSON backups with SHA-256 verification and safe restore (`storage/backups/`), optional clearly marked `DEMO` dataset loader/cleaner, and structured JSONL logs (`logs/application.jsonl`, `activity.jsonl`, `security.jsonl`, `error.jsonl`).

---

## Folder Structure

```text
BlueberryFarm/
├── backend/
│   ├── app/
│   │   ├── analytics/       # Dashboard & analytics calculations
│   │   ├── api/             # FastAPI routers (auth, staff, customers, bookings, ...)
│   │   ├── authentication/  # Argon2, JWT, refresh cookie & RBAC guards
│   │   ├── core/            # IST clock & environment configuration
│   │   ├── logging/         # Redacted JSONL application/activity/security/error logs
│   │   ├── models/          # Entities & enums
│   │   ├── pdf/             # ReportLab PDF generators + extracted circular logo assets
│   │   ├── schemas/         # Pydantic request schemas
│   │   ├── services/        # Calculations, exports & seed/DEMO utilities
│   │   ├── storage/         # Concurrent file-locked atomic JSON engine & ZIP backups
│   │   ├── validations/     # Input & business rule validators
│   │   └── main.py          # FastAPI app, lifespan auto-backup loop & SPA static host
│   ├── tests/               # Pytest backend API, concurrency, PDF & security tests
│   └── requirements.txt
├── frontend/
│   ├── public/              # PWA manifest.webmanifest, service worker & icons
│   ├── src/
│   │   ├── __tests__/       # Vitest frontend unit & UI integration tests
│   │   ├── components/      # Reusable UI primitives, modals, PDF preview, search
│   │   ├── context/         # AuthContext (in-memory token) & ToastContext
│   │   ├── layouts/         # Mobile bottom nav (Home/Bookings/Create/Documents/More) + desktop sidebar
│   │   ├── modules/         # All 13 application modules
│   │   ├── pages/           # Login / Initial Setup & Mobile Create/Documents/More hubs
│   │   └── services/        # Axios client with auto 401 refresh & authenticated blob fetcher
│   └── package.json
├── data/                    # Persistent JSON files (no external database)
├── logs/                    # JSONL operational, security, activity & error logs
├── storage/                 # Generated PDFs, uploaded attachments & verified ZIP backups
├── scripts/
│   ├── create_admin.py      # CLI Owner/Admin account creator
│   ├── seed_demo.py         # CLI DEMO dataset loader/cleaner (--clear)
│   └── start_windows.ps1    # Windows one-command build & launch script
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Setup & Running Locally (Windows / Linux)

### 1. Prerequisites
- **Python 3.11+** (verified on Python 3.15)
- **Node.js 20+** and **npm**

### 2. Install Dependencies
```powershell
pip install -r backend\requirements.txt
cd frontend
npm install
cd ..
```

### 3. Quick Production Start on Windows (Single Port `8000`)
```powershell
.\scripts\start_windows.ps1
```
This builds `frontend/dist` (if needed) and starts FastAPI on `http://localhost:8000`. Open `http://localhost:8000` in your browser (or via LAN IP from an Android smartphone on the same Wi-Fi).

### 4. Initial Owner Setup
When `data/users.json` is empty, opening the app automatically presents the **Initial Resort Setup — Create Owner / Admin Account** screen.  
Alternatively, create the Owner account from CLI:
```powershell
python scripts\create_admin.py --username owner --full-name "Pranit Dabhade"
```

### 5. Development Mode (Hot Reload)
Run backend and frontend in two terminals:
```powershell
# Terminal 1 — FastAPI backend (port 8000)
$env:PYTHONPATH = "$PWD\backend"
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — Vite frontend dev server (port 5173, proxies /api -> :8000)
cd frontend
npm run dev
```

### 6. Optional DEMO Dataset
You can load or clear clearly labeled `is_demo` sample data either from **Settings -> Demo & Sample Data** in the Owner UI or via CLI:
```powershell
python scripts\seed_demo.py          # Load sample records
python scripts\seed_demo.py --clear  # Remove all DEMO records
```

---

## Running Automated Verification Tests

### Backend Tests (`pytest`)
Tests Argon2 + JWT auth, RBAC enforcement, booking/quotation/invoice/payment lifecycles, ReportLab PDF text extraction, concurrency-safe JSON file locking & `.bak` recovery, and ZIP backup checksum verification & restore:
```powershell
python -m pytest backend\tests\test_resort_backend.py -v
```

### Frontend Tests (`vitest`) & Production Build
Tests Initial Setup & Login Zod validation, mobile bottom navigation & role-based navigation visibility, Customer CRUD/search/error handling, Booking filters, and Quotation calculation/creation:
```powershell
cd frontend
npm test
npm run build
```

---

## Cloud Deployment (Docker)
Copy `.env.example` to `.env`, set a strong `BLUEBERRY_JWT_SECRET`, and launch with persistent volumes for `data/`, `logs/`, and `storage/`:
```bash
docker compose up --build -d
```

