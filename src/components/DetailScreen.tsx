import React, { useState } from 'react';
import DetailMap from './DetailMap';
import { 
  ArrowLeft, 
  MapPin, 
  Copy, 
  Compass, 
  Cpu, 
  Activity, 
  Flame, 
  RefreshCw, 
  CheckCircle,
  FileText,
  Check,
  Navigation
} from 'lucide-react';
import { Report, ReportStatus } from '../types';

interface DetailScreenProps {
  reportId: number;
  reports: Report[];
  onBackToDashboard: () => void;
  onUpdateStatus: (id: number, newStatus: ReportStatus) => void;
}

export default function DetailScreen({
  reportId,
  reports,
  onBackToDashboard,
  onUpdateStatus
}: DetailScreenProps) {
  const [copied, setCopied] = useState(false);

  const report = reports.find(r => r.id === reportId);

  if (!report) {
    return (
      <div className="min-h-screen bg-[#faf9fe] text-[#1a1b1f] flex flex-col items-center justify-center p-6">
        <p className="text-sm font-bold text-[#ba0627]">Terjadi kesalahan</p>
        <p className="text-xs text-[#43474f] mt-1">
          Laporan dengan ID {reportId} tidak ditemukan.
        </p>
        <button 
          type="button"
          onClick={onBackToDashboard}
          className="mt-4 px-4 py-2 bg-[#00193c] text-white rounded text-xs font-bold"
        >
          Kembali ke Dashboard
        </button>
      </div>
    );
  }

  const handleCopyCoords = async () => {
    const coordString = `${report.latitude}, ${report.longitude}`;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(coordString);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = coordString;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        textArea.setAttribute('readonly', '');

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (!successful) {
          throw new Error('Fallback copy gagal');
        }
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Gagal menyalin koordinat:', error);
      alert(`Koordinat gagal disalin otomatis. Salin manual: ${coordString}`);
    }
  };

  const handleOpenGoogleMaps = () => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenGoogleMapsDirections = () => {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const getReportDate = () => {
    if (report.createdAt) {
      return new Date(report.createdAt);
    }

    return new Date();
  };

  const formatLocalTime = () => {
    if (report.createdAt) {
      return getReportDate().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }

    return report.time;
  };

  const formatLocalDate = () => {
    return getReportDate().toLocaleDateString('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-[#faf9fe] text-[#1a1b1f] flex flex-col font-sans pb-16">
      
      <header className="bg-white border-b border-[#c4c6d1] flex justify-between items-center px-4 md:px-6 h-16 z-40 select-none shadow-sm">
        <button 
          type="button"
          onClick={onBackToDashboard}
          className="flex items-center text-[#00193c] font-black text-xs uppercase tracking-wider hover:underline gap-1.5 focus:outline-none"
        >
          <ArrowLeft size={16} className="text-[#00193c] stroke-[2.5]" />
          <span>Kembali ke Dashboard</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-mono text-[9px] text-[#43474f] uppercase tracking-widest font-black">
            LENTERA CHANNEL SECURE
          </span>
        </div>
      </header>

      <main className="flex-grow p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#c4c6d1]">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-extrabold text-2xl text-[#00193c] tracking-tight">
                ID Laporan: {report.id}
              </h2>

              <span className={`px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                report.status === 'BARU' ? 'bg-[#ba0627] text-white' :
                report.status === 'PROSES' ? 'bg-[#ffb597] text-[#541d02]' :
                'bg-emerald-600 text-white'
              }`}>
                Status Saat Ini: {report.status}
              </span>
            </div>

            <p className="text-xs text-[#43474f] mt-1 font-sans">
              Penerimaan sinyal darurat otomatis terdeteksi melalui node transponder.
            </p>
          </div>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#eeedf2] border border-[#c4c6d1] p-4 rounded flex flex-col justify-between shadow-sm">
                <span className="text-[10px] uppercase font-extrabold text-[#43474f]">
                  Waktu Laporan
                </span>

                <span className="text-xl md:text-2xl font-mono font-black text-[#00193c] mt-2 block">
                  {formatLocalTime()}
                </span>

                <span className="text-[10px] text-[#43474f] font-semibold mt-1 capitalize leading-snug">
                  {formatLocalDate()}
                </span>
              </div>

              <div className="bg-[#eeedf2] border border-[#c4c6d1] p-4 rounded flex flex-col justify-between shadow-sm font-mono">
                <span className="text-[10px] uppercase font-extrabold text-[#43474f] font-sans">
                  Node Penerima
                </span>

                <span className="text-xl md:text-2xl font-black text-[#00193c] mt-2 block">
                  {report.node}
                </span>
              </div>
            </div>

            <div className="bg-white border border-[#c4c6d1] rounded p-5 shadow-sm space-y-4">
              
              <div className="flex items-center gap-2 border-b border-[#c4c6d1]/50 pb-2">
                <Compass size={18} className="text-[#00193c]" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-[#1a1b1f]">
                  GPS Coordinates Sinyal
                </h3>
              </div>

              <div className="space-y-3 font-mono">
                <div>
                  <span className="block text-[9px] font-bold uppercase text-[#43474f] font-sans">
                    Latitude
                  </span>
                  <input 
                    type="text" 
                    readOnly 
                    value={report.latitude} 
                    className="w-full bg-[#f4f3f8] border border-[#c4c6d1] text-xs font-bold text-[#1a1b1f] px-3 py-1.5 rounded focus:outline-none focus:ring-0"
                  />
                </div>

                <div>
                  <span className="block text-[9px] font-bold uppercase text-[#43474f] font-sans">
                    Longitude
                  </span>
                  <input 
                    type="text" 
                    readOnly 
                    value={report.longitude} 
                    className="w-full bg-[#f4f3f8] border border-[#c4c6d1] text-xs font-bold text-[#1a1b1f] px-3 py-1.5 rounded focus:outline-none focus:ring-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                <button 
                  type="button"
                  onClick={handleCopyCoords}
                  className="bg-white border border-[#c4c6d1] p-2 rounded text-xs font-bold text-[#00193c] hover:bg-[#f4f3f8] active:scale-95 transition-all flex items-center justify-center gap-1.5 select-none cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-emerald-600 stroke-[3]" />
                      <span className="text-emerald-700">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Salin Koordinat</span>
                    </>
                  )}
                </button>

                <button 
                  type="button"
                  onClick={handleOpenGoogleMaps}
                  className="bg-[#00193c] text-white p-2 rounded text-xs font-bold hover:bg-[#002d62] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MapPin size={14} />
                  <span>Buka Maps</span>
                </button>

                <button 
                  type="button"
                  onClick={handleOpenGoogleMapsDirections}
                  className="bg-[#2d6a4f] text-white p-2 rounded text-xs font-bold hover:bg-[#24543f] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Navigation size={14} />
                  <span>Rute</span>
                </button>
              </div>
            </div>

            <div className="bg-white border border-[#c4c6d1] rounded p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-[#c4c6d1]/50 pb-2 mb-2">
                <FileText size={16} className="text-[#00193c]" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-[#1a1b1f]">
                  Identitas Objek / Korban
                </h3>
              </div>

              <p className="font-bold text-xs text-[#002c5c] font-sans">
                {report.victimName || "Sinyal Otomatis Aktif"}
              </p>

              <p className="text-xs text-[#43474f] mt-1.5 leading-relaxed font-sans bg-[#f4f3f8] p-3 rounded border border-[#c4c6d1]/40">
                {report.notes || "Tidak ada detail keterangan tambahan. Titik koordinat berasal dari laporan SOS yang diterima oleh gateway LENTERA."}
              </p>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-[#c4c6d1] rounded p-4 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#c4c6d1]/50">
              <div>
                <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#00193c]">
                  Peta Lokasi Korban
                </h3>
                <p className="text-[10px] text-[#43474f]">
                  Marker menampilkan titik koordinat laporan SOS yang sedang dipilih.
                </p>
              </div>

              <div className="px-2 py-1 bg-[#eeedf2] rounded border border-[#c4c6d1] text-[10px] font-bold text-[#00193c]">
                ID {report.id}
              </div>
            </div>

            <DetailMap report={report} />
          </div>
        </section>

        <section className="bg-white border border-[#c4c6d1] rounded p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#c4c6d1]/50 pb-2">
            <Activity size={18} className="text-[#00193c]" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#1a1b1f]">
              Perbarui Status Operasi
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button 
              type="button"
              onClick={() => onUpdateStatus(report.id, 'BARU')}
              className={`py-3.5 px-4 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                report.status === 'BARU' 
                  ? 'bg-[#ba0627] text-white shadow-[#ba0627]/30 scale-[1.01]' 
                  : 'bg-[#eeedf2] border border-[#c4c6d1] text-[#ba0627] hover:bg-[#e3e2e7]'
              }`}
            >
              <Flame size={16} />
              <span>Baru</span>
            </button>

            <button 
              type="button"
              onClick={() => onUpdateStatus(report.id, 'PROSES')}
              className={`py-3.5 px-4 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                report.status === 'PROSES' 
                  ? 'bg-[#ffb597] text-[#541d02] shadow-[#ffb597]/20 scale-[1.01]' 
                  : 'bg-[#eeedf2] border border-[#c4c6d1] text-[#541d02] hover:bg-[#e3e2e7]'
              }`}
            >
              <RefreshCw size={14} className={report.status === 'PROSES' ? 'animate-spin' : ''} />
              <span>Proses</span>
            </button>

            <button 
              type="button"
              onClick={() => onUpdateStatus(report.id, 'SELESAI')}
              className={`py-3.5 px-4 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                report.status === 'SELESAI' 
                  ? 'bg-emerald-600 text-white shadow-emerald-500/20 scale-[1.01]' 
                  : 'bg-[#eeedf2] border border-[#c4c6d1] text-emerald-700 hover:bg-[#e3e2e7]'
              }`}
            >
              <CheckCircle size={16} />
              <span>Selesai Ditangani</span>
            </button>
          </div>
        </section>

        <section className="bg-white border border-[#c4c6d1] rounded p-5 shadow-[0_4px_12px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between border-b border-[#c4c6d1]/50 pb-2">
            <div className="flex items-center gap-2">
              <Cpu size={18} className="text-[#00193c]" />
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#1a1b1f]">
                Log Aktivitas Sistem
              </h3>
            </div>

            <span className="font-mono text-[9px] text-[#43474f] tracking-wide select-none">
              AUDIT TRAIL SECURE
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-[#c4c6d1] text-[#43474f] font-sans text-[10px] uppercase font-extrabold tracking-wider">
                  <th className="py-2 pr-4 font-bold w-24">Waktu</th>
                  <th className="py-2 pr-4 font-bold">Kejadian / Peristiwa</th>
                  <th className="py-2 font-bold text-right">Sumber</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#c4c6d1]/40 text-[#1a1b1f] leading-loose">
                {report.logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#faf9fe]">
                    <td className="py-2.5 pr-4 text-[#43474f]">{log.time}</td>
                    <td className="py-2.5 pr-4 font-medium sm:max-w-xs md:max-w-md break-words">
                      {log.message}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-[#002d62] text-[10px]">
                      {log.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}