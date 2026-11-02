import html
from urllib.parse import quote
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QPainter, QColor, QIcon
from ..config import ASSETS
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QFrame,
    QLineEdit, QFormLayout, QScrollArea, QTableView, QHeaderView, QAbstractItemView,
    QTextBrowser, QButtonGroup, QMessageBox, QStackedWidget)
from .widgets import label, button, card, display_time, ReportModel, ReportDelegate, TransmissionChart, COLORS
from .mapview import MapView


def scroll_content():
    area = QScrollArea()
    area.setWidgetResizable(True)
    content = QWidget()
    content.setObjectName("screen")
    area.setWidget(content)
    layout = QVBoxLayout(content)
    layout.setContentsMargins(24, 22, 24, 22)
    layout.setSpacing(18)
    return area, layout


class LoginScreen(QWidget):
    loggedIn = Signal(dict)

    def __init__(self, api):
        super().__init__()
        self.api, self.registering = api, False
        self.setObjectName("loginScreen")
        outer = QVBoxLayout(self)
        top = QHBoxLayout()
        top.addStretch()
        self.azimuth = label("AZIMUTH DATA\n\nREF: 00-29-SAR-A1\nSTATION: SEMERU-MAIN", "telemetry")
        top.addWidget(self.azimuth)
        outer.addLayout(top)
        outer.addStretch()
        heading = label("LENTERA Dashboard", "loginHeading")
        heading.setAlignment(Qt.AlignCenter)
        outer.addWidget(heading)
        tagline = label("Sistem Monitoring SOS dan Lokasi Korban", "telemetryText")
        tagline.setAlignment(Qt.AlignCenter)
        outer.addWidget(tagline)
        outer.addSpacing(18)
        pane, content = card()
        pane.setFixedWidth(448)
        pane.setObjectName("loginCard")
        content.setContentsMargins(34, 30, 34, 30)
        self.form_title = label("Login Admin Posko", "section")
        content.addWidget(self.form_title)
        self.subtitle = label("Masuk untuk mengakses dashboard monitoring LENTERA.", "subtitle", True)
        content.addWidget(self.subtitle)
        self.form = QFormLayout()
        self.form.setRowWrapPolicy(QFormLayout.WrapAllRows)
        self.fields = {}
        for key, title in (("username", "Username"), ("password", "Password"), ("name", "Nama operator"), ("role", "Role")):
            field = QLineEdit()
            field.setPlaceholderText(title)
            if key == "password":
                field.setEchoMode(QLineEdit.Password)
                field.addAction(QIcon(str(ASSETS / "eye.svg")), QLineEdit.TrailingPosition).triggered.connect(self.toggle_password)
            field.returnPressed.connect(self.submit)
            self.fields[key] = field
            self.form.addRow(title, field)
        self.form.setRowVisible(self.fields["name"], False)
        self.form.setRowVisible(self.fields["role"], False)
        content.addLayout(self.form)
        self.error = label("", "error", True)
        content.addWidget(self.error)
        self.submit_btn = button("Login  →", self.submit, "primary")
        content.addWidget(self.submit_btn)
        self.toggle_btn = button("Buat akun", self.toggle, "link")
        content.addWidget(self.toggle_btn)
        content.addWidget(label("v1.0.4 · PYTHON DESKTOP", "subtitle"))
        row = QHBoxLayout()
        row.addStretch(); row.addWidget(pane); row.addStretch()
        outer.addLayout(row)
        outer.addStretch()
        secure = label("● NETWORK SECURE  |  MISSION CONTROL", "telemetryText")
        secure.setAlignment(Qt.AlignCenter)
        outer.addWidget(secure)
        footer = label("© 2026 LENTERA SAR System. Student Engineering Prototype.", "subtitle")
        footer.setAlignment(Qt.AlignCenter)
        outer.addWidget(footer)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#001323"))
        painter.setPen(QColor("#092b3a"))
        for x in range(0, self.width(), 40):
            painter.drawLine(x, 0, x, self.height())
        for y in range(0, self.height(), 40):
            painter.drawLine(0, y, self.width(), y)

    def toggle_password(self):
        field = self.fields["password"]
        field.setEchoMode(QLineEdit.Normal if field.echoMode() == QLineEdit.Password else QLineEdit.Password)

    def toggle(self):
        self.registering = not self.registering
        self.azimuth.setVisible(not self.registering)
        self.form_title.setText("Registrasi Operator Posko" if self.registering else "Login Admin Posko")
        for key in ("name", "role"):
            self.form.setRowVisible(self.fields[key], self.registering)
        self.subtitle.setText("Daftarkan akun baru untuk operator posko LENTERA." if self.registering else "Masuk untuk mengakses dashboard monitoring LENTERA.")
        self.submit_btn.setText("Daftar Operator" if self.registering else "Login  →")
        self.toggle_btn.setText("Sudah punya akun? Masuk" if self.registering else "Buat akun")
        self.error.clear()

    def submit(self):
        if not self.submit_btn.isEnabled():
            return
        data = {k: v.text() for k, v in self.fields.items()}
        required = ("username", "password", "name", "role") if self.registering else ("username", "password")
        if not all(data[k].strip() for k in required):
            self.error.setText("Lengkapi semua field terlebih dahulu.")
            return
        self.submit_btn.setEnabled(False)
        self.toggle_btn.setEnabled(False)
        self.error.setText("Menghubungi server lokal…")

        def done(result):
            self.submit_btn.setEnabled(True)
            self.toggle_btn.setEnabled(True)
            self.fields["password"].clear()
            if self.registering:
                self.toggle()
                self.error.setText(result["message"])
            else:
                self.error.clear()
                self.loggedIn.emit(result["user"])

        def failed(message):
            self.submit_btn.setEnabled(True)
            self.toggle_btn.setEnabled(True)
            self.error.setText(message)
        self.api.request("POST", "/api/register" if self.registering else "/api/login", data, done, failed)


