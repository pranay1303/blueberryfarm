from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.seed_service import clear_demo_dataset, ensure_initial_data, load_demo_dataset  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Load or clear DEMO records for Blueberry Farm and Resort.")
    parser.add_argument("--clear", action="store_true", help="Remove all records marked is_demo=True.")
    args = parser.parse_args()

    ensure_initial_data()
    if args.clear:
        removed = clear_demo_dataset(actor_id="cli_script", actor_username="cli_script")
        print(f"Cleared DEMO records: {removed}")
    else:
        counts = load_demo_dataset(actor_id="cli_script", actor_username="cli_script")
        print(f"Loaded DEMO dataset: {counts}")


if __name__ == "__main__":
    main()

