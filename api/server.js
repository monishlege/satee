import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import pino from "pino";
import { z } from "zod";
import cors from "cors";
import admin from "firebase-admin";
import fs from "fs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

dotenv.config();
const log = pino({ level: process.env.LOG_LEVEL || "info" });

const {
  PORT = 3000,
  ARDUINO_TOKEN = "dev-token",
  FASTAPI_URL,
  FIREBASE_DB_URL,
  FIREBASE_SERVICE_ACCOUNT_PATH,
  JWT_SECRET,
  JWT_ISSUER,
  ADMIN_KEY
} = process.env;

const defaultUsers = [
  // For demo: replace with secure store or Firebase Auth integration
  { username: "admin", passwordHash: bcrypt.hashSync("admin123", 10), role: "user" }
];
let users = defaultUsers;
try {
  if (process.env.USERS_JSON) {
    const parsed = JSON.parse(process.env.USERS_JSON);
    if (Array.isArray(parsed)) users = parsed;
  }
} catch (e) {
  // keep default
}

const readingSchema = z.object({
  timestamp: z.number().positive(),
  l_dbm: z.number().nullable().optional(),
  s_dbm: z.number().nullable().optional(),
  c_dbm: z.number().nullable().optional(),
  x_dbm: z.number().nullable().optional(),
  temperature: z.number().nullable().optional(),
  humidity: z.number().nullable().optional(),
  elevation_deg: z.number().nullable().optional(),
  lean_deg: z.number().nullable().optional(),
  weather: z.string().max(64).optional(),
  location: z.object({ lat: z.number(), lon: z.number(), name: z.string().max(256).optional() }).optional(),
});

const app = express();
app.use(cors()); // Allow all for simplicity on Vercel, or configure specifically
app.use(express.json({ limit: "256kb" }));

const memReadings = new Map();
let latestPrediction = null;
let currentLeanDeg = 0;

let firebaseReady = false;
try {
  if (FIREBASE_DB_URL && (FIREBASE_SERVICE_ACCOUNT_PATH || process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
      serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, "utf-8"));
    }
    
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: FIREBASE_DB_URL
      });
      firebaseReady = true;
      log.info("Firebase Admin initialized");
    }
  } else {
    log.info("Firebase not configured; using in-memory dev store (not persistent on Vercel)");
  }
} catch (e) {
  log.warn({ err: e?.message }, "Firebase init failed; continuing without Firebase");
}
const fdb = firebaseReady ? admin.database() : null;

function auth(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = auth.slice(7);
  if (ARDUINO_TOKEN && token === ARDUINO_TOKEN) {
    return next();
  }
  if (!JWT_SECRET) return res.status(401).json({ error: "Unauthorized" });
  try {
    const opts = JWT_ISSUER ? { issuer: JWT_ISSUER } : {};
    const decoded = jwt.verify(token, JWT_SECRET, opts);
    if (decoded && (decoded.role === "device" || decoded.scope === "device")) {
      req.device = decoded.sub || decoded.device_id || null;
      return next();
    }
    return res.status(403).json({ error: "Forbidden" });
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function weatherImpact(w) {
  const m = { "Clear":0, "Cloudy":5, "Light Rain":15, "Heavy Rain":30 };
  return m[w] ?? 0;
}

function rulePredict(r) {
  const wimp = weatherImpact(r.weather);
  const l = (r.l_dbm ?? -120) - wimp;
  const s = (r.s_dbm ?? -120) - wimp;
  const c = (r.c_dbm ?? -120) - wimp;
  const x = (r.x_dbm ?? -120) - wimp;
  const pairs = [ ["L", l], ["S", s], ["C", c], ["X", x] ];
  const best = pairs.reduce((a,b) => (b[1] > a[1] ? b : a));
  return {
    best_band: best[0],
    confidence: 0.5,
    reasoning: `Rule-based selection, max adjusted: ${best[0]} (${best[1].toFixed(1)} dBm)`,
    timestamp: Math.floor(r.timestamp),
    model_version: "rule-v1",
    latency_ms: 1.0
  };
}

app.post("/ingest", auth, async (req, res) => {
  const parse = readingSchema.safeParse(req.body);
  if (!parse.success) {
    log.warn({ err: parse.error }, "Invalid payload");
    return res.status(400).json({ error: "Invalid payload", details: parse.error.flatten() });
  }
  const result = await processIngestion(parse.data);
  res.json({ ok: true, ...result });
});

app.post("/auth/issue", (req, res) => {
  const key = req.headers["x-admin-key"];
  if (!ADMIN_KEY || key !== ADMIN_KEY) return res.status(403).json({ error: "Forbidden" });
  const device_id = req.body?.device_id;
  if (!device_id) return res.status(400).json({ error: "device_id required" });
  if (!JWT_SECRET) return res.status(500).json({ error: "JWT not configured" });
  const signOpts = { expiresIn: "30d" };
  if (JWT_ISSUER && typeof JWT_ISSUER === "string") signOpts.issuer = JWT_ISSUER;
  const token = jwt.sign({ sub: device_id, role: "device" }, JWT_SECRET, signOpts);
  res.json({ token });
});

app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: "invalid credentials" });
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid credentials" });
  if (!JWT_SECRET) return res.status(500).json({ error: "JWT not configured" });
  const signOpts2 = { expiresIn: "7d" };
  if (JWT_ISSUER && typeof JWT_ISSUER === "string") signOpts2.issuer = JWT_ISSUER;
  const token = jwt.sign({ sub: username, role: user.role || "user" }, JWT_SECRET, signOpts2);
  res.json({ token, user: { username, role: user.role || "user" } });
});

