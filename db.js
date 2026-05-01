import sqlite3 from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.join(__dirname, "website_data.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let db;
try {
  db = new sqlite3(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
} catch (err) {
  console.error("Failed to connect to SQLite DB:", err.message);
  process.exit(1);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS contact_enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    company_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    service_needed TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    source_path TEXT,
    ip_address TEXT,
    user_agent TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vacancy_enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    industry TEXT,
    number_of_vacancies TEXT,
    location TEXT,
    employment_type TEXT,
    phone TEXT,
    email TEXT NOT NULL,
    package_interest TEXT,
    message TEXT,
    status TEXT DEFAULT 'new',
    source_path TEXT,
    ip_address TEXT,
    user_agent TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const ensureColumn = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

[
  ["employment_type", "TEXT"],
  ["package_interest", "TEXT"],
  ["status", "TEXT DEFAULT 'new'"],
  ["source_path", "TEXT"],
  ["ip_address", "TEXT"],
  ["user_agent", "TEXT"]
].forEach(([column, definition]) => ensureColumn("vacancy_enquiries", column, definition));

[
  ["status", "TEXT DEFAULT 'new'"],
  ["source_path", "TEXT"],
  ["ip_address", "TEXT"],
  ["user_agent", "TEXT"]
].forEach(([column, definition]) => ensureColumn("contact_enquiries", column, definition));

export const dbOps = {
  saveContactEnquiry: (data) => {
    const { fullName, companyName, email, phone, serviceNeeded, message, sourcePath, ipAddress, userAgent } = data;
    return db.prepare(`
      INSERT INTO contact_enquiries
      (full_name, company_name, email, phone, service_needed, message, source_path, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fullName,
      companyName || null,
      email,
      phone || null,
      serviceNeeded || null,
      message,
      sourcePath || null,
      ipAddress || null,
      userAgent || null
    );
  },

  getContactEnquiries: () => {
    return db.prepare("SELECT * FROM contact_enquiries ORDER BY id DESC").all();
  },

  getRecentContactEnquiries: (limit = 50) => {
    return db.prepare("SELECT * FROM contact_enquiries ORDER BY id DESC LIMIT ?").all(limit);
  },

  saveVacancyEnquiry: (data) => {
    const {
      fullName,
      companyName,
      jobTitle,
      industry,
      numberOfVacancies,
      location,
      employmentType,
      phone,
      email,
      packageInterest,
      message,
      sourcePath,
      ipAddress,
      userAgent
    } = data;

    return db.prepare(`
      INSERT INTO vacancy_enquiries
      (full_name, company_name, job_title, industry, number_of_vacancies, location, employment_type, phone, email, package_interest, message, source_path, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fullName,
      companyName,
      jobTitle,
      industry || null,
      numberOfVacancies || null,
      location || null,
      employmentType || null,
      phone || null,
      email,
      packageInterest || null,
      message || null,
      sourcePath || null,
      ipAddress || null,
      userAgent || null
    );
  },

  getVacancyEnquiries: () => {
    return db.prepare("SELECT * FROM vacancy_enquiries ORDER BY id DESC").all();
  },

  getRecentVacancyEnquiries: (limit = 50) => {
    return db.prepare("SELECT * FROM vacancy_enquiries ORDER BY id DESC LIMIT ?").all(limit);
  },

  getSubmissionCounts: () => {
    const contactCount = db.prepare("SELECT COUNT(*) AS count FROM contact_enquiries").get().count;
    const vacancyCount = db.prepare("SELECT COUNT(*) AS count FROM vacancy_enquiries").get().count;
    return {
      contact: contactCount,
      vacancy: vacancyCount,
      total: contactCount + vacancyCount
    };
  }
};

export default db;
