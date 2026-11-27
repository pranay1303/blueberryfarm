from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import threading
import time
import uuid
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple, Type

from pydantic import BaseModel, ValidationError

from app.core.config import ist_now, ist_now_iso, settings

if os.name == "nt":
    import msvcrt
else:
    import fcntl

SCHEMA_VERSION = 1

LIST_ENTITIES = {
    "users",
    "customers",
    "bookings",
    "quotations",
    "invoices",
    "payments",
    "expenses",
    "packages",
}

OBJECT_ENTITIES = {
    "settings",
    "counters",
    "audit_metadata",
}

ALL_ENTITIES = LIST_ENTITIES | OBJECT_ENTITIES


class StorageError(Exception):
    """Base exception for JSON storage failures."""


class StorageCorruptionError(StorageError):
    """Raised when a JSON file is corrupted and cannot be recovered."""


class StorageValidationError(StorageError):
    """Raised when payload fails schema validation."""


class LockTimeoutError(StorageError):
    """Raised when a file lock cannot be acquired within timeout."""


_thread_locks_guard = threading.Lock()
_thread_locks: Dict[str, threading.RLock] = {}


def _get_thread_lock(key: str) -> threading.RLock:
    with _thread_locks_guard:
        if key not in _thread_locks:
            _thread_locks[key] = threading.RLock()
        return _thread_locks[key]


def _entity_path(entity: str, data_dir: Optional[Path] = None) -> Path:
    if entity not in ALL_ENTITIES:
        raise ValueError(f"Unknown entity: {entity}")
    base = data_dir or settings.DATA_DIR
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{entity}.json"


def _lock_path(target_path: Path) -> Path:
    return target_path.with_suffix(".json.lock")


def acquire_file_lock(target_path: Path, timeout: float = 10.0) -> Tuple[threading.RLock, Any]:
    """
    Acquire both an in-process RLock and an OS-level advisory/file lock.
    Returns (thread_lock, open_lock_file_handle).
    """
    key = str(target_path.resolve())
    tlock = _get_thread_lock(key)
    acquired_thread = tlock.acquire(timeout=timeout)
    if not acquired_thread:
        raise LockTimeoutError(f"Timed out waiting for thread lock on {target_path.name}")

    lpath = _lock_path(target_path)
    lpath.parent.mkdir(parents=True, exist_ok=True)
    fh = None
    deadline = time.monotonic() + timeout
    try:
        fh = open(lpath, "a+b")
        # Ensure at least 1 byte exists for msvcrt.locking
        fh.seek(0, os.SEEK_END)
        if fh.tell() == 0:
            fh.write(b"0")
            fh.flush()

        while True:
            try:
                fh.seek(0)
                if os.name == "nt":
                    msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                return tlock, fh
            except OSError:
                if time.monotonic() >= deadline:
                    raise LockTimeoutError(f"Timed out waiting for OS file lock on {target_path.name}")
                time.sleep(0.02)
    except Exception:
        if fh is not None:
            try:
                fh.close()
            except OSError:
                pass
        tlock.release()
        raise


def release_file_lock(lock_handle: Tuple[threading.RLock, Any]) -> None:
    """Release OS-level file lock and thread RLock."""
    tlock, fh = lock_handle
    try:
        if fh is not None:
            try:
                fh.seek(0)
                if os.name == "nt":
                    msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
            try:
                fh.close()
            except OSError:
                pass
    finally:
        tlock.release()


@contextmanager
def file_lock(target_path: Path, timeout: float = 10.0) -> Iterator[None]:
    handle = acquire_file_lock(target_path, timeout=timeout)
    try:
        yield
    finally:
        release_file_lock(handle)


