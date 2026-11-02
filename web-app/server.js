import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Each application owns its writable database; the shared legacy snapshot is a seed.
const dbPath = process.env.LENTERA_WEB_DATABASE
  ? path.resolve(__dirname, process.env.LENTERA_WEB_DATABASE)
  : path.join(__dirname, "data", "lentera.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const legacyDbPath = path.join(__dirname, "..", "shared", "database", "lentera-legacy.db");
if (!fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
  fs.copyFileSync(legacyDbPath, dbPath, fs.constants.COPYFILE_EXCL);
}
const db = new Database(dbPath);

// =======================
// HELPER
// =======================
const getCurrentTimestamp = () => {
  const now = new Date();

  const createdAt = now.toISOString();

  const waktu = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return { now, createdAt, waktu };
};

const normalizeStatusText = (status) => {
  const lower = String(status ?? "").toLowerCase();

  if (lower.includes("baru")) return "BARU";
  if (lower.includes("proses")) return "PROSES";
  if (lower.includes("selesai")) return "SELESAI";

  return String(status ?? "").toUpperCase();
};

const getOperatorLogMessage = (status) => {
  const normalizedStatus = normalizeStatusText(status);

  if (normalizedStatus === "PROSES") {
    return "Status laporan diubah menjadi PROSES. Tim SAR sedang memproses laporan dan menuju koordinat korban.";
  }

  if (normalizedStatus === "SELESAI") {
    return "Status laporan diubah menjadi SELESAI. Penanganan laporan telah diselesaikan oleh operator SAR.";
  }

  return "Status laporan diubah menjadi BARU. Laporan kembali masuk ke antrean awal.";
};

// =======================
// TABLE: REPORTS
// =======================
const createReportsTable = (tableName = "reports") => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      message_id TEXT NOT NULL,

      waktu TEXT NOT NULL,

      status TEXT NOT NULL,

      node_penerima TEXT NOT NULL,

      node_pengirim TEXT,

      latitude REAL,

      longitude REAL,

      victim_count INTEGER NOT NULL DEFAULT 1,

      location_accuracy REAL,

      location_source TEXT NOT NULL DEFAULT 'UNAVAILABLE',

      created_at TEXT,

      last_seen TEXT,

      duplicate_count INTEGER NOT NULL DEFAULT 1
    )
  `).run();
};


// =======================
// MIGRATION REPORTS
// =======================
const migrateReportsTable = () => {

  const reportsTableExists = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'reports'
    `)
    .get();


  // =======================
  // DATABASE BARU
  // =======================
  if (!reportsTableExists) {

    createReportsTable();

  } else {

    // =======================
    // DATABASE LAMA
    // =======================
    const oldColumns = db
      .prepare(`
        PRAGMA table_info(reports)
      `)
      .all();


    const columnNames =
      new Set(
        oldColumns.map(
          (column) => column.name
        )
      );


    const latitudeColumn =
      oldColumns.find(
        (column) =>
          column.name === "latitude"
      );


    const longitudeColumn =
      oldColumns.find(
        (column) =>
          column.name === "longitude"
      );


    // Database lama:
    //
    // latitude REAL NOT NULL
    // longitude REAL NOT NULL
    //
    // Itu harus diubah karena sekarang
    // transmitter boleh mengirim null.
    const needRebuild =
      latitudeColumn?.notnull === 1 ||
      longitudeColumn?.notnull === 1;


    // =======================
    // REBUILD TABLE
    // =======================
    if (needRebuild) {

      console.log(
        "[DB] Migrating reports table..."
      );


      const migration =
        db.transaction(() => {

          db.prepare(`
            DROP TABLE IF EXISTS reports_new
          `).run();


          createReportsTable(
            "reports_new"
          );


          const nodePengirimExpression =
            columnNames.has(
              "node_pengirim"
            )
              ? "COALESCE(node_pengirim, node_penerima)"
              : "node_penerima";


          const victimCountExpression =
            columnNames.has(
              "victim_count"
            )
              ? "COALESCE(victim_count, 1)"
              : "1";


          const accuracyExpression =
            columnNames.has(
              "location_accuracy"
            )
              ? "location_accuracy"
              : "NULL";


          const locationSourceExpression =
            columnNames.has(
              "location_source"
            )
              ? `
                CASE

                  WHEN location_source IS NULL
                    OR TRIM(location_source) = ''

                  THEN
                    CASE

                      WHEN latitude IS NULL
                        OR longitude IS NULL

                      THEN 'UNAVAILABLE'

                      ELSE 'LEGACY'

                    END


                  WHEN UPPER(location_source) = 'UNAVAILABLE'
                    AND latitude IS NOT NULL
                    AND longitude IS NOT NULL

                  THEN 'LEGACY'


                  ELSE UPPER(location_source)

                END
              `
              : `
                CASE

                  WHEN latitude IS NULL
                    OR longitude IS NULL

                  THEN 'UNAVAILABLE'

                  ELSE 'LEGACY'

                END
              `;


          const createdAtExpression =
            columnNames.has(
              "created_at"
            )
              ? "COALESCE(created_at, datetime('now'))"
              : "datetime('now')";


          const lastSeenExpression =
            columnNames.has(
              "last_seen"
            )
              ? "COALESCE(last_seen, created_at, datetime('now'))"
              : createdAtExpression;


          const duplicateCountExpression =
            columnNames.has(
              "duplicate_count"
            )
              ? "COALESCE(duplicate_count, 1)"
              : "1";


          // =======================
          // COPY DATA LAMA
          //
          // Kalau ada message_id
          // yang sudah duplicate,
          // ambil row TERBARU.
          // =======================
          db.exec(`
            INSERT INTO reports_new
            (
              id,

              message_id,

              waktu,

              status,

              node_penerima,

              node_pengirim,

              latitude,

              longitude,

              victim_count,

              location_accuracy,

              location_source,

              created_at,

              last_seen,

              duplicate_count
            )

            SELECT

              id,

              message_id,

              waktu,

              status,

              node_penerima,

              ${nodePengirimExpression},

              latitude,

              longitude,

              ${victimCountExpression},

              ${accuracyExpression},

              ${locationSourceExpression},

              ${createdAtExpression},

              ${lastSeenExpression},

              ${duplicateCountExpression}

            FROM reports

            WHERE id IN (

              SELECT MAX(id)

              FROM reports

              GROUP BY message_id

            )

            ORDER BY id
          `);


          db.prepare(`
            DROP TABLE reports
          `).run();


          db.prepare(`
            ALTER TABLE reports_new
            RENAME TO reports
          `).run();
        });


      migration();


      console.log(
        "[DB] Reports table migration selesai."
      );

    } else {

      // =======================
      // TAMBAH KOLOM BARU
      // =======================
      if (
        !columnNames.has(
          "node_pengirim"
        )
      ) {

        db.prepare(`
          ALTER TABLE reports
          ADD COLUMN node_pengirim TEXT
        `).run();
      }


      if (
        !columnNames.has(
          "victim_count"
        )
      ) {

        db.prepare(`
          ALTER TABLE reports
          ADD COLUMN victim_count INTEGER DEFAULT 1
        `).run();
      }


      if (
        !columnNames.has(
          "location_accuracy"
        )
      ) {

        db.prepare(`
          ALTER TABLE reports
          ADD COLUMN location_accuracy REAL
        `).run();
      }


      if (
        !columnNames.has(
          "location_source"
        )
      ) {

        db.prepare(`
          ALTER TABLE reports
          ADD COLUMN location_source TEXT DEFAULT 'UNAVAILABLE'
        `).run();
      }


      if (
        !columnNames.has(
          "created_at"
        )
      ) {

        db.prepare(`
          ALTER TABLE reports
          ADD COLUMN created_at TEXT
        `).run();
      }


      if (
        !columnNames.has(
          "last_seen"
        )
      ) {

        db.prepare(`
          ALTER TABLE reports
          ADD COLUMN last_seen TEXT
        `).run();
      }


      if (
        !columnNames.has(
          "duplicate_count"
        )
      ) {

        db.prepare(`
          ALTER TABLE reports
          ADD COLUMN duplicate_count INTEGER DEFAULT 1
        `).run();
      }
    }
  }


  // =======================
  // NORMALISASI DATA LAMA
  // =======================
  db.prepare(`
    UPDATE reports

    SET node_pengirim =
      COALESCE(
        NULLIF(node_pengirim, ''),
        node_penerima
      )
  `).run();


  db.prepare(`
    UPDATE reports

    SET victim_count =
      COALESCE(
        victim_count,
        1
      )
  `).run();


  db.prepare(`
    UPDATE reports

    SET duplicate_count =
      COALESCE(
        duplicate_count,
        1
      )
  `).run();


  db.prepare(`
    UPDATE reports

    SET created_at =
      COALESCE(
        created_at,
        datetime('now')
      )
  `).run();


  db.prepare(`
    UPDATE reports

    SET last_seen =
      COALESCE(
        last_seen,
        created_at,
        datetime('now')
      )
  `).run();


  db.prepare(`
    UPDATE reports

    SET location_source =

      CASE

        WHEN location_source IS NULL
          OR TRIM(location_source) = ''

        THEN

          CASE

            WHEN latitude IS NULL
              OR longitude IS NULL

            THEN 'UNAVAILABLE'

            ELSE 'LEGACY'

          END


        WHEN UPPER(location_source) = 'UNAVAILABLE'
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL

        THEN 'LEGACY'


        ELSE UPPER(location_source)

      END
  `).run();


  // =======================
  // HAPUS DUPLICATE LAMA
  //
  // Satu message_id
  // = satu row aktif.
  // =======================
  db.prepare(`
    DELETE FROM reports

    WHERE id NOT IN (

      SELECT MAX(id)

      FROM reports

      GROUP BY message_id
    )
  `).run();


  // =======================
  // MESSAGE ID UNIQUE
  // =======================
  db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    idx_reports_message_id_unique

    ON reports(message_id)
  `).run();
};


migrateReportsTable();


// =======================
// TABLE: REPORT LOGS
// =======================
db.prepare(`
  CREATE TABLE IF NOT EXISTS report_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    message_id TEXT NOT NULL,

    waktu TEXT NOT NULL,

    message TEXT NOT NULL,

    source TEXT NOT NULL,

    created_at TEXT NOT NULL
  )
