const express = require("express");
const multer = require("multer");
const csvParse = require("csv-parse/sync");
const bcrypt = require("bcryptjs");
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
const upload = multer();
router.use(authMiddleware, requireRole("admin"));

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Get first day of next month (avoids invalid dates like Feb-31)
function nextMonthStart(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m, 1); // month is 0-indexed, so m (not m-1) = next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function getConfig() {
  const { data } = await supabase.from("config").select("key, value");
  const cfg = {}; (data || []).forEach(r => { cfg[r.key] = r.value; }); return cfg;
}

async function recalcPay(labour_id, start_time, end_time, date) {
  const config = await getConfig();
  const { data: holidays } = await supabase.from("holidays").select("date");
  const { data: labour } = await supabase.from("users").select("daily_wage, designation").eq("id", labour_id).single();
  return calculatePayment(labour.daily_wage, start_time, end_time, date, holidays || [], config, labour.designation);
}

// ===== Attendance =====

// Helper: resolve user/client/site names for attendance rows (FK-independent)
async function enrichRows(rows) {
  if (!rows || !rows.length) return [];
  const { data: users } = await supabase.from("users").select("id, name, designation");
  const { data: clients } = await supabase.from("clients").select("id, name");
  const { data: sites } = await supabase.from("sites").select("id, name, client_id");
  const uMap = {}; (users || []).forEach(u => { uMap[u.id] = u; });
  const cMap = {}; (clients || []).forEach(c => { cMap[c.id] = c; });
  const sMap = {}; (sites || []).forEach(s => { sMap[s.id] = s; });
  return rows.map(a => ({
    ...a,
    labour_name: uMap[a.labour_id]?.name || "Unknown",
    designation: uMap[a.labour_id]?.designation || null,
    client_name: cMap[a.client_id]?.name || "Unknown",
    site_name: sMap[a.site_id]?.name || "Unknown",
    users: undefined, clients: undefined, sites: undefined,
  }));
}

function safeName(str) { return (str || "Unknown").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40); }