def _default_document(entity: str) -> Dict[str, Any]:
    now = ist_now_iso()
    if entity in LIST_ENTITIES:
        return {
            "schema_version": SCHEMA_VERSION,
            "entity": entity,
            "updated_at": now,
            "records": [],
        }
    if entity == "counters":
        return {
            "schema_version": SCHEMA_VERSION,
            "entity": "counters",
            "updated_at": now,
            "data": {
                "booking": 0,
                "quotation": 0,
                "invoice": 0,
                "receipt": 0,
                "customer": 0,
                "payment": 0,
                "expense": 0,
                "package": 0,
                "user": 0,
            },
        }
    if entity == "audit_metadata":
        return {
            "schema_version": SCHEMA_VERSION,
            "entity": "audit_metadata",
            "updated_at": now,
            "data": {
                "active_sessions": {},
                "revoked_jtis": [],
                "last_auto_backup_at": None,
                "initialized_at": now,
            },
        }
    if entity == "settings":
        return {
            "schema_version": SCHEMA_VERSION,
            "entity": "settings",
            "updated_at": now,
            "data": default_resort_settings(),
        }
    raise ValueError(f"Unknown entity: {entity}")


def default_resort_settings() -> Dict[str, Any]:
    return {
        "business_name": "Blueberry Farm and Resort",
        "address_line": "At. Post - Mandawane, Tal - Karjat, Dist - Raigad",
        "full_address": "At. Post – Mandawane, Tal – Karjat, Dist – Raigad, Maharashtra",
        "phone": "8669408484",
        "website": "blueberryfarmandresort.com",
        "email": "blueberrryfarmandresort.gmail.com",
        "payment_info": {
            "gpay_number": "8669408484",
            "upi_id": "",
            "account_name": "Pranit Dabhade",
            "account_number": "",
            "bank_name": "",
            "ifsc_code": "",
        },
        "gst": {
            "enabled": False,
            "gstin": "",
            "cgst_rate": 0.0,
            "sgst_rate": 0.0,
            "igst_rate": 0.0,
            "tax_inclusive": False,
            "configured_by_owner": False,
        },
        "documents": {
            "quotation_prefix": "QTN",
            "invoice_prefix": "INV",
            "booking_prefix": "BFR",
            "receipt_prefix": "RCP",
            "quotation_validity_days": 7,
            "default_terms": (
                "1. 50% advance payment is required to confirm the booking.\n"
                "2. Balance payment must be settled before or at check-in.\n"
                "3. Cancellation policy applies as per resort guidelines."
            ),
            "authorized_signatory_name": "Pranit Dabhade",
            "signature_image_path": "",
        },
        "backup": {
            "auto_backup_enabled": True,
            "frequency": "daily",
            "retention_count": 30,
        },
        "meal_addons": [
            {"name": "Bhaji (Veg Pakora)", "rate": 150.0, "unit": "plate"},
            {"name": "Chicken 65", "rate": 320.0, "unit": "plate"},
            {"name": "Paneer Chilli", "rate": 260.0, "unit": "plate"},
            {"name": "Fish Fry / Surmai", "rate": 380.0, "unit": "plate"},
            {"name": "Chicken Tandoori", "rate": 350.0, "unit": "plate"},
            {"name": "Veg Thali", "rate": 250.0, "unit": "plate"},
            {"name": "Non-Veg Thali", "rate": 350.0, "unit": "plate"},
            {"name": "Tea / Coffee", "rate": 40.0, "unit": "cup"},
            {"name": "Water Bottle", "rate": 20.0, "unit": "bottle"},
            {"name": "Extra Bed / Mattress", "rate": 400.0, "unit": "night"},
            {"name": "Bonfire Setup", "rate": 800.0, "unit": "event"},
            {"name": "DJ / Sound System", "rate": 2500.0, "unit": "event"},
        ],
    }


