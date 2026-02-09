const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");

dotenv.config();

const authRoutes = require("./routes/auth");
const labourRoutes = require("./routes/labour");
const adminRoutes = require("./routes/admin");
const { supabase } = require("./db");

const app = express();

// Security headers (relaxed CSP for API-only server)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// CORS — set ALLOWED_ORIGINS env var to your frontend URL(s), comma-separated
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
app.use(cors({
  origin: function (origin, cb) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
  exposedHeaders: ["Content-Disposition"],
}));

app.use(express.json({ limit: "5mb" }));

// Rate limit on login to prevent brute-force
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { message: "Too many login attempts, please try again later." } });

// Health check
app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// PUBLIC ENDPOINTS (no auth — used for labour check-in dropdowns)
app.get("/api/public/clients", async (_req, res) => {
  try { const { data } = await supabase.from("clients").select("id, name").order("name"); res.json(data || []); }
  catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

app.get("/api/public/sites", async (req, res) => {
  try {
    const { client_id } = req.query;
    let query = supabase.from("sites").select("id, name, client_id");
    if (client_id) query = query.eq("client_id", client_id);
    const { data } = await query.order("name");
    res.json(data || []);
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

app.get("/api/public/holidays", async (_req, res) => {
  try { const { data } = await supabase.from("holidays").select("id, date, name").order("date"); res.json(data || []); }
  catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

app.get("/api/public/config", async (_req, res) => {
  try {
    const { data } = await supabase.from("config").select("key, value, description");
    const config = {}; (data || []).forEach(r => { config[r.key] = { value: r.value, description: r.description }; });
    res.json(config);
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

// Auth (with rate limiting on login)
app.use("/api/auth", loginLimiter, authRoutes);
app.use("/api/labour", labourRoutes);
app.use("/api/admin", adminRoutes);

// Global error handler
app.use((err, _req, res, _next) => { console.error("Unhandled:", err); res.status(500).json({ message: "Internal server error" }); });

module.exports = app;