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

const db = new Database("lentera.db");

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
  const lower = String(status).toLowerCase();

  if (lower.includes("baru")) return "BARU";
  if (lower.includes("proses")) return "PROSES";
  if (lower.includes("selesai")) return "SELESAI";

  return String(status).toUpperCase();
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
db.prepare(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    waktu TEXT NOT NULL,
    status TEXT NOT NULL,
    node_penerima TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    victim_count INTEGER DEFAULT 1,
    created_at TEXT,
    last_seen TEXT,
    duplicate_count INTEGER DEFAULT 1
  )
`).run();

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
// MIGRATION DATABASE LAMA
// =======================
try {
  db.prepare("ALTER TABLE reports ADD COLUMN created_at TEXT").run();
} catch (error) {
  // Kolom sudah ada
}

try {
  db.prepare("ALTER TABLE reports ADD COLUMN last_seen TEXT").run();
} catch (error) {
  // Kolom sudah ada
}

try {
  db.prepare("ALTER TABLE reports ADD COLUMN duplicate_count INTEGER DEFAULT 1").run();
} catch (error) {
  // Kolom sudah ada
}

try {
  db.prepare("ALTER TABLE reports ADD COLUMN victim_count INTEGER DEFAULT 1").run();
} catch (error) {
  // Kolom sudah ada
}

// Isi kolom kosong pada data lama, kalau masih ada data lama
db.prepare(`
  UPDATE reports
  SET created_at = COALESCE(created_at, datetime('now'))
  WHERE created_at IS NULL
`).run();

db.prepare(`
  UPDATE reports
  SET 
    last_seen = COALESCE(last_seen, created_at, datetime('now')),
    duplicate_count = COALESCE(duplicate_count, 1),
    victim_count = COALESCE(victim_count, 1)
  WHERE last_seen IS NULL 
     OR duplicate_count IS NULL
     OR victim_count IS NULL
