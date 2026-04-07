import { db } from "../firebase";
import { ref, query, orderByKey, limitToLast, onValue } from "firebase/database";
import { sanitizeReading, sanitizePrediction } from "../utils/validation";
import { log, warn, error } from "../utils/logger";

const MS_30_MIN = 30 * 60 * 1000;
const NODE_URL = import.meta.env.VITE_NODE_URL || (import.meta.env.PROD ? "/api" : "http://localhost:3000");
const POLL_INTERVAL_MS = 1000;

export function subscribeReadings(onData, onErr) {
  try {
    if (!db) {
      warn("Firebase not configured; using Node API polling for readings");
      let stop = false;
      async function poll() {
        try {
          const headers = {};
          const tok = localStorage.getItem("jwt");
          if (tok) headers["Authorization"] = `Bearer ${tok}`;
          const resp = await fetch(`${NODE_URL}/readings?limit=1000`, { headers });
          const arr = await resp.json();
          const now = Date.now();
          const items = (arr || [])
            .map(sanitizeReading)
            .filter(Boolean)
            .filter(r => now - r.timestamp <= MS_30_MIN)
            .sort((a,b)=>a.timestamp-b.timestamp);
          onData(items);
        } catch (e) {
          onErr?.(e);
        } finally {
          if (!stop) setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
      poll();
      return () => { stop = true; };
    }
    const readingsRef = query(ref(db, "/readings"), orderByKey(), limitToLast(1000));
    const unsub = onValue(
      readingsRef,
      snap => {
        const data = snap.val();
        if (!data) {
          onData([]);
          return;
        }
        const now = Date.now();
        const items = Object.entries(data)
          .map(([key, value]) => {
            const obj = { ...value, timestamp: Number(key) };
            return sanitizeReading(obj);
          })
          .filter(Boolean)
          .filter(r => now - r.timestamp <= MS_30_MIN)
          .sort((a, b) => a.timestamp - b.timestamp);
        log("readings count", items.length);
        onData(items);
      },
      err => {
        warn("readings subscription error", err?.message);
        onErr?.(err);
      },
      { onlyOnce: false }
    );
    return unsub;
  } catch (e) {
    error("subscribeReadings failed", e?.message);
    onErr?.(e);
    return () => {};
  }
}

export function subscribeLatestPrediction(onData, onErr) {
  try {
    if (!db) {
      warn("Firebase not configured; using Node API polling for prediction");
      let stop = false;
      async function poll() {
        try {
          const headers = {};
          const tok = localStorage.getItem("jwt");
          if (tok) headers["Authorization"] = `Bearer ${tok}`;
          const resp = await fetch(`${NODE_URL}/prediction/latest`, { headers });
          const val = await resp.json();
          const pred = val ? sanitizePrediction(val) : null;
          onData(pred);
        } catch (e) {
          onErr?.(e);
        } finally {
          if (!stop) setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
      poll();
      return () => { stop = true; };
    }
    const latestRef = ref(db, "/predictions/latest");
    const unsub = onValue(
      latestRef,
      snap => {
        const val = snap.val();
        if (!val) {
          onData(null);
          return;
        }
        const pred = sanitizePrediction(val);
        onData(pred);
      },
      err => {
        warn("prediction subscription error", err?.message);
        onErr?.(err);
      },
      { onlyOnce: false }
    );
    return unsub;
  } catch (e) {
    error("subscribeLatestPrediction failed", e?.message);
    onErr?.(e);
    return () => {};
  }
}
