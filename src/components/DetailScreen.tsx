import React, { useEffect, useState } from 'react';

import DetailMap from './DetailMap';

import {
  ArrowLeft,
  Copy,
  Compass,
  Cpu,
  Activity,
  Flame,
  RefreshCw,
  CheckCircle,
  Check,
  Radio,
  Smartphone,
  AlertTriangle,
  Trash2
} from 'lucide-react';

import {
  Report,
  ReportStatus
} from '../types';


interface DetailScreenProps {
  reportId: number;

  reports: Report[];

  onBackToDashboard:
    () => void;

  onUpdateStatus:
    (
      id: number,
      newStatus: ReportStatus
    ) => void;
}


export default function DetailScreen({
  reportId,
  reports,
  onBackToDashboard,
  onUpdateStatus
}: DetailScreenProps) {

  const [
    copied,
    setCopied
  ] = useState(false);


  const report =
    reports.find(
      item =>
        item.id === reportId
    );


  useEffect(
    () => {

      if (!report) {

        const timeout =
          setTimeout(
            () => {
              onBackToDashboard();
            },
            300
          );

        return () =>
          clearTimeout(timeout);
      }

    },
    [
      report,
      onBackToDashboard
    ]
  );


  if (!report) {

    return (
      <div className="min-h-screen bg-[#faf9fe] text-[#1a1b1f] flex flex-col items-center justify-center p-6">

        <p className="text-sm font-bold text-[#ba0627]">
          Mengembalikan ke Dashboard...
        </p>

        <p className="text-xs text-[#43474f] mt-1 text-center">
          Laporan dengan ID {reportId} tidak ditemukan atau data belum selesai dimuat.
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


  const displayReportId =
    report.messageId ||
    report.id;


  const totalSignal =
    report.duplicateCount ??
    1;


  const victimCount =
    report.victimCount;


  const hasLocation =
    report.latitude !== null &&
    report.longitude !== null &&
    Number.isFinite(
      report.latitude
    ) &&
    Number.isFinite(
      report.longitude
    );


  const latitudeText =
    hasLocation
      ? String(
          report.latitude
        )
      : 'Belum tersedia';


  const longitudeText =
    hasLocation
      ? String(
          report.longitude
        )
      : 'Belum tersedia';


  const locationSourceText =
    report.locationSource ===
      'PHONE_GPS'

      ? 'GPS HP Korban'

      : report.locationSource ===
        'NODE_GNSS'

        ? 'GNSS Node LENTERA'

        : report.locationSource ===
          'LEGACY'

          ? 'Data lokasi lama'

          : report.locationSource ===
            'UNKNOWN'

            ? 'Sumber tidak diketahui'

            : 'Belum tersedia';


  // ==========================
  // COPY COORDINATE
  // ==========================

  const handleCopyCoords =
    async () => {

      if (!hasLocation) {

        alert(
          'Koordinat belum tersedia.'
        );

        return;
      }


      const coordString =
        `${report.latitude}, ${report.longitude}`;


      try {

        if (
          navigator.clipboard &&
          window.isSecureContext
        ) {

          await navigator.clipboard
            .writeText(
              coordString
            );

        } else {

          const textArea =
            document.createElement(
              'textarea'
            );


          textArea.value =
            coordString;


          textArea.style.position =
            'fixed';


          textArea.style.left =
            '-9999px';


          textArea.style.top =
            '-9999px';


          textArea.setAttribute(
            'readonly',
            ''
          );


          document.body
            .appendChild(
              textArea
            );


          textArea.focus();

          textArea.select();


          const successful =
            document.execCommand(
              'copy'
            );


          document.body
            .removeChild(
              textArea
            );


          if (!successful) {

            throw new Error(
              'Fallback copy gagal'
            );
          }
        }


        setCopied(true);


        setTimeout(
          () => {
            setCopied(false);
          },
          2000
        );

      } catch (error) {

        console.error(
          'Gagal menyalin koordinat:',
          error
        );


        alert(
          `Koordinat gagal disalin otomatis. Salin manual: ${coordString}`
        );
      }
    };


  // ==========================
  // REPORT DATE
  // ==========================

  const getReportDate =
    () => {

      if (report.createdAt) {

        const parsed =
          new Date(
            report.createdAt
          );


        if (
          !Number.isNaN(
            parsed.getTime()
          )
        ) {

          return parsed;
        }
      }


      return new Date();
    };


  const formatLocalTime =
    () => {

      if (report.createdAt) {

        return getReportDate()
          .toLocaleTimeString(
            'id-ID',
            {
              hour:
                '2-digit',

              minute:
                '2-digit',

              hour12:
                false
            }
          );
      }


      return report.time;
    };


  const formatLocalDate =
    () => {

      return getReportDate()
        .toLocaleDateString(
          'id-ID',
          {
            weekday:
              'long',

            day:
              '2-digit',

            month:
              'long',

            year:
              'numeric'
          }
        );
    };


  const formatLastSeen =
    () => {

      if (!report.lastSeen) {

        return 'Belum ada sinyal ulang';
      }


      const date =
        new Date(
          report.lastSeen
        );


      if (
        Number.isNaN(
          date.getTime()
        )
      ) {

        return report.lastSeen;
      }


      return date
        .toLocaleString(
          'id-ID',
          {
            weekday:
              'long',

            day:
              '2-digit',

            month:
              'long',

            year:
              'numeric',

            hour:
              '2-digit',

            minute:
              '2-digit',

            second:
              '2-digit',

            hour12:
              false
          }
        );
    };


  // ==========================
  // VICTIM STATUS MESSAGE
  // ==========================

  const getVictimMessage =
    () => {

      if (
        report.status ===
        'BARU'
      ) {

        return {
          title:
            'Laporan SOS Diterima',

          message:
            'Laporan SOS Anda telah diterima oleh sistem LENTERA. Mohon tetap tenang, hemat baterai perangkat, dan tunggu konfirmasi dari tim SAR.',

          tone:
            'bg-[#fff3f5] border-[#ba0627]/30 text-[#ba0627]'
        };
      }


      if (
        report.status ===
        'PROSES'
      ) {

        return {
          title:
            'Bantuan Sedang Diproses',

          message:
            hasLocation

              ? 'Tim SAR sedang memproses laporan Anda menggunakan koordinat terakhir yang diterima. Harap menunggu di tempat yang aman dan tetap pantau perangkat Anda.'

              : 'Tim SAR sedang memproses laporan Anda. Koordinat belum tersedia pada sistem, sehingga informasi lokasi masih menunggu sumber lokasi yang valid.',

          tone:
            'bg-[#fff7ed] border-[#ffb597] text-[#541d02]'
        };
      }


      return {
        title:
          'Laporan Telah Ditangani',

        message:
          'Laporan Anda telah ditandai selesai ditangani oleh operator SAR. Tetap ikuti arahan petugas di lokasi dan pastikan kondisi Anda aman.',

        tone:
          'bg-emerald-50 border-emerald-300 text-emerald-700'
      };
    };


  // ==========================
  // DELETE REPORT
  // ==========================

  const handleDeleteReport =
    async () => {

      if (
        report.status !==
        'SELESAI'
      ) {

        alert(
          'Laporan hanya dapat dihapus setelah status SELESAI.'
        );

        return;
      }


      if (
        !report.messageId
      ) {

        alert(
          'Message ID laporan tidak tersedia.'
        );

        return;
      }


      const confirmed =
        window.confirm(
          `Hapus laporan ${report.messageId}?\n\nLaporan dan seluruh log aktivitas terkait akan dihapus permanen.`
        );


      if (!confirmed) {
        return;
      }


      try {

        const response =
          await fetch(
            `http://localhost:4000/api/reports/${encodeURIComponent(
              report.messageId
            )}`,
            {
              method:
                'DELETE'
            }
          );


        const result =
          await response.json();


        if (!response.ok) {

          throw new Error(
            result?.message ||
            'Gagal menghapus laporan'
          );
        }


        alert(
          'Laporan berhasil dihapus.'
        );

        await onBackToDashboard();

      } catch (error) {

        console.error(
          'Gagal menghapus laporan:',
          error
        );


        alert(
          error instanceof Error
            ? error.message
            : 'Gagal menghapus laporan'
        );
      }
    };


  const victimMessage =
    getVictimMessage();


  return (
    <div className="min-h-screen bg-[#faf9fe] text-[#1a1b1f] flex flex-col font-sans pb-16">

      {/* HEADER */}

      <header className="bg-white border-b border-[#c4c6d1] flex justify-between items-center px-4 md:px-6 h-16 z-40 select-none shadow-sm">

        <button
          type="button"
          onClick={
            onBackToDashboard
          }
          className="flex items-center text-[#00193c] font-black text-xs uppercase tracking-wider hover:underline gap-1.5 focus:outline-none"
        >

          <ArrowLeft
            size={16}
            className="text-[#00193c] stroke-[2.5]"
          />

          <span>
            Kembali ke Dashboard
          </span>

        </button>


        <div className="flex items-center gap-2">

          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />

          <span className="font-mono text-[9px] text-[#43474f] uppercase tracking-widest font-black">
            LENTERA CHANNEL SECURE
          </span>

        </div>

      </header>


      <main className="flex-grow p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6">

        {/* TITLE */}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#c4c6d1]">

          <div>

            <div className="flex items-center gap-3 flex-wrap">

              <h2 className="font-extrabold text-2xl text-[#00193c] tracking-tight">
                ID Laporan: {displayReportId}
              </h2>


              <span
                className={`px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  report.status ===
                  'BARU'

                    ? 'bg-[#ba0627] text-white'

                    : report.status ===
                      'PROSES'

                      ? 'bg-[#ffb597] text-[#541d02]'

                      : 'bg-emerald-600 text-white'
                }`}
              >
                Status Saat Ini: {report.status}
              </span>

            </div>


            <p className="text-xs text-[#43474f] mt-1 font-sans">
              Penerimaan sinyal darurat melalui node transceiver LENTERA.
            </p>

          </div>

        </div>


        {/* MAIN INFO */}

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* LEFT */}

          <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">

            {/* SUMMARY */}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 lg:grid-cols-2 gap-4">

              {/* TIME */}

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


              {/* NODE */}

              <div className="bg-[#eeedf2] border border-[#c4c6d1] p-4 rounded flex flex-col justify-between shadow-sm font-mono">

                <span className="text-[10px] uppercase font-extrabold text-[#43474f] font-sans">
                  Node Pengirim
                </span>

                <span className="text-sm md:text-base font-black text-[#00193c] mt-2 block break-all">
                  {report.node}
                </span>

              </div>


              {/* VICTIM */}

              <div className="bg-[#eeedf2] border border-[#c4c6d1] p-4 rounded flex flex-col justify-between shadow-sm">

                <span className="text-[10px] uppercase font-extrabold text-[#43474f]">
                  Jumlah Korban
                </span>

                <span className="text-xl md:text-2xl font-black text-[#00193c] mt-2 block">
                  {victimCount}
                </span>

                <span className="text-[10px] text-[#43474f] font-semibold mt-1">
                  orang
                </span>

              </div>


              {/* SIGNAL */}

              <div className="bg-[#eeedf2] border border-[#c4c6d1] p-4 rounded flex flex-col justify-between shadow-sm font-mono">

                <span className="text-[10px] uppercase font-extrabold text-[#43474f] font-sans">
                  Total Update
                </span>

                <span className="text-xl md:text-2xl font-black text-[#00193c] mt-2 block">
                  {totalSignal}x
                </span>

                <span className="text-[10px] text-[#43474f] font-semibold mt-1 font-sans">
                  laporan diterima
                </span>

              </div>

            </div>


            {/* UPDATE INFO */}

            {totalSignal > 1 && (

              <div className="bg-[#fff3f5] border border-[#ba0627]/30 rounded p-3 text-xs text-[#43474f]">

                <div className="flex items-center gap-2 mb-1">

                  <Radio
                    size={14}
                    className="text-[#ba0627]"
                  />

                  <span className="font-extrabold text-[#ba0627] uppercase tracking-wider text-[10px]">
                    Laporan Diperbarui
                  </span>

                </div>


                <p className="leading-relaxed">
                  Perangkat dengan ID yang sama telah mengirim laporan atau pembaruan sebanyak{' '}

                  <strong>
                    {totalSignal} kali
                  </strong>.
                </p>


                <p className="mt-1 text-[10px] font-semibold">
                  Sinyal terakhir diterima: {formatLastSeen()}
                </p>

              </div>
            )}


            {/* GPS */}

            <div className="bg-white border border-[#c4c6d1] rounded p-5 shadow-sm space-y-4">

              <div className="flex items-center gap-2 border-b border-[#c4c6d1]/50 pb-2">

                <Compass
                  size={18}
                  className="text-[#00193c]"
                />

                <h3 className="font-bold text-xs uppercase tracking-wider text-[#1a1b1f]">
                  Lokasi Laporan
                </h3>

              </div>


              {!hasLocation && (

                <div className="bg-[#fff7ed] border border-[#ffb597] rounded p-3 flex gap-2">

                  <AlertTriangle
                    size={16}
                    className="text-[#ba0627] shrink-0 mt-0.5"
                  />

                  <div>

                    <p className="text-xs font-bold text-[#541d02]">
                      Koordinat belum tersedia
                    </p>

                    <p className="text-[10px] text-[#43474f] mt-1 leading-relaxed">
                      Laporan SOS tetap diterima dan disimpan. Sistem saat ini belum memperoleh sumber lokasi yang valid.
                    </p>

                  </div>

                </div>
              )}


              <div className="space-y-3 font-mono">

                <div>

                  <span className="block text-[9px] font-bold uppercase text-[#43474f] font-sans">
                    Latitude
                  </span>

                  <input
                    type="text"
                    readOnly
                    value={
                      latitudeText
                    }
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
                    value={
                      longitudeText
                    }
                    className="w-full bg-[#f4f3f8] border border-[#c4c6d1] text-xs font-bold text-[#1a1b1f] px-3 py-1.5 rounded focus:outline-none focus:ring-0"
                  />

                </div>


                <div>

                  <span className="block text-[9px] font-bold uppercase text-[#43474f] font-sans">
                    Sumber Lokasi
                  </span>

                  <input
                    type="text"
                    readOnly
                    value={
                      locationSourceText
                    }
                    className="w-full bg-[#f4f3f8] border border-[#c4c6d1] text-xs font-bold text-[#1a1b1f] px-3 py-1.5 rounded focus:outline-none focus:ring-0"
                  />

                </div>


                {report.locationAccuracy !== null &&
                  report.locationAccuracy !== undefined && (

                  <div>

                    <span className="block text-[9px] font-bold uppercase text-[#43474f] font-sans">
                      Akurasi
                    </span>

                    <input
                      type="text"
                      readOnly
                      value={`${report.locationAccuracy} meter`}
                      className="w-full bg-[#f4f3f8] border border-[#c4c6d1] text-xs font-bold text-[#1a1b1f] px-3 py-1.5 rounded focus:outline-none focus:ring-0"
                    />

                  </div>
                )}

              </div>


              <div className="grid grid-cols-1 gap-2 pt-2">

                <button
                  type="button"
                  disabled={
                    !hasLocation
                  }
                  onClick={
                    handleCopyCoords
                  }
                  className={`p-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    hasLocation

                      ? 'bg-white border border-[#c4c6d1] text-[#00193c] hover:bg-[#f4f3f8] active:scale-95 cursor-pointer'

                      : 'bg-[#eeedf2] border border-[#c4c6d1] text-[#92949c] cursor-not-allowed'
                  }`}
                >

                  {copied ? (
                    <>

                      <Check
                        size={14}
                        className="text-emerald-600 stroke-[3]"
                      />

                      <span className="text-emerald-700">
                        Tersalin!
                      </span>

                    </>
                  ) : (
                    <>

                      <Copy
                        size={14}
                      />

                      <span>
                        Salin Koordinat
                      </span>

                    </>
                  )}

                </button>


              </div>

            </div>


            {/* MESSAGE */}

            <div className="bg-white border border-[#c4c6d1] rounded p-5 shadow-sm">

              <div className="flex items-center gap-2 border-b border-[#c4c6d1]/50 pb-2 mb-3">

                <Smartphone
                  size={16}
                  className="text-[#00193c]"
                />

                <h3 className="font-bold text-xs uppercase tracking-wider text-[#1a1b1f]">
                  Pesan ke Perangkat Korban
                </h3>

              </div>


              <div className={`rounded border p-3 ${victimMessage.tone}`}>

                <p className="font-extrabold text-xs uppercase tracking-wider">
                  {victimMessage.title}
                </p>

                <p className="text-xs mt-2 leading-relaxed text-[#1a1b1f]">
                  {victimMessage.message}
                </p>

              </div>

            </div>

          </div>


          {/* RIGHT MAP */}

          <div className="lg:col-span-7 bg-white border border-[#c4c6d1] rounded p-4 shadow-sm flex flex-col">

            <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#c4c6d1]/50">

              <div>

                <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#00193c]">
                  Peta Lokasi Korban
                </h3>

                <p className="text-[10px] text-[#43474f]">
                  Marker ditampilkan jika koordinat laporan tersedia.
                </p>

              </div>


              <div className="px-2 py-1 bg-[#eeedf2] rounded border border-[#c4c6d1] text-[10px] font-bold text-[#00193c]">
                ID {displayReportId}
              </div>

            </div>
            
            <DetailMap report={report} />

          </div>

        </section>


        {/* STATUS */}

        <section className="bg-white border border-[#c4c6d1] rounded p-5 shadow-sm space-y-4">

          <div className="flex items-center gap-2 border-b border-[#c4c6d1]/50 pb-2">

            <Activity
              size={18}
              className="text-[#00193c]"
            />

            <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#1a1b1f]">
              Perbarui Status Operasi
            </h3>

          </div>


          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            <button
              type="button"
              onClick={() =>
                onUpdateStatus(
                  report.id,
                  'BARU'
                )
              }
              className={`py-3.5 px-4 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                report.status ===
                'BARU'

                  ? 'bg-[#ba0627] text-white shadow-[#ba0627]/30 scale-[1.01]'

                  : 'bg-[#eeedf2] border border-[#c4c6d1] text-[#ba0627] hover:bg-[#e3e2e7]'
              }`}
            >

              <Flame
                size={16}
              />

              <span>
                Baru
              </span>

            </button>


            <button
              type="button"
              onClick={() =>
                onUpdateStatus(
                  report.id,
                  'PROSES'
                )
              }
              className={`py-3.5 px-4 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                report.status ===
                'PROSES'

                  ? 'bg-[#ffb597] text-[#541d02] shadow-[#ffb597]/20 scale-[1.01]'

                  : 'bg-[#eeedf2] border border-[#c4c6d1] text-[#541d02] hover:bg-[#e3e2e7]'
              }`}
            >

              <RefreshCw
                size={14}
                className={
                  report.status ===
                  'PROSES'

                    ? 'animate-spin'

                    : ''
                }
              />

              <span>
                Proses
              </span>

            </button>


            <button
              type="button"
              onClick={() =>
                onUpdateStatus(
                  report.id,
                  'SELESAI'
                )
              }
              className={`py-3.5 px-4 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                report.status ===
                'SELESAI'

                  ? 'bg-emerald-600 text-white shadow-emerald-500/20 scale-[1.01]'

                  : 'bg-[#eeedf2] border border-[#c4c6d1] text-emerald-700 hover:bg-[#e3e2e7]'
              }`}
            >

              <CheckCircle
                size={16}
              />

              <span>
                Selesai Ditangani
              </span>

            </button>

          </div>

        </section>


        {/* DELETE REPORT */}

        {report.status ===
          'SELESAI' && (

          <section className="bg-[#fff3f5] border border-[#ba0627]/30 rounded p-5 shadow-sm">

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

              <div>

                <div className="flex items-center gap-2">

                  <Trash2
                    size={18}
                    className="text-[#ba0627]"
                  />

                  <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#ba0627]">
                    Hapus Laporan
                  </h3>

                </div>


                <p className="text-xs text-[#43474f] mt-2 leading-relaxed max-w-xl">
                  Laporan ini telah selesai ditangani. Jika operasi benar-benar sudah berakhir, laporan dapat dihapus dari dashboard. Seluruh log aktivitas laporan ini juga akan ikut dihapus.
                </p>

              </div>


              <button
                type="button"
                onClick={
                  handleDeleteReport
                }
                className="shrink-0 bg-[#ba0627] hover:bg-[#8f041e] text-white px-5 py-3 rounded font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
              >

                <Trash2
                  size={15}
                />

                <span>
                  Hapus Laporan
                </span>

              </button>

            </div>

          </section>
        )}


        {/* LOG */}

        <section className="bg-white border border-[#c4c6d1] rounded p-5 shadow-[0_4px_12px_rgba(0,0,0,0.03)] space-y-4">

          <div className="flex items-center justify-between border-b border-[#c4c6d1]/50 pb-2">

            <div className="flex items-center gap-2">

              <Cpu
                size={18}
                className="text-[#00193c]"
              />

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

                  <th className="py-2 pr-4 font-bold w-24">
                    Waktu
                  </th>

                  <th className="py-2 pr-4 font-bold">
                    Kejadian / Peristiwa
                  </th>

                  <th className="py-2 font-bold text-right">
                    Sumber
                  </th>

                </tr>

              </thead>


              <tbody className="divide-y divide-[#c4c6d1]/40 text-[#1a1b1f] leading-loose">

                {report.logs.map(
                  log => (

                    <tr
                      key={
                        log.id
                      }
                      className="hover:bg-[#faf9fe]"
                    >

                      <td className="py-2.5 pr-4 text-[#43474f]">
                        {log.time}
                      </td>

                      <td className="py-2.5 pr-4 font-medium sm:max-w-xs md:max-w-md break-words">
                        {log.message}
                      </td>

                      <td className="py-2.5 text-right font-semibold text-[#002d62] text-[10px]">
                        {log.source}
                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        </section>

      </main>

    </div>
  );
}
