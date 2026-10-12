import json
import logging
import sqlite3
from datetime import datetime, timezone
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

def init_db() -> None:
    try:
        con = sqlite3.connect(settings.audit_db_path)
        con.execute(
            """CREATE TABLE IF NOT EXISTS query_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                question TEXT NOT NULL,
                source_used TEXT NOT NULL,
                trace_json TEXT NOT NULL
            )"""
        )
        con.commit()
        con.close()
    except sqlite3.Error:
        logger.exception("Audit DB unavailable at %s; set AUDIT_DB_PATH to a writable path", settings.audit_db_path)

def write_audit(question: str, source_used: str, trace: list[str]) -> None:
    # An audit failure must never discard an answer the user already waited for.
    try:
        con = sqlite3.connect(settings.audit_db_path)
        con.execute(
            "INSERT INTO query_audit(created_at, question, source_used, trace_json) VALUES (?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), question, source_used, json.dumps(trace)),
        )
        con.commit()
        con.close()
    except sqlite3.Error:
        logger.exception("Audit write failed (db: %s); set AUDIT_DB_PATH to a writable path", settings.audit_db_path)