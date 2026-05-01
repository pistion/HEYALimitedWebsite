import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { dbOps } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.NODE_ENV === "production";

const parseTrustProxy = (value) => {
  if (typeof value === "undefined") {
    return isProduction || process.env.RENDER === "true" ? 1 : false;
  }

  if (value === "true") return 1;
  if (value === "false") return false;

  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : value;
};

app.disable("x-powered-by");
app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const csv = (value) => String(value || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const baseOrigins = new Set([
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.RENDER_EXTERNAL_URL
].filter(Boolean));

const configuredOrigins = () => new Set([...baseOrigins, ...csv(process.env.ALLOWED_ORIGINS)]);

const getRequestOrigin = (req) => {
  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : "";
};

const isAllowedOrigin = (req) => {
  const origin = req.get("origin");
  if (!origin) return true;
  if (origin === getRequestOrigin(req)) return true;
  if (configuredOrigins().has(origin)) return true;

  return !isProduction && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
};

app.use(cors((req, callback) => {
  callback(null, {
    origin: isAllowedOrigin(req),
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-admin-token"],
    optionsSuccessStatus: 204
  });
}));

app.use(bodyParser.json({ limit: "64kb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "64kb" }));

const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

const render = (res, view, data = {}) => {
  res.render(view, data);
};

app.get("/", (_req, res) => {
  render(res, "index", { active: "home", pageTitle: "CoreTalent PNG | HEYA Limited" });
});

app.get("/index", (_req, res) => {
  res.redirect(301, "/");
});

app.get("/about", (_req, res) => {
  render(res, "about", { active: "about", pageTitle: "About | CoreTalent PNG" });
});

app.get("/services", (_req, res) => {
  render(res, "services", { active: "services", pageTitle: "Services | CoreTalent PNG" });
});

app.get("/packages", (_req, res) => {
  render(res, "packages", { active: "packages", pageTitle: "Packages | CoreTalent PNG" });
});

app.get("/contact", (_req, res) => {
  render(res, "contact", { active: "contact", pageTitle: "Contact | CoreTalent PNG" });
});

app.get("/advertise", (_req, res) => {
  render(res, "advertise", { active: "advertise", pageTitle: "Advertise a Vacancy | CoreTalent PNG" });
});

app.get("/apply", (_req, res) => {
  res.redirect(301, "/advertise");
});

app.get("/portfolio", (_req, res) => {
  res.redirect(301, "/packages");
});

app.get(["/Research", "/research"], (_req, res) => {
  res.redirect(301, "/services");
});

app.get(["/Consultants", "/consultants"], (_req, res) => {
  res.redirect(301, "/about");
});

app.get("/AI-Coming_soonPage", (_req, res) => {
  res.redirect(301, "/");
});

app.get(/^\/(.+)\.html$/, (req, res) => {
  const cleanUrl = req.path.replace(/\.html$/, "");
  res.redirect(301, cleanUrl);
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
const cleanMultiline = (value) => String(value || "").replace(/\r\n/g, "\n").trim();
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const missing = (fields, body) => fields.filter((field) => !cleanText(body[field]));
const requestMeta = (req) => ({
  sourcePath: req.get("referer") || req.originalUrl,
  ipAddress: req.ip || req.socket?.remoteAddress || null,
  userAgent: req.get("user-agent") || null
});

const respondWithError = (res, status, error, fields = []) => {
  res.status(status).json({ ok: false, error, fields });
};

const adminToken = process.env.SUBMISSIONS_TOKEN || process.env.ADMIN_TOKEN || "";
const sessionCookieName = process.env.SESSION_COOKIE_NAME || "heya_admin_session";
const sessionMaxAgeSeconds = Number(process.env.SESSION_MAX_AGE_SECONDS || 28800);
const sessionMaxAgeMs = (Number.isFinite(sessionMaxAgeSeconds) && sessionMaxAgeSeconds > 0
  ? sessionMaxAgeSeconds
  : 28800) * 1000;
const sessionSecret = process.env.SESSION_SECRET || adminToken || (isProduction ? "" : "dev-coretalent-session-secret");

const parseCookies = (cookieHeader = "") => {
  return cookieHeader.split(";").reduce((cookies, cookie) => {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (!rawName || !rawValue.length) return cookies;

    try {
      cookies[rawName] = decodeURIComponent(rawValue.join("="));
    } catch {
      cookies[rawName] = rawValue.join("=");
    }

    return cookies;
  }, {});
};

const signValue = (value) => crypto
  .createHmac("sha256", sessionSecret)
  .update(value)
  .digest("base64url");

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const createAdminSession = () => {
  const payload = Buffer.from(JSON.stringify({
    scope: "submissions",
    exp: Date.now() + sessionMaxAgeMs
  })).toString("base64url");

  return `${payload}.${signValue(payload)}`;
};

const verifyAdminSession = (value) => {
  if (!sessionSecret || !value) return false;

  const [payload, signature] = String(value).split(".");
  if (!payload || !signature || !safeEqual(signValue(payload), signature)) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.scope === "submissions" && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
};

const hasValidAdminToken = (req) => {
  return Boolean(adminToken) && (req.query.token === adminToken || req.get("x-admin-token") === adminToken);
};

const hasValidAdminSession = (req) => {
  const cookies = parseCookies(req.get("cookie"));
  return verifyAdminSession(cookies[sessionCookieName]);
};

const setAdminSessionCookie = (res) => {
  if (!sessionSecret) return;

  res.cookie(sessionCookieName, createAdminSession(), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: sessionMaxAgeMs,
    path: "/"
  });
};

const canViewSubmissions = (req) => {
  return hasValidAdminSession(req) || (!adminToken && !isProduction);
};

const requireSubmissionsAccess = (req, res, next) => {
  if (canViewSubmissions(req)) {
    return next();
  }

  if (hasValidAdminToken(req)) {
    setAdminSessionCookie(res);
    if (req.query.token && !req.path.startsWith("/api/")) {
      return res.redirect(303, req.path);
    }

    return next();
  }

  return res.status(403).render("404", { active: "", pageTitle: "Page Not Found | CoreTalent PNG" });
};

const getSubmissionDashboardData = () => ({
  counts: dbOps.getSubmissionCounts(),
  contactEnquiries: dbOps.getRecentContactEnquiries(50),
  vacancyEnquiries: dbOps.getRecentVacancyEnquiries(50),
  tokenRequired: Boolean(adminToken)
});

app.post("/api/contact", (req, res) => {
  const required = ["fullName", "email", "phone", "serviceNeeded", "message"];
  const missingFields = missing(required, req.body);
  if (missingFields.length) {
    return respondWithError(res, 400, "Please complete all required fields.", missingFields);
  }

  const payload = {
    fullName: cleanText(req.body.fullName),
    companyName: cleanText(req.body.companyName),
    email: cleanText(req.body.email).toLowerCase(),
    phone: cleanText(req.body.phone),
    serviceNeeded: cleanText(req.body.serviceNeeded),
    message: cleanMultiline(req.body.message),
    ...requestMeta(req)
  };

  if (!isEmail(payload.email)) {
    return respondWithError(res, 400, "Please enter a valid email address.", ["email"]);
  }

  try {
    const result = dbOps.saveContactEnquiry(payload);
    res.status(201).json({
      ok: true,
      id: Number(result.lastInsertRowid),
      message: "Thank you. Your enquiry has been received."
    });
  } catch (err) {
    console.error("Contact DB error:", err);
    respondWithError(res, 500, "Failed to save enquiry.");
  }
});

app.post(["/api/advertise", "/api/apply"], (req, res) => {
  const required = ["fullName", "companyName", "jobTitle", "industry", "location", "phone", "email"];
  const missingFields = missing(required, req.body);
  if (missingFields.length) {
    return respondWithError(res, 400, "Please complete all required fields.", missingFields);
  }

  const payload = {
    fullName: cleanText(req.body.fullName),
    companyName: cleanText(req.body.companyName),
    jobTitle: cleanText(req.body.jobTitle),
    industry: cleanText(req.body.industry),
    numberOfVacancies: cleanText(req.body.numberOfVacancies),
    location: cleanText(req.body.location),
    employmentType: cleanText(req.body.employmentType),
    phone: cleanText(req.body.phone),
    email: cleanText(req.body.email).toLowerCase(),
    packageInterest: cleanText(req.body.packageInterest),
    message: cleanMultiline(req.body.message),
    ...requestMeta(req)
  };

  if (!isEmail(payload.email)) {
    return respondWithError(res, 400, "Please enter a valid email address.", ["email"]);
  }

  try {
    const result = dbOps.saveVacancyEnquiry(payload);
    res.status(201).json({
      ok: true,
      id: Number(result.lastInsertRowid),
      message: "Your vacancy enquiry has been submitted."
    });
  } catch (err) {
    console.error("Vacancy enquiry DB error:", err);
    respondWithError(res, 500, "Failed to save vacancy enquiry.");
  }
});

app.get(["/submissions", "/admin/submissions"], requireSubmissionsAccess, (_req, res) => {
  render(res, "submissions", {
    active: "",
    bodyId: "page-submissions",
    pageTitle: "Submissions | CoreTalent PNG",
    pageDescription: "Private CoreTalent PNG contact and vacancy submissions dashboard.",
    ...getSubmissionDashboardData()
  });
});

app.get("/api/submissions", requireSubmissionsAccess, (_req, res) => {
  res.json({ ok: true, ...getSubmissionDashboardData() });
});

if (!isProduction) {
  app.get("/api/messages", (_req, res) => {
    res.json(dbOps.getContactEnquiries());
  });

  app.get("/api/vacancy-enquiries", (_req, res) => {
    res.json(dbOps.getVacancyEnquiries());
  });
}

app.use((_req, res) => {
  res.status(404).render("404", { active: "", pageTitle: "Page Not Found | CoreTalent PNG" });
});

const parsePort = (value, fallback) => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
};

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parsePort(process.env.PORT, process.env.RENDER === "true" ? 10000 : 8787);

app.listen(PORT, HOST, () => {
  console.log(`CoreTalent PNG website running on ${HOST}:${PORT}`);
});
