import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Report, ReportStatus, SystemLog } from './types';
import LoginScreen from './components/LoginScreen';
import DashboardScreen from './components/DashboardScreen';
import DetailScreen from './components/DetailScreen';
import SettingsScreen from './components/SettingsScreen';

type ApiReport = {
  id: number;
  message_id: string;
  waktu: string;
  status: string;
  node_penerima: string;
  latitude: number;
  longitude: number;
  created_at?: string;
  last_seen?: string;
  duplicate_count?: number;
};

type ApiReportLog = {
  id: number;
  message_id: string;
  waktu: string;
  message: string;
  source: string;
  created_at: string;
};

type LoggedInUser = {
  id: number;
  username: string;
  name: string;
  role: string;
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'LOGIN' | 'DASHBOARD' | 'DETAIL' | 'SETTINGS'>('LOGIN');
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [currentUser, setCurrentUser] = useState<LoggedInUser | null>(null);

  const API_URL =
    window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
      ? `http://${window.location.hostname}:4000/api/reports`
      : '/api/reports';

  const formatLogTime = (date: Date): string => {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  };

  const normalizeStatus = (status: string): ReportStatus => {
    const lower = status.toLowerCase();

    if (lower.includes('baru')) return 'BARU';
    if (lower.includes('proses')) return 'PROSES';
    return 'SELESAI';
  };

  const formatTimeFromCreatedAt = (createdAt?: string, fallbackTime?: string): string => {
    if (!createdAt) return fallbackTime || '-';

    return new Date(createdAt).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const mapApiReportToReport = (item: ApiReport, extraLogs: ApiReportLog[] = []): Report => {
    const duplicateCount = item.duplicate_count ?? 1;

    const baseLogs: SystemLog[] = [
      {
        id: `log-${item.id}-1`,
        time: item.waktu,
        message: `Sinyal SOS diterima dari ${item.node_penerima}`,
        source: 'Gateway LoRa'
      },
      {
        id: `log-${item.id}-2`,
        time: item.waktu,
        message: `Koordinat korban terdeteksi: (${item.latitude}, ${item.longitude})`,
        source: 'Database Lokal'
      },
      {
        id: `log-${item.id}-3`,
        time: item.waktu,
        message: `Total sinyal diterima: ${duplicateCount} kali`,
        source: 'Duplicate Filter'
      }
    ];

    const statusLogs: SystemLog[] = extraLogs.map(log => ({
      id: `status-log-${log.id}`,
      time: log.waktu,
      message: log.message,
      source: log.source
    }));

    return {
      id: item.id,
      messageId: item.message_id,
      time: formatTimeFromCreatedAt(item.created_at, item.waktu),
      status: normalizeStatus(item.status),
      node: item.node_penerima,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      createdAt: item.created_at,
      lastSeen: item.last_seen,
      duplicateCount,
      victimName: 'Perangkat SOS Korban',
      notes: 'Pesan status dikirim ke perangkat korban berdasarkan kondisi penanganan laporan.',
      logs: [...baseLogs, ...statusLogs]
    };
  };

  const fetchReports = async () => {
    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        console.error('Gagal mengambil data laporan. Status:', response.status);
        return;
      }

      const data: ApiReport[] = await response.json();

      const mappedReports = await Promise.all(
        data.map(async (item) => {
          try {
            const logResponse = await fetch(`${API_URL}/${item.message_id}/logs`);

            if (!logResponse.ok) {
              return mapApiReportToReport(item);
            }

            const logs: ApiReportLog[] = await logResponse.json();
            return mapApiReportToReport(item, logs);
          } catch (error) {
            console.error('Gagal mengambil log laporan:', error);
            return mapApiReportToReport(item);
          }
        })
      );

      setReports(mappedReports);
    } catch (error) {
      console.error('Gagal mengambil data laporan:', error);
    }
  };

  useEffect(() => {
    fetchReports();

    const interval = setInterval(() => {
      fetchReports();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleSelectReport = (id: number) => {
    setSelectedReportId(id);
    setCurrentScreen('DETAIL');
  };

  const handleBackToDashboard = () => {
    setSelectedReportId(null);
    setCurrentScreen('DASHBOARD');
  };

  const handleUpdateStatus = async (id: number, newStatus: ReportStatus) => {
    const selectedReport = reports.find(report => report.id === id);
    if (!selectedReport) return;

    if (!selectedReport.messageId) {
      console.error('messageId laporan tidak ditemukan.');
      return;
    }

    if (selectedReport.status === newStatus) return;

    const statusForDatabase =
      newStatus === 'BARU' ? 'Baru' :
      newStatus === 'PROSES' ? 'Proses' :
      'Selesai';

    try {
      const response = await fetch(`${API_URL}/${selectedReport.messageId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: statusForDatabase })
      });

      if (!response.ok) {
        const result = await response.json();
        console.error('Gagal update status ke database:', result.message);
        return;
      }

      const now = new Date();
      const timeStr = formatLogTime(now);

      const localLogMessage =
        newStatus === 'PROSES'
          ? `Status laporan diubah menjadi PROSES oleh ${currentUser?.name || 'Admin User'}. Tim SAR sedang memproses dan menuju koordinat korban.`
          : newStatus === 'SELESAI'
            ? `Status laporan diubah menjadi SELESAI oleh ${currentUser?.name || 'Admin User'}. Penanganan laporan telah diselesaikan.`
            : `Status laporan diubah menjadi BARU oleh ${currentUser?.name || 'Admin User'}. Laporan kembali masuk ke antrean awal.`;

      setReports(prevReports =>
        prevReports.map(report => {
          if (report.id === id) {
            const newLog: SystemLog = {
              id: `log-dynamic-${now.getTime()}`,
              time: timeStr,
              message: localLogMessage,
              source: 'SAR Mission Control'
            };

            return {
              ...report,
              status: newStatus,
              logs: [...report.logs, newLog]
            };
          }

          return report;
        })
      );

      await fetchReports();
    } catch (error) {
      console.error('Gagal update status ke database:', error);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedReportId(null);
    setCurrentScreen('LOGIN');
  };

  const selectedReportExists =
    selectedReportId !== null && reports.some(report => report.id === selectedReportId);

  const showDashboard =
    currentScreen === 'DASHBOARD' || (currentScreen === 'DETAIL' && !selectedReportExists);

  return (
    <div className="min-h-screen bg-[#faf9fe]">
      <AnimatePresence mode="wait">
        {currentScreen === 'LOGIN' && (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <LoginScreen
              onLoginSuccess={(user) => {
                setCurrentUser(user);
                setSelectedReportId(null);
                setCurrentScreen('DASHBOARD');
                fetchReports();
              }}
            />
          </motion.div>
        )}

        {showDashboard && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <DashboardScreen
              reports={reports}
              user={currentUser}
              onSelectReport={handleSelectReport}
              onNavigateToSettings={() => {
                setSelectedReportId(null);
                setCurrentScreen('SETTINGS');
              }}
              onNavigateToLogout={handleLogout}
            />
          </motion.div>
        )}

        {currentScreen === 'DETAIL' && selectedReportExists && selectedReportId !== null && (
          <motion.div
            key="detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <DetailScreen
              reportId={selectedReportId}
              reports={reports}
              onBackToDashboard={handleBackToDashboard}
              onUpdateStatus={handleUpdateStatus}
            />
          </motion.div>
        )}

        {currentScreen === 'SETTINGS' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SettingsScreen
              user={currentUser}
              onBackToDashboard={handleBackToDashboard}
              onLogout={handleLogout}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}