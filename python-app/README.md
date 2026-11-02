# LENTERA SAR — Python Desktop

Dari root repository, masuk ke `python-app/` sebelum menjalankan perintah di bawah.

Aplikasi posko SAR untuk Raspberry Pi 4B: **PySide6**, backend **Flask/Waitress**, SQLite lokal, dan penerima **SX1278/Ra-02 melalui SPI/GPIO**. MapLibre tertanam khusus peta, dengan seluruh aset lokal. Runtime baru tidak membutuhkan Node.js.

## Buka dengan satu langkah

**Windows:** klik dua kali `MULAI_LENTERA.cmd`. Launcher membuat `.venv` jika perlu, memasang dependensi yang belum tersedia, memeriksa database/aset, menjalankan layanan, lalu membuka Qt. Mode Windows otomatis **simulasi**, yang menambahkan laporan `LNT-SIM-*`.

**Raspberry Pi:** dari terminal pada desktop Pi:

```bash
bash MULAI_LENTERA.sh --install-system
```

Opsi `--install-system` memasang paket OS yang belum tersedia melalui sudo. Sesudah pemasangan pertama cukup `bash MULAI_LENTERA.sh`; gunakan `--no-install` untuk melarang unduhan saat offline. Di Pi mode otomatis memakai radio nyata. Aktifkan SPI melalui `sudo raspi-config` terlebih dahulu; kegagalan radio tidak diganti menjadi simulasi. Untuk demo di Pi, gunakan `--simulate` secara eksplisit.

Launcher memakai kembali backend/receiver yang sesuai dan sudah aktif. Saat UI ditutup, layanan tetap berjalan. Log ada di `data/logs/`. `python launch_lentera.py --check` hanya memeriksa tanpa memasang atau memulai layanan. Paket peta Jawa dan OSRM opsional dilaporkan bila belum tersedia; launcher tidak mengklaim keduanya sudah siap dan tetap membuka aplikasi untuk laporan SOS.

## Menjalankan proses secara terpisah

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[desktop,test]"
.venv\Scripts\python -m lentera migrate
```

Jalankan tiga proses pada terminal terpisah:

```powershell
.venv\Scripts\python -m lentera backend
.venv\Scripts\python -m lentera receiver --simulate
.venv\Scripts\python -m lentera desktop
```

Pada Pi gunakan `.venv/bin/python` dan hilangkan `--simulate` untuk radio nyata. Backend dan receiver terpisah agar penerimaan tetap berjalan saat desktop ditutup. Akun lama dipertahankan; database kosong menggunakan registrasi pertama, tanpa akun bawaan.

- [Instalasi Pi, konfigurasi, API, peta, dan rollback](docs/MIGRATION.md)
- [Matriks kesetaraan fitur](docs/FEATURE_PARITY.md)
- Pemeriksaan lingkungan: `python -m lentera doctor`
- Pengujian: `python -m pytest -q`
- Smoke test desktop dan screenshot: `python scripts/verify_desktop.py`

Snapshot lama `../shared/database/lentera-legacy.db` tidak diubah: migrasi menyalin ke `data/lentera.db`. Paket peta **Jawa Shortbread MBTiles** tidak ikut Git. Setelah environment siap, pasang paket resmi Geofabrik dari folder `python-app/`:

```powershell
.venv\Scripts\python -m lentera download-map
```

Pada Pi gunakan `.venv/bin/python -m lentera download-map`. Unduhan sekitar 557 MiB, dapat dilanjutkan jika terputus, lalu divalidasi sebelum diaktifkan. File berada di `../shared/map-data/java-shortbread-1.0.mbtiles`. Data OSRM terpisah dan opsional; gangguan rute tidak menghentikan laporan SOS. GPIO/ACK perangkat nyata dan WebGL pada Pi harus diuji di perangkat target.

Sumber React/Express tetap tersedia di `../web-app/` untuk referensi/rollback. Backend dan receiver Python terdahulu disimpan di `legacy/` sebagai referensi; jangan menjalankannya bersamaan dengan runtime baru. Jalankan perintah npm dari `../web-app/`; skrip clean kini hanya menghapus hasil build.
