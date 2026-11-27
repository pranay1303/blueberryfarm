from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.authentication.security import hash_password  # noqa: E402
from app.core.config import ist_now_iso  # noqa: E402
from app.models.entities import UserRole  # noqa: E402
from app.services.seed_service import ensure_initial_data  # noqa: E402
from app.storage.json_store import generate_unique_id, read_records, update_json  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an Owner/Admin user for Blueberry Farm and Resort.")
    parser.add_argument("--username", default="owner")
    parser.add_argument("--full-name", default="Pranit Dabhade")
    parser.add_argument("--email", default="")
    parser.add_argument("--password", default="")
    args = parser.parse_args()

    ensure_initial_data()
    username = args.username.strip().lower()
    existing = [u for u in read_records("users") if u["username"].lower() == username]
    if existing:
        print(f"User '{username}' already exists.")
        return

    pw = args.password or getpass.getpass("Enter Owner password (min 8 chars): ")
    if len(pw) < 8:
        raise SystemExit("Error: Password must be at least 8 characters.")

    now = ist_now_iso()
    user_rec = {
        "id": generate_unique_id("USR"),
        "username": username,
        "email": args.email or None,
        "full_name": args.full_name,
        "role": UserRole.OWNER_ADMIN.value,
        "password_hash": hash_password(pw),
        "is_active": True,
        "must_change_password": False,
        "last_login_at": None,
        "created_at": now,
        "updated_at": now,
        "created_by": "cli_script",
        "is_archived": False,
    }
    update_json("users", lambda d: d["records"].append(user_rec))
    print(f"Created Owner/Admin account '{username}' successfully.")


if __name__ == "__main__":
    main()

