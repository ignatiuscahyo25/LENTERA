import csv
import io
import sqlite3
from concurrent.futures import ThreadPoolExecutor
import pytest
from lentera.storage import Database, backup_database
from lentera.services import Reports, export_csv


def test_report_lifecycle_and_repeat_preserves_operator_and_location(client, packet):
    first = client.post("/api/reports", json=packet).get_json()
    assert first["success"] and not first["duplicate"]
    mid = packet["message_id"]
    assert client.delete(f"/api/reports/{mid}").status_code == 409
    assert client.patch(f"/api/reports/{mid}/status", json={"status": "Proses"}).get_json()["changed"] == 1
    assert client.patch(f"/api/reports/{mid}/status", json={"status": "PROSES"}).get_json()["changed"] == 0
    updated = client.post("/api/reports", json=dict(packet, latitude=None, longitude=None,
             location_accuracy=None, location_source="UNAVAILABLE", victim_count=4)).get_json()["report"]
    assert updated["latitude"] == packet["latitude"]
    assert updated["location_source"] == "PHONE_GPS"
    assert updated["status"] == "PROSES" and updated["victim_count"] == 4
    assert updated["duplicate_count"] == 2
    assert updated["created_at"] == first["report"]["created_at"]
    assert client.get(f"/api/reports/detail/{updated['id']}").get_json() == updated
    assert len(client.get(f"/api/reports/{mid}/logs").get_json()) == 1
    client.patch(f"/api/reports/{mid}/status", json={"status": "SELESAI"})
    assert client.delete(f"/api/reports/{mid}").status_code == 200
    assert client.get("/api/reports").get_json() == []
    assert client.get(f"/api/reports/{mid}/logs").get_json() == []


@pytest.mark.parametrize("changes", [dict(latitude=None), dict(victim_count=0), dict(victim_count=2.5),
    dict(victim_count=True), dict(latitude=91), dict(longitude=-181), dict(location_accuracy=-1),
    dict(location_accuracy=float('inf')), dict(latitude=float('nan')), dict(status="nope"), dict(message_id="bad")])
def test_validation(client, packet, changes):
    assert client.post("/api/reports", json=dict(packet, **changes)).status_code == 400
    assert client.get("/api/reports").get_json() == []


def test_json_object_required(client):
    assert client.post("/api/reports", json=[]).status_code == 400


def test_concurrent_same_message_is_atomic(app, packet):
    reports = app.extensions["reports"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: reports.upsert(packet), range(12)))
    assert sum(not r["duplicate"] for r in results) == 1
    assert reports.list()[0]["duplicate_count"] == 12


def test_legacy_copy_and_schema_idempotent(config, packet):
    legacy = Database(config.legacy_database)
    legacy.initialize()
    original = Reports(legacy).upsert(packet)["report"]
    before = config.legacy_database.read_bytes()
    new = Database(config.database)
    new.initialize(config.legacy_database)
    new.initialize(config.legacy_database)
    assert Reports(new).list() == [original]
    assert not backup_database(config.legacy_database, config.database)
    assert config.legacy_database.read_bytes() == before
    with new.connect() as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 1
        assert db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"


def test_hash_new_password_and_upgrade_legacy(client, app):
    db = app.extensions["database"]
    with db.connect(write=True) as conn:
        conn.execute("INSERT INTO users(username,password,name,role) VALUES ('old','legacy','Operator','SAR')")
    assert client.post("/api/login", json=dict(username="old", password="wrong")).status_code == 401
    assert client.post("/api/login", json=dict(username="old", password="legacy")).status_code == 200
    with db.connect() as conn:
        assert conn.execute("SELECT password FROM users WHERE username='old'").fetchone()[0].startswith("scrypt:")
    account = dict(username="new", password="secret", name="Operator", role="SAR")
    assert client.post("/api/register", json=account).status_code == 200
    assert client.post("/api/register", json=account).status_code == 409
    user = client.post("/api/login", json=account).get_json()["user"]
    assert "password" not in user
    settings = dict(user_id=user["id"], name="Nama baru", role="Koordinator", station_name="Posko Jawa")
    assert client.patch("/api/settings", json=settings).status_code == 200
    assert client.get("/api/settings").get_json()["station_name"] == "Posko Jawa"
    assert client.post("/api/login", json=account).get_json()["user"]["name"] == "Nama baru"


def test_status_and_expired_heartbeat(client, app, monkeypatch):
    assert not client.get("/api/system").get_json()["receiver"]["alive"]
    assert client.post("/api/receiver/heartbeat", json=dict(ready=True, mode="hardware")).status_code == 200
    state = client.get("/api/system").get_json()
    assert state["receiver"]["ready"]
    assert not state["map"]["available"]
    receiver = app.extensions["receiver"]
    receiver.last -= 16
    assert not client.get("/api/system").get_json()["receiver"]["ready"]


def test_csv_roundtrip(client, packet):
    packet["node_pengirim"] = 'NODE-01,"test"'
    client.post("/api/reports", json=packet)
    stream = io.StringIO(newline="")
    export_csv(client.get("/api/reports").get_json(), stream)
    rows = list(csv.reader(io.StringIO(stream.getvalue())))
    assert len(rows[0]) == len(rows[1]) == 10
    assert rows[1][3] == packet["node_pengirim"]


def test_database_failure_is_not_success(client, app, packet, monkeypatch):
    def fail(_):
        raise sqlite3.OperationalError("disk full")
    monkeypatch.setattr(app.extensions["reports"], "upsert", fail)
    response = client.post("/api/reports", json=packet)
    assert response.status_code == 503 and not response.get_json()["success"]
