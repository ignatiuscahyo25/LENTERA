"""Run native Qt + real HTTP/WebEngine smoke checks and capture review artifacts.

This uses isolated fixture data; it never connects to the operational database.
Run from the project root with .venv Python on a graphical desktop.
"""
from dataclasses import replace
from pathlib import Path
import json
import sys
import threading
import time
import urllib.request
from waitress import create_server
from PySide6.QtCore import QEventLoop, QTimer
from PySide6.QtGui import QFontDatabase
from PySide6.QtWidgets import QApplication, QMessageBox
from lentera.backend import create_app
from lentera.config import Config, ASSETS
from lentera.desktop.main import MainWindow
from lentera.radio.receiver import Receiver, SimulatedRadio


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "artifacts/desktop"
OUTPUT.mkdir(parents=True, exist_ok=True)
run_dir = OUTPUT / f"run-{time.time_ns()}"
run_dir.mkdir()
config = replace(Config(), database=run_dir / "fixture.db", legacy_database=run_dir / "none.db", port=0)
if "--require-map" in sys.argv and not config.mbtiles.exists():
    raise RuntimeError("Paket peta Jawa wajib tersedia untuk uji --require-map")
backend = create_app(config)
server = create_server(backend, host="127.0.0.1", port=0)
config = replace(config, port=server.effective_port)
thread = threading.Thread(target=server.run, daemon=True)
thread.start()
backend.extensions["accounts"].register(dict(username="operator", password="test-only", name="Operator SAR", role="Koordinator Lapangan"))
reports = backend.extensions["reports"]
for i, (status, count, lat, lon) in enumerate((("BARU", 2, -6.25, 106.85), ("PROSES", 3, -6.26, 106.86), ("SELESAI", 1, None, None))):
    reports.upsert(dict(message_id=f"LNT-TEST-{i+1:03}", status=status, node_pengirim=f"NODE-{i+1:02}",
                       victim_count=count, latitude=lat, longitude=lon, location_source="PHONE_GPS" if lat else "UNAVAILABLE"))

app = QApplication(sys.argv[:1])
for font in (ASSETS / "fonts").glob("*.ttf"):
    QFontDatabase.addApplicationFont(str(font))
app.setStyleSheet((ASSETS / "theme.qss").read_text(encoding="utf-8"))
window = MainWindow(config)
window.show()


def wait_until(predicate, timeout=12):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        app.processEvents()
        if predicate():
            return
        time.sleep(.02)
    raise AssertionError("Timed out waiting for UI/network")


def js(code, view=None):
    result = []
    (view or window.dashboard.map).page().runJavaScript(code, lambda value: result.append(value))
    wait_until(lambda: bool(result))
    return result[0]


def settle():
    loop = QEventLoop()
    QTimer.singleShot(600, loop.quit)
    loop.exec()


