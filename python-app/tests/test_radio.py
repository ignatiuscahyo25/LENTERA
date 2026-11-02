import json
import math
from lentera.radio.receiver import Receiver, ProcessLock
from lentera.radio.protocol import ack_token, validate_sos
import pytest


class Radio:
    def __init__(self):
        self.acks = []

    def ack(self, *args):
        self.acks.append(args)


def test_ack_after_save_and_reack_identical_only(packet):
    radio = Radio()
    saved = []
    receiver = Receiver(radio, lambda data: saved.append(data) or True)
    buf = json.dumps(packet).encode()
    assert receiver.handle(buf, -70)
    assert receiver.handle(buf, -70)
    assert len(saved) == 1 and len(radio.acks) == 2
    changed = dict(packet, victim_count=3)
    assert receiver.handle(json.dumps(changed).encode(), -70)
    assert len(saved) == 2


@pytest.mark.parametrize("result", [False, "exception"])
def test_no_ack_for_failed_storage(packet, result):
    def save(_):
        if result == "exception":
            raise OSError("backend offline")
        return result
    radio = Radio()
    receiver = Receiver(radio, save)
    assert not receiver.handle(json.dumps(packet).encode(), -70)
    assert radio.acks == [] and receiver.saved == {}


def test_invalid_packets_do_not_reach_backend(packet):
    radio = Radio()
    saved = []
    receiver = Receiver(radio, lambda data: saved.append(data) or True)
    for buf in (b'not json', b'[]', b'\xff', json.dumps(dict(packet, victim_count=True)).encode(),
                json.dumps(dict(packet, location_accuracy=math.inf)).encode()):
        assert not receiver.handle(buf, -70)
    assert not saved and not radio.acks


def test_ack_token_preserves_numeric_wire_text(packet):
    raw = json.dumps(packet)
    token = ack_token(raw, packet)
    assert len(token) == 8
    assert token != ack_token(raw.replace('106.85', '106.850'), packet)
    assert validate_sos(dict(packet, latitude=None, longitude=None, location_source="UNAVAILABLE"))


def test_receiver_exclusive_lock(tmp_path):
    with ProcessLock(tmp_path / "receiver.lock"):
        with pytest.raises(RuntimeError):
            with ProcessLock(tmp_path / "receiver.lock"):
                pass


def test_hardware_failure_reports_error_without_simulation(config, monkeypatch):
    from lentera.radio.receiver import run
    beats = []
    def fail_open(_):
        raise RuntimeError("SX1278 tidak terbaca")
    monkeypatch.setattr("lentera.radio.sx1278.SX1278.open", fail_open)
    monkeypatch.setattr("lentera.radio.receiver.signal.signal", lambda *args: None)
    monkeypatch.setattr("lentera.radio.receiver.post_json", lambda url, data: beats.append(data) or True)
    with pytest.raises(RuntimeError, match="SX1278"):
        run(config)
    assert beats[-1]["ready"] is False
    assert beats[-1]["mode"] == "hardware" and "SX1278" in beats[-1]["last_error"]
