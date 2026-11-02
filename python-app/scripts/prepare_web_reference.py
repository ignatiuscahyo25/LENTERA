"""Reproducible isolated reference build; never edits original React sources."""
from pathlib import Path
import shutil
import subprocess
import os

root = Path(__file__).resolve().parent.parent
web = root.parent / "web-app"
target = root / "artifacts/web-reference"
target.mkdir(parents=True, exist_ok=True)
shutil.copytree(web / "src", target / "src", dirs_exist_ok=True)
shutil.copy(web / "index.html", target / "index.html")
(target / "package.json").write_text('{"name":"lentera-web-reference","private":true,"type":"module"}', encoding="utf-8")
(target / "vite.config.mjs").write_text("import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import tailwind from '@tailwindcss/vite';export default defineConfig({plugins:[react(),tailwind()]});", encoding="utf-8")
(target / "postcss.config.mjs").write_text("export default {plugins:{}}", encoding="utf-8")
p = target / "src/main.tsx"
p.write_text(p.read_text(encoding="utf-8").replace("import 'leaflet/dist/leaflet.css';", ""), encoding="utf-8")
p = target / "src/components/LoginScreen.tsx"
p.write_text(p.read_text(encoding="utf-8").replace("http://${window.location.hostname}:4000/api", "/api"), encoding="utf-8")
for name in ("RealMap.tsx", "DetailMap.tsx"):
    p = target / "src/components" / name
    s = p.read_text(encoding="utf-8").replace("import * as maplibregl from 'maplibre-gl';", "import maplibregl from 'maplibre-gl';")
    s = s.replace("import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';", "").replace("maplibregl.setWorkerUrl(workerUrl);", "")
    p.write_text(s, encoding="utf-8")
p = target / "src/index.css"
s = p.read_text(encoding="utf-8")
s = s.replace("@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');", "@font-face {font-family:Inter;src:url('/map/fonts/Inter.ttf')}\n@font-face {font-family:'JetBrains Mono';src:url('/map/fonts/JetBrainsMono.ttf')}")
p.write_text(s, encoding="utf-8")
dependencies = ["react@19.0.0", "react-dom@19.0.0", "lucide-react@0.546.0", "motion@12.23.24",
                "maplibre-gl@5.13.0", "vite@6.2.3", "@vitejs/plugin-react@4.4.1", "@tailwindcss/vite@4.1.14",
                "tailwindcss@4.1.14", "postcss@8.5.3", "autoprefixer@10.4.21"]
subprocess.run(["npm.cmd" if os.name == "nt" else "npm", "--prefix", str(target), "install", *dependencies, "--no-audit", "--no-fund"], check=True)
subprocess.run(["node", str(target / "node_modules/vite/bin/vite.js"), "build", str(target)], check=True, cwd=root)
