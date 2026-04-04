import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock APIs
  app.get("/api/weather", (req, res) => {
    // Random weather simulation
    const rainfall = Math.random() * 20; // 0 to 20mm
    res.json({ rainfall, unit: "mm", status: rainfall > 10 ? "Heavy Rain" : "Clear" });
  });

  app.get("/api/aqi", (req, res) => {
    const aqi = Math.floor(Math.random() * 300); // 0 to 300
    res.json({ aqi, status: aqi > 150 ? "Unhealthy" : "Good" });
  });

  app.get("/api/traffic", (req, res) => {
    const congestion = Math.floor(Math.random() * 100); // 0 to 100%
    res.json({ congestion, status: congestion > 70 ? "High" : "Low" });
  });

  // Trigger Engine Simulation
  app.post("/api/simulate-disruption", (req, res) => {
    const { type } = req.body;
    // In a real app, this would trigger a background worker
    // For the demo, we'll return the trigger details
    const triggers = {
      rain: { rainfall: 15, threshold: 10, message: "Heavy Rainfall Triggered" },
      aqi: { aqi: 210, threshold: 150, message: "Hazardous AQI Triggered" },
      traffic: { congestion: 85, threshold: 70, message: "Severe Traffic Triggered" },
      curfew: { active: true, message: "Manual Curfew Triggered" }
    };
    
    const trigger = triggers[type as keyof typeof triggers] || triggers.rain;
    res.json({ success: true, trigger });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PayFlux Server running on http://localhost:${PORT}`);
  });
}

startServer();