`).run();

// CATATAN:
// Tidak ada dummy data.
// Database laporan akan kosong sampai ada data asli dari ESP32 receiver.

// =======================
// REPORT ENDPOINTS
// =======================

// Ambil semua laporan
app.get("/api/reports", (req, res) => {
  try {
    const reports = db
      .prepare("SELECT * FROM reports ORDER BY id DESC")
      .all();

    res.json(reports);
  } catch (error) {
    console.error("Gagal mengambil laporan:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil laporan",
    });
  }
});

// Ambil detail laporan berdasarkan id database
app.get("/api/reports/detail/:id", (req, res) => {
  try {
    const report = db
      .prepare("SELECT * FROM reports WHERE id = ?")
      .get(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Laporan tidak ditemukan",
      });
    }

    res.json(report);
  } catch (error) {
    console.error("Gagal mengambil detail laporan:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail laporan",
    });
  }
});

// Ambil log tambahan berdasarkan message_id
app.get("/api/reports/:message_id/logs", (req, res) => {
  const { message_id } = req.params;

  try {
    const logs = db
      .prepare(`
        SELECT *
        FROM report_logs
        WHERE message_id = ?
        ORDER BY id ASC
      `)
      .all(message_id);

    res.json(logs);
  } catch (error) {
    console.error("Gagal mengambil log laporan:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil log laporan",
    });
  }
});

// Tambah laporan baru dari ESP32 receiver / LoRa gateway
// Logika:
// - message_id baru => insert laporan baru
// - message_id sama => update laporan lama
// - status tidak diubah otomatis saat sinyal duplicate/update
// - victim_count selalu diperbarui sesuai input terbaru dari captive portal
app.post("/api/reports", (req, res) => {
  const {
    message_id,
    status,
    node_penerima,
    latitude,
    longitude,
    victim_count,
  } = req.body;

  if (
    !message_id ||
    !status ||
    !node_penerima ||
    latitude == null ||
    longitude == null
  ) {
    return res.status(400).json({
      success: false,
      message: "Data laporan belum lengkap",
    });
  }

  const { createdAt, waktu } = getCurrentTimestamp();

  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);
  const victimCountNumber = Number(victim_count || 1);

  if (Number.isNaN(latitudeNumber) || Number.isNaN(longitudeNumber)) {
    return res.status(400).json({
      success: false,
      message: "Latitude dan longitude harus berupa angka",
    });
  }

  if (Number.isNaN(victimCountNumber) || victimCountNumber < 1) {
    return res.status(400).json({
      success: false,
      message: "Jumlah korban harus berupa angka minimal 1",
    });
  }

  try {
    const existingReport = db
      .prepare("SELECT * FROM reports WHERE message_id = ? ORDER BY id DESC LIMIT 1")
      .get(message_id);

    if (existingReport) {
      db.prepare(`
        UPDATE reports
        SET 
          node_penerima = ?,
          latitude = ?,
          longitude = ?,
          victim_count = ?,
          last_seen = ?,
          duplicate_count = COALESCE(duplicate_count, 1) + 1
        WHERE message_id = ?
      `).run(
        node_penerima,
        latitudeNumber,
        longitudeNumber,
        victimCountNumber,
        createdAt,
        message_id
      );

      const updatedReport = db
        .prepare("SELECT * FROM reports WHERE message_id = ? ORDER BY id DESC LIMIT 1")
        .get(message_id);

      return res.json({
        success: true,
        duplicate: true,
        message: "Sinyal SOS sudah pernah diterima. Data laporan diperbarui tanpa membuat laporan baru.",
        report: updatedReport,
      });
    }

    const insert = db.prepare(`
      INSERT INTO reports 
      (
        message_id,
        waktu,
        status,
        node_penerima,
        latitude,
        longitude,
        victim_count,
        created_at,
        last_seen,
        duplicate_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      message_id,
      waktu,
      status,
      node_penerima,
      latitudeNumber,
      longitudeNumber,
      victimCountNumber,
      createdAt,
      createdAt,
      1
    );

    const newReport = db
      .prepare("SELECT * FROM reports WHERE id = ?")
      .get(result.lastInsertRowid);

    res.json({
      success: true,
      duplicate: false,
      message: "Laporan SOS baru berhasil disimpan",
      report: newReport,
    });
  } catch (error) {
    console.error("Gagal menyimpan laporan:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan laporan",
    });
  }
});

