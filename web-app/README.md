# LENTERA Web App

Implementasi web lama: React/TypeScript dan Vite untuk frontend, Express/better-sqlite3 untuk backend. Sumber UI dan lockfile npm asli dipertahankan setelah pemisahan folder.

Jalankan seluruh perintah npm dari `web-app/`:

```bash
npm ci
npm start
```

`npm run build` membangun frontend ke `dist/`. Backend berjalan pada port 4000, Vite pada port 3000. Jangan menjalankan backend Python pada port yang sama. Instalasi npm tetap membutuhkan versi paket yang tercatat dalam proyek lama; proses reorganisasi ini tidak memperbarui dependency web.

Backend menyimpan database di `web-app/data/lentera.db`, terlepas dari working directory pemanggil. Saat database belum ada, snapshot lokal `shared/database/lentera-legacy.db` disalin bila tersedia. Tanpa snapshot, backend membentuk database melalui inisialisasi yang sudah ada. Snapshot shared tidak dipakai sebagai database tulis.

Opsional: set `LENTERA_WEB_DATABASE` untuk mengganti lokasi database aktif. Path relatif dihitung dari folder `web-app/`. Peta web tetap memerlukan TileServer port 8080 dan OSRM port 5000 sesuai konfigurasi lama; aset `public/` tetap berada di folder aplikasi web.

`README.txt` dan `PASANG_LENTERA_MAP.sh` adalah petunjuk/script integrasi peta deployment lama. Periksa target direktori script sebelum memakainya pada instalasi Pi yang sudah ada.

Database, log, node_modules, dan build tidak ikut Git. Gunakan `npm run clean` hanya untuk menghapus hasil build frontend.
