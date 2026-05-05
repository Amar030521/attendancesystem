const express = require("express");
const { authMiddleware, requireRole } = require("../middleware/auth");
const { supabase } = require("../db");
const { calculatePayment, calculateSundayAutoPay } = require("../utils/calculatePayment");
const { uaeNow, uaeToday, uaeYesterday, uaeDateStr } = require("../utils/uaeTime");

const router = express.Router();
router.use(authMiddleware, requireRole("labour"));

async function getSalaryOnDate(labourId, targetDate) {
  const { data: historyEntry } = await supabase
    .from("salary_history").select("salary").eq("labour_id", labourId)
    .lte("effective_date", targetDate).order("effective_date", { ascending: false }).limit(1).single();
  if (historyEntry) return Number(historyEntry.salary);
  const { data: user } = await supabase.from("users").select("daily_wage").eq("id", labourId).single();
  return user ? Number(user.daily_wage) : 0;
}

async function getSalaryMapForDates(labourId, dates) {
  if (!dates || dates.length === 0) return {};
  const { data: history } = await supabase.from("salary_history").select("salary, effective_date")
    .eq("labour_id", labourId).order("effective_date", { ascending: true });
  if (!history || history.length === 0) {
    const { data: user } = await supabase.from("users").select("daily_wage").eq("id", labourId).single();
    const wage = user ? Number(user.daily_wage) : 0;
    const map = {}; dates.forEach(d => { map[d] = wage; }); return map;
  }
  const map = {};
  dates.forEach(d => {
    let salary = Number(history[0].salary);
    for (const entry of history) { if (entry.effective_date <= d) salary = Number(entry.salary); else break; }
    map[d] = salary;
  });
  return map;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextMonthStart(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Get Sundays and holidays in a month that DON'T have attendance.
 * Returns { autoPay, autoPayDays }
 */
function getSundaysAndHolidaysInMonth(monthStr, holidayDates) {
  const [y, m] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y, m - 1, day);
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (d.getDay() === 0 || (holidayDates || []).includes(dateStr)) {
      dates.push(dateStr);
    }
  }
  return dates;
}

async function calcSundayAutoPayForMonth(monthStr, labourId, dailyWageFallback, attendanceDates, holidayDates, config) {
  const allSundaysHolidays = getSundaysAndHolidaysInMonth(monthStr, holidayDates);
  const attendedSet = new Set(attendanceDates);
  const unattendedDates = allSundaysHolidays.filter(d => !attendedSet.has(d));
  if (unattendedDates.length === 0) return { autoPay: 0, autoPayDays: 0 };
  const salaryMap = await getSalaryMapForDates(labourId, unattendedDates);
  let autoPay = 0, autoPayDays = 0;
  for (const dateStr of unattendedDates) {
    const wage = salaryMap[dateStr] || dailyWageFallback;
    autoPay += calculateSundayAutoPay(wage, dateStr, config);
    autoPayDays++;
  }
  return { autoPay: Math.round(autoPay * 100) / 100, autoPayDays };
}

