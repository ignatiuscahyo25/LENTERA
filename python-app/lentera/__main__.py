import argparse
import logging
import sys
from .config import Config


def main():
    parser = argparse.ArgumentParser(description="LENTERA Python Desktop / LoRa gateway")
    parser.add_argument("--config", help="Path konfigurasi TOML")
    sub = parser.add_subparsers(dest="command", required=True)
    for command in ("backend", "desktop", "migrate", "doctor", "download-map"):
        sub.add_parser(command)
    rec = sub.add_parser("receiver")
    rec.add_argument("--simulate", action="store_true", help="Tanpa GPIO; menghasilkan laporan bertanda SIM")
    rec.add_argument("--interval", type=float, default=10)
    args = parser.parse_args()
    config = Config.load(args.config)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if args.command == "backend":
        from .backend import serve
        serve(config)
    elif args.command == "desktop":
        from .desktop.main import run
        sys.exit(run(config))
    elif args.command == "receiver":
        if args.interval < 0.1:
            parser.error("interval minimal 0.1 detik")
        from .radio.receiver import run
        run(config, args.simulate, args.interval)
    elif args.command == "migrate":
        from .storage import Database
        Database(config.database).initialize(config.legacy_database)
        print(f"Database aktif: {config.database}; database lama tidak diubah")
    elif args.command == "download-map":
        from .map_package import download_java
        download_java(config.mbtiles, progress=lambda text: print(text, flush=True))
    else:
        from .doctor import run
        run(config)


if __name__ == "__main__":
    main()