try:
    wait_until(lambda: window.connected)
    settle()
    window.grab().save(str(OUTPUT / "login-1280.png"))
    window.login.toggle_btn.click()
    for key, value in dict(username="registered", password="test-only", name="Operator Baru", role="SAR").items():
        window.login.fields[key].setText(value)
    settle()
    window.grab().save(str(OUTPUT / "register-1280.png"))
    window.login.submit_btn.click()
    wait_until(lambda: not window.login.registering)
    window.login.fields["username"].setText("operator")
    window.login.fields["password"].setText("test-only")
    window.login.submit_btn.click()
    wait_until(lambda: window.user is not None and len(window.reports) == 3)
    assert window.dashboard.metrics["victims"].text() == "6"
    window.dashboard.filter("PROSES")
    assert window.dashboard.model.rowCount() == 1
    window.dashboard.filter("SEMUA")
    window.dashboard.nav_buttons["reports"].click()
    assert window.dashboard.active_view == "reports"
    assert window.dashboard.pages.currentWidget() == window.dashboard.reports_area
    assert window.dashboard.reports_area.isAncestorOf(window.dashboard.table)
    assert window.dashboard.nav_buttons["reports"].isChecked()
    assert sum(btn.isChecked() for btn in window.dashboard.nav_buttons.values()) == 1
    window.dashboard.filter("PROSES")
    window.refresh()
    settle()
    assert window.dashboard.model.rowCount() == 1 and window.dashboard.active_view == "reports"
    window.grab().save(str(OUTPUT / "sos-1280.png"))
    window.dashboard.nav_buttons["map"].click()
    assert window.dashboard.pages.currentWidget() == window.dashboard.map_area
    assert window.dashboard.map_area.isAncestorOf(window.dashboard.map)
    assert window.dashboard.nav_buttons["map"].isChecked()
    if "--require-map" in sys.argv:
        wait_until(lambda: js("typeof ready !== 'undefined' && ready") is True)
        js("map.jumpTo({center:[106.85,-6.25],zoom:14}); true")
        wait_until(lambda: js("map.querySourceFeatures('shortbread',{sourceLayer:'streets'}).length > 0") is True, timeout=30)
        print("PASS: real Jawa MBTiles streets rendered in WebEngine (no internet tile source)", flush=True)
    settle()
    window.grab().save(str(OUTPUT / "operations-1280.png"))
    window.dashboard.nav_buttons["dashboard"].click()
    assert window.dashboard.pages.currentWidget() == window.dashboard.area
    assert window.dashboard.area.isAncestorOf(window.dashboard.table)
    assert window.dashboard.area.isAncestorOf(window.dashboard.map)
    wait_until(lambda: js("typeof ready !== 'undefined' && ready") is True)
    wait_until(lambda: js("markers.length") == 2)
    settle()
    window.grab().save(str(OUTPUT / "dashboard-1280.png"))
    window.resize(1920, 1080)
    settle()
    window.grab().save(str(OUTPUT / "dashboard-1920.png"))
    window.resize(1280, 720)
    settle()
    window.dashboard.map.page().runJavaScript("bridge.reportSelected(1)")
    wait_until(lambda: window.stack.currentWidget() == window.detail)
    window.detail.update_status("PROSES")
    wait_until(lambda: window.detail.report["status"] == "PROSES")
    window.detail.copy_coordinates()
    assert app.clipboard().text() == "-6.25, 106.85"
    wait_until(lambda: js("typeof ready !== 'undefined' && ready", window.detail.map) is True)
    settle()
    window.grab().save(str(OUTPUT / "detail-1280.png"))
    js("window.chooseStart(); map.fire('click',{lngLat:{lng:106.8,lat:-6.25},originalEvent:{target:map.getCanvas()}}); true", window.detail.map)
    wait_until(lambda: window.detail.start is not None)
    window.detail.find_route()
    wait_until(lambda: not window.detail.route_busy)
    assert "OSRM" in window.detail.route_label.text()
    window.show_settings()
    assert window.dashboard.pages.currentWidget() == window.settings
    assert window.dashboard.nav_buttons["settings"].isChecked()
    assert sum(btn.isChecked() for btn in window.dashboard.nav_buttons.values()) == 1
    window.settings.fields["station_name"].setText("Posko Jawa Test")
    window.settings.save()
    wait_until(lambda: window.station == "Posko Jawa Test")
    settle()
    window.grab().save(str(OUTPUT / "settings-1280.png"))
    original_question = QMessageBox.question
    QMessageBox.question = lambda *a, **k: QMessageBox.Yes
    window.logout()
    assert window.user is None
    raw = json.dumps(dict(type="SOS_REPORT", message_id="LNT-TEST-UI-CLOSED", node_pengirim="NODE-TEST",
              victim_count=1, latitude=None, longitude=None, location_source="UNAVAILABLE")).encode()
    def save(payload):
        from lentera.radio.receiver import post_json
        return post_json(config.api_url + "/api/reports", payload)
    receiver = Receiver(SimulatedRadio(), save)
    assert receiver.handle(raw, -70)
    window.close()
    receiver.handle(raw.replace(b'UI-CLOSED', b'AFTER-CLOSE'), -70)
    assert len(reports.list()) == 5
    print("PASS: native navigation/pages/highlights/registration/login/filter/metrics/map bridge/markers/status/copy coordinates/OSRM failure/settings/logout/closed UI reception")
    print("Screenshots:", OUTPUT)
    print("Fixture DB:", config.database)
finally:
    print("Map diagnostics:", js("JSON.stringify({url:location.href,notice:document.body.innerText,ready:typeof ready !== 'undefined' && ready,maplibre:typeof maplibregl,qt:typeof qt,channel:typeof QWebChannel,bridge:typeof bridge})"), flush=True)
    window.grab().save(str(OUTPUT / "latest.png"))
    window.close()
    server.close()
    app.processEvents()