`).run();


// =======================
// GET ALL REPORTS
// =======================
app.get(
  "/api/reports",
  (req, res) => {

    try {

      const reports =
        db
          .prepare(`
            SELECT *
            FROM reports
            ORDER BY id DESC
          `)
          .all();


      res.json(
        reports
      );

    } catch (error) {

      console.error(
        "Gagal mengambil laporan:",
        error
      );


      res
        .status(500)
        .json({

          success: false,

          message:
            "Gagal mengambil laporan",

        });
    }
  }
);


// =======================
// GET DETAIL REPORT
// =======================
app.get(
  "/api/reports/detail/:id",
  (req, res) => {

    try {

      const report =
        db
          .prepare(`
            SELECT *
            FROM reports
            WHERE id = ?
          `)
          .get(
            req.params.id
          );


      if (!report) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              "Laporan tidak ditemukan",

          });
      }


      res.json(
        report
      );

    } catch (error) {

      console.error(
        "Gagal mengambil detail laporan:",
        error
      );


      res
        .status(500)
        .json({

          success: false,

          message:
            "Gagal mengambil detail laporan",

        });
    }
  }
);


// =======================
// GET REPORT LOGS
// =======================
app.get(
  "/api/reports/:message_id/logs",
  (req, res) => {

    const {
      message_id
    } =
      req.params;


    try {

      const logs =
        db
          .prepare(`
            SELECT *

            FROM report_logs

            WHERE message_id = ?

            ORDER BY id ASC
          `)
          .all(
            message_id
          );


      res.json(
        logs
      );

    } catch (error) {

      console.error(
        "Gagal mengambil log laporan:",
        error
      );


      res
        .status(500)
        .json({

          success: false,

          message:
            "Gagal mengambil log laporan",

        });
    }
  }
);


// =======================
// POST /api/reports
//
// ID BARU
// -> INSERT
//
// ID SAMA
// -> UPDATE ROW YANG SAMA
//
// latitude / longitude
// boleh NULL.
//
// Status operator tidak
// di-reset saat update korban.
// =======================
app.post(
  "/api/reports",
  (req, res) => {

    const {
      message_id,

      status,

      node_penerima,

      node_pengirim,

      latitude,

      longitude,

      victim_count,

      location_accuracy,

      location_source,
    } =
      req.body;


    // =======================
    // BASIC VALIDATION
    // =======================
    if (
      !message_id ||
      !status
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "message_id dan status wajib diisi",

        });
    }


    if (
      !String(
        message_id
      ).startsWith(
        "LNT-"
      )
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Format message_id tidak valid",

        });
    }


    // =======================
    // NODE
    // =======================
    const finalNodePenerima =
      node_penerima ||
      node_pengirim;


    const finalNodePengirim =
      node_pengirim ||
      node_penerima;


    if (
      !finalNodePenerima ||
      !finalNodePengirim
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Informasi node tidak tersedia",

        });
    }


    // =======================
    // VICTIM COUNT
    // =======================
    const victimCountNumber =

      victim_count == null ||
      victim_count === ""

        ? 1

        : Number(
            victim_count
          );


    if (
      !Number.isInteger(
        victimCountNumber
      ) ||
      victimCountNumber < 1
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Jumlah korban harus berupa bilangan bulat minimal 1",

        });
    }


    // =======================
    // LOCATION SOURCE
    // =======================
    let finalLocationSource =
      String(
        location_source ||
        ""
      )
        .trim()
        .toUpperCase();


    const hasLatitude =
      latitude !== null &&
      latitude !== undefined &&
      latitude !== "";


    const hasLongitude =
      longitude !== null &&
      longitude !== undefined &&
      longitude !== "";


    // Tidak boleh hanya salah satu.
    if (
      hasLatitude !==
      hasLongitude
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Latitude dan longitude harus tersedia bersamaan",

        });
    }


    let latitudeNumber =
      null;


    let longitudeNumber =
      null;


    let accuracyNumber =
      null;


    // =======================
    // ADA KOORDINAT
    // =======================
    if (
      hasLatitude &&
      hasLongitude
    ) {

      latitudeNumber =
        Number(
          latitude
        );


      longitudeNumber =
        Number(
          longitude
        );


      if (
        Number.isNaN(
          latitudeNumber
        ) ||
        Number.isNaN(
          longitudeNumber
        )
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Latitude dan longitude harus berupa angka atau null",

          });
      }


      if (
        latitudeNumber < -90 ||
        latitudeNumber > 90 ||
        longitudeNumber < -180 ||
        longitudeNumber > 180
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "Koordinat berada di luar range yang valid",

          });
      }


      if (
        !finalLocationSource
      ) {

        finalLocationSource =
          "UNKNOWN";
      }

    } else {

      // =======================
      // TIDAK ADA LOKASI
      // =======================
      latitudeNumber =
        null;


      longitudeNumber =
        null;


      if (
        !finalLocationSource
      ) {

        finalLocationSource =
          "UNAVAILABLE";
      }
    }


    // =======================
    // LOCATION ACCURACY
    // =======================
    if (
      location_accuracy !== null &&
      location_accuracy !== undefined &&
      location_accuracy !== ""
    ) {

      accuracyNumber =
        Number(
          location_accuracy
        );


      if (
        Number.isNaN(
          accuracyNumber
        ) ||
        accuracyNumber < 0
      ) {

        return res
          .status(400)
          .json({

            success: false,

            message:
              "location_accuracy tidak valid",

          });
      }
    }


    // =======================
    // GPS / GNSS FIX
    // =======================
    if (
      [
        "PHONE_GPS",
        "NODE_GNSS"
      ].includes(
        finalLocationSource
      ) &&
      (
        latitudeNumber === null ||
        longitudeNumber === null
      )
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            `${finalLocationSource} membutuhkan latitude dan longitude`,

        });
    }


    // =======================
    // UNAVAILABLE
    // =======================
    if (
      finalLocationSource ===
      "UNAVAILABLE"
    ) {

      latitudeNumber =
        null;

      longitudeNumber =
        null;

      accuracyNumber =
        null;
    }


    const normalizedIncomingStatus =
      normalizeStatusText(
        status
      );


    const {
      createdAt,
      waktu,
    } =
      getCurrentTimestamp();


    try {

      // =======================
      // CEK REPORT EXISTING
      // =======================
      const existingReport =
        db
          .prepare(`
            SELECT *

            FROM reports

            WHERE message_id = ?

            LIMIT 1
          `)
          .get(
            message_id
          );


      // =======================
      // UPSERT
      // =======================
      db.prepare(`
        INSERT INTO reports
        (
          message_id,

          waktu,

          status,

          node_penerima,

          node_pengirim,

          latitude,

          longitude,

          victim_count,

          location_accuracy,

          location_source,

          created_at,

          last_seen,

          duplicate_count
        )

        VALUES
        (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )


        ON CONFLICT(message_id)

        DO UPDATE SET


          node_penerima =
            excluded.node_penerima,


          node_pengirim =
            excluded.node_pengirim,


          latitude =

            CASE

              WHEN excluded.latitude IS NULL
                OR excluded.longitude IS NULL

              THEN reports.latitude

              ELSE excluded.latitude

            END,


          longitude =

            CASE

              WHEN excluded.latitude IS NULL
                OR excluded.longitude IS NULL

              THEN reports.longitude

              ELSE excluded.longitude

            END,


          victim_count =
            excluded.victim_count,


          location_accuracy =

            CASE

              WHEN excluded.latitude IS NULL
                OR excluded.longitude IS NULL

              THEN reports.location_accuracy

              ELSE excluded.location_accuracy

            END,


          location_source =

            CASE

              WHEN excluded.latitude IS NULL
                OR excluded.longitude IS NULL

              THEN

                CASE

                  WHEN reports.latitude IS NOT NULL
                    AND reports.longitude IS NOT NULL

                  THEN reports.location_source

                  ELSE excluded.location_source

                END

              ELSE excluded.location_source

            END,


          last_seen =
            excluded.last_seen,


          duplicate_count =

            COALESCE(
              reports.duplicate_count,
              1
            ) + 1

      `).run(

        message_id,

        waktu,

        normalizedIncomingStatus,

        finalNodePenerima,

        finalNodePengirim,

        latitudeNumber,

        longitudeNumber,

        victimCountNumber,

        accuracyNumber,

        finalLocationSource,

        createdAt,

        createdAt,

        1
      );


      // =======================
      // GET FINAL REPORT
      // =======================
      const report =
        db
          .prepare(`
            SELECT *

            FROM reports

            WHERE message_id = ?

            LIMIT 1
          `)
          .get(
            message_id
          );


      // =======================
      // UPDATE RESPONSE
      // =======================
      if (
        existingReport
      ) {

        console.log(
          `[REPORT UPDATE] ${message_id} | korban: ${victimCountNumber}`
        );


        return res.json({

          success: true,

          duplicate: true,

          updated: true,

          message:
            "Laporan yang sama berhasil diperbarui.",

          report,
        });
      }


      // =======================
      // NEW REPORT RESPONSE
      // =======================
      console.log(
        `[REPORT NEW] ${message_id} | korban: ${victimCountNumber}`
      );


      return res.json({

        success: true,

        duplicate: false,

        updated: false,

        message:
          "Laporan SOS baru berhasil disimpan.",

        report,
      });


    } catch (error) {

      console.error(
        "Gagal menyimpan laporan:",
        error
      );


      return res
        .status(500)
        .json({

          success: false,

          message:
            "Gagal menyimpan laporan",

        });
    }
  }
);


// =======================
// UPDATE STATUS
// =======================
app.patch(
  "/api/reports/:message_id/status",
  (req, res) => {

    const {
      status
    } =
      req.body;


    const {
      message_id
    } =
      req.params;


    if (
      !status
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Status wajib diisi",

        });
    }


    const normalizedStatus =
      normalizeStatusText(
        status
      );


    if (
      ![
        "BARU",
        "PROSES",
        "SELESAI"
      ].includes(
        normalizedStatus
      )
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Status tidak valid",

        });
    }


    try {

      const existingReport =
        db
          .prepare(`
            SELECT *

            FROM reports

            WHERE message_id = ?

            LIMIT 1
          `)
          .get(
            message_id
          );


      if (
        !existingReport
      ) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              "Laporan tidak ditemukan",

          });
      }


      const result =
        db
          .prepare(`
            UPDATE reports

            SET status = ?

            WHERE message_id = ?
          `)
          .run(
            normalizedStatus,
            message_id
          );


      const {
        createdAt,
        waktu,
      } =
        getCurrentTimestamp();


      const logMessage =
        getOperatorLogMessage(
          normalizedStatus
        );


      db.prepare(`
        INSERT INTO report_logs
        (
          message_id,

          waktu,

          message,

          source,

          created_at
        )

        VALUES (?, ?, ?, ?, ?)
      `).run(

        message_id,

        waktu,

        logMessage,

        "SAR Mission Control",

        createdAt
      );


      const updatedReport =
        db
          .prepare(`
            SELECT *

            FROM reports

            WHERE message_id = ?

            LIMIT 1
          `)
          .get(
            message_id
          );


      res.json({

        success: true,

        message:
          "Status laporan berhasil diperbarui",

        changed:
          result.changes,

        report:
          updatedReport,

        log: {

          message_id,

          waktu,

          message:
            logMessage,

          source:
            "SAR Mission Control",

          created_at:
            createdAt,
        },
      });

    } catch (error) {

      console.error(
        "Gagal memperbarui status laporan:",
        error
      );


      res
        .status(500)
        .json({

          success: false,

          message:
            "Gagal memperbarui status laporan",

        });
    }
  }
);


// =======================
// DELETE REPORT
// =======================
app.delete(
  "/api/reports/:message_id",
  (req, res) => {

    const {
      message_id
    } =
      req.params;


    try {

      const result =
        db
          .prepare(`
            DELETE FROM reports

            WHERE message_id = ?
          `)
          .run(
            message_id
          );


      db.prepare(`
        DELETE FROM report_logs

        WHERE message_id = ?
      `).run(
        message_id
      );


      if (
        result.changes === 0
      ) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              "Laporan tidak ditemukan",

          });
      }


      res.json({

        success: true,

        message:
          `Laporan ${message_id} berhasil dihapus`,
      });

    } catch (error) {

      console.error(
        "Gagal menghapus laporan:",
        error
      );


      res
        .status(500)
        .json({

          success: false,

          message:
            "Gagal menghapus laporan",

        });
    }
  }
);


// =======================
// TABLE: USERS
// =======================
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    username TEXT NOT NULL UNIQUE,

    password TEXT NOT NULL,

    name TEXT NOT NULL,

    role TEXT NOT NULL
  )
`).run();


