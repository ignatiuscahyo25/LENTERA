"""One-command bootstrap and launcher; only the Python standard library is needed.

Background services deliberately survive the desktop. Existing compatible services
are reused. This script never stops an unknown process or falls back from hardware.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
VENV = ROOT / ".venv"


class LaunchError(Exception):
    pass


def say(message):
    print(f"[LENTERA] {message}", flush=True)


def is_pi():
    try:
        return "Raspberry Pi" in Path("/proc/device-tree/model").read_text()
    except OSError:
        return False


def venv_python():
    return VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def execute(args, **kwargs):
    try:
        return subprocess.run([str(a) for a in args], check=True, cwd=ROOT, **kwargs)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise LaunchError(f"Perintah gagal: {args[0]}. {exc}") from exc


def install_system():
    if not is_pi() or not shutil.which("apt-get"):
        raise LaunchError("--install-system hanya untuk Raspberry Pi OS berbasis Debian.")
    packages = ["python3-venv", "python3-spidev", "python3-rpi.gpio", "libegl1", "libopengl0",
                "libnss3", "libxkbcommon-x11-0", "libxcb-cursor0"]
    missing = []
    for package in packages:
        result = subprocess.run(["dpkg-query", "-W", "-f=${Status}", package], capture_output=True, text=True)
        if result.returncode or "install ok installed" not in result.stdout:
            missing.append(package)
    if missing:
        prefix = [] if os.geteuid() == 0 else ["sudo"]
        say("Memasang paket Raspberry Pi OS: " + ", ".join(missing))
        execute([*prefix, "apt-get", "update"])
        execute([*prefix, "apt-get", "install", "-y", *missing])
    else:
        say("Paket sistem Raspberry Pi OS sudah tersedia.")


def dependency_probe(python):
    code = "import flask, waitress; from PySide6 import QtWidgets, QtWebEngineWidgets, QtWebChannel"
    try:
        return subprocess.run([str(python), "-c", code], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise LaunchError(f"Python environment tidak dapat dijalankan: {exc}") from exc


def prepare_environment(args):
    if sys.version_info < (3, 11):
        raise LaunchError("Pasang Python 3.11 atau lebih baru, lalu buka launcher kembali.")
    python = venv_python()
    if args.install_system and not args.check and not args.no_install:
        install_system()
    if not python.exists():
        if args.check or args.no_install:
            raise LaunchError("Environment .venv belum tersedia. Jalankan launcher tanpa --check/--no-install sekali saat online.")
        say("Membuat environment Python .venv…")
        command = [sys.executable, "-m", "venv"]
        if is_pi():
            command.append("--system-site-packages")
        execute([*command, VENV])
    result = dependency_probe(python)
    if result.returncode:
        if args.check or args.no_install:
            raise LaunchError("Dependensi belum lengkap:\n" + result.stderr.strip())
        # A partially created venv can contain Python but not pip.
        pip = subprocess.run([str(python), "-m", "pip", "--version"], capture_output=True)
        if pip.returncode:
            execute([python, "-m", "ensurepip", "--upgrade"])
        say("Memasang dependensi Python/PySide6 (internet diperlukan pada pemasangan pertama)…")
        execute([python, "-m", "pip", "install", "-e", str(ROOT) + "[desktop]"])
        result = dependency_probe(python)
        if result.returncode:
            raise LaunchError("Qt/WebEngine tidak dapat dimuat:\n" + result.stderr.strip() +
                              "\nPada Pi gunakan OS Desktop 64-bit dan --install-system; periksa kecocokan wheel/glibc.")
    return python


def fetch_json(url, timeout=2):
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    # Local service checks must not be redirected through the machine's HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=timeout) as response:
        result = json.load(response)
    if not isinstance(result, dict):
        raise ValueError("Respons bukan objek JSON")
    return result


def require_assets():
    required = ["theme.qss", "icon.svg", "eye.svg", "fonts/Inter.ttf", "fonts/JetBrainsMono.ttf",
                "map/index.html", "map/map.js", "map/map.css", "map/style.js",
                "map/vendor/maplibre-gl.js", "map/vendor/maplibre-gl.css", "map/vendor/qwebchannel.js"]
    missing = [name for name in required if not (ROOT / "lentera/assets" / name).is_file()]
    if missing:
        raise LaunchError("Aset aplikasi tidak lengkap. Salin ulang folder proyek:\n" + "\n".join(missing))


def choose_mode(args):
    if args.hardware:
        return "hardware"
    if args.simulate:
        return "simulation"
    return "hardware" if is_pi() else "simulation"


def hardware_preflight(python, allow_install=False):
    if not is_pi():
        raise LaunchError("Radio GPIO memerlukan Raspberry Pi. Untuk komputer ini gunakan --simulate.")
    if platform.architecture()[0] != "64bit":
        raise LaunchError("Gunakan Raspberry Pi OS Desktop 64-bit untuk PySide6/WebEngine.")
    device = Path("/dev/spidev0.0")
    if not device.exists():
        raise LaunchError("SPI0/CE0 belum tersedia. Aktifkan SPI lewat sudo raspi-config, lalu reboot Pi.")
    if not os.access(device, os.R_OK | os.W_OK):
        raise LaunchError("Tidak memiliki akses SPI. Tambahkan akun ke grup spi dan gpio, lalu logout/login:\n"
                          "sudo usermod -aG spi,gpio " + os.environ.get("USER", "pi"))
    code = "import spidev; import RPi.GPIO"
    result = subprocess.run([str(python), "-c", code], capture_output=True, text=True)
    if result.returncode and allow_install:
        say("Memasang library radio ke environment Python…")
        execute([python, "-m", "ensurepip", "--upgrade"])
        execute([python, "-m", "pip", "install", "spidev", "RPi.GPIO"])
        result = subprocess.run([str(python), "-c", code], capture_output=True, text=True)
    if result.returncode:
        raise LaunchError("Library radio belum tersedia di .venv. Pada Pi jalankan launcher dengan --install-system.\n"
                          "Bila .venv dibuat tanpa --system-site-packages, gunakan: .venv/bin/python -m pip install spidev RPi.GPIO\n"
                          + result.stderr.strip())


def command(python, config_path, name, *args):
    return [str(python), "-m", "lentera", "--config", str(config_path), name, *args]


def spawn_service(python, config_path, name, log_dir, mode):
    path = log_dir / f"{name}.log"
    args = command(python, config_path, name, *( ["--simulate"] if name == "receiver" and mode == "simulation" else []))
    options = {"cwd": ROOT, "stdin": subprocess.DEVNULL, "close_fds": True}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        options["start_new_session"] = True
    with path.open("ab") as output:
        output.write(f"\n--- launcher {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n".encode())
        output.flush()
        process = subprocess.Popen(args, stdout=output, stderr=subprocess.STDOUT, **options)
    say(f"{name} dimulai (PID {process.pid}). Log: {path}")
    return process


def log_tail(path):
    try:
        return path.read_text(encoding="utf-8", errors="replace")[-3000:]
    except OSError:
        return "Log belum tersedia."


def compatible_backend(config):
    info = fetch_json(config.api_url + "/api")
    if info.get("name") != "LENTERA Python" or info.get("database_id") != config.database_id:
        raise LaunchError(f"Port {config.port} dipakai layanan lain atau database berbeda. "
                          "Hentikan backend lama atau sesuaikan lentera.toml; launcher tidak akan menghentikannya.")
    return info


def ensure_backend(python, config_path, config, log_dir, mode):
    try:
        compatible_backend(config)
        say("Backend Python yang sesuai sudah aktif; digunakan kembali.")
        return
    except LaunchError:
        raise
    except (OSError, ValueError):
        # A busy port with an HTML response may belong to the legacy Node server.
        try:
            with socket.create_connection((config.host, config.port), timeout=1):
                raise LaunchError(f"Port {config.port} sedang dipakai tetapi bukan backend Python yang sesuai. Periksa proses lama.")
        except OSError:
            pass
    process = spawn_service(python, config_path, "backend", log_dir, mode)
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise LaunchError("Backend gagal dimulai:\n" + log_tail(log_dir / "backend.log"))
        try:
            compatible_backend(config)
            say("Backend siap; database sudah diperiksa/dimigrasikan oleh backend.")
            return
        except (OSError, ValueError):
            time.sleep(.3)
    raise LaunchError("Backend belum siap setelah 25 detik. Periksa " + str(log_dir / "backend.log"))


def receiver_state(config):
    result = fetch_json(config.api_url + "/api/system")
    state = result.get("receiver")
    if not isinstance(state, dict):
        raise LaunchError("Respons status receiver tidak valid")
    return state


def ensure_receiver(python, config_path, config, log_dir, mode):
    state = receiver_state(config)
    if state.get("alive"):
        if state.get("mode") != mode:
            raise LaunchError("Receiver aktif memakai mode berbeda. Hentikan receiver tersebut sebelum mengganti hardware/simulasi.")
        if state.get("ready"):
            say(f"Receiver {mode} sudah siap; digunakan kembali.")
            return
        raise LaunchError("Receiver aktif tetapi belum siap: " + str(state.get("last_error") or "periksa log receiver"))
    process = spawn_service(python, config_path, "receiver", log_dir, mode)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise LaunchError("Receiver gagal dimulai; tidak berpindah ke simulasi:\n" + log_tail(log_dir / "receiver.log"))
        try:
            state = receiver_state(config)
            if state.get("alive") and state.get("ready") and state.get("mode") == mode:
                say(f"Receiver {mode} siap menerima.")
                return
        except (OSError, ValueError):
            pass
        time.sleep(.3)
    raise LaunchError("Receiver belum siap setelah 20 detik. Periksa " + str(log_dir / "receiver.log"))


def optional_services(config):
    from lentera.maps import Tiles
    from lentera.services import ServiceError
    try:
        Tiles(config.mbtiles).metadata()
        say("Paket peta Jawa tersedia.")
    except ServiceError as exc:
        say(f"PETA BELUM SIAP: {exc} Lokasi paket: {config.mbtiles}")
    try:
        info = fetch_json(config.osrm_url.rstrip("/") + "/nearest/v1/driving/106.85,-6.25?number=1")
        if info.get("code") != "Ok":
            raise ValueError("data jalan tidak tersedia")
        say("OSRM lokal merespons; fitur rute tersedia untuk diuji.")
    except (OSError, ValueError):
        say("OSRM belum tersedia (opsional). Aplikasi tetap dibuka; perhitungan rute belum dapat digunakan.")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Siapkan dan buka LENTERA dalam satu langkah")
    parser.add_argument("--config", type=Path, default=Path(os.environ.get("LENTERA_CONFIG", ROOT / "lentera.toml")))
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--simulate", action="store_true")
    mode.add_argument("--hardware", action="store_true")
    parser.add_argument("--check", action="store_true", help="Periksa saja; tidak memasang atau menjalankan layanan")
    parser.add_argument("--no-install", action="store_true", help="Jangan mengunduh dependensi; cocok saat offline")
    parser.add_argument("--install-system", action="store_true", help="Pasang paket apt Raspberry Pi OS yang belum tersedia (memerlukan sudo)")
    parser.add_argument("--no-desktop", action="store_true", help="Jalankan layanan saja, tanpa membuka Qt")
    parser.add_argument("--prepared", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        python = prepare_environment(args)
        if Path(sys.executable).absolute() != python.absolute() and not args.prepared:
            # All later probes use exactly the same dependencies as the application.
            return subprocess.call([str(python), str(Path(__file__).resolve()), *(argv if argv is not None else sys.argv[1:]), "--prepared"], cwd=ROOT)
        from lentera.config import Config
        from lentera.radio.receiver import ProcessLock
        config_path = args.config.resolve()
        if not config_path.is_file():
            raise LaunchError(f"Konfigurasi tidak ditemukan: {config_path}")
        config = Config.load(config_path)
        if config.host not in ("127.0.0.1", "localhost"):
            raise LaunchError("Launcher lokal memerlukan host 127.0.0.1 atau localhost dalam konfigurasi.")
        selected_mode = choose_mode(args)
        say(f"Python: {python}\nMode: {selected_mode}\nDatabase: {config.database}")
        require_assets()
        if selected_mode == "hardware":
            hardware_preflight(python, allow_install=not (args.check or args.no_install))
        elif not args.check:
            say("SIMULASI: laporan LNT-SIM-* akan ditambahkan; tidak memakai GPIO atau mengirim radio.")
        if not args.no_desktop and sys.platform.startswith("linux") and not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
            raise LaunchError("Sesi grafis tidak tersedia. Jalankan dari desktop Pi atau gunakan --no-desktop untuk layanan saja.")
        optional_services(config)
        if args.check:
            say("Pemeriksaan kebutuhan wajib selesai. Tidak ada layanan baru yang dijalankan.")
            return 0
        config.database.parent.mkdir(parents=True, exist_ok=True)
        log_dir = config.database.parent / "logs"
        log_dir.mkdir(exist_ok=True)
        # Serialize launchers so rapid double clicks never spawn duplicate services.
        with ProcessLock(config.database.parent / "launcher.lock"):
            ensure_backend(python, config_path, config, log_dir, selected_mode)
            ensure_receiver(python, config_path, config, log_dir, selected_mode)
        if args.no_desktop:
            say("Layanan siap. Backend dan receiver tetap berjalan di background.")
            return 0
        say("Membuka aplikasi desktop…")
        result = subprocess.call(command(python, config_path, "desktop"), cwd=ROOT)
        if result:
            raise LaunchError(f"Desktop berhenti dengan kode {result}. Periksa pesan Qt di atas; backend dan receiver tetap berjalan.")
        say("Desktop ditutup. Backend dan receiver tetap berjalan agar SOS masih dapat diterima.")
        return 0
    except (LaunchError, OSError, ValueError, RuntimeError) as exc:
        say("GAGAL: " + str(exc))
        return 1
    except KeyboardInterrupt:
        say("Launcher dibatalkan. Layanan yang sudah aktif tetap berjalan.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