// GET /api/labour/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const labourId = req.user.id;
    const uae = uaeNow();
    const yesterday = uaeYesterday();
    const today = uaeToday();
    const monthStr = `${uae.year}-${String(uae.month).padStart(2, "0")}`;
    const monthStart = `${monthStr}-01`;

    const { data: userInfo } = await supabase.from("users").select("designation, daily_wage, photo_url").eq("id", labourId).single();

    // Get advance payment total from advance_payments table
    const { data: advRows } = await supabase.from("advance_payments").select("amount, date, notes").eq("labour_id", labourId).order("date", { ascending: false });
    const totalAdvance = (advRows || []).reduce((s, r) => s + (r.amount || 0), 0);

    // Get daily adjustments (incentives & deductions) for current month
    const { data: adjRows } = await supabase.from("daily_adjustments").select("id, type, amount, date, remarks")
      .eq("labour_id", labourId).gte("date", `${monthStr}-01`).lt("date", nextMonthStart(monthStr)).order("date", { ascending: false });
    const monthIncentives = (adjRows || []).filter(r => r.type === "incentive").reduce((s, r) => s + Number(r.amount), 0);
    const monthDeductions = (adjRows || []).filter(r => r.type === "deduction").reduce((s, r) => s + Number(r.amount), 0);

    const { data: yesterdayAtt } = await supabase
      .from("attendance").select("*, clients(name), sites(name)")
      .eq("labour_id", labourId).eq("date", yesterday).single();

    const { data: todayAtt } = await supabase
      .from("attendance").select("*, clients(name), sites(name)")
      .eq("labour_id", labourId).eq("date", today).single();

    const { data: monthRows } = await supabase
      .from("attendance").select("total_pay, regular_pay, ot_pay, is_sunday, is_holiday, date")
      .eq("labour_id", labourId).gte("date", monthStart);

    const mr = monthRows || [];

    // Calculate Sunday auto-pay for unattended Sundays/holidays
    const { data: cfgRows } = await supabase.from("config").select("key, value");
    const config = {}; (cfgRows || []).forEach(r => { config[r.key] = r.value; });
    const { data: holidays } = await supabase.from("holidays").select("date").gte("date", monthStart).lt("date", `${uae.year}-${String(uae.month + 1).padStart(2, "0")}-01`);
    const holidayDates = (holidays || []).map(h => h.date);
    const attendanceDates = mr.map(r => r.date);
    const { autoPay, autoPayDays } = await calcSundayAutoPayForMonth(monthStr, labourId, userInfo?.daily_wage || 0, attendanceDates, holidayDates, config);

    const monthSummary = {
      daysWorked: mr.length,
      totalEarnings: mr.reduce((s, r) => s + (r.total_pay || 0), 0) + autoPay,
      regularPay: mr.reduce((s, r) => s + (r.regular_pay || 0), 0) + autoPay,
      otPay: mr.reduce((s, r) => s + (r.ot_pay || 0), 0),
      sundayDays: mr.filter(r => r.is_sunday).length,
      holidayDays: mr.filter(r => r.is_holiday).length,
      sundayAutoPay: autoPay,
      sundayAutoPayDays: autoPayDays,
    };

    const flattenAtt = (a) => a ? { ...a, client_name: a.clients?.name, site_name: a.sites?.name, clients: undefined, sites: undefined } : null;

    // Check if yesterday's cutoff has passed
    const cutoffHour = parseInt(config.cutoff_hour || "16", 10);
    const cutoffMinute = parseInt(config.cutoff_minute || "30", 10);
    const currentHour = uae.hours;
    const currentMinute = uae.minutes;
    const yesterdayCutoffPassed = (currentHour > cutoffHour) || (currentHour === cutoffHour && currentMinute >= cutoffMinute);

    return res.json({
      designation: userInfo?.designation || null,
      dailyWage: userInfo?.daily_wage || 0,
      photoUrl: userInfo?.photo_url || null,
      advancePayment: Math.round(totalAdvance * 100) / 100,
      advanceHistory: advRows || [],
      adjustments: adjRows || [],
      monthIncentives: Math.round(monthIncentives * 100) / 100,
      monthDeductions: Math.round(monthDeductions * 100) / 100,
      yesterday: flattenAtt(yesterdayAtt),
      todayEntry: flattenAtt(todayAtt),
      monthSummary,
      yesterdayCutoffPassed,
    });
  } catch (err) { console.error("Labour dashboard error:", err); return res.status(500).json({ message: "Internal server error" }); }
});

// GET /api/labour/attendance
router.get("/attendance", async (req, res) => {
  try {
    const labourId = req.user.id;
    const { period = "week", start, end } = req.query;
    const todayStr = uaeToday();
    const uae = uaeNow();

    let startDate, endDate;
    if (period === "week") {
      const w = new Date(); w.setDate(w.getDate() - 7);
      startDate = uaeDateStr(w); endDate = todayStr;
    } else if (period === "month") {
      startDate = `${uae.year}-${String(uae.month).padStart(2, "0")}-01`;
      endDate = todayStr;
    } else if (period === "custom") {
      if (!start || !end) return res.status(400).json({ message: "Start and end required for custom period" });
      startDate = start; endDate = end;
    } else {
      startDate = start; endDate = end;
    }

    const { data } = await supabase
      .from("attendance").select("*, clients(name), sites(name)")
      .eq("labour_id", labourId).gte("date", startDate).lte("date", endDate)
      .order("date", { ascending: false });

    const rows = (data || []).map(a => ({ ...a, client_name: a.clients?.name, site_name: a.sites?.name, clients: undefined, sites: undefined }));

    // Also fetch adjustments for this period
    const { data: adjData } = await supabase.from("daily_adjustments").select("id, type, amount, date, remarks")
      .eq("labour_id", labourId).gte("date", startDate).lte("date", endDate).order("date", { ascending: false });

    return res.json({ attendance: rows, adjustments: adjData || [] });
  } catch (err) { console.error("Labour attendance error:", err); return res.status(500).json({ message: "Internal server error" }); }
});

// Night-shift-aware validation
function validateTimes(startTime, endTime) {
  const sParts = startTime.split(":").map((v) => parseInt(v, 10));
  const eParts = endTime.split(":").map((v) => parseInt(v, 10));
  if (sParts.length !== 2 || eParts.length !== 2) return "Invalid time format";
  if (isNaN(sParts[0]) || isNaN(sParts[1]) || isNaN(eParts[0]) || isNaN(eParts[1])) return "Invalid time format";

  let startMin = sParts[0] * 60 + sParts[1];
  let endMin = eParts[0] * 60 + eParts[1];
  if (endMin <= startMin) endMin += 24 * 60;
  const hw = (endMin - startMin) / 60;
  if (hw === 0) return "Start and end time cannot be the same";
  if (hw > 18) return "Working hours cannot exceed 18 hours";
  return null;
}