// =======================
// DEFAULT USER
// =======================
const userCount =
  db
    .prepare(`
      SELECT COUNT(*) AS total
      FROM users
    `)
    .get();


if (
  userCount.total === 0
) {

  db.prepare(`
    INSERT INTO users
    (
      username,

      password,

      name,

      role
    )

    VALUES (?, ?, ?, ?)
  `).run(

    "admin",

    "admin123",

    "Admin User",

    "Koordinator Lapangan"
  );
}


// =======================
// LOGIN
// =======================
app.post(
  "/api/login",
  (req, res) => {

    const {
      username,
      password
    } =
      req.body;


    if (
      !username ||
      !password
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Username dan password wajib diisi",

        });
    }


    try {

      const user =
        db
          .prepare(`
            SELECT
              id,
              username,
              name,
              role

            FROM users

            WHERE username = ?
              AND password = ?
          `)
          .get(
            username,
            password
          );


      if (
        !user
      ) {

        return res
          .status(401)
          .json({

            success: false,

            message:
              "Username atau password salah",

          });
      }


      res.json({

        success: true,

        message:
          "Login berhasil",

        user,
      });

    } catch (error) {

      console.error(
        "Gagal login:",
        error
      );


      res
        .status(500)
        .json({

          success: false,

          message:
            "Gagal login",

        });
    }
  }
);


