const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { supabase } = require("../db");
const { JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { message: "Too many attempts, try again later." } });

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) return res.status(400).json({ message: "Username and PIN required" });
    if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ message: "PIN must be 4 digits" });

    const { data: user, error } = await supabase
      .from("users").select("*").eq("username", username).eq("status", "active").single();
    if (error || !user) return res.status(401).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(String(pin), user.pin);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: "24h" });

    return res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role, designation: user.designation || null },
    });
  } catch (err) { console.error("Login error:", err); return res.status(500).json({ message: "Internal server error" }); }
});

module.exports = router;