import axios from "axios";

const NODE = process.env.NODE_URL || "http://localhost:3000";
const TOKEN = process.env.ARDUINO_JWT || process.env.ARDUINO_TOKEN || "dev-token";
const CONTINUOUS = String(process.env.SEED_CONTINUOUS || "").toLowerCase() === "true" || process.env.SEED_CONTINUOUS === "1";

function weatherFor(i) {
  return ["Clear","Cloudy","Light Rain","Heavy Rain"][Math.floor(i/10)%4];
}

function simulate(ts, elev, weather, location) {
  const base = {
    "Clear": [0,0,0,0],
    "Cloudy": [5,5,7,10],
    "Light Rain": [10,12,18,25],
    "Heavy Rain": [15,20,30,40]
  }[weather];
  const rnd = (a)=> a + (Math.random()*2-1.0)*3;
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
    // Fetch location
    const response = await axios.get("http://api.open-notify.org/iss-now.json");
    const lat = parseFloat(response.data.iss_position.latitude);
    const lon = parseFloat(response.data.iss_position.longitude);

    // Fetch locality
    const geoResponse = await axios.get(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    const locality = geoResponse.data.locality || geoResponse.data.principalSubdivision || "Unknown";

    return { lat, lon, name: locality };
  } catch (error) {
    console.error("Failed to fetch ISS location:", error.message);
    return { lat: 12.97, lon: 77.59, name: "Bangalore" }; // Fallback location
  }
}

async function main() {
  const count = Number(process.env.SEED_COUNT || 300);
  if (CONTINUOUS) {
    let i = 0;
    console.log("continuous seeding with live ISS location enabled");
    while (true) {
      const ts = Date.now();
      const elev = Math.max(5, Math.min(85, 10 + 70*Math.sin(i/30.0)));
      const w = weatherFor(i);
      const location = await getIssLocation();
      const payload = simulate(ts, elev, w, { lat: location.lat, lon: location.lon, name: location.name });
      try {
        const r = await axios.post(`${NODE}/ingest`, payload, { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 2000 });
        if (i % 10 === 0) console.log(`seed ${i}: ISS over ${location.name} (${location.lat.toFixed(2)}, ${location.lon.toFixed(2)})`);
      } catch (e) {
        console.error("seed error", e.message);
      }
      i++;
      await new Promise(res=>setTimeout(res, 2000));
    }
  } else {
    for (let i=0;i<count;i++){
      const ts = Date.now() + i*2000;
      const elev = Math.max(5, Math.min(85, 10 + 70*Math.sin(i/30.0)));
      const w = weatherFor(i);
      const location = await getIssLocation();
      const payload = simulate(ts, elev, w, location);
      try {
        const r = await axios.post(`${NODE}/ingest`, payload, { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 2000 });
        if (i % 20 === 0) console.log("seed", i, r.status);
        await new Promise(res=>setTimeout(res, 50));
      } catch (e) {
        console.error("seed error", e.message);
      }
    }
    console.log("seeding done");
  }
}

main();
