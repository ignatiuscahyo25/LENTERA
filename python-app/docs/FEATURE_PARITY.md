# Matriks fitur migrasi

| Fitur web | Implementasi Qt/Python | Verifikasi |
|---|---|---|
| Login dan registrasi | Form native, akun SQLite lama, password baru hash | API otomatis + smoke UI |
| Sidebar/header/kartu ringkasan | Qt Widgets dan QSS navy/merah | Screenshot 1280×720, 1920×1080 |
| Filter BARU/PROSES/SELESAI | Model tabel Qt | Model/flow UI |
| Total korban dan laporan | Ringkasan berdasarkan semua laporan | Flow UI |
| Refresh 3 detik | QTimer + jaringan asinkron, request tidak menumpuk | Smoke integrasi |
| Ekspor CSV | Semua laporan, 10 kolom lama, csv.writer + dialog native | Roundtrip otomatis |
| Distribusi waktu | Enam bucket 4 jam, seluruh laporan seperti web | Widget Qt |
| Detail SOS dan riwayat | Form native dan log tersimpan | API otomatis + flow UI |
| Ubah status | Transaksi + log; retransmisi tidak mereset status | Otomatis |
| Hapus laporan selesai | Konfirmasi Qt + aturan backend | Otomatis |
| Pesan informasi korban | Panel berdasarkan status/lokasi; tanpa kirim radio | Flow UI |
| Profil dan posko | Persisten di backend (perbaikan dari state sementara web) | Otomatis |
| Status gateway | Heartbeat/ready/error/last packet aktual (perbaikan indikator statis) | Otomatis + radio nyata tertunda |
| Marker dan pemilihan laporan | MapLibre lokal + QWebChannel | Smoke WebEngine + tile nyata tertunda |
| Peta offline Jawa | Endpoint MBTiles Python, gaya Shortbread lama | XYZ/TMS/gzip otomatis; paket Jawa diperlukan |
| Rute, jarak, estimasi | OSRM opsional melalui backend, kontrol native | OSRM mock otomatis; OSRM nyata diperlukan |
| SOS/ACK radio GPIO | Protokol asli, receiver proses terpisah | Simulator otomatis; Pi/node nyata diperlukan |
| Logout/tutup UI | Receiver tetap hidup sebagai systemd service | Smoke proses + Pi reboot diperlukan |

Sumber React/Express dipertahankan sebagai acuan. Referensi warna, font, tata letak, teks, dan kolom diambil dari sumber tersebut dan dibandingkan menggunakan screenshot build web terisolasi. Hasil dan batas verifikasi tercatat di `VALIDATION.md`; perbandingan pada Pi masih diperlukan.
