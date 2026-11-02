import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  LogOut, 
  Network, 
  Cpu, 
  Wifi, 
  Server, 
  Clock, 
  User, 
  MapPin,
  Lock
} from 'lucide-react';
import { SystemStatus } from '../types';

interface SettingsScreenProps {
  user: {
    id: number;
    username: string;
    name: string;
    role: string;
  } | null;
  onBackToDashboard: () => void;
  onLogout: () => void;
}

export default function SettingsScreen({
  user,
  onBackToDashboard,
  onLogout
}: SettingsScreenProps) {
  
  const [adminName, setAdminName] = useState(user?.name || 'Admin User');
  const [adminRole, setAdminRole] = useState(user?.role || 'Koordinator Lapangan');
  const [stationPos, setStationPos] = useState('Posko Utama Semeru');
  const [isEditing, setIsEditing] = useState(false);

  const [systemState] = useState<SystemStatus>({
    gatewayLoRa: 'TERHUBUNG',
    loRaReceiver: 'AKTIF',
    modeJaringan: 'Offline Local Network',
    serverLokal: 'Raspberry Pi 5 Server (Node-Central)',
    sinkronisasiTerakhir: 'Baru saja disinkronkan'
  });

  useEffect(() => {
    setAdminName(user?.name || 'Admin User');
    setAdminRole(user?.role || 'Koordinator Lapangan');
  }, [user]);

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-[#faf9fe] text-[#1a1b1f] flex flex-col font-sans pb-16">
      
      <header className="bg-white border-b border-[#c4c6d1] flex justify-between items-center px-4 md:px-6 h-16 z-40 select-none shadow-sm">
        <button 
          onClick={onBackToDashboard}
          className="flex items-center text-[#00193c] font-black text-xs uppercase tracking-wider hover:underline gap-1.5 focus:outline-none"
        >
          <ArrowLeft size={16} className="text-[#00193c] stroke-[2.5]" />
          <span>Kembali ke Dashboard</span>
        </button>
        <span className="font-mono text-[9px] text-[#43474f] uppercase tracking-widest font-black select-none">
          LENTERA PARAMS v1.0.4
        </span>
      </header>

      <main className="flex-grow p-4 md:p-6 max-w-3xl mx-auto w-full space-y-6">
        
        <div className="mb-4">
          <h2 className="font-extrabold text-2xl text-[#00193c] tracking-tight">
            Pengaturan Pos
          </h2>
          <p className="text-xs text-[#43474f] mt-1">
            Konfigurasi profile, manajemen kanal radio, dan monitoring status gateway LoRa.
          </p>
        </div>

        <section className="bg-[#f4f3f8] border border-[#c4c6d1] rounded-lg p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-[#c4c6d1]/50 pb-2">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#43474f]">
              Profil Admin Posko
            </h3>
            <button 
              onClick={() => setIsEditing(!isEditing)}
              className="text-[#002d62] text-[11px] font-bold uppercase tracking-wider hover:underline select-none"
            >
              {isEditing ? 'Batal' : 'Ubah Data'}
            </button>
          </div>

          {!isEditing ? (
            <div className="flex items-center gap-5">
              <div className="relative select-none">
                <div className="w-16 h-16 rounded-full border-2 border-[#00193c] bg-[#00193c] shadow-md flex items-center justify-center text-white font-extrabold text-lg">
                  {(adminName || 'A').charAt(0).toUpperCase()}
                </div>
                <span 
                  className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-[#f4f3f8] rounded-full inline-block animate-pulse" 
                  title="Sistem Aktif"
                ></span>
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-extrabold text-lg text-[#00193c] truncate">
                  {adminName}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#43474f] font-semibold">
                  <span className="flex items-center gap-1">
                    <User size={14} className="text-[#00193c]" />
                    <span>{adminRole}</span>
                  </span>

                  <span className="text-[#c4c6d1]">•</span>

                  <span className="flex items-center gap-1">
                    <MapPin size={14} className="text-[#ba0627]" />
                    <span>{stationPos}</span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-3 py-0.5 bg-[#2d6a4f] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                    Sistem Aktif
                  </span>

                  <span className="px-3 py-0.5 bg-[#eeedf2] text-[#43474f] text-[10px] font-bold rounded-full uppercase tracking-wider">
                    @{user?.username || 'admin'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleUpdateProfile} className="space-y-3 font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#43474f] mb-1">
                    Nama Koordinator
                  </label>
                  <input 
                    type="text" 
                    value={adminName} 
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#c4c6d1] rounded focus:ring-1 focus:ring-[#002d62] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#43474f] mb-1">
                    Role
                  </label>
                  <input 
                    type="text" 
                    value={adminRole} 
                    onChange={(e) => setAdminRole(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#c4c6d1] rounded focus:ring-1 focus:ring-[#002d62] focus:outline-none"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] uppercase font-bold text-[#43474f] mb-1">
                    Stasiun Posko Utama
                  </label>
                  <input 
                    type="text" 
                    value={stationPos} 
                    onChange={(e) => setStationPos(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#c4c6d1] rounded focus:ring-1 focus:ring-[#002d62] focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <button 
                  type="button" 
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 border border-[#c4c6d1] text-xs font-semibold rounded hover:bg-[#e3e2e7]"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-1.5 bg-[#00193c] text-white text-xs font-bold rounded hover:bg-[#002d62]"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="bg-[#f4f3f8] border border-[#c4c6d1] rounded-lg p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#c4c6d1]/50 pb-2">
            <Network size={18} className="text-[#00193c]" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#43474f]">
              Status Sistem LENTERA
            </h3>
          </div>

          <div className="divide-y divide-[#c4c6d1]/40 text-xs font-medium space-y-2.5">
            <div className="flex justify-between items-center pt-2 select-none">
              <span className="text-[#43474f] flex items-center gap-2">
                <Wifi size={14} className="text-[#002d62]" />
                <span>Gateway LoRa</span>
              </span>
              <span className="font-bold text-[#2d6a4f] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#2d6a4f] inline-block animate-pulse"></span>
                <span>{systemState.gatewayLoRa}</span>
              </span>
            </div>

            <div className="flex justify-between items-center pt-2.5">
              <span className="text-[#43474f] flex items-center gap-2">
                <Cpu size={14} className="text-[#002d62]" />
                <span>LoRa Receiver</span>
              </span>
              <span className="font-bold text-[#2d6a4f]">
                {systemState.loRaReceiver}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2.5">
              <span className="text-[#43474f] flex items-center gap-2">
                <Lock size={14} className="text-[#002d62]" />
                <span>Mode Jaringan</span>
              </span>
              <span className="font-mono text-[11px] font-black text-[#00193c] bg-[#eeedf2] px-2 py-0.5 border border-[#c4c6d1] rounded">
                {systemState.modeJaringan}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2.5">
              <span className="text-[#43474f] flex items-center gap-2">
                <Server size={14} className="text-[#002d62]" />
                <span>Server Lokal Pos</span>
              </span>
              <span className="font-mono text-xs font-bold text-[#1a1b1f]">
                {systemState.serverLokal}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2.5">
              <span className="text-[#43474f] flex items-center gap-2">
                <Clock size={14} className="text-[#43474f]" />
                <span>Sinkronisasi Terakhir</span>
              </span>
              <span className="text-[#43474f] font-bold italic">
                {systemState.sinkronisasiTerakhir}
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-4 pt-4 text-center">
          <button 
            onClick={() => {
              const confirmExit = window.confirm('Apakah Anda yakin ingin keluar dari sistem? Semua log sinkronisasi LoRa lokal tetap tersimpan di Raspberry Pi.');
              if (confirmExit) onLogout();
            }}
            className="w-full h-14 bg-[#ba0627] text-white font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 rounded-lg active:scale-[0.98] transition-all shadow-md select-none cursor-pointer"
          >
            <LogOut size={18} />
            <span>Keluar Dari Sistem</span>
          </button>
          
          <p className="text-[11px] text-[#43474f]/85 max-w-sm mx-auto leading-relaxed">
            Hanya lakukan penutupan pencatatan sistem saat pergantian shift jaga koordinator atau pemeliharaan perangkat keras backend.
          </p>
        </section>
      </main>
    </div>
  );
}