// =======================
// REGISTER
// =======================
app.post(
  "/api/register",
  (req, res) => {

    const {
      username,

      password,

      name,

      role
    } =
      req.body;


    if (
      !username ||
      !password ||
      !name ||
      !role
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Semua field wajib diisi",

        });
    }


    try {

      const existingUser =
        db
          .prepare(`
            SELECT *

            FROM users

            WHERE username = ?
          `)
          .get(
            username
          );


      if (
        existingUser
      ) {

        return res
          .status(409)
          .json({

            success: false,

            message:
              "Username sudah digunakan",

          });
      }


      db.prepare(`
        INSERT INTO users
        (
          username,

          password,

          name,

          role
        )

        VALUES (?, ?, ?, ?)
      `).run(

        username,

        password,

        name,

        role
      );


      res.json({

        success: true,

        message:
          "Akun berhasil dibuat",
      });

    } catch (error) {

      console.error(
        "Gagal register:",
        error
      );


      res
        .status(500)
        .json({

          success: false,

          message:
            "Gagal membuat akun",

        });
    }
  }
);


// =======================
// GET USERS
// =======================
app.get(
  "/api/users",
  (req, res) => {

    try {

      const users =
        db
          .prepare(`
            SELECT
              id,
              username,
              name,
              role

            FROM users

            ORDER BY id DESC
          `)
          .all();


      res.json(
        users
      );

    } catch (error) {

      console.error(
        "Gagal mengambil users:",
        error
      );


      res
        .status(500)
        .json({

          success: false,

          message:
            "Gagal mengambil users",

        });
    }
  }
);


