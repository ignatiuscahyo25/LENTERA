# LENTERA

Sistem posko SAR untuk menerima laporan SOS melalui LoRa, menyimpan laporan lokal, dan membantu koordinasi operator. Repository ini memuat dua implementasi aplikasi dengan sumber data bersama.

```text
LENTERA/
├── web-app/       # React/TypeScript, Vite, dan backend Express
├── python-app/    # PySide6, backend Flask/Waitress, dan receiver GPIO/SPI
├── shared/        # Paket peta, snapshot database lama, dan alat persiapan data
├── .gitignore
└── README.md
```

## Aplikasi Python

Pada Windows, klik dua kali **`python-app/MULAI_LENTERA.cmd`**. Launcher memeriksa dependensi, menjalankan backend dan receiver simulasi, lalu membuka aplikasi Qt.

Pada Raspberry Pi OS Desktop 64-bit:

```bash
cd python-app
bash MULAI_LENTERA.sh --install-system
```

Pi memakai radio nyata secara default; aktifkan SPI dan pastikan wiring/antena siap. Gunakan `--simulate` untuk demo dan `--no-install` agar launcher tidak mengunduh dependensi. Backend dan receiver tetap berjalan saat jendela ditutup.

[Panduan Python](python-app/README.md) · [Deployment Pi dan rollback](python-app/docs/MIGRATION.md) · [Hasil validasi](python-app/docs/VALIDATION.md)

## Aplikasi web

Sumber web lama dipertahankan di `web-app/`, termasuk React, Express, konfigurasi, dan lockfile npm. Perintah pengembangan dijalankan dari folder tersebut:

```bash
cd web-app
npm ci
npm start
```

Frontend menggunakan port 3000 dan backend port 4000. Backend Python juga memakai port 4000 secara default: jalankan satu backend dalam satu waktu, atau sesuaikan konfigurasi port dan klien.

[Catatan aplikasi web](web-app/README.md)

## Data bersama dan Git

- `shared/map-data/`: paket peta lokal, termasuk data mentah OSM dan MBTiles Jawa bila tersedia.
- `shared/database/lentera-legacy.db`: snapshot database lama untuk migrasi awal. File lokal asli dipertahankan setelah pemindahan.
- `shared/tools/`: alat persiapan data, termasuk pengunduh jalan.
- Database aktif Python berada di `python-app/data/lentera.db`; database aktif web berada di `web-app/data/lentera.db`. Keduanya terpisah dan tidak menyinkronkan perubahan secara otomatis.

Environment, database operator, log, hasil uji, dan paket peta lokal diabaikan Git. Clone baru dapat membuat akun melalui registrasi, tetapi paket peta Jawa dan OSRM perlu dipasang terpisah. Jangan memasukkan database berisi akun operator ke commit.

## Pengujian Python

```bash
cd python-app
python -m venv .venv
# Aktifkan environment sesuai OS, lalu:
python -m pip install -e '.[desktop,test]'
python -m pytest -q
```

Jalankan perintah Git dari root repository. Periksa `git status` sebelum commit dan pastikan database serta paket peta lokal tidak ikut ditambahkan. Menambahkan `.gitignore` tidak menghapus data sensitif yang mungkin sudah masuk riwayat commit terdahulu.
