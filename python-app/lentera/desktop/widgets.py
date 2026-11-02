from datetime import datetime
from PySide6.QtCore import Qt, QAbstractTableModel, QModelIndex, QRectF
from PySide6.QtGui import QColor, QPainter, QFont
from PySide6.QtWidgets import QLabel, QFrame, QVBoxLayout, QPushButton, QWidget, QStyledItemDelegate

COLORS = {"BARU": "#ba0627", "PROSES": "#b56c0b", "SELESAI": "#2d6a4f"}


def label(text, name=None, wrap=False):
    w = QLabel(text)
    if name:
        w.setObjectName(name)
    w.setWordWrap(wrap)
    return w


def button(text, callback, name=None):
    w = QPushButton(text)
    if name:
        w.setObjectName(name)
    w.setCursor(Qt.PointingHandCursor)
    w.clicked.connect(callback)
    return w


def card():
    frame = QFrame()
    frame.setObjectName("card")
    layout = QVBoxLayout(frame)
    layout.setContentsMargins(18, 16, 18, 16)
    layout.setSpacing(10)
    return frame, layout


def display_time(value, fallback="—"):
    if not value:
        return fallback
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone().strftime("%d/%m/%Y %H:%M:%S")
    except (ValueError, TypeError):
        return str(value)


class ReportModel(QAbstractTableModel):
    headers = ["ID", "WAKTU", "STATUS", "NODE", "JUMLAH KORBAN", "TOTAL SINYAL", "AKSI"]

    def __init__(self, parent=None):
        super().__init__(parent)
        self.reports = []
        self.all_reports = []
        self.filter = "SEMUA"

    def update(self, reports, status=None):
        self.beginResetModel()
        self.all_reports = reports
        if status:
            self.filter = status
        self.reports = [r for r in reports if self.filter == "SEMUA" or r["status"].upper() == self.filter]
        self.endResetModel()

    def rowCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self.reports)

    def columnCount(self, parent=QModelIndex()):
        return len(self.headers)

    def headerData(self, section, orientation, role=Qt.DisplayRole):
        if orientation == Qt.Horizontal and role == Qt.DisplayRole:
            return self.headers[section]

    def data(self, index, role=Qt.DisplayRole):
        if not index.isValid():
            return None
        r = self.reports[index.row()]
        col = index.column()
        if role == Qt.DisplayRole:
            return [r["message_id"], r["waktu"], r["status"].upper(), r.get("node_pengirim") or r["node_penerima"],
                    f"{r['victim_count']} orang", f"{r.get('duplicate_count', 1)}x", "Detail"][col]
        if role == Qt.ForegroundRole and col == 2:
            return QColor(COLORS.get(r["status"].upper(), "#43474f"))
        if role == Qt.FontRole and col in (0, 2):
            font = QFont("JetBrains Mono" if col == 0 else "Inter", 9)
            font.setBold(True)
            return font
        if role == Qt.TextAlignmentRole:
            return int(Qt.AlignVCenter | (Qt.AlignCenter if col in (2, 5, 6) else Qt.AlignLeft))


class ReportDelegate(QStyledItemDelegate):
    def paint(self, painter, option, index):
        if index.column() not in (2, 6):
            return super().paint(painter, option, index)
        painter.save()
        painter.setRenderHint(QPainter.Antialiasing)
        text = index.data()
        color = COLORS.get(text, "#00193c")
        rect = QRectF(option.rect.center().x() - 33, option.rect.center().y() - 10, 66, 21)
        painter.setPen(Qt.NoPen)
        painter.setBrush(QColor(color))
        painter.drawRoundedRect(rect, 9 if index.column() == 2 else 3, 9 if index.column() == 2 else 3)
        painter.setPen(QColor("white"))
        font = QFont("Inter", 8)
        font.setBold(True)
        painter.setFont(font)
        painter.drawText(rect, Qt.AlignCenter, text)
        painter.restore()


class TransmissionChart(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(160)
        self.values = [0] * 6

    def set_reports(self, reports):
        self.values = [0] * 6
        for r in reports:
            try:
                stamp = r.get("created_at")
                hour = datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone().hour if stamp else int(r["waktu"].split(":")[0])
                self.values[hour // 4] += 1
            except (ValueError, TypeError, IndexError):
                pass
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setFont(QFont("Inter", 9))
        width, height = self.width(), self.height()
        baseline = height - 28
        maximum = max(max(self.values), 1)
        painter.setPen(QColor("#eeedf2"))
        for y in range(3):
            pos = 20 + y * (baseline - 20) / 2
            painter.drawLine(0, int(pos), width, int(pos))
        unit = width / 6
        for i, count in enumerate(self.values):
            h = (baseline - 35) * count / maximum
            rect = QRectF(i * unit + unit * .25, baseline - h, unit * .5, max(h, 2))
            painter.setPen(Qt.NoPen)
            painter.setBrush(QColor("#ba0627" if count and count == max(self.values) else "#002d62"))
            painter.drawRoundedRect(rect, 4, 4)
            painter.setPen(QColor("#43474f"))
            painter.drawText(QRectF(i * unit, baseline + 7, unit, 20), Qt.AlignCenter, f"{i*4:02}:00")
            painter.drawText(QRectF(i * unit, baseline - h - 23, unit, 20), Qt.AlignCenter, str(count))