class DashboardScreen(QWidget):
    selected = Signal(int)
    settingsRequested = Signal()
    logoutRequested = Signal()
    exportRequested = Signal()
    refreshRequested = Signal()

    def __init__(self, api):
        super().__init__()
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        header = QFrame()
        header.setObjectName("header")
        header.setFixedHeight(64)
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(26, 0, 26, 0)
        header_layout.addWidget(label("♧  LENTERA SAR", "brand"))
        header_layout.addStretch()
        self.header_operator = label("", "section")
        self.header_operator.setMaximumWidth(400)
        self.header_operator.setWordWrap(True)
        header_layout.addWidget(self.header_operator)
        root.addWidget(header)
        outer = QHBoxLayout()
        root.addLayout(outer, 1)
        outer.setSpacing(0)
        outer.setContentsMargins(0, 0, 0, 0)
        self.sidebar = QFrame()
        self.sidebar.setObjectName("sidebar")
        self.sidebar.setFixedWidth(240)
        nav = QVBoxLayout(self.sidebar)
        nav.setContentsMargins(24, 26, 24, 20)
        self.operator = label("", "section", True)
        nav.addWidget(self.operator)
        self.radio_status = label("●  OFFLINE", "mono")
        nav.addWidget(self.radio_status)
        nav.addSpacing(28)
        self.nav_group = QButtonGroup(self)
        self.nav_buttons = {}
        self.active_view = "dashboard"
        for key, title in (("dashboard", "▦   Dashboard"), ("reports", "⚑   Laporan SOS"),
                           ("map", "◎   Peta Operasi"), ("settings", "⚙   Pengaturan Pos")):
            callback = self.settingsRequested.emit if key == "settings" else lambda checked=False, k=key: self.navigate(k)
            btn = button(title, callback, "nav")
            btn.setCheckable(True)
            btn.setChecked(key == "dashboard")
            self.nav_group.addButton(btn)
            self.nav_buttons[key] = btn
            nav.addWidget(btn)
        nav.addStretch()
        self.station = label("Posko Utama Semeru", "section", True)
        nav.addWidget(self.station)
        nav.addWidget(button("Keluar dari sistem", self.logoutRequested.emit, "nav"))
        outer.addWidget(self.sidebar)
        self.pages = QStackedWidget()
        outer.addWidget(self.pages, 1)
        self.area, body = scroll_content()
        self.pages.addWidget(self.area)
        self.overview_body = body
        heading = QHBoxLayout()
        titles = QVBoxLayout()
        titles.addWidget(label("LENTERA Dashboard", "title"))
        titles.addWidget(label("Sistem monitoring radio LoRa, laporan SOS, dan koordinasi darurat pencarian korban secara real-time.", "subtitle", True))
        heading.addLayout(titles, 1)
        heading.addWidget(button("↻", self.refreshRequested.emit))
        body.addLayout(heading)
        self.notice = label("Menghubungi layanan Python…", "notice", True)
        body.addWidget(self.notice)
        metrics = QHBoxLayout()
        self.metrics = {}
        for key, title, color in (("total", "TOTAL LAPORAN", "#00193c"), ("victims", "TOTAL KORBAN", "#00193c"), ("BARU", "BARU (SOS)", "#ba0627"),
                                  ("PROSES", "DALAM PROSES", "#b56c0b"), ("SELESAI", "SELESAI", "#2d6a4f"),
                                  ):
            frame, layout = card()
            frame.setFixedHeight(96)
            layout.setContentsMargins(16, 12, 16, 8)
            layout.setSpacing(3)
            if key in COLORS:
                frame.setStyleSheet(f"QFrame#card {{border-right:5px solid {color};border-radius:3px}}")
            layout.addWidget(label(title, "subtitle"))
            value = label("0", "metric")
            value.setStyleSheet(f"color:{color}")
            layout.addWidget(value)
            self.metrics[key] = value
            metrics.addWidget(frame)
        body.addLayout(metrics)
        table_card, content = card()
        self.table_card = table_card
        toolbar = QHBoxLayout()
        toolbar.addWidget(label("LOG LAPORAN TERKINI", "section")); toolbar.addStretch()
        filters = toolbar
        self.filter_group = QButtonGroup(self)
        self.filters = {}
        for key, title in (("SEMUA", "Semua"), ("BARU", "Baru"), ("PROSES", "Proses"), ("SELESAI", "Selesai")):
            btn = button(title, lambda checked=False, k=key: self.filter(k), "filter")
            btn.setCheckable(True)
            btn.setChecked(key == "SEMUA")
            self.filter_group.addButton(btn)
            self.filters[key] = btn
            filters.addWidget(btn)
        filters.addWidget(button("↓ CSV", self.exportRequested.emit))
        content.addLayout(toolbar)
        self.model = ReportModel(self)
        self.table = QTableView()
        self.table.setModel(self.model)
        self.table.setItemDelegate(ReportDelegate(self.table))
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.setSelectionMode(QAbstractItemView.SingleSelection)
        self.table.setMinimumHeight(190)
        self.table.verticalHeader().hide()
        self.table.verticalHeader().setDefaultSectionSize(48)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        for column, width in ((2, 90), (6, 80)):
            self.table.horizontalHeader().setSectionResizeMode(column, QHeaderView.Fixed)
            self.table.setColumnWidth(column, width)
        self.table.clicked.connect(lambda index: self.selected.emit(self.model.reports[index.row()]["id"]))
        content.addWidget(self.table)
        self.empty = label("Belum ada laporan SOS. Menunggu sinyal dari node lapangan.", "subtitle", True)
        content.addWidget(self.empty)
        body.addWidget(table_card)
        lower = QHBoxLayout()
        self.overview_lower = lower
        self.map_card, map_layout = card()
        map_layout.addWidget(label("PETA DISTRIBUSI KEBENCANAAN", "section"))
        map_layout.addWidget(label("Cakupan Jawa · data peta lokal", "subtitle"))
        self.map = MapView(api.base)
        self.map.bridge.selected.connect(self.selected)
        map_layout.addWidget(self.map)
        lower.addWidget(self.map_card, 1)
        chart_card, chart_layout = card()
        chart_layout.addWidget(label("INTENSITAS TRANSMISI SINYAL (24 JAM)", "section"))
        chart_layout.addWidget(label("Laporan berdasarkan jam penerimaan awal", "subtitle", True))
        self.chart = TransmissionChart()
        chart_layout.addWidget(self.chart)
        self.peak = label("", "mono")
        chart_layout.addWidget(self.peak)
        chart_layout.addStretch()
        lower.addWidget(chart_card, 1)
        body.addLayout(lower)
        body.addWidget(label("© 2026 LENTERA SAR System. Student Engineering Prototype.", "subtitle"))
        self.reports_area, self.reports_body = scroll_content()
        self.reports_body.addWidget(label("Laporan SOS", "title"))
        self.reports_body.addWidget(label("Seluruh laporan darurat · filter status dan pilih laporan untuk penanganan.", "subtitle", True))
        self.pages.addWidget(self.reports_area)
        self.map_area, self.map_body = scroll_content()
        self.map_body.addWidget(label("Peta Operasi", "title"))
        self.map_body.addWidget(label("Sebaran lokasi korban di Jawa. Pilih marker untuk membuka detail laporan.", "subtitle", True))
        self.pages.addWidget(self.map_area)
        self.nav_pages = {"dashboard": self.area, "reports": self.reports_area, "map": self.map_area}

    def attach_settings(self, screen):
        self.pages.addWidget(screen)
        self.nav_pages["settings"] = screen

    def navigate(self, key):
        if key not in self.nav_pages:
            return
        # The same model and map remain alive across pages; no duplicate WebEngine
        # renderer or report selection is needed on the Raspberry Pi.
        self.overview_body.insertWidget(3, self.table_card)
        self.overview_lower.insertWidget(0, self.map_card, 1)
        self.table.setMinimumHeight(190)
        self.map.setMinimumHeight(270)
        if key == "reports":
            self.reports_body.addWidget(self.table_card, 1)
            self.table.setMinimumHeight(400)
        elif key == "map":
            self.map_body.addWidget(self.map_card, 1)
            self.map.setMinimumHeight(400)
        elif key == "dashboard":
            self.filter("SEMUA")
        self.active_view = key
        self.pages.setCurrentWidget(self.nav_pages[key])
        self.nav_buttons[key].setChecked(True)
        from PySide6.QtCore import QTimer
        QTimer.singleShot(0, lambda: self.map.command("resizeMap"))

    def scroll_map(self):
        self.navigate("map")

    def filter(self, status):
        self.filters[status].setChecked(True)
        self.model.update(self.model.all_reports, status)
        self.empty.setVisible(not self.model.reports)

    def set_reports(self, reports):
        self.model.update(reports)
        self.empty.setVisible(not self.model.reports)
        values = dict(total=len(reports), victims=sum(r.get("victim_count", 1) for r in reports))
        values.update({s: sum(r["status"].upper() == s for r in reports) for s in COLORS})
        for key, value in values.items():
            self.metrics[key].setText(str(value))
        self.chart.set_reports(reports)
        self.peak.setText(f"Puncak: {max(self.chart.values)} laporan / 4 jam")
        self.map.set_state(reports)


