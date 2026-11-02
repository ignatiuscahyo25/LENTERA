import logging
import threading
import time
import sqlite3
from flask import Flask, jsonify, request, send_from_directory, Response
from .config import ASSETS
from .storage import Database
from .services import Reports, Accounts, ServiceError
from .maps import Tiles, route


class ReceiverState:
    def __init__(self):
        self.lock = threading.Lock()
        self.last = 0
        self.values = dict(ready=False, mode="hardware", last_packet=None, last_error=None)

    def update(self, data):
        with self.lock:
            self.last = time.monotonic()
            for key in self.values:
                if key in data:
                    self.values[key] = data[key]

    def read(self):
        with self.lock:
            alive = self.last > 0 and time.monotonic() - self.last < 15
            return dict(self.values, alive=alive, ready=bool(alive and self.values["ready"]),
                        heartbeat_age=round(time.monotonic() - self.last, 1) if self.last else None)


def create_app(config):
    db = Database(config.database)
    db.initialize(config.legacy_database)
    reports, accounts, tiles, receiver = Reports(db), Accounts(db), Tiles(config.mbtiles), ReceiverState()
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
    app.extensions.update(database=db, reports=reports, accounts=accounts, receiver=receiver)

    @app.errorhandler(ServiceError)
    def service_error(exc):
        return jsonify(success=False, message=str(exc)), exc.status

    @app.errorhandler(sqlite3.Error)
    def storage_error(exc):
        logging.exception("Database operation failed")
        return jsonify(success=False, message="Penyimpanan database gagal. Periksa log layanan."), 503

    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise ServiceError("Body wajib berupa objek JSON")
        return data

    app.add_url_rule("/api/reports", "reports", lambda: jsonify(reports.list()))
    app.add_url_rule("/api/reports/detail/<int:report_id>", "detail", lambda report_id: jsonify(reports.detail(report_id)))
    app.add_url_rule("/api/reports/<message_id>/logs", "logs", lambda message_id: jsonify(reports.logs(message_id)))
    app.add_url_rule("/api/reports", "upsert", lambda: jsonify(reports.upsert(body())), methods=["POST"])
    app.add_url_rule("/api/reports/<message_id>/status", "status", lambda message_id: jsonify(reports.status(message_id, body().get("status"))), methods=["PATCH"])
    app.add_url_rule("/api/reports/<message_id>", "delete", lambda message_id: jsonify(reports.delete(message_id)), methods=["DELETE"])
    app.add_url_rule("/api/login", "login", lambda: jsonify(accounts.login(body())), methods=["POST"])
    app.add_url_rule("/api/register", "register", lambda: jsonify(accounts.register(body())), methods=["POST"])
    app.add_url_rule("/api/users", "users", lambda: jsonify(accounts.users()))
    app.add_url_rule("/api/settings", "settings", lambda: jsonify(accounts.settings()))
    app.add_url_rule("/api/settings", "save_settings", lambda: jsonify(accounts.save_settings(body())), methods=["PATCH"])

    @app.post("/api/receiver/heartbeat")
    def heartbeat():
        data = body()
        if type(data.get("ready")) is not bool or data.get("mode") not in ("hardware", "simulation"):
            raise ServiceError("Heartbeat tidak valid")
        receiver.update(data)
        return jsonify(success=True)

    @app.get("/api/system")
    def system():
        try:
            meta = tiles.metadata()
            map_status = dict(available=True, name=meta.get("name", "Jawa Shortbread"), message="Peta Jawa tersedia")
        except ServiceError as exc:
            map_status = dict(available=False, message=str(exc))
        return jsonify(receiver=receiver.read(), map=map_status, server="Python · Raspberry Pi / localhost", mode="Offline Local Network")

    @app.get("/map/<path:filename>")
    def map_asset(filename):
        return send_from_directory(ASSETS / "map", filename)

    @app.get("/map/fonts/<path:filename>")
    def map_font(filename):
        return send_from_directory(ASSETS / "fonts", filename)

    @app.get("/map/tiles/<int:z>/<int:x>/<int:y>.pbf")
    def tile(z, x, y):
        data = tiles.tile(z, x, y)
        result = Response(data, status=200 if data else 204, mimetype="application/vnd.mapbox-vector-tile")
        if data.startswith(b"\x1f\x8b"):
            result.headers["Content-Encoding"] = "gzip"
        result.headers["Cache-Control"] = "public, max-age=3600"
        return result

    @app.post("/api/route")
    def get_route():
        return jsonify(route(config.osrm_url, body()))

    @app.get("/api")
    def info():
        return jsonify(name="LENTERA Python", version="1.0.0", database_id=config.database_id)

    return app


def serve(config):
    from waitress import serve as run
    run(create_app(config), host=config.host, port=config.port, threads=6)