def validate_json(
    entity: str,
    payload: Dict[str, Any],
    record_model: Optional[Type[BaseModel]] = None,
) -> Dict[str, Any]:
    """Validate structure of a JSON entity document before persistence."""
    if not isinstance(payload, dict):
        raise StorageValidationError(f"{entity}: Root JSON must be an object")
    if "schema_version" not in payload or not isinstance(payload["schema_version"], int):
        raise StorageValidationError(f"{entity}: Missing integer schema_version")
    if payload.get("entity") != entity:
        raise StorageValidationError(f"{entity}: Entity mismatch ({payload.get('entity')})")

    if entity in LIST_ENTITIES:
        records = payload.get("records")
        if not isinstance(records, list):
            raise StorageValidationError(f"{entity}: 'records' must be a list")
        if record_model is not None:
            validated = []
            for idx, rec in enumerate(records):
                try:
                    model_obj = record_model.model_validate(rec)
                    validated.append(model_obj.model_dump(mode="json"))
                except ValidationError as exc:
                    raise StorageValidationError(f"{entity}[{idx}] validation failed: {exc}") from exc
            payload = dict(payload)
            payload["records"] = validated
    else:
        if not isinstance(payload.get("data"), dict):
            raise StorageValidationError(f"{entity}: 'data' must be an object")
    return payload


def _read_raw_unlocked(path: Path, entity: str) -> Dict[str, Any]:
    if not path.exists():
        default_doc = _default_document(entity)
        _write_atomic_unlocked(path, default_doc)
        return default_doc

    try:
        raw_text = path.read_text(encoding="utf-8")
        data = json.loads(raw_text)
        return validate_json(entity, data)
    except (json.JSONDecodeError, StorageValidationError, UnicodeDecodeError) as exc:
        # Attempt recovery from .bak if available
        bak_path = path.with_suffix(".json.bak")
        if bak_path.exists():
            try:
                bak_text = bak_path.read_text(encoding="utf-8")
                bak_data = json.loads(bak_text)
                validated = validate_json(entity, bak_data)
                _write_atomic_unlocked(path, validated)
                return validated
            except Exception:
                pass
        raise StorageCorruptionError(f"Corrupted JSON in {path.name}: {exc}") from exc


def _replace_with_retry(src: Path, dst: Path, retries: int = 12) -> None:
    """Atomically replace dst with src, retrying briefly on transient Windows AV/indexer locks."""
    for attempt in range(retries):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if attempt >= retries - 1:
                raise
            time.sleep(0.015 * (attempt + 1))


def _write_atomic_unlocked(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, ensure_ascii=False, default=str)

    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.stem}_", suffix=".tmp", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
            tmp_file.write(serialized)
            tmp_file.flush()
            os.fsync(tmp_file.fileno())
        _replace_with_retry(tmp_path, path)
        # Refresh recovery mirror from the newly committed valid file
        try:
            bak_path = path.with_suffix(".json.bak")
            shutil.copy2(path, bak_path)
        except OSError:
            pass
    except Exception:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise


