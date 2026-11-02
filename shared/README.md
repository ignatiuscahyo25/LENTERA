# Data bersama LENTERA

Folder ini menyimpan masukan data yang dapat digunakan kedua aplikasi. SQLite aktif masing-masing aplikasi tetap terpisah agar migrasi dan rollback tidak saling menimpa data.

| Lokasi | Kegunaan |
|---|---|
| `database/lentera-legacy.db` | Snapshot database lama, dibaca untuk migrasi awal; tidak diubah aplikasi |
| `map-data/java-shortbread-1.0.mbtiles` | Paket vector MBTiles Jawa berskema Shortbread untuk aplikasi Python |
| `map-data/maluku.osm.pbf` | Data OSM mentah yang sebelumnya ada; bukan pengganti tile Jawa |
| `tools/download_roads.py` | Mengunduh contoh jalan dari Overpass ke `shared/maps/regions/roads-demo.geojson` |

Database dan paket peta tidak disertakan dalam Git. File yang sudah ada di komputer tetap disimpan di lokasi baru. Untuk clone baru, buat akun melalui aplikasi atau tempatkan snapshot lokal sebelum menjalankan migrasi pertama. Unduh/salin paket peta secara terpisah dan pertahankan atribusi OpenStreetMap/Geofabrik.

Paket Jawa dapat dipasang dari folder `python-app/` dengan environment aktif: `python -m lentera download-map`. Sumber resmi: https://download.geofabrik.de/asia/indonesia/java-shortbread-1.0.mbtiles (sekitar 557 MiB). File `.part` dipakai untuk melanjutkan unduhan; paket baru diaktifkan sesudah validasi SQLite/skema. Paket yang sudah valid digunakan kembali tanpa diunduh ulang.

Contoh menjalankan alat pengunduh dari root repository:

```bash
python shared/tools/download_roads.py -6.362 106.827
```

Tool memerlukan internet saat mengunduh. Runtime aplikasi dapat memakai hasil lokal secara offline bila sudah diintegrasikan; peta Python utama menggunakan MBTiles, bukan berkas jalan contoh tersebut.