router.get("/attendance", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date required" });
    const { data, error } = await supabase.from("attendance").select("*").eq("date", date).order("labour_id");
    if (error) throw error;
    return res.json(await enrichRows(data || []));
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.put("/attendance/bulk-verify", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: "ids array required" });
    const { error } = await supabase.from("attendance")
      .update({ admin_verified: true, verified_at: new Date().toISOString(), verified_by: req.user.id })
      .in("id", ids);
    if (error) throw error;
    return res.json({ message: "Verified", count: ids.length });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.put("/attendance/:id/verify", async (req, res) => {
  try {
    const { data, error } = await supabase.from("attendance")
      .update({ admin_verified: true, verified_at: new Date().toISOString(), verified_by: req.user.id })
      .eq("id", req.params.id).select("*, users(name), clients(name), sites(name)").single();
    if (error) throw error;
    return res.json({ ...data, labour_name: data.users?.name, client_name: data.clients?.name, site_name: data.sites?.name });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.put("/attendance/:id", async (req, res) => {
  try {
    const { client_id, site_id, start_time, end_time, date, notes } = req.body;
    const { data: existing } = await supabase.from("attendance").select("*").eq("id", req.params.id).single();
    if (!existing) return res.status(404).json({ message: "Not found" });

    const st = start_time || existing.start_time;
    const et = end_time || existing.end_time;
    const wd = date || existing.date;

    const [sh, sm] = st.split(":").map(Number); const [eh, em] = et.split(":").map(Number);
    let sM = sh * 60 + sm, eM = eh * 60 + em; if (eM <= sM) eM += 24 * 60;
    if ((eM - sM) / 60 > 18) return res.status(400).json({ message: "Cannot exceed 18 hours" });

    const result = await recalcPay(existing.labour_id, st, et, wd);

    const { data, error } = await supabase.from("attendance").update({
      client_id: client_id || existing.client_id, site_id: site_id || existing.site_id,
      start_time: st, end_time: et, date: wd, notes: notes !== undefined ? notes : existing.notes,
      hours_worked: result.hoursWorked, regular_pay: result.regularPay, ot_pay: result.otPay,
      total_pay: result.totalPay, is_sunday: result.isSunday, is_holiday: result.isHoliday,
    }).eq("id", req.params.id).select("*, users(name), clients(name), sites(name)").single();
    if (error) throw error;
    return res.json({ ...data, labour_name: data.users?.name, client_name: data.clients?.name, site_name: data.sites?.name });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/attendance/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("attendance").delete().eq("id", req.params.id);
    if (error) throw error;
    return res.json({ message: "Deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// ===== Present / Absent =====

router.get("/present-absent", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date required" });

    const today = uaeToday();
    const yesterday = uaeYesterday();

    const { data: labours } = await supabase.from("users")
      .select("id, name, phone, daily_wage, designation")
      .eq("role", "labour").eq("status", "active").order("id");

    const { data: attendance } = await supabase.from("attendance")
      .select("id, labour_id, start_time, end_time, hours_worked, total_pay, regular_pay, ot_pay, admin_verified, clients(name), sites(name)")
      .eq("date", date);

    const attMap = {}; (attendance || []).forEach(a => {
      attMap[a.labour_id] = { ...a, client_name: a.clients?.name, site_name: a.sites?.name, clients: undefined, sites: undefined };
    });

    const uae = uaeNow();
    const pastCutoff = uae.hours > 16 || (uae.hours === 16 && uae.minutes >= 30);
    const autoAbsent = date === yesterday && pastCutoff;

    const result = (labours || []).map(l => {
      const att = attMap[l.id];
      let status = "pending";
      if (att) status = "present";
      else if (autoAbsent || date < yesterday) status = "absent";
      return { labour_id: l.id, name: l.name, phone: l.phone, designation: l.designation, daily_wage: l.daily_wage, status, attendance: att || null };
    });

    const s = { total: result.length, present: result.filter(r => r.status === "present").length, absent: result.filter(r => r.status === "absent").length, pending: result.filter(r => r.status === "pending").length };
    return res.json({ date, isAutoAbsent: autoAbsent, cutoffNote: autoAbsent ? "Past 16:30 — unlisted labours marked absent" : null, summary: s, labours: result });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.post("/present-absent/mark-present", async (req, res) => {
  try {
    const { labour_id, date, client_id, site_id, start_time, end_time } = req.body;
    if (!labour_id || !date || !client_id || !site_id || !start_time || !end_time)
      return res.status(400).json({ message: "All fields required" });
    const { data: dup } = await supabase.from("attendance").select("id").eq("labour_id", labour_id).eq("date", date).maybeSingle();
    if (dup) return res.status(400).json({ message: "Already exists" });
    const result = await recalcPay(labour_id, start_time, end_time, date);
    const { error } = await supabase.from("attendance").insert({
      labour_id, date, client_id, site_id, start_time, end_time,
      hours_worked: result.hoursWorked, regular_pay: result.regularPay, ot_pay: result.otPay,
      total_pay: result.totalPay, is_sunday: result.isSunday, is_holiday: result.isHoliday,
      admin_verified: true, verified_by: req.user.id,
    });
    if (error) throw error;
    return res.status(201).json({ message: "Marked present" });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/present-absent/mark-absent/:labourId/:date", async (req, res) => {
  try {
    const { error } = await supabase.from("attendance").delete().eq("labour_id", req.params.labourId).eq("date", req.params.date);
    if (error) throw error;
    return res.json({ message: "Marked absent" });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// ===== Reports =====

router.get("/reports/daily", async (req, res) => {
  try {
    const { date, format, client_id, site_ids } = req.query;
    if (!date) return res.status(400).json({ message: "date required" });
    let query = supabase.from("attendance").select("*").eq("date", date);
    if (client_id) query = query.eq("client_id", client_id);
    if (site_ids) { const sl = site_ids.split(",").filter(Boolean); if (sl.length) query = query.in("site_id", sl); }
    const { data } = await query.order("labour_id");
    const rows = await enrichRows(data || []);
    let fl = "";
    if (client_id) { const { data: c } = await supabase.from("clients").select("name").eq("id", client_id).single(); fl = c?.name || ""; }
    if (format === "xlsx") {
      const buf = generateFilteredDailyExcelReport(date, rows, fl);
      const fn = fl ? `Daily_Report_${date}_${safeName(fl)}.xlsx` : `Daily_Report_${date}.xlsx`;
      res.setHeader("Content-Disposition", `attachment; filename="${fn}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buf));
    }
    if (format === "pdf") {
      const buf = await generateDailyPdfReport(date, rows);
      const fn = fl ? `Daily_Report_${date}_${safeName(fl)}.pdf` : `Daily_Report_${date}.pdf`;
      res.setHeader("Content-Disposition", `attachment; filename="${fn}"`);
      res.setHeader("Content-Type", "application/pdf");
      return res.send(buf);
    }
    return res.json(rows);
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/monthly", async (req, res) => {
  try {
    const { month, format } = req.query; if (!month) return res.status(400).json({ message: "month required" });
    const { data } = await supabase.from("attendance").select("*").gte("date", `${month}-01`).lt("date", nextMonthStart(month)).order("labour_id");
    const rows = await enrichRows(data || []);
    if (format === "xlsx") {
      const buf = generateMonthlyExcelReport(month, rows);
      res.setHeader("Content-Disposition", `attachment; filename="Monthly_Summary_${month}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buf));
    }
    return res.json(rows);
  } catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/labour/:id", async (req, res) => {
  try {
    const { id } = req.params; const { month, format } = req.query;
    if (!month) return res.status(400).json({ message: "month required" });
    const { data: labour } = await supabase.from("users").select("id, name").eq("id", id).single();
    const { data } = await supabase.from("attendance").select("*").eq("labour_id", id).gte("date", `${month}-01`).lt("date", nextMonthStart(month)).order("date");
    const rows = await enrichRows(data || []);
    if (format === "xlsx") {
      const buf = generateLabourExcelReport(labour, month, rows);
      const fn = `${safeName(labour?.name)}_Report_${month}.xlsx`;
      res.setHeader("Content-Disposition", `attachment; filename="${fn}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buf));
    }
    return res.json(rows);
  } catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/client/:id", async (req, res) => {
  try {
    const { id } = req.params; const { start, end, format } = req.query;
    if (!start || !end) return res.status(400).json({ message: "start/end required" });
    const { data: client } = await supabase.from("clients").select("id, name").eq("id", id).single();
    const { data } = await supabase.from("attendance").select("*").eq("client_id", id).gte("date", start).lte("date", end).order("date");
    const rows = await enrichRows(data || []);
    if (format === "xlsx") {
      const buf = generateClientExcelReport(client, start, end, rows);
      const fn = `${safeName(client?.name)}_Report_${start}_to_${end}.xlsx`;
      res.setHeader("Content-Disposition", `attachment; filename="${fn}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buf));
    }
    return res.json(rows);
  } catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/site/:id", async (req, res) => {
  try {
    const { id } = req.params; const { start, end, format } = req.query;
    if (!start || !end) return res.status(400).json({ message: "start/end required" });
    const { data: site } = await supabase.from("sites").select("id, name, client_id").eq("id", id).single();
    let siteObj = site;
    if (site) { const { data: cl } = await supabase.from("clients").select("name").eq("id", site.client_id).single(); siteObj = { ...site, client_name: cl?.name || "" }; }
    const { data } = await supabase.from("attendance").select("*").eq("site_id", id).gte("date", start).lte("date", end).order("date");
    const rows = await enrichRows(data || []);
    if (format === "xlsx") {
      const buf = generateSiteExcelReport(siteObj, start, end, rows);
      const fn = `${safeName(site?.name)}_Site_Report_${start}_to_${end}.xlsx`;
      res.setHeader("Content-Disposition", `attachment; filename="${fn}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buf));
    }
    return res.json(rows);
  } catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.get("/reports/payroll", async (req, res) => {
  try {
    const { month, format } = req.query; if (!month) return res.status(400).json({ message: "month required" });
    const { data: labours } = await supabase.from("users").select("id, name, daily_wage").eq("role", "labour").eq("status", "active").order("id");
    const { data: attendance } = await supabase.from("attendance").select("*").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const attByLabour = {};
    (attendance || []).forEach(a => { if (!attByLabour[a.labour_id]) attByLabour[a.labour_id] = []; attByLabour[a.labour_id].push(a); });
    const rows = (labours || []).map(l => {
      const recs = attByLabour[l.id] || [];
      return {
        labour_id: l.id, labour_name: l.name, daily_wage: l.daily_wage,
        days_worked: recs.length,
        total_hours: recs.reduce((s, r) => s + (r.hours_worked || 0), 0),
        total_regular: recs.reduce((s, r) => s + (r.regular_pay || 0), 0),
        total_ot: recs.reduce((s, r) => s + (r.ot_pay || 0), 0),
        total_pay: recs.reduce((s, r) => s + (r.total_pay || 0), 0),
        sunday_days: recs.filter(r => r.is_sunday).length,
        holiday_days: recs.filter(r => r.is_holiday).length,
      };
    });
    if (format === "xlsx") {
      const buf = generatePayrollExcelReport(month, rows);
      res.setHeader("Content-Disposition", `attachment; filename="Payroll_Summary_${month}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buf));
    }
    return res.json(rows);
  } catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

// ===== Labours CRUD =====

router.get("/labours", async (_req, res) => {
  try {
    const { data } = await supabase.from("users").select("id, username, name, daily_wage, phone, designation, passport_id, date_of_joining, status, role, pin").eq("role", "labour").order("id");
    return res.json(data || []);
  } catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

function generateRandomPin() { return String(Math.floor(1000 + Math.random() * 9000)); }

router.post("/labours", async (req, res) => {
  try {
    const { name, daily_wage, phone, pin, designation, passport_id, date_of_joining } = req.body;
    if (!name || !daily_wage) return res.status(400).json({ message: "Name and wages required" });
    const { data: maxRow } = await supabase.from("users").select("id").gte("id", 1000).order("id", { ascending: false }).limit(1).maybeSingle();
    const nextId = (maxRow?.id || 1000) + 1;
    const rawPin = pin && /^\d{4}$/.test(String(pin)) ? String(pin) : generateRandomPin();
    const hashed = await bcrypt.hash(rawPin, 10);
    const { data, error } = await supabase.from("users").insert({
      id: nextId, username: String(nextId), name, role: "labour", pin: hashed,
      daily_wage, phone: phone || null, designation: designation || null,
      passport_id: passport_id || null, date_of_joining: date_of_joining || null, status: "active",
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ ...data, pin: rawPin });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.put("/labours/:id", async (req, res) => {
  try {
    const { name, daily_wage, phone, status, designation, passport_id, date_of_joining } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (daily_wage !== undefined) updates.daily_wage = daily_wage;
    if (phone !== undefined) updates.phone = phone;
    if (status !== undefined) updates.status = status;
    if (designation !== undefined) updates.designation = designation;
    if (passport_id !== undefined) updates.passport_id = passport_id;
    if (date_of_joining !== undefined) updates.date_of_joining = date_of_joining;
    const { data, error } = await supabase.from("users").update(updates).eq("id", req.params.id).eq("role", "labour").select().single();
    if (error) throw error;
    return res.json(data);
  } catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/labours/:id", async (req, res) => {
  try { await supabase.from("users").update({ status: "inactive" }).eq("id", req.params.id); return res.json({ message: "Deactivated" }); }
  catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/labours/:id/permanent", async (req, res) => {
  try { await supabase.from("attendance").delete().eq("labour_id", req.params.id); await supabase.from("users").delete().eq("id", req.params.id); return res.json({ message: "Deleted" }); }
  catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.put("/labours/:id/activate", async (req, res) => {
  try { const { data } = await supabase.from("users").update({ status: "active" }).eq("id", req.params.id).select().single(); return res.json(data); }
  catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.post("/labours/:id/reset-pin", async (req, res) => {
  try { const p = generateRandomPin(); await supabase.from("users").update({ pin: await bcrypt.hash(p, 10) }).eq("id", req.params.id); return res.json({ id: req.params.id, newPin: p }); }
  catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.post("/labours/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "CSV required" });
    const recs = csvParse.parse(req.file.buffer.toString("utf-8"), { columns: true, trim: true, skip_empty_lines: true });
    const created = [];
    for (const row of recs) {
      const name = row.Name || row.name; const dw = Number(row.Daily_Wage || row.daily_wage || row.monthly_wage || 0);
      if (!name || !dw || dw <= 0) continue;
      const { data: maxRow } = await supabase.from("users").select("id").gte("id", 1000).order("id", { ascending: false }).limit(1).maybeSingle();
      const nextId = (maxRow?.id || 1000) + 1;
      const pin = generateRandomPin();
      await supabase.from("users").insert({
        id: nextId, username: String(nextId), name, role: "labour", pin: await bcrypt.hash(pin, 10),
        daily_wage: dw, phone: row.Phone || row.phone || null, designation: row.Designation || row.designation || null,
        passport_id: row.Passport_ID || row.passport_id || null, date_of_joining: row.Date_of_Joining || row.date_of_joining || null, status: "active",
      });
      created.push({ id: nextId, name, pin });
    }
    return res.json({ createdCount: created.length, labours: created });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// ===== Clients =====
router.get("/clients", async (_req, res) => { const { data } = await supabase.from("clients").select("*").order("name"); return res.json(data || []); });
router.post("/clients", async (req, res) => { const { name } = req.body; if (!name) return res.status(400).json({ message: "name required" }); const { data, error } = await supabase.from("clients").insert({ name }).select().single(); if (error) return res.status(400).json({ message: error.message }); return res.status(201).json(data); });
router.put("/clients/:id", async (req, res) => { const { data } = await supabase.from("clients").update({ name: req.body.name }).eq("id", req.params.id).select().single(); return res.json(data); });
router.delete("/clients/:id", async (req, res) => {
  const { data: att } = await supabase.from("attendance").select("id").eq("client_id", req.params.id).limit(1);
  if (att && att.length) return res.status(400).json({ message: "Has attendance records" });
  await supabase.from("clients").delete().eq("id", req.params.id); return res.json({ message: "Deleted" });
});

// ===== Sites =====
router.get("/sites", async (req, res) => {
  const { client_id } = req.query;
  let query = supabase.from("sites").select("*, clients(name)");
  if (client_id) query = query.eq("client_id", client_id);
  const { data } = await query.order("name");
  return res.json((data || []).map(s => ({ ...s, client_name: s.clients?.name, clients: undefined })));
});
router.post("/sites", async (req, res) => { const { client_id, name } = req.body; if (!client_id || !name) return res.status(400).json({ message: "client_id and name required" }); const { data, error } = await supabase.from("sites").insert({ client_id, name }).select("*, clients(name)").single(); if (error) return res.status(400).json({ message: error.message }); return res.status(201).json({ ...data, client_name: data.clients?.name }); });
router.put("/sites/:id", async (req, res) => { const { data } = await supabase.from("sites").update({ client_id: req.body.client_id, name: req.body.name }).eq("id", req.params.id).select().single(); return res.json(data); });
router.delete("/sites/:id", async (req, res) => {
  const { data: att } = await supabase.from("attendance").select("id").eq("site_id", req.params.id).limit(1);
  if (att && att.length) return res.status(400).json({ message: "Has attendance records" });
  await supabase.from("sites").delete().eq("id", req.params.id); return res.json({ message: "Deleted" });
});

// ===== Holidays =====
router.get("/holidays", async (_req, res) => { const { data } = await supabase.from("holidays").select("*").order("date"); return res.json(data || []); });
router.post("/holidays", async (req, res) => { const { date, name } = req.body; if (!date || !name) return res.status(400).json({ message: "date and name required" }); const { data, error } = await supabase.from("holidays").insert({ date, name }).select().single(); if (error) return res.status(400).json({ message: error.message }); return res.status(201).json(data); });
router.delete("/holidays/:id", async (req, res) => { await supabase.from("holidays").delete().eq("id", req.params.id); return res.json({ message: "Deleted" }); });
router.post("/holidays/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "CSV required" });
  const recs = csvParse.parse(req.file.buffer.toString("utf-8"), { columns: true, trim: true, skip_empty_lines: true });
  let n = 0; for (const r of recs) { const d = r.Date || r.date; const nm = r.Name || r.name; if (!d || !nm) continue; await supabase.from("holidays").upsert({ date: d, name: nm }, { onConflict: "date" }); n++; }
  return res.json({ createdCount: n });
});

// ===== Config =====
router.get("/config", async (_req, res) => { const { data } = await supabase.from("config").select("key, value, description"); const cfg = {}; (data || []).forEach(r => { cfg[r.key] = { value: r.value, description: r.description }; }); return res.json(cfg); });
router.put("/config", async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    await supabase.from("config").upsert({ key: k, value: String(v), updated_at: new Date().toISOString() }, { onConflict: "key" });
  }
  return res.json({ message: "Updated" });
});


// ===== Incentive Rules CRUD =====
router.get("/incentive-rules", async (req, res) => {
  try {
    const { data } = await supabase.from("incentive_rules").select("*, clients(name)").order("client_id");
    res.json((data || []).map(r => ({ ...r, client_name: r.clients?.name, clients: undefined })));
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.post("/incentive-rules", async (req, res) => {
  try {
    const { client_id, name, description, rule_type, threshold, amount, per_occurrence } = req.body;
    if (!client_id || !name || !rule_type || !threshold || !amount) return res.status(400).json({ message: "client_id, name, rule_type, threshold, amount required" });
    const { data, error } = await supabase.from("incentive_rules").insert({
      client_id, name, description: description || null, rule_type, threshold, amount, per_occurrence: per_occurrence || false, active: true,
    }).select("*, clients(name)").single();
    if (error) throw error;
    res.status(201).json({ ...data, client_name: data.clients?.name, clients: undefined });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.put("/incentive-rules/:id", async (req, res) => {
  try {
    const { name, description, rule_type, threshold, amount, per_occurrence, active, client_id } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (rule_type !== undefined) updates.rule_type = rule_type;
    if (threshold !== undefined) updates.threshold = threshold;
    if (amount !== undefined) updates.amount = amount;
    if (per_occurrence !== undefined) updates.per_occurrence = per_occurrence;
    if (active !== undefined) updates.active = active;
    if (client_id !== undefined) updates.client_id = client_id;
    const { data, error } = await supabase.from("incentive_rules").update(updates).eq("id", req.params.id).select("*, clients(name)").single();
    if (error) throw error;
    res.json({ ...data, client_name: data.clients?.name, clients: undefined });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/incentive-rules/:id", async (req, res) => {
  try {
    await supabase.from("incentive_rules").delete().eq("id", req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

// ===== Managers CRUD =====
router.get("/managers", async (req, res) => {
  try {
    const { data } = await supabase.from("users").select("id, username, name, phone, status").eq("role", "manager").order("id");
    res.json(data || []);
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.post("/managers", async (req, res) => {
  try {
    const { username, name, pin, phone } = req.body;
    if (!username || !name || !pin) return res.status(400).json({ message: "username, name, and pin required" });
    if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ message: "PIN must be 4 digits" });
    const { data: existing } = await supabase.from("users").select("id").eq("username", username).single();
    if (existing) return res.status(400).json({ message: "Username already taken" });
    const hashed = await bcrypt.hash(String(pin), 10);
    const { data, error } = await supabase.from("users").insert({
      username, name, role: "manager", pin: hashed, phone: phone || null, status: "active",
    }).select().single();
    if (error) throw error;
    res.status(201).json({ ...data, pin: String(pin) });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.put("/managers/:id", async (req, res) => {
  try {
    const { name, phone, status, pin } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (status !== undefined) updates.status = status;
    if (pin) {
      if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ message: "PIN must be 4 digits" });
      updates.pin = await bcrypt.hash(String(pin), 10);
    }
    const { data, error } = await supabase.from("users").update(updates).eq("id", req.params.id).eq("role", "manager").select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/managers/:id", async (req, res) => {
  try {
    await supabase.from("users").delete().eq("id", req.params.id).eq("role", "manager");
    res.json({ message: "Deleted" });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

// ===== Analytics / Overview =====
router.get("/analytics", async (req, res) => {
  try {
    const uae = uaeNow();
    const today = uaeToday();
    const monthStart = `${uae.year}-${String(uae.month).padStart(2, "0")}-01`;

    const { data: labours } = await supabase.from("users").select("id, name, daily_wage, designation").eq("role", "labour").eq("status", "active");
    const totalLabours = (labours || []).length;

    const { data: todayAtt } = await supabase.from("attendance").select("labour_id, total_pay, client_id").eq("date", today);
    const presentToday = (todayAtt || []).length;

    const { data: monthAtt } = await supabase.from("attendance").select("labour_id, total_pay, regular_pay, ot_pay, hours_worked, client_id, site_id, date, is_sunday, is_holiday").gte("date", monthStart);

    const monthRows = monthAtt || [];
    const totalWagesMonth = monthRows.reduce((s, r) => s + (r.total_pay || 0), 0);
    const totalRegularMonth = monthRows.reduce((s, r) => s + (r.regular_pay || 0), 0);
    const totalOTMonth = monthRows.reduce((s, r) => s + (r.ot_pay || 0), 0);
    const totalHoursMonth = monthRows.reduce((s, r) => s + (r.hours_worked || 0), 0);
    const uniqueWorkDays = new Set(monthRows.map(r => r.date)).size;

    const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const { data: trendData } = await supabase.from("attendance").select("date, total_pay").gte("date", toDateStr(twoWeeksAgo));
    const dailyTrend = {};
    (trendData || []).forEach(r => {
      if (!dailyTrend[r.date]) dailyTrend[r.date] = { date: r.date, count: 0, wages: 0 };
      dailyTrend[r.date].count++;
      dailyTrend[r.date].wages += r.total_pay || 0;
    });
    const trendArray = Object.values(dailyTrend).sort((a, b) => a.date.localeCompare(b.date));

    const { data: clients } = await supabase.from("clients").select("id, name");
    const clientMap = {}; (clients || []).forEach(c => { clientMap[c.id] = c.name; });
    const clientStats = {};
    monthRows.forEach(r => {
      const cid = r.client_id;
      if (!clientStats[cid]) clientStats[cid] = { client_id: cid, client_name: clientMap[cid] || "Unknown", workers: new Set(), wages: 0, days: 0 };
      clientStats[cid].workers.add(r.labour_id);
      clientStats[cid].wages += r.total_pay || 0;
      clientStats[cid].days++;
    });
    const clientBreakdown = Object.values(clientStats).map(c => ({ ...c, workers: c.workers.size })).sort((a, b) => b.wages - a.wages);

    const { data: sitesList } = await supabase.from("sites").select("id, name, client_id");
    const siteMap = {}; (sitesList || []).forEach(s => { siteMap[s.id] = { name: s.name, client: clientMap[s.client_id] || "" }; });
    const siteStats = {};
    monthRows.forEach(r => {
      const sid = r.site_id;
      if (!siteStats[sid]) siteStats[sid] = { site_id: sid, site_name: siteMap[sid]?.name || "Unknown", client_name: siteMap[sid]?.client || "", wages: 0, days: 0 };
      siteStats[sid].wages += r.total_pay || 0;
      siteStats[sid].days++;
    });
    const siteBreakdown = Object.values(siteStats).sort((a, b) => b.wages - a.wages).slice(0, 10);

    const labourMap = {}; (labours || []).forEach(l => { labourMap[l.id] = l.name; });
    const labourStats = {};
    monthRows.forEach(r => {
      const lid = r.labour_id;
      if (!labourStats[lid]) labourStats[lid] = { labour_id: lid, name: labourMap[lid] || "Unknown", wages: 0, days: 0, hours: 0 };
      labourStats[lid].wages += r.total_pay || 0;
      labourStats[lid].days++;
      labourStats[lid].hours += r.hours_worked || 0;
    });
    const topLabours = Object.values(labourStats).sort((a, b) => b.wages - a.wages).slice(0, 10);

    const avgDailyWage = monthRows.length > 0 ? totalWagesMonth / monthRows.length : 0;

    res.json({
      summary: { totalLabours, presentToday, absentToday: totalLabours - presentToday, totalWagesMonth, totalRegularMonth, totalOTMonth, totalHoursMonth, uniqueWorkDays, avgDailyWage },
      dailyTrend: trendArray,
      clientBreakdown,
      siteBreakdown,
      topLabours,
    });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

// ===== Payroll with Incentives =====
router.get("/reports/payroll-with-incentives", async (req, res) => {
  try {
    const { month, format } = req.query;
    if (!month) return res.status(400).json({ message: "month required" });

    const { data: labours } = await supabase.from("users").select("id, name, daily_wage").eq("role", "labour").eq("status", "active").order("id");
    const { data: attendance } = await supabase.from("attendance").select("*").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const { data: rules } = await supabase.from("incentive_rules").select("*").eq("active", true);

    const attByLabour = {};
    (attendance || []).forEach(a => {
      if (!attByLabour[a.labour_id]) attByLabour[a.labour_id] = [];
      attByLabour[a.labour_id].push(a);
    });

    const rows = (labours || []).map(l => {
      const recs = attByLabour[l.id] || [];
      const base = {
        labour_id: l.id, labour_name: l.name, daily_wage: l.daily_wage,
        days_worked: recs.length,
        total_hours: recs.reduce((s, r) => s + (r.hours_worked || 0), 0),
        total_regular: recs.reduce((s, r) => s + (r.regular_pay || 0), 0),
        total_ot: recs.reduce((s, r) => s + (r.ot_pay || 0), 0),
        total_pay: recs.reduce((s, r) => s + (r.total_pay || 0), 0),
        sunday_days: recs.filter(r => r.is_sunday).length,
        holiday_days: recs.filter(r => r.is_holiday).length,
      };

      let totalIncentive = 0;
      const incentiveDetails = [];
      const recsByClient = {};
      recs.forEach(r => { if (!recsByClient[r.client_id]) recsByClient[r.client_id] = []; recsByClient[r.client_id].push(r); });

      (rules || []).forEach(rule => {
        const clientRecs = recsByClient[rule.client_id] || [];
        if (clientRecs.length === 0) return;
        let qualifies = false; let earned = 0;

        if (rule.rule_type === "sunday_count") {
          const sundayCount = clientRecs.filter(r => r.is_sunday).length;
          if (sundayCount >= rule.threshold) {
            qualifies = true;
            earned = rule.per_occurrence ? rule.amount * (sundayCount - rule.threshold + 1) : rule.amount;
          }
        } else if (rule.rule_type === "days_worked") {
          if (clientRecs.length >= rule.threshold) {
            qualifies = true;
            earned = rule.per_occurrence ? rule.amount * (clientRecs.length - rule.threshold + 1) : rule.amount;
          }
        } else if (rule.rule_type === "fixed") {
          if (clientRecs.length > 0) { qualifies = true; earned = rule.amount; }
        }

        if (qualifies && earned > 0) {
          totalIncentive += earned;
          incentiveDetails.push({ rule_name: rule.name, client_id: rule.client_id, earned });
        }
      });

      return { ...base, incentive: totalIncentive, incentive_details: incentiveDetails, grand_total: base.total_pay + totalIncentive };
    });

    if (format === "xlsx") {
      const XLSX = require("xlsx");
      const data = [["PAYROLL WITH INCENTIVES"], [`Month: ${month}`], [],
        ["Labour ID", "Name", "Daily Wage", "Days", "Hours", "Regular", "OT", "Sunday", "Holiday", "Base Pay", "Incentive", "Grand Total"]];
      let grandBase = 0, grandInc = 0;
      rows.forEach(r => {
        grandBase += r.total_pay; grandInc += r.incentive;
        data.push([r.labour_id, r.labour_name, r.daily_wage, r.days_worked,
          Math.round(r.total_hours * 100) / 100, Math.round(r.total_regular * 100) / 100,
          Math.round(r.total_ot * 100) / 100, r.sunday_days, r.holiday_days,
          Math.round(r.total_pay * 100) / 100, Math.round(r.incentive * 100) / 100,
          Math.round(r.grand_total * 100) / 100]);
      });
      data.push([], ["", "", "", "", "", "", "", "", "TOTAL", Math.round(grandBase * 100) / 100, Math.round(grandInc * 100) / 100, Math.round((grandBase + grandInc) * 100) / 100]);
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Payroll");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", `attachment; filename="Payroll_Incentives_${month}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buf));
    }
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

module.exports = router;