def read_json(entity: str, data_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Thread-safe and process-safe read of an entity JSON document."""
    path = _entity_path(entity, data_dir)
    with file_lock(path):
        return _read_raw_unlocked(path, entity)


def read_records(entity: str, include_archived: bool = False, data_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
    if entity not in LIST_ENTITIES:
        raise ValueError(f"{entity} is not a list entity")
    doc = read_json(entity, data_dir=data_dir)
    records = doc.get("records", [])
    if include_archived:
        return records
    return [r for r in records if not r.get("is_archived", False)]


def read_object(entity: str, data_dir: Optional[Path] = None) -> Dict[str, Any]:
    if entity not in OBJECT_ENTITIES:
        raise ValueError(f"{entity} is not an object entity")
    doc = read_json(entity, data_dir=data_dir)
    return doc.get("data", {})


def write_json_atomic(
    entity: str,
    payload: Dict[str, Any],
    record_model: Optional[Type[BaseModel]] = None,
    data_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Validate and atomically write an entity JSON document under lock."""
    path = _entity_path(entity, data_dir)
    payload = dict(payload)
    payload["updated_at"] = ist_now_iso()
    validated = validate_json(entity, payload, record_model=record_model)
    with file_lock(path):
        _write_atomic_unlocked(path, validated)
    return validated


def update_json(
    entity: str,
    updater: Callable[[Dict[str, Any]], Any],
    record_model: Optional[Type[BaseModel]] = None,
    data_dir: Optional[Path] = None,
) -> Tuple[Dict[str, Any], Any]:
    """
    Safely read-modify-write an entity JSON file under a single lock hold.
    `updater(doc)` mutates or returns `(new_doc, result)` or mutates `doc` in-place and returns `result`.
    """
    path = _entity_path(entity, data_dir)
    with file_lock(path):
        doc = _read_raw_unlocked(path, entity)
        outcome = updater(doc)
        if isinstance(outcome, tuple) and len(outcome) == 2 and isinstance(outcome[0], dict) and "entity" in outcome[0]:
            new_doc, result = outcome
        else:
            new_doc, result = doc, outcome
        new_doc["updated_at"] = ist_now_iso()
        validated = validate_json(entity, new_doc, record_model=record_model)
        _write_atomic_unlocked(path, validated)
        return validated, result


def delete_or_archive_record(
    entity: str,
    record_id: str,
    *,
    id_field: str = "id",
    hard_delete: bool = False,
    archived_by: Optional[str] = None,
    data_dir: Optional[Path] = None,
) -> Optional[Dict[str, Any]]:
    """Archive (default) or delete a record by ID safely under lock."""
    if entity not in LIST_ENTITIES:
        raise ValueError(f"{entity} does not support record archival")

    def _mutate(doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        records = doc["records"]
        for i, rec in enumerate(records):
            if rec.get(id_field) == record_id:
                if hard_delete:
                    removed = records.pop(i)
                    return removed
                rec["is_archived"] = True
                rec["archived_at"] = ist_now_iso()
                rec["archived_by"] = archived_by or "system"
                rec["updated_at"] = ist_now_iso()
                return rec
        return None

    _, target = update_json(entity, _mutate, data_dir=data_dir)
    return target


def generate_unique_id(prefix: str) -> str:
    """Generate a collision-resistant unique identifier."""
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


def allocate_sequence(counter_name: str, data_dir: Optional[Path] = None) -> int:
    """Atomically increment and return the next integer sequence for a given counter."""

    def _inc(doc: Dict[str, Any]) -> int:
        data = doc.setdefault("data", {})
        current = int(data.get(counter_name, 0)) + 1
        data[counter_name] = current
        return current

    _, next_val = update_json("counters", _inc, data_dir=data_dir)
    return int(next_val)


@contextmanager
def coordinated_transaction(
    entities: List[str],
    data_dir: Optional[Path] = None,
    timeout: float = 15.0,
) -> Iterator[Dict[str, Dict[str, Any]]]:
    """
    Lock multiple JSON entity files in deterministic sorted order to prevent deadlocks,
    provide mutable snapshots, and atomically commit all changes on clean exit or roll back on error.
    """
    ordered = sorted(set(entities))
    paths = {e: _entity_path(e, data_dir) for e in ordered}
    handles: List[Tuple[threading.RLock, Any]] = []
    try:
        for e in ordered:
            handles.append(acquire_file_lock(paths[e], timeout=timeout))

        originals: Dict[str, Dict[str, Any]] = {}
        working: Dict[str, Dict[str, Any]] = {}
        for e in ordered:
            doc = _read_raw_unlocked(paths[e], e)
            originals[e] = json.loads(json.dumps(doc))
            working[e] = doc

        yield working

        # Validate all documents BEFORE writing any of them
        now = ist_now_iso()
        validated_docs: Dict[str, Dict[str, Any]] = {}
        for e in ordered:
            working[e]["updated_at"] = now
            validated_docs[e] = validate_json(e, working[e])

        # Commit writes
        written: List[str] = []
        try:
            for e in ordered:
                _write_atomic_unlocked(paths[e], validated_docs[e])
                written.append(e)
        except Exception:
            # Best-effort rollback of already-written files
            for e in written:
                try:
                    _write_atomic_unlocked(paths[e], originals[e])
                except Exception:
                    pass
            raise
    finally:
        for handle in reversed(handles):
            release_file_lock(handle)


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_backup(
    *,
    reason: str = "manual",
    created_by: str = "system",
    data_dir: Optional[Path] = None,
    logs_dir: Optional[Path] = None,
    backups_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Create a verified ZIP backup containing all business JSON data, safe configuration,
    relevant audit logs, and a SHA-256 manifest. Never includes .env or .jwt_secret.
    """
    d_dir = data_dir or settings.DATA_DIR
    l_dir = logs_dir or settings.LOGS_DIR
    b_dir = backups_dir or settings.BACKUPS_DIR
    b_dir.mkdir(parents=True, exist_ok=True)

    now = ist_now()
    backup_id = f"BKP-{now.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    safe_reason = "".join(ch for ch in reason if ch.isalnum() or ch in ("-", "_")) or "manual"
    zip_filename = f"{backup_id}_{safe_reason}.zip"
    zip_path = b_dir / zip_filename

    ordered_entities = sorted(ALL_ENTITIES)
    paths = [_entity_path(e, d_dir) for e in ordered_entities]
    handles: List[Tuple[threading.RLock, Any]] = []
    checksums: Dict[str, str] = {}
    file_sizes: Dict[str, int] = {}

    fd, tmp_zip_name = tempfile.mkstemp(prefix=".bkp_", suffix=".zip", dir=str(b_dir))
    os.close(fd)
    tmp_zip = Path(tmp_zip_name)

    try:
        for p in paths:
            handles.append(acquire_file_lock(p, timeout=15.0))

        with zipfile.ZipFile(tmp_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            # Ensure all entity JSON files exist and are valid before archiving
            for e, p in zip(ordered_entities, paths):
                doc = _read_raw_unlocked(p, e)
                raw = json.dumps(doc, indent=2, ensure_ascii=False, default=str).encode("utf-8")
                arcname = f"data/{e}.json"
                zf.writestr(arcname, raw)
                checksums[arcname] = _sha256_bytes(raw)
                file_sizes[arcname] = len(raw)

            # Include audit/application logs
            if l_dir.exists():
                for log_file in sorted(l_dir.glob("*.jsonl")):
                    raw = log_file.read_bytes()
                    arcname = f"logs/{log_file.name}"
                    zf.writestr(arcname, raw)
                    checksums[arcname] = _sha256_bytes(raw)
                    file_sizes[arcname] = len(raw)

            # Include uploaded attachments (e.g., authorized signature, expense receipts) excluding secrets
            att_dir = settings.ATTACHMENTS_DIR
            if att_dir.exists():
                for att in sorted(att_dir.rglob("*")):
                    if att.is_file() and not att.name.startswith("."):
                        rel = att.relative_to(att_dir).as_posix()
                        raw = att.read_bytes()
                        arcname = f"attachments/{rel}"
                        zf.writestr(arcname, raw)
                        checksums[arcname] = _sha256_bytes(raw)
                        file_sizes[arcname] = len(raw)

            manifest = {
                "backup_id": backup_id,
                "filename": zip_filename,
                "created_at": now.isoformat(),
                "app_name": settings.APP_NAME,
                "app_version": settings.APP_VERSION,
                "schema_version": SCHEMA_VERSION,
                "reason": reason,
                "created_by": created_by,
                "checksum_algorithm": "sha256",
                "files": checksums,
                "file_sizes": file_sizes,
            }
            zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))

        os.replace(tmp_zip, zip_path)
    except Exception:
        if tmp_zip.exists():
            try:
                tmp_zip.unlink()
            except OSError:
                pass
        raise
    finally:
        for h in reversed(handles):
            release_file_lock(h)

    return {
        "backup_id": backup_id,
        "filename": zip_filename,
        "size_bytes": zip_path.stat().st_size,
        "created_at": now.isoformat(),
        "reason": reason,
        "created_by": created_by,
        "file_count": len(checksums),
    }


def verify_backup(backup_path: Path) -> Dict[str, Any]:
    """Verify backup ZIP integrity, manifest presence, SHA-256 checksums, and JSON validity."""
    if not backup_path.exists():
        raise FileNotFoundError(f"Backup file not found: {backup_path.name}")

    try:
        with zipfile.ZipFile(backup_path, "r") as zf:
            bad_member = zf.testzip()
            if bad_member is not None:
                raise StorageCorruptionError(f"Corrupted ZIP entry: {bad_member}")

            if "manifest.json" not in zf.namelist():
                raise StorageCorruptionError("Backup missing manifest.json")

            manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
            expected_files: Dict[str, str] = manifest.get("files", {})
            if not expected_files:
                raise StorageCorruptionError("Backup manifest contains no files")

            for arcname, expected_hash in expected_files.items():
                if arcname not in zf.namelist():
                    raise StorageCorruptionError(f"Backup missing declared file: {arcname}")
                content = zf.read(arcname)
                actual_hash = _sha256_bytes(content)
                if actual_hash != expected_hash:
                    raise StorageCorruptionError(f"Checksum mismatch for {arcname}")
                if arcname.startswith("data/") and arcname.endswith(".json"):
                    entity = Path(arcname).stem
                    if entity in ALL_ENTITIES:
                        parsed = json.loads(content.decode("utf-8"))
                        validate_json(entity, parsed)

            return {
                "valid": True,
                "backup_id": manifest.get("backup_id"),
                "created_at": manifest.get("created_at"),
                "schema_version": manifest.get("schema_version"),
                "app_version": manifest.get("app_version"),
                "file_count": len(expected_files),
                "reason": manifest.get("reason"),
                "created_by": manifest.get("created_by"),
            }
    except zipfile.BadZipFile as exc:
        raise StorageCorruptionError(f"Invalid ZIP archive: {exc}") from exc


def restore_backup(
    backup_path: Path,
    *,
    restored_by: str = "system",
    data_dir: Optional[Path] = None,
    backups_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Verify backup integrity, create an automatic pre-restore safety backup of current data,
    and atomically restore JSON data files and attachments.
    """
    verification = verify_backup(backup_path)
    d_dir = data_dir or settings.DATA_DIR
    b_dir = backups_dir or settings.BACKUPS_DIR

    # Safety backup before overwriting current data
    safety_backup = create_backup(
        reason="pre_restore_safety",
        created_by=restored_by,
        data_dir=d_dir,
        backups_dir=b_dir,
    )

    ordered_entities = sorted(ALL_ENTITIES)
    paths = {e: _entity_path(e, d_dir) for e in ordered_entities}
    handles: List[Tuple[threading.RLock, Any]] = []

    try:
        for e in ordered_entities:
            handles.append(acquire_file_lock(paths[e], timeout=15.0))

        with zipfile.ZipFile(backup_path, "r") as zf:
            for e in ordered_entities:
                arcname = f"data/{e}.json"
                if arcname in zf.namelist():
                    parsed = json.loads(zf.read(arcname).decode("utf-8"))
                    validated = validate_json(e, parsed)
                    _write_atomic_unlocked(paths[e], validated)

            # Restore attachments if present
            att_dir = settings.ATTACHMENTS_DIR
            att_dir.mkdir(parents=True, exist_ok=True)
            for name in zf.namelist():
                if name.startswith("attachments/") and not name.endswith("/"):
                    rel = Path(name).relative_to("attachments")
                    # Prevent path traversal
                    dest = (att_dir / rel).resolve()
                    if str(dest).startswith(str(att_dir.resolve())):
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        dest.write_bytes(zf.read(name))
    finally:
        for h in reversed(handles):
            release_file_lock(h)

    return {
        "restored": True,
        "backup": verification,
        "safety_backup": safety_backup,
        "restored_at": ist_now_iso(),
        "restored_by": restored_by,
    }

