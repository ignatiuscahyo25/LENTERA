import csv
import hmac
import math
import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

STATUSES = ("BARU", "PROSES", "SELESAI")
CSV_HEADER = ["ID_Laporan", "Waktu", "Status", "Node", "Latitude", "Longitude",
              "Jumlah_Korban", "Total_Sinyal", "Sumber_Lokasi", "Akurasi_Lokasi"]


class ServiceError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def now_values():
    now = datetime.now().astimezone()
    return now.isoformat(timespec="seconds"), now.strftime("%H:%M:%S")


def normalize_status(value):
    return str(value or "").strip().upper()


def number(value, name, lower, upper):
    if isinstance(value, bool):
        raise ServiceError(f"{name} tidak valid")
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ServiceError(f"{name} tidak valid") from None
    if not math.isfinite(result) or not lower <= result <= upper:
        raise ServiceError(f"{name} di luar rentang valid")
    return result


def validate_report(data):
    mid = data.get("message_id")
    status = normalize_status(data.get("status"))
    if not isinstance(mid, str) or not mid.startswith("LNT-") or len(mid) > 128:
        raise ServiceError("Format message_id tidak valid")
    if status not in STATUSES:
        raise ServiceError("Status tidak valid")
    receiver = data.get("node_penerima") or data.get("node_pengirim")
    sender = data.get("node_pengirim") or receiver
    if not isinstance(receiver, str) or not receiver or not isinstance(sender, str):
        raise ServiceError("Informasi node tidak tersedia")
    count = data.get("victim_count", 1)
    if isinstance(count, bool):
        raise ServiceError("Jumlah korban harus bilangan bulat minimal 1")
    try:
        parsed = int(count)
        if parsed < 1 or parsed > 2**31 - 1 or float(count) != parsed:
            raise ValueError()
    except (ValueError, TypeError, OverflowError):
        raise ServiceError("Jumlah korban harus bilangan bulat minimal 1") from None
    lat, lon = data.get("latitude"), data.get("longitude")
    has_lat, has_lon = lat not in (None, ""), lon not in (None, "")
    if has_lat != has_lon:
        raise ServiceError("Latitude dan longitude harus tersedia bersamaan")
    accuracy = None
    if has_lat:
        lat, lon = number(lat, "Latitude", -90, 90), number(lon, "Longitude", -180, 180)
        if data.get("location_accuracy") not in (None, ""):
            accuracy = number(data["location_accuracy"], "Akurasi lokasi", 0, 1e9)
    else:
        lat = lon = None
    source = str(data.get("location_source") or ("PHONE_GPS" if has_lat else "UNAVAILABLE")).upper()
    return dict(message_id=mid, status=status, node_penerima=receiver, node_pengirim=sender,
                victim_count=parsed, latitude=lat, longitude=lon,
                location_accuracy=accuracy, location_source=source)


class Reports:
    def __init__(self, database):
        self.db = database

    def list(self):
        with self.db.connect() as db:
            return [dict(r) for r in db.execute("SELECT * FROM reports ORDER BY id DESC")]

    def detail(self, report_id):
        with self.db.connect() as db:
            row = db.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
            if not row:
                raise ServiceError("Laporan tidak ditemukan", 404)
            return dict(row)

    def logs(self, mid):
        with self.db.connect() as db:
            return [dict(r) for r in db.execute("SELECT * FROM report_logs WHERE message_id=? ORDER BY id", (mid,))]

    def upsert(self, data):
        values = validate_report(data)
        timestamp, waktu = now_values()
        mid = values["message_id"]
        with self.db.connect(write=True) as db:
            old = db.execute("SELECT * FROM reports WHERE message_id=?", (mid,)).fetchone()
            if old:
                values.pop("status")  # An incoming retransmission never resets operator status.
                if values["latitude"] is None and old["latitude"] is not None and old["longitude"] is not None:
                    for key in ("latitude", "longitude", "location_accuracy", "location_source"):
                        values[key] = old[key]
                keys = [k for k in values if k != "message_id"]
                query = ", ".join(f"{k}=?" for k in keys)
                db.execute(f"UPDATE reports SET {query}, last_seen=?, duplicate_count=COALESCE(duplicate_count,1)+1 WHERE message_id=?",
                           [values[k] for k in keys] + [timestamp, mid])
            else:
                values.update(waktu=waktu, created_at=timestamp, last_seen=timestamp, duplicate_count=1)
                keys = list(values)
                db.execute(f"INSERT INTO reports ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})", list(values.values()))
            row = dict(db.execute("SELECT * FROM reports WHERE message_id=?", (mid,)).fetchone())
        return dict(success=True, duplicate=bool(old), updated=bool(old), report=row,
                    message="Laporan diperbarui" if old else "Laporan SOS baru berhasil disimpan")

    def status(self, mid, status):
        status = normalize_status(status)
        if status not in STATUSES:
            raise ServiceError("Status tidak valid")
        with self.db.connect(write=True) as db:
            old = db.execute("SELECT * FROM reports WHERE message_id=?", (mid,)).fetchone()
            if not old:
                raise ServiceError("Laporan tidak ditemukan", 404)
            if normalize_status(old["status"]) == status:
                return dict(success=True, changed=0, report=dict(old), message="Status tidak berubah")
            db.execute("UPDATE reports SET status=? WHERE message_id=?", (status, mid))
            timestamp, waktu = now_values()
            messages = {"BARU": "Laporan kembali masuk ke antrean awal.",
                        "PROSES": "Tim SAR sedang memproses laporan dan menuju koordinat korban.",
                        "SELESAI": "Penanganan laporan telah diselesaikan oleh operator SAR."}
            log = dict(message_id=mid, waktu=waktu, message=f"Status laporan diubah menjadi {status}. {messages[status]}",
                       source="SAR Mission Control", created_at=timestamp)
            cur = db.execute("INSERT INTO report_logs(message_id,waktu,message,source,created_at) VALUES (?,?,?,?,?)", list(log.values()))
            log["id"] = cur.lastrowid
            row = dict(db.execute("SELECT * FROM reports WHERE message_id=?", (mid,)).fetchone())
        return dict(success=True, changed=1, report=row, log=log, message="Status laporan berhasil diperbarui")

    def delete(self, mid):
        with self.db.connect(write=True) as db:
            old = db.execute("SELECT status FROM reports WHERE message_id=?", (mid,)).fetchone()
            if not old:
                raise ServiceError("Laporan tidak ditemukan", 404)
            if normalize_status(old["status"]) != "SELESAI":
                raise ServiceError("Laporan hanya dapat dihapus setelah status SELESAI", 409)
            db.execute("DELETE FROM report_logs WHERE message_id=?", (mid,))
            db.execute("DELETE FROM reports WHERE message_id=?", (mid,))
        return dict(success=True, message="Laporan berhasil dihapus")


