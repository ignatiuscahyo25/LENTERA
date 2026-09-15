export type ReportStatus = 'BARU' | 'PROSES' | 'SELESAI';

export interface SystemLog {
  id: string;
  time: string;
  message: string;
  source: string;
}

export interface Report {
  id: number;

  // Dari backend: message_id
  messageId?: string;

  // Dari backend: waktu
  time: string;

  status: ReportStatus;

  // Dari backend: node_penerima
  node: string;

  latitude: number;
  longitude: number;

  // Dari backend: victim_count
  victimCount?: number;

  logs: SystemLog[];

  victimName?: string;
  notes?: string;

  // Dari backend: created_at
  createdAt?: string;

  // Dari backend: last_seen
  lastSeen?: string;

  // Dari backend: duplicate_count
  duplicateCount?: number;
}

export interface SystemStatus {
  gatewayLoRa: 'TERHUBUNG' | 'TERPUTUS';
  loRaReceiver: 'AKTIF' | 'NONAKTIF';
  modeJaringan: string;
  serverLokal: string;
  sinkronisasiTerakhir: string;
}

// Tidak ada dummy data.
// Laporan hanya muncul dari data asli backend / ESP32 receiver.
export const INITIAL_REPORTS: Report[] = [];