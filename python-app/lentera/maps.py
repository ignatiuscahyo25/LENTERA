"""Local vector MBTiles adapter and optional OSRM client."""
import json
import math
import sqlite3
import urllib.request
from contextlib import closing
from .services import ServiceError, number

JAVA_BOUNDS = [104.1394, -9.541155, 116.5814, -3.951935]


def inside_java(point):
    return JAVA_BOUNDS[0] <= point[0] <= JAVA_BOUNDS[2] and JAVA_BOUNDS[1] <= point[1] <= JAVA_BOUNDS[3]


class Tiles:
    def __init__(self, path):
        self.path = path
        self._signature = None
        self._metadata = None

    def connection(self):
        if not self.path.is_file():
            raise ServiceError("Paket peta Jawa belum tersedia. Pasang java-shortbread-1.0.mbtiles.", 503)
        return sqlite3.connect(self.path.resolve().as_uri() + "?mode=ro", uri=True)

    def metadata(self):
        try:
            if self.path.is_file():
                stat = self.path.stat()
                signature = (stat.st_mtime_ns, stat.st_size)
                if self._signature == signature and self._metadata is not None:
                    return self._metadata.copy()
            else:
                signature = None
            with closing(self.connection()) as db:
                meta = dict(db.execute("SELECT name,value FROM metadata"))
                layers = json.loads(meta.get("json", "{}")).get("vector_layers", [])
                ids = {layer["id"] for layer in layers}
                if meta.get("format") not in ("pbf", "mvt") or not {"streets", "land", "water_polygons"} <= ids:
                    raise ServiceError("Paket peta harus vector MBTiles berskema Shortbread (Jawa)", 503)
                bounds = [float(x) for x in meta.get("bounds", "").split(",")]
                if len(bounds) != 4 or not all(math.isfinite(x) for x in bounds):
                    raise ValueError("bounds")
                if not (bounds[0] <= 106.85 <= bounds[2] and bounds[1] <= -6.25 <= bounds[3]):
                    raise ServiceError("Paket peta tidak mencakup wilayah acuan Jawa/Jabodetabek", 503)
                self._metadata, self._signature = meta, signature
                return meta.copy()
        except (sqlite3.Error, ValueError, KeyError, TypeError) as exc:
            raise ServiceError("Metadata MBTiles tidak valid", 503) from exc

    def tile(self, z, x, y):
        if not (0 <= z <= 22 and 0 <= x < 2**z and 0 <= y < 2**z):
            raise ServiceError("Koordinat tile tidak valid", 404)
        meta = self.metadata()
        row_y = y if meta.get("scheme", "tms") == "xyz" else (2**z - 1 - y)
        with closing(self.connection()) as db:
            row = db.execute("SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?", (z, x, row_y)).fetchone()
        if not row:
            # Regional MBTiles omit ocean/empty cells; this is not a package failure.
            return b""
        return bytes(row[0])


def route(osrm_url, data):
    points = []
    for key in ("start", "end"):
        p = data.get(key)
        if not isinstance(p, list) or len(p) != 2:
            raise ServiceError("Titik awal dan tujuan wajib berupa [longitude, latitude]")
        p = [number(p[0], "Longitude", -180, 180), number(p[1], "Latitude", -90, 90)]
        if not inside_java(p):
            raise ServiceError("Titik awal atau korban berada di luar cakupan peta offline Jawa")
        points.append(p)
    coords = ";".join(f"{p[0]},{p[1]}" for p in points)
    url = f"{osrm_url.rstrip('/')}/route/v1/driving/{coords}?overview=full&geometries=geojson"
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            result = json.load(response)
        routes = result.get("routes", [])
        if result.get("code") != "Ok" or not routes:
            raise ValueError("Tidak ada rute")
        r = routes[0]
        geom = r["geometry"]
        if geom["type"] != "LineString" or len(geom["coordinates"]) < 2:
            raise ValueError("Geometri tidak valid")
        for p in geom["coordinates"]:
            number(p[0], "Longitude rute", -180, 180)
            number(p[1], "Latitude rute", -90, 90)
        number(r["distance"], "Jarak", 0, 1e10)
        number(r["duration"], "Durasi", 0, 1e10)
        return dict(success=True, geometry=geom, distance=r["distance"], duration=r["duration"])
    except (OSError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise ServiceError("Rute offline belum tersedia. Periksa OSRM dan data jalan Jawa pada port 5000.", 503) from exc
