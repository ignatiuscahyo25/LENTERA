import io
from pathlib import Path
import sqlite3
import pytest
from lentera.map_package import download_java
from test_maps import make_tiles


class Download(io.BytesIO):
    def __init__(self, data, status=200, headers=None):
        super().__init__(data)
        self.status = status
        self.headers = headers or {"Content-Length": str(len(data))}


def package_bytes(tmp_path):
    path = tmp_path / "source.mbtiles"
    make_tiles(path)
    return path.read_bytes()


def test_download_is_validated_and_installed_atomically(tmp_path):
    raw = package_bytes(tmp_path)
    destination = tmp_path / "maps/java.mbtiles"
    result = download_java(destination, lambda _: None, lambda *a, **kw: Download(raw))
    assert result["format"] == "pbf"
    assert destination.read_bytes() == raw
    assert not destination.with_name("java.mbtiles.part").exists()


def test_download_resumes_partial(tmp_path):
    raw = package_bytes(tmp_path)
    destination = tmp_path / "java.mbtiles"
    partial = destination.with_name("java.mbtiles.part")
    partial.write_bytes(raw[:1000])
    def open_url(request, **kwargs):
        assert request.get_header("Range") == "bytes=1000-"
        return Download(raw[1000:], 206, {"Content-Length": str(len(raw)-1000),
                                        "Content-Range": f"bytes 1000-{len(raw)-1}/{len(raw)}"})
    download_java(destination, lambda _: None, open_url)
    assert destination.read_bytes() == raw


def test_server_without_range_restarts_partial(tmp_path):
    raw = package_bytes(tmp_path)
    destination = tmp_path / "java.mbtiles"
    destination.with_name("java.mbtiles.part").write_bytes(b"old incomplete data")
    download_java(destination, lambda _: None, lambda *a, **kw: Download(raw))
    assert destination.read_bytes() == raw


def test_truncated_download_never_becomes_active_package(tmp_path):
    destination = tmp_path / "java.mbtiles"
    with pytest.raises(OSError, match="belum lengkap"):
        download_java(destination, lambda _: None,
                      lambda *a, **kw: Download(b"incomplete", headers={"Content-Length": "999999"}))
    assert not destination.exists()
    assert destination.with_name("java.mbtiles.part").is_file()


def test_existing_valid_package_is_never_downloaded_again(tmp_path):
    destination = tmp_path / "java.mbtiles"
    make_tiles(destination)
    def unexpected(*args, **kwargs):
        pytest.fail("Existing package should be reused")
    assert download_java(destination, lambda _: None, unexpected)["format"] == "pbf"
