import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Settings, 
  Flame, 
  AlertTriangle,
  RefreshCw, 
  CheckCircle2, 
  Download, 
  Map, 
  Plus, 
  Menu, 
  X, 
  Clock, 
  ChevronRight, 
  Signal,
  BellRing
} from 'lucide-react';
import { Report, ReportStatus } from '../types';
import RealMap from './RealMap';

type LoggedInUser = {
  id: number;
  username: string;
  name: string;
  role: string;
};

interface DashboardScreenProps {
  reports: Report[];
  user: LoggedInUser | null;
  onSelectReport: (id: number) => void;
  onNavigateToSettings: () => void;
  onNavigateToLogout: () => void;
  onAddNewReport: (node: string, lat: number, lng: number, notes?: string) => void;
}

export default function DashboardScreen({
  reports,
  user,
  onSelectReport,
  onNavigateToSettings,
  onAddNewReport
}: DashboardScreenProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'SEMUA' | ReportStatus>('SEMUA');
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const [newNodeId, setNewNodeId] = useState('NODE-05');
  const [newLat, setNewLat] = useState('-6.3650');
  const [newLng, setNewLng] = useState('106.8250');
  const [newNotes, setNewNotes] = useState('');

  const displayName = user?.name || 'Admin User';
  const displayRole = user?.role || 'SAR Mission Control';

  const getInitials = (name: string) => {
    const words = name.trim().split(' ').filter(Boolean);

    if (words.length === 0) return 'AU';

    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }

    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  };

  const userInitials = getInitials(displayName);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getRelativeTime = (createdAt?: string) => {
    if (!createdAt) return 'Waktu tersimpan';

    const createdTime = new Date(createdAt).getTime();
    const diffSeconds = Math.floor((currentTime - createdTime) / 1000);

    if (diffSeconds < 60) return 'Baru saja';

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} menit lalu`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} hari lalu`;
  };

  const countTotal = reports.length;
  const countBaru = reports.filter(r => r.status === 'BARU').length;
  const countProses = reports.filter(r => r.status === 'PROSES').length;
  const countSelesai = reports.filter(r => r.status === 'SELESAI').length;

  const filteredReports = reports.filter(r => {
    if (activeFilter === 'SEMUA') return true;
    return r.status === activeFilter;
  });

  const getReportHour = (report: Report) => {
    if (report.createdAt) {
      return new Date(report.createdAt).getHours();
    }

    const hourFromTime = Number(report.time.split(':')[0]);
    return Number.isNaN(hourFromTime) ? 0 : hourFromTime;
  };

  const transmissionBuckets = [
    { label: '00:00', range: '00:00–03:59', start: 0, end: 3 },
    { label: '04:00', range: '04:00–07:59', start: 4, end: 7 },
    { label: '08:00', range: '08:00–11:59', start: 8, end: 11 },
    { label: '12:00', range: '12:00–15:59', start: 12, end: 15 },
    { label: '16:00', range: '16:00–19:59', start: 16, end: 19 },
    { label: '20:00', range: '20:00–23:59', start: 20, end: 23 }
  ];

  const transmissionData = transmissionBuckets.map((bucket) => {
    const total = reports.filter((report) => {
      const hour = getReportHour(report);
      return hour >= bucket.start && hour <= bucket.end;
    }).length;

    return {
      ...bucket,
      total
    };
  });

  const maxTransmission = Math.max(...transmissionData.map(item => item.total), 1);

  const handleCreateReport = (e: React.FormEvent) => {
    e.preventDefault();

    const latNum = parseFloat(newLat) || -6.3650;
    const lngNum = parseFloat(newLng) || 106.8250;

    onAddNewReport(newNodeId, latNum, lngNum, newNotes);

    setShowAddModal(false);
    setNewNotes('');
    setNewNodeId(`NODE-${String(Math.floor(Math.random() * 8) + 5).padStart(2, '0')}`);
  };

  const handleDownloadMock = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["ID,Waktu,Status,Node,Latitude,Longitude\n"]
      + reports.map(r => `${r.id},${r.time},${r.status},${r.node},${r.latitude},${r.longitude}`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");

    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `LENTERA_SAR_LOG_${new Date().toISOString().slice(0, 10)}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#faf9fe] text-[#1a1b1f] flex flex-col font-sans">
      
      <header className="bg-[#faf9fe] sticky top-0 border-b border-[#c4c6d1] flex justify-between items-center px-4 md:px-6 h-16 z-40 select-none shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="md:hidden p-1.5 rounded hover:bg-[#eeedf2]"
          >
            <Menu size={22} className="text-[#00193c]" />
          </button>
          
          <div className="flex items-center gap-2">
            <Flame size={24} className="text-[#00193c] stroke-[2.5]" />
            <h1 className="font-extrabold text-lg md:text-xl text-[#00193c] tracking-tight">
              LENTERA SAR
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="font-bold text-xs block text-[#1a1b1f]">
              {displayName}
            </span>
            <span className="font-mono text-[9px] text-[#43474f] uppercase tracking-wider block">
              {displayRole}
            </span>
          </div>

          <button 
            onClick={onNavigateToSettings}
            className="w-9 h-9 rounded-full bg-[#002d62] flex items-center justify-center text-white font-bold select-none cursor-pointer hover:bg-[#001c3d] transition-all"
          >
            {userInitials}
          </button>
        </div>
      </header>

      <div className="flex-1 flex relative">
        
        <aside className="hidden md:flex flex-col p-6 w-[240px] bg-[#f4f3f8] border-r border-[#c4c6d1] relative overflow-y-auto">
          <div className="mb-8 p-1">
            <p className="font-extrabold text-[#002d62] text-sm tracking-wide">
              {displayName}
            </p>
            <p className="text-[11px] text-[#43474f] font-semibold">
              {displayRole}
            </p>

            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse inline-block"></span>
              <span className="text-xs text-[#43474f] font-mono font-bold uppercase tracking-wider">
                Online
              </span>
            </div>
          </div>

          <nav className="flex-grow space-y-1.5">
            <button 
              className="w-full bg-[#002d62] text-white rounded-lg flex items-center gap-3 py-2 px-3.5 cursor-pointer text-left shadow-sm"
              onClick={() => setActiveFilter('SEMUA')}
            >
              <LayoutDashboard size={18} />
              <span className="font-bold text-xs">Dashboard</span>
            </button>
            
            <button 
              className="w-full text-[#43474f] hover:bg-[#e3e2e7] hover:text-[#00193c] rounded-lg flex items-center gap-3 py-2 px-3.5 cursor-pointer text-left transition-all"
              onClick={() => setActiveFilter('BARU')}
            >
              <Flame size={18} className="text-[#ba0627]" />
              <span className="font-bold text-xs text-[#ba0627]">Laporan SOS</span>
            </button>

            <button 
              className="w-full text-[#43474f] hover:bg-[#e3e2e7] hover:text-[#00193c] rounded-lg flex items-center gap-3 py-2 px-3.5 cursor-pointer text-left transition-all"
              onClick={() => {
                const mapSection = document.getElementById('map-distribution-section');
                if (mapSection) mapSection.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Map size={18} />
              <span className="font-bold text-xs">Peta Operasi</span>
            </button>

            <button 
              className="w-full text-[#43474f] hover:bg-[#e3e2e7] hover:text-[#00193c] rounded-lg flex items-center gap-3 py-2 px-3.5 cursor-pointer text-left transition-all"
              onClick={onNavigateToSettings}
            >
              <Settings size={18} />
              <span className="font-bold text-xs">Pengaturan</span>
            </button>
          </nav>

          <div className="pt-4 border-t border-[#c4c6d1] mt-auto">
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#43474f]/75 select-none uppercase tracking-widest pl-1">
              <Signal size={12} className="text-emerald-600 animate-pulse" />
              <span>STABLE SIGNAL</span>
            </div>
          </div>
        </aside>

        <AnimatePresence>
          {drawerOpen && (
            <div className="fixed inset-0 z-50 md:hidden flex">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawerOpen(false)}
                className="absolute inset-0 bg-[#1a1b1f]"
              />

              <motion.aside 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 20 }}
                className="w-[240px] bg-[#f4f3f8] border-r border-[#c4c6d1] h-full z-10 flex flex-col p-5 shadow-xl relative"
              >
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#c4c6d1]">
                  <div className="flex items-center gap-2">
                    <Flame size={20} className="text-[#00193c] stroke-[2.5]" />
                    <span className="font-extrabold text-sm text-[#00193c]">LENTERA</span>
                  </div>

                  <button 
                    onClick={() => setDrawerOpen(false)}
                    className="p-1 rounded hover:bg-[#e3e2e7] text-[#43474f]"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#00193c] flex items-center justify-center text-white font-bold select-none text-sm">
                      {userInitials}
                    </div>

                    <div className="flex flex-col">
                      <span className="font-extrabold text-xs text-[#001c3d]">
                        {displayName}
                      </span>

                      <span className="text-[10px] text-[#43474f] flex items-center gap-1 mt-0.5 font-semibold">
                        {displayRole}
                      </span>
                    </div>
                  </div>
                </div>

                <nav className="flex-grow space-y-1.5">
                  <button 
                    className="w-full text-[#43474f] hover:bg-[#e3e2e7] hover:text-[#00193c] rounded-lg flex items-center gap-3 py-2 px-3 text-left transition-all text-xs font-bold"
                    onClick={() => {
                      setActiveFilter('SEMUA');
                      setDrawerOpen(false);
                    }}
                  >
                    <LayoutDashboard size={16} />
                    <span>Dashboard</span>
                  </button>
                  
                  <button 
                    className="w-full text-[#ba0627] hover:bg-[#e3e2e7] rounded-lg flex items-center gap-3 py-2 px-3 text-left transition-all text-xs font-bold"
                    onClick={() => {
                      setActiveFilter('BARU');
                      setDrawerOpen(false);
                    }}
                  >
                    <Flame size={16} />
                    <span>Laporan SOS Baru</span>
                  </button>

                  <button 
                    className="w-full text-[#43474f] hover:bg-[#e3e2e7] hover:text-[#00193c] rounded-lg flex items-center gap-3 py-2 px-3 text-left transition-all text-xs font-bold"
                    onClick={() => {
                      setDrawerOpen(false);
                      setTimeout(() => {
                        const mapSection = document.getElementById('map-distribution-section');
                        if (mapSection) mapSection.scrollIntoView({ behavior: 'smooth' });
                      }, 200);
                    }}
                  >
                    <Map size={16} />
                    <span>Peta Operasi</span>
                  </button>

                  <button 
                    className="w-full text-[#43474f] hover:bg-[#e3e2e7] hover:text-[#00193c] rounded-lg flex items-center gap-3 py-2 px-3 text-left transition-all text-xs font-bold"
                    onClick={() => {
                      setDrawerOpen(false);
                      onNavigateToSettings();
                    }}
                  >
                    <Settings size={16} />
                    <span>Pengaturan</span>
                  </button>
                </nav>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        <main className="flex-1 p-3 sm:p-4 md:p-5 overflow-y-auto pb-24 md:pb-6 max-w-7xl mx-auto w-full">
          
          <div className="mb-6">
            <h2 className="font-extrabold text-2xl md:text-3xl text-[#00193c] tracking-tight">
              LENTERA Dashboard
            </h2>

            <p className="text-xs md:text-sm text-[#43474f] mt-1 pr-4">
              Sistem monitoring radio LoRa, laporan SOS, dan koordinasi darurat pencarian korban secara real-time.
            </p>
          </div>

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
            <div 
              className="bg-white border border-[#c4c6d1] p-4 rounded shadow-sm flex flex-col justify-between hover:border-[#002d62]/50 transition-all cursor-pointer" 
              onClick={() => setActiveFilter('SEMUA')}
            >
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#43474f]">
                Total Laporan
              </span>

              <div className="flex items-end justify-between mt-3">
                <span className="text-2xl md:text-3xl font-extrabold leading-none text-[#00193c]">
                  {countTotal}
                </span>
                <Clock size={20} className="text-[#c4c6d1]" />
              </div>
            </div>

            <div 
              onClick={() => setActiveFilter('BARU')}
              className="bg-white border border-[#c4c6d1] p-4 rounded shadow-sm flex flex-col justify-between relative overflow-hidden hover:border-[#ba0627] transition-all cursor-pointer"
            >
              <div className="absolute top-0 right-0 w-1.5 h-full bg-[#ba0627]"></div>
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#ba0627]">
                Baru (SOS)
              </span>
              <div className="flex items-end justify-between mt-3">
                <span className="text-2xl md:text-3xl font-extrabold leading-none text-[#ba0627]">
                  {countBaru}
                </span>
                <Flame size={20} className="text-[#ba0627] animate-pulse" />
              </div>
            </div>

            <div 
              onClick={() => setActiveFilter('PROSES')}
              className="bg-white border border-[#c4c6d1] p-4 rounded shadow-sm flex flex-col justify-between relative overflow-hidden hover:border-[#ffb597] transition-all cursor-pointer"
            >
              <div className="absolute top-0 right-0 w-1.5 h-full bg-[#ffb597]"></div>
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#541d02]">
                Proses
              </span>
              <div className="flex items-end justify-between mt-3">
                <span className="text-2xl md:text-3xl font-extrabold leading-none text-[#541d02]">
                  {String(countProses).padStart(1, '0')}
                </span>
                <RefreshCw size={18} className="text-[#ffb597] animate-spin" style={{ animationDuration: '6s' }} />
              </div>
            </div>

            <div 
              onClick={() => setActiveFilter('SELESAI')}
              className="bg-white border border-[#c4c6d1] p-4 rounded shadow-sm flex flex-col justify-between relative overflow-hidden hover:border-green-600 transition-all cursor-pointer"
            >
              <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-600"></div>
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-emerald-600">
                Selesai
              </span>
              <div className="flex items-end justify-between mt-3">
                <span className="text-2xl md:text-3xl font-extrabold leading-none text-emerald-600">
                  {countSelesai}
                </span>
                <CheckCircle2 size={20} className="text-emerald-500" />
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#c4c6d1] rounded shadow-sm overflow-hidden mb-6">
            <div className="p-4 border-b border-[#c4c6d1] bg-white flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-[#00193c] uppercase tracking-wider">
                  Log Laporan Terkini
                </h3>

                {activeFilter !== 'SEMUA' && (
                  <span className="px-2.5 py-0.5 bg-[#eeedf2] text-[#43474f] font-bold text-[10px] rounded-full uppercase">
                    Filter: {activeFilter}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-1">
                {activeFilter !== 'SEMUA' && (
                  <button 
                    onClick={() => setActiveFilter('SEMUA')}
                    className="p-1 text-xs text-[#00193c] font-semibold hover:underline mr-1 select-none"
                  >
                    Reset
                  </button>
                )}

                <button 
                  onClick={handleDownloadMock}
                  className="p-1.5 hover:bg-[#eeedf2] rounded transition-colors text-[#43474f]"
                  title="Ekspor CSV"
                >
                  <Download size={18} />
                </button>
              </div>
            </div>

            {filteredReports.length === 0 ? (
              <div className="py-12 bg-white text-center flex flex-col items-center justify-center p-6">
                <AlertTriangle className="text-[#ba0627] mb-2 animate-bounce" size={28} />
                <p className="text-sm font-bold text-[#1a1b1f]">
                  Log laporan kosong
                </p>
                <p className="text-xs text-[#43474f] mt-1">
                  Tidak ada laporan dengan status {activeFilter}.
                </p>
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#f4f3f8] border-b border-[#c4c6d1]">
                        <th className="px-4 py-2.5 font-bold uppercase text-[11px] text-[#43474f] tracking-wider w-24">ID</th>
                        <th className="px-4 py-2.5 font-bold uppercase text-[11px] text-[#43474f] tracking-wider w-36">Waktu</th>
                        <th className="px-4 py-2.5 font-bold uppercase text-[11px] text-[#43474f] tracking-wider">Status</th>
                        <th className="px-4 py-2.5 font-bold uppercase text-[11px] text-[#43474f] tracking-wider">Node Transceiver</th>
                        <th className="px-4 py-2.5 font-bold uppercase text-[11px] text-[#43474f] tracking-wider w-40">Objek/Korban</th>
                        <th className="px-4 py-2.5 font-bold uppercase text-[11px] text-[#43474f] tracking-wider w-24 text-right">Aksi</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#c4c6d1]">
                      {filteredReports.map((report) => (
                        <tr key={report.id} className="hover:bg-[#f4f3f8] transition-colors group">
                          <td className="px-4 py-3 font-mono font-bold text-xs text-[#00193c]">
                            {report.id}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-col leading-tight">
                              <span className="text-xs text-[#43474f] font-mono">
                                {report.time} WIB
                              </span>
                              <span className="text-[10px] text-[#ba0627] font-semibold mt-1">
                                {getRelativeTime(report.createdAt)}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wider ${
                              report.status === 'BARU' ? 'bg-[#ba0627] text-white' :
                              report.status === 'PROSES' ? 'bg-[#ffb597] text-[#541d02]' :
                              'bg-emerald-600 text-white'
                            }`}>
                              {report.status}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-xs font-mono font-bold text-[#1a1b1f]">
                            {report.node}
                          </td>

                          <td className="px-4 py-3 text-xs text-[#43474f] truncate max-w-[140px]" title={report.victimName}>
                            {report.victimName || "Sinyal Otomatis"}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <button 
                              onClick={() => onSelectReport(report.id)}
                              className="bg-[#00193c] text-white px-3 py-1 rounded text-xs font-bold hover:bg-[#002d62] active:scale-95 transition-all cursor-pointer"
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="block md:hidden divide-y divide-[#c4c6d1] bg-white">
                  {filteredReports.map((report) => (
                    <div key={report.id} className="p-4 space-y-3 hover:bg-[#f4f3f8] transition-colors">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-sm text-[#00193c]">
                              ID: {report.id}
                            </span>
                            <span className="text-[10px] text-[#43474f] font-mono">
                              ({report.time} WIB)
                            </span>
                          </div>
                          <span className="text-[10px] text-[#ba0627] font-semibold mt-0.5">
                            {getRelativeTime(report.createdAt)}
                          </span>
                        </div>

                        <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wider ${
                          report.status === 'BARU' ? 'bg-[#ba0627] text-white' :
                          report.status === 'PROSES' ? 'bg-[#ffb597] text-[#541d02]' :
                          'bg-emerald-600 text-white'
                        }`}>
                          {report.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs text-[#43474f] font-sans">
                        <div>
                          <span className="block text-[9px] font-bold uppercase text-[#43474f]/60">
                            Node Penerima
                          </span>
                          <span className="font-mono font-bold text-[#1a1b1f]">
                            {report.node}
                          </span>
                        </div>

                        <div>
                          <span className="block text-[9px] font-bold uppercase text-[#43474f]/60">
                            Objek/Korban
                          </span>
                          <span className="truncate block text-[#1a1b1f] font-semibold">
                            {report.victimName || "Sinyal SOS"}
                          </span>
                        </div>

                        <div className="col-span-2">
                          <span className="block text-[9px] font-bold uppercase text-[#43474f]/60">
                            Keterangan GPS
                          </span>
                          <span className="font-mono text-[10px] text-[#002c5c]">
                            ({report.latitude}, {report.longitude})
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button 
                          onClick={() => onSelectReport(report.id)}
                          className="w-full sm:w-auto bg-[#00193c] text-white px-4 py-1.5 rounded text-xs font-bold text-center flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                        >
                          <span>Kelola Detail Laporan</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6" id="map-distribution-section">
            <div className="bg-white border border-[#c4c6d1] rounded p-3 sm:p-4 shadow-sm flex flex-col justify-between overflow-hidden min-w-0">
              <div className="mb-4">
                <h3 className="font-extrabold text-sm text-[#00193c] uppercase tracking-wider">
                  Peta Distribusi Kebencanaan
                </h3>
                <p className="text-[11px] text-[#43474f] mt-0.5">
                  Visualisasi lokasi laporan SOS berdasarkan koordinat latitude dan longitude dari database.
                </p>
              </div>

              <RealMap reports={reports} onSelectReport={onSelectReport} />
            </div>

            <div className="bg-white border border-[#c4c6d1] rounded p-3 sm:p-4 shadow-sm flex flex-col justify-between overflow-hidden min-w-0">
              <div className="mb-4">
                <h3 className="font-extrabold text-sm text-[#00193c] uppercase tracking-wider">
                  Intensitas Transmisi Sinyal (24 Jam)
                </h3>
                <p className="text-[11px] text-[#43474f] mt-0.5">
                  Distribusi jumlah laporan SOS yang masuk berdasarkan interval waktu 4 jam.
                </p>
              </div>

              <div className="aspect-video min-h-[220px] bg-[#faf9fe] rounded-lg border border-[#c4c6d1] p-4 flex flex-col justify-between">
                <div className="flex items-end gap-3.5 flex-1 relative px-2">
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
                    <div className="border-b border-[#c4c6d1] w-full h-[1px]"></div>
                    <div className="border-b border-[#c4c6d1] w-full h-[1px]"></div>
                    <div className="border-b border-[#c4c6d1] w-full h-[1px]"></div>
                    <div className="border-b border-[#c4c6d1] w-full h-[1px]"></div>
                  </div>

                  {transmissionData.map((item) => {
                    const heightPercent = item.total === 0
                      ? 4
                      : Math.max((item.total / maxTransmission) * 90, 12);

                    const currentHour = new Date().getHours();
                    const isCurrentBucket = currentHour >= item.start && currentHour <= item.end;

                    return (
                      <div
                        key={item.label}
                        className="flex-1 flex flex-col items-center justify-end h-full z-10 group"
                      >
                        <div className="text-[10px] font-mono font-bold text-[#00193c] mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.total}
                        </div>

                        <div
                          className={`w-full rounded-t-sm transition-all duration-500 ${
                            isCurrentBucket
                              ? 'bg-[#ba0627] shadow-[0_0_12px_rgba(186,6,39,0.3)]'
                              : 'bg-[#002d62]/80'
                          }`}
                          style={{ height: `${heightPercent}%` }}
                          title={`${item.total} laporan pada interval ${item.range}`}
                        ></div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between border-t border-[#c4c6d1] pt-2 mt-2 px-1 font-mono text-[9px] text-[#43474f] font-bold">
                  {transmissionData.map((item) => {
                    const currentHour = new Date().getHours();
                    const isCurrentBucket = currentHour >= item.start && currentHour <= item.end;

                    return (
                      <span
                        key={item.label}
                        className={isCurrentBucket ? 'text-[#ba0627]' : ''}
                        title={item.range}
                      >
                        {item.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[10px] text-[#43474f]">
                <span>
                  Total data terbaca: <strong className="text-[#00193c]">{reports.length}</strong> laporan
                </span>
                <span className="font-mono text-[#ba0627] font-bold">
                  Live update
                </span>
              </div>
            </div>
          </section>
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#f4f3f8] border-t border-[#c4c6d1] grid grid-cols-4 h-16 z-40 select-none">
        <button 
          onClick={() => setActiveFilter('SEMUA')}
          className={`flex flex-col items-center justify-center transition-colors ${
            activeFilter === 'SEMUA' ? 'text-[#00193c]' : 'text-[#43474f]'
          }`}
        >
          <LayoutDashboard size={20} />
          <span className="font-sans text-[10px] font-bold mt-1">Dashboard</span>
        </button>

        <button 
          onClick={() => setActiveFilter('BARU')}
          className={`flex flex-col items-center justify-center transition-colors ${
            activeFilter === 'BARU' ? 'text-[#ba0627]' : 'text-[#43474f]'
          }`}
        >
          <Flame size={20} />
          <span className="font-sans text-[10px] font-bold mt-1">SOS</span>
        </button>

        <button 
          onClick={() => {
            const mapSection = document.getElementById('map-distribution-section');
            if (mapSection) mapSection.scrollIntoView({ behavior: 'smooth' });
          }}
          className="flex flex-col items-center justify-center text-[#43474f] hover:text-[#00193c] transition-colors"
        >
          <Map size={20} />
          <span className="font-sans text-[10px] font-bold mt-1">Peta</span>
        </button>

        <button 
          onClick={onNavigateToSettings}
          className="flex flex-col items-center justify-center text-[#43474f] hover:text-[#00193c] transition-colors"
        >
          <Settings size={20} />
          <span className="font-sans text-[10px] font-bold mt-1">Set</span>
        </button>
      </nav>

      <footer className="hidden md:flex bg-[#faf9fe] border-t border-[#c4c6d1] justify-between items-center px-6 py-3 w-full text-xs text-[#43474f] z-10 select-none">
        <p>© 2026 LENTERA SAR System. Student Engineering Prototype.</p>
        <div className="flex gap-4">
          <button 
            type="button" 
            onClick={() => alert("LENTERA SAR Help Center: Posko Utama Semeru can be reached at LoRa Channel A8.")}
            className="hover:text-[#00193c] hover:underline"
          >
            Bantuan Channels
          </button>

          <span className="text-[#c4c6d1]">|</span>

          <button 
            type="button"
            onClick={() => alert("Protokol SAR: Prioritaskan validasi sinyal beacon frekuensi 433 MHz sebelum evakuasi dikoordinasikan.")}
            className="hover:text-[#00193c] hover:underline"
          >
            Protokol Operasi SAR
          </button>
        </div>
      </footer>

      <button 
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 bg-[#ba0627] text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-35 cursor-pointer border border-[#c4c6d1]/20"
        title="Input SOS Manual"
      >
        <Plus size={28} />
      </button>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-[#1a1b1f]"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#faf9fe] border border-[#c4c6d1] rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto relative z-10 text-[#1a1b1f]"
            >
              <div className="bg-[#00193c] px-5 py-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellRing size={18} className="text-[#ba0627] animate-bounce" />
                  <span className="font-extrabold text-sm uppercase tracking-wider">
                    Trigger Sinyal SOS Darurat
                  </span>
                </div>

                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded text-white/70 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateReport} className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-extrabold text-[#43474f] mb-1">
                      Node Transceiver
                    </label>
                    <input 
                      type="text" 
                      value={newNodeId}
                      onChange={(e) => setNewNodeId(e.target.value)}
                      placeholder="e.g. NODE-05" 
                      className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#c4c6d1] rounded focus:ring-1 focus:ring-[#002d62] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-extrabold text-[#43474f] mb-1">
                      Objek Laporan
                    </label>
                    <input 
                      type="text" 
                      value={newNotes} 
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="e.g. Survivor Shelter Pos 2" 
                      className="w-full text-xs font-semibold px-2.5 py-2 bg-white border border-[#c4c6d1] rounded focus:ring-1 focus:ring-[#002d62] focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-extrabold text-[#43474f] mb-1">
                      Latitude
                    </label>
                    <input 
                      type="text" 
                      value={newLat} 
                      onChange={(e) => setNewLat(e.target.value)}
                      placeholder="e.g. -6.3650" 
                      className="w-full text-xs font-mono font-bold px-2.5 py-2 bg-white border border-[#c4c6d1] rounded focus:ring-1 focus:ring-[#002d62] focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-extrabold text-[#43474f] mb-1">
                      Longitude
                    </label>
                    <input 
                      type="text" 
                      value={newLng} 
                      onChange={(e) => setNewLng(e.target.value)}
                      placeholder="e.g. 106.8250" 
                      className="w-full text-xs font-mono font-bold px-2.5 py-2 bg-white border border-[#c4c6d1] rounded focus:ring-1 focus:ring-[#002d62] focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <p className="text-[10px] text-[#43474f]/80 leading-relaxed pl-1 italic">
                  Note: Tombol ini menyimulasikan input laporan SOS. Laporan baru akan berstatus <strong className="text-[#ba0627]">BARU</strong>.
                </p>

                <div className="flex gap-2 justify-end pt-3 border-t border-[#c4c6d1]/50">
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 border border-[#c4c6d1] rounded text-xs font-semibold hover:bg-[#eeedf2]"
                  >
                    Batal
                  </button>

                  <button 
                    type="submit"
                    className="px-4 py-2 bg-[#ba0627] text-white rounded text-xs font-bold hover:opacity-90 transition-all cursor-pointer"
                  >
                    Kirim SOS Sinyal
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}