import React, {
  useEffect,
  useState
} from 'react';

import {
  AnimatePresence,
  motion
} from 'motion/react';

import {
  Report,
  ReportStatus,
  SystemLog
} from './types';

import LoginScreen
  from './components/LoginScreen';

import DashboardScreen
  from './components/DashboardScreen';

import DetailScreen
  from './components/DetailScreen';

import SettingsScreen
  from './components/SettingsScreen';


// ==========================
// TYPE DATA DARI BACKEND
// ==========================

type ApiReport = {
  id: number;

  message_id: string;

  waktu: string;

  status: string;

  node_penerima: string;

  node_pengirim?:
    | string
    | null;

  latitude:
    | number
    | null;

  longitude:
    | number
    | null;

  victim_count?:
    number;

  location_accuracy?:
    | number
    | null;

  location_source?:
    | string
    | null;

  created_at?:
    string;

  last_seen?:
    string;

  duplicate_count?:
    number;
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

  // ==========================
  // SCREEN
  // ==========================

  const [
    currentScreen,
    setCurrentScreen
  ] =
    useState<
      | 'LOGIN'
      | 'DASHBOARD'
      | 'DETAIL'
      | 'SETTINGS'
    >(
      'LOGIN'
    );


  // ==========================
  // SELECTED REPORT
  // ==========================

  const [
    selectedReportId,
    setSelectedReportId
  ] =
    useState<
      number | null
    >(
      null
    );


  // ==========================
  // REPORT DATA
  // ==========================

  const [
    reports,
    setReports
  ] =
    useState<Report[]>(
      []
    );


  // ==========================
  // USER
  // ==========================

  const [
    currentUser,
    setCurrentUser
  ] =
    useState<
      LoggedInUser | null
    >(
      null
    );


  // ==========================
  // API URL
  // ==========================

  const API_URL =

    window.location.hostname ===
      'localhost' ||

    window.location.hostname.startsWith(
      '192.168.'
    )

      ? `http://${window.location.hostname}:4000/api/reports`

      : '/api/reports';


  // ==========================
  // HELPER TIME
  // ==========================

  const formatLogTime = (
    date: Date
  ): string => {

    return `${String(
      date.getHours()
    ).padStart(
      2,
      '0'
    )}:${String(
      date.getMinutes()
    ).padStart(
      2,
      '0'
    )}:${String(
      date.getSeconds()
    ).padStart(
      2,
      '0'
    )}`;
  };


  // ==========================
  // STATUS NORMALIZATION
  // ==========================

  const normalizeStatus = (
    status: string
  ): ReportStatus => {

    const lower =
      String(
        status || ''
      ).toLowerCase();


    if (
      lower.includes(
        'proses'
      )
    ) {

      return 'PROSES';
    }


    if (
      lower.includes(
        'selesai'
      )
    ) {

      return 'SELESAI';
    }


    return 'BARU';
  };


  // ==========================
  // FORMAT REPORT TIME
  // ==========================

  const formatTimeFromCreatedAt = (
    createdAt?: string,
    fallbackTime?: string
  ): string => {

    if (
      !createdAt
    ) {

      return (
        fallbackTime ||
        '-'
      );
    }


    const parsedDate =
      new Date(
        createdAt
      );


    if (
      Number.isNaN(
        parsedDate.getTime()
      )
    ) {

      return (
        fallbackTime ||
        '-'
      );
    }


    return parsedDate
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
  };


  // ==========================
  // API -> FRONTEND
  // ==========================

  const mapApiReportToReport = (
    item: ApiReport,
    extraLogs: ApiReportLog[] = []
  ): Report => {

    // ==========================
    // LOCATION
    //
    // JANGAN Number(null)
    // karena hasilnya 0.
    // ==========================

    const latitude =

      item.latitude === null ||
      item.latitude === undefined

        ? null

        : Number(
            item.latitude
          );


    const longitude =

      item.longitude === null ||
      item.longitude === undefined

        ? null

        : Number(
            item.longitude
          );


    const locationAccuracy =

      item.location_accuracy === null ||
      item.location_accuracy === undefined

        ? null

        : Number(
            item.location_accuracy
          );


    const victimCount =
      item.victim_count ??
      1;


    const duplicateCount =
      item.duplicate_count ??
      1;


    const node =
      item.node_pengirim ||
      item.node_penerima;


    const locationSource =
      item.location_source ||
      'UNAVAILABLE';


    const hasLocation =
      latitude !== null &&
      longitude !== null;


    // ==========================
    // BASE SYSTEM LOGS
    // ==========================

    const baseLogs:
      SystemLog[] =
      [
        {
          id:
            `log-${item.id}-1`,

          time:
            item.waktu,

          message:
            `Sinyal SOS diterima dari ${node}`,

          source:
            'Gateway LoRa'
        },

        {
          id:
            `log-${item.id}-2`,

          time:
            item.waktu,

          message:
            hasLocation

              ? `Koordinat lokasi diterima: (${latitude}, ${longitude})`

              : 'Koordinat lokasi belum tersedia.',

          source:
            'Database Lokal'
        },

        {
          id:
            `log-${item.id}-3`,

          time:
            item.waktu,

          message:
            `Jumlah korban yang dilaporkan: ${victimCount} orang`,

          source:
            'Captive Portal'
        },

        {
          id:
            `log-${item.id}-4`,

          time:
            item.waktu,

          message:
            `Total laporan/update diterima backend: ${duplicateCount} kali`,

          source:
            'LENTERA Backend'
        }
      ];


    // ==========================
    // OPERATOR STATUS LOGS
    // ==========================

    const statusLogs:
      SystemLog[] =

      extraLogs.map(
        log => ({
          id:
            `status-log-${log.id}`,

          time:
            log.waktu,

          message:
            log.message,

          source:
            log.source
        })
      );


    return {

      id:
        item.id,

      messageId:
        item.message_id,

      time:
        formatTimeFromCreatedAt(
          item.created_at,
          item.waktu
        ),

      status:
        normalizeStatus(
          item.status
        ),

      node,

      nodePengirim:
        item.node_pengirim ||
        undefined,

      latitude,

      longitude,

      victimCount,

      locationAccuracy,

      locationSource,

      createdAt:
        item.created_at,

      lastSeen:
        item.last_seen,

      duplicateCount,

      logs: [
        ...baseLogs,
        ...statusLogs
      ]
    };
  };


  // ==========================
  // FETCH REPORTS
  // ==========================

  const fetchReports =
    async () => {

      try {

        const response =
          await fetch(
            API_URL
          );


        if (
          !response.ok
        ) {

          console.error(
            'Gagal mengambil data laporan. Status:',
            response.status
          );

          return;
        }


        const data:
          ApiReport[] =
          await response.json();


        const mappedReports =
          await Promise.all(

            data.map(
              async item => {

                try {

                  const logResponse =
                    await fetch(
                      `${API_URL}/${encodeURIComponent(
                        item.message_id
                      )}/logs`
                    );


                  if (
                    !logResponse.ok
                  ) {

                    return mapApiReportToReport(
                      item
                    );
                  }


                  const logs:
                    ApiReportLog[] =
                    await logResponse.json();


                  return mapApiReportToReport(
                    item,
                    logs
                  );

                } catch (
                  error
                ) {

                  console.error(
                    'Gagal mengambil log laporan:',
                    error
                  );


                  return mapApiReportToReport(
                    item
                  );
                }
              }
            )
          );


        setReports(
          mappedReports
        );

      } catch (
        error
      ) {

        console.error(
          'Gagal mengambil data laporan:',
          error
        );
      }
    };


  // ==========================
  // AUTO REFRESH
  // ==========================

  useEffect(
    () => {

      fetchReports();


      const interval =
        setInterval(
          () => {

            fetchReports();

          },
          3000
        );


      return () =>
        clearInterval(
          interval
        );

    },
    []
  );


  // ==========================
  // SELECT REPORT
  // ==========================

  const handleSelectReport = (
    id: number
  ) => {

    setSelectedReportId(
      id
    );


    setCurrentScreen(
      'DETAIL'
    );
  };


  // ==========================
  // BACK DASHBOARD
  //
  // Setelah kembali dashboard,
  // data langsung diambil ulang.
  // Ini penting setelah DELETE.
  // ==========================

  const handleBackToDashboard =
    async () => {

      setSelectedReportId(
        null
      );


      setCurrentScreen(
        'DASHBOARD'
      );


      await fetchReports();
    };


  // ==========================
  // UPDATE STATUS
  // ==========================

  const handleUpdateStatus =
    async (
      id: number,
      newStatus:
        ReportStatus
    ) => {

      const selectedReport =
        reports.find(
          report =>
            report.id ===
            id
        );


      if (
        !selectedReport
      ) {

        return;
      }


      if (
        !selectedReport.messageId
      ) {

        console.error(
          'messageId laporan tidak ditemukan.'
        );

        return;
      }


      if (
        selectedReport.status ===
        newStatus
      ) {

        return;
      }


      const statusForDatabase =

        newStatus ===
        'BARU'

          ? 'Baru'

          : newStatus ===
            'PROSES'

            ? 'Proses'

            : 'Selesai';


      try {

        const response =
          await fetch(

            `${API_URL}/${encodeURIComponent(
              selectedReport.messageId
            )}/status`,

            {
              method:
                'PATCH',

              headers: {
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify(
                  {
                    status:
                      statusForDatabase
                  }
                )
            }
          );


        if (
          !response.ok
        ) {

          let errorMessage =
            'Gagal update status ke database';


          try {

            const result =
              await response.json();


            if (
              result?.message
            ) {

              errorMessage =
                result.message;
            }

          } catch (
            error
          ) {

            console.error(
              'Response error bukan JSON:',
              error
            );
          }


          console.error(
            errorMessage
          );


          alert(
            errorMessage
          );


          return;
        }


        const now =
          new Date();


        const timeStr =
          formatLogTime(
            now
          );


        const localLogMessage =

          newStatus ===
          'PROSES'

            ? `Status laporan diubah menjadi PROSES oleh ${
                currentUser?.name ||
                'Admin User'
              }. Tim SAR sedang memproses laporan.`

            : newStatus ===
              'SELESAI'

              ? `Status laporan diubah menjadi SELESAI oleh ${
                  currentUser?.name ||
                  'Admin User'
                }. Penanganan laporan telah diselesaikan.`

              : `Status laporan diubah menjadi BARU oleh ${
                  currentUser?.name ||
                  'Admin User'
                }. Laporan kembali masuk ke antrean awal.`;


        // Update lokal supaya UI langsung berubah.
        setReports(
          previousReports =>

            previousReports.map(
              report => {

                if (
                  report.id ===
                  id
                ) {

                  const newLog:
                    SystemLog =
                    {
                      id:
                        `log-dynamic-${now.getTime()}`,

                      time:
                        timeStr,

                      message:
                        localLogMessage,

                      source:
                        'SAR Mission Control'
                    };


                  return {
                    ...report,

                    status:
                      newStatus,

                    logs: [
                      ...report.logs,
                      newLog
                    ]
                  };
                }


                return report;
              }
            )
        );


        // Sinkronkan kembali dengan database.
        await fetchReports();

      } catch (
        error
      ) {

        console.error(
          'Gagal update status ke database:',
          error
        );


        alert(
          'Tidak dapat terhubung ke backend.'
        );
      }
    };


  // ==========================
  // LOGOUT
  // ==========================

  const handleLogout =
    () => {

      setCurrentUser(
        null
      );


      setSelectedReportId(
        null
      );


      setCurrentScreen(
        'LOGIN'
      );
    };


  // ==========================
  // SELECTED REPORT EXISTS
  // ==========================

  const selectedReportExists =

    selectedReportId !==
      null &&

    reports.some(
      report =>
        report.id ===
        selectedReportId
    );


  const showDashboard =

    currentScreen ===
      'DASHBOARD' ||

    (
      currentScreen ===
        'DETAIL' &&

      !selectedReportExists
    );


  // ==========================
  // UI
  // ==========================

  return (

    <div className="min-h-screen bg-[#faf9fe]">

      <AnimatePresence
        mode="wait"
      >

        {/* LOGIN */}

        {currentScreen ===
          'LOGIN' && (

          <motion.div
            key="login"

            initial={{
              opacity: 0
            }}

            animate={{
              opacity: 1
            }}

            exit={{
              opacity: 0
            }}

            transition={{
              duration: 0.3
            }}
          >

            <LoginScreen

              onLoginSuccess={
                user => {

                  setCurrentUser(
                    user
                  );


                  setSelectedReportId(
                    null
                  );


                  setCurrentScreen(
                    'DASHBOARD'
                  );


                  fetchReports();
                }
              }

            />

          </motion.div>
        )}


        {/* DASHBOARD */}

        {showDashboard && (

          <motion.div
            key="dashboard"

            initial={{
              opacity: 0
            }}

            animate={{
              opacity: 1
            }}

            exit={{
              opacity: 0
            }}

            transition={{
              duration: 0.3
            }}
          >

            <DashboardScreen

              reports={
                reports
              }

              user={
                currentUser
              }

              onSelectReport={
                handleSelectReport
              }

              onNavigateToSettings={
                () => {

                  setSelectedReportId(
                    null
                  );


                  setCurrentScreen(
                    'SETTINGS'
                  );
                }
              }

              onNavigateToLogout={
                handleLogout
              }

            />

          </motion.div>
        )}


        {/* DETAIL */}

        {currentScreen ===
          'DETAIL' &&

          selectedReportExists &&

          selectedReportId !==
            null && (

          <motion.div
            key="detail"

            initial={{
              opacity: 0
            }}

            animate={{
              opacity: 1
            }}

            exit={{
              opacity: 0
            }}

            transition={{
              duration: 0.3
            }}
          >

            <DetailScreen

              reportId={
                selectedReportId
              }

              reports={
                reports
              }

              onBackToDashboard={
                handleBackToDashboard
              }

              onUpdateStatus={
                handleUpdateStatus
              }

            />

          </motion.div>
        )}


        {/* SETTINGS */}

        {currentScreen ===
          'SETTINGS' && (

          <motion.div
            key="settings"

            initial={{
              opacity: 0
            }}

            animate={{
              opacity: 1
            }}

            exit={{
              opacity: 0
            }}

            transition={{
              duration: 0.3
            }}
          >

            <SettingsScreen

              user={
                currentUser
              }

              onBackToDashboard={
                handleBackToDashboard
              }

              onLogout={
                handleLogout
              }

            />

          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}