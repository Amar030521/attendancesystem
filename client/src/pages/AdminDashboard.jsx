import React, { useEffect, useState, useMemo } from "react";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Pagination } from "../components/Pagination";
import { LabourManagement } from "../components/LabourManagement";
import { ClientManagement } from "../components/ClientManagement";
import { SiteManagement } from "../components/SiteManagement";
import { HolidayManagement } from "../components/HolidayManagement";
import { ConfigManagement } from "../components/ConfigManagement";
import { IncentiveManagement } from "../components/IncentiveManagement";
import { ManagerManagement } from "../components/ManagerManagement";
import { api, getStoredUser, setAuth } from "../api";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, BarController, PointElement, LineElement, LineController, ArcElement, Title, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, PointElement, LineElement, LineController, ArcElement, Title, Tooltip, Legend, Filler);

function formatCurrency(a) { return "AED " + (a || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
const todayISO = () => new Date().toISOString().slice(0, 10);
const yesterdayISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
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

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "📈" },
  { id: "daily", label: "Daily View", icon: "📋" },
  { id: "attendance", label: "Attendance", icon: "👥" },
  { id: "reports", label: "Reports", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙️" },
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
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
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
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // PRESENT/ABSENT
  const [paDate, setPaDate] = useState(yesterdayISO());
  const [paData, setPaData] = useState(null);
  const [paLoading, setPaLoading] = useState(false);
  const [paFilter, setPaFilter] = useState("all");
  const [markModal, setMarkModal] = useState(null);
  const [markForm, setMarkForm] = useState({ client_id: "", site_id: "", start_time: "", end_time: "" });
  const [markSaving, setMarkSaving] = useState(false);
  const [paSearch, setPaSearch] = useState("");
  const [paPage, setPaPage] = useState(1);
  const PA_PAGE_SIZE = 15;

  // REPORTS
  const [reportMonth, setReportMonth] = useState(currentMonth());
  const [reportStart, setReportStart] = useState(todayISO());
  const [reportEnd, setReportEnd] = useState(todayISO());
  const [reportLabours, setReportLabours] = useState([]);
  const [reportClients, setReportClients] = useState([]);
  const [reportSites, setReportSites] = useState([]);
  const [selectedLabour, setSelectedLabour] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [reportDownloading, setReportDownloading] = useState("");

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

  // ─── MEMOS ───
  const clientSites = useMemo(() => filterClient ? sites.filter(s => String(s.client_id) === String(filterClient)) : [], [filterClient, sites]);
  const filteredRows = useMemo(() => { let r = dailyRows; if (filterClient) r = r.filter(x => String(x.client_id) === String(filterClient)); if (filterSites.length) r = r.filter(x => filterSites.includes(String(x.site_id))); return r; }, [dailyRows, filterClient, filterSites]);
  const summary = useMemo(() => ({ total: filteredRows.length, pending: filteredRows.filter(r => !r.admin_verified).length, wages: filteredRows.reduce((s, r) => s + (r.total_pay || 0), 0) }), [filteredRows]);
  const filterLabel = useMemo(() => { if (!filterClient) return ""; const c = clients.find(c => String(c.id) === String(filterClient)); let l = c ? c.name : ""; if (filterSites.length && filterSites.length < clientSites.length) l += " > " + filterSites.map(sid => { const s = sites.find(x => String(x.id) === sid); return s ? s.name : sid; }).join(", "); return l; }, [filterClient, filterSites, clients, sites, clientSites]);
  const editSites = sites.filter(s => String(s.client_id) === String(editForm.client_id));
  const markSites = sites.filter(s => String(s.client_id) === String(markForm.client_id));
  const reportClientSites = useMemo(() => selectedClient ? reportSites.filter(s => String(s.client_id) === String(selectedClient)) : [], [selectedClient, reportSites]);
  const paFilteredLabours = useMemo(() => { if (!paData) return []; return paFilter === "all" ? paData.labours : paData.labours.filter(l => l.status === paFilter); }, [paData, paFilter]);
  const paSearched = useMemo(() => { if (!paSearch.trim()) return paFilteredLabours; const s = paSearch.toLowerCase(); return paFilteredLabours.filter(l => l.name.toLowerCase().includes(s) || String(l.labour_id).includes(s)); }, [paFilteredLabours, paSearch]);
  const paTotalPages = Math.ceil(paSearched.length / PA_PAGE_SIZE);
  const paPaged = paSearched.slice((paPage - 1) * PA_PAGE_SIZE, paPage * PA_PAGE_SIZE);

  // ─── DAILY HANDLERS ───
  async function handleVerifyRow(id) { try { setVerifying(true); await api.put(`/admin/attendance/${id}/verify`); await loadDaily(); } catch (e) { console.error(e); } finally { setVerifying(false); } }
  async function handleVerifyAll() { try { setVerifying(true); const ids = filteredRows.filter(r => !r.admin_verified).map(r => r.id); if (!ids.length) return; await api.put("/admin/attendance/bulk-verify", { ids }); await loadDaily(); } catch (e) { console.error(e); } finally { setVerifying(false); } }
  async function handleDeleteAtt(id, name) { if (!window.confirm(`Delete record for ${name}?`)) return; try { await api.delete(`/admin/attendance/${id}`); await loadDaily(); } catch (e) { alert("Failed to delete"); } }
  function openEdit(row) { setEditModal(row); setEditForm({ client_id: row.client_id, site_id: row.site_id, start_time: row.start_time, end_time: row.end_time }); }
  async function saveEdit() { try { setEditSaving(true); await api.put(`/admin/attendance/${editModal.id}`, editForm); setEditModal(null); await loadDaily(); } catch (e) { alert(e.response?.data?.message || "Failed"); } finally { setEditSaving(false); } }
  async function dlExcel() { try { setDownloading(true); let u = `/admin/reports/daily?date=${date}&format=xlsx`; if (filterClient) u += `&client_id=${filterClient}`; if (filterSites.length) u += `&site_ids=${filterSites.join(",")}`; await downloadFile(u, `Report_${date}.xlsx`); } catch (e) { alert("Failed"); } finally { setDownloading(false); } }
  async function dlPdfDaily() { try { setDownloading(true); let u = `/admin/reports/daily?date=${date}&format=pdf`; if (filterClient) u += `&client_id=${filterClient}`; if (filterSites.length) u += `&site_ids=${filterSites.join(",")}`; await downloadPdf(u, `Report_${date}.pdf`); } catch (e) { alert("Failed"); } finally { setDownloading(false); } }
  async function dlReport(url, fn, key) { try { setReportDownloading(key); await downloadFile(url, fn); } catch (e) { alert("Download failed"); } finally { setReportDownloading(""); } }

  // ─── PA HANDLERS ───
  function openMarkPresent(labour) {
    setMarkModal({ labour_id: labour.labour_id, name: labour.name, action: "present" });
    setMarkForm({ client_id: "", site_id: "", start_time: "", end_time: "" });
  }
  async function handleMarkPresent() {
    if (!markForm.client_id || !markForm.site_id) { alert("Select client and site"); return; }
    try {
      setMarkSaving(true);
      await api.post("/admin/present-absent/mark-present", {
        labour_id: markModal.labour_id, date: paDate,
        client_id: Number(markForm.client_id), site_id: Number(markForm.site_id),
        start_time: markForm.start_time, end_time: markForm.end_time,
      });
      setMarkModal(null);
      await loadPA();
    } catch (e) { alert(e.response?.data?.message || "Failed to mark present"); }
    finally { setMarkSaving(false); }
  }
  async function handleMarkAbsent(labour) {
    if (!window.confirm(`Mark ${labour.name} as ABSENT for ${paDate}? This will delete their attendance record.`)) return;
    try {
      await api.delete(`/admin/present-absent/mark-absent/${labour.labour_id}/${paDate}`);
      await loadPA();
    } catch (e) { alert(e.response?.data?.message || "Failed to mark absent"); }
  }

  const handleNavClick = (id) => { setActiveTab(id); setSidebarOpen(false); };

  // ════════════════════════════════════════
  // RENDER: OVERVIEW
  // ════════════════════════════════════════
  const renderOverview = () => {
    if (analyticsLoading) return <LoadingSpinner label="Loading analytics..." />;
    if (!analytics) return <div className="text-center text-gray-400 py-12">No analytics data available</div>;
    const { summary: s, dailyTrend, clientBreakdown, siteBreakdown, topLabours } = analytics;

    const trendData = {
      labels: dailyTrend.map(d => d.date.slice(5)),
      datasets: [
        { type: "bar", label: "Workers", data: dailyTrend.map(d => d.count), backgroundColor: "rgba(59,130,246,0.18)", borderColor: "#3b82f6", borderWidth: 1, borderRadius: 6, yAxisID: "y", order: 2 },
        { type: "line", label: "Wages (AED)", data: dailyTrend.map(d => Math.round(d.wages)), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.06)", fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#fff", pointBorderColor: "#10b981", pointBorderWidth: 2, yAxisID: "y1", order: 1 },
      ],
    };
    const trendOpts = {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "top", labels: { usePointStyle: true, boxWidth: 6, padding: 16, font: { size: 11 } } }, tooltip: { backgroundColor: "#1e293b", padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => ctx.dataset.label === "Wages (AED)" ? ` Wages: AED ${ctx.raw.toLocaleString()}` : ` Workers: ${ctx.raw}` } } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "Workers", font: { size: 10 } }, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { stepSize: 1, font: { size: 10 } } }, y1: { position: "right", beginAtZero: true, title: { display: true, text: "Wages (AED)", font: { size: 10 } }, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } },
    };
    const pieData = { labels: clientBreakdown.map(c => c.client_name), datasets: [{ data: clientBreakdown.map(c => Math.round(c.wages * 100) / 100), backgroundColor: COLORS.slice(0, clientBreakdown.length), borderWidth: 0 }] };
    const pieOpts = { responsive: true, maintainAspectRatio: false, cutout: "60%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } }, tooltip: { backgroundColor: "#1e293b", padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => ` ${ctx.label}: AED ${ctx.raw.toLocaleString()} (${Math.round(ctx.raw / clientBreakdown.reduce((s, c) => s + c.wages, 0) * 100)}%)` } } } };
    const siteChartData = { labels: siteBreakdown.map(s => s.site_name), datasets: [{ data: siteBreakdown.map(s => Math.round(s.wages * 100) / 100), backgroundColor: COLORS.slice(0, siteBreakdown.length).map(c => c + "33"), borderColor: COLORS.slice(0, siteBreakdown.length), borderWidth: 1.5, borderRadius: 4 }] };
    const siteOpts = { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1e293b", padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => ` AED ${ctx.raw.toLocaleString()} (${siteBreakdown[ctx.dataIndex]?.days || 0} days)` } } }, scales: { x: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.04)" } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } } };
    const earnerData = { labels: topLabours.map(l => l.name), datasets: [{ data: topLabours.map(l => Math.round(l.wages * 100) / 100), backgroundColor: topLabours.map((_, i) => i < 3 ? "rgba(245,158,11,0.2)" : "rgba(59,130,246,0.12)"), borderColor: topLabours.map((_, i) => i < 3 ? "#f59e0b" : "#3b82f6"), borderWidth: 1.5, borderRadius: 4 }] };
    const earnerOpts = { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1e293b", padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => { const l = topLabours[ctx.dataIndex]; return ` AED ${ctx.raw.toLocaleString()} (${l?.days}d / ${Math.round(l?.hours)}h)`; } } } }, scales: { x: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.04)" } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } } };

    return (
      <div className="space-y-5">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { l: "Active Labours", v: s.totalLabours, sub: "Registered workers", bg: "from-blue-500 to-blue-600", icon: "👷" },
            { l: "Present Today", v: `${s.presentToday}/${s.totalLabours}`, sub: `${s.totalLabours ? Math.round(s.presentToday/s.totalLabours*100) : 0}% attendance`, bg: "from-emerald-500 to-emerald-600", icon: "✅" },
            { l: "Month Wages", v: formatCurrency(s.totalWagesMonth), sub: `${s.uniqueWorkDays} work days`, bg: "from-violet-500 to-violet-600", icon: "💰" },
            { l: "Month Hours", v: `${Math.round(s.totalHoursMonth)}h`, sub: `Avg ${s.avgDailyWage ? formatCurrency(s.avgDailyWage) : "AED 0"}/entry`, bg: "from-amber-500 to-amber-600", icon: "⏱" },
          ].map((m, i) => (
            <div key={i} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${m.bg} p-4 md:p-5 text-white shadow-lg`}>
              <div className="absolute top-2 right-2 w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{background:"rgba(255,255,255,0.15)"}}>{m.icon}</div>
              <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">{m.l}</p>
              <p className="text-xl md:text-2xl font-bold mt-1 leading-tight">{m.v}</p>
              <p className="text-[10px] text-white/50 mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>
        {/* Secondary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Regular Pay", v: formatCurrency(s.totalRegularMonth), dot: "#3b82f6" },
            { l: "OT Pay", v: formatCurrency(s.totalOTMonth), dot: "#f59e0b" },
            { l: "Advance Given", v: s.totalAdvancePayment > 0 ? formatCurrency(s.totalAdvancePayment) : "AED 0", dot: "#ef4444" },
            { l: "Work Days", v: s.uniqueWorkDays, dot: "#8b5cf6" },
          ].map((m, i) => (
            <div key={i} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-1.5 mb-0.5"><div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: m.dot}} /><span className="text-[10px] text-gray-400 font-medium">{m.l}</span></div>
              <p className="text-base font-bold text-gray-900">{m.v}</p>
            </div>
          ))}
        </div>
        {/* Trend */}
        {dailyTrend.length > 0 && <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><h3 className="text-sm font-semibold text-gray-800 mb-3">Daily Trend — Last 14 Days</h3><div style={{ height: 280 }}><Bar data={trendData} options={trendOpts} /></div></div>}
        {/* Pie + Sites */}
        <div className="grid lg:grid-cols-2 gap-4">
          {clientBreakdown.length > 0 && <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><h3 className="text-sm font-semibold text-gray-800 mb-3">Client Revenue Share</h3><div style={{ height: 260 }}><Doughnut data={pieData} options={pieOpts} /></div></div>}
          {siteBreakdown.length > 0 && <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><h3 className="text-sm font-semibold text-gray-800 mb-3">Top Sites</h3><div style={{ height: Math.max(siteBreakdown.length * 40, 160) }}><Bar data={siteChartData} options={siteOpts} /></div></div>}
        </div>
        {/* Earners */}
        {topLabours.length > 0 && <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><h3 className="text-sm font-semibold text-gray-800 mb-3">Top Earners</h3><div style={{ height: Math.max(topLabours.length * 38, 180) }}><Bar data={earnerData} options={earnerOpts} /></div></div>}
      </div>
    );
  };

  // ════════════════════════════════════════
  // RENDER: DAILY VIEW
  // ════════════════════════════════════════
  const renderDaily = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Client</label>
            <select value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterSites([]); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">All Clients</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {filterClient && clientSites.length > 0 && (
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Sites</label>
              <select multiple value={filterSites} onChange={e => setFilterSites([...e.target.selectedOptions].map(o => o.value))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm h-16">
                {clientSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={handleVerifyAll} disabled={verifying} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40">{verifying ? "..." : "✓ Verify All"}</button>
            <button onClick={dlExcel} disabled={downloading} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40">📥 Excel</button>
            <button onClick={dlPdfDaily} disabled={downloading} className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40">📄 PDF</button>
          </div>
        </div>
        {filterLabel && <div className="mt-2 text-xs text-blue-600 font-medium">Filtered: {filterLabel}</div>}
      </div>

      {/* Summary */}
      {filteredRows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center"><p className="text-xs text-gray-500">Entries</p><p className="text-2xl font-bold text-gray-900">{summary.total}</p>{summary.pending > 0 && <p className="text-[10px] text-amber-500">{summary.pending} pending</p>}</div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center"><p className="text-xs text-gray-500">Total Pay</p><p className="text-2xl font-bold text-emerald-600">{formatCurrency(summary.wages)}</p></div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center"><p className="text-xs text-gray-500">Hours</p><p className="text-2xl font-bold text-blue-600">{filteredRows.reduce((s, r) => s + (r.hours_worked || 0), 0).toFixed(1)}h</p></div>
        </div>
      )}

      {/* Table */}
      {dailyLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredRows.length === 0 ? <p className="p-6 text-center text-gray-400">No records for this date</p> : filteredRows.map(row => (
              <div key={row.id} className="p-3 space-y-1">
                <div className="flex justify-between items-start">
                  <div><p className="font-semibold text-gray-900 text-sm">{row.labour_name || row.users?.name}</p>{(row.designation || row.labour_designation) && <p className="text-[10px] text-gray-400 italic">{row.designation || row.labour_designation}</p>}<p className="text-xs text-gray-500">{row.client_name || row.clients?.name} • {row.site_name || row.sites?.name}</p></div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${row.admin_verified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{row.admin_verified ? "✓" : "Pending"}</span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
                  <div className="text-xs text-gray-500">{row.start_time}-{row.end_time} • R:{formatCurrency(row.regular_pay)} OT:{formatCurrency(row.ot_pay)}</div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <button onClick={() => openEdit(row)} className="px-2 py-1 rounded-md bg-blue-50 text-blue-600 text-xs font-semibold">Edit</button>
                    {!row.admin_verified && <button onClick={() => handleVerifyRow(row.id)} disabled={verifying} className="px-2 py-1 rounded-md bg-green-50 text-green-600 text-xs font-semibold">✓</button>}
                    <button onClick={() => handleDeleteAtt(row.id, row.labour_name)} className="px-2 py-1 rounded-md bg-red-50 text-red-600 text-xs font-semibold">✗</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Labour</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Client / Site</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Shift</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Hours</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Pay</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filteredRows.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No records</td></tr> : filteredRows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.labour_name || row.users?.name}{(row.designation || row.labour_designation) && <><br /><span className="text-[11px] text-gray-400 italic font-normal">{row.designation || row.labour_designation}</span></>}</td>
                    <td className="px-4 py-3 text-gray-600"><span className="font-medium">{row.client_name || row.clients?.name}</span><br /><span className="text-xs text-gray-400">{row.site_name || row.sites?.name}</span></td>
                    <td className="px-4 py-3 text-gray-600">{row.start_time} - {row.end_time}</td>
                    <td className="px-4 py-3 text-gray-600">{row.hours_worked}h</td>
                    <td className="px-4 py-3"><span className="font-semibold text-emerald-600">{formatCurrency(row.total_pay)}</span><br /><span className="text-[10px] text-gray-400">R:{formatCurrency(row.regular_pay)} OT:{formatCurrency(row.ot_pay)}</span></td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${row.admin_verified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{row.admin_verified ? "Verified" : "Pending"}</span></td>
                    <td className="px-4 py-3"><div className="flex gap-1.5">
                      <button onClick={() => openEdit(row)} className="px-2 py-1 rounded bg-blue-500 text-white text-[11px]">Edit</button>
                      {!row.admin_verified && <button onClick={() => handleVerifyRow(row.id)} disabled={verifying} className="px-2 py-1 rounded bg-green-500 text-white text-[11px] disabled:opacity-40">✓</button>}
                      <button onClick={() => handleDeleteAtt(row.id, row.labour_name)} className="px-2 py-1 rounded bg-red-500 text-white text-[11px]">✗</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="px-6 py-4 border-b bg-gray-50 rounded-t-xl"><h3 className="text-lg font-semibold">Edit — {editModal.labour_name}</h3></div>
        <div className="px-6 py-5 space-y-4">
          <div><label className="block text-sm font-medium mb-1">Client</label><select value={editForm.client_id} onChange={e => setEditForm(f => ({ ...f, client_id: e.target.value, site_id: "" }))} className="w-full px-3 py-2 border rounded-lg text-sm">{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">Site</label><select value={editForm.site_id} onChange={e => setEditForm(f => ({ ...f, site_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select</option>{editSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="block text-sm font-medium mb-1">Start</label><input type="time" value={editForm.start_time} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div><div><label className="block text-sm font-medium mb-1">End</label><input type="time" value={editForm.end_time} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div></div>
        </div>
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex gap-3"><button onClick={() => setEditModal(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Cancel</button><button onClick={saveEdit} disabled={editSaving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">{editSaving ? "..." : "Save"}</button></div>
      </div></div>)}
    </div>
  );

  // ════════════════════════════════════════
  // RENDER: PRESENT / ABSENT
  // ════════════════════════════════════════
  const renderPA = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-end gap-3">
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" value={paDate} onChange={e => setPaDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
        <button onClick={() => setPaDate(yesterdayISO())} className={`px-3 py-2 text-sm font-medium rounded-lg ${paDate === yesterdayISO() ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>Yesterday</button>
        <button onClick={() => setPaDate(todayISO())} className={`px-3 py-2 text-sm font-medium rounded-lg ${paDate === todayISO() ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Today</button>
      </div>

      {paLoading ? <LoadingSpinner label="Loading..." /> : !paData ? <div className="text-center text-gray-500 py-8">Select a date</div> : (<>
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{ l: "Total", v: paData.summary.total, c: "bg-gray-100 text-gray-800", f: "all" },
            { l: "Present", v: paData.summary.present, c: "bg-green-100 text-green-800", f: "present" },
            { l: "Absent", v: paData.summary.absent, c: "bg-red-100 text-red-800", f: "absent" },
            { l: "Pending", v: paData.summary.pending, c: "bg-amber-100 text-amber-800", f: "pending" },
          ].map(card => (
            <button key={card.f} onClick={() => setPaFilter(card.f)} className={`rounded-xl p-3 text-center ${card.c} transition-all ${paFilter === card.f ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}>
              <div className="text-2xl font-bold">{card.v}</div><div className="text-xs font-medium">{card.l}</div>
            </button>
          ))}
        </div>

        {paData.cutoffNote && <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">⚠️ {paData.cutoffNote}</div>}

        {/* Search */}
        <input type="text" placeholder="Search by name or ID..." value={paSearch} onChange={e => { setPaSearch(e.target.value); setPaPage(1); }} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />

        {/* Labour list */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">{paPaged.map(l => (
            <div key={l.labour_id} className={`p-3 border-l-4 ${l.status === "present" ? "border-green-500" : l.status === "absent" ? "border-red-400" : "border-amber-400"}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-bold text-gray-900 truncate">{l.name}</span><span className="text-[10px] text-gray-400 shrink-0">#{l.labour_id}</span></div>
                  {l.status === "present" && l.attendance ? <div className="text-xs text-gray-500 mt-0.5 truncate">{l.attendance.client_name} • {l.attendance.start_time}-{l.attendance.end_time} • {l.attendance.hours_worked}h • {formatCurrency(l.attendance.total_pay)}</div> : l.status === "absent" ? <div className="text-xs text-red-400 mt-0.5">Did not check in</div> : <div className="text-xs text-amber-500 mt-0.5">Waiting...</div>}
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span className={`w-2 h-2 rounded-full ${l.status === "present" ? "bg-green-500" : l.status === "absent" ? "bg-red-500" : "bg-amber-400"}`}></span>
                  {l.status === "present" ? <button onClick={() => handleMarkAbsent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600">Absent</button> : <button onClick={() => openMarkPresent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-600">Present</button>}
                </div>
              </div>
            </div>
          ))}</div>
          {/* Desktop table */}
          <table className="hidden md:table min-w-full text-sm"><thead className="bg-gray-50"><tr>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
          </tr></thead><tbody className="divide-y divide-gray-100">{paPaged.map(l => (
            <tr key={l.labour_id} className="hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium">{l.labour_id}</td>
              <td className="px-3 py-2.5">{l.name}</td>
              <td className="px-3 py-2.5 text-center">
                {l.status === "present" && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">✓ Present</span>}
                {l.status === "absent" && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">✗ Absent</span>}
                {l.status === "pending" && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">⏳ Pending</span>}
              </td>
              <td className="px-3 py-2.5 text-xs text-gray-500">{l.attendance ? `${l.attendance.client_name} • ${l.attendance.site_name} • ${l.attendance.start_time}-${l.attendance.end_time} • ${l.attendance.hours_worked}h • ${formatCurrency(l.attendance.total_pay)}` : l.status === "absent" ? "Did not check in" : "Waiting..."}</td>
              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                {l.status === "present" ? <button onClick={() => handleMarkAbsent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200">Mark Absent</button> : <button onClick={() => openMarkPresent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200">Mark Present</button>}
              </td>
            </tr>
          ))}</tbody></table>
        </div>
      </>)}

      {/* Pagination */}
      <Pagination currentPage={paPage} totalPages={paTotalPages} onPageChange={setPaPage} totalItems={paSearched.length} pageSize={PA_PAGE_SIZE} />

      {/* Mark Present Modal */}
      {markModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b bg-green-50 rounded-t-xl"><h3 className="text-lg font-semibold text-green-900">Mark Present — {markModal.name}</h3><p className="text-xs text-green-700 mt-0.5">Date: {paDate}</p></div>
            <div className="px-6 py-5 space-y-4">
              <div><label className="block text-sm font-medium mb-1">Client <span className="text-red-500">*</span></label><select value={markForm.client_id} onChange={e => setMarkForm(f => ({ ...f, client_id: e.target.value, site_id: "" }))} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Site <span className="text-red-500">*</span></label><select value={markForm.site_id} onChange={e => setMarkForm(f => ({ ...f, site_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" disabled={!markForm.client_id}><option value="">{markForm.client_id ? "Select site" : "Select client first"}</option>{markSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3"><div><label className="block text-sm font-medium mb-1">Start Time</label><input type="time" value={markForm.start_time} onChange={e => setMarkForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div><div><label className="block text-sm font-medium mb-1">End Time</label><input type="time" value={markForm.end_time} onChange={e => setMarkForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div></div>
              <p className="text-xs text-gray-400">This will create an attendance record and calculate wages automatically.</p>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex gap-3"><button onClick={() => setMarkModal(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Cancel</button><button onClick={handleMarkPresent} disabled={markSaving} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{markSaving ? "Saving..." : "✓ Mark Present"}</button></div>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════
  // RENDER: REPORTS
  // ════════════════════════════════════════
  const renderReports = () => (
    <div className="space-y-5">
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm"><h3 className="text-sm font-semibold text-gray-700 mb-3">📅 Date Range</h3><div className="flex flex-wrap gap-4">
        <div><label className="block text-xs text-gray-500 mb-1">Month</label><input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Start</label><input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">End</label><input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
      </div></div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Daily Report */}
        <div className="bg-white rounded-xl border-l-4 border-l-blue-500 border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800">📅 Daily Report</h3><p className="text-xs text-gray-400 mb-3">Date: {reportStart}</p>
          <button onClick={() => dlReport(`/admin/reports/daily?date=${reportStart}&format=xlsx`, `Daily_${reportStart}.xlsx`, "daily")} disabled={reportDownloading === "daily"} className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "daily" ? "..." : "📥 Download"}</button>
        </div>
        {/* Monthly */}
        <div className="bg-white rounded-xl border-l-4 border-l-violet-500 border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800">📊 Monthly Summary</h3><p className="text-xs text-gray-400 mb-3">Month: {reportMonth}</p>
          <button onClick={() => dlReport(`/admin/reports/monthly?month=${reportMonth}&format=xlsx`, `Monthly_${reportMonth}.xlsx`, "monthly")} disabled={reportDownloading === "monthly"} className="w-full px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "monthly" ? "..." : "📥 Download"}</button>
        </div>
        {/* Payroll */}
        <div className="bg-white rounded-xl border-l-4 border-l-emerald-500 border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800">💰 Payroll</h3><p className="text-xs text-gray-400 mb-3">Month: {reportMonth}</p>
          <button onClick={() => dlReport(`/admin/reports/payroll?month=${reportMonth}&format=xlsx`, `Payroll_${reportMonth}.xlsx`, "payroll")} disabled={reportDownloading === "payroll"} className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "payroll" ? "..." : "📥 Download"}</button>
        </div>
        {/* Payroll + Incentives */}
        <div className="bg-white rounded-xl border-l-4 border-l-amber-500 border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800">🏆 Payroll + Incentives</h3><p className="text-xs text-gray-400 mb-3">Month: {reportMonth}</p>
          <button onClick={() => dlReport(`/admin/reports/payroll-with-incentives?month=${reportMonth}&format=xlsx`, `Payroll_Inc_${reportMonth}.xlsx`, "payInc")} disabled={reportDownloading === "payInc"} className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "payInc" ? "..." : "📥 Download"}</button>
        </div>
        {/* Labour Report */}
        <div className="bg-white rounded-xl border-l-4 border-l-blue-500 border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800">👷 Labour Report</h3><p className="text-xs text-gray-400 mb-2">Individual history</p>
          <select value={selectedLabour} onChange={e => setSelectedLabour(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-3"><option value="">Select...</option>{reportLabours.filter(l => l.status === "active").map(l => <option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}</select>
          <button onClick={() => dlReport(`/admin/reports/labour/${selectedLabour}?month=${reportMonth}&format=xlsx`, `Labour_${selectedLabour}.xlsx`, "labour")} disabled={!selectedLabour || reportDownloading === "labour"} className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "labour" ? "..." : "📥 Download"}</button>
        </div>
        {/* Client Report */}
        <div className="bg-white rounded-xl border-l-4 border-l-violet-500 border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800">🏢 Client Report</h3><p className="text-xs text-gray-400 mb-2">Client-wise attendance</p>
          <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSelectedSite(""); }} className="w-full px-3 py-2 border rounded-lg text-sm mb-3"><option value="">Select...</option>{reportClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button onClick={() => dlReport(`/admin/reports/client/${selectedClient}?month=${reportMonth}&format=xlsx`, `Client_${selectedClient}.xlsx`, "client")} disabled={!selectedClient || reportDownloading === "client"} className="w-full px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "client" ? "..." : "📥 Download"}</button>
        </div>
        {/* Site Report */}
        <div className="bg-white rounded-xl border-l-4 border-l-emerald-500 border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800">📍 Site Report</h3><p className="text-xs text-gray-400 mb-2">Site-wise attendance</p>
          <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-3"><option value="">Select...</option>{(selectedClient ? reportClientSites : reportSites).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button onClick={() => dlReport(`/admin/reports/site/${selectedSite}?month=${reportMonth}&format=xlsx`, `Site_${selectedSite}.xlsx`, "site")} disabled={!selectedSite || reportDownloading === "site"} className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "site" ? "..." : "📥 Download"}</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════
  // RENDER: SETTINGS (with mobile popup menu)
  // ════════════════════════════════════════
  const renderSettings = () => (
    <div>
      {/* Desktop: pill buttons */}
      <div className="hidden md:flex flex-wrap gap-2 mb-5">
        {SETTINGS_TABS.map(t => (
          <button key={t.id} onClick={() => setSettingsTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${settingsTab === t.id ? "bg-blue-600 text-white shadow-sm" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {/* Mobile: current tab button + popup menu */}
      <div className="md:hidden mb-4">
        <button onClick={() => setSettingsMenuOpen(!settingsMenuOpen)} className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-800 shadow-sm">
          <span>{SETTINGS_TABS.find(t => t.id === settingsTab)?.icon} {SETTINGS_TABS.find(t => t.id === settingsTab)?.label}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${settingsMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {settingsMenuOpen && (
          <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20 relative">
            {SETTINGS_TABS.map(t => (
              <button key={t.id} onClick={() => { setSettingsTab(t.id); setSettingsMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition-colors ${settingsTab === t.id ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}>
                <span>{t.icon}</span><span>{t.label}</span>
                {settingsTab === t.id && <span className="ml-auto text-blue-600">✓</span>}
              </button>
            ))}
          </div>
        )}
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

  // ════════════════════════════════════════
  // MAIN LAYOUT
  // ════════════════════════════════════════
  return (
    <div className="min-h-screen flex bg-gray-50">
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}
      {/* Sidebar */}
      <aside className={`fixed md:sticky top-0 left-0 h-screen w-60 bg-white border-r border-gray-200/80 z-40 flex flex-col transform transition-transform duration-200 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div className="h-14 flex items-center px-5 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-sm mr-3 shadow-sm">W</div>
          <div><h1 className="text-sm font-bold text-gray-900 leading-tight">WorkTrack</h1><p className="text-[10px] text-gray-400 uppercase tracking-wider">Admin Panel</p></div>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          <p className="px-3 text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Menu</p>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === item.id ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
              {activeTab === item.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
            </button>
          ))}
        </nav>
        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">{(user?.name || "A").charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{user?.name || "Admin"}</p><p className="text-[10px] text-gray-400">System Admin</p></div>
            <button onClick={() => { setAuth(null, null); window.location.href = "/"; }} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500" title="Logout">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 bg-white border-b border-gray-200/80 flex items-center px-4 md:px-6 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden mr-3 p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-base font-semibold text-gray-900">{NAV_ITEMS.find(n => n.id === activeTab)?.icon} {NAV_ITEMS.find(n => n.id === activeTab)?.label}</h2>
        </header>
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