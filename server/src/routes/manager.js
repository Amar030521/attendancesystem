const express = require("express");
const { authMiddleware, requireRole } = require("../middleware/auth");
const { supabase } = require("../db");
const { calculatePayment } = require("../utils/calculatePayment");
const { uaeNow, uaeToday, uaeYesterday } = require("../utils/uaeTime");
const {
  generateDailyExcelReport, generateDailyPdfReport, generateMonthlyExcelReport,
  generateLabourExcelReport, generateClientExcelReport, generateSiteExcelReport,
  generatePayrollExcelReport, generateFilteredDailyExcelReport,
} = require("../services/reportService");

const router = express.Router();
router.use(authMiddleware, requireRole("manager"));

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextMonthStart(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ===== READ-ONLY LOOKUPS =====
router.get("/clients", async (req, res) => {
  const { data } = await supabase.from("clients").select("*").order("name");
  res.json(data || []);
});
router.get("/sites", async (req, res) => {
  const { data } = await supabase.from("sites").select("*, clients(name)").order("name");
  res.json((data || []).map(s => ({ ...s, client_name: s.clients?.name, clients: undefined })));
});
router.get("/labours", async (req, res) => {
  const { data } = await supabase.from("users").select("id, name, daily_wage, designation, status").eq("role", "labour").order("id");
  res.json(data || []);
});

// ===== ATTENDANCE (view + edit) =====
router.get("/attendance", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date required" });
    const { data } = await supabase.from("attendance")
      .select("*, users(name, designation), clients(name), sites(name)")
      .eq("date", date).order("labour_id");
    const rows = (data || []).map(a => ({
      ...a, labour_name: a.users?.name, labour_designation: a.users?.designation,
      client_name: a.clients?.name, site_name: a.sites?.name,
      users: undefined, clients: undefined, sites: undefined,
    }));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.put("/attendance/:id", async (req, res) => {
  try {
    const { client_id, site_id, start_time, end_time } = req.body;
    const { data: existing } = await supabase.from("attendance").select("*").eq("id", req.params.id).single();
    if (!existing) return res.status(404).json({ message: "Not found" });

    const { data: labour } = await supabase.from("users").select("daily_wage, designation").eq("id", existing.labour_id).single();
    const { data: cfgRows } = await supabase.from("config").select("key, value");
    const config = {}; (cfgRows || []).forEach(r => { config[r.key] = r.value; });
    const { data: holidays } = await supabase.from("holidays").select("date");
    const holidayList = (holidays || []).map(h => h.date);
    const st = start_time || existing.start_time;
    const et = end_time || existing.end_time;
    const pay = calculatePayment(labour?.daily_wage || 0, st, et, existing.date, holidayList, config, labour?.designation || "");

    const { data, error } = await supabase.from("attendance").update({
      client_id: client_id || existing.client_id, site_id: site_id || existing.site_id,
      start_time: st, end_time: et, ...pay,
    }).eq("id", req.params.id).select("*, users(name), clients(name), sites(name)").single();

    if (error) throw error;
    res.json({ ...data, labour_name: data.users?.name, client_name: data.clients?.name, site_name: data.sites?.name });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

// ===== PRESENT / ABSENT =====
router.get("/present-absent", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date required" });
    const today = uaeToday();
    const yesterday = uaeYesterday();
    const { data: labours } = await supabase.from("users").select("id, name, phone, daily_wage, designation").eq("role", "labour").eq("status", "active").order("id");
    const { data: attendance } = await supabase.from("attendance").select("id, labour_id, start_time, end_time, hours_worked, total_pay, regular_pay, ot_pay, admin_verified, clients(name), sites(name)").eq("date", date);
    const attMap = {}; (attendance || []).forEach(a => { attMap[a.labour_id] = { ...a, client_name: a.clients?.name, site_name: a.sites?.name, clients: undefined, sites: undefined }; });
    const uae = uaeNow();
    const pastCutoff = uae.hours > 16 || (uae.hours === 16 && uae.minutes >= 30);
    const autoAbsent = date === yesterday && pastCutoff;
    const result = (labours || []).map(l => {
      const att = attMap[l.id]; let status = "pending";
      if (att) status = "present"; else if (autoAbsent || date < yesterday) status = "absent";
      return { labour_id: l.id, name: l.name, phone: l.phone, designation: l.designation, daily_wage: l.daily_wage, status, attendance: att || null };
    });
    const s = { total: result.length, present: result.filter(r => r.status === "present").length, absent: result.filter(r => r.status === "absent").length, pending: result.filter(r => r.status === "pending").length };
    res.json({ date, isAutoAbsent: autoAbsent, cutoffNote: autoAbsent ? "Past 16:30 — unlisted labours marked absent" : null, summary: s, labours: result });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.post("/present-absent/mark-present", async (req, res) => {
  try {
    const { labour_id, date, client_id, site_id, start_time, end_time } = req.body;
    if (!labour_id || !date || !client_id || !site_id) return res.status(400).json({ message: "labour_id, date, client_id, site_id required" });
    const { data: dup } = await supabase.from("attendance").select("id").eq("labour_id", labour_id).eq("date", date).single();
    if (dup) return res.status(400).json({ message: "Already has attendance for this date" });
    const { data: labour } = await supabase.from("users").select("daily_wage, designation").eq("id", labour_id).single();
    const { data: cfgRows } = await supabase.from("config").select("key, value");
    const config = {}; (cfgRows || []).forEach(r => { config[r.key] = r.value; });
    const { data: holidays } = await supabase.from("holidays").select("date");
    const st = start_time || config.default_start || "10:00";
    const et = end_time || config.default_end || "20:00";
    const pay = calculatePayment(labour?.daily_wage || 0, st, et, date, (holidays || []).map(h => h.date), config, labour?.designation || "");
    const { data, error } = await supabase.from("attendance").insert({ labour_id, date, client_id, site_id, start_time: st, end_time: et, ...pay, admin_verified: true }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/present-absent/mark-absent/:labourId/:date", async (req, res) => {
  try {
    const { labourId, date } = req.params;
    await supabase.from("attendance").delete().eq("labour_id", labourId).eq("date", date);
    res.json({ message: "Marked absent" });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

// ===== REPORTS (download only) =====
router.get("/reports/daily", async (req, res) => {
  try {
    const { date, format, client_id, site_ids } = req.query;
    if (!date) return res.status(400).json({ message: "date required" });
    let q = supabase.from("attendance").select("*, users(name, designation), clients(name), sites(name)").eq("date", date);
    if (client_id) q = q.eq("client_id", client_id);
    if (site_ids) q = q.in("site_id", site_ids.split(",").map(Number));
    const { data } = await q.order("labour_id");
    const rows = (data || []).map(a => ({ ...a, labour_name: a.users?.name, client_name: a.clients?.name, site_name: a.sites?.name }));
    if (format === "xlsx") {
      const buf = (client_id || site_ids) ? generateFilteredDailyExcelReport(date, rows) : generateDailyExcelReport(date, rows);
      res.setHeader("Content-Disposition", `attachment; filename="Daily_${date}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buf));
    }
    if (format === "pdf") {
      const buf = generateDailyPdfReport(date, rows);
      res.setHeader("Content-Disposition", `attachment; filename="Daily_${date}.pdf"`);
      res.setHeader("Content-Type", "application/pdf");
      return res.send(Buffer.from(buf));
    }
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/monthly", async (req, res) => {
  try {
    const { month, format } = req.query; if (!month) return res.status(400).json({ message: "month required" });
    const { data } = await supabase.from("attendance").select("*, users(name, designation), clients(name), sites(name)").gte("date", `${month}-01`).lt("date", nextMonthStart(month)).order("date").order("labour_id");
    const rows = (data || []).map(a => ({ ...a, labour_name: a.users?.name, client_name: a.clients?.name, site_name: a.sites?.name }));
    if (format === "xlsx") { const buf = generateMonthlyExcelReport(month, rows); res.setHeader("Content-Disposition", `attachment; filename="Monthly_${month}.xlsx"`); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); return res.send(Buffer.from(buf)); }
    res.json(rows);
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/payroll", async (req, res) => {
  try {
    const { month, format } = req.query; if (!month) return res.status(400).json({ message: "month required" });
    const { data: labours } = await supabase.from("users").select("id, name, daily_wage").eq("role", "labour").eq("status", "active").order("id");
    const { data: attendance } = await supabase.from("attendance").select("*").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const attByLabour = {}; (attendance || []).forEach(a => { if (!attByLabour[a.labour_id]) attByLabour[a.labour_id] = []; attByLabour[a.labour_id].push(a); });
    const rows = (labours || []).map(l => {
      const recs = attByLabour[l.id] || [];
      return { labour_id: l.id, labour_name: l.name, daily_wage: l.daily_wage, days_worked: recs.length, total_hours: recs.reduce((s, r) => s + (r.hours_worked || 0), 0), total_regular: recs.reduce((s, r) => s + (r.regular_pay || 0), 0), total_ot: recs.reduce((s, r) => s + (r.ot_pay || 0), 0), total_pay: recs.reduce((s, r) => s + (r.total_pay || 0), 0), sunday_days: recs.filter(r => r.is_sunday).length, holiday_days: recs.filter(r => r.is_holiday).length };
    });
    if (format === "xlsx") { const buf = generatePayrollExcelReport(month, rows); res.setHeader("Content-Disposition", `attachment; filename="Payroll_${month}.xlsx"`); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); return res.send(Buffer.from(buf)); }
    res.json(rows);
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/labour/:id", async (req, res) => {
  try {
    const { month, format } = req.query; const { id } = req.params;
    const { data } = await supabase.from("attendance").select("*, clients(name), sites(name)").eq("labour_id", id).gte("date", `${month}-01`).lt("date", nextMonthStart(month)).order("date");
    const rows = (data || []).map(a => ({ ...a, client_name: a.clients?.name, site_name: a.sites?.name }));
    const { data: user } = await supabase.from("users").select("name").eq("id", id).single();
    if (format === "xlsx") { const buf = generateLabourExcelReport(month, user?.name || id, rows); res.setHeader("Content-Disposition", `attachment; filename="Labour_${id}_${month}.xlsx"`); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); return res.send(Buffer.from(buf)); }
    res.json(rows);
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/client/:id", async (req, res) => {
  try {
    const { start, end, format } = req.query; const { id } = req.params;
    const { data } = await supabase.from("attendance").select("*, users(name), sites(name)").eq("client_id", id).gte("date", start).lte("date", end).order("date");
    const rows = (data || []).map(a => ({ ...a, labour_name: a.users?.name, site_name: a.sites?.name }));
    const { data: client } = await supabase.from("clients").select("name").eq("id", id).single();
    if (format === "xlsx") { const buf = generateClientExcelReport(start, end, client?.name || id, rows); res.setHeader("Content-Disposition", `attachment; filename="Client_${id}.xlsx"`); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); return res.send(Buffer.from(buf)); }
    res.json(rows);
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/site/:id", async (req, res) => {
  try {
    const { start, end, format } = req.query; const { id } = req.params;
    const { data } = await supabase.from("attendance").select("*, users(name), clients(name)").eq("site_id", id).gte("date", start).lte("date", end).order("date");
    const rows = (data || []).map(a => ({ ...a, labour_name: a.users?.name, client_name: a.clients?.name }));
    const { data: site } = await supabase.from("sites").select("name").eq("id", id).single();
    if (format === "xlsx") { const buf = generateSiteExcelReport(start, end, site?.name || id, rows); res.setHeader("Content-Disposition", `attachment; filename="Site_${id}.xlsx"`); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); return res.send(Buffer.from(buf)); }
    res.json(rows);
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

module.exports = router;