// POST /api/labour/checkin
router.post("/checkin", async (req, res) => {
  try {
    const labourId = req.user.id;
    const { client_id, site_id, start_time, end_time, date, notes } = req.body;
    if (!client_id || !site_id || !start_time || !end_time) {
      return res.status(400).json({ message: "Client, site, start time and end time are required" });
    }

    const now = new Date();
    const today = uaeToday();
    const yesterday = uaeYesterday();

    let workDate = date || today;
    if (workDate !== today && workDate !== yesterday) {
      const submitted = new Date(workDate);
      const diffDays = Math.floor((now - submitted) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return res.status(400).json({ message: "Cannot submit future dates" });
      if (diffDays > 1) return res.status(400).json({ message: "Can only submit for today or yesterday" });
    }

    // Block yesterday's submission after cutoff time
    if (workDate === yesterday) {
      const { data: cfgRows } = await supabase.from("config").select("key, value");
      const cfg = {}; (cfgRows || []).forEach(r => { cfg[r.key] = r.value; });
      const cutoffH = parseInt(cfg.cutoff_hour || "16", 10);
      const cutoffM = parseInt(cfg.cutoff_minute || "30", 10);
      const uae = uaeNow();
      if (uae.hours > cutoffH || (uae.hours === cutoffH && uae.minutes >= cutoffM)) {
        return res.status(400).json({ message: "Yesterday's cutoff time (4:30 PM) has passed. Contact admin to mark your attendance." });
      }
    }

    // Duplicate check
    const { data: dup } = await supabase.from("attendance").select("id").eq("labour_id", labourId).eq("date", workDate).single();
    if (dup) return res.status(400).json({ message: `Attendance for ${workDate} already exists` });

    // Validate times
    const validationError = validateTimes(start_time, end_time);
    if (validationError) return res.status(400).json({ message: validationError });

    // Get config, holidays, wage
    const { data: cfgRows } = await supabase.from("config").select("key, value");
    const config = {}; (cfgRows || []).forEach(r => { config[r.key] = r.value; });
    const { data: holidays } = await supabase.from("holidays").select("date");
    const { data: labour } = await supabase.from("users").select("daily_wage, designation").eq("id", labourId).single();
    const salary = await getSalaryOnDate(labourId, workDate);
    if (!salary || salary <= 0) return res.status(400).json({ message: "Labour wage must be a positive number" });

    const result = calculatePayment(salary, start_time, end_time, workDate, holidays || [], config, labour?.designation);

    const { data: inserted, error } = await supabase.from("attendance").insert({
      labour_id: labourId, date: workDate, client_id, site_id, start_time, end_time,
      hours_worked: result.hoursWorked, regular_pay: result.regularPay, ot_pay: result.otPay, total_pay: result.totalPay,
      is_sunday: result.isSunday, is_holiday: result.isHoliday, notes: notes || null,
    }).select("*, clients(name), sites(name)").single();

    if (error) return res.status(400).json({ message: error.message });
    return res.status(201).json({ ...inserted, client_name: inserted.clients?.name, site_name: inserted.sites?.name });
  } catch (err) { console.error("Labour checkin error:", err); return res.status(500).json({ message: "Internal server error" }); }
});

// GET /api/labour/reports
router.get("/reports", async (req, res) => {
  try {
    const labourId = req.user.id;
    const { month } = req.query;
    const baseDate = month ? new Date(`${month}-01`) : new Date();
    const yyyy = baseDate.getFullYear(), mm = String(baseDate.getMonth() + 1).padStart(2, "0");
    const nextMo = new Date(yyyy, baseDate.getMonth() + 1, 1);
    const nextMoStr = `${nextMo.getFullYear()}-${String(nextMo.getMonth() + 1).padStart(2, "0")}-01`;

    const { data } = await supabase
      .from("attendance").select("*, clients(name), sites(name), users(name)")
      .eq("labour_id", labourId).gte("date", `${yyyy}-${mm}-01`).lt("date", nextMoStr)
      .order("date", { ascending: true });

    const rows = (data || []).map(a => ({ ...a, client_name: a.clients?.name, site_name: a.sites?.name, labour_name: a.users?.name }));
    return res.json({ labourId, month: `${yyyy}-${mm}`, records: rows });
  } catch (err) { console.error("Labour reports error:", err); return res.status(500).json({ message: "Internal server error" }); }
});

module.exports = router;