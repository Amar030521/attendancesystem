import React, { useEffect, useState, useMemo } from "react";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { LabourManagement } from "../components/LabourManagement";
import { ClientManagement } from "../components/ClientManagement";
import { SiteManagement } from "../components/SiteManagement";
import { HolidayManagement } from "../components/HolidayManagement";
import { ConfigManagement } from "../components/ConfigManagement";
import { IncentiveManagement } from "../components/IncentiveManagement";
import { ManagerManagement } from "../components/ManagerManagement";
import { api, getStoredUser, setAuth } from "../api";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

function formatCurrency(a) { return "AED " + (a || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
const todayISO = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);

async function downloadFile(url, fallbackFn) {
  const r = await api.get(url, { responseType: "arraybuffer" });
  const cd = r.headers["content-disposition"] || "";
  const fn = cd.match(/filename="?([^";\n]+)"?/)?.[1] || fallbackFn;
  const b = new Blob([r.data], { type: r.headers["content-type"] || "application/octet-stream" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fn;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}
async function downloadPdf(url, fallbackFn) {
  const r = await api.get(url, { responseType: "arraybuffer" });
  const cd = r.headers["content-disposition"] || "";
  const fn = cd.match(/filename="?([^";\n]+)"?/)?.[1] || fallbackFn;
  const b = new Blob([r.data], { type: "application/pdf" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fn;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

// ─── NAV ITEMS ───
const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>
  )},
  { id: "daily", label: "Daily View", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
  )},
  { id: "attendance", label: "Attendance", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  )},
  { id: "reports", label: "Reports", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  )},
  { id: "settings", label: "Settings", icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  )},
];