// =======================
// API INFO PAGE
// =======================
app.get(
  "/api",
  (req, res) => {

    res.send(`
      <h1>LENTERA API Server</h1>

      <p>
        Server backend LENTERA sedang berjalan.
      </p>

      <h3>
        Endpoint yang tersedia:
      </h3>

      <ul>

        <li>
          <a href="/api/reports">
            /api/reports
          </a>
          - Melihat data laporan SOS
        </li>

        <li>
          <a href="/api/users">
            /api/users
          </a>
          - Melihat data akun admin/operator
        </li>

        <li>
          /api/login - Login user (POST)
        </li>

        <li>
          /api/register - Membuat akun baru (POST)
        </li>

        <li>
          /api/reports - Menambah / memperbarui laporan SOS (POST)
        </li>

        <li>
          /api/reports/:message_id/logs - Melihat log aktivitas laporan
        </li>

        <li>
          /api/reports/:message_id/status - Update status laporan (PATCH)
        </li>

        <li>
          /api/reports/:message_id - Menghapus laporan SOS (DELETE)
        </li>

      </ul>
    `);
  }
);


// =======================
// SERVE FRONTEND DIST
// =======================
const distPath =
  path.join(
    __dirname,
    "dist"
  );


if (
  fs.existsSync(
    distPath
  )
) {

  app.use(
    express.static(
      distPath
    )
  );


  app.get(
    "*",
    (req, res) => {

      res.sendFile(
        path.join(
          distPath,
          "index.html"
        )
      );
    }
  );

} else {

  app.get(
    "/",
    (req, res) => {

      res.send(`
        <h1>
          LENTERA API Server
        </h1>

        <p>
          Backend berjalan di:
          <b>
            http://localhost:${port}
          </b>
        </p>

        <p>
          Frontend development berjalan di:
          <b>
            http://localhost:3000
          </b>
        </p>

        <p>
          API reports:
          <a href="/api/reports">
            /api/reports
          </a>
        </p>

        <p>
          Catatan:
          folder <b>dist</b> belum ada.
          Jalankan <code>npm run build</code>
          jika ingin membuka dashboard dari port backend.
        </p>
      `);
    }
  );
}


// =======================
// START SERVER
// =======================
app.listen(
  port,
  "0.0.0.0",
  () => {

    console.log(
      `LENTERA database server running at http://localhost:${port}`
    );
  }
);
