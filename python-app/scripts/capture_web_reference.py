"""Capture the preserved React UI from an isolated build, for visual comparison.

Requires artifacts/web-reference/dist, built separately; not part of Python runtime.
"""
from dataclasses import replace
from pathlib import Path
import sys
import threading
import time
from flask import send_from_directory
from waitress import create_server
from PySide6.QtCore import QUrl, QEventLoop, QTimer
from PySide6.QtWidgets import QApplication
from PySide6.QtWebEngineWidgets import QWebEngineView
from lentera.config import Config
from lentera.backend import create_app

root = Path(__file__).resolve().parent.parent
dist = root / "artifacts/web-reference/dist"
out = root / "artifacts/web-reference/screenshots"
out.mkdir(parents=True, exist_ok=True)
run = out / str(time.time_ns())
run.mkdir()
config = replace(Config(), database=run / "fixture.db", legacy_database=run / "none.db")
backend = create_app(config)
backend.extensions["accounts"].register(dict(username="stevie", password="stevie123", name="Operator SAR", role="Koordinator Lapangan"))
for i, (status, count, lat, lon) in enumerate((("BARU", 2, -6.25, 106.85), ("PROSES", 3, -6.26, 106.86), ("SELESAI", 1, None, None))):
    backend.extensions["reports"].upsert(dict(message_id=f"LNT-TEST-{i+1:03}", status=status, node_pengirim=f"NODE-{i+1:02}",
        victim_count=count, latitude=lat, longitude=lon))
backend.add_url_rule("/", "reference_root", lambda: send_from_directory(dist, "index.html"))
backend.add_url_rule("/<path:filename>", "reference_asset", lambda filename: send_from_directory(dist, filename))
server = create_server(backend, host="127.0.0.1", port=0)
threading.Thread(target=server.run, daemon=True).start()
app = QApplication(sys.argv[:1])
view = QWebEngineView()
view.resize(1280, 720)
view.show()
view.load(QUrl(f"http://127.0.0.1:{server.effective_port}/"))


def js(code):
    results = []
    view.page().runJavaScript(code, lambda result: results.append(result))
    end = time.monotonic()+10
    while not results and time.monotonic() < end:
        app.processEvents(); time.sleep(.02)
    return results[0] if results else None


def wait(predicate):
    end = time.monotonic()+20
    while time.monotonic() < end:
        app.processEvents()
        if predicate():
            return
        time.sleep(.05)
    raise AssertionError(js('document.body.innerText'))


def shot(name):
    loop = QEventLoop(); QTimer.singleShot(900, loop.quit); loop.exec()
    view.grab().save(str(out / name))


try:
    wait(lambda: js("!!document.querySelector('form')"))
    shot("login-1280.png")
    js("document.querySelector('form').requestSubmit(); true")
    wait(lambda: js("document.querySelectorAll('table tbody tr').length > 0"))
    shot("dashboard-1280.png")
    view.resize(1920, 1080)
    shot("dashboard-1920.png")
    view.resize(1280, 720)
    js("document.querySelector('table tbody button').click(); true")
    wait(lambda: js("document.body.innerText.includes('LENTERA CHANNEL SECURE')"))
    shot("detail-1280.png")
    print("Web reference screenshots:", out)
finally:
    view.close()
    server.close()