class DetailScreen(QWidget):
    backRequested = Signal()
    changed = Signal()

    def __init__(self, api):
        super().__init__()
        self.api = api
        self.report = None
        self.start = None
        self.route_version = 0
        self.route_busy = False
        self.route_context = None
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        header_frame = QFrame()
        header_frame.setObjectName("header")
        header_frame.setFixedHeight(64)
        header = QHBoxLayout(header_frame)
        header.addWidget(button("←  KEMBALI KE DASHBOARD", self.backRequested.emit, "nav"))
        header.addStretch(); header.addWidget(label("●  LENTERA CHANNEL SECURE", "mono"))
        outer.addWidget(header_frame)
        area, body = scroll_content()
        area.widget().setMaximumWidth(1080)
        area.setAlignment(Qt.AlignHCenter)
        outer.addWidget(area)
        self.title = label("Detail Laporan SOS", "title", True)
        body.addWidget(self.title)
        self.summary = label("", "subtitle", True)
        body.addWidget(self.summary)
        self.notice = label("", "notice", True)
        self.notice.hide()
        body.addWidget(self.notice)
        top = QHBoxLayout()
        left = QVBoxLayout()
        top.addLayout(left, 2)
        left.setSpacing(16)
        stats = QHBoxLayout()
        self.stat_fields = {}
        for key, title in (("waktu", "WAKTU LAPORAN"), ("sender", "NODE PENGIRIM"), ("victim_count", "JUMLAH KORBAN"), ("duplicate_count", "TOTAL UPDATE")):
            frame, layout = card()
            layout.setContentsMargins(12, 12, 12, 12)
            frame.setStyleSheet("QFrame#card {background:#eeedf2;border-radius:3px}")
            layout.addWidget(label(title, "subtitle", True))
            value = label("—", "section", True)
            self.stat_fields[key] = value
            layout.addWidget(value)
            stats.addWidget(frame)
        left.addLayout(stats)
        info, info_layout = card()
        info_layout.addWidget(label("◎  LOKASI LAPORAN", "section"))
        form = QFormLayout()
        form.setVerticalSpacing(13)
        self.fields = {}
        for key, title in (("status", "Status penanganan"), ("victim_count", "Jumlah korban"),
                           ("sender", "Node pengirim"), ("node_penerima", "Node penerima"), ("location", "Koordinat korban"),
                           ("location_source", "Sumber lokasi"), ("accuracy", "Akurasi lokasi"),
                           ("created", "Pertama diterima"), ("last", "Sinyal terakhir"), ("duplicate_count", "Total laporan/update")):
            value = label("—", "mono", True)
            self.fields[key] = value
            form.addRow(title, value)
        info_layout.addLayout(form)
        self.copy_btn = button("Salin Koordinat", self.copy_coordinates)
        info_layout.addWidget(self.copy_btn)
        left.addWidget(info)
        actions, action_layout = card()
        action_layout.addWidget(label("Koordinasi Penanganan", "section"))
        self.status_buttons = {}
        for status, title in (("BARU", "Kembalikan ke Antrean Baru"), ("PROSES", "Proses / Kirim Tim SAR"), ("SELESAI", "Tandai Selesai")):
            btn = button(title, lambda checked=False, s=status: self.update_status(s), "primary" if status == "PROSES" else None)
            self.status_buttons[status] = btn
            action_layout.addWidget(btn)
        self.victim_message = label("", None, True)
        action_layout.addWidget(self.victim_message)
        action_layout.addWidget(label("Pesan informasi untuk korban · tidak ditransmisikan melalui radio", "subtitle", True))
        action_layout.addStretch()
        self.delete_btn = button("Hapus Laporan Selesai", self.delete, "danger")
        action_layout.addWidget(self.delete_btn)
        left.addWidget(actions)
        body.addLayout(top)
        map_frame, map_layout = card()
        map_layout.addWidget(label("PETA LOKASI KORBAN", "section"))
        map_layout.addWidget(label("Navigasi Offline Tim SAR · Marker tampil jika koordinat tersedia.", "subtitle", True))
        self.map = MapView(api.base)
        self.map.setMinimumHeight(420)
        self.map.bridge.start.connect(self.set_start)
        self.map.bridge.cleared.connect(self.clear_start)
        self.map.bridge.status.connect(self.map_message)
        map_layout.addWidget(self.map)
        self.map_notice = label("", "notice", True)
        self.map_notice.hide()
        map_layout.addWidget(self.map_notice)
        controls = QHBoxLayout()
        controls.addWidget(button("Pilih Titik Awal", lambda: self.map.command("chooseStart")))
        self.route_btn = button("Cari Rute Offline", self.find_route, "primary")
        controls.addWidget(self.route_btn)
        controls.addWidget(button("Reset Rute", self.reset_route))
        controls.addStretch()
        map_layout.addLayout(controls)
        self.route_label = label("Titik merah: korban. Titik biru: posisi awal tim SAR.", "subtitle", True)
        map_layout.addWidget(self.route_label)
        top.addWidget(map_frame, 3)
        logs_frame, logs_layout = card()
        logs_layout.addWidget(label("Log Aktivitas Sistem", "section"))
        self.logs = QTextBrowser()
        self.logs.setMinimumHeight(200)
        logs_layout.addWidget(self.logs)
        body.addWidget(logs_frame)

    def set_report(self, report, reports):
        old = self.report
        context = (report["id"], report["latitude"], report["longitude"])
        if context != self.route_context:
            self.reset_route()
            self.route_context = context
        self.report = report
        self.title.setText(f"ID Laporan: {report['message_id']}")
        self.summary.setText("Penerimaan sinyal darurat melalui node transceiver LENTERA.")
        status = report["status"].upper()
        has_location = report["latitude"] is not None and report["longitude"] is not None
        vals = dict(report, status=status, sender=report.get("node_pengirim") or report["node_penerima"],
                    location=f"{report['latitude']}, {report['longitude']}" if has_location else "Belum tersedia",
                    accuracy=f"± {report['location_accuracy']} meter" if report.get("location_accuracy") is not None else "Belum tersedia",
                    created=display_time(report.get("created_at"), report["waktu"]), last=display_time(report.get("last_seen")))
        vals["location_source"] = {"PHONE_GPS": "GPS Smartphone", "NODE_GNSS": "GNSS Node LENTERA",
                                   "UNAVAILABLE": "Belum tersedia", "LEGACY": "Data lama"}.get(report.get("location_source"), report.get("location_source", "Belum tersedia"))
        for key, field in self.stat_fields.items():
            field.setText(str(vals.get(key, "—")))
        self.copy_btn.setEnabled(has_location)
        for key, field in self.fields.items():
            field.setText(str(vals.get(key, "—")))
        self.fields["status"].setStyleSheet(f"color:{COLORS.get(status, '#00193c')};font-weight:800")
        for key, btn in self.status_buttons.items():
            btn.setEnabled(key != status)
        self.delete_btn.setEnabled(status == "SELESAI")
        messages = {"BARU": "Laporan SOS Anda telah diterima oleh sistem LENTERA. Mohon tetap tenang, hemat baterai perangkat, dan tunggu konfirmasi dari tim SAR.",
                    "PROSES": "Tim SAR sedang memproses laporan Anda menggunakan koordinat terakhir yang diterima. Harap menunggu di tempat yang aman." if has_location else "Tim SAR sedang memproses laporan Anda. Koordinat belum tersedia; informasi lokasi masih menunggu sumber lokasi yang valid.",
                    "SELESAI": "Laporan Anda telah ditandai selesai ditangani oleh operator SAR. Tetap ikuti arahan petugas di lokasi."}
        self.victim_message.setText(messages.get(status, ""))
        self.map.set_state(reports, report["id"])
        mid = report["message_id"]
        def logs_done(logs):
            if self.report and self.report["message_id"] == mid:
                base = [f"Sinyal SOS diterima dari {vals['sender']}",
                        f"Koordinat lokasi: {vals['location']}", f"Jumlah korban: {report['victim_count']} orang",
                        f"Total laporan/update backend: {report.get('duplicate_count', 1)} kali"]
                rows = [f"<p><b>{html.escape(report['waktu'])}</b> · {html.escape(text)}</p>" for text in base]
                rows += [f"<p><b>{html.escape(log['waktu'])}</b> · {html.escape(log['message'])}<br><small>{html.escape(log['source'])}</small></p>" for log in logs]
                self.logs.setHtml("".join(rows))
        if not old or old["id"] != report["id"]:
            self.logs.clear()
        self.api.request("GET", f"/api/reports/{quote(mid, safe='')}/logs", success=logs_done,
                         error=self.show_error, key=f"logs-{mid}")

    def copy_coordinates(self):
        if self.report and self.report["latitude"] is not None and self.report["longitude"] is not None:
            from PySide6.QtWidgets import QApplication
            QApplication.clipboard().setText(f"{self.report['latitude']}, {self.report['longitude']}")

    def show_error(self, text):
        self.notice.setText(text)
        self.notice.show()

    def update_status(self, status):
        if not self.report:
            return
        mid = self.report["message_id"]
        self.api.request("PATCH", f"/api/reports/{quote(mid, safe='')}/status", {"status": status},
                         lambda _: self.changed.emit(), self.show_error, key="status-change")

    def delete(self):
        if not self.report or self.report["status"].upper() != "SELESAI":
            return
        if QMessageBox.question(self, "Hapus Laporan", "Hapus laporan dan seluruh log terkait secara permanen?",
                                QMessageBox.Yes | QMessageBox.No, QMessageBox.No) != QMessageBox.Yes:
            return
        def done(_):
            self.backRequested.emit()
            self.changed.emit()
        self.api.request("DELETE", f"/api/reports/{quote(self.report['message_id'], safe='')}", success=done,
                         error=self.show_error, key="delete-report")

    def map_message(self, text):
        self.map_notice.setText(text)
        self.map_notice.setVisible(bool(text))

    def set_start(self, lon, lat):
        self.route_version += 1
        self.start = [lon, lat]
        self.route_label.setText(f"Titik awal: {lat:.5f}, {lon:.5f}")

    def clear_start(self):
        self.start = None
        self.route_version += 1
        self.route_label.setText("Pilih titik awal tim SAR pada peta.")

    def reset_route(self):
        self.clear_start()
        self.map.command("resetRoute")

    def find_route(self):
        if not self.report or not self.start:
            self.route_label.setText("Pilih titik awal tim SAR terlebih dahulu.")
            return
        if self.report["latitude"] is None or self.report["longitude"] is None:
            self.route_label.setText("Koordinat korban belum tersedia.")
            return
        if self.route_busy:
            return
        version = self.route_version
        self.route_busy = True
        self.route_btn.setEnabled(False)
        self.route_label.setText("Menghitung rute offline…")
        def finish(result=None, error=None):
            self.route_busy = False
            self.route_btn.setEnabled(True)
            if version != self.route_version:
                return
            if error:
                self.route_label.setText(error)
            else:
                self.map.command("drawRoute", result)
                import math
                self.route_label.setText(f"Jarak: {result['distance']/1000:.2f} km · Estimasi: {math.ceil(result['duration']/60)} menit")
        self.api.request("POST", "/api/route", {"start": self.start, "end": [self.report["longitude"], self.report["latitude"]]},
                         success=lambda r: finish(result=r), error=lambda e: finish(error=e))


