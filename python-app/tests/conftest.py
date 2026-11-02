from dataclasses import replace
import pytest
from lentera.config import Config
from lentera.backend import create_app


@pytest.fixture
def config(tmp_path):
    return replace(Config(), database=tmp_path / "active.db", legacy_database=tmp_path / "missing.db",
                   mbtiles=tmp_path / "java.mbtiles")


@pytest.fixture
def app(config):
    app = create_app(config)
    app.testing = True
    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def packet():
    return dict(type="SOS_REPORT", message_id="LNT-TEST-001", status="Baru", node_pengirim="NODE-01",
                node_penerima="POSKO-01", latitude=-6.25, longitude=106.85,
                victim_count=2, location_accuracy=10, location_source="PHONE_GPS")
