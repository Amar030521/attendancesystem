const express = require("express");
const multer = require("multer");
const csvParse = require("csv-parse/sync");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const { authMiddleware, requireRole } = require("../middleware/auth");
const { supabase } = require("../db");
const { calculatePayment, calculateSundayAutoPay } = require("../utils/calculatePayment");
const { uaeNow, uaeToday, uaeYesterday } = require("../utils/uaeTime");
const {
  generateDailyExcelReport, generateDailyPdfReport, generateMonthlyExcelReport,
  generateLabourExcelReport, generateClientExcelReport, generateSiteExcelReport,
  generatePayrollExcelReport, generateFilteredDailyExcelReport,
} = require("../services/reportService");

const router = express.Router();
const upload = multer();
router.use(authMiddleware, requireRole("admin"));

/**
 * Get the effective salary for a labour on a specific date.
 * Looks up salary_history for the most recent entry where effective_date <= targetDate.
 * Falls back to users.daily_wage if no salary_history exists (backward compatibility).
 */
async function getSalaryOnDate(labourId, targetDate) {
  const { data: historyEntry } = await supabase
    .from("salary_history")
    .select("salary")
    .eq("labour_id", labourId)
    .lte("effective_date", targetDate)
    .order("effective_date", { ascending: false })
    .limit(1)
    .single();
  if (historyEntry) return Number(historyEntry.salary);
  // Fallback: use current daily_wage from users table
  const { data: user } = await supabase.from("users").select("daily_wage").eq("id", labourId).single();
  return user ? Number(user.daily_wage) : 0;
}

/**
 * Get salary map for a labour for each unique date in a list.
 * Optimized: fetches all salary_history entries once, then computes per date.
 */
async function getSalaryMapForDates(labourId, dates) {
  if (!dates || dates.length === 0) return {};
  const { data: history } = await supabase
    .from("salary_history")
    .select("salary, effective_date")
    .eq("labour_id", labourId)
    .order("effective_date", { ascending: true });
  if (!history || history.length === 0) {
    // Fallback to current wage
    const { data: user } = await supabase.from("users").select("daily_wage").eq("id", labourId).single();
    const wage = user ? Number(user.daily_wage) : 0;
    const map = {};
    dates.forEach(d => { map[d] = wage; });
    return map;
  }
  const map = {};
  dates.forEach(d => {
    let salary = Number(history[0].salary); // default to earliest known salary
    for (const entry of history) {
      if (entry.effective_date <= d) salary = Number(entry.salary);
      else break;
    }
    map[d] = salary;
  });
  return map;
}

/**
 * Batch: get salary on a specific date for multiple labours.
 * Returns { labourId: salary } map.
 */
async function getBulkSalaryOnDate(labourIds, targetDate) {
  if (!labourIds || labourIds.length === 0) return {};
  const { data: history } = await supabase
    .from("salary_history")
    .select("labour_id, salary, effective_date")
    .in("labour_id", labourIds)
    .lte("effective_date", targetDate)
    .order("effective_date", { ascending: false });

  const result = {};
  // Group by labour and take the first (most recent) entry for each
  (history || []).forEach(h => {
    if (!result[h.labour_id]) result[h.labour_id] = Number(h.salary);
  });
  return result;
}

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
  const { data: labour } = await supabase.from("users").select("designation").eq("id", labour_id).single();
  const salary = await getSalaryOnDate(labour_id, date);
  return calculatePayment(salary, start_time, end_time, date, holidays || [], config, labour?.designation);
}

// ===== Attendance =====

// Helper: resolve user/client/site names for attendance rows (FK-independent)
async function enrichRows(rows) {
  if (!rows || !rows.length) return [];
  const { data: users } = await supabase.from("users").select("id, name, designation, photo_url");
  const { data: clients } = await supabase.from("clients").select("id, name");
  const { data: sites } = await supabase.from("sites").select("id, name, client_id");
  const uMap = {}; (users || []).forEach(u => { uMap[u.id] = u; });
  const cMap = {}; (clients || []).forEach(c => { cMap[c.id] = c; });
  const sMap = {}; (sites || []).forEach(s => { sMap[s.id] = s; });
  return rows.map(a => ({
    ...a,
    labour_name: uMap[a.labour_id]?.name || "Unknown",
    designation: uMap[a.labour_id]?.designation || null,
    photo_url: uMap[a.labour_id]?.photo_url || null,
    client_name: cMap[a.client_id]?.name || "Unknown",
    site_name: sMap[a.site_id]?.name || "Unknown",
    users: undefined, clients: undefined, sites: undefined,
  }));
}

