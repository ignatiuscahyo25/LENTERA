# LENTERA Python desktop

Runtime terdiri dari backend Python (Flask/Waitress), receiver Python SX1278, dan desktop PySide6. Desktop tidak menjalankan receiver dan tidak membuka SQLite. Menutup desktop atau logout tidak menghentikan penerimaan radio. WebEngine hanya menampilkan peta MapLibre lokal; tidak ada React/npm/Node pada runtime baru. OSRM opsional tetap merupakan program eksternal.

## Launcher otomatis

Klik dua kali `MULAI_LENTERA.cmd` pada Windows, atau jalankan `bash MULAI_LENTERA.sh` pada sesi desktop Pi. Pemasangan awal memerlukan Python 3.11+ dan internet jika dependensi belum tersedia. Launcher akan membuat environment, menguji impor Qt/WebEngine, mengecek aset, menjalankan backend sampai API siap, memastikan receiver siap, kemudian membuka jendela aplikasi. Database baru dimigrasikan oleh backend menggunakan mekanisme salinan yang sama.

Windows/komputer non-Pi memakai simulasi dengan laporan bertanda SIM; Pi otomatis memakai hardware. `--hardware` dan `--simulate` dapat dipilih secara eksplisit. `--check` tidak memasang atau memulai proses; `--no-install` melarang pemasangan dependensi; `--no-desktop` hanya menjalankan layanan; `--config /lokasi/lentera.toml` memilih konfigurasi lain. `--install-system` mengizinkan pemasangan paket apt yang belum tersedia pada Raspberry Pi OS, menggunakan sudo bila diperlukan.

Receiver hardware memerlukan SPI aktif (`sudo raspi-config`), akses grup spi/gpio, serta modul Python `spidev` dan `RPi.GPIO`. Environment baru di Pi dibuat dengan `--system-site-packages` agar dapat memakai paket GPIO dari apt. Jika environment lama tidak memiliki opsi tersebut, pasang library radio ke `.venv` sesuai pesan launcher. Launcher tidak mengubah wiring, konfigurasi boot/SPI, grup akun, atau menonaktifkan sandbox Chromium secara otomatis.

Backend yang cocok dikenali lewat nama aplikasi dan fingerprint lokasi database di `/api`. Port yang dipakai Node, backend versi lama tanpa fingerprint, atau backend dengan database lain ditolak dengan pesan; proses tersebut tidak dihentikan otomatis. Receiver aktif dengan mode berbeda juga tidak diganti otomatis. Layanan systemd yang cocok dapat digunakan kembali. Lock mencegah dua launcher memulai layanan bersamaan.

Log background berada di direktori `logs` di sebelah database aktif (default `data/logs/backend.log` dan `receiver.log`). Layanan yang sudah dimulai tetap hidup jika Qt ditutup atau startup komponen lain gagal; pesan kegagalan menyebutkan lokasi log. Pada deployment Pi permanen, systemd tetap disarankan untuk restart otomatis dan startup sesudah reboot. Launcher biasa tidak memasang unit systemd atau menjamin restart sesudah reboot.

MapLibre/font wajib tersedia secara lokal. MBTiles Jawa dan OSRM tetap dependensi opsional: kekurangannya dilaporkan, tanpa menghalangi pembukaan dashboard SOS. Impor Qt yang berhasil belum membuktikan WebGL atau koneksi radio lapangan; receiver nyata dan peta tetap membutuhkan pemeriksaan perangkat.

## Menjalankan di Windows untuk pengembangan

