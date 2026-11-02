import sys
from pathlib import Path
from PySide6.QtCore import QTimer
from PySide6.QtGui import QFontDatabase, QIcon
from PySide6.QtWidgets import QApplication, QMainWindow, QStackedWidget, QFileDialog, QMessageBox
from .network import Api
from .screens import LoginScreen, DashboardScreen, DetailScreen, SettingsScreen
from .widgets import display_time
from ..config import ASSETS
from ..services import export_csv


class MainWindow(QMainWindow):
    def __init__(self, config):
        super().__init__()
        self.setWindowTitle("LENTERA SAR · Posko Mission Control")
        self.resize(1280, 720)
        self.setMinimumSize(1000, 640)
        self.api = Api(config.api_url, self)
        self.user, self.reports, self.selected_id = None, [], None
        self.station = "Posko Utama Semeru"
        self.connected = False
        self.map_available = None
        self.stack = QStackedWidget()
        self.setCentralWidget(self.stack)
        self.login = LoginScreen(self.api)
        self.dashboard = DashboardScreen(self.api)
        self.detail = DetailScreen(self.api)
        self.settings = SettingsScreen(self.api)
        self.dashboard.attach_settings(self.settings)
        for screen in (self.login, self.dashboard, self.detail):
            self.stack.addWidget(screen)
        self.login.loggedIn.connect(self.logged_in)
        self.dashboard.selected.connect(self.select_report)
        self.dashboard.settingsRequested.connect(self.show_settings)
        self.dashboard.logoutRequested.connect(self.logout)
        self.dashboard.exportRequested.connect(self.export)
        self.dashboard.refreshRequested.connect(self.refresh)
        self.detail.backRequested.connect(self.show_dashboard)
        self.detail.changed.connect(self.refresh)
        self.settings.backRequested.connect(self.return_from_settings)
        self.settings.logoutRequested.connect(self.logout)
        self.settings.saved.connect(self.settings_saved)
        self.api.connectionChanged.connect(self.connection_changed)
        self.statusBar().showMessage("LENTERA Python · Offline Local Network")
        self.statusBar().hide()
        self.timer = QTimer(self)
        self.timer.setInterval(3000)
        self.timer.timeout.connect(self.refresh)
        self.timer.start()
        self.refresh()

    def connection_changed(self, connected):
        was_connected = self.connected
        self.connected = connected
        if not connected:
            self.dashboard.notice.setText("Server lokal tidak terhubung. Data terakhir tetap ditampilkan; mencoba kembali…")
            self.dashboard.notice.show()
            self.settings.system.setText("Server lokal tidak terhubung. Status perangkat tidak dapat diperbarui.")
            self.statusBar().showMessage("Server tidak terhubung · mencoba kembali setiap 3 detik")
        elif not was_connected:
            # Reload failed initial map documents after the service becomes available.
            self.dashboard.map.reload()
            self.detail.map.reload()

    def refresh(self):
        self.api.request("GET", "/api/system", success=self.system_done, error=self.error, key="system")
        if self.user:
            self.api.request("GET", "/api/reports", success=self.reports_done, error=self.error, key="reports")

    def error(self, text):
        self.statusBar().showMessage(text)

    def system_done(self, status):
        self.settings.set_system(status)
        available = status["map"]["available"]
        if available and self.map_available is False:
            self.dashboard.map.reload()
            self.detail.map.reload()
        self.map_available = available
        r = status["receiver"]
        radio = "SIMULASI" if r["mode"] == "simulation" else "RADIO"
        text = f"{radio}: {'siap menerima' if r['ready'] else 'tidak siap / receiver tidak aktif'}"
        text += f" · Paket terakhir: {display_time(r['last_packet'])}"
        if r["last_error"]:
            text += f" · {r['last_error']}"
        if not status["map"]["available"]:
            text += f" · {status['map']['message']}"
        self.dashboard.notice.setText(text)
        self.dashboard.notice.hide()
        self.dashboard.radio_status.setText(("● SIMULASI" if r["mode"] == "simulation" else "● RADIO SIAP") if r["ready"] else "● RADIO OFFLINE")
        self.statusBar().showMessage("Python · server lokal terhubung · " + text)

    def logged_in(self, user):
        self.user = user
        self.statusBar().show()
        self.dashboard.operator.setText(f"{user['name']}\n{user['role']}")
        self.dashboard.header_operator.setText(f"{user['name']}  ·  {user['role']}")
        self.api.request("GET", "/api/settings", success=self.loaded_settings, error=self.error, key="settings")
        self.dashboard.navigate("dashboard")
        self.show_dashboard()
        self.refresh()

    def loaded_settings(self, values):
        self.station = values.get("station_name", self.station)
        self.dashboard.station.setText(self.station)

    def reports_done(self, reports):
        if not self.user:
            return
        self.reports = reports
        self.dashboard.set_reports(reports)
        if self.selected_id is not None:
            report = next((r for r in reports if r["id"] == self.selected_id), None)
            if report:
                self.detail.set_report(report, reports)
            elif self.stack.currentWidget() == self.detail:
                self.show_dashboard()

    def select_report(self, report_id):
        report = next((r for r in self.reports if r["id"] == report_id), None)
        if report:
            self.selected_id = report_id
            self.detail.notice.hide()
            self.detail.set_report(report, self.reports)
            self.stack.setCurrentWidget(self.detail)

    def show_dashboard(self):
        self.selected_id = None
        self.stack.setCurrentWidget(self.dashboard)

    def show_settings(self):
        self.settings.set_user(self.user, self.station)
        self.stack.setCurrentWidget(self.dashboard)
        self.dashboard.navigate("settings")

    def return_from_settings(self):
        self.dashboard.navigate("dashboard")
        self.show_dashboard()

    def settings_saved(self, values):
        self.user, self.station = values["user"], values["station_name"]
        self.dashboard.station.setText(self.station)
        self.dashboard.operator.setText(f"{self.user['name']}\n{self.user['role']}")
        self.dashboard.header_operator.setText(f"{self.user['name']}  ·  {self.user['role']}")

    def logout(self):
        if QMessageBox.question(self, "Keluar", "Keluar dari akun operator? Penerimaan LoRa tetap berjalan.",
                                QMessageBox.Yes | QMessageBox.No, QMessageBox.No) != QMessageBox.Yes:
            return
        self.user, self.reports, self.selected_id = None, [], None
        self.dashboard.set_reports([])
        self.detail.report = None
        self.detail.map.set_state([])
        self.detail.logs.clear()
        self.detail.reset_route()
        self.stack.setCurrentWidget(self.login)
        self.statusBar().hide()

    def export(self):
        from datetime import date
        path, _ = QFileDialog.getSaveFileName(self, "Ekspor Laporan", f"LENTERA_SAR_LOG_{date.today()}.csv", "CSV (*.csv)")
        if path:
            try:
                with open(path, "w", newline="", encoding="utf-8-sig") as stream:
                    export_csv(self.reports, stream)
                self.statusBar().showMessage(f"CSV disimpan: {path}")
            except OSError as exc:
                QMessageBox.warning(self, "Ekspor gagal", str(exc))


def run(config):
    app = QApplication(sys.argv[:1])
    app.setApplicationName("LENTERA")
    for font in (ASSETS / "fonts").glob("*.ttf"):
        QFontDatabase.addApplicationFont(str(font))
    app.setStyleSheet((ASSETS / "theme.qss").read_text(encoding="utf-8"))
    app.setWindowIcon(QIcon(str(ASSETS / "icon.svg")))
    window = MainWindow(config)
    window.show()
    return app.exec()
