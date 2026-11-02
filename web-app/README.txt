LENTERA POSKO - paket integrasi peta langsung

1. Ekstrak ZIP dan jalankan:
   bash PASANG_LENTERA_MAP.sh
   (dari folder hasil ekstrak di Raspberry Pi)
2. Script membuat backup file lama di folder proyek, menyalin komponen, lalu npm run build.
3. TileServer (port 8080) harus sedang berjalan saat peta digunakan.
4. Setelah build, akses dashboard dengan cara produksi biasa. Jangan jalankan node server.js kedua jika sudah berjalan.
5. Apabila build gagal, kirim error. Rollback dari folder backup tercetak di terminal.

Peta: endpoint http://<hostname-dashboard>:8080/data/java-shortbread-1.0/{z}/{x}/{y}.pbf
Routing: http://<hostname-dashboard>:5000/route/v1/driving/... (belum terpasang)

PENTING:
- Ini mengganti dua komponen peta Leaflet menjadi MapLibre; data report dan callback tetap.
- Navigasi manual tersedia pada peta Detail SOS, tetapi gambar garis rute memerlukan OSRM aktif dan data jalan.
- Belum ada label jalan: style lokal saat ini hanya jalan/bangunan/perairan. Font lokal dan label menyusul.
- TileServer merespons melalui port 8080; verifikasi dapat diakses dari perangkat SAR di jaringan lokal.
- Jangan menyatakan siap operasional sebelum tes tanpa internet, cakupan, akurasi, jalur tertutup, daya cadangan, dan keamanan.