app.get("/auth/me", (req, res) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET, JWT_ISSUER ? { issuer: JWT_ISSUER } : {});
    res.json({ sub: decoded.sub, role: decoded.role });
  } catch (e) {
    res.status(401).json({ error: "Unauthorized" });
  }
});
app.get("/readings", (req, res) => {
  const limit = Number(req.query.limit || 1000);
  const now = Date.now();
  const arr = [...memReadings.entries()]
    .map(([k,v])=>({ ...v, timestamp: k }))
    .filter(r => now - r.timestamp <= 30*60*1000)
    .sort((a,b)=>a.timestamp-b.timestamp)
    .slice(-limit);
  res.json(arr);
});

app.get("/prediction/latest", (req, res) => {
  res.json(latestPrediction || null);
});

app.get("/control/lean", (req, res) => {
  res.json({ lean_deg: currentLeanDeg });
});

app.post("/control/lean", (req, res) => {
  const { lean_deg } = req.body || {};
  if (typeof lean_deg !== "number") return res.status(400).json({ error: "lean_deg must be a number" });
  currentLeanDeg = lean_deg;
  res.json({ ok: true, lean_deg: currentLeanDeg });
});

app.get("/health", (req, res) => res.json({ ok: true }));

// Demo Seeding Helpers
function weatherFor(i) {
  return ["Clear", "Cloudy", "Light Rain", "Heavy Rain"][Math.floor(i / 10) % 4];
}
function simulateReading(ts, elev, weather, location) {
  const base = {
    "Clear": [0, 0, 0, 0],
    "Cloudy": [5, 5, 7, 10],
    "Light Rain": [10, 12, 18, 25],
    "Heavy Rain": [15, 20, 30, 40]
  }[weather];
  const rnd = (a) => a + (Math.random() * 2 - 1.0) * 3;
  return {
    timestamp: ts,
    l_dbm: rnd(-70 - base[0]),
    s_dbm: rnd(-65 - base[1]),
    c_dbm: rnd(-55 - base[2]),
    x_dbm: rnd(-45 - base[3]),
    temperature: rnd(25),
    humidity: rnd(60),
    elevation_deg: elev,
    weather,
    location
  };
}
async function getIssLocation() {
  try {
    const response = await axios.get("http://api.open-notify.org/iss-now.json", { timeout: 3000 });
    const lat = parseFloat(response.data.iss_position.latitude);
    const lon = parseFloat(response.data.iss_position.longitude);
    try {
      const geoResponse = await axios.get(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { timeout: 3000 });
      const locality = geoResponse.data.locality || geoResponse.data.principalSubdivision || "Unknown";
      return { lat, lon, name: locality };
    } catch (e) {
      return { lat, lon, name: "Unknown Area" };
    }
  } catch (e) {
    return { lat: 12.97, lon: 77.59, name: "Bangalore" };
  }
}

app.get("/demo/tick", async (req, res) => {
  try {
    const i = Math.floor(Date.now() / 1000) % 1000;
    const ts = Date.now();
    const elev = Math.max(5, Math.min(85, 10 + 70 * Math.sin(i / 30.0)));
    const w = weatherFor(i);
    const location = await getIssLocation();
    const payload = simulateReading(ts, elev, w, location);

    // Reuse internal ingestion logic
    // We can't easily call app.post("/ingest") internally with full middleware support easily,
    // so we replicate the core ingestion logic or refactor it.
    // Let's refactor the ingestion logic into a function.
    const result = await processIngestion(payload);
    res.json({ ok: true, ...result });
  } catch (e) {
    log.error({ err: e.message }, "Demo tick failed");
    res.status(500).json({ error: e.message });
  }
});

async function processIngestion(r) {
  const key = Math.floor(r.timestamp);
  log.info({ key, location: r.location?.name }, "Ingested reading");
  if (r.lean_deg === null || r.lean_deg === undefined) {
    r.lean_deg = currentLeanDeg;
  }
  memReadings.set(key, r);
  if (memReadings.size > 2000) {
    const oldest = [...memReadings.keys()].sort((a, b) => a - b)[0];
    memReadings.delete(oldest);
  }
  if (fdb) {
    try { await fdb.ref(`/readings/${key}`).set(r); } catch (e) { log.warn(e.message); }
  }

  let pred;
  try {
    const predictUrl = FASTAPI_URL || "/api/predict";
    // Internal predict call logic
    // On Vercel, we can try to call the predict.py directly if we knew how, 
    // but easiest is to call the absolute URL or use the rule-based fallback.
    // For the demo tick, we'll use rulePredict if FASTAPI_URL isn't fully qualified.
    if (predictUrl && predictUrl.startsWith("http")) {
      const resp = await axios.post(`${predictUrl}/predict`, r, { timeout: 2000 });
      pred = resp.data;
    } else {
      pred = rulePredict(r);
    }
  } catch (e) {
    pred = rulePredict(r);
  }
  latestPrediction = pred;
  if (fdb) {
    try {
      await fdb.ref(`/predictions/latest`).set(pred);
      await fdb.ref(`/predictions/${pred.timestamp || key}`).set(pred);
    } catch (e) { log.warn(e.message); }
  }
  return { key, pred };
}

if (process.env.NODE_ENV !== "production") {
  app.listen(Number(PORT), () => {
    log.info({ port: PORT }, "Dev Node API listening");
  });
}

export default app;