Python 3.11 atau lebih baru diperlukan. Dari folder `python-app/`:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[desktop,test]"
.venv\Scripts\python -m lentera doctor
.venv\Scripts\python -m lentera migrate
```

Jalankan masing-masing pada terminal terpisah:

```powershell
.venv\Scripts\python -m lentera backend
.venv\Scripts\python -m lentera receiver --simulate
.venv\Scripts\python -m lentera desktop
```

Simulasi menghasilkan laporan `LNT-SIM-*` dari `NODE-SIM-01`, bukan transmisi radio. Tanpa akun lama, buat akun pertama melalui halaman registrasi. Tidak ada password bawaan pada database kosong. Uji:

```powershell
.venv\Scripts\python -m pytest -q
```

## Raspberry Pi 4B

Target: Raspberry Pi OS Desktop **64-bit**, RAM minimal 4 GB, layar 1280×720 atau lebih besar. Jalankan sebagai pengguna desktop biasa, bukan root. Qt WebEngine membutuhkan sesi grafis dan dukungan WebGL. Jangan menonaktifkan sandbox Chromium untuk deployment normal.

1. Salin seluruh repository ke `/opt/lentera`, termasuk `python-app`, `web-app`, dan `shared`. Pastikan direktori `python-app/data` dapat ditulis oleh pengguna operator. Contoh berikut menggunakan akun `pi`; ganti jika nama akun berbeda.
2. Aktifkan SPI melalui `sudo raspi-config` → Interface Options → SPI. Pastikan antena 433 MHz terpasang dan wiring sesuai sebelum receiver hardware dimulai.
3. Pasang dependensi OS dan siapkan environment:

```bash
sudo apt update
sudo apt install python3-venv python3-spidev python3-rpi.gpio libegl1 libopengl0 libnss3 libxkbcommon-x11-0 libxcb-cursor0
sudo usermod -aG spi,gpio pi
cd /opt/lentera/python-app
python3 -m venv --system-site-packages .venv
.venv/bin/python -m pip install -e '.[desktop]'
.venv/bin/python -m lentera doctor
```

Logout/login setelah perubahan grup. Paket biner PySide6/Qt WebEngine harus cocok dengan Python, aarch64, dan glibc OS. Jika pip tidak menyediakan wheel yang cocok, gunakan paket PySide6 dan Qt WebEngine dari distribusi yang kompatibel atau perbarui OS 64-bit. Jangan menganggap impor sukses sebagai bukti WebGL berfungsi: buka peta pada layar Pi. Jangan melakukan cutover sebelum uji ini lulus.

4. Konfigurasi `lentera.toml`, pasang paket peta, dan migrasikan database. Hentikan proses backend/receiver lama terlebih dahulu agar tidak memakai port 4000 atau SPI bersamaan. Receiver lama tidak mengetahui mekanisme lock receiver baru.
5. Instal layanan dan launcher:

```bash
sudo cp deploy/lentera-backend@.service deploy/lentera-receiver@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lentera-backend@pi.service lentera-receiver@pi.service
mkdir -p ~/.local/share/applications
cp deploy/lentera.desktop ~/.local/share/applications/
```

Autostart desktop opsional: salin launcher ke `~/.config/autostart/`. Desktop harus berjalan dalam sesi grafis, bukan system service. Pemeriksaan log:

```bash
journalctl -u lentera-backend@pi -u lentera-receiver@pi -f
```

## GPIO dan protokol

SX1278/Ra-02: 3.3 V, SPI bus 0 CE0 (NSS BCM8), MOSI BCM10, MISO BCM9, SCK BCM11, RST BCM25, DIO0 BCM24, GND bersama. Konfigurasi tetap 433 MHz, SF7, BW125 kHz, CR4/5, sync `0x34`, preamble 8, CRC off sesuai kode lama. Penerimaan memakai polling IRQ; DIO0 terhubung tetapi bukan interrupt handler.

Paket `SOS_REPORT` tetap memakai `message_id`, `node_pengirim`, `victim_count`, `latitude`, `longitude`, `location_accuracy`, `location_source`. Validasi radio mempertahankan sumber `PHONE_GPS` dan `UNAVAILABLE`. Backend tetap menerima sumber lokasi lain seperti aplikasi sebelumnya. Token ACK FNV-1a menggunakan teks angka asli dari paket. ACK berarti laporan sudah disimpan, bukan tim SAR telah berangkat. Perubahan status operator tidak dikirim sebagai pesan radio baru.

Receiver menyimpan cache deduplikasi maksimum 10.000 pesan selama satu jam. Paket identik di-cache mendapat ACK ulang tanpa menaikkan penghitung backend. Setelah restart, retransmisi kembali di-POST dan memperbarui baris yang sama. Lock receiver baru mencegah dua receiver baru memakai radio sekaligus. `ready` berarti radio berhasil diinisialisasi; bukan bukti jangkauan ke node. Heartbeat lewat 15 detik dianggap tidak aktif.

## Peta offline Jawa dan OSRM

Salin `java-shortbread-1.0.mbtiles` dari instalasi Pi lama ke `shared/map-data/` pada root repository, atau ubah `mbtiles` dalam TOML ke lokasi absolut paket tersebut. Paket harus memiliki metadata `format=pbf/mvt`, `bounds`, dan JSON `vector_layers` Shortbread, termasuk `land`, `streets`, `water_polygons`. Metadata harus mencakup pusat acuan Jabodetabek. File `maluku.osm.pbf` adalah data OSM mentah dan tidak dapat langsung dipakai sebagai MBTiles Jawa. Paket peta Jawa belum disertakan dalam repository.

Alternatif pemasangan otomatis: jalankan `python -m lentera download-map` menggunakan environment aplikasi. Perintah ini mengambil paket Jawa resmi Geofabrik, mendukung resume `.part`, memeriksa panjang unduhan dan `PRAGMA quick_check`, lalu mengaktifkan file hanya jika skema dan isinya valid. File final dan parsial sama-sama diabaikan Git. Paket yang sudah valid tidak ditimpa. UI memuat ulang peta ketika status paket berubah dari belum tersedia menjadi tersedia.

Sidebar memakai halaman terpisah untuk Dashboard, Laporan SOS, Peta Operasi, dan Pengaturan Pos, dengan satu pilihan aktif. Filter laporan dan peta yang sama digunakan kembali saat berganti halaman, sehingga tidak menambah renderer WebEngine pada Pi. Refresh data mempertahankan halaman aktif. Tile kosong yang wajar pada paket regional dikembalikan sebagai HTTP 204, bukan kesalahan paket.

Python menyajikan tile XYZ dari MBTiles TMS (atau `scheme=xyz`) dan mempertahankan kompresi gzip. Gaya peta disalin dari proyek web. Seperti gaya lama, label nama jalan belum disertakan. MapLibre 5.13.0 dipaketkan lokal karena versi 6.15.0 yang tertulis di proyek lama tidak tersedia dari sumber unduhan saat implementasi. Font dan lisensi lokal ada dalam aset; tidak ada kebutuhan CDN saat aplikasi berjalan.

OSRM opsional menggunakan `http://127.0.0.1:5000` dan data jalan Jawa yang sesuai. Ubah `osrm_url` jika diperlukan. Tombol cari rute menampilkan kesalahan jika layanan tidak tersedia; tidak menggambar garis lurus sebagai pengganti rute jalan. Data dan instalasi OSRM tidak disertakan. Endpoint Python `/api/route` menerima `{ "start": [lon,lat], "end": [lon,lat] }`, mengembalikan `geometry`, `distance` (meter), `duration` (detik), atau status 503 bila OSRM gagal.

