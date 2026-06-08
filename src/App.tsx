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

  const API_URL = `http://${window.location.hostname}:4000/api/reports`;

  const formatTime = (date: Date): string => {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

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

const mapApiReportToReport = (item: ApiReport): Report => {
  return {
    id: Number(item.message_id),
    time: formatTimeFromCreatedAt(item.created_at, item.waktu),
    status: normalizeStatus(item.status),
    node: item.node_penerima,
    latitude: item.latitude,
    longitude: item.longitude,
    createdAt: item.created_at,
    victimName: 'Sinyal SOS',
    notes: 'Laporan SOS diterima dari database lokal LENTERA.',
    logs: [
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
      }
    ]
  };
};

  const fetchReports = async () => {
    try {
      const response = await fetch(API_URL);
      const data: ApiReport[] = await response.json();

      const mappedReports = data.map(mapApiReportToReport);
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

  const handleUpdateStatus = async (id: number, newStatus: ReportStatus) => {
    const selectedReport = reports.find(report => report.id === id);
    if (!selectedReport) return;

    const statusForDatabase =
      newStatus === 'BARU' ? 'Baru' :
      newStatus === 'PROSES' ? 'Proses' :
      'Selesai';

    try {
      await fetch(`${API_URL}/${selectedReport.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: statusForDatabase })
      });
    } catch (error) {
      console.error('Gagal update status ke database:', error);
    }

    const now = new Date();
    const timeStr = formatLogTime(now);

    setReports(prevReports =>
      prevReports.map(report => {
        if (report.id === id) {
          if (report.status === newStatus) return report;

          const newLog: SystemLog = {
            id: `log-dynamic-${now.getTime()}`,
            time: timeStr,
            message: `Status operasional diubah menjadi ${newStatus} oleh ${currentUser?.name || 'Admin User'}`,
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
  };

  const handleAddNewReport = async (node: string, lat: number, lng: number, notes?: string) => {
    const now = new Date();
    const timeStr = formatTime(now);
    const logTimeStr = formatLogTime(now);

    const newId = Math.max(...reports.map(r => r.id), 1235) + 1;

    const newReport: Report = {
      id: newId,
      time: timeStr,
      status: 'BARU',
      node: node || 'NODE-05',
      latitude: lat,
      longitude: lng,
      victimName: notes || 'Sinyal Otomatis Korban B',
      notes: notes || 'Sinyal SOS darurat nirkabel terdeteksi oleh stasiun penerima LoRa.',
      logs: [
        {
          id: `log-new-1-${now.getTime()}`,
          time: logTimeStr,
          message: `Sinyal SOS diinisiasi oleh pemancar nirkabel ${node || 'NODE-05'}`,
          source: 'Automated Trigger'
        },
        {
          id: `log-new-2-${now.getTime()}`,
          time: logTimeStr,
          message: `Koordinat lokasi berhasil difinalisasi: (${lat}, ${lng})`,
          source: 'System Kernel'
        }
      ]
    };

    setReports([newReport, ...reports]);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedReportId(null);
    setCurrentScreen('LOGIN');
  };

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
                setCurrentScreen('DASHBOARD');
              }}
            />
          </motion.div>
        )}

        {currentScreen === 'DASHBOARD' && (
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
             onNavigateToSettings={() => setCurrentScreen('SETTINGS')}
             onNavigateToLogout={handleLogout}
             onAddNewReport={handleAddNewReport}
             />
          </motion.div>
        )}

        {currentScreen === 'DETAIL' && selectedReportId !== null && (
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
              onBackToDashboard={() => setCurrentScreen('DASHBOARD')}
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
              onBackToDashboard={() => setCurrentScreen('DASHBOARD')}
              onLogout={handleLogout}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}