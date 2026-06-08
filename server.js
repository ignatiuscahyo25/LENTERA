import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("lentera.db");

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
    created_at TEXT
  )
`).run();

// Tambahkan kolom created_at untuk database lama
try {
  db.prepare("ALTER TABLE reports ADD COLUMN created_at TEXT").run();
} catch (error) {
  // Kolom sudah ada
}

// Isi created_at untuk data lama yang masih kosong
db.prepare(`
  UPDATE reports
  SET created_at = COALESCE(created_at, datetime('now'))
  WHERE created_at IS NULL
`).run();

// Isi dummy data awal kalau tabel reports masih kosong
const count = db.prepare("SELECT COUNT(*) AS total FROM reports").get();

if (count.total === 0) {
  const insert = db.prepare(`
    INSERT INTO reports 
    (message_id, waktu, status, node_penerima, latitude, longitude, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const createdAt = now.toISOString();
  const waktu = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  insert.run("1234", waktu, "Baru", "NODE-02", -6.3634, 106.8285, createdAt);
  insert.run("1235", waktu, "Proses", "NODE-01", -6.3641, 106.8291, createdAt);
  insert.run("1230", waktu, "Selesai", "NODE-04", -6.3622, 106.8278, createdAt);
}

// Ambil semua laporan
app.get("/api/reports", (req, res) => {
  const reports = db.prepare("SELECT * FROM reports ORDER BY id DESC").all();
  res.json(reports);
});

// Ambil detail laporan berdasarkan id database
app.get("/api/reports/:id", (req, res) => {
  const report = db
    .prepare("SELECT * FROM reports WHERE id = ?")
    .get(req.params.id);

  if (!report) {
    return res.status(404).json({ message: "Laporan tidak ditemukan" });
  }

  res.json(report);
});

// Tambah laporan baru dari simulasi LoRa / Gateway
app.post("/api/reports", (req, res) => {
  const {
    message_id,
    status,
    node_penerima,
    latitude,
    longitude
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
      message: "Data laporan belum lengkap"
    });
  }

  const now = new Date();

  const createdAt = now.toISOString();

  const waktu = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const insert = db.prepare(`
    INSERT INTO reports 
    (message_id, waktu, status, node_penerima, latitude, longitude, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    message_id,
    waktu,
    status,
    node_penerima,
    latitude,
    longitude,
    createdAt
  );

  const newReport = db
    .prepare("SELECT * FROM reports WHERE id = ?")
    .get(result.lastInsertRowid);

  res.json({
    success: true,
    message: "Laporan SOS berhasil disimpan",
    report: newReport
  });
});

// Update status laporan berdasarkan message_id
app.patch("/api/reports/:message_id/status", (req, res) => {
  const { status } = req.body;
  const { message_id } = req.params;

  db.prepare("UPDATE reports SET status = ? WHERE message_id = ?")
    .run(status, message_id);

  const updatedReport = db
    .prepare("SELECT * FROM reports WHERE message_id = ?")
    .get(message_id);

  if (!updatedReport) {
    return res.status(404).json({ message: "Laporan tidak ditemukan" });
  }

  res.json(updatedReport);
});

// Hapus laporan berdasarkan message_id
app.delete("/api/reports/:message_id", (req, res) => {
  const { message_id } = req.params;

  const result = db
    .prepare("DELETE FROM reports WHERE message_id = ?")
    .run(message_id);

  if (result.changes === 0) {
    return res.status(404).json({
      success: false,
      message: "Laporan tidak ditemukan"
    });
  }

  res.json({
    success: true,
    message: `Laporan ${message_id} berhasil dihapus`
  });
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

  const user = db
    .prepare("SELECT id, username, name, role FROM users WHERE username = ? AND password = ?")
    .get(username, password);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Username atau password salah"
    });
  }

  res.json({
    success: true,
    message: "Login berhasil",
    user
  });
});

// Register user baru
app.post("/api/register", (req, res) => {
  const { username, password, name, role } = req.body;

  if (!username || !password || !name || !role) {
    return res.status(400).json({
      success: false,
      message: "Semua field wajib diisi"
    });
  }

  const existingUser = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "Username sudah digunakan"
    });
  }

  db.prepare(`
    INSERT INTO users (username, password, name, role)
    VALUES (?, ?, ?, ?)
  `).run(username, password, name, role);

  res.json({
    success: true,
    message: "Akun berhasil dibuat"
  });
});

// Ambil daftar user
app.get("/api/users", (req, res) => {
  const users = db
    .prepare("SELECT id, username, name, role FROM users ORDER BY id DESC")
    .all();

  res.json(users);
});

// Halaman utama backend
app.get("/api", (req, res) => {
  res.send(`
    <h1>LENTERA API Server</h1>
    <p>Server backend LENTERA sedang berjalan.</p>
    <ul>
      <li><a href="/api/reports">/api/reports</a></li>
      <li><a href="/api/users">/api/users</a></li>
    </ul>
  `);
});

app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`LENTERA database server running at http://localhost:${port}`);
});