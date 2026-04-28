import React, { useEffect, useMemo, useState } from "react";
import { api, getStoredUser } from "../api";
import { LayoutShell } from "../components/LayoutShell";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Avatar } from "../components/LabourManagement";
import { calculatePayment, calculateSundayAutoPay } from "../utils/calculatePayment";

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency", currency: "AED", minimumFractionDigits: 2,
  }).format(amount || 0);
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getYesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
}

const todayISO = () => toDateStr(new Date());

export function LabourDashboard() {
  const user = getStoredUser();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [config, setConfig] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [todayEntry, setTodayEntry] = useState(null);
  const [yesterdayEntry, setYesterdayEntry] = useState(null);
  const [yesterdayCutoffPassed, setYesterdayCutoffPassed] = useState(false);
  const [dailyWage, setDailyWage] = useState(0);
  const [designation, setDesignation] = useState("");
  const [period, setPeriod] = useState("week");
  const [history, setHistory] = useState([]);
  const [customRange, setCustomRange] = useState({ start: todayISO(), end: todayISO() });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Active tab: "home" | "checkin" | "history"
  const [activeTab, setActiveTab] = useState("home");

  const [checkinFor, setCheckinFor] = useState("today");
  const [form, setForm] = useState({ client_id: "", site_id: "", start_time: "", end_time: "" });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [showCustomRange, setShowCustomRange] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadInitial() {
      try {
        setLoading(true);
        const [dashRes, clientsRes, sitesRes, holidaysRes, configRes] = await Promise.all([
          api.get("/labour/dashboard"),
          api.get("/public/clients"),
          api.get("/public/sites"),
          api.get("/public/holidays"),
          api.get("/public/config"),
        ]);
        if (!active) return;
        setSummary(dashRes.data);
        setClients(clientsRes.data || []);
        setSites(sitesRes.data || []);
        setHolidays(holidaysRes.data || []);

        const cfg = {};
        Object.entries(configRes.data || {}).forEach(([k, v]) => {
          cfg[k] = v.value ?? v;
        });
        setConfig(cfg);

        setTodayEntry(dashRes.data.todayEntry || null);
        setYesterdayEntry(dashRes.data.yesterday || null);
        setYesterdayCutoffPassed(dashRes.data.yesterdayCutoffPassed || false);
        setDailyWage(dashRes.data.dailyWage || 0);
        setDesignation(dashRes.data.designation || "");

        if (dashRes.data.todayEntry && !dashRes.data.yesterday && !dashRes.data.yesterdayCutoffPassed) {
          setCheckinFor("yesterday");
        }
      } catch (err) {
        console.error("Error loading initial data:", err);
        setClients([]); setSites([]); setHolidays([]);
        setConfig({ regular_hours: "10", helper_ot_rate: "3", non_helper_ot_rate: "4", sunday_ot_multiplier: "1.5" });
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInitial();
    return () => { active = false; };
  }, []);

  useEffect(() => { loadHistory(); }, [period, customRange.start, customRange.end]);

  async function loadHistory() {
    try {
      setHistoryLoading(true);
      let url = `/labour/attendance?period=${period}`;
      if (period === "custom") url += `&start=${customRange.start}&end=${customRange.end}`;
      const res = await api.get(url);
      setHistory(res.data || []);
    } catch (err) {
      console.error(err); setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  const availableSites = useMemo(() => {
    if (!form.client_id || !sites.length) return [];
    return sites.filter((s) => String(s.client_id) === String(form.client_id));
  }, [form.client_id, sites]);

  const checkinDate = checkinFor === "yesterday" ? getYesterdayISO() : todayISO();
  const currentDateEntry = checkinFor === "yesterday" ? yesterdayEntry : todayEntry;

  const estimatedPay = useMemo(() => {
    if (!form.start_time || !form.end_time || !config || !holidays) return null;
    try {
      return calculatePayment(dailyWage, form.start_time, form.end_time, checkinDate, holidays, config, designation);
    } catch (err) { return null; }
  }, [form.start_time, form.end_time, dailyWage, holidays, config, checkinDate, designation]);

  function getHoursWorked(startTime, endTime) {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    return (endMin - startMin) / 60;
  }

  function validateForm() {
    const errors = {};
    if (!form.client_id) errors.client_id = "Client is required";
    if (!form.site_id) errors.site_id = "Site is required";
    if (!form.start_time) errors.start_time = "Start time is required";
    if (!form.end_time) errors.end_time = "End time is required";
    if (form.start_time && form.end_time) {
      const hw = getHoursWorked(form.start_time, form.end_time);
      if (hw === 0) errors.end_time = "Start and end time cannot be the same";
      if (hw > 18) errors.end_time = "Cannot exceed 18 hours";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (currentDateEntry) {
      setToast(`⚠ Attendance for ${checkinFor === "yesterday" ? "yesterday" : "today"} already submitted`);
      setTimeout(() => setToast(""), 3000);
      return;
    }
    if (!validateForm()) return;
    try {
      setSubmitting(true);
      const payload = { client_id: Number(form.client_id), site_id: Number(form.site_id), start_time: form.start_time, end_time: form.end_time, date: checkinDate };
      const res = await api.post("/labour/checkin", payload);
      if (checkinFor === "yesterday") { setYesterdayEntry(res.data); } else { setTodayEntry(res.data); }
      setToast(`✓ Check-in for ${checkinFor === "yesterday" ? "yesterday" : "today"} submitted!`);
      setTimeout(() => setToast(""), 3000);
      setForm({ client_id: "", site_id: "", start_time: "", end_time: "" });
      loadHistory();
      // Switch to home tab after successful submission
      setActiveTab("home");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to submit. Please try again.";
      setToast("⚠ " + msg);
      setTimeout(() => setToast(""), 5000);
    } finally {
      setSubmitting(false);
    }
  }

  const isNightShift = useMemo(() => {
    if (!form.start_time || !form.end_time) return false;
    const [sh] = form.start_time.split(":").map(Number);
    const [eh] = form.end_time.split(":").map(Number);
    return (eh * 60) <= (sh * 60);
  }, [form.start_time, form.end_time]);

  if (loading) return <LayoutShell title="Attendance & Earnings"><LoadingSpinner label="Loading..." /></LayoutShell>;

  const canCheckYesterday = !yesterdayEntry && !yesterdayCutoffPassed;
  const canCheckToday = !todayEntry;
  const canCheckin = !currentDateEntry;
  const needsCheckin = canCheckToday || canCheckYesterday;

  // ===================== TAB: HOME =====================
  function renderHome() {
    const ms = summary?.monthSummary;
    const totalEarn = ms?.totalEarnings || 0;
    const regPay = ms?.regularPay || 0;
    const otPay = ms?.otPay || 0;
    const otPercent = totalEarn > 0 ? Math.round((otPay / totalEarn) * 100) : 0;
    const regPercent = totalEarn > 0 ? 100 - otPercent : 0;

    return (
      <div className="space-y-4">
        {/* Big Monthly Earnings */}
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg p-5 text-white text-center">
          <p className="text-xs font-medium opacity-80">This Month's Earnings</p>
          <p className="text-3xl font-black mt-1">{formatCurrency(totalEarn)}</p>
          <p className="text-xs opacity-70 mt-1">{ms?.daysWorked || 0} days worked</p>
        </div>

        {/* OT Highlight Card - the money motivator */}
        {otPay > 0 && (
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl shadow-lg p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">🔥</div>
              <div>
                <p className="text-xs font-medium opacity-90">Overtime — Extra Income Earned</p>
                <p className="text-2xl font-black">{formatCurrency(otPay)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Simple Earnings Bar */}
        {totalEarn > 0 && (
          <div className="bg-white rounded-2xl shadow-md p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">💰 Pay Breakdown</h3>
            {/* Visual bar */}
            <div className="h-8 rounded-full overflow-hidden flex bg-gray-100 mb-3">
              {regPercent > 0 && <div style={{ width: `${regPercent}%` }} className="bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold transition-all">{regPercent > 15 && `${regPercent}%`}</div>}
              {otPercent > 0 && <div style={{ width: `${otPercent}%` }} className="bg-orange-500 flex items-center justify-center text-[10px] text-white font-bold transition-all">{otPercent > 10 && `${otPercent}%`}</div>}
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2.5 bg-blue-50 rounded-xl p-3">
                <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-500">Regular</p>
                  <p className="text-sm font-bold text-blue-700">{formatCurrency(regPay)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-orange-50 rounded-xl p-3">
                <div className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-gray-500">Overtime</p>
                  <p className="text-sm font-bold text-orange-600">{formatCurrency(otPay)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Check-In Prompt — FIRST so they see it immediately */}
        {needsCheckin && (
          <button onClick={() => setActiveTab("checkin")}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white rounded-2xl p-4 shadow-lg text-left active:scale-[0.98] transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-base">📋 Mark Attendance</div>
                <div className="text-xs opacity-90 mt-0.5">
                  {canCheckToday && canCheckYesterday ? "Today & Yesterday available" :
                   canCheckToday ? "Submit for today" : "Submit for yesterday"}
                </div>
              </div>
              <div className="text-3xl">→</div>
            </div>
          </button>
        )}

        {/* Yesterday + Today quick status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5">
            <p className="text-[10px] text-gray-400 font-medium">Yesterday</p>
            {yesterdayEntry ? (
              <>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(yesterdayEntry.total_pay)}</p>
                <p className="text-[10px] text-gray-500">{yesterdayEntry.hours_worked}h • {yesterdayEntry.admin_verified ? "✅ Verified" : "⏳ Pending"}</p>
                {yesterdayEntry.ot_pay > 0 && <p className="text-[10px] text-orange-500 font-semibold mt-0.5">+{formatCurrency(yesterdayEntry.ot_pay)} OT</p>}
              </>
            ) : yesterdayCutoffPassed ? (
              <p className="text-sm text-red-400 mt-1">Absent</p>
            ) : (
              <p className="text-sm text-gray-400 mt-1">Not submitted</p>
            )}
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5">
            <p className="text-[10px] text-gray-400 font-medium">Today</p>
            {todayEntry ? (
              <>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(todayEntry.total_pay)}</p>
                <p className="text-[10px] text-gray-500">{todayEntry.hours_worked}h</p>
                {todayEntry.ot_pay > 0 && <p className="text-[10px] text-orange-500 font-semibold mt-0.5">+{formatCurrency(todayEntry.ot_pay)} OT</p>}
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-1">Not yet</p>
            )}
          </div>
        </div>

        {/* Advance Payment */}
        {summary?.advancePayment > 0 && (
          <div className="bg-red-50 rounded-2xl border border-red-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-red-600">💸 Advance Payment</p>
                <p className="text-lg font-bold text-red-700 mt-0.5">AED {Number(summary.advancePayment).toLocaleString()}</p>
              </div>
            </div>
            {summary.advanceHistory && summary.advanceHistory.length > 0 && (
              <div className="mt-3 pt-3 border-t border-red-200/60 space-y-1.5">
                {summary.advanceHistory.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-red-600 font-medium">AED {Number(r.amount).toLocaleString()}</span>
                    <span className="text-red-400">{new Date(r.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sunday/Holiday info */}
        {(ms?.sundayDays > 0 || ms?.holidayDays > 0) && (
          <div className="bg-purple-50 rounded-2xl border border-purple-200 p-3.5">
            <div className="flex items-center gap-3">
              <span className="text-xl">📅</span>
              <div className="text-xs text-purple-700">
                {ms.sundayDays > 0 && <span className="font-semibold">{ms.sundayDays} Sundays</span>}
                {ms.sundayDays > 0 && ms.holidayDays > 0 && " + "}
                {ms.holidayDays > 0 && <span className="font-semibold">{ms.holidayDays} Holidays</span>}
                <span className="text-purple-500"> worked this month</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===================== TAB: CHECK-IN =====================
  function renderCheckin() {
    // Both submitted
    if (todayEntry && (yesterdayEntry || yesterdayCutoffPassed)) {
      return (
        <div className="bg-white rounded-2xl shadow-md p-6 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">All Done!</h3>
          <p className="text-sm text-gray-500">Today & yesterday attendance submitted.</p>
          <p className="text-xs text-gray-400 mt-2">Contact admin for any changes.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Date Toggle */}
        <div className="flex gap-2">
          <button onClick={() => setCheckinFor("today")} disabled={!canCheckToday}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
              checkinFor === "today" ? "bg-blue-600 text-white shadow-md" :
              canCheckToday ? "bg-gray-100 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}>
            Today {todayEntry && "✓"}
          </button>
          <button onClick={() => setCheckinFor("yesterday")} disabled={!canCheckYesterday}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
              checkinFor === "yesterday" ? "bg-blue-600 text-white shadow-md" :
              canCheckYesterday ? "bg-gray-100 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}>
            Yesterday {yesterdayEntry ? "✓" : yesterdayCutoffPassed ? "✗" : ""}
          </button>
        </div>

        {/* Date Badge */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-sm text-blue-800 text-center">
          Submitting for: <strong>{checkinDate}</strong>
          {checkinFor === "yesterday" && <span className="text-xs text-blue-600 block mt-0.5">Missed yesterday's check-in</span>}
        </div>

        {/* Form */}
        {canCheckin ? (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-md p-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Client <span className="text-red-500">*</span></label>
              <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value, site_id: "" }))}>
                <option value="">Select client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {formErrors.client_id && <p className="text-xs text-red-600 mt-1">{formErrors.client_id}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Site <span className="text-red-500">*</span></label>
              <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
                value={form.site_id} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))} disabled={!form.client_id}>
                <option value="">{form.client_id ? "Select site" : "Select client first"}</option>
                {availableSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {formErrors.site_id && <p className="text-xs text-red-600 mt-1">{formErrors.site_id}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time</label>
                <input type="time" className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
                {formErrors.start_time && <p className="text-xs text-red-600 mt-1">{formErrors.start_time}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time</label>
                <input type="time" className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
                {formErrors.end_time && <p className="text-xs text-red-600 mt-1">{formErrors.end_time}</p>}
              </div>
            </div>

            {isNightShift && form.start_time && form.end_time && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-800">
                🌙 Night shift: {form.start_time} → {form.end_time} (next day) = {getHoursWorked(form.start_time, form.end_time).toFixed(1)}h
              </div>
            )}

            {estimatedPay && estimatedPay.totalPay > 0 && (
              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 text-center">
                <div className="text-xs text-green-600 font-semibold mb-1">ESTIMATED PAY</div>
                <div className="text-2xl font-bold text-green-800">{formatCurrency(estimatedPay.totalPay)}</div>
                <div className="text-xs text-green-700 mt-1">
                  {estimatedPay.hoursWorked}h • Regular: {formatCurrency(estimatedPay.regularPay)} • OT: {formatCurrency(estimatedPay.otPay)}
                  {estimatedPay.isSunday && " • Sunday"}{estimatedPay.isHoliday && " • Holiday"}
                </div>
              </div>
            )}

            <button type="submit" disabled={submitting}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all text-base disabled:opacity-50">
              {submitting ? "Submitting..." : `Submit for ${checkinFor === "yesterday" ? "Yesterday" : "Today"}`}
            </button>
          </form>
        ) : (
          <div className="bg-white rounded-2xl shadow-md p-6 text-center">
            <p className="text-gray-500 text-sm">Attendance for {checkinFor} already submitted ✓</p>
          </div>
        )}
      </div>
    );
  }

  // ===================== TAB: HISTORY =====================
  function renderHistory() {
    const attendanceRecords = history ? [...history].sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
    const attendanceDateSet = new Set(attendanceRecords.map(r => r.date));

    // Build Sunday/Holiday rest pay entries for the selected period
    const sundayEntries = [];
    if (config && summary?.dailyWage) {
      let periodStart, periodEnd;
      const uaeToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
      if (period === "week") {
        const d = new Date(); d.setDate(d.getDate() - 7);
        periodStart = d.toISOString().slice(0, 10); periodEnd = uaeToday;
      } else if (period === "month") {
        const now = new Date();
        periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        periodEnd = uaeToday;
      } else if (period === "custom" && customRange.start && customRange.end) {
        periodStart = customRange.start; periodEnd = customRange.end;
      }
      if (periodStart && periodEnd) {
        const start = new Date(periodStart);
        const end = new Date(periodEnd);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const ds = d.toISOString().slice(0, 10);
          const isSun = d.getDay() === 0;
          const isHol = (holidays || []).some(h => h.date === ds);
          if ((isSun || isHol) && !attendanceDateSet.has(ds)) {
            const restPay = calculateSundayAutoPay(summary.dailyWage, ds, config);
            sundayEntries.push({
              id: `sunday-${ds}`,
              date: ds,
              is_sunday_rest: true,
              is_sunday: isSun,
              is_holiday: isHol,
              regular_pay: restPay,
              ot_pay: 0,
              total_pay: restPay,
              hours_worked: 0,
              client_name: isSun ? "Sunday Rest Day" : "Holiday Rest Day",
            });
          }
        }
      }
    }

    // Merge and sort all entries (attendance + Sunday rest) newest first
    const sorted = [...attendanceRecords, ...sundayEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalPay = sorted.reduce((s, r) => s + (r.total_pay || 0), 0);
    const totalOT = sorted.reduce((s, r) => s + (r.ot_pay || 0), 0);

    return (
      <div className="space-y-4">
        {/* Period Filter */}
        <div className="flex gap-2">
          {["week", "month", "custom"].map((p) => (
            <button key={p} onClick={() => { setPeriod(p); setShowCustomRange(p === "custom"); }}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                period === p ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-700"
              }`}>
              {p === "week" ? "7 Days" : p === "month" ? "Month" : "Custom"}
            </button>
          ))}
        </div>

        {showCustomRange && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">From</label><input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={customRange.start} onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))} /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">To</label><input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={customRange.end} onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))} /></div>
          </div>
        )}

        {historyLoading ? (
          <div className="py-8"><LoadingSpinner label="Loading..." /></div>
        ) : sorted.length > 0 ? (
          <>
            {/* Period Summary */}
            <div className="bg-white rounded-2xl shadow-md p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-800">{sorted.length} Days</span>
                <span className="text-lg font-black text-green-600">{formatCurrency(totalPay)}</span>
              </div>
              {totalOT > 0 && (
                <div className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2">
                  <span className="text-base">🔥</span>
                  <span className="text-xs text-orange-700 font-semibold">OT earned: {formatCurrency(totalOT)}</span>
                </div>
              )}
            </div>

            {/* Day-by-day Records */}
            <div className="space-y-2">
              {sorted.map((record) => (
                <div key={record.id} onClick={() => !record.is_sunday_rest && setSelectedRecord(record)} className={`bg-white rounded-xl shadow-sm border p-3.5 ${record.is_sunday_rest ? "border-purple-200 bg-purple-50/50" : "border-gray-100 active:bg-gray-50 cursor-pointer"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">
                          {new Date(record.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", weekday: "short" })}
                        </span>
                        {record.is_sunday_rest ? (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-semibold">📅 Rest Day</span>
                        ) : (
                          <>
                            {(record.is_sunday || record.is_holiday) && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-semibold">{record.is_sunday ? "Sun" : "Holiday"}</span>}
                            {record.admin_verified && <span className="text-xs text-green-500">✅</span>}
                          </>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {record.is_sunday_rest ? (
                          <span className="text-purple-600 font-medium">{record.client_name}</span>
                        ) : (
                          <>{record.client_name} • {record.hours_worked}h • {record.start_time}-{record.end_time}</>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className={`text-base font-bold ${record.is_sunday_rest ? "text-purple-600" : "text-green-600"}`}>{formatCurrency(record.total_pay)}</p>
                      {record.ot_pay > 0 && !record.is_sunday_rest && <p className="text-[10px] font-semibold text-orange-500">+{formatCurrency(record.ot_pay)} OT 🔥</p>}
                    </div>
                  </div>
                  {/* Mini OT bar if there's OT */}
                  {record.ot_pay > 0 && record.total_pay > 0 && !record.is_sunday_rest && (
                    <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden flex">
                      <div style={{ width: `${Math.round((record.regular_pay / record.total_pay) * 100)}%` }} className="bg-blue-400 rounded-full" />
                      <div style={{ width: `${Math.round((record.ot_pay / record.total_pay) * 100)}%` }} className="bg-orange-400 rounded-full" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Record Detail Popup */}
            {selectedRecord && (
              <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setSelectedRecord(null)}>
                <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b bg-gray-50 sm:rounded-t-2xl rounded-t-2xl flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">
                        {new Date(selectedRecord.date).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">{selectedRecord.client_name} • {selectedRecord.site_name || ""}</p>
                    </div>
                    <button onClick={() => setSelectedRecord(null)} className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-lg">×</button>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                      <div className="text-xs text-green-600 font-medium">Total Earnings</div>
                      <div className="text-2xl font-bold text-green-700">{formatCurrency(selectedRecord.total_pay)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-center">
                        <div className="text-[10px] text-blue-500 font-medium">Regular Pay</div>
                        <div className="text-sm font-bold text-blue-700">{formatCurrency(selectedRecord.regular_pay)}</div>
                      </div>
                      <div className="bg-orange-50 border border-orange-100 rounded-lg p-2.5 text-center">
                        <div className="text-[10px] text-orange-500 font-medium">🔥 OT Pay</div>
                        <div className="text-sm font-bold text-orange-600">{formatCurrency(selectedRecord.ot_pay)}</div>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Shift</span><span className="font-medium">{selectedRecord.start_time} - {selectedRecord.end_time}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Hours</span><span className="font-medium">{selectedRecord.hours_worked}h</span></div>
                      {selectedRecord.is_sunday && <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-medium text-purple-600">☀️ Sunday (1.5x OT)</span></div>}
                      {selectedRecord.is_holiday && <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-medium text-purple-600">🎉 Holiday</span></div>}
                      <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={`font-medium ${selectedRecord.admin_verified ? "text-green-600" : "text-amber-500"}`}>{selectedRecord.admin_verified ? "✅ Verified" : "⏳ Pending"}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center">
            <p className="text-gray-500 text-sm">No records for this period.</p>
          </div>
        )}
      </div>
    );
  }

  // ===================== MAIN RENDER =====================
  return (
    <LayoutShell title="WorkTrack" designation={designation} photoUrl={summary?.photoUrl}>
      <div className="w-full max-w-lg mx-auto pb-20">
        {/* Toast */}
        {toast && (
          <div className={`mb-4 text-sm font-medium rounded-xl px-4 py-3 shadow-lg ${
            toast.startsWith("✓") ? "bg-green-50 text-green-800 border border-green-200" : "bg-amber-50 text-amber-800 border border-amber-200"
          }`}>{toast}</div>
        )}

        {/* Tab Content */}
        {activeTab === "home" && renderHome()}
        {activeTab === "checkin" && renderCheckin()}
        {activeTab === "history" && renderHistory()}
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] z-50">
        <div className="max-w-lg mx-auto flex">
          {[
            { id: "home", label: "Home", icon: (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            )},
            { id: "checkin", label: "Check-In", badge: needsCheckin, icon: (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )},
            { id: "history", label: "History", icon: (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )},
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center py-2.5 relative transition-colors ${
                activeTab === tab.id ? "text-blue-600" : "text-gray-400"
              }`}>
              <div className="relative">
                {tab.icon}
                {tab.badge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                )}
              </div>
              <span className="text-[10px] font-semibold mt-0.5">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </LayoutShell>
  );
}