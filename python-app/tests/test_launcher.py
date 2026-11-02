from dataclasses import replace
import argparse
import importlib.util
from pathlib import Path
import socket
import subprocess
import time
from unittest.mock import Mock
import pytest
import launch_lentera as launcher


@pytest.mark.parametrize("pi,simulate,hardware,expected", [
    (False, False, False, "simulation"), (True, False, False, "hardware"),
    (True, True, False, "simulation"), (False, False, True, "hardware")])
def test_mode_selection(monkeypatch, pi, simulate, hardware, expected):
    monkeypatch.setattr(launcher, "is_pi", lambda: pi)
    assert launcher.choose_mode(argparse.Namespace(simulate=simulate, hardware=hardware)) == expected


def test_wrong_backend_database_is_rejected(config, monkeypatch):
    monkeypatch.setattr(launcher, "fetch_json", lambda _: dict(name="LENTERA Python", database_id="other"))
    with pytest.raises(launcher.LaunchError, match="database berbeda"):
        launcher.compatible_backend(config)


def test_ready_receiver_is_reused(config, tmp_path, monkeypatch):
    monkeypatch.setattr(launcher, "receiver_state", lambda _: dict(alive=True, ready=True, mode="hardware"))
    spawn = Mock()
    monkeypatch.setattr(launcher, "spawn_service", spawn)
    launcher.ensure_receiver(Path("python"), tmp_path / "config", config, tmp_path, "hardware")
    spawn.assert_not_called()


def test_mode_change_never_silently_replaces_receiver(config, tmp_path, monkeypatch):
    monkeypatch.setattr(launcher, "receiver_state", lambda _: dict(alive=True, ready=True, mode="hardware"))
    spawn = Mock()
    monkeypatch.setattr(launcher, "spawn_service", spawn)
    with pytest.raises(launcher.LaunchError, match="mode berbeda"):
        launcher.ensure_receiver(Path("python"), tmp_path / "config", config, tmp_path, "simulation")
    spawn.assert_not_called()


def test_hardware_failure_does_not_fallback(config, tmp_path, monkeypatch):
    monkeypatch.setattr(launcher, "receiver_state", lambda _: dict(alive=False))
    process = Mock()
    process.poll.return_value = 1
    spawn = Mock(return_value=process)
    monkeypatch.setattr(launcher, "spawn_service", spawn)
    (tmp_path / "receiver.log").write_text("SX1278 tidak terbaca", encoding="utf-8")
    with pytest.raises(launcher.LaunchError, match="SX1278"):
        launcher.ensure_receiver(Path("python"), tmp_path / "config", config, tmp_path, "hardware")
    assert spawn.call_count == 1 and spawn.call_args.args[-1] == "hardware"


def test_hardware_requires_pi(monkeypatch):
    monkeypatch.setattr(launcher, "is_pi", lambda: False)
    with pytest.raises(launcher.LaunchError, match="Raspberry Pi"):
        launcher.hardware_preflight(Path("python"))


def test_missing_radio_libraries_can_be_installed(monkeypatch):
    monkeypatch.setattr(launcher, "is_pi", lambda: True)
    monkeypatch.setattr(launcher.platform, "architecture", lambda: ("64bit", ""))
    original_exists = Path.exists
    monkeypatch.setattr(Path, "exists", lambda path: True if path.as_posix() == "/dev/spidev0.0" else original_exists(path))
    monkeypatch.setattr(launcher.os, "access", lambda *args: True)
    probe = Mock(side_effect=[argparse.Namespace(returncode=1, stderr="missing spidev"),
                              argparse.Namespace(returncode=0, stderr="")])
    monkeypatch.setattr(launcher.subprocess, "run", probe)
    install = Mock()
    monkeypatch.setattr(launcher, "execute", install)
    launcher.hardware_preflight(Path("python"), allow_install=True)
    assert install.call_count == 2
    assert install.call_args.args[0][-2:] == ["spidev", "RPi.GPIO"]


def test_incomplete_assets_block_launch(tmp_path, monkeypatch):
    monkeypatch.setattr(launcher, "ROOT", tmp_path)
    with pytest.raises(launcher.LaunchError, match="Aset aplikasi tidak lengkap"):
        launcher.require_assets()


def test_offline_check_never_installs(tmp_path, monkeypatch):
    monkeypatch.setattr(launcher, "venv_python", lambda: tmp_path / "missing/python")
    execute = Mock()
    monkeypatch.setattr(launcher, "execute", execute)
    args = argparse.Namespace(check=True, no_install=False, install_system=False)
    with pytest.raises(launcher.LaunchError, match="Environment"):
        launcher.prepare_environment(args)
    execute.assert_not_called()


@pytest.mark.skipif(importlib.util.find_spec("PySide6") is None, reason="requires desktop extra")
def test_live_launcher_starts_and_reuses_services(config, tmp_path, monkeypatch):
    # No desktop/GPIO and no operational data are touched.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    config = replace(config, port=port)
    cfg = tmp_path / "launcher.toml"
    cfg.write_text("[lentera]\n" + f'database = "{config.database.as_posix()}"\n' +
                   f'legacy_database = "{config.legacy_database.as_posix()}"\n' +
                   f'mbtiles = "{config.mbtiles.as_posix()}"\n' + f'port = {port}\n', encoding="utf-8")
    children = []
    real_spawn = launcher.spawn_service
    def spawn(*args):
        child = real_spawn(*args)
        children.append(child)
        return child
    monkeypatch.setattr(launcher, "spawn_service", spawn)
    args = ["--no-install", "--prepared", "--no-desktop", "--simulate", "--config", str(cfg)]
    try:
        assert launcher.main(args) == 0
        assert len(children) == 2
        assert launcher.main(args) == 0
        assert len(children) == 2  # Repeat launch never starts another backend or receiver.
        state = launcher.receiver_state(config)
        assert state["ready"] and state["mode"] == "simulation"
    finally:
        for child in reversed(children):
            child.terminate()
            child.wait(timeout=10)
