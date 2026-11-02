"""Backend-only SQLite access. The legacy database is never opened for writing."""
from contextlib import contextmanager, closing
from pathlib import Path
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE,
 waktu TEXT NOT NULL, status TEXT NOT NULL, node_penerima TEXT NOT NULL,
 node_pengirim TEXT, latitude REAL, longitude REAL,
 victim_count INTEGER NOT NULL DEFAULT 1, location_accuracy REAL,
 location_source TEXT NOT NULL DEFAULT 'UNAVAILABLE', created_at TEXT,
 last_seen TEXT, duplicate_count INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS report_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL,
 waktu TEXT NOT NULL, message TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
 password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL
);
"""


def backup_database(source: Path, destination: Path):
    """SQLite-consistent copy; repeated runs never overwrite an existing destination."""
    if destination.exists():
        return False
    if source.resolve() == destination.resolve():
        raise ValueError("Database sumber dan tujuan harus berbeda")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Claim the target exclusively before connecting; never replace a concurrent copy.
    with destination.open("xb"):
        pass
    try:
        with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as src:
            with closing(sqlite3.connect(destination)) as dst:
                src.backup(dst)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return True


class Database:
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def connect(self, write=False):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            if write:
                conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self, legacy=None):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if legacy and Path(legacy).exists() and not self.path.exists():
            backup_database(Path(legacy), self.path)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(SCHEMA)
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > 1:
                raise RuntimeError("Versi database lebih baru daripada aplikasi ini")
            columns = {r[1] for r in db.execute("PRAGMA table_info(reports)")}
            additions = {"node_pengirim": "TEXT", "victim_count": "INTEGER NOT NULL DEFAULT 1",
                         "location_accuracy": "REAL", "location_source": "TEXT NOT NULL DEFAULT 'UNAVAILABLE'",
                         "created_at": "TEXT", "last_seen": "TEXT", "duplicate_count": "INTEGER NOT NULL DEFAULT 1"}
            for name, sql_type in additions.items():
                if name not in columns:
                    db.execute(f"ALTER TABLE reports ADD COLUMN {name} {sql_type}")
            db.executescript("""
                CREATE UNIQUE INDEX IF NOT EXISTS report_message_unique ON reports(message_id);
                CREATE INDEX IF NOT EXISTS logs_message ON report_logs(message_id, id);
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT OR IGNORE INTO settings VALUES ('station_name', 'Posko Utama Semeru');
                PRAGMA user_version=1;
            """)
