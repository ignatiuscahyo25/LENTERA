import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# ======================================
# LENTERA OFFLINE ROAD DOWNLOADER
# ======================================

# Koordinat contoh untuk pengujian.
# Bisa diganti ke wilayah mana saja.

latitude = float(sys.argv[1]) if len(sys.argv) > 1 else -6.362
longitude = float(sys.argv[2]) if len(sys.argv) > 2 else 106.827

# Radius pengambilan data dalam meter
radius = 300

query = f"""
[out:json][timeout:60];
way(around:{radius},{latitude},{longitude})
["highway"];
out geom;
"""

print("[LENTERA] Mengunduh data jalan...")

url = "https://overpass.kumi.systems/api/interpreter"

data = urllib.parse.urlencode({
    "data": query
}).encode("utf-8")

request = urllib.request.Request(
    url,
    data=data,
    headers={
        "User-Agent": "LENTERA-OfflineMap-Prototype/1.0"
    }
)

try:

    with urllib.request.urlopen(
        request,
        timeout=90
    ) as response:

        result = json.load(response)

except Exception as error:

    print("[ERROR]", error)
    sys.exit(1)


features = []

for element in result.get("elements", []):

    geometry = element.get("geometry", [])

    coordinates = [
        [point["lon"], point["lat"]]
        for point in geometry
    ]

    if len(coordinates) < 2:
        continue

    features.append({

        "type": "Feature",

        "properties": {
            "name": element.get(
                "tags", {}
            ).get("name", "Jalan tanpa nama"),

            "highway": element.get(
                "tags", {}
            ).get("highway", "unknown")
        },

        "geometry": {
            "type": "LineString",
            "coordinates": coordinates
        }
    })


geojson = {
    "type": "FeatureCollection",
    "features": features
}


output = Path(
    "public/maps/regions/roads-demo.geojson"
)

output.parent.mkdir(
    parents=True,
    exist_ok=True
)

with open(
    output,
    "w",
    encoding="utf-8"
) as file:

    json.dump(geojson, file)


print("[LENTERA] DOWNLOAD SUCCESS")
print("[LENTERA] Total jalan:", len(features))
print("[LENTERA] File:", output)
print("[LENTERA] Data siap digunakan offline")
