export function toNumber(v, def = null) {
  if (v === null || v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function isValidBand(band) {
  return ["L", "S", "C", "X"].includes(band);
}

export function sanitizeReading(raw) {
  const ts = toNumber(raw.timestamp, null);
  const l = toNumber(raw.l_dbm, null);
  const s = toNumber(raw.s_dbm, null);
  const c = toNumber(raw.c_dbm, null);
  const x = toNumber(raw.x_dbm, null);
  const temp = toNumber(raw.temperature, null);
  const hum = toNumber(raw.humidity, null);
  const elev = toNumber(raw.elevation_deg, null);
  const lean = toNumber(raw.lean_deg, null);
  const weather = typeof raw.weather === "string" ? raw.weather : "Unknown";
  const lat = toNumber(raw?.location?.lat, null);
  const lon = toNumber(raw?.location?.lon, null);
  if (ts === null) return null;
  return {
    timestamp: ts,
    l_dbm: l,
    s_dbm: s,
    c_dbm: c,
    x_dbm: x,
    temperature: temp,
    humidity: hum,
    elevation_deg: elev,
    lean_deg: lean,
    weather,
    location: lat !== null && lon !== null ? { lat, lon } : null
  };
}

export function sanitizePrediction(raw) {
  const band = typeof raw.best_band === "string" ? raw.best_band : null;
  const confidence = toNumber(raw.confidence, null);
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning : "";
  const ts = toNumber(raw.timestamp, null);
  const ver = typeof raw.model_version === "string" ? raw.model_version : "unknown";
  if (!band || !isValidBand(band)) return null;
  return { best_band: band, confidence, reasoning, timestamp: ts, model_version: ver };
}
