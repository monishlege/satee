import os
import time
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from joblib import load
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("predict")

MODEL_PATH = os.getenv("MODEL_PATH", "model.joblib")
model_bundle = None

class Location(BaseModel):
  lat: float
  lon: float

class Reading(BaseModel):
  timestamp: float
  l_dbm: float | None = None
  s_dbm: float | None = None
  c_dbm: float | None = None
  x_dbm: float | None = None
  temperature: float | None = None
  humidity: float | None = None
  elevation_deg: float | None = None
  lean_deg: float | None = None
  weather: str | None = None
  location: Location | None = None

def weather_impact(w: str | None) -> float:
  mapping = {"Clear":0, "Cloudy":5, "Light Rain":15, "Heavy Rain":30}
  return mapping.get((w or "Clear"), 0)

def load_model():
  global model_bundle
  try:
    model_bundle = load(MODEL_PATH)
    log.info("Model loaded")
  except Exception as e:
    log.warning(f"Model not loaded: {e}")
    model_bundle = None

app = FastAPI()

@app.on_event("startup")
def startup():
  load_model()

@app.get("/health")
def health():
  return {"ok": True, "model": bool(model_bundle)}

@app.post("/predict")
def predict(reading: Reading):
  wimp = weather_impact(reading.weather)
  features = {
    "l_dbm": reading.l_dbm,
    "s_dbm": reading.s_dbm,
    "c_dbm": reading.c_dbm,
    "x_dbm": reading.x_dbm,
    "temperature": reading.temperature,
    "humidity": reading.humidity,
    "elevation_deg": reading.elevation_deg,
    "weather_impact_db": wimp,
    "l_adj": (reading.l_dbm or -120) - wimp,
    "s_adj": (reading.s_dbm or -120) - wimp,
    "c_adj": (reading.c_dbm or -120) - wimp,
    "x_adj": (reading.x_dbm or -120) - wimp,
  }
  t0 = time.time()
  try:
    if model_bundle:
      clf = model_bundle["model"]
      feats = model_bundle["features"]
      X = np.array([[features[f] if features[f] is not None else -120 for f in feats]])
      pred = clf.predict(X)[0]
      proba = clf.predict_proba(X)[0]
      conf = float(np.max(proba))
      reason = f"Model selected {pred} with confidence {conf:.2f}."
      ver = "rf-v1"
    else:
      pairs = [("L", features["l_adj"]), ("S", features["s_adj"]), ("C", features["c_adj"]), ("X", features["x_adj"])]
      pred, val = max(pairs, key=lambda p: p[1])
      conf = 0.5
      reason = f"Rule-based selection: {pred}-band chosen. Weather is {reading.weather or 'Clear'} (impact: -{wimp} dB). Max adjusted signal: {val:.1f} dBm."
      ver = "rule-v1"
    latency_ms = (time.time() - t0) * 1000.0
    return {
      "best_band": pred,
      "confidence": conf,
      "reasoning": reason,
      "timestamp": int(reading.timestamp),
      "model_version": ver,
      "latency_ms": latency_ms
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Prediction error: {e}")
