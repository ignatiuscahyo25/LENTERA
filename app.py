from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "lentera.db"
DIST_DIR = BASE_DIR / "dist"

app = Flask(__name__, static_folder=None)
CORS(app)

PORT = int(os.getenv("PORT", "4000"))


def db_connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def now_values():
    now = datetime.now()
    return now.isoformat(timespec="seconds"), now.strftime("%H:%M:%S")


def normalize_status(status):
    lower = str(status or "").lower()
    if "baru" in lower:
        return "BARU"
    if "proses" in lower:
        return "PROSES"
    if "selesai" in lower:
        return "SELESAI"
    return str(status or "").upper()


def operator_log_message(status):
    s = normalize_status(status)
    if s == "PROSES":
        return (
            "Status laporan diubah menjadi PROSES. "
            "Tim SAR sedang memproses laporan dan menuju koordinat korban."
        )
    if s == "SELESAI":
        return (
            "Status laporan diubah menjadi SELESAI. "
            "Penanganan laporan telah diselesaikan oleh operator SAR."
        )
    return (
        "Status laporan diubah menjadi BARU. "
        "Laporan kembali masuk ke antrean awal."
    )


def row_to_dict(row):
    return dict(row) if row is not None else None


def init_db():
    with db_connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT NOT NULL UNIQUE,
                waktu TEXT NOT NULL,
                status TEXT NOT NULL,
                node_penerima TEXT NOT NULL,
                node_pengirim TEXT,
                latitude REAL,
                longitude REAL,
                victim_count INTEGER NOT NULL DEFAULT 1,
                location_accuracy REAL,
                location_source TEXT NOT NULL DEFAULT 'UNAVAILABLE',
                created_at TEXT,
                last_seen TEXT,
                duplicate_count INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS report_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT NOT NULL,
                waktu TEXT NOT NULL,
                message TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL
            );
            """
        )

        count = db.execute("SELECT COUNT(*) AS total FROM users").fetchone()["total"]
        if count == 0:
            db.execute(
                """
                INSERT INTO users (username, password, name, role)
                VALUES (?, ?, ?, ?)
                """,
                ("admin", "admin123", "Admin User", "Koordinator Lapangan"),
            )


@app.get("/api/reports")
def get_reports():
    with db_connect() as db:
        rows = db.execute(
            "SELECT * FROM reports ORDER BY id DESC"
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.get("/api/reports/detail/<int:report_id>")
def get_report_detail(report_id):
    with db_connect() as db:
        row = db.execute(
            "SELECT * FROM reports WHERE id = ?",
            (report_id,),
        ).fetchone()

    if row is None:
        return jsonify(
            success=False,
            message="Laporan tidak ditemukan",
        ), 404

    return jsonify(dict(row))


@app.get("/api/reports/<message_id>/logs")
def get_report_logs(message_id):
    with db_connect() as db:
        rows = db.execute(
            """
            SELECT *
            FROM report_logs
            WHERE message_id = ?
            ORDER BY id ASC
            """,
            (message_id,),
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/reports")
def create_or_update_report():
    data = request.get_json(silent=True) or {}

    message_id = data.get("message_id")
    status = data.get("status")
    node_penerima = data.get("node_penerima")
    node_pengirim = data.get("node_pengirim")

    if not message_id or not status:
        return jsonify(
            success=False,
            message="message_id dan status wajib diisi",
        ), 400

    if not str(message_id).startswith("LNT-"):
        return jsonify(
            success=False,
            message="Format message_id tidak valid",
        ), 400

    final_node_penerima = node_penerima or node_pengirim
    final_node_pengirim = node_pengirim or node_penerima

    if not final_node_penerima or not final_node_pengirim:
        return jsonify(
            success=False,
            message="Informasi node tidak tersedia",
        ), 400

    victim_count = data.get("victim_count")
    if victim_count in (None, ""):
        victim_count = 1

    try:
        victim_count = int(victim_count)
    except (TypeError, ValueError):
        return jsonify(
            success=False,
            message="Jumlah korban harus berupa bilangan bulat minimal 1",
        ), 400

    if victim_count < 1:
        return jsonify(
            success=False,
            message="Jumlah korban harus berupa bilangan bulat minimal 1",
        ), 400

    latitude = data.get("latitude")
    longitude = data.get("longitude")

    has_lat = latitude not in (None, "")
    has_lon = longitude not in (None, "")

    if has_lat != has_lon:
        return jsonify(
            success=False,
            message="Latitude dan longitude harus tersedia bersamaan",
        ), 400

    latitude_number = None
    longitude_number = None
    accuracy_number = None

    if has_lat and has_lon:
        try:
            latitude_number = float(latitude)
            longitude_number = float(longitude)
        except (TypeError, ValueError):
            return jsonify(
                success=False,
                message="Latitude atau longitude tidak valid",
            ), 400

        if not (-90 <= latitude_number <= 90):
            return jsonify(
                success=False,
                message="Latitude di luar rentang valid",
            ), 400

        if not (-180 <= longitude_number <= 180):
            return jsonify(
                success=False,
                message="Longitude di luar rentang valid",
            ), 400

        acc = data.get("location_accuracy")
        if acc not in (None, ""):
            try:
                accuracy_number = float(acc)
            except (TypeError, ValueError):
                return jsonify(
                    success=False,
                    message="location_accuracy tidak valid",
                ), 400

    location_source = str(data.get("location_source") or "").strip().upper()
    if not location_source:
        location_source = "PHONE_GPS" if has_lat else "UNAVAILABLE"

    normalized_incoming_status = normalize_status(status)
    if normalized_incoming_status not in {"BARU", "PROSES", "SELESAI"}:
        normalized_incoming_status = "BARU"

    created_at, waktu = now_values()

    with db_connect() as db:
        existing = db.execute(
            "SELECT * FROM reports WHERE message_id = ? LIMIT 1",
            (message_id,),
        ).fetchone()

        if existing is None:
            db.execute(
                """
                INSERT INTO reports (
                    message_id, waktu, status,
                    node_penerima, node_pengirim,
                    latitude, longitude, victim_count,
                    location_accuracy, location_source,
                    created_at, last_seen, duplicate_count
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    message_id,
                    waktu,
                    normalized_incoming_status,
                    final_node_penerima,
                    final_node_pengirim,
                    latitude_number,
                    longitude_number,
                    victim_count,
                    accuracy_number,
                    location_source,
                    created_at,
                    created_at,
                ),
            )
            duplicate = False
        else:
            # Keep operator status. Incoming repeated packet updates victim/location data.
            old_lat = existing["latitude"]
            old_lon = existing["longitude"]
            old_accuracy = existing["location_accuracy"]
            old_location_source = existing["location_source"]

            new_lat = latitude_number if has_lat else old_lat
            new_lon = longitude_number if has_lon else old_lon
            new_accuracy = accuracy_number if has_lat else old_accuracy

            if has_lat:
                new_location_source = location_source
            elif old_lat is not None and old_lon is not None:
                new_location_source = old_location_source
            else:
                new_location_source = location_source

            db.execute(
                """
                UPDATE reports
                SET node_penerima = ?,
                    node_pengirim = ?,
                    latitude = ?,
                    longitude = ?,
                    victim_count = ?,
                    location_accuracy = ?,
                    location_source = ?,
                    last_seen = ?,
                    duplicate_count = COALESCE(duplicate_count, 1) + 1
                WHERE message_id = ?
                """,
                (
                    final_node_penerima,
                    final_node_pengirim,
                    new_lat,
                    new_lon,
                    victim_count,
                    new_accuracy,
                    new_location_source,
                    created_at,
                    message_id,
                ),
            )
            duplicate = True

        report = db.execute(
            "SELECT * FROM reports WHERE message_id = ? LIMIT 1",
            (message_id,),
        ).fetchone()

    return jsonify(
        success=True,
        duplicate=duplicate,
        updated=duplicate,
        message=(
            "Laporan yang sama berhasil diperbarui."
            if duplicate
            else "Laporan SOS baru berhasil disimpan."
        ),
        report=dict(report),
    )


