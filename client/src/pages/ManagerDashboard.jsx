import React, { useEffect, useState, useMemo } from "react";
import { LayoutShell } from "../components/LayoutShell";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { api } from "../api";

function formatCurrency(a) { return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(a || 0); }
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

export function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState("daily");

  // DAILY
  const [date, setDate] = useState(todayISO());
  const [dailyRows, setDailyRows] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [filterClient, setFilterClient] = useState("");
  const [filterSites, setFilterSites] = useState([]);
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // PA
  const [paDate, setPaDate] = useState(yesterdayISO());
  const [paData, setPaData] = useState(null);
  const [paLoading, setPaLoading] = useState(false);
  const [paFilter, setPaFilter] = useState("all");
  const [markModal, setMarkModal] = useState(null);
  const [markForm, setMarkForm] = useState({ client_id: "", site_id: "", start_time: "", end_time: "" });
  const [markSaving, setMarkSaving] = useState(false);

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

  useEffect(() => { loadMaster(); }, []);
  useEffect(() => { if (activeTab === "daily") loadDaily(); }, [date, activeTab]);
  useEffect(() => { if (activeTab === "attendance") loadPA(); }, [paDate, activeTab]);
  useEffect(() => { if (activeTab === "reports") loadReportData(); }, [activeTab]);

  const BASE = "/manager";

  async function loadMaster() { try { const [c, s] = await Promise.all([api.get(`${BASE}/clients`), api.get(`${BASE}/sites`)]); setClients(c.data || []); setSites(s.data || []); } catch (e) { console.error(e); } }
  async function loadDaily() { try { setDailyLoading(true); setDailyRows((await api.get(`${BASE}/attendance?date=${date}`)).data); } catch (e) { console.error(e); } finally { setDailyLoading(false); } }
  async function loadPA() { try { setPaLoading(true); setPaData((await api.get(`${BASE}/present-absent?date=${paDate}`)).data); } catch (e) { console.error(e); } finally { setPaLoading(false); } }
  async function loadReportData() { try { const [l, c, s] = await Promise.all([api.get(`${BASE}/labours`), api.get(`${BASE}/clients`), api.get(`${BASE}/sites`)]); setReportLabours(l.data || []); setReportClients(c.data || []); setReportSites(s.data || []); } catch (e) { console.error(e); } }

  const clientSites = useMemo(() => filterClient ? sites.filter(s => String(s.client_id) === String(filterClient)) : [], [filterClient, sites]);
  const filteredRows = useMemo(() => { let r = dailyRows; if (filterClient) r = r.filter(x => String(x.client_id) === String(filterClient)); if (filterSites.length) r = r.filter(x => filterSites.includes(String(x.site_id))); return r; }, [dailyRows, filterClient, filterSites]);
  const summary = useMemo(() => ({ total: filteredRows.length, wages: filteredRows.reduce((s, r) => s + (r.total_pay || 0), 0) }), [filteredRows]);
  const editSitesOpts = sites.filter(s => String(s.client_id) === String(editForm.client_id));
  const markSitesOpts = sites.filter(s => String(s.client_id) === String(markForm.client_id));
  const reportClientSites = useMemo(() => selectedClient ? reportSites.filter(s => String(s.client_id) === String(selectedClient)) : [], [selectedClient, reportSites]);
  const paFilteredLabours = useMemo(() => { if (!paData) return []; return paFilter === "all" ? paData.labours : paData.labours.filter(l => l.status === paFilter); }, [paData, paFilter]);

  function openEdit(row) { setEditModal(row); setEditForm({ client_id: row.client_id, site_id: row.site_id, start_time: row.start_time, end_time: row.end_time }); }
  async function saveEdit() { try { setEditSaving(true); await api.put(`${BASE}/attendance/${editModal.id}`, editForm); setEditModal(null); await loadDaily(); } catch (e) { alert(e.response?.data?.message || "Failed"); } finally { setEditSaving(false); } }
  async function dlExcel() { try { setDownloading(true); let u = `${BASE}/reports/daily?date=${date}&format=xlsx`; if (filterClient) u += `&client_id=${filterClient}`; if (filterSites.length) u += `&site_ids=${filterSites.join(",")}`; await downloadFile(u, `Report_${date}.xlsx`); } catch (e) { alert("Failed"); } finally { setDownloading(false); } }
  async function dlPdf() { try { setDownloading(true); let u = `${BASE}/reports/daily?date=${date}&format=pdf`; if (filterClient) u += `&client_id=${filterClient}`; if (filterSites.length) u += `&site_ids=${filterSites.join(",")}`; await downloadPdf(u, `Report_${date}.pdf`); } catch (e) { alert("Failed"); } finally { setDownloading(false); } }
  async function dlReport(url, fn, key) { try { setReportDownloading(key); await downloadFile(url, fn); } catch (e) { alert("Download failed"); } finally { setReportDownloading(""); } }
  function openMarkPresent(labour) { setMarkModal({ labour_id: labour.labour_id, name: labour.name }); setMarkForm({ client_id: "", site_id: "", start_time: "", end_time: "" }); }
  async function handleMarkPresent() { if (!markForm.client_id || !markForm.site_id) { alert("Select client and site"); return; } try { setMarkSaving(true); await api.post(`${BASE}/present-absent/mark-present`, { labour_id: markModal.labour_id, date: paDate, client_id: Number(markForm.client_id), site_id: Number(markForm.site_id), start_time: markForm.start_time, end_time: markForm.end_time }); setMarkModal(null); await loadPA(); } catch (e) { alert(e.response?.data?.message || "Failed"); } finally { setMarkSaving(false); } }
  async function handleMarkAbsent(labour) { if (!window.confirm(`Mark ${labour.name} as ABSENT for ${paDate}?`)) return; try { await api.delete(`${BASE}/present-absent/mark-absent/${labour.labour_id}/${paDate}`); await loadPA(); } catch (e) { alert(e.response?.data?.message || "Failed"); } }

  // ==================== DAILY ====================
  const renderDaily = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="sm:w-48"><label className="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="sm:w-56"><label className="block text-xs font-medium text-gray-500 mb-1">Client</label><select value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterSites([]); }} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">All Clients</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          {filterClient && clientSites.length > 0 && (<div className="flex-1"><label className="block text-xs font-medium text-gray-500 mb-1">Sites</label><div className="flex flex-wrap gap-1.5">{clientSites.map(s => (<button key={s.id} onClick={() => setFilterSites(p => p.includes(String(s.id)) ? p.filter(x => x !== String(s.id)) : [...p, String(s.id)])} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterSites.length === 0 || filterSites.includes(String(s.id)) ? "bg-blue-100 border-blue-400 text-blue-800" : "bg-gray-50 border-gray-300 text-gray-500"}`}>{s.name}</button>))}</div></div>)}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 text-sm"><div className="bg-white rounded-lg shadow-sm px-4 py-2">Workers: <strong>{summary.total}</strong></div><div className="bg-white rounded-lg shadow-sm px-4 py-2">Wages: <strong className="text-green-600">{formatCurrency(summary.wages)}</strong></div></div>
        <div className="flex gap-2"><button onClick={dlExcel} disabled={downloading || !filteredRows.length} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40">📥 Excel</button><button onClick={dlPdf} disabled={downloading || !filteredRows.length} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-40">📥 PDF</button></div>
      </div>
      {dailyLoading ? <LoadingSpinner label="Loading..." /> : !filteredRows.length ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center"><p className="text-gray-500 text-sm">No records for {date}</p></div>
      ) : (<>
        {/* MOBILE */}
        <div className="md:hidden space-y-2">{filteredRows.map(row => (
          <div key={row.id} className="bg-white rounded-xl shadow-sm p-3 border-l-4 border-blue-400">
            <div className="flex items-start justify-between mb-1.5"><div><div className="flex items-center gap-2"><span className="text-sm font-bold text-gray-900">{row.labour_name}</span><span className="text-[10px] text-gray-400">#{row.labour_id}</span></div><div className="text-xs text-gray-500">{row.client_name} • {row.site_name}</div></div><div className="text-right"><div className="text-sm font-bold text-green-600">{formatCurrency(row.total_pay)}</div><div className="text-[10px] text-gray-400">{row.hours_worked}h</div></div></div>
            <div className="flex items-center justify-between pt-1.5 border-t border-gray-100"><div className="text-xs text-gray-500">{row.start_time}-{row.end_time} • R:{formatCurrency(row.regular_pay)} OT:{formatCurrency(row.ot_pay)}</div><button onClick={() => openEdit(row)} className="px-2 py-1 rounded-md bg-blue-50 text-blue-600 text-xs font-semibold ml-2 shrink-0">Edit</button></div>
          </div>))}</div>
        {/* DESKTOP */}
        <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase"><th className="px-3 py-3 text-left">ID</th><th className="px-3 py-3 text-left">Name</th><th className="px-3 py-3 text-left">Client</th><th className="px-3 py-3 text-left">Site</th><th className="px-3 py-3 text-center">In</th><th className="px-3 py-3 text-center">Out</th><th className="px-3 py-3 text-right">Hours</th><th className="px-3 py-3 text-right">Regular</th><th className="px-3 py-3 text-right">OT</th><th className="px-3 py-3 text-right">Total</th><th className="px-3 py-3 text-center">Action</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{filteredRows.map(row => (
            <tr key={row.id} className="hover:bg-blue-50/30"><td className="px-3 py-2.5 text-gray-700">{row.labour_id}</td><td className="px-3 py-2.5 font-medium">{row.labour_name}</td><td className="px-3 py-2.5 text-gray-600">{row.client_name}</td><td className="px-3 py-2.5 text-gray-600">{row.site_name}</td><td className="px-3 py-2.5 text-center">{row.start_time}</td><td className="px-3 py-2.5 text-center">{row.end_time}</td><td className="px-3 py-2.5 text-right">{row.hours_worked}</td><td className="px-3 py-2.5 text-right">{formatCurrency(row.regular_pay)}</td><td className="px-3 py-2.5 text-right">{formatCurrency(row.ot_pay)}</td><td className="px-3 py-2.5 text-right font-semibold text-green-700">{formatCurrency(row.total_pay)}</td>
              <td className="px-3 py-2.5 text-center"><button onClick={() => openEdit(row)} className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100">Edit</button></td>
            </tr>))}</tbody></table></div>
      </>)}
      {/* Edit Modal */}
      {editModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl shadow-2xl max-w-md w-full"><div className="px-5 py-4 border-b bg-gray-50 rounded-t-2xl"><h3 className="text-base font-semibold">Edit — {editModal.labour_name}</h3></div><div className="px-5 py-4 space-y-3"><div><label className="block text-sm font-medium mb-1">Client</label><select value={editForm.client_id} onChange={e => setEditForm(f => ({ ...f, client_id: e.target.value, site_id: "" }))} className="w-full px-3 py-2.5 border rounded-xl text-sm">{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="block text-sm font-medium mb-1">Site</label><select value={editForm.site_id} onChange={e => setEditForm(f => ({ ...f, site_id: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm"><option value="">Select</option>{editSitesOpts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-sm font-medium mb-1">Start</label><input type="time" value={editForm.start_time} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div><div><label className="block text-sm font-medium mb-1">End</label><input type="time" value={editForm.end_time} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div></div></div><div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex gap-3"><button onClick={() => setEditModal(null)} className="flex-1 px-4 py-2.5 border rounded-xl text-sm font-medium">Cancel</button><button onClick={saveEdit} disabled={editSaving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{editSaving ? "Saving..." : "Save"}</button></div></div></div>)}
    </div>
  );

  // ==================== PRESENT/ABSENT ====================
  const renderPA = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4"><div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"><input type="date" value={paDate} onChange={e => setPaDate(e.target.value)} className="flex-1 sm:flex-none sm:w-48 border rounded-xl px-3 py-2.5 text-sm" /><div className="flex gap-2"><button onClick={() => setPaDate(yesterdayISO())} className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors ${paDate === yesterdayISO() ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Yesterday</button><button onClick={() => setPaDate(todayISO())} className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors ${paDate === todayISO() ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Today</button></div></div></div>
      {paLoading ? <LoadingSpinner label="Loading..." /> : !paData ? <div className="text-center text-gray-500 py-8">Select a date</div> : (<>
        <div className="grid grid-cols-4 gap-2">{[{ l: "All", v: paData.summary.total, c: "bg-gray-100 text-gray-800", f: "all" },{ l: "Present", v: paData.summary.present, c: "bg-green-100 text-green-800", f: "present" },{ l: "Absent", v: paData.summary.absent, c: "bg-red-100 text-red-800", f: "absent" },{ l: "Pending", v: paData.summary.pending, c: "bg-amber-100 text-amber-800", f: "pending" }].map(card => (<button key={card.f} onClick={() => setPaFilter(card.f)} className={`rounded-xl p-2.5 text-center transition-all ${card.c} ${paFilter === card.f ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}><div className="text-xl font-bold">{card.v}</div><div className="text-[10px] font-semibold">{card.l}</div></button>))}</div>
        {paData.cutoffNote && <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800">⚠️ {paData.cutoffNote}</div>}
        {/* MOBILE */}
        <div className="md:hidden space-y-2">{paFilteredLabours.map(l => (
          <div key={l.labour_id} className={`bg-white rounded-xl shadow-sm p-3 border-l-4 ${l.status === "present" ? "border-green-500" : l.status === "absent" ? "border-red-400" : "border-amber-400"}`}>
            <div className="flex items-center justify-between"><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-bold text-gray-900 truncate">{l.name}</span><span className="text-[10px] text-gray-400">#{l.labour_id}</span></div>{l.status === "present" && l.attendance ? <div className="text-xs text-gray-500 mt-0.5 truncate">{l.attendance.client_name} • {l.attendance.start_time}-{l.attendance.end_time} • {formatCurrency(l.attendance.total_pay)}</div> : l.status === "absent" ? <div className="text-xs text-red-400 mt-0.5">Absent</div> : <div className="text-xs text-amber-500 mt-0.5">Waiting...</div>}</div>
              <div className="flex items-center gap-2 ml-3 shrink-0">{l.status === "present" ? <button onClick={() => handleMarkAbsent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600">Absent</button> : <button onClick={() => openMarkPresent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-600">Present</button>}</div>
            </div></div>))}</div>
        {/* DESKTOP */}
        <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase"><th className="px-4 py-3 text-left">ID</th><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-left">Details</th><th className="px-4 py-3 text-center">Action</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{paFilteredLabours.map(l => (
            <tr key={l.labour_id} className="hover:bg-gray-50"><td className="px-4 py-3 text-gray-700">{l.labour_id}</td><td className="px-4 py-3 font-medium">{l.name}</td>
              <td className="px-4 py-3 text-center">{l.status === "present" ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">✓ Present</span> : l.status === "absent" ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">✗ Absent</span> : <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">⏳</span>}</td>
              <td className="px-4 py-3 text-gray-500">{l.attendance ? `${l.attendance.client_name} • ${l.attendance.start_time}-${l.attendance.end_time} • ${formatCurrency(l.attendance.total_pay)}` : l.status === "absent" ? "Did not check in" : "Waiting..."}</td>
              <td className="px-4 py-3 text-center">{l.status === "present" ? <button onClick={() => handleMarkAbsent(l)} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100">Mark Absent</button> : <button onClick={() => openMarkPresent(l)} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100">Mark Present</button>}</td>
            </tr>))}</tbody></table></div>
      </>)}
      {/* Mark Present Modal */}
      {markModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl shadow-2xl max-w-md w-full"><div className="px-5 py-4 border-b bg-green-50 rounded-t-2xl"><h3 className="text-base font-semibold text-green-900">Mark Present — {markModal.name}</h3><p className="text-xs text-green-700 mt-0.5">Date: {paDate}</p></div><div className="px-5 py-4 space-y-3"><div><label className="block text-sm font-medium mb-1">Client *</label><select value={markForm.client_id} onChange={e => setMarkForm(f => ({ ...f, client_id: e.target.value, site_id: "" }))} className="w-full px-3 py-2.5 border rounded-xl text-sm"><option value="">Select</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="block text-sm font-medium mb-1">Site *</label><select value={markForm.site_id} onChange={e => setMarkForm(f => ({ ...f, site_id: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" disabled={!markForm.client_id}><option value="">{markForm.client_id ? "Select" : "Select client first"}</option>{markSitesOpts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-sm font-medium mb-1">Start</label><input type="time" value={markForm.start_time} onChange={e => setMarkForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div><div><label className="block text-sm font-medium mb-1">End</label><input type="time" value={markForm.end_time} onChange={e => setMarkForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div></div></div><div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex gap-3"><button onClick={() => setMarkModal(null)} className="flex-1 px-4 py-2.5 border rounded-xl text-sm font-medium">Cancel</button><button onClick={handleMarkPresent} disabled={markSaving} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{markSaving ? "Saving..." : "✓ Mark Present"}</button></div></div></div>)}
    </div>
  );

  // ==================== REPORTS ====================
  function ReportCard({ title, icon, color, desc, loading: ld, onDownload, children }) {
    const borderC = `border-${color}-500`;
    const btnC = `bg-${color}-600 hover:bg-${color}-700`;
    return (<div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderC} p-4 flex flex-col`}><h3 className="font-semibold text-gray-800 text-sm">{icon} {title}</h3><p className="text-xs text-gray-400 mb-3">{desc}</p>{children}<button onClick={onDownload} disabled={ld} className={`w-full mt-auto px-3 py-2.5 ${btnC} text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors`}>{ld ? "..." : "📥 Download"}</button></div>);
  }

  const renderReports = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4"><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><label className="block text-xs text-gray-500 mb-1 font-medium">Month</label><input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div><div><label className="block text-xs text-gray-500 mb-1 font-medium">Start</label><input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div><div><label className="block text-xs text-gray-500 mb-1 font-medium">End</label><input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div></div></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <ReportCard title="Daily Report" icon="📅" color="blue" desc={`Date: ${reportStart}`} loading={reportDownloading === "daily"} onDownload={() => dlReport(`${BASE}/reports/daily?date=${reportStart}&format=xlsx`, `Daily_${reportStart}.xlsx`, "daily")} />
        <ReportCard title="Monthly Summary" icon="📊" color="purple" desc={`Month: ${reportMonth}`} loading={reportDownloading === "monthly"} onDownload={() => dlReport(`${BASE}/reports/monthly?month=${reportMonth}&format=xlsx`, `Monthly_${reportMonth}.xlsx`, "monthly")} />
        <ReportCard title="Payroll" icon="💰" color="red" desc={`Month: ${reportMonth}`} loading={reportDownloading === "payroll"} onDownload={() => dlReport(`${BASE}/reports/payroll?month=${reportMonth}&format=xlsx`, `Payroll_${reportMonth}.xlsx`, "payroll")} />
        <ReportCard title="Labour Report" icon="👷" color="green" desc="Individual" loading={reportDownloading === "labour"} onDownload={() => dlReport(`${BASE}/reports/labour/${selectedLabour}?month=${reportMonth}&format=xlsx`, `Labour_${selectedLabour}.xlsx`, "labour")}><select value={selectedLabour} onChange={e => setSelectedLabour(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-2"><option value="">Select...</option>{reportLabours.filter(l => l.status === "active").map(l => <option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}</select></ReportCard>
        <ReportCard title="Client Report" icon="🏢" color="orange" desc={`${reportStart} to ${reportEnd}`} loading={reportDownloading === "client"} onDownload={() => dlReport(`${BASE}/reports/client/${selectedClient}?start=${reportStart}&end=${reportEnd}&format=xlsx`, `Client_${selectedClient}.xlsx`, "client")}><select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSelectedSite(""); }} className="w-full px-3 py-2 border rounded-lg text-sm mb-2"><option value="">Select...</option>{reportClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></ReportCard>
        <ReportCard title="Site Report" icon="📍" color="teal" desc={`${reportStart} to ${reportEnd}`} loading={reportDownloading === "site"} onDownload={() => dlReport(`${BASE}/reports/site/${selectedSite}?start=${reportStart}&end=${reportEnd}&format=xlsx`, `Site_${selectedSite}.xlsx`, "site")}><select value={selectedSite} onChange={e => setSelectedSite(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-2"><option value="">Select...</option>{(selectedClient ? reportClientSites : reportSites).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></ReportCard>
      </div>
    </div>
  );

  const tabs = [{ id: "daily", l: "📋 Daily", }, { id: "attendance", l: "👥 Attendance" }, { id: "reports", l: "📊 Reports" }];

  return (
    <LayoutShell title="Manager Dashboard">
      <div className="max-w-7xl mx-auto">
        <div className="mb-5 overflow-x-auto -mx-3 px-3"><nav className="flex gap-1 min-w-max border-b pb-0">{tabs.map(t => (<button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{t.l}</button>))}</nav></div>
        {activeTab === "daily" && renderDaily()}
        {activeTab === "attendance" && renderPA()}
        {activeTab === "reports" && renderReports()}
      </div>
    </LayoutShell>
  );
}