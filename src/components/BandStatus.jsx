import React, { useMemo } from "react";

function Row({ label, value, unit, color }) {
  return (
    <div className="flex justify-between py-1">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded ${color}`} />
        <div className="text-sm text-gray-700">{label}</div>
      </div>
      <div className="text-sm font-medium">{value !== null && value !== undefined ? `${value}${unit || ""}` : "N/A"}</div>
    </div>
  );
}

export default function BandStatus({ latestReading }) {
  const rows = useMemo(() => {
    if (!latestReading) return [];
    return [
      { label: "L-band", value: latestReading.l_dbm, unit: " dBm", color: "bg-lband" },
      { label: "S-band", value: latestReading.s_dbm, unit: " dBm", color: "bg-sband" },
      { label: "C-band", value: latestReading.c_dbm, unit: " dBm", color: "bg-cband" },
      { label: "X-band", value: latestReading.x_dbm, unit: " dBm", color: "bg-xband" },
      { label: "Elevation", value: latestReading.elevation_deg, unit: "°", color: "bg-gray-300" },
      { label: "Lean Position", value: latestReading.lean_deg, unit: "°", color: "bg-green-300" },
      { label: "Temperature", value: latestReading.temperature, unit: "°C", color: "bg-gray-300" },
      { label: "Humidity", value: latestReading.humidity, unit: "%", color: "bg-gray-300" },
      { label: "Weather", value: latestReading.weather, unit: "", color: "bg-gray-300" }
    ];
  }, [latestReading]);

  const locationName = useMemo(() => {
    if (!latestReading || !latestReading.location) return "Unknown";
    return latestReading.location.name || `${latestReading.location.lat.toFixed(2)}, ${latestReading.location.lon.toFixed(2)}`;
  }, [latestReading]);

  return (
    <div className="w-full bg-white rounded-lg shadow p-4">
      <div className="text-lg font-semibold mb-2">Sensor Snapshot</div>
      <div className="text-sm text-gray-500 mb-2">Over: {locationName}</div>
      {rows.length ? rows.map((r, i) => (
        <Row key={i} label={r.label} value={r.value} unit={r.unit} color={r.color} />
      )) : <div className="text-gray-600">Waiting for readings...</div>}
    </div>
  );
}