@app.patch("/api/reports/<message_id>/status")
def update_status(message_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")

    if not status:
        return jsonify(
            success=False,
            message="Status wajib diisi",
        ), 400

    normalized = normalize_status(status)
    if normalized not in {"BARU", "PROSES", "SELESAI"}:
        return jsonify(
            success=False,
            message="Status tidak valid",
        ), 400

    with db_connect() as db:
        existing = db.execute(
            "SELECT * FROM reports WHERE message_id = ? LIMIT 1",
            (message_id,),
        ).fetchone()

        if existing is None:
            return jsonify(
                success=False,
                message="Laporan tidak ditemukan",
            ), 404

        db.execute(
            "UPDATE reports SET status = ? WHERE message_id = ?",
            (normalized, message_id),
        )

        created_at, waktu = now_values()
        log_message = operator_log_message(normalized)

        cursor = db.execute(
            """
            INSERT INTO report_logs (
                message_id, waktu, message, source, created_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                message_id,
                waktu,
                log_message,
                "SAR Mission Control",
                created_at,
            ),
        )

        updated = db.execute(
            "SELECT * FROM reports WHERE message_id = ? LIMIT 1",
            (message_id,),
        ).fetchone()

    return jsonify(
        success=True,
        message="Status laporan berhasil diperbarui",
        changed=1,
        report=dict(updated),
        log={
            "id": cursor.lastrowid,
            "message_id": message_id,
            "waktu": waktu,
            "message": log_message,
            "source": "SAR Mission Control",
            "created_at": created_at,
        },
    )


@app.delete("/api/reports/<message_id>")
def delete_report(message_id):
    with db_connect() as db:
        existing = db.execute(
            "SELECT id FROM reports WHERE message_id = ?",
            (message_id,),
        ).fetchone()

        if existing is None:
            return jsonify(
                success=False,
                message="Laporan tidak ditemukan",
            ), 404

        db.execute(
            "DELETE FROM report_logs WHERE message_id = ?",
            (message_id,),
        )
        db.execute(
            "DELETE FROM reports WHERE message_id = ?",
            (message_id,),
        )

    return jsonify(
        success=True,
        message=f"Laporan {message_id} berhasil dihapus",
    )


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify(
            success=False,
            message="Username dan password wajib diisi",
        ), 400

    with db_connect() as db:
        user = db.execute(
            """
            SELECT id, username, name, role
            FROM users
            WHERE username = ? AND password = ?
            """,
            (username, password),
        ).fetchone()

    if user is None:
        return jsonify(
            success=False,
            message="Username atau password salah",
        ), 401

    return jsonify(
        success=True,
        message="Login berhasil",
        user=dict(user),
    )


@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}

    username = data.get("username")
    password = data.get("password")
    name = data.get("name")
    role = data.get("role")

    if not username or not password or not name or not role:
        return jsonify(
            success=False,
            message="Semua field wajib diisi",
        ), 400

    try:
        with db_connect() as db:
            existing = db.execute(
                "SELECT id FROM users WHERE username = ?",
                (username,),
            ).fetchone()

            if existing is not None:
                return jsonify(
                    success=False,
                    message="Username sudah digunakan",
                ), 409

            db.execute(
                """
                INSERT INTO users (username, password, name, role)
                VALUES (?, ?, ?, ?)
                """,
                (username, password, name, role),
            )

    except sqlite3.IntegrityError:
        return jsonify(
            success=False,
            message="Username sudah digunakan",
        ), 409

    return jsonify(
        success=True,
        message="Akun berhasil dibuat",
    )


@app.get("/api/users")
def get_users():
    with db_connect() as db:
        rows = db.execute(
            """
            SELECT id, username, name, role
            FROM users
            ORDER BY id DESC
            """
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.get("/api")
def api_info():
    return """
    <h1>LENTERA API Server - Python</h1>
    <p>Backend Python/Flask berjalan.</p>
    <ul>
      <li><a href="/api/reports">/api/reports</a></li>
      <li><a href="/api/users">/api/users</a></li>
    </ul>
    """


@app.get("/")
def root():
    if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
        return send_from_directory(DIST_DIR, "index.html")

    return f"""
    <h1>LENTERA Python Backend</h1>
    <p>Backend aktif di port {PORT}.</p>
    <p>Frontend belum dibuild ke folder <code>dist</code>.</p>
    <p><a href="/api">Buka API</a></p>
    """


@app.get("/<path:path>")
def frontend_files(path):
    if DIST_DIR.exists():
        candidate = DIST_DIR / path
        if candidate.exists() and candidate.is_file():
            return send_from_directory(DIST_DIR, path)

        index_file = DIST_DIR / "index.html"
        if index_file.exists():
            return send_from_directory(DIST_DIR, "index.html")

    return jsonify(
        success=False,
        message="Frontend dist belum tersedia",
    ), 404


if __name__ == "__main__":
    init_db()
    print(f"[LENTERA] Database: {DB_PATH}")
    print(f"[LENTERA] Python backend: http://0.0.0.0:{PORT}")
    app.run(
        host="0.0.0.0",
        port=PORT,
        debug=False,
        threaded=True,
    )
