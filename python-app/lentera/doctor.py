import importlib
import platform
import struct
from .config import ASSETS


def run(config):
    print("OS:", platform.platform(), "CPU:", platform.machine(), "bit:", struct.calcsize('P') * 8)
    print("Python:", platform.python_version())
    for module in ("flask", "waitress", "PySide6", "PySide6.QtWebEngineWidgets", "spidev", "RPi.GPIO"):
        try:
            loaded = importlib.import_module(module)
            print(module, "OK", getattr(loaded, "__version__", ""))
        except ImportError as exc:
            print(module, "TIDAK TERSEDIA:", exc)
    from .maps import Tiles
    try:
        print("Peta:", Tiles(config.mbtiles).metadata().get("name"))
    except Exception as exc:
        print("Peta:", exc)
    for filename in ("map/vendor/maplibre-gl.js", "map/vendor/maplibre-gl.css", "fonts/Inter.ttf", "fonts/JetBrainsMono.ttf"):
        print(filename, "OK" if (ASSETS / filename).exists() else "BELUM TERSEDIA")
    print("Jalankan desktop pada sesi grafis Pi untuk memverifikasi WebGL, resolusi layar, dan akselerasi GPU.")
