export type ReportStatus = 'BARU' | 'PROSES' | 'SELESAI';

export interface SystemLog {
  id: string;
  time: string;
  message: string;
  source: string;
}

export interface Report {
  id: number;
  time: string;
  status: ReportStatus;
  node: string;
  latitude: number;
  longitude: number;
  logs: SystemLog[];
  victimName?: string;
  notes?: string;
  createdAt?: string;
}

export interface SystemStatus {
  gatewayLoRa: 'TERHUBUNG' | 'TERPUTUS';
  loRaReceiver: 'AKTIF' | 'NONAKTIF';
  modeJaringan: string;
  serverLokal: string;
  sinkronisasiTerakhir: string;
}

export const INITIAL_REPORTS: Report[] = [
  {
    id: 1234,
    time: "10:42",
    status: "BARU",
    node: "NODE-02",
    latitude: -6.3634,
    longitude: 106.8285,
    victimName: "Sinyal Otomatis Korban A",
    notes: "Sinyal darurat aktif secara terus-menerus. Membutuhkan helikopter penyelamat.",
    logs: [
      { id: "log-1", time: "10:42:01", message: "Sinyal SOS diterima dari sensor NODE-02", source: "Automated Trigger" },
      { id: "log-2", time: "10:42:05", message: "Validasi koordinat GPS sukses: (106.8285, -6.3634)", source: "System Kernel" },
      { id: "log-3", time: "10:43:00", message: "Notifikasi dikirim ke Koordinator Lapangan", source: "Messaging Engine" }
    ]
  },
  {
    id: 1235,
    time: "10:45",
    status: "PROSES",
    node: "NODE-01",
    latitude: -6.3689,
    longitude: 106.8211,
    victimName: "Regu Pendaki 3 Orang",
    notes: "Mengalami hipotermia ringan di shelter pendakian pos 3.",
    logs: [
      { id: "log-4", time: "10:45:10", message: "Kontak suara radio LoRa terjalin dengan korban", source: "LoRa Gateway" },
      { id: "log-5", time: "10:47:00", message: "Status diubah menjadi PROSES oleh Admin User", source: "SAR Mission Control" },
      { id: "log-6", time: "10:50:00", message: "Tim penyelamat darat diberangkatkan menuju koordinat", source: "Field Radio" }
    ]
  },
  {
    id: 1230,
    time: "09:15",
    status: "SELESAI",
    node: "NODE-04",
    latitude: -6.3512,
    longitude: 106.8399,
    victimName: "Pendaki Tersesat",
    notes: "Korban ditemukan dalam keadaan selamat dan telah dievakuasi ke Basecamp Utama.",
    logs: [
      { id: "log-7", time: "09:15:30", message: "Sinyal transponder diterima oleh NODE-04", source: "Automated Trigger" },
      { id: "log-8", time: "09:30:00", message: "Evakuasi darat berhasil diselesaikan oleh Tim B", source: "Rescue Team B" },
      { id: "log-9", time: "09:40:00", message: "Status diperbarui menjadi SELESAI", source: "SAR Mission Control" }
    ]
  },
  {
    id: 1228,
    time: "08:30",
    status: "SELESAI",
    node: "NODE-02",
    latitude: -6.3721,
    longitude: 106.8155,
    victimName: "Survivor Kehilangan Jalur",
    notes: "Pencarian visual menggunakan drone berhasil mendeteksi korban di dekat jurang barat.",
    logs: [
      { id: "log-10", time: "08:30:15", message: "Trigger manual tombol SOS oleh survivor", source: "Beacon Terminal" },
      { id: "log-11", time: "08:45:00", message: "Lokasi dipetakan menggunakan citra drone", source: "Air Survey Service" },
      { id: "log-12", time: "09:20:00", message: "Medevac selesai, korban dalam perawatan medis pos kesehatan", source: "Medical Unit" }
    ]
  }
];
