import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, Lock, Eye, EyeOff, ShieldAlert } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: {
    id: number;
    username: string;
    name: string;
    role: string;
  }) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  const [username, setUsername] = useState('stevie');
  const [password, setPassword] = useState('stevie123');
  const [name, setName] = useState('');
  const [role, setRole] = useState('Operator Posko');

  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const API_BASE_URL = `http://${window.location.hostname}:4000/api`;

  const handleLogin = async () => {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();

    if (!response.ok) {
      setErrorMsg(result.message || 'Login gagal. Periksa username dan password.');
      return;
    }

    onLoginSuccess(result.user);
  };

  const handleRegister = async () => {
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, name, role })
    });

    const result = await response.json();

    if (!response.ok) {
      setErrorMsg(result.message || 'Registrasi gagal.');
      return;
    }

    setSuccessMsg('Akun berhasil dibuat. Silakan login.');
    setMode('LOGIN');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setErrorMsg('Username dan password wajib diisi.');
      return;
    }

    if (mode === 'REGISTER' && (!name.trim() || !role.trim())) {
      setErrorMsg('Nama dan role wajib diisi.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (mode === 'LOGIN') {
        await handleLogin();
      } else {
        await handleRegister();
      }
    } catch (error) {
      console.error(error);
      setErrorMsg('Tidak dapat terhubung ke server. Pastikan backend sudah berjalan.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (mode === 'LOGIN') {
      setMode('REGISTER');
      setUsername('');
      setPassword('');
      setName('');
      setRole('Operator Posko');
    } else {
      setMode('LOGIN');
      setUsername('stevie');
      setPassword('stevie123');
      setName('');
      setRole('Operator Posko');
    }
  };

  return (
    <div className="relative min-h-screen bg-[#001124] text-white flex flex-col justify-between overflow-hidden tactical-grid px-4 py-6">
      
      <div className="hidden sm:block absolute top-4 right-4 md:top-8 md:right-8 bg-[#001e38]/80 backdrop-blur-md border border-[#00a8ff]/30 p-3 rounded text-left font-mono text-[10px] md:text-xs text-[#00d0ff] select-none tracking-widest leading-relaxed">
        <div className="font-bold border-b border-[#00a8ff]/20 pb-1 mb-1 text-white">AZIMUTH DATA</div>
        <div>REF: 00-29-SAR-A1</div>
        <div>STATION: SEMERU-MAIN</div>
      </div>

      <div className="hidden sm:block absolute bottom-4 left-4 md:bottom-8 md:left-8 bg-[#001e38]/80 backdrop-blur-md border border-[#00a8ff]/30 p-3 rounded text-left font-mono text-[10px] md:text-xs text-[#00d0ff] select-none tracking-widest leading-relaxed">
        <div className="font-bold border-b border-[#00a8ff]/20 pb-1 mb-1 text-white">COORDS FEED</div>
        <div>LAT: -6.2088 | LONG: 106.8456</div>
        <div>SYS: SECURE LORA</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center my-6 sm:my-10 relative z-10 w-full max-w-md mx-auto">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center mb-6 text-center"
        >
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-wider text-white">
            LENTERA Dashboard
          </h1>

          <p className="text-xs md:text-sm text-[#00d0ff]/70 font-sans mt-1">
            Sistem Monitoring SOS dan Lokasi Korban
          </p>
        </motion.div>

        <motion.form
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          onSubmit={handleSubmit}
          className="w-full max-w-[92vw] sm:max-w-md bg-[#f0f2f5] text-[#1a1b1f] border border-[#c4c6d1] rounded-lg p-5 md:p-8 shadow-2xl relative"
        >
          <div className="mb-5">
            <h2 className="text-lg font-extrabold text-[#00193c]">
              {mode === 'LOGIN' ? 'Login Admin Posko' : 'Buat Akun Admin'}
            </h2>
            <p className="text-xs text-[#43474f] mt-1">
              {mode === 'LOGIN'
                ? 'Masuk untuk mengakses dashboard monitoring LENTERA.'
                : 'Daftarkan akun baru untuk operator posko LENTERA.'}
            </p>
          </div>

          <div className="space-y-4">
            {mode === 'REGISTER' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#43474f] mb-1.5 uppercase tracking-wider">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder=" "
                    className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[#c4c6d1] rounded focus:outline-none focus:ring-2 focus:ring-[#002d62]/30 focus:border-[#002d62] text-sm"
                    required={mode === 'REGISTER'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#43474f] mb-1.5 uppercase tracking-wider">
                    Role
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Contoh: Operator Posko"
                    className="w-full px-4 py-2.5 bg-[#f8f9fa] border border-[#c4c6d1] rounded focus:outline-none focus:ring-2 focus:ring-[#002d62]/30 focus:border-[#002d62] text-sm"
                    required={mode === 'REGISTER'}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#43474f] mb-1.5 uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#43474f]/60">
                  <User size={18} />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Input username"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#f8f9fa] border border-[#c4c6d1] rounded focus:outline-none focus:ring-2 focus:ring-[#002d62]/30 focus:border-[#002d62] text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#43474f] mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[#43474f]/60">
                  <Lock size={18} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Input password"
                  className="w-full pl-10 pr-10 py-2.5 bg-[#f8f9fa] border border-[#c4c6d1] rounded focus:outline-none focus:ring-2 focus:ring-[#002d62]/30 focus:border-[#002d62] text-sm"
                  required
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#43474f]/60 hover:text-[#1a1b1f] transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-100 text-[#ba1a1a] rounded text-xs flex items-center gap-2 font-medium">
                <ShieldAlert size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-green-100 text-green-700 rounded text-xs font-medium">
                {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-[#002c5c] text-white font-bold rounded hover:bg-[#001c3d] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{mode === 'LOGIN' ? 'Mengautentikasi...' : 'Membuat akun...'}</span>
                </>
              ) : (
                <span>{mode === 'LOGIN' ? 'Login →' : 'Buat Akun →'}</span>
              )}
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-[#c4c6d1]/50 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={switchMode}
              className="text-[#ba0627] hover:underline font-semibold"
            >
              {mode === 'LOGIN' ? 'Buat akun' : 'Sudah punya akun? Login'}
            </button>

            <span className="text-[#43474f]/60 font-mono text-[10px]">
              v1.0.4-BETA
            </span>
          </div>
        </motion.form>
      </div>

      <div className="flex flex-col items-center justify-center gap-0.5 select-none relative z-10 py-2 px-4">
        <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] sm:text-xs text-[#00d0ff]/80 tracking-wider font-mono font-bold uppercase text-center">
          <span className="inline-block w-2.5 h-2.5 bg-red-600 rounded-full animate-ping"></span>
          <span className="inline-block w-2 h-2 bg-red-600 rounded-full -ml-3 mb-[1px]"></span>
          <span>NETWORK SECURE</span>
          <span className="text-white/40">|</span>
          <span>MISSION CONTROL</span>
        </div>

        <p className="text-[10px] text-white/30 font-sans mt-1 text-center">
          © 2026 LENTERA SAR System. Student Engineering Prototype.
        </p>
      </div>
    </div>
  );
}