import json
from PySide6.QtCore import QObject, QUrl, QByteArray, Signal
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest


class Api(QObject):
    connectionChanged = Signal(bool)

    def __init__(self, base, parent=None):
        super().__init__(parent)
        self.base = base.rstrip("/")
        self.manager = QNetworkAccessManager(self)
        self.pending = set()

    def request(self, method, path, data=None, success=None, error=None, key=None):
        if key and key in self.pending:
            return False
        if key:
            self.pending.add(key)
        request = QNetworkRequest(QUrl(self.base + path))
        request.setHeader(QNetworkRequest.ContentTypeHeader, "application/json")
        request.setTransferTimeout(12000)
        payload = QByteArray(json.dumps(data).encode()) if data is not None else QByteArray()
        reply = self.manager.sendCustomRequest(request, method.encode(), payload)

        def finished():
            if key:
                self.pending.discard(key)
            try:
                raw = bytes(reply.readAll())
                status = reply.attribute(QNetworkRequest.HttpStatusCodeAttribute) or 0
                self.connectionChanged.emit(status > 0)
                try:
                    result = json.loads(raw) if raw else {}
                except ValueError:
                    result = {}
                if 200 <= status < 300:
                    if success:
                        success(result)
                elif error:
                    error(result.get("message", reply.errorString()))
            finally:
                reply.deleteLater()
        reply.finished.connect(finished)
        return True