class Accounts:
    def __init__(self, database):
        self.db = database

    def register(self, data):
        values = [data.get(k) for k in ("username", "password", "name", "role")]
        if not all(isinstance(v, str) and v.strip() for v in values):
            raise ServiceError("Semua field wajib diisi")
        username, password, name, role = values
        try:
            with self.db.connect(write=True) as db:
                db.execute("INSERT INTO users(username,password,name,role) VALUES (?,?,?,?)",
                           (username.strip(), generate_password_hash(password), name.strip(), role.strip()))
        except sqlite3.IntegrityError:
            raise ServiceError("Username sudah digunakan", 409) from None
        return dict(success=True, message="Akun berhasil dibuat. Silakan login.")

    def login(self, data):
        username, password = data.get("username"), data.get("password")
        if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
            raise ServiceError("Username dan password wajib diisi")
        with self.db.connect(write=True) as db:
            row = db.execute("SELECT * FROM users WHERE username=?", (username.strip(),)).fetchone()
            hashed = bool(row and row["password"].startswith(("scrypt:", "pbkdf2:")))
            valid = row and (check_password_hash(row["password"], password) if hashed else
                             hmac.compare_digest(row["password"].encode(), password.encode()))
            if not valid:
                raise ServiceError("Username atau password salah", 401)
            if not hashed:
                db.execute("UPDATE users SET password=? WHERE id=?", (generate_password_hash(password), row["id"]))
            user = {k: row[k] for k in ("id", "username", "name", "role")}
        return dict(success=True, message="Login berhasil", user=user)

    def users(self):
        with self.db.connect() as db:
            return [dict(r) for r in db.execute("SELECT id,username,name,role FROM users ORDER BY id DESC")]

    def settings(self):
        with self.db.connect() as db:
            return dict(db.execute("SELECT key,value FROM settings").fetchall())

    def save_settings(self, data):
        if not all(isinstance(data.get(k), str) and data[k].strip() for k in ("name", "role", "station_name")):
            raise ServiceError("Nama, role, dan nama posko wajib diisi")
        with self.db.connect(write=True) as db:
            if not db.execute("SELECT id FROM users WHERE id=?", (data.get("user_id"),)).fetchone():
                raise ServiceError("Pengguna tidak ditemukan", 404)
            db.execute("UPDATE users SET name=?,role=? WHERE id=?", (data["name"].strip(), data["role"].strip(), data["user_id"]))
            db.execute("INSERT OR REPLACE INTO settings VALUES ('station_name',?)", (data["station_name"].strip(),))
        return dict(success=True, message="Pengaturan disimpan")


def export_csv(reports, stream):
    writer = csv.writer(stream)
    writer.writerow(CSV_HEADER)
    for r in reports:  # Match the web dashboard: export all reports, irrespective of the active filter.
        row = [r["message_id"], r["waktu"], normalize_status(r["status"]), r.get("node_pengirim") or r["node_penerima"],
               r["latitude"], r["longitude"], r["victim_count"], r.get("duplicate_count", 1),
               r.get("location_source", "UNAVAILABLE"), r.get("location_accuracy")]
        writer.writerow(row)