function safeName(str) { return (str || "Unknown").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40); }

/**
 * Get all Sundays and holidays in a given month.
 */
function getSundaysAndHolidaysInMonth(monthStr, holidayDates) {
  const [y, m] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y, m - 1, day);
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (d.getDay() === 0 || (holidayDates || []).includes(dateStr)) dates.push(dateStr);
  }
  return dates;
}

/**
 * Calculate Sunday/Holiday auto-pay (rest day pay) for UNATTENDED Sundays/holidays.
 * Now uses date-aware salary lookup per Sunday date.
 */
async function calcSundayAutoPayForMonth(monthStr, labourId, dailyWageFallback, attendanceDates, holidayDates, config) {
  const allSH = getSundaysAndHolidaysInMonth(monthStr, holidayDates);
  const attendedSet = new Set(attendanceDates);
  const unattendedDates = allSH.filter(d => !attendedSet.has(d));
  if (unattendedDates.length === 0) return { autoPay: 0, autoPayDays: 0 };

  // Get salary for each unattended Sunday/Holiday
  const salaryMap = await getSalaryMapForDates(labourId, unattendedDates);
  let autoPay = 0, autoPayDays = 0;
  for (const dateStr of unattendedDates) {
    const wage = salaryMap[dateStr] || dailyWageFallback;
    autoPay += calculateSundayAutoPay(wage, dateStr, config);
    autoPayDays++;
  }
  return { autoPay: Math.round(autoPay * 100) / 100, autoPayDays };
}

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
      .select("id, name, phone, daily_wage, designation, photo_url")
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
      return { labour_id: l.id, name: l.name, phone: l.phone, designation: l.designation, photo_url: l.photo_url || null, daily_wage: l.daily_wage, status, attendance: att || null };
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
    const config = await getConfig();
    const { data } = await supabase.from("attendance").select("*").gte("date", `${month}-01`).lt("date", nextMonthStart(month)).order("labour_id");
    const rows = await enrichRows(data || []);
    const { data: labours } = await supabase.from("users").select("id, name, daily_wage, designation").eq("role", "labour").eq("status", "active");
    const { data: holidays } = await supabase.from("holidays").select("date").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const holidayDates = (holidays || []).map(h => h.date);
    const attByLabour = {};
    rows.forEach(r => { if (!attByLabour[r.labour_id]) attByLabour[r.labour_id] = []; attByLabour[r.labour_id].push(r.date); });
    const sundayAutoPayMap = {};
    for (const l of (labours || [])) {
      const { autoPay } = await calcSundayAutoPayForMonth(month, l.id, l.daily_wage, attByLabour[l.id] || [], holidayDates, config);
      if (autoPay > 0) { sundayAutoPayMap[l.id] = autoPay; sundayAutoPayMap[l.id + "_name"] = l.name; sundayAutoPayMap[l.id + "_designation"] = l.designation || ""; }
    }

    // Fetch adjustments for the month
    const { data: adjData } = await supabase.from("daily_adjustments").select("labour_id, type, amount").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const adjustmentsMap = {};
    (adjData || []).forEach(a => {
      if (!adjustmentsMap[a.labour_id]) adjustmentsMap[a.labour_id] = { incentives: 0, deductions: 0 };
      if (a.type === "incentive") adjustmentsMap[a.labour_id].incentives += Number(a.amount);
      else adjustmentsMap[a.labour_id].deductions += Number(a.amount);
    });

    if (format === "xlsx") {
      const buf = generateMonthlyExcelReport(month, rows, sundayAutoPayMap, adjustmentsMap);
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
    const config = await getConfig();
    const { data: labour } = await supabase.from("users").select("id, name, daily_wage, designation").eq("id", id).single();
    const { data } = await supabase.from("attendance").select("*").eq("labour_id", id).gte("date", `${month}-01`).lt("date", nextMonthStart(month)).order("date");
    const rows = await enrichRows(data || []);
    const { data: holidays } = await supabase.from("holidays").select("date").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const holidayDates = (holidays || []).map(h => h.date);
    const { autoPay } = await calcSundayAutoPayForMonth(month, id, labour?.daily_wage || 0, rows.map(r => r.date), holidayDates, config);
    if (format === "xlsx") {
      const buf = generateLabourExcelReport(labour, month, rows, autoPay);
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
    const config = await getConfig();
    const { data: labours } = await supabase.from("users").select("id, name, daily_wage, designation").eq("role", "labour").eq("status", "active").order("id");
    const { data: attendance } = await supabase.from("attendance").select("*").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const { data: holidays } = await supabase.from("holidays").select("date").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const { data: adjustments } = await supabase.from("daily_adjustments").select("labour_id, type, amount").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const holidayDates = (holidays || []).map(h => h.date);
    const attByLabour = {};
    (attendance || []).forEach(a => { if (!attByLabour[a.labour_id]) attByLabour[a.labour_id] = []; attByLabour[a.labour_id].push(a); });
    const adjByLabour = {};
    (adjustments || []).forEach(a => {
      if (!adjByLabour[a.labour_id]) adjByLabour[a.labour_id] = { incentives: 0, deductions: 0 };
      if (a.type === "incentive") adjByLabour[a.labour_id].incentives += Number(a.amount);
      else adjByLabour[a.labour_id].deductions += Number(a.amount);
    });
    const rows = [];
    for (const l of (labours || [])) {
      const recs = attByLabour[l.id] || [];
      const attendanceDates = recs.map(r => r.date);
      const { autoPay } = await calcSundayAutoPayForMonth(month, l.id, l.daily_wage, attendanceDates, holidayDates, config);
      const adj = adjByLabour[l.id] || { incentives: 0, deductions: 0 };
      const basePay = recs.reduce((s, r) => s + (r.total_pay || 0), 0) + autoPay;
      rows.push({
        labour_id: l.id, labour_name: l.name, designation: l.designation || "", daily_wage: l.daily_wage,
        days_worked: recs.length,
        total_hours: recs.reduce((s, r) => s + (r.hours_worked || 0), 0),
        total_regular: recs.reduce((s, r) => s + (r.regular_pay || 0), 0) + autoPay,
        total_ot: recs.reduce((s, r) => s + (r.ot_pay || 0), 0),
        total_pay: basePay,
        sunday_days: recs.filter(r => r.is_sunday).length,
        holiday_days: recs.filter(r => r.is_holiday).length,
        sunday_auto_pay: autoPay,
        incentives: Math.round(adj.incentives * 100) / 100,
        deductions: Math.round(adj.deductions * 100) / 100,
        net_pay: Math.round((basePay + adj.incentives - adj.deductions) * 100) / 100,
      });
    }
    if (format === "xlsx") {
      const buf = generatePayrollExcelReport(month, rows);
      res.setHeader("Content-Disposition", `attachment; filename="Payroll_Summary_${month}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return res.send(Buffer.from(buf));
    }
    return res.json(rows);
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// ===== Labours CRUD =====

router.get("/labours", async (_req, res) => {
  try {
    const { data } = await supabase.from("users").select("id, username, name, daily_wage, phone, designation, passport_id, date_of_joining, status, role, pin, photo_url").eq("role", "labour").order("id");
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

    // Create initial salary_history entry
    if (daily_wage > 0) {
      await supabase.from("salary_history").insert({
        labour_id: data.id,
        salary: daily_wage,
        effective_date: date_of_joining || new Date().toISOString().slice(0, 10),
        notes: "Initial salary",
        created_by: req.user.id,
      });
    }

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
  try {
    // Try to delete photo from storage (ignore errors if it doesn't exist)
    try {
      const { data: list } = await supabase.storage.from("labour-photos").list("", { search: String(req.params.id) });
      if (list && list.length > 0) {
        const filesToRemove = list.filter(f => f.name.startsWith(`${req.params.id}.`)).map(f => f.name);
        if (filesToRemove.length > 0) await supabase.storage.from("labour-photos").remove(filesToRemove);
      }
    } catch (e) { /* photo may not exist, ignore */ }
    await supabase.from("attendance").delete().eq("labour_id", req.params.id);
    await supabase.from("advance_payments").delete().eq("labour_id", req.params.id);
    await supabase.from("users").delete().eq("id", req.params.id);
    return res.json({ message: "Deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.put("/labours/:id/activate", async (req, res) => {
  try { const { data } = await supabase.from("users").update({ status: "active" }).eq("id", req.params.id).select().single(); return res.json(data); }
  catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

router.post("/labours/:id/reset-pin", async (req, res) => {
  try { const p = generateRandomPin(); await supabase.from("users").update({ pin: await bcrypt.hash(p, 10) }).eq("id", req.params.id); return res.json({ id: req.params.id, newPin: p }); }
  catch (err) { return res.status(500).json({ message: "Internal server error" }); }
});

// ===== Labour Photo Upload =====
// Upload/replace photo for a labour. Stores in Supabase Storage bucket "labour-photos".
// Filename: {labour_id}.{ext}. Always upserts (replaces previous photo).
router.post("/labours/:id/photo", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Photo file required" });
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ message: "Only JPG, PNG, WebP images allowed" });
    }
    if (req.file.size > 2 * 1024 * 1024) {
      return res.status(400).json({ message: "Photo must be under 2 MB" });
    }
    // Determine extension from mimetype
    const extMap = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };
    const ext = extMap[req.file.mimetype] || "jpg";
    const filename = `${req.params.id}.${ext}`;

    // Remove any existing photo with different extension first
    try {
      const allExts = ["jpg", "png", "webp"];
      const oldFiles = allExts.filter(e => e !== ext).map(e => `${req.params.id}.${e}`);
      await supabase.storage.from("labour-photos").remove(oldFiles);
    } catch (e) { /* ignore */ }

    const { error: upErr } = await supabase.storage
      .from("labour-photos")
      .upload(filename, req.file.buffer, {
        upsert: true,
        contentType: req.file.mimetype,
        cacheControl: "3600",
      });
    if (upErr) { console.error("Upload error:", upErr); return res.status(500).json({ message: "Upload failed: " + upErr.message }); }

    const { data: { publicUrl } } = supabase.storage.from("labour-photos").getPublicUrl(filename);
    // Append timestamp to bust browser cache after photo update
    const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

    await supabase.from("users").update({ photo_url: cacheBustedUrl }).eq("id", req.params.id);
    return res.json({ photo_url: cacheBustedUrl });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// Delete photo for a labour
router.delete("/labours/:id/photo", async (req, res) => {
  try {
    const allExts = ["jpg", "png", "webp"];
    const filesToRemove = allExts.map(e => `${req.params.id}.${e}`);
    await supabase.storage.from("labour-photos").remove(filesToRemove);
    await supabase.from("users").update({ photo_url: null }).eq("id", req.params.id);
    return res.json({ message: "Photo removed" });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.post("/labours/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "File required (CSV or Excel)" });
    const ext = (req.file.originalname || "").toLowerCase();
    let recs = [];
    if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      // Parse Excel
      const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      recs = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } else {
      // Parse CSV
      recs = csvParse.parse(req.file.buffer.toString("utf-8"), { columns: true, trim: true, skip_empty_lines: true });
    }
    if (!recs.length) return res.status(400).json({ message: "No data rows found in file" });
    // Helper: parse wage value - handles "1,200.00", "1200", 1200, etc.
    function parseWage(v) {
      if (typeof v === "number") return v;
      if (!v) return 0;
      return Number(String(v).replace(/[^0-9.]/g, "")) || 0;
    }
    // Helper: parse date - handles Date objects from Excel and strings
    function parseDate(v) {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const created = [];
    const skipped = [];
    for (const row of recs) {
      const name = (row.Name || row.name || row.NAME || "").trim();
      const dw = parseWage(row.Daily_Wage || row.daily_wage || row.monthly_wage || row["Monthly Wages"] || row["monthly wages"] || row.Salary || row.salary || 0);
      if (!name || dw <= 0) { skipped.push(name || "(empty)"); continue; }
      const { data: maxRow } = await supabase.from("users").select("id").gte("id", 1000).order("id", { ascending: false }).limit(1).maybeSingle();
      const nextId = (maxRow?.id || 1000) + 1;
      const pin = generateRandomPin();
      await supabase.from("users").insert({
        id: nextId, username: String(nextId), name, role: "labour", pin: await bcrypt.hash(pin, 10),
        daily_wage: dw,
        phone: (row.Phone || row.phone || row.PHONE || "").trim() || null,
        designation: (row.Designation || row.designation || row.DESIGNATION || "").trim() || null,
        passport_id: (row.Passport_ID || row.passport_id || row["Passport ID"] || row.passport || "").trim() || null,
        date_of_joining: parseDate(row.Date_of_Joining || row.date_of_joining || row["Joining Date"] || row["Date of Joining"]),
        status: "active",
      });
      created.push({ id: nextId, name, pin });
    }
    let msg = `Imported ${created.length} labours!`;
    if (skipped.length) msg += ` Skipped ${skipped.length}: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "..." : ""}`;
    return res.json({ createdCount: created.length, labours: created, skippedCount: skipped.length, message: msg });
  } catch (err) { console.error("Import error:", err); return res.status(500).json({ message: err.message || "Import failed" }); }
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
    const { name, pin, phone } = req.body;
    if (!name || !pin) return res.status(400).json({ message: "Name and PIN required" });
    if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ message: "PIN must be 4 digits" });
    // Auto-generate unique ID (5000-9999 range for managers, labours use 1000+)
    const { data: allIds } = await supabase.from("users").select("id");
    const usedIds = new Set((allIds || []).map(r => r.id));
    let mgrId = null;
    for (let i = 5000; i <= 9999; i++) {
      if (!usedIds.has(i)) { mgrId = i; break; }
    }
    if (!mgrId) return res.status(400).json({ message: "No free IDs available" });
    // Auto-generate username from name (lowercase, no spaces) + id
    const username = name.toLowerCase().replace(/[^a-z0-9]/g, "") + mgrId;
    const hashed = await bcrypt.hash(String(pin), 10);
    const { data, error } = await supabase.from("users").insert({
      id: mgrId, username, name, role: "manager", pin: hashed, phone: phone || null, status: "active",
      daily_wage: 0, designation: null, passport_id: null, date_of_joining: null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ ...data, pin: String(pin) });
  } catch (err) { console.error("Manager create error:", err); res.status(500).json({ message: err.message || "Internal server error" }); }
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

// ===== Salary History =====

// Get salary history for a labour
router.get("/salary-history/:labourId", async (req, res) => {
  try {
    const { data } = await supabase
      .from("salary_history")
      .select("*")
      .eq("labour_id", req.params.labourId)
      .order("effective_date", { ascending: false });
    return res.json(data || []);
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// Add salary change with effective date
router.post("/salary-history", async (req, res) => {
  try {
    const { labour_id, salary, effective_date, notes } = req.body;
    if (!labour_id || !salary || !effective_date) return res.status(400).json({ message: "labour_id, salary, and effective_date required" });
    if (Number(salary) <= 0) return res.status(400).json({ message: "Salary must be positive" });

    // Insert into salary_history
    const { data, error } = await supabase.from("salary_history").insert({
      labour_id, salary: Number(salary), effective_date, notes: notes || null, created_by: req.user.id,
    }).select().single();
    if (error) throw error;

    // Update users.daily_wage to the latest salary (most recent effective_date)
    const { data: latest } = await supabase
      .from("salary_history")
      .select("salary")
      .eq("labour_id", labour_id)
      .order("effective_date", { ascending: false })
      .limit(1)
      .single();
    if (latest) {
      await supabase.from("users").update({ daily_wage: latest.salary }).eq("id", labour_id);
    }

    // Recalculate all attendance records on or after the effective date
    // This ensures backdated salary changes update existing pay calculations
    let recalcCount = 0;
    try {
      const { data: affected } = await supabase
        .from("attendance")
        .select("id, labour_id, start_time, end_time, date")
        .eq("labour_id", labour_id)
        .gte("date", effective_date)
        .order("date");

      if (affected && affected.length > 0) {
        for (const att of affected) {
          const result = await recalcPay(att.labour_id, att.start_time, att.end_time, att.date);
          await supabase.from("attendance").update({
            hours_worked: result.hoursWorked,
            regular_pay: result.regularPay,
            ot_pay: result.otPay,
            total_pay: result.totalPay,
            is_sunday: result.isSunday,
            is_holiday: result.isHoliday,
          }).eq("id", att.id);
          recalcCount++;
        }
      }
    } catch (recalcErr) {
      // Log but don't fail the request — salary entry was saved successfully
      console.error("Recalc error (non-fatal):", recalcErr);
    }

    return res.status(201).json({ ...data, recalculated: recalcCount });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// Delete salary history entry
router.delete("/salary-history/:id", async (req, res) => {
  try {
    const { data: entry } = await supabase.from("salary_history").select("labour_id, effective_date").eq("id", req.params.id).single();
    if (!entry) return res.status(404).json({ message: "Not found" });

    await supabase.from("salary_history").delete().eq("id", req.params.id);

    // Update users.daily_wage to reflect the latest remaining entry
    const { data: latest } = await supabase
      .from("salary_history")
      .select("salary")
      .eq("labour_id", entry.labour_id)
      .order("effective_date", { ascending: false })
      .limit(1)
      .single();
    if (latest) {
      await supabase.from("users").update({ daily_wage: latest.salary }).eq("id", entry.labour_id);
    }

    // Recalculate attendance records from the deleted entry's effective date onward
    let recalcCount = 0;
    try {
      const { data: affected } = await supabase
        .from("attendance")
        .select("id, labour_id, start_time, end_time, date")
        .eq("labour_id", entry.labour_id)
        .gte("date", entry.effective_date)
        .order("date");

      if (affected && affected.length > 0) {
        for (const att of affected) {
          const result = await recalcPay(att.labour_id, att.start_time, att.end_time, att.date);
          await supabase.from("attendance").update({
            hours_worked: result.hoursWorked,
            regular_pay: result.regularPay,
            ot_pay: result.otPay,
            total_pay: result.totalPay,
            is_sunday: result.isSunday,
            is_holiday: result.isHoliday,
          }).eq("id", att.id);
          recalcCount++;
        }
      }
    } catch (recalcErr) {
      console.error("Recalc error on delete (non-fatal):", recalcErr);
    }

    return res.json({ message: "Deleted", recalculated: recalcCount });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// ===== Daily Adjustments (Incentives & Deductions) =====

// Get adjustments summary for all labours (for admin table)
router.get("/daily-adjustments-summary", async (req, res) => {
  try {
    const { data } = await supabase.from("daily_adjustments").select("labour_id, type, amount");
    const byLabour = {};
    (data || []).forEach(r => {
      if (!byLabour[r.labour_id]) byLabour[r.labour_id] = { incentives: 0, deductions: 0 };
      if (r.type === "incentive") byLabour[r.labour_id].incentives += Number(r.amount);
      else byLabour[r.labour_id].deductions += Number(r.amount);
    });
    return res.json({ byLabour });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// Get adjustments for a specific labour
router.get("/daily-adjustments/:labourId", async (req, res) => {
  try {
    const { data } = await supabase.from("daily_adjustments").select("*").eq("labour_id", req.params.labourId).order("date", { ascending: false });
    const totalIncentives = (data || []).filter(r => r.type === "incentive").reduce((s, r) => s + Number(r.amount), 0);
    const totalDeductions = (data || []).filter(r => r.type === "deduction").reduce((s, r) => s + Number(r.amount), 0);
    return res.json({
      records: data || [],
      totalIncentives: Math.round(totalIncentives * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      net: Math.round((totalIncentives - totalDeductions) * 100) / 100,
    });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// Add a daily adjustment
router.post("/daily-adjustments", async (req, res) => {
  try {
    const { labour_id, date, type, amount, remarks } = req.body;
    if (!labour_id || !date || !type || !amount) return res.status(400).json({ message: "labour_id, date, type, and amount required" });
    if (!["incentive", "deduction"].includes(type)) return res.status(400).json({ message: "type must be 'incentive' or 'deduction'" });
    if (Number(amount) <= 0) return res.status(400).json({ message: "Amount must be positive" });
    const { data, error } = await supabase.from("daily_adjustments").insert({
      labour_id, date, type, amount: Number(amount), remarks: remarks || null, created_by: req.user.id,
    }).select().single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// Delete a daily adjustment
router.delete("/daily-adjustments/:id", async (req, res) => {
  try {
    await supabase.from("daily_adjustments").delete().eq("id", req.params.id);
    return res.json({ message: "Deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// ===== Advance Payments =====

// Summary must be before :labourId to avoid "summary" being treated as an ID
router.get("/advance-payments-summary", async (req, res) => {
  try {
    const { data } = await supabase.from("advance_payments").select("labour_id, amount");
    const byLabour = {};
    (data || []).forEach(r => { byLabour[r.labour_id] = (byLabour[r.labour_id] || 0) + (r.amount || 0); });
    const total = Object.values(byLabour).reduce((s, v) => s + v, 0);
    const count = Object.keys(byLabour).length;
    return res.json({ total: Math.round(total * 100) / 100, laboursWithAdvance: count, byLabour });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.get("/advance-payments/:labourId", async (req, res) => {
  try {
    const { data } = await supabase.from("advance_payments").select("*").eq("labour_id", req.params.labourId).order("date", { ascending: false });
    const total = (data || []).reduce((s, r) => s + (r.amount || 0), 0);
    return res.json({ records: data || [], total: Math.round(total * 100) / 100 });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.post("/advance-payments", async (req, res) => {
  try {
    const { labour_id, amount, date, notes } = req.body;
    if (!labour_id || !amount || !date) return res.status(400).json({ message: "labour_id, amount, and date required" });
    if (Number(amount) <= 0) return res.status(400).json({ message: "Amount must be positive" });
    const { data, error } = await supabase.from("advance_payments").insert({
      labour_id, amount: Number(amount), date, notes: notes || null, created_by: req.user.id,
    }).select().single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/advance-payments/:id", async (req, res) => {
  try {
    await supabase.from("advance_payments").delete().eq("id", req.params.id);
    return res.json({ message: "Deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ message: "Internal server error" }); }
});

// ===== Analytics / Overview =====
router.get("/analytics", async (req, res) => {
  try {
    const config = await getConfig();
    const uae = uaeNow();
    const today = uaeToday();
    const monthStr = `${uae.year}-${String(uae.month).padStart(2, "0")}`;
    const monthStart = `${monthStr}-01`;

    const { data: labours } = await supabase.from("users").select("id, name, daily_wage, designation").eq("role", "labour").eq("status", "active");
    const totalLabours = (labours || []).length;

    // Get advance payment totals from advance_payments table
    const { data: advData } = await supabase.from("advance_payments").select("labour_id, amount");
    const totalAdvancePayment = (advData || []).reduce((s, r) => s + (r.amount || 0), 0);
    const advByLabour = {};
    (advData || []).forEach(r => { advByLabour[r.labour_id] = (advByLabour[r.labour_id] || 0) + (r.amount || 0); });
    const laboursWithAdvance = Object.keys(advByLabour).length;

    const { data: todayAtt } = await supabase.from("attendance").select("labour_id, total_pay, client_id").eq("date", today);
    const presentToday = (todayAtt || []).length;

    const { data: monthAtt } = await supabase.from("attendance").select("labour_id, total_pay, regular_pay, ot_pay, hours_worked, client_id, site_id, date, is_sunday, is_holiday").gte("date", monthStart);
    const { data: holidaysData } = await supabase.from("holidays").select("date").gte("date", monthStart).lt("date", nextMonthStart(monthStr));
    const holidayDates = (holidaysData || []).map(h => h.date);

    const monthRows = monthAtt || [];
    let totalWagesMonth = monthRows.reduce((s, r) => s + (r.total_pay || 0), 0);
    let totalRegularMonth = monthRows.reduce((s, r) => s + (r.regular_pay || 0), 0);
    const totalOTMonth = monthRows.reduce((s, r) => s + (r.ot_pay || 0), 0);
    const totalHoursMonth = monthRows.reduce((s, r) => s + (r.hours_worked || 0), 0);
    const uniqueWorkDays = new Set(monthRows.map(r => r.date)).size;

    // Add Sunday auto-pay per labour
    const attByLabour = {};
    monthRows.forEach(r => { if (!attByLabour[r.labour_id]) attByLabour[r.labour_id] = []; attByLabour[r.labour_id].push(r.date); });
    let totalSundayAutoPay = 0;
    for (const l of (labours || [])) {
      const { autoPay } = await calcSundayAutoPayForMonth(monthStr, l.id, l.daily_wage, attByLabour[l.id] || [], holidayDates, config);
      totalSundayAutoPay += autoPay;
    }
    totalWagesMonth += totalSundayAutoPay;
    totalRegularMonth += totalSundayAutoPay;

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
    monthRows.forEach(r => { const cid = r.client_id; if (!clientStats[cid]) clientStats[cid] = { client_id: cid, client_name: clientMap[cid] || "Unknown", workers: new Set(), wages: 0, days: 0 }; clientStats[cid].workers.add(r.labour_id); clientStats[cid].wages += r.total_pay || 0; clientStats[cid].days++; });
    const clientBreakdown = Object.values(clientStats).map(c => ({ ...c, workers: c.workers.size })).sort((a, b) => b.wages - a.wages);

    const { data: sitesList } = await supabase.from("sites").select("id, name, client_id");
    const siteMap = {}; (sitesList || []).forEach(s => { siteMap[s.id] = { name: s.name, client: clientMap[s.client_id] || "" }; });
    const siteStats = {};
    monthRows.forEach(r => { const sid = r.site_id; if (!siteStats[sid]) siteStats[sid] = { site_id: sid, site_name: siteMap[sid]?.name || "Unknown", client_name: siteMap[sid]?.client || "", wages: 0, days: 0 }; siteStats[sid].wages += r.total_pay || 0; siteStats[sid].days++; });
    const siteBreakdown = Object.values(siteStats).sort((a, b) => b.wages - a.wages).slice(0, 10);

    const labourMap = {}; (labours || []).forEach(l => { labourMap[l.id] = l.name; });
    const labourStats = {};
    monthRows.forEach(r => { const lid = r.labour_id; if (!labourStats[lid]) labourStats[lid] = { labour_id: lid, name: labourMap[lid] || "Unknown", wages: 0, days: 0, hours: 0 }; labourStats[lid].wages += r.total_pay || 0; labourStats[lid].days++; labourStats[lid].hours += r.hours_worked || 0; });
    // Add Sunday auto-pay to each labour's top earner total
    for (const l of (labours || [])) {
      const { autoPay } = await calcSundayAutoPayForMonth(monthStr, l.id, l.daily_wage, attByLabour[l.id] || [], holidayDates, config);
      if (labourStats[l.id]) labourStats[l.id].wages += autoPay;
      else if (autoPay > 0) labourStats[l.id] = { labour_id: l.id, name: labourMap[l.id] || "Unknown", wages: autoPay, days: 0, hours: 0 };
    }
    const topLabours = Object.values(labourStats).sort((a, b) => b.wages - a.wages).slice(0, 10);

    const avgDailyWage = monthRows.length > 0 ? totalWagesMonth / monthRows.length : 0;

    res.json({
      summary: { totalLabours, presentToday, absentToday: totalLabours - presentToday, totalWagesMonth, totalRegularMonth, totalOTMonth, totalHoursMonth, uniqueWorkDays, avgDailyWage, totalAdvancePayment, laboursWithAdvance },
      dailyTrend: trendArray, clientBreakdown, siteBreakdown, topLabours,
    });
  } catch (err) { console.error(err); res.status(500).json({ message: "Internal server error" }); }
});

// ===== Payroll with Incentives =====
router.get("/reports/payroll-with-incentives", async (req, res) => {
  try {
    const { month, format } = req.query;
    if (!month) return res.status(400).json({ message: "month required" });

    const config = await getConfig();
    const { data: labours } = await supabase.from("users").select("id, name, daily_wage, designation").eq("role", "labour").eq("status", "active").order("id");
    const { data: attendance } = await supabase.from("attendance").select("*").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const { data: rules } = await supabase.from("incentive_rules").select("*").eq("active", true);
    const { data: holidays } = await supabase.from("holidays").select("date").gte("date", `${month}-01`).lt("date", nextMonthStart(month));
    const holidayDates = (holidays || []).map(h => h.date);

    const attByLabour = {};
    (attendance || []).forEach(a => {
      if (!attByLabour[a.labour_id]) attByLabour[a.labour_id] = [];
      attByLabour[a.labour_id].push(a);
    });

    const rows = [];
    for (const l of (labours || [])) {
      const recs = attByLabour[l.id] || [];
      const { autoPay } = await calcSundayAutoPayForMonth(month, l.id, l.daily_wage, recs.map(r => r.date), holidayDates, config);
      const base = {
        labour_id: l.id, labour_name: l.name, designation: l.designation || "", daily_wage: l.daily_wage,
        days_worked: recs.length,
        total_hours: recs.reduce((s, r) => s + (r.hours_worked || 0), 0),
        total_regular: recs.reduce((s, r) => s + (r.regular_pay || 0), 0) + autoPay,
        total_ot: recs.reduce((s, r) => s + (r.ot_pay || 0), 0),
        total_pay: recs.reduce((s, r) => s + (r.total_pay || 0), 0) + autoPay,
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

      rows.push({ ...base, incentive: totalIncentive, incentive_details: incentiveDetails, grand_total: base.total_pay + totalIncentive });
    }

    if (format === "xlsx") {
      const XLSX = require("xlsx");
      const data = [["PAYROLL WITH INCENTIVES"], [`Month: ${month}`], [],
        ["Labour ID", "Name", "Designation", "Daily Wage", "Days", "Hours", "Regular", "OT", "Sunday", "Holiday", "Base Pay", "Incentive", "Grand Total"]];
      let grandBase = 0, grandInc = 0;
      rows.forEach(r => {
        grandBase += r.total_pay; grandInc += r.incentive;
        data.push([r.labour_id, r.labour_name, r.designation || "", r.daily_wage, r.days_worked,
          Math.round(r.total_hours * 100) / 100, Math.round(r.total_regular * 100) / 100,
          Math.round(r.total_ot * 100) / 100, r.sunday_days, r.holiday_days,
          Math.round(r.total_pay * 100) / 100, Math.round(r.incentive * 100) / 100,
          Math.round(r.grand_total * 100) / 100]);
      });
      data.push([], ["", "", "", "", "", "", "", "", "", "", "TOTAL", Math.round(grandBase * 100) / 100, Math.round(grandInc * 100) / 100, Math.round((grandBase + grandInc) * 100) / 100]);
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
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