// Update status laporan berdasarkan message_id + simpan ke report_logs
app.patch("/api/reports/:message_id/status", (req, res) => {
  const { status } = req.body;
  const { message_id } = req.params;

  if (!status) {
    return res.status(400).json({
      success: false,
      message: "Status wajib diisi",
    });
  }

  try {
    const existingReport = db
      .prepare("SELECT * FROM reports WHERE message_id = ? ORDER BY id DESC LIMIT 1")
      .get(message_id);

    if (!existingReport) {
      return res.status(404).json({
        success: false,
        message: "Laporan tidak ditemukan",
      });
    }

    const result = db
      .prepare("UPDATE reports SET status = ? WHERE message_id = ?")
      .run(status, message_id);

    const { createdAt, waktu } = getCurrentTimestamp();
    const logMessage = getOperatorLogMessage(status);

    db.prepare(`
      INSERT INTO report_logs (
        message_id,
        waktu,
        message,
        source,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      message_id,
      waktu,
      logMessage,
      "SAR Mission Control",
      createdAt
    );

    const updatedReport = db
      .prepare("SELECT * FROM reports WHERE message_id = ? ORDER BY id DESC LIMIT 1")
      .get(message_id);

    res.json({
      success: true,
      message: "Status laporan berhasil diperbarui",
      changed: result.changes,
      report: updatedReport,
      log: {
        message_id,
        waktu,
        message: logMessage,
        source: "SAR Mission Control",
        created_at: createdAt,
      },
    });
  } catch (error) {
    console.error("Gagal memperbarui status laporan:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui status laporan",
    });
  }
});

// Hapus laporan berdasarkan message_id
app.delete("/api/reports/:message_id", (req, res) => {
  const { message_id } = req.params;

  try {
    const result = db
      .prepare("DELETE FROM reports WHERE message_id = ?")
      .run(message_id);

    db.prepare("DELETE FROM report_logs WHERE message_id = ?").run(message_id);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "Laporan tidak ditemukan",
      });
    }

    res.json({
      success: true,
      message: `Laporan ${message_id} berhasil dihapus`,
    });
  } catch (error) {
    console.error("Gagal menghapus laporan:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus laporan",
    });
  }
});

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

const userCount = db.prepare("SELECT COUNT(*) AS total FROM users").get();

if (userCount.total === 0) {
  db.prepare(`
    INSERT INTO users (username, password, name, role)
    VALUES (?, ?, ?, ?)
  `).run("admin", "admin123", "Admin User", "Koordinator Lapangan");
}

// Login user
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username dan password wajib diisi",
    });
  }

  try {
    const user = db
      .prepare("SELECT id, username, name, role FROM users WHERE username = ? AND password = ?")
      .get(username, password);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Username atau password salah",
      });
    }

    res.json({
      success: true,
      message: "Login berhasil",
      user,
    });
  } catch (error) {
    console.error("Gagal login:", error);
    res.status(500).json({
      success: false,
      message: "Gagal login",
    });
  }
});

// Register user baru
app.post("/api/register", (req, res) => {
  const { username, password, name, role } = req.body;

  if (!username || !password || !name || !role) {
    return res.status(400).json({
      success: false,
      message: "Semua field wajib diisi",
    });
  }

  try {
    const existingUser = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(username);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username sudah digunakan",
      });
    }

    db.prepare(`
      INSERT INTO users (username, password, name, role)
      VALUES (?, ?, ?, ?)
    `).run(username, password, name, role);

    res.json({
      success: true,
      message: "Akun berhasil dibuat",
    });
  } catch (error) {
    console.error("Gagal register:", error);
    res.status(500).json({
      success: false,
      message: "Gagal membuat akun",
    });
  }
});

// Ambil daftar user
app.get("/api/users", (req, res) => {
  try {
    const users = db
      .prepare("SELECT id, username, name, role FROM users ORDER BY id DESC")
      .all();

    res.json(users);
  } catch (error) {
    console.error("Gagal mengambil users:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil users",
    });
  }
});

// =======================
// HALAMAN INFORMASI API
// =======================
app.get("/api", (req, res) => {
  res.send(`
    <h1>LENTERA API Server</h1>
    <p>Server backend LENTERA sedang berjalan.</p>

    <h3>Endpoint yang tersedia:</h3>
    <ul>
      <li><a href="/api/reports">/api/reports</a> - Melihat data laporan SOS</li>
      <li><a href="/api/users">/api/users</a> - Melihat data akun admin/operator</li>
      <li>/api/login - Login user (POST)</li>
      <li>/api/register - Membuat akun baru (POST)</li>
      <li>/api/reports - Menambah laporan SOS baru dari ESP32 receiver (POST)</li>
      <li>/api/reports/:message_id/logs - Melihat log aktivitas laporan</li>
      <li>/api/reports/:message_id/status - Update status laporan (PATCH)</li>
      <li>/api/reports/:message_id - Menghapus laporan SOS (DELETE)</li>
    </ul>
  `);
});

// =======================
// SERVE FRONTEND DIST
// =======================
const distPath = path.join(__dirname, "dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send(`
      <h1>LENTERA API Server</h1>
      <p>Backend berjalan di: <b>http://localhost:${port}</b></p>
      <p>Frontend development berjalan di: <b>http://localhost:3000</b></p>
      <p>API reports: <a href="/api/reports">/api/reports</a></p>
      <p>Catatan: folder <b>dist</b> belum ada. Jalankan <code>npm run build</code> jika ingin membuka dashboard dari port backend.</p>
    `);
  });
}

// =======================
// START SERVER
// =======================
app.listen(port, "0.0.0.0", () => {
  console.log(`LENTERA database server running at http://localhost:${port}`);
});