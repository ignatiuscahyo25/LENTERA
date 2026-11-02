from dataclasses import dataclass
from pathlib import Path
import os
import hashlib
import tomllib

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT.parent / "shared"
ASSETS = Path(__file__).resolve().parent / "assets"


@dataclass(frozen=True)
class Config:
    database: Path = ROOT / "data/lentera.db"
    legacy_database: Path = SHARED / "database/lentera-legacy.db"
    mbtiles: Path = SHARED / "map-data/java-shortbread-1.0.mbtiles"
    host: str = "127.0.0.1"
    port: int = 4000
    osrm_url: str = "http://127.0.0.1:5000"
    node_id: str = "POSKO-01"

    @property
    def api_url(self):
        return f"http://{self.host}:{self.port}"

    @property
    def database_id(self):
        return hashlib.sha256(str(self.database.resolve()).encode()).hexdigest()

    @classmethod
    def load(cls, filename=None):
        path = Path(filename or os.getenv("LENTERA_CONFIG", ROOT / "lentera.toml"))
        values = {}
        if path.exists():
            values = tomllib.loads(path.read_text(encoding="utf-8")).get("lentera", {})
            for key in ("database", "legacy_database", "mbtiles"):
                if key in values:
                    p = Path(values[key]).expanduser()
                    values[key] = p if p.is_absolute() else path.resolve().parent / p
        return cls(**values)