## Data, kompatibilitas, dan rollback

`shared/database/lentera-legacy.db` lama dipertahankan. Perintah migrate/backend pertama menyalinnya ke `python-app/data/lentera.db` menggunakan SQLite backup API. Database tujuan yang sudah ada tidak ditimpa. `PRAGMA user_version=1` menambahkan tabel pengaturan dan indeks; migrasi menolak ID pesan ganda alih-alih menghapus laporan secara diam-diam. Backup folder sumber sebelum cutover tetap disarankan untuk rollback operasional.

ID, timestamp, akun, laporan, dan log lama tetap dipertahankan. Password lama dapat dipakai untuk login lalu diubah menjadi hash pada database baru; password akun baru selalu di-hash. Waktu baru menyertakan offset zona waktu sistem; atur timezone Pi ke Asia/Jakarta. Waktu ISO UTC lama tetap ditampilkan sesuai timezone desktop. String lama tanpa offset mengikuti timezone lokal sebagaimana aplikasi sebelumnya.

REST lama tetap tersedia di loopback untuk laporan, detail berdasarkan ID, log berdasarkan message_id, status, delete, login, register, dan users. Status BARU/PROSES/SELESAI menerima perbedaan kapitalisasi. Penghapusan kini ditegakkan di server hanya untuk SELESAI. API tambahan: GET/PATCH `/api/settings`, GET `/api/system`, POST `/api/receiver/heartbeat`, POST `/api/route`. Tidak ada dashboard browser di `/`. API lokal ini mempertahankan model kepercayaan aplikasi lama dan tidak menggunakan token otorisasi; jangan membuka binding ke LAN tanpa menambahkan kontrol akses.

Rollback: tutup desktop, hentikan layanan `lentera-receiver@pi` dan `lentera-backend@pi`, lalu jalankan deployment web lama dengan database lama. Jalankan web dari `/opt/lentera/web-app`; skrip clean sekarang hanya menghapus build frontend. Data baru sesudah cutover tetap berada di `python-app/data/lentera.db`; rollback ke database lama tidak otomatis menggabungkan laporan baru.

## Verifikasi sebelum operasional

Lihat matriks fitur di `FEATURE_PARITY.md`. Uji tanpa internet, login/registrasi, ubah status/log, ekspor CSV, simpan pengaturan, peta Jawa, rute tersedia/tidak tersedia, dan kondisi tanpa koordinat. Tutup UI saat node mengirim SOS, buka lagi, lalu pastikan laporan tersimpan. Reboot Pi dan pastikan hanya satu receiver aktif. Uji ACK dua arah dengan perangkat asli, cakupan radio, daya cadangan, dan akurasi posisi.

Pengujian Windows/simulator tidak membuktikan GPIO, WebGL pada Pi, isi tile Jawa, cakupan radio, atau akurasi rute lapangan. Versi dependensi yang telah diverifikasi di Windows dicatat dalam `requirements-windows-verified.txt`; versi Pi baru dikunci setelah pengujian perangkat target, bukan diasumsikan sama dengan Windows.
