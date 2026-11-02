import gzip
import io
import json
import sqlite3
import pytest
from lentera.maps import Tiles, route
from lentera.services import ServiceError


def make_tiles(path, scheme="tms", data=b"tile"):
    with sqlite3.connect(path) as db:
        db.executescript("CREATE TABLE metadata(name TEXT,value TEXT); CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB);")
        meta = dict(format="pbf", scheme=scheme, bounds="104.1394,-9.541155,116.5814,-3.951935",
                    json=json.dumps(dict(vector_layers=[dict(id=x) for x in ("streets", "land", "water_polygons")])))
        db.executemany("INSERT INTO metadata VALUES (?,?)", meta.items())
        db.execute("INSERT INTO tiles VALUES (1,1,?,?)", (0 if scheme == "tms" else 1, data))


@pytest.mark.parametrize("scheme", ["tms", "xyz"])
@pytest.mark.parametrize("compress", [True, False])
def test_tiles_scheme_and_gzip(config, client, scheme, compress):
    data = gzip.compress(b"vector tile") if compress else b"vector tile"
    make_tiles(config.mbtiles, scheme, data)
    response = client.get("/map/tiles/1/1/1.pbf")
    assert response.status_code == 200 and response.data == data
    assert (response.headers.get("Content-Encoding") == "gzip") is compress
    assert client.get("/map/tiles/1/2/1.pbf").status_code == 404
    assert client.get("/map/tiles/1/0/0.pbf").status_code == 204


def test_wrong_schema_rejected(config):
    make_tiles(config.mbtiles)
    with sqlite3.connect(config.mbtiles) as db:
        db.execute("UPDATE metadata SET value='{}' WHERE name='json'")
    with pytest.raises(ServiceError, match="Shortbread"):
        Tiles(config.mbtiles).metadata()


def test_metadata_cache_detects_changed_package(config):
    make_tiles(config.mbtiles)
    tiles = Tiles(config.mbtiles)
    assert tiles.metadata()["format"] == "pbf"
    with sqlite3.connect(config.mbtiles) as db:
        db.execute("UPDATE metadata SET value='{}' WHERE name='json'")
    with pytest.raises(ServiceError, match="Shortbread"):
        tiles.metadata()


def test_route_and_unavailable(client, monkeypatch):
    data = {"start": [106.85, -6.25], "end": [106.86, -6.26]}
    assert client.post("/api/route", json=dict(data, start=[130, -3])).status_code == 400
    def fail(*args, **kwargs):
        raise OSError("not running")
    monkeypatch.setattr("urllib.request.urlopen", fail)
    assert client.post("/api/route", json=data).status_code == 503
    result = dict(code="Ok", routes=[dict(distance=1250, duration=180,
                    geometry=dict(type="LineString", coordinates=[data["start"], data["end"]]))])
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **kw: io.BytesIO(json.dumps(result).encode()))
    response = client.post("/api/route", json=data).get_json()
    assert response["distance"] == 1250 and response["duration"] == 180


def test_map_assets_local(client):
    assert client.get("/map/index.html").status_code == 200
    assert client.get("/map/vendor/maplibre-gl.js").status_code == 200
    assert client.get("/").status_code == 404  # No browser dashboard in desktop deployment.
