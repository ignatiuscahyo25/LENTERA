"""Path regressions for the split repository layout."""
import json
from pathlib import Path
import shutil
import subprocess
import pytest
from lentera.config import Config, ROOT, SHARED


def test_defaults_match_repository_config():
    config = Config.load(ROOT / "lentera.toml")
    assert ROOT.name == "python-app"
    assert SHARED == ROOT.parent / "shared"
    assert config.database.resolve() == (ROOT / "data/lentera.db").resolve()
    assert config.legacy_database.resolve() == (SHARED / "database/lentera-legacy.db").resolve()
    assert config.mbtiles.resolve() == (SHARED / "map-data/java-shortbread-1.0.mbtiles").resolve()
    assert (ROOT.parent / "web-app/src/App.tsx").is_file()


@pytest.mark.skipif(shutil.which("node") is None, reason="Node required for web path smoke check")
def test_web_database_seed_is_independent_of_working_directory(tmp_path):
    web = tmp_path / "web-app"
    web.mkdir()
    snapshot = tmp_path / "shared/database/lentera-legacy.db"
    snapshot.parent.mkdir(parents=True)
    snapshot.write_bytes(b"legacy snapshot fixture")
    source = (ROOT.parent / "web-app/server.js").read_text(encoding="utf-8")
    # Execute the real bootstrap with only better-sqlite3 replaced by a path probe.
    bootstrap = source[source.index("const dbPath ="):source.index("// =======================")]
    code = ("import path from 'node:path';import fs from 'node:fs';"
            "const __dirname=" + json.dumps(str(web)) + ";"
            "class Database {constructor(p){this.path=p}};" + bootstrap +
            "process.stdout.write(db.path);")
    result = subprocess.run([shutil.which("node"), "--input-type=module", "-e", code],
                            cwd=tmp_path, check=True, capture_output=True, text=True)
    active = web / "data/lentera.db"
    assert Path(result.stdout).resolve() == active.resolve()
    assert active.read_bytes() == snapshot.read_bytes()
    active.write_bytes(b"active application changes")
    subprocess.run([shutil.which("node"), "--input-type=module", "-e", code],
                   cwd=tmp_path, check=True, capture_output=True)
    assert active.read_bytes() == b"active application changes"
    assert snapshot.read_bytes() == b"legacy snapshot fixture"


def test_clean_only_targets_frontend_build():
    manifest = json.loads((ROOT.parent / "web-app/package.json").read_text())
    script = manifest["scripts"]["clean"]
    assert "rmSync('dist'" in script
    assert "server.js" not in script and "lentera.db" not in script


@pytest.mark.skipif(shutil.which("git") is None, reason="Git required for ignore smoke check")
def test_private_runtime_data_excluded_from_git():
    result = subprocess.run(["git", "check-ignore", "shared/database/lentera-legacy.db",
                             "shared/map-data/java-shortbread-1.0.mbtiles", "python-app/data/lentera.db",
                             "web-app/data/lentera.db", "python-app/.venv/pyvenv.cfg"],
                            cwd=ROOT.parent, check=True, capture_output=True, text=True)
    assert len(result.stdout.splitlines()) == 5
