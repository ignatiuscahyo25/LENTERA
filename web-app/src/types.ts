export type ReportStatus =
  | 'BARU'
  | 'PROSES'
  | 'SELESAI';

export type LocationSource =
  | 'PHONE_GPS'
  | 'NODE_GNSS'
  | 'UNAVAILABLE'
  | 'LEGACY'
  | 'UNKNOWN';

export interface SystemLog {
  id: string;
  time: string;
  message: string;
  source: string;
}

export interface Report {
  id: number;

  // Backend: message_id
  messageId: string;

  // Waktu laporan pertama
  time: string;

  status: ReportStatus;

  // Node yang ditampilkan
  node: string;

  // Node transmitter asli
  nodePengirim?: string;

  // Lokasi boleh tidak tersedia
  latitude: number | null;
  longitude: number | null;

  // Jumlah korban terbaru
  victimCount: number;

  // Akurasi lokasi dalam meter
  locationAccuracy?: number | null;

  // Sumber lokasi
  locationSource?: LocationSource | string;

  logs: SystemLog[];

  victimName?: string;
  notes?: string;

  // Waktu pertama laporan dibuat
  createdAt?: string;

  // Waktu terakhir laporan diterima/update
  lastSeen?: string;

  // Berapa kali backend menerima update ID ini
  duplicateCount?: number;
}

export interface SystemStatus {
  gatewayLoRa:
    | 'TERHUBUNG'
    | 'TERPUTUS';

  loRaReceiver:
    | 'AKTIF'
    | 'NONAKTIF';

  modeJaringan: string;
  serverLokal: string;
  sinkronisasiTerakhir: string;
}

export const INITIAL_REPORTS: Report[] = [];