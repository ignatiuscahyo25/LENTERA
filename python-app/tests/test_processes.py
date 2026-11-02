"""Real receiver CLI against a live HTTP backend (no GPIO, no Qt)."""
from dataclasses import replace
from pathlib import Path
import json
import subprocess
import sys
import threading
import time
from waitress import create_server
from lentera.backend import create_app


def test_receiver_cli_heartbeat_and_single_owner(config, tmp_path):
    app = create_app(config)
    server = create_server(app, host="127.0.0.1", port=0)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    cfg = tmp_path / "receiver.toml"
    cfg.write_text("[lentera]\n" + f'database = "{config.database.as_posix()}"\n' +
                   f'legacy_database = "{config.legacy_database.as_posix()}"\n' +
                   f'port = {server.effective_port}\n', encoding="utf-8")
    args = [sys.executable, "-m", "lentera", "--config", str(cfg), "receiver", "--simulate", "--interval", "0.2"]
    process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            if app.extensions["receiver"].read()["ready"] and len(app.extensions["reports"].list()) >= 2:
                break
            if process.poll() is not None:
                raise AssertionError(process.stderr.read().decode())
            time.sleep(.1)
        state = app.extensions["receiver"].read()
        assert state["ready"] and state["mode"] == "simulation"
        assert len(app.extensions["reports"].list()) >= 2
        duplicate = subprocess.run(args, capture_output=True, timeout=8)
        assert duplicate.returncode != 0 and b"Receiver lain masih aktif" in duplicate.stderr
    finally:
        process.terminate()
        process.communicate(timeout=10)
        server.close()
