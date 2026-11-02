"""Receiver process: no Qt and no direct database access."""
import json
import logging
import signal
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path
from .protocol import validate_sos, ack_token, backend_payload


class ProcessLock:
    def __init__(self, path):
        self.path = Path(path)
        self.file = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = self.path.open("a+b")
        try:
            import os
            if os.name == "nt":
                import msvcrt
                self.file.seek(0)
                if not self.file.read(1):
                    self.file.write(b"0")
                    self.file.flush()
                self.file.seek(0)
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.file.close()
            raise RuntimeError("Receiver lain masih aktif; hentikan sebelum menjalankan receiver baru") from None
        return self

    def __exit__(self, *args):
        self.file.close()


def post_json(url, data):
    req = urllib.request.Request(url, data=json.dumps(data, allow_nan=False).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as response:
        result = json.load(response)
        return 200 <= response.status < 300 and isinstance(result, dict) and result.get("success") is True


class Receiver:
    def __init__(self, radio, save, node_id="POSKO-01"):
        self.radio, self.save, self.node_id = radio, save, node_id
        self.saved = {}
        self.last_packet = None
        self.last_error = None

    def handle(self, buf, rssi):
        try:
            raw = buf.decode("utf-8")
            obj = json.loads(raw)
        except (UnicodeDecodeError, ValueError):
            self.last_error = "Paket bukan JSON UTF-8 valid"
            return False
        if not validate_sos(obj):
            self.last_error = "Paket SOS tidak valid"
            return False
        self.last_packet = datetime.now().astimezone().isoformat(timespec="seconds")
        token, mid = ack_token(raw, obj), obj["message_id"]
        now = time.monotonic()
        # Bounded cache; identical saved retransmissions get re-ACKed for one hour.
        self.saved = {k: v for k, v in self.saved.items() if now - v[1] < 3600}
        cached = self.saved.get(mid)
        try:
            if not cached or cached[0] != token:
                if not self.save(backend_payload(obj, self.node_id)):
                    raise OSError("Backend belum mengonfirmasi penyimpanan")
                if len(self.saved) >= 10000:
                    self.saved.pop(next(iter(self.saved)))
                self.saved[mid] = (token, now)
            self.radio.ack(mid, obj["node_pengirim"], token)
            self.last_error = None
            logging.info("SOS tersimpan/ACK: %s, RSSI=%s", mid, rssi)
            return True
        except (OSError, ValueError) as exc:
            self.last_error = str(exc)
            logging.error("Tidak dapat memproses %s: %s", mid, exc)
            return False


class SimulatedRadio:
    def open(self):
        pass

    def ack(self, mid, sender, token):
        logging.info("SIMULASI ACK %s -> %s token=%s (tanpa transmisi radio)", mid, sender, token)

    def close(self):
        pass


def run(config, simulate=False, interval=10):
    from .sx1278 import SX1278
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    mode = "simulation" if simulate else "hardware"
    radio = SimulatedRadio() if simulate else SX1278()
    receiver = Receiver(radio, lambda data: post_json(config.api_url + "/api/reports", data), config.node_id)
    state = {"ready": False}

    def beat():
        while not stop.is_set():
            try:
                post_json(config.api_url + "/api/receiver/heartbeat", dict(
                    ready=state["ready"], mode=mode, last_packet=receiver.last_packet, last_error=receiver.last_error))
            except (OSError, ValueError) as exc:
                logging.warning("Heartbeat backend gagal: %s", exc)
            stop.wait(3)

    with ProcessLock(config.database.parent / "receiver.lock"):
        thread = threading.Thread(target=beat, name="receiver-heartbeat", daemon=True)
        thread.start()
        try:
            radio.open()  # Missing GPIO is fatal in hardware mode. Never silently simulate.
            state["ready"] = True
            next_packet = 0
            count = 0
            while not stop.is_set():
                if simulate:
                    if time.monotonic() >= next_packet:
                        count += 1
                        obj = dict(type="SOS_REPORT", message_id=f"LNT-SIM-{int(time.time())}-{count}",
                                   node_pengirim="NODE-SIM-01", victim_count=2,
                                   latitude=-6.25, longitude=106.85, location_accuracy=12, location_source="PHONE_GPS")
                        receiver.handle(json.dumps(obj).encode(), -65)
                        next_packet = time.monotonic() + interval
                else:
                    packet = radio.read()
                    if packet:
                        receiver.handle(*packet)
                stop.wait(0.01 if not simulate else 0.1)
        except Exception as exc:
            receiver.last_error = str(exc)
            logging.exception("Receiver gagal")
            raise
        finally:
            state["ready"] = False
            stop.set()
            thread.join(timeout=6)
            try:
                post_json(config.api_url + "/api/receiver/heartbeat", dict(ready=False, mode=mode,
                          last_packet=receiver.last_packet, last_error=receiver.last_error))
            except (OSError, ValueError):
                pass
            radio.close()
