"""Install the official Geofabrik Java Shortbread package, with resumable download."""
from contextlib import closing
from pathlib import Path
import os
import shutil
import sqlite3
import time
import urllib.request
from .maps import Tiles
from .services import ServiceError

JAVA_URL = "https://download.geofabrik.de/asia/indonesia/java-shortbread-1.0.mbtiles"


def download_java(destination, progress=print, open_url=None):
    destination = Path(destination)
    if destination.exists():
        meta = Tiles(destination).metadata()
        progress(f"Paket sudah tersedia: {destination}")
        return meta
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".part")
    offset = partial.stat().st_size if partial.exists() else 0
    headers = {"User-Agent": "LENTERA-OfflineMap/1.0"}
    if offset:
        headers["Range"] = f"bytes={offset}-"
    request = urllib.request.Request(JAVA_URL, headers=headers)
    open_url = open_url or urllib.request.urlopen
    progress(f"Sumber: {JAVA_URL}")
    with open_url(request, timeout=60) as response:
        if offset and response.status == 206:
            if not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
                raise ValueError("Posisi unduhan lanjutan tidak cocok")
        else:
            offset = 0  # Server without Range support: safely restart the partial file.
        length = response.headers.get("Content-Length")
        total = offset + int(length) if length else None
        needed = (total - offset) if total else 700 * 1024**2
        if shutil.disk_usage(destination.parent).free < needed + 100 * 1024**2:
            raise OSError("Ruang disk tidak cukup untuk paket peta Jawa")
        progress(f"Mengunduh ke {partial}; melanjutkan dari {offset / 1024**2:.1f} MiB")
        received, last_progress = offset, 0
        with partial.open("ab" if offset else "wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                received += len(chunk)
                if time.monotonic() - last_progress >= 10:
                    suffix = f" / {total / 1024**2:.1f} MiB" if total else " MiB"
                    progress(f"Peta: {received / 1024**2:.1f}{suffix}")
                    last_progress = time.monotonic()
            output.flush()
            os.fsync(output.fileno())
        if total and received != total:
            raise OSError("Unduhan belum lengkap; jalankan ulang untuk melanjutkan")
    progress("Memvalidasi SQLite dan skema Shortbread…")
    meta = Tiles(partial).metadata()
    with closing(sqlite3.connect(partial.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise ServiceError("Paket MBTiles rusak; file parsial dipertahankan untuk pemeriksaan")
        if not db.execute("SELECT 1 FROM tiles LIMIT 1").fetchone():
            raise ServiceError("Paket MBTiles tidak memiliki tile")
    partial.rename(destination)
    progress(f"Peta Jawa siap: {destination}")
    return meta
