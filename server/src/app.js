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

/* ===============================
   SECURITY
================================ */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

/* ===============================
   CORS CONFIG (FIXED)
================================ */

// IMPORTANT:
// In Render set:
// ALLOWED_ORIGINS=https://your-frontend-domain.com
// OR
// ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow non-browser requests (like curl / Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ✅ HANDLE PREFLIGHT (THIS FIXES YOUR 404)
app.options("*", cors());

/* ===============================
   BODY PARSER
================================ */
app.use(express.json({ limit: "5mb" }));

/* ===============================
   RATE LIMIT
================================ */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many login attempts, please try again later." },
});

/* ===============================
   HEALTH CHECK
================================ */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/* ===============================
   PUBLIC ENDPOINTS
================================ */
app.get("/api/public/clients", async (_req, res) => {
  try {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/public/sites", async (req, res) => {
  try {
    const { client_id } = req.query;

    let query = supabase.from("sites").select("id, name, client_id");

    if (client_id) query = query.eq("client_id", client_id);

    const { data } = await query.order("name");

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/public/holidays", async (_req, res) => {
  try {
    const { data } = await supabase
      .from("holidays")
      .select("id, date, name")
      .order("date");

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/api/public/config", async (_req, res) => {
  try {
    const { data } = await supabase
      .from("config")
      .select("key, value, description");

    const config = {};
    (data || []).forEach((r) => {
      config[r.key] = {
        value: r.value,
        description: r.description,
      };
    });

    res.json(config);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

/* ===============================
   ROUTES
================================ */
app.use("/api/auth", loginLimiter, authRoutes);
app.use("/api/labour", labourRoutes);
app.use("/api/admin", adminRoutes);

/* ===============================
   GLOBAL ERROR HANDLER
================================ */
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
