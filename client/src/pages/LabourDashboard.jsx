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

  // Check-in date: "today" or "yesterday"
  const [checkinFor, setCheckinFor] = useState("today");

  const [form, setForm] = useState({
    client_id: "", site_id: "", start_time: "", end_time: "",
  });
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

        // Set entries from dashboard response
        setTodayEntry(dashRes.data.todayEntry || null);
        setYesterdayEntry(dashRes.data.yesterday || null);
        setYesterdayCutoffPassed(dashRes.data.yesterdayCutoffPassed || false);
        setDailyWage(dashRes.data.dailyWage || 0);
        setDesignation(dashRes.data.designation || "");

        // If today already has entry but yesterday doesn't AND cutoff hasn't passed, default to "yesterday"
        if (dashRes.data.todayEntry && !dashRes.data.yesterday && !dashRes.data.yesterdayCutoffPassed) {
          setCheckinFor("yesterday");
        }
      } catch (err) {
        console.error("Error loading initial data:", err);
        setClients([]); setSites([]); setHolidays([]);
        setConfig({ regular_hours: "10", ot_multiplier: "1.5", sunday_multiplier: "1.5", holiday_multiplier: "2.0" });
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

  // The date being checked in for
  const checkinDate = checkinFor === "yesterday" ? getYesterdayISO() : todayISO();

  // Whether this date already has an entry
  const currentDateEntry = checkinFor === "yesterday" ? yesterdayEntry : todayEntry;

  const estimatedPay = useMemo(() => {
    if (!form.start_time || !form.end_time || !config || !holidays) return null;
    try {
      return calculatePayment(dailyWage, form.start_time, form.end_time, checkinDate, holidays, config, designation);
    } catch (err) {
      return null;
    }
  }, [form.start_time, form.end_time, dailyWage, holidays, config, checkinDate, designation]);

  // Night shift aware validation
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
      const payload = {
        client_id: Number(form.client_id),
        site_id: Number(form.site_id),
        start_time: form.start_time,
        end_time: form.end_time,
        date: checkinDate,
      };
      const res = await api.post("/labour/checkin", payload);

      // Update the right entry
      if (checkinFor === "yesterday") {
        setYesterdayEntry(res.data);
      } else {
        setTodayEntry(res.data);
      }

      setToast(`✓ Check-in for ${checkinFor === "yesterday" ? "yesterday" : "today"} submitted!`);
      setTimeout(() => setToast(""), 3000);
      setForm({ client_id: "", site_id: "", start_time: "", end_time: "" });
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to submit. Please try again.";
      setToast("⚠ " + msg);
      setTimeout(() => setToast(""), 5000);
    } finally {
      setSubmitting(false);
    }
  }

  // Night shift indicator
  const isNightShift = useMemo(() => {
    if (!form.start_time || !form.end_time) return false;
    const [sh] = form.start_time.split(":").map(Number);
    const [eh] = form.end_time.split(":").map(Number);
    const startMin = sh * 60;
    const endMin = eh * 60;
    return endMin <= startMin;
  }, [form.start_time, form.end_time]);

  // Chart data
  const lineChartData = useMemo(() => {
    try {
      if (!history || history.length === 0) return null;
      const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
      return {
        labels: sorted.map((h) => { const d = new Date(h.date); return `${d.getDate()}/${d.getMonth() + 1}`; }),
        datasets: [{ label: "Daily Earnings (AED)", data: sorted.map((h) => h.total_pay || 0), borderColor: "rgb(34, 197, 94)", backgroundColor: "rgba(34, 197, 94, 0.1)", tension: 0.3, fill: true }],
      };
    } catch (err) { return null; }
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
    } catch (err) { return null; }
  }, [history]);

  if (loading) return <LayoutShell title="Attendance & Earnings"><LoadingSpinner label="Loading..." /></LayoutShell>;

  // Helper to render a submitted entry card
  function renderEntryCard(entry, label) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-xl p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-green-800">{label}</h3>
          <span className="bg-green-200 text-green-900 text-xs font-semibold px-2 py-0.5 rounded-full">✓ Submitted</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-gray-500">Client:</span> <span className="font-semibold">{entry.client_name}</span></div>
          <div><span className="text-gray-500">Site:</span> <span className="font-semibold">{entry.site_name}</span></div>
          <div><span className="text-gray-500">Time:</span> <span className="font-semibold">{entry.start_time} - {entry.end_time}</span></div>
          <div><span className="text-gray-500">Pay:</span> <span className="font-semibold text-green-700">{formatCurrency(entry.total_pay)}</span></div>
        </div>
      </div>
    );
  }

  // Can still check in? Show form only if current selected date has no entry
  const canCheckin = !currentDateEntry;
  // Can check for yesterday? Only if no entry AND cutoff hasn't passed
  const canCheckYesterday = !yesterdayEntry && !yesterdayCutoffPassed;
  // Can check for today?
  const canCheckToday = !todayEntry;

  return (
    <LayoutShell title="Attendance & Earnings">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
        {toast && (
          <div className={`mb-4 text-sm font-medium rounded-lg px-4 py-3 shadow-lg ${
            toast.startsWith("✓") ? "bg-green-50 text-green-800 border border-green-200" : "bg-amber-50 text-amber-800 border border-amber-200"
          }`}>{toast}</div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-5 text-white">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium opacity-90">Yesterday</h2>
              {yesterdayEntry?.admin_verified ? <span className="text-2xl">✓</span> : yesterdayEntry ? <span className="text-2xl opacity-75">⏳</span> : null}
            </div>
            {yesterdayEntry ? (
              <div>
                <div className="text-2xl sm:text-3xl font-bold mb-1">{formatCurrency(yesterdayEntry.total_pay)}</div>
                <p className="text-xs opacity-90">{yesterdayEntry.hours_worked}h worked • {yesterdayEntry.admin_verified ? "Verified" : "Pending"}</p>
              </div>
            ) : yesterdayCutoffPassed ? (
              <div>
                <div className="text-lg font-bold mb-1 opacity-90">Marked Absent</div>
                <p className="text-xs opacity-75">Cutoff time has passed</p>
              </div>
            ) : <div className="text-sm opacity-75">Not submitted yet</div>}
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-5 text-white">
            <h2 className="text-sm font-medium opacity-90 mb-2">This Month</h2>
            <div className="text-2xl sm:text-3xl font-bold mb-1">{formatCurrency(summary?.monthSummary?.totalEarnings || 0)}</div>
            <p className="text-xs opacity-90">{summary?.monthSummary?.daysWorked || 0} days worked</p>
          </div>
        </div>

        {/* Earnings Breakdown */}
        {summary?.monthSummary?.totalEarnings > 0 && (
          <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5 mb-6">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Monthly Earnings Breakdown</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Regular Pay</div>
                <div className="text-base sm:text-lg font-bold text-blue-700">{formatCurrency(summary.monthSummary.regularPay || 0)}</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Overtime Pay</div>
                <div className="text-base sm:text-lg font-bold text-amber-700">{formatCurrency(summary.monthSummary.otPay || 0)}</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Sundays</div>
                <div className="text-base sm:text-lg font-bold text-purple-700">{summary.monthSummary.sundayDays || 0} days</div>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Holidays</div>
                <div className="text-base sm:text-lg font-bold text-red-700">{summary.monthSummary.holidayDays || 0} days</div>
              </div>
            </div>
          </div>
        )}

        {/* Check-In Section */}
        <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5 mb-6">
          {/* Show existing entries */}
          {yesterdayEntry && renderEntryCard(yesterdayEntry, `Yesterday (${getYesterdayISO()})`)}
          {todayEntry && renderEntryCard(todayEntry, `Today (${todayISO()})`)}

          {/* If both are submitted */}
          {todayEntry && yesterdayEntry ? (
            <div className="text-center py-4">
              <p className="text-gray-500 text-sm">Both today and yesterday attendance submitted ✓</p>
              <p className="text-xs text-gray-400 mt-1">Contact admin for any changes.</p>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-3">Check-In</h2>

              {/* Date Toggle: Today / Yesterday */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setCheckinFor("today")}
                  disabled={!canCheckToday}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    checkinFor === "today"
                      ? "bg-blue-600 text-white shadow-md"
                      : canCheckToday
                        ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  📅 Today ({todayISO()})
                  {todayEntry && <span className="ml-1 text-xs">✓</span>}
                </button>
                <button
                  onClick={() => setCheckinFor("yesterday")}
                  disabled={!canCheckYesterday}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    checkinFor === "yesterday"
                      ? "bg-blue-600 text-white shadow-md"
                      : canCheckYesterday
                        ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  📅 Yesterday ({getYesterdayISO()})
                  {yesterdayEntry && <span className="ml-1 text-xs">✓</span>}
                </button>
              </div>

              {/* Show date context */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4 text-sm text-blue-800">
                Checking in for: <strong>{checkinFor === "yesterday" ? getYesterdayISO() : todayISO()}</strong>
                {checkinFor === "yesterday" && (
                  <span className="text-xs text-blue-600 block mt-0.5">Use this if you worked yesterday but couldn't check in</span>
                )}
              </div>

              {/* Form */}
              {canCheckin ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Client <span className="text-red-500">*</span></label>
                      <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value, site_id: "" }))}>
                        <option value="">Select client</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {formErrors.client_id && <p className="text-xs text-red-600 mt-1">{formErrors.client_id}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Site <span className="text-red-500">*</span></label>
                      <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
                        value={form.site_id} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))} disabled={!form.client_id}>
                        <option value="">{form.client_id ? "Select site" : "Select client first"}</option>
                        {availableSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      {formErrors.site_id && <p className="text-xs text-red-600 mt-1">{formErrors.site_id}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Start Time</label>
                      <input type="time" className="w-full border-2 border-gray-200 rounded-xl px-3 sm:px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
                      {formErrors.start_time && <p className="text-xs text-red-600 mt-1">{formErrors.start_time}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">End Time</label>
                      <input type="time" className="w-full border-2 border-gray-200 rounded-xl px-3 sm:px-4 py-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
                      {formErrors.end_time && <p className="text-xs text-red-600 mt-1">{formErrors.end_time}</p>}
                    </div>
                  </div>

                  {/* Night shift indicator */}
                  {isNightShift && form.start_time && form.end_time && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-800">
                      🌙 Night shift: {form.start_time} → {form.end_time} (next day) = {getHoursWorked(form.start_time, form.end_time).toFixed(1)}h
                    </div>
                  )}

                  {estimatedPay && estimatedPay.totalPay > 0 && (
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                      <div className="text-xs text-blue-600 font-semibold mb-1">ESTIMATED EARNINGS</div>
                      <div className="text-xl sm:text-2xl font-bold text-blue-900">{formatCurrency(estimatedPay.totalPay)}</div>
                      <div className="text-xs text-blue-700 mt-1">
                        {estimatedPay.hoursWorked}h worked
                        {estimatedPay.isSunday && " • Sunday rate"}
                        {estimatedPay.isHoliday && " • Holiday rate"}
                      </div>
                    </div>
                  )}

                  <button type="submit" disabled={submitting}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 sm:py-4 rounded-xl shadow-lg transition-all text-base sm:text-lg disabled:opacity-50">
                    {submitting ? "Submitting..." : `Submit for ${checkinFor === "yesterday" ? "Yesterday" : "Today"}`}
                  </button>
                </form>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500">Attendance for {checkinFor} already submitted</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* History Section */}
        <div className="bg-white rounded-2xl shadow-md p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Earnings History</h2>
          <div className="flex flex-wrap gap-2">
            {["week", "month", "custom"].map((p) => (
              <button key={p} onClick={() => { setPeriod(p); if (p !== "custom") setShowCustomRange(false); else setShowCustomRange(true); }}
                className={`px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm transition-all ${period === p ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                {p === "week" ? "Last 7 Days" : p === "month" ? "This Month" : "Custom Range"}
              </button>
            ))}
          </div>
          {showCustomRange && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">From</label><input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={customRange.start} onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">To</label><input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={customRange.end} onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))} /></div>
            </div>
          )}
        </div>

        {/* Charts & History Table */}
        {historyLoading ? (
          <div className="text-center py-8"><LoadingSpinner label="Loading history..." /></div>
        ) : history && history.length > 0 ? (
          <div className="space-y-6">
            {lineChartData && (
              <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
                <h3 className="text-base font-bold text-gray-900 mb-4">Daily Earnings Trend</h3>
                <div className="h-56 sm:h-64 lg:h-72">
                  <Line data={lineChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(0,0,0,0.8)", padding: 12, callbacks: { label: (ctx) => `Earnings: ${formatCurrency(ctx.parsed.y)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v} AED` } } } }} />
                </div>
              </div>
            )}
            {pieChartData && (
              <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
                <h3 className="text-base font-bold text-gray-900 mb-4">Pay Breakdown</h3>
                <div className="h-56 sm:h-64 flex items-center justify-center">
                  <Pie data={pieChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { padding: 15, font: { size: 12 } } }, tooltip: { backgroundColor: "rgba(0,0,0,0.8)", padding: 12, callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } } } }} />
                </div>
              </div>
            )}
            <div className="bg-white rounded-2xl shadow-md overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-gray-100"><h3 className="text-base font-bold text-gray-900">Attendance Records</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wide">
                    <tr>
                      <th className="px-3 sm:px-4 py-3 text-left">Date</th>
                      <th className="px-3 sm:px-4 py-3 text-left hidden sm:table-cell">Client</th>
                      <th className="px-3 sm:px-4 py-3 text-left hidden md:table-cell">Hours</th>
                      <th className="px-3 sm:px-4 py-3 text-right">Earnings</th>
                      <th className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-3 sm:px-4 py-3 font-medium text-gray-900">{new Date(record.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td>
                        <td className="px-3 sm:px-4 py-3 text-gray-600 hidden sm:table-cell">{record.client_name}</td>
                        <td className="px-3 sm:px-4 py-3 text-gray-600 hidden md:table-cell">{record.hours_worked}h</td>
                        <td className="px-3 sm:px-4 py-3 text-right font-semibold text-green-600">{formatCurrency(record.total_pay)}</td>
                        <td className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">{record.admin_verified ? <span className="text-green-600 text-lg">✓</span> : <span className="text-amber-500 text-lg">⏳</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center">
            <p className="text-gray-500 text-sm">No attendance records for selected period.</p>
          </div>
        )}
      </div>
    </LayoutShell>
  );
}