import json
import logging
from PySide6.QtCore import QObject, Signal, Slot, QUrl
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineUrlRequestInterceptor
from PySide6.QtWebEngineWidgets import QWebEngineView


class LocalOnly(QWebEngineUrlRequestInterceptor):
    def __init__(self, origin, parent=None):
        super().__init__(parent)
        self.origin = QUrl(origin)

    def interceptRequest(self, info):
        url = info.requestUrl()
        allowed = url.scheme() in ("qrc", "data", "blob") or (
            url.scheme() == self.origin.scheme() and url.host() == self.origin.host() and url.port() == self.origin.port())
        info.block(not allowed)


class LocalPage(QWebEnginePage):
    def acceptNavigationRequest(self, url, navigation_type, is_main_frame):
        return url == self.url() or (url.host() in ("127.0.0.1", "localhost") and url.path() == "/map/index.html")

    def javaScriptConsoleMessage(self, level, message, line, source):
        logging.warning("Map WebEngine %s:%s: %s", source, line, message)


class Bridge(QObject):
    stateChanged = Signal(str)
    selected = Signal(int)
    start = Signal(float, float)
    cleared = Signal()
    status = Signal(str)
    ready = Signal()

    @Slot(int)
    def reportSelected(self, value):
        self.selected.emit(value)

    @Slot(float, float)
    def startSelected(self, lon, lat):
        self.start.emit(lon, lat)

    @Slot()
    def startCleared(self):
        self.cleared.emit()

    @Slot(str)
    def message(self, text):
        self.status.emit(text)

    @Slot()
    def mapReady(self):
        self.ready.emit()


class MapView(QWebEngineView):
    def __init__(self, base, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(270)
        self.setPage(LocalPage(self))
        self.interceptor = LocalOnly(base, self)
        self.page().profile().setUrlRequestInterceptor(self.interceptor)
        self.bridge = Bridge(self)
        self.channel = QWebChannel(self.page())
        self.channel.registerObject("bridge", self.bridge)
        self.page().setWebChannel(self.channel)
        self.state = {"reports": [], "selected": None}
        self.bridge.ready.connect(self.publish)
        self.load(QUrl(base + "/map/index.html"))

    def set_state(self, reports, selected=None):
        self.state = dict(reports=reports, selected=selected)
        self.publish()

    def publish(self):
        self.bridge.stateChanged.emit(json.dumps(self.state))

    def command(self, name, value=None):
        # Names are constants controlled by Python, never user-provided JavaScript.
        arg = json.dumps(value) if value is not None else ""
        self.page().runJavaScript(f"window.{name} && window.{name}({arg});")