const SETTINGS_TABS = [
  { id: "labours", label: "Labours", icon: "👷" },
  { id: "clients", label: "Clients", icon: "🏢" },
  { id: "sites", label: "Sites", icon: "📍" },
  { id: "holidays", label: "Holidays", icon: "📅" },
  { id: "incentives", label: "Incentives", icon: "💰" },
  { id: "managers", label: "Managers", icon: "👤" },
  { id: "config", label: "Config", icon: "⚙️" },
];

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [settingsTab, setSettingsTab] = useState("labours");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // DAILY
  const [date, setDate] = useState(todayISO());
  const [dailyRows, setDailyRows] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [filterClient, setFilterClient] = useState("");
  const [filterSites, setFilterSites] = useState([]);

  // PRESENT/ABSENT
  const [paDate, setPaDate] = useState(todayISO());
  const [paData, setPaData] = useState(null);
  const [paLoading, setPaLoading] = useState(false);
  const [paForm, setPaForm] = useState({ labourId: "", clientId: "", siteId: "", startTime: "08:00", endTime: "18:00" });
  const [paSubmitting, setPaSubmitting] = useState(false);

  // REPORTS
  const [reportMonth, setReportMonth] = useState(currentMonth());
  const [reportLabour, setReportLabour] = useState("");
  const [reportClient, setReportClient] = useState("");
  const [reportSite, setReportSite] = useState("");
  const [reportLabours, setReportLabours] = useState([]);
  const [reportClients, setReportClients] = useState([]);
  const [reportSites, setReportSites] = useState([]);
  const [dlFlags, setDlFlags] = useState({});

  const user = getStoredUser();

  // ─── DATA LOADERS ───
  async function loadMaster() { try { const [c, s] = await Promise.all([api.get("/admin/clients"), api.get("/admin/sites")]); setClients(c.data || []); setSites(s.data || []); } catch (e) { console.error(e); } }
  async function loadAnalytics() { try { setAnalyticsLoading(true); const { data } = await api.get("/admin/analytics"); setAnalytics(data); } catch (e) { console.error(e); } finally { setAnalyticsLoading(false); } }
  async function loadDaily() { try { setDailyLoading(true); setDailyRows((await api.get(`/admin/attendance?date=${date}`)).data); } catch (e) { console.error(e); } finally { setDailyLoading(false); } }
  async function loadPA() { try { setPaLoading(true); setPaData((await api.get(`/admin/present-absent?date=${paDate}`)).data); } catch (e) { console.error(e); } finally { setPaLoading(false); } }
  async function loadReportData() { try { const [l, c, s] = await Promise.all([api.get("/admin/labours"), api.get("/admin/clients"), api.get("/admin/sites")]); setReportLabours(l.data || []); setReportClients(c.data || []); setReportSites(s.data || []); } catch (e) { console.error(e); } }

  useEffect(() => { loadMaster(); loadReportData(); }, []);
  useEffect(() => { if (activeTab === "daily") loadDaily(); }, [date, activeTab]);
  useEffect(() => { if (activeTab === "attendance") loadPA(); }, [paDate, activeTab]);
  useEffect(() => { if (activeTab === "overview") loadAnalytics(); }, [activeTab]);

  // ─── DAILY HELPERS ───
  const filteredRows = useMemo(() => {
    let r = dailyRows;
    if (filterClient) { r = r.filter(x => String(x.client_id) === filterClient); }
    if (filterSites.length) { r = r.filter(x => filterSites.includes(String(x.site_id))); }
    return r;
  }, [dailyRows, filterClient, filterSites]);

  const availableSites = useMemo(() => filterClient ? sites.filter(s => String(s.client_id) === filterClient) : sites, [filterClient, sites]);

  async function handleVerifyRow(id) { try { setVerifying(true); await api.put(`/admin/attendance/${id}/verify`); await loadDaily(); } catch (e) { console.error(e); } finally { setVerifying(false); } }
  async function handleVerifyAll() { try { setVerifying(true); const ids = filteredRows.filter(r => !r.admin_verified).map(r => r.id); if (!ids.length) return; await api.put("/admin/attendance/bulk-verify", { ids }); await loadDaily(); } catch (e) { console.error(e); } finally { setVerifying(false); } }
  async function handleDeleteRow(id) { if (!window.confirm("Delete?")) return; try { await api.delete(`/admin/attendance/${id}`); await loadDaily(); } catch (e) { console.error(e); } }

  // PA HELPERS
  async function handleMarkPresent() {
    const { labourId, clientId, siteId, startTime, endTime } = paForm;
    if (!labourId || !clientId || !siteId) return alert("Select labour, client, site");
    try { setPaSubmitting(true); await api.post("/admin/present-absent/mark-present", { labourId: +labourId, clientId: +clientId, siteId: +siteId, date: paDate, startTime, endTime }); await loadPA(); setPaForm(p => ({ ...p, labourId: "", clientId: "", siteId: "" })); } catch (e) { alert(e.response?.data?.message || "Error"); } finally { setPaSubmitting(false); }
  }
  async function handleMarkAbsent(labourId) { try { await api.delete(`/admin/present-absent/mark-absent/${labourId}/${paDate}`); await loadPA(); } catch (e) { alert(e.response?.data?.message || "Error"); } }

  // ─── REPORT HELPERS ───
  async function dl(key, url, fn) { try { setDlFlags(f => ({ ...f, [key]: true })); await downloadFile(url, fn); } catch (e) { alert("Download failed"); console.error(e); } finally { setDlFlags(f => ({ ...f, [key]: false })); } }
  async function dlPdf(key, url, fn) { try { setDlFlags(f => ({ ...f, [key]: true })); await downloadPdf(url, fn); } catch (e) { alert("Download failed"); console.error(e); } finally { setDlFlags(f => ({ ...f, [key]: false })); } }

  // ─── HANDLE NAV ───
  const handleNavClick = (id) => { setActiveTab(id); setSidebarOpen(false); };

  // ════════════════════════════════════════════════════════
  // RENDER: OVERVIEW
  // ════════════════════════════════════════════════════════
  const renderOverview = () => {
    if (analyticsLoading) return <LoadingSpinner label="Loading analytics..." />;
    if (!analytics) return <div className="text-center text-gray-400 py-12">No analytics data available</div>;
    const { summary: s, dailyTrend, clientBreakdown, siteBreakdown, topLabours } = analytics;

    const trendData = {
      labels: dailyTrend.map(d => d.date.slice(5)),
      datasets: [
        { type: "bar", label: "Workers", data: dailyTrend.map(d => d.count), backgroundColor: "rgba(59,130,246,0.15)", borderColor: "#3b82f6", borderWidth: 1.5, borderRadius: 6, yAxisID: "y", order: 2 },
        { type: "line", label: "Wages (AED)", data: dailyTrend.map(d => Math.round(d.wages)), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.08)", fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#fff", pointBorderColor: "#10b981", pointBorderWidth: 2, yAxisID: "y1", order: 1 },
      ],
    };
    const trendOpts = {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "top", labels: { usePointStyle: true, boxWidth: 6, padding: 16, font: { size: 11, weight: "500" } } }, tooltip: { backgroundColor: "#1e293b", titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => ctx.dataset.label === "Wages (AED)" ? ` Wages: AED ${ctx.raw.toLocaleString()}` : ` Workers: ${ctx.raw}` } } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "Workers", font: { size: 10, weight: "600" }, color: "#94a3b8" }, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { stepSize: 1, font: { size: 10 } } }, y1: { position: "right", beginAtZero: true, title: { display: true, text: "Wages (AED)", font: { size: 10, weight: "600" }, color: "#94a3b8" }, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } },
    };

    const pieData = {
      labels: clientBreakdown.map(c => c.client_name),
      datasets: [{ data: clientBreakdown.map(c => Math.round(c.wages * 100) / 100), backgroundColor: CHART_COLORS.slice(0, clientBreakdown.length), borderWidth: 0, hoverBorderWidth: 2, hoverBorderColor: "#fff" }],
    };
    const pieOpts = {
      responsive: true, maintainAspectRatio: false, cutout: "60%",
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11, weight: "500" } } }, tooltip: { backgroundColor: "#1e293b", padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => ` ${ctx.label}: AED ${ctx.raw.toLocaleString()} (${Math.round(ctx.raw / clientBreakdown.reduce((s, c) => s + c.wages, 0) * 100)}%)` } } },
    };

    const siteData = {
      labels: siteBreakdown.map(s => s.site_name),
      datasets: [{ data: siteBreakdown.map(s => Math.round(s.wages * 100) / 100), backgroundColor: CHART_COLORS.slice(0, siteBreakdown.length).map(c => c + "33"), borderColor: CHART_COLORS.slice(0, siteBreakdown.length), borderWidth: 1.5, borderRadius: 4 }],
    };
    const siteOpts = {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1e293b", padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => ` AED ${ctx.raw.toLocaleString()} (${siteBreakdown[ctx.dataIndex]?.days || 0} days)` } } },
      scales: { x: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { font: { size: 11, weight: "500" } } } },
    };

    const earnerData = {
      labels: topLabours.map(l => l.name),
      datasets: [{ data: topLabours.map(l => Math.round(l.wages * 100) / 100), backgroundColor: topLabours.map((_, i) => i < 3 ? "rgba(245,158,11,0.2)" : "rgba(59,130,246,0.12)"), borderColor: topLabours.map((_, i) => i < 3 ? "#f59e0b" : "#3b82f6"), borderWidth: 1.5, borderRadius: 4 }],
    };
    const earnerOpts = {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1e293b", padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => { const l = topLabours[ctx.dataIndex]; return ` AED ${ctx.raw.toLocaleString()} (${l?.days}d / ${Math.round(l?.hours)}h)`; } } } },
      scales: { x: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { font: { size: 11, weight: "500" } } } },
    };

    return (
      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { l: "Active Labours", v: s.totalLabours, sub: "Registered workers", color: "from-blue-500 to-blue-600", iconBg: "bg-blue-400/20", icon: "👷" },
            { l: "Present Today", v: `${s.presentToday}/${s.totalLabours}`, sub: `${s.totalLabours ? Math.round(s.presentToday/s.totalLabours*100) : 0}% attendance`, color: "from-emerald-500 to-emerald-600", iconBg: "bg-emerald-400/20", icon: "✅" },
            { l: "Month Wages", v: formatCurrency(s.totalWagesMonth), sub: `${s.uniqueWorkDays} work days`, color: "from-violet-500 to-violet-600", iconBg: "bg-violet-400/20", icon: "💰" },
            { l: "Month Hours", v: `${Math.round(s.totalHoursMonth)}h`, sub: `Avg ${s.avgDailyWage ? formatCurrency(s.avgDailyWage) : "AED 0"}/entry`, color: "from-amber-500 to-amber-600", iconBg: "bg-amber-400/20", icon: "⏱" },
          ].map((m, i) => (
            <div key={i} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${m.color} p-5 text-white shadow-lg`}>
              <div className="absolute top-3 right-3 w-10 h-10 rounded-lg flex items-center justify-center text-lg opacity-80" style={{background:"rgba(255,255,255,0.15)"}}>{m.icon}</div>
              <p className="text-xs font-medium text-white/80 uppercase tracking-wider">{m.l}</p>
              <p className="text-2xl font-bold mt-1 tracking-tight">{m.v}</p>
              <p className="text-xs text-white/60 mt-1">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { l: "Regular Pay", v: formatCurrency(s.totalRegularMonth), color: "#3b82f6" },
            { l: "OT Pay", v: formatCurrency(s.totalOTMonth), color: "#f59e0b" },
            { l: "Avg/Entry", v: formatCurrency(s.avgDailyWage), color: "#10b981" },
            { l: "Work Days", v: s.uniqueWorkDays, color: "#8b5cf6" },
          ].map((m, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{backgroundColor: m.color}} />
                <span className="text-xs text-gray-500 font-medium">{m.l}</span>
              </div>
              <p className="text-lg font-bold text-gray-900">{m.v}</p>
            </div>
          ))}
        </div>

        {/* Trend Chart */}
        {dailyTrend.length > 0 && (
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Daily Trend — Last 14 Days</h3>
            <div style={{ height: 300 }}><Bar data={trendData} options={trendOpts} /></div>
          </div>
        )}

        {/* Two-column: Client Revenue + Top Sites */}
        <div className="grid lg:grid-cols-2 gap-4">
          {clientBreakdown.length > 0 && (
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Client Revenue Share</h3>
              <div style={{ height: 280 }}><Doughnut data={pieData} options={pieOpts} /></div>
            </div>
          )}
          {siteBreakdown.length > 0 && (
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Sites</h3>
              <div style={{ height: Math.max(siteBreakdown.length * 44, 180) }}><Bar data={siteData} options={siteOpts} /></div>
            </div>
          )}
        </div>

        {/* Top Earners */}
        {topLabours.length > 0 && (
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Earners</h3>
            <div style={{ height: Math.max(topLabours.length * 40, 200) }}><Bar data={earnerData} options={earnerOpts} /></div>
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════
  // RENDER: DAILY
  // ════════════════════════════════════════════════════════
  const renderDaily = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client</label>
            <select value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterSites([]); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">All Clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {filterClient && availableSites.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sites</label>
              <select multiple value={filterSites} onChange={e => setFilterSites([...e.target.selectedOptions].map(o => o.value))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm h-20 focus:ring-2 focus:ring-blue-500 outline-none">
                {availableSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={handleVerifyAll} disabled={verifying} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors">
              {verifying ? "..." : "✓ Verify All"}
            </button>
            <button onClick={() => dl("daily", `/admin/reports/daily?date=${date}&format=xlsx`, `daily_${date}.xlsx`)} disabled={downloading} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
              📥 Excel
            </button>
            <button onClick={() => dlPdf("dailyPdf", `/admin/reports/daily?date=${date}&format=pdf`, `daily_${date}.pdf`)} disabled={downloading} className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors">
              📄 PDF
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      {filteredRows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
            <p className="text-xs text-gray-500">Entries</p>
            <p className="text-2xl font-bold text-gray-900">{filteredRows.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
            <p className="text-xs text-gray-500">Total Pay</p>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(filteredRows.reduce((s, r) => s + (r.total_pay || 0), 0))}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
            <p className="text-xs text-gray-500">Hours</p>
            <p className="text-2xl font-bold text-blue-600">{filteredRows.reduce((s, r) => s + (r.hours_worked || 0), 0).toFixed(1)}h</p>
          </div>
        </div>
      )}

      {/* Table */}
      {dailyLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredRows.length === 0 ? <p className="p-6 text-center text-gray-400">No records for this date</p> : filteredRows.map(r => (
              <div key={r.id} className="p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{r.labour_name || r.users?.name}</p>
                    <p className="text-xs text-gray-500">{r.client_name || r.clients?.name} • {r.site_name || r.sites?.name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.admin_verified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {r.admin_verified ? "✓" : "Pending"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{r.start_time}-{r.end_time} ({r.hours_worked}h)</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(r.total_pay)}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  {!r.admin_verified && <button onClick={() => handleVerifyRow(r.id)} className="text-xs px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-medium hover:bg-emerald-100">Verify</button>}
                  <button onClick={() => handleDeleteRow(r.id)} className="text-xs px-3 py-1 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100">Delete</button>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-semibold text-gray-600">Labour</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Client / Site</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Shift</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Hours</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Pay</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRows.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No records for this date</td></tr> : filteredRows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.labour_name || r.users?.name}</td>
                    <td className="px-4 py-3 text-gray-600"><span className="font-medium">{r.client_name || r.clients?.name}</span><br /><span className="text-xs text-gray-400">{r.site_name || r.sites?.name}</span></td>
                    <td className="px-4 py-3 text-gray-600">{r.start_time} - {r.end_time}</td>
                    <td className="px-4 py-3 text-gray-600">{r.hours_worked}h</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">{formatCurrency(r.total_pay)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${r.admin_verified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                        {r.admin_verified ? "Verified" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {!r.admin_verified && <button onClick={() => handleVerifyRow(r.id)} disabled={verifying} className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-medium hover:bg-emerald-100 transition-colors disabled:opacity-40">Verify</button>}
                        <button onClick={() => handleDeleteRow(r.id)} className="text-xs px-2.5 py-1 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════
  // RENDER: PRESENT/ABSENT
  // ════════════════════════════════════════════════════════
  const renderPA = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input type="date" value={paDate} onChange={e => setPaDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
      </div>

      {/* Mark Present Form */}
      <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Mark Present</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <select value={paForm.labourId} onChange={e => setPaForm(f => ({ ...f, labourId: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">Labour</option>
            {paData?.absent?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={paForm.clientId} onChange={e => setPaForm(f => ({ ...f, clientId: e.target.value, siteId: "" }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">Client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={paForm.siteId} onChange={e => setPaForm(f => ({ ...f, siteId: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">Site</option>
            {sites.filter(s => !paForm.clientId || String(s.client_id) === paForm.clientId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="time" value={paForm.startTime} onChange={e => setPaForm(f => ({ ...f, startTime: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <input type="time" value={paForm.endTime} onChange={e => setPaForm(f => ({ ...f, endTime: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <button onClick={handleMarkPresent} disabled={paSubmitting} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors">
            {paSubmitting ? "..." : "Mark Present"}
          </button>
        </div>
      </div>

      {paLoading ? <LoadingSpinner /> : paData && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Present */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
              <h3 className="text-sm font-semibold text-emerald-800">Present ({paData.present?.length || 0})</h3>
            </div>
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {(paData.present || []).map(r => (
                <div key={r.id || r.labour_id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50/50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.labour_name || r.name}</p>
                    <p className="text-xs text-gray-500">{r.client_name} • {r.start_time}-{r.end_time}</p>
                  </div>
                  <button onClick={() => handleMarkAbsent(r.labour_id || r.id)} className="text-xs px-3 py-1 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors">Remove</button>
                </div>
              ))}
              {(paData.present || []).length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">No one present</p>}
            </div>
          </div>
          {/* Absent */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-100">
              <h3 className="text-sm font-semibold text-red-800">Absent ({paData.absent?.length || 0})</h3>
            </div>
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {(paData.absent || []).map(l => (
                <div key={l.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50/50">
                  <p className="text-sm font-medium text-gray-900">{l.name}</p>
                  <span className="text-xs text-gray-400">Not checked in</span>
                </div>
              ))}
              {(paData.absent || []).length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">All present!</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════
  // RENDER: REPORTS
  // ════════════════════════════════════════════════════════
  const renderReports = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
          <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Labour</label>
          <select value={reportLabour} onChange={e => setReportLabour(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All</option>
            {reportLabours.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Client</label>
          <select value={reportClient} onChange={e => setReportClient(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All</option>
            {reportClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Site</label>
          <select value={reportSite} onChange={e => setReportSite(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">All</option>
            {reportSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { key: "daily", title: "Daily Report", icon: "📋", desc: "Attendance for a specific date", color: "blue", action: () => dl("daily", `/admin/reports/daily?date=${date}&format=xlsx`, `daily_${date}.xlsx`) },
          { key: "monthly", title: "Monthly Report", icon: "📊", desc: "Full month attendance summary", color: "purple", action: () => dl("monthly", `/admin/reports/monthly?month=${reportMonth}&format=xlsx`, `monthly_${reportMonth}.xlsx`) },
          { key: "payroll", title: "Payroll Report", icon: "💰", desc: "Wages breakdown for payroll", color: "emerald", action: () => dl("payroll", `/admin/reports/payroll?month=${reportMonth}&format=xlsx`, `payroll_${reportMonth}.xlsx`) },
          { key: "payInc", title: "Payroll + Incentives", icon: "🏆", desc: "Payroll with incentive bonuses", color: "amber", action: () => dl("payInc", `/admin/reports/payroll-with-incentives?month=${reportMonth}&format=xlsx`, `payroll_incentives_${reportMonth}.xlsx`) },
          { key: "labour", title: "Labour Report", icon: "👷", desc: "Individual labour history", color: "blue", action: () => { if (!reportLabour) return alert("Select a labour"); dl("labour", `/admin/reports/labour/${reportLabour}?month=${reportMonth}&format=xlsx`, `labour_${reportMonth}.xlsx`); } },
          { key: "client", title: "Client Report", icon: "🏢", desc: "Client-wise attendance", color: "purple", action: () => { if (!reportClient) return alert("Select a client"); dl("client", `/admin/reports/client/${reportClient}?month=${reportMonth}&format=xlsx`, `client_${reportMonth}.xlsx`); } },
          { key: "site", title: "Site Report", icon: "📍", desc: "Site-wise attendance", color: "emerald", action: () => { if (!reportSite) return alert("Select a site"); dl("site", `/admin/reports/site/${reportSite}?month=${reportMonth}&format=xlsx`, `site_${reportMonth}.xlsx`); } },
        ].map(r => {
          const colors = { blue: "border-l-blue-500 hover:border-l-blue-600", purple: "border-l-violet-500 hover:border-l-violet-600", emerald: "border-l-emerald-500 hover:border-l-emerald-600", amber: "border-l-amber-500 hover:border-l-amber-600" };
          const btnColors = { blue: "bg-blue-600 hover:bg-blue-700", purple: "bg-violet-600 hover:bg-violet-700", emerald: "bg-emerald-600 hover:bg-emerald-700", amber: "bg-amber-600 hover:bg-amber-700" };
          return (
            <div key={r.key} className={`bg-white rounded-xl border-l-4 ${colors[r.color]} border border-gray-100 shadow-sm p-5 transition-all`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{r.icon}</span>
                <h3 className="font-semibold text-gray-900">{r.title}</h3>
              </div>
              <p className="text-xs text-gray-500 mb-4">{r.desc}</p>
              <button onClick={r.action} disabled={dlFlags[r.key]} className={`w-full px-4 py-2.5 ${btnColors[r.color]} text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40`}>
                {dlFlags[r.key] ? "Downloading..." : "📥 Download"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════
  // RENDER: SETTINGS
  // ════════════════════════════════════════════════════════
  const renderSettings = () => (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {SETTINGS_TABS.map(t => (
          <button key={t.id} onClick={() => setSettingsTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              settingsTab === t.id
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {settingsTab === "labours" && <LabourManagement />}
      {settingsTab === "clients" && <ClientManagement />}
      {settingsTab === "sites" && <SiteManagement />}
      {settingsTab === "holidays" && <HolidayManagement />}
      {settingsTab === "incentives" && <IncentiveManagement />}
      {settingsTab === "managers" && <ManagerManagement />}
      {settingsTab === "config" && <ConfigManagement />}
    </div>
  );

  // ════════════════════════════════════════════════════════
  // MAIN LAYOUT: SIDEBAR + CONTENT
  // ════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed md:sticky top-0 left-0 h-screen w-60 bg-white border-r border-gray-200/80 z-40 flex flex-col transform transition-transform duration-200 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        {/* Brand */}
        <div className="h-16 flex items-center px-5 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-sm mr-3 shadow-md shadow-blue-600/20">W</div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">WorkTrack</h1>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Admin Panel</p>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Navigation</p>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                activeTab === item.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              }`}>
              <span className={activeTab === item.id ? "text-blue-600" : "text-gray-400"}>{item.icon}</span>
              <span>{item.label}</span>
              {activeTab === item.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
            </button>
          ))}
        </nav>

        {/* User Info */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 text-sm font-bold shadow-sm">
              {(user?.name || "A").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.name || "Admin"}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">System Admin</p>
            </div>
            <button onClick={() => { setAuth(null, null); window.location.href = "/"; }}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Logout">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200/80 flex items-center px-4 md:px-6 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden mr-3 p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">{NAV_ITEMS.find(n => n.id === activeTab)?.icon}</span>
            <h2 className="text-lg font-semibold text-gray-900">{NAV_ITEMS.find(n => n.id === activeTab)?.label}</h2>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {activeTab === "overview" && renderOverview()}
            {activeTab === "daily" && renderDaily()}
            {activeTab === "attendance" && renderPA()}
            {activeTab === "reports" && renderReports()}
            {activeTab === "settings" && renderSettings()}
          </div>
        </main>
      </div>
    </div>
  );
}