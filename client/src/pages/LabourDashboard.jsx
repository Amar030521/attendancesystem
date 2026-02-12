import React, { useEffect, useMemo, useState } from "react";
import { api, getStoredUser } from "../api";
import { LayoutShell } from "../components/LayoutShell";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { calculatePayment } from "../utils/calculatePayment";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, ArcElement,
  Title, Tooltip, Legend, Filler
} from "chart.js";
import { Line, Pie } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

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

  const lineChartData = useMemo(() => {
    try {
      if (!history || history.length === 0) return null;
      const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
      return {
        labels: sorted.map((h) => { const d = new Date(h.date); return `${d.getDate()}/${d.getMonth() + 1}`; }),
        datasets: [{ label: "Daily Earnings (AED)", data: sorted.map((h) => h.total_pay || 0), borderColor: "rgb(34, 197, 94)", backgroundColor: "rgba(34, 197, 94, 0.1)", tension: 0.3, fill: true }],
      };
    } catch { return null; }
  }, [history]);

  const pieChartData = useMemo(() => {
    try {
      if (!history || history.length === 0) return null;
      const totalRegular = history.reduce((s, h) => s + (h.regular_pay || 0), 0);
      const totalOT = history.reduce((s, h) => s + (h.ot_pay || 0), 0);
      if (totalRegular === 0 && totalOT === 0) return null;
      return {
        labels: ["Regular Pay", "Overtime Pay"],
        datasets: [{ data: [totalRegular, totalOT], backgroundColor: ["rgb(59, 130, 246)", "rgb(249, 115, 22)"], borderWidth: 2, borderColor: "#fff" }],
      };
    } catch { return null; }
  }, [history]);

  if (loading) return <LayoutShell title="Attendance & Earnings"><LoadingSpinner label="Loading..." /></LayoutShell>;

  const canCheckYesterday = !yesterdayEntry && !yesterdayCutoffPassed;
  const canCheckToday = !todayEntry;
  const canCheckin = !currentDateEntry;
  const needsCheckin = canCheckToday || canCheckYesterday;

  // ===================== TAB: HOME =====================
  function renderHome() {
    return (
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-4 text-white">
            <h2 className="text-xs font-medium opacity-90 mb-1">Yesterday</h2>
            {yesterdayEntry ? (
              <>
                <div className="text-xl font-bold">{formatCurrency(yesterdayEntry.total_pay)}</div>
                <p className="text-[10px] opacity-80 mt-0.5">{yesterdayEntry.hours_worked}h • {yesterdayEntry.admin_verified ? "Verified ✓" : "Pending"}</p>
              </>
            ) : yesterdayCutoffPassed ? (
              <>
                <div className="text-base font-bold opacity-90">Absent</div>
                <p className="text-[10px] opacity-70">Cutoff passed</p>
              </>
            ) : (
              <div className="text-sm opacity-75 mt-1">Not submitted</div>
            )}
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-4 text-white">
            <h2 className="text-xs font-medium opacity-90 mb-1">This Month</h2>
            <div className="text-xl font-bold">{formatCurrency(summary?.monthSummary?.totalEarnings || 0)}</div>
            <p className="text-[10px] opacity-80 mt-0.5">{summary?.monthSummary?.daysWorked || 0} days worked</p>
          </div>
        </div>

        {/* Quick Check-In Prompt */}
        {needsCheckin && (
          <button onClick={() => setActiveTab("checkin")}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white rounded-2xl p-4 shadow-lg text-left active:scale-[0.98] transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-base">Mark Attendance</div>
                <div className="text-xs opacity-90 mt-0.5">
                  {canCheckToday && canCheckYesterday ? "Today & Yesterday available" :
                   canCheckToday ? "Submit for today" : "Submit for yesterday"}
                </div>
              </div>
              <div className="text-3xl">→</div>
            </div>
          </button>
        )}

        {/* Earnings Breakdown */}
        {summary?.monthSummary?.totalEarnings > 0 && (
          <div className="bg-white rounded-2xl shadow-md p-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Monthly Breakdown</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Regular Pay</div>
                <div className="text-sm font-bold text-blue-700">{formatCurrency(summary.monthSummary.regularPay || 0)}</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Overtime Pay</div>
                <div className="text-sm font-bold text-amber-700">{formatCurrency(summary.monthSummary.otPay || 0)}</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Sundays</div>
                <div className="text-sm font-bold text-purple-700">{summary.monthSummary.sundayDays || 0} days</div>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <div className="text-[10px] text-gray-500 mb-0.5">Holidays</div>
                <div className="text-sm font-bold text-red-700">{summary.monthSummary.holidayDays || 0} days</div>
              </div>
            </div>
          </div>
        )}

        {/* Today's Entry */}
        {todayEntry && (
          <div className="bg-white rounded-2xl shadow-md p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900">Today ({todayISO()})</h3>
              <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">✓ Submitted</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-500">Client:</span> <span className="font-semibold">{todayEntry.client_name}</span></div>
              <div><span className="text-gray-500">Site:</span> <span className="font-semibold">{todayEntry.site_name}</span></div>
              <div><span className="text-gray-500">Time:</span> <span className="font-semibold">{todayEntry.start_time} - {todayEntry.end_time}</span></div>
              <div><span className="text-gray-500">Hours:</span> <span className="font-semibold">{todayEntry.hours_worked}h</span></div>
              <div><span className="text-gray-500">Regular:</span> <span className="font-semibold text-blue-700">{formatCurrency(todayEntry.regular_pay)}</span></div>
              <div><span className="text-gray-500">OT:</span> <span className="font-semibold text-amber-700">{formatCurrency(todayEntry.ot_pay)}</span></div>
              <div className="col-span-2"><span className="text-gray-500">Total Pay:</span> <span className="font-bold text-green-700">{formatCurrency(todayEntry.total_pay)}</span></div>
            </div>
          </div>
        )}

        {/* Yesterday's Entry */}
        {yesterdayEntry && (
          <div className="bg-white rounded-2xl shadow-md p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900">Yesterday ({getYesterdayISO()})</h3>
              <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">✓ Submitted</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-500">Client:</span> <span className="font-semibold">{yesterdayEntry.client_name}</span></div>
              <div><span className="text-gray-500">Site:</span> <span className="font-semibold">{yesterdayEntry.site_name}</span></div>
              <div><span className="text-gray-500">Time:</span> <span className="font-semibold">{yesterdayEntry.start_time} - {yesterdayEntry.end_time}</span></div>
              <div><span className="text-gray-500">Hours:</span> <span className="font-semibold">{yesterdayEntry.hours_worked}h</span></div>
              <div><span className="text-gray-500">Regular:</span> <span className="font-semibold text-blue-700">{formatCurrency(yesterdayEntry.regular_pay)}</span></div>
              <div><span className="text-gray-500">OT:</span> <span className="font-semibold text-amber-700">{formatCurrency(yesterdayEntry.ot_pay)}</span></div>
              <div className="col-span-2"><span className="text-gray-500">Total Pay:</span> <span className="font-bold text-green-700">{formatCurrency(yesterdayEntry.total_pay)}</span></div>
            </div>
          </div>
        )}

        {/* Recent Chart - compact */}
        {pieChartData && (
          <div className="bg-white rounded-2xl shadow-md p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Pay Breakdown</h3>
            <div className="h-44 flex items-center justify-center">
              <Pie data={pieChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { padding: 12, font: { size: 11 } } }, tooltip: { backgroundColor: "rgba(0,0,0,0.8)", padding: 10, callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } } } }} />
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
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={customRange.start}
                onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={customRange.end}
                onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))} />
            </div>
          </div>
        )}

        {historyLoading ? (
          <div className="py-8"><LoadingSpinner label="Loading..." /></div>
        ) : history && history.length > 0 ? (
          <>
            {/* Line Chart */}
            {lineChartData && (
              <div className="bg-white rounded-2xl shadow-md p-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Earnings Trend</h3>
                <div className="h-48">
                  <Line data={lineChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(0,0,0,0.8)", padding: 10, callbacks: { label: (ctx) => `${formatCurrency(ctx.parsed.y)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v}` } } } }} />
                </div>
              </div>
            )}

            {/* Records List - Mobile friendly cards instead of table */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900">Records ({history.length})</h3>
              {[...history].sort((a, b) => new Date(b.date) - new Date(a.date)).map((record) => (
                <div key={record.id} className="bg-white rounded-xl shadow-sm p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">
                          {new Date(record.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", weekday: "short" })}
                        </span>
                        {(record.is_sunday || record.is_holiday) && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                            {record.is_sunday ? "Sun" : "Holiday"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {record.client_name} • {record.hours_worked}h • {record.start_time}-{record.end_time}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-600">{formatCurrency(record.total_pay)}</div>
                      <div className="text-[10px] text-gray-500">
                        R: {formatCurrency(record.regular_pay)} • OT: {formatCurrency(record.ot_pay)}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {record.admin_verified ? "✓ Verified" : "⏳ Pending"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
    <LayoutShell title="WorkTrack" designation={designation}>
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