class SettingsScreen(QWidget):
    backRequested = Signal()
    logoutRequested = Signal()
    saved = Signal(dict)

    def __init__(self, api):
        super().__init__()
        self.api, self.user = api, None
        root = QVBoxLayout(self)
        area, body = scroll_content()
        root.addWidget(area)
        body.addWidget(button("←  Kembali ke Dashboard", self.backRequested.emit))
        body.addWidget(label("Pengaturan Pos", "title"))
        body.addWidget(label("Profil operator, identitas posko, dan monitoring gateway LoRa.", "subtitle"))
        frame, content = card()
        content.addWidget(label("Profil Admin Posko", "section"))
        form = QFormLayout()
        self.fields = {}
        for key, title in (("name", "Nama koordinator"), ("role", "Role"), ("station_name", "Nama posko")):
            field = QLineEdit()
            self.fields[key] = field
            form.addRow(title, field)
        content.addLayout(form)
        content.addWidget(button("Simpan Pengaturan", self.save, "primary"))
        self.message = label("", "error", True)
        content.addWidget(self.message)
        body.addWidget(frame)
        frame, content = card()
        content.addWidget(label("Status Sistem LENTERA", "section"))
        self.system = label("Menunggu status sistem…", "mono", True)
        content.addWidget(self.system)
        body.addWidget(frame)
        body.addWidget(button("Keluar dari Sistem", self.logoutRequested.emit, "danger"))
        body.addStretch()

    def set_user(self, user, station):
        self.user = user
        self.fields["name"].setText(user["name"])
        self.fields["role"].setText(user["role"])
        self.fields["station_name"].setText(station)
        self.message.clear()

    def save(self):
        data = {k: field.text() for k, field in self.fields.items()}
        data["user_id"] = self.user["id"]
        def done(_):
            self.message.setText("Pengaturan berhasil disimpan.")
            self.user = dict(self.user, name=data["name"].strip(), role=data["role"].strip())
            self.saved.emit(dict(user=self.user, station_name=data["station_name"].strip()))
        self.api.request("PATCH", "/api/settings", data, done, self.message.setText, key="save-settings")

    def set_system(self, status):
        receiver = status["receiver"]
        mode = "SIMULASI (tanpa radio)" if receiver["mode"] == "simulation" else "PERANGKAT NYATA"
        self.system.setText(f"Mode receiver: {mode}\nRadio: {'Siap menerima' if receiver['ready'] else 'Tidak siap / terputus'}\n"
                            f"Heartbeat: {'Aktif' if receiver['alive'] else 'Tidak aktif'}\n"
                            f"Paket valid terakhir: {display_time(receiver['last_packet'])}\n"
                            f"Kesalahan terakhir: {receiver['last_error'] or '—'}\n"
                            f"Peta: {status['map']['message']}\nServer: {status['server']}\nJaringan: {status['mode']}")
