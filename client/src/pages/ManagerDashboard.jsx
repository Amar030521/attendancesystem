import React, { useEffect, useState, useMemo } from "react";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Pagination } from "../components/Pagination";
import { api, getStoredUser, setAuth } from "../api";

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

const NAV_ITEMS = [
  { id: "daily", label: "Daily View", icon: "📋" },
  { id: "attendance", label: "Attendance", icon: "👥" },
  { id: "reports", label: "Reports", icon: "📊" },
];

export function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState("daily");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = getStoredUser();
  const BASE = "/manager";

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

  useEffect(() => { loadMaster(); }, []);
  useEffect(() => { if (activeTab === "daily") loadDaily(); }, [date, activeTab]);
  useEffect(() => { if (activeTab === "attendance") loadPA(); }, [paDate, activeTab]);
  useEffect(() => { if (activeTab === "reports") loadReportData(); }, [activeTab]);

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
  const paSearched = useMemo(() => { if (!paSearch.trim()) return paFilteredLabours; const s = paSearch.toLowerCase(); return paFilteredLabours.filter(l => l.name.toLowerCase().includes(s) || String(l.labour_id).includes(s)); }, [paFilteredLabours, paSearch]);
  const paTotalPages = Math.ceil(paSearched.length / PA_PAGE_SIZE);
  const paPaged = paSearched.slice((paPage - 1) * PA_PAGE_SIZE, paPage * PA_PAGE_SIZE);

  function openEdit(row) { setEditModal(row); setEditForm({ client_id: row.client_id, site_id: row.site_id, start_time: row.start_time, end_time: row.end_time }); }
  async function saveEdit() { try { setEditSaving(true); await api.put(`${BASE}/attendance/${editModal.id}`, editForm); setEditModal(null); await loadDaily(); } catch (e) { alert(e.response?.data?.message || "Failed"); } finally { setEditSaving(false); } }
  async function dlExcel() { try { setDownloading(true); let u = `${BASE}/reports/daily?date=${date}&format=xlsx`; if (filterClient) u += `&client_id=${filterClient}`; if (filterSites.length) u += `&site_ids=${filterSites.join(",")}`; await downloadFile(u, `Report_${date}.xlsx`); } catch (e) { alert("Failed"); } finally { setDownloading(false); } }
  async function dlPdfDaily() { try { setDownloading(true); let u = `${BASE}/reports/daily?date=${date}&format=pdf`; if (filterClient) u += `&client_id=${filterClient}`; if (filterSites.length) u += `&site_ids=${filterSites.join(",")}`; await downloadPdf(u, `Report_${date}.pdf`); } catch (e) { alert("Failed"); } finally { setDownloading(false); } }
  async function dlReport(url, fn, key) { try { setReportDownloading(key); await downloadFile(url, fn); } catch (e) { alert("Download failed"); } finally { setReportDownloading(""); } }
  function openMarkPresent(labour) { setMarkModal({ labour_id: labour.labour_id, name: labour.name }); setMarkForm({ client_id: "", site_id: "", start_time: "", end_time: "" }); }
  async function handleMarkPresent() { if (!markForm.client_id || !markForm.site_id) { alert("Select client and site"); return; } try { setMarkSaving(true); await api.post(`${BASE}/present-absent/mark-present`, { labour_id: markModal.labour_id, date: paDate, client_id: Number(markForm.client_id), site_id: Number(markForm.site_id), start_time: markForm.start_time, end_time: markForm.end_time }); setMarkModal(null); await loadPA(); } catch (e) { alert(e.response?.data?.message || "Failed"); } finally { setMarkSaving(false); } }
  async function handleMarkAbsent(labour) { if (!window.confirm(`Mark ${labour.name} as ABSENT for ${paDate}?`)) return; try { await api.delete(`${BASE}/present-absent/mark-absent/${labour.labour_id}/${paDate}`); await loadPA(); } catch (e) { alert(e.response?.data?.message || "Failed"); } }

  const handleNavClick = (id) => { setActiveTab(id); setSidebarOpen(false); };

  // ══════ DAILY ══════
  const renderDaily = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Client</label><select value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterSites([]); }} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">All Clients</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          {filterClient && clientSites.length > 0 && <div><label className="block text-xs font-medium text-gray-500 mb-1">Sites</label><div className="flex flex-wrap gap-1.5">{clientSites.map(s => (<button key={s.id} onClick={() => setFilterSites(p => p.includes(String(s.id)) ? p.filter(x => x !== String(s.id)) : [...p, String(s.id)])} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filterSites.length === 0 || filterSites.includes(String(s.id)) ? "bg-blue-100 border-blue-400 text-blue-800" : "bg-gray-50 border-gray-300 text-gray-500"}`}>{s.name}</button>))}</div></div>}
          <div className="flex gap-2 ml-auto">
            <button onClick={dlExcel} disabled={downloading || !filteredRows.length} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-40">📥 Excel</button>
            <button onClick={dlPdfDaily} disabled={downloading || !filteredRows.length} className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg disabled:opacity-40">📄 PDF</button>
          </div>
        </div>
      </div>
      {filteredRows.length > 0 && <div className="grid grid-cols-2 gap-3"><div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center"><p className="text-xs text-gray-500">Workers</p><p className="text-2xl font-bold text-gray-900">{summary.total}</p></div><div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center"><p className="text-xs text-gray-500">Total Wages</p><p className="text-2xl font-bold text-emerald-600">{formatCurrency(summary.wages)}</p></div></div>}
      {dailyLoading ? <LoadingSpinner /> : !filteredRows.length ? <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-gray-100">No records for {date}</div> : (<>
        <div className="md:hidden space-y-2">{filteredRows.map(row => (<div key={row.id} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm"><div className="flex justify-between items-start mb-1"><div><p className="text-sm font-bold text-gray-900">{row.labour_name}</p>{(row.labour_designation || row.designation) && <p className="text-[10px] text-gray-400 italic">{row.labour_designation || row.designation}</p>}<p className="text-xs text-gray-500">{row.client_name} • {row.site_name}</p></div><div className="text-right"><p className="text-sm font-bold text-emerald-600">{formatCurrency(row.total_pay)}</p><p className="text-[10px] text-gray-400">{row.hours_worked}h</p></div></div><div className="flex items-center justify-between pt-1.5 border-t border-gray-100"><span className="text-xs text-gray-500">{row.start_time}-{row.end_time}</span><button onClick={() => openEdit(row)} className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold">Edit</button></div></div>))}</div>
        <div className="hidden md:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Labour</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Client / Site</th><th className="px-4 py-3 text-xs font-semibold text-gray-600">Shift</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Hours</th><th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Pay</th><th className="px-4 py-3 text-xs font-semibold text-gray-600">Actions</th></tr></thead><tbody className="divide-y divide-gray-50">{filteredRows.map(row => (<tr key={row.id} className="hover:bg-gray-50/50"><td className="px-4 py-3 font-medium text-gray-900">{row.labour_name}{(row.labour_designation || row.designation) && <><br /><span className="text-[11px] text-gray-400 italic font-normal">{row.labour_designation || row.designation}</span></>}</td><td className="px-4 py-3"><span className="font-medium text-gray-700">{row.client_name}</span><br /><span className="text-xs text-gray-400">{row.site_name}</span></td><td className="px-4 py-3 text-gray-600 text-center">{row.start_time} - {row.end_time}</td><td className="px-4 py-3 text-right text-gray-600">{row.hours_worked}h</td><td className="px-4 py-3 text-right"><span className="font-semibold text-emerald-600">{formatCurrency(row.total_pay)}</span></td><td className="px-4 py-3 text-center"><button onClick={() => openEdit(row)} className="px-2.5 py-1 rounded-lg bg-blue-500 text-white text-xs font-medium">Edit</button></td></tr>))}</tbody></table></div>
      </>)}
      {editModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-2xl max-w-md w-full"><div className="px-6 py-4 border-b bg-gray-50 rounded-t-xl"><h3 className="text-lg font-semibold">Edit — {editModal.labour_name}</h3></div><div className="px-6 py-5 space-y-4"><div><label className="block text-sm font-medium mb-1">Client</label><select value={editForm.client_id} onChange={e => setEditForm(f => ({ ...f, client_id: e.target.value, site_id: "" }))} className="w-full px-3 py-2 border rounded-lg text-sm">{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="block text-sm font-medium mb-1">Site</label><select value={editForm.site_id} onChange={e => setEditForm(f => ({ ...f, site_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select</option>{editSitesOpts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-sm font-medium mb-1">Start</label><input type="time" value={editForm.start_time} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div><div><label className="block text-sm font-medium mb-1">End</label><input type="time" value={editForm.end_time} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div></div></div><div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex gap-3"><button onClick={() => setEditModal(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Cancel</button><button onClick={saveEdit} disabled={editSaving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">{editSaving ? "..." : "Save"}</button></div></div></div>)}
    </div>
  );

  // ══════ ATTENDANCE ══════
  const renderPA = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-wrap items-end gap-3">
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" value={paDate} onChange={e => setPaDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
        <button onClick={() => setPaDate(yesterdayISO())} className={`px-3 py-2 text-sm font-medium rounded-lg ${paDate === yesterdayISO() ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"}`}>Yesterday</button>
        <button onClick={() => setPaDate(todayISO())} className={`px-3 py-2 text-sm font-medium rounded-lg ${paDate === todayISO() ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Today</button>
      </div>
      {paLoading ? <LoadingSpinner /> : !paData ? <div className="text-center text-gray-400 py-8">Select a date</div> : (<>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[{ l: "Total", v: paData.summary.total, c: "bg-gray-100 text-gray-800", f: "all" },{ l: "Present", v: paData.summary.present, c: "bg-green-100 text-green-800", f: "present" },{ l: "Absent", v: paData.summary.absent, c: "bg-red-100 text-red-800", f: "absent" },{ l: "Pending", v: paData.summary.pending, c: "bg-amber-100 text-amber-800", f: "pending" }].map(card => (<button key={card.f} onClick={() => setPaFilter(card.f)} className={`rounded-xl p-3 text-center ${card.c} ${paFilter === card.f ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}><div className="text-2xl font-bold">{card.v}</div><div className="text-xs font-medium">{card.l}</div></button>))}</div>
        {paData.cutoffNote && <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">⚠️ {paData.cutoffNote}</div>}
        <input type="text" placeholder="Search by name or ID..." value={paSearch} onChange={e => { setPaSearch(e.target.value); setPaPage(1); }} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="md:hidden divide-y divide-gray-100">{paPaged.map(l => (<div key={l.labour_id} className={`p-3 border-l-4 ${l.status === "present" ? "border-green-500" : l.status === "absent" ? "border-red-400" : "border-amber-400"}`}><div className="flex items-center justify-between"><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-bold text-gray-900 truncate">{l.name}</span><span className="text-[10px] text-gray-400">#{l.labour_id}</span></div>{l.status === "present" && l.attendance ? <div className="text-xs text-gray-500 mt-0.5 truncate">{l.attendance.client_name} • {l.attendance.start_time}-{l.attendance.end_time} • {formatCurrency(l.attendance.total_pay)}</div> : l.status === "absent" ? <div className="text-xs text-red-400 mt-0.5">Absent</div> : <div className="text-xs text-amber-500 mt-0.5">Waiting...</div>}</div><div className="ml-3 shrink-0">{l.status === "present" ? <button onClick={() => handleMarkAbsent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600">Absent</button> : <button onClick={() => openMarkPresent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-600">Present</button>}</div></div></div>))}</div>
          <table className="hidden md:table w-full text-sm"><thead><tr className="bg-gray-50"><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">ID</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Name</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Status</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Details</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Action</th></tr></thead><tbody className="divide-y divide-gray-100">{paPaged.map(l => (<tr key={l.labour_id} className="hover:bg-gray-50"><td className="px-4 py-3">{l.labour_id}</td><td className="px-4 py-3 font-medium">{l.name}</td><td className="px-4 py-3 text-center">{l.status === "present" ? <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">✓ Present</span> : l.status === "absent" ? <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">✗ Absent</span> : <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">⏳</span>}</td><td className="px-4 py-3 text-xs text-gray-500">{l.attendance ? `${l.attendance.client_name} • ${l.attendance.start_time}-${l.attendance.end_time} • ${formatCurrency(l.attendance.total_pay)}` : l.status === "absent" ? "Did not check in" : "Waiting..."}</td><td className="px-4 py-3 text-center">{l.status === "present" ? <button onClick={() => handleMarkAbsent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200">Mark Absent</button> : <button onClick={() => openMarkPresent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200">Mark Present</button>}</td></tr>))}</tbody></table>
        </div>
      </>)}
      <Pagination currentPage={paPage} totalPages={paTotalPages} onPageChange={setPaPage} totalItems={paSearched.length} pageSize={PA_PAGE_SIZE} />
      {markModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-2xl max-w-md w-full"><div className="px-6 py-4 border-b bg-green-50 rounded-t-xl"><h3 className="text-lg font-semibold text-green-900">Mark Present — {markModal.name}</h3><p className="text-xs text-green-700 mt-0.5">Date: {paDate}</p></div><div className="px-6 py-5 space-y-4"><div><label className="block text-sm font-medium mb-1">Client *</label><select value={markForm.client_id} onChange={e => setMarkForm(f => ({ ...f, client_id: e.target.value, site_id: "" }))} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">Select</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="block text-sm font-medium mb-1">Site *</label><select value={markForm.site_id} onChange={e => setMarkForm(f => ({ ...f, site_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" disabled={!markForm.client_id}><option value="">{markForm.client_id ? "Select" : "Select client first"}</option>{markSitesOpts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-sm font-medium mb-1">Start</label><input type="time" value={markForm.start_time} onChange={e => setMarkForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div><div><label className="block text-sm font-medium mb-1">End</label><input type="time" value={markForm.end_time} onChange={e => setMarkForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div></div></div><div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex gap-3"><button onClick={() => setMarkModal(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Cancel</button><button onClick={handleMarkPresent} disabled={markSaving} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{markSaving ? "Saving..." : "✓ Mark Present"}</button></div></div></div>)}
    </div>
  );

  // ══════ REPORTS ══════
  const renderReports = () => (
    <div className="space-y-5">
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📅 Date Range</h3>
        <div className="flex flex-wrap gap-4">
          <div><label className="block text-xs text-gray-500 mb-1">Month</label><input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Start</label><input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">End</label><input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { key: "daily", title: "Daily Report", icon: "📋", desc: `Date: ${reportStart}`, border: "border-l-blue-500", btn: "bg-blue-600 hover:bg-blue-700", action: () => dlReport(`${BASE}/reports/daily?date=${reportStart}&format=xlsx`, `Daily_${reportStart}.xlsx`, "daily") },
          { key: "monthly", title: "Monthly Summary", icon: "📊", desc: `Month: ${reportMonth}`, border: "border-l-violet-500", btn: "bg-violet-600 hover:bg-violet-700", action: () => dlReport(`${BASE}/reports/monthly?month=${reportMonth}&format=xlsx`, `Monthly_${reportMonth}.xlsx`, "monthly") },
          { key: "payroll", title: "Payroll Report", icon: "💰", desc: `Month: ${reportMonth}`, border: "border-l-emerald-500", btn: "bg-emerald-600 hover:bg-emerald-700", action: () => dlReport(`${BASE}/reports/payroll?month=${reportMonth}&format=xlsx`, `Payroll_${reportMonth}.xlsx`, "payroll") },
        ].map(r => (
          <div key={r.key} className={`bg-white rounded-xl border-l-4 ${r.border} border border-gray-100 shadow-sm p-5`}>
            <div className="flex items-center gap-2 mb-1"><span className="text-lg">{r.icon}</span><h3 className="font-semibold text-gray-900">{r.title}</h3></div>
            <p className="text-xs text-gray-500 mb-4">{r.desc}</p>
            <button onClick={r.action} disabled={reportDownloading === r.key} className={`w-full px-4 py-2.5 ${r.btn} text-white text-sm font-semibold rounded-lg disabled:opacity-40`}>{reportDownloading === r.key ? "Downloading..." : "📥 Download"}</button>
          </div>
        ))}
        {/* Labour Report */}
        <div className="bg-white rounded-xl border-l-4 border-l-blue-500 border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1"><span className="text-lg">👷</span><h3 className="font-semibold text-gray-900">Labour Report</h3></div>
          <p className="text-xs text-gray-500 mb-3">Individual history</p>
          <select value={selectedLabour} onChange={e => setSelectedLabour(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-3"><option value="">Select labour...</option>{reportLabours.filter(l => l.status === "active").map(l => <option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}</select>
          <button onClick={() => dlReport(`${BASE}/reports/labour/${selectedLabour}?month=${reportMonth}&format=xlsx`, `Labour_${selectedLabour}.xlsx`, "labour")} disabled={!selectedLabour || reportDownloading === "labour"} className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "labour" ? "..." : "📥 Download"}</button>
        </div>
        {/* Client Report */}
        <div className="bg-white rounded-xl border-l-4 border-l-violet-500 border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1"><span className="text-lg">🏢</span><h3 className="font-semibold text-gray-900">Client Report</h3></div>
          <p className="text-xs text-gray-500 mb-3">Client-wise attendance</p>
          <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSelectedSite(""); }} className="w-full px-3 py-2 border rounded-lg text-sm mb-3"><option value="">Select client...</option>{reportClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button onClick={() => dlReport(`${BASE}/reports/client/${selectedClient}?start=${reportStart}&end=${reportEnd}&format=xlsx`, `Client_${selectedClient}.xlsx`, "client")} disabled={!selectedClient || reportDownloading === "client"} className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "client" ? "..." : "📥 Download"}</button>
        </div>
        {/* Site Report */}
        <div className="bg-white rounded-xl border-l-4 border-l-emerald-500 border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1"><span className="text-lg">📍</span><h3 className="font-semibold text-gray-900">Site Report</h3></div>
          <p className="text-xs text-gray-500 mb-3">Site-wise attendance</p>
          <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-3"><option value="">Select site...</option>{(selectedClient ? reportClientSites : reportSites).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button onClick={() => dlReport(`${BASE}/reports/site/${selectedSite}?start=${reportStart}&end=${reportEnd}&format=xlsx`, `Site_${selectedSite}.xlsx`, "site")} disabled={!selectedSite || reportDownloading === "site"} className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "site" ? "..." : "📥 Download"}</button>
        </div>
      </div>
    </div>
  );

  // ══════ MAIN LAYOUT ══════
  return (
    <div className="min-h-screen flex bg-gray-50">
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed md:sticky top-0 left-0 h-screen w-60 bg-white border-r border-gray-200/80 z-40 flex flex-col transform transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div className="h-14 flex items-center px-5 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-white font-bold text-sm mr-3 shadow-sm">W</div>
          <div><h1 className="text-sm font-bold text-gray-900 leading-tight">WorkTrack</h1><p className="text-[10px] text-gray-400 uppercase tracking-wider">Manager</p></div>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          <p className="px-3 text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Menu</p>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => handleNavClick(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === item.id ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
              <span className="text-base w-5 text-center">{item.icon}</span><span>{item.label}</span>
              {activeTab === item.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-600" />}
            </button>
          ))}
        </nav>
        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold">{(user?.name || "M").charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{user?.name || "Manager"}</p><p className="text-[10px] text-gray-400">Manager</p></div>
            <button onClick={() => { setAuth(null, null); window.location.href = "/"; }} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500" title="Logout">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 bg-white border-b border-gray-200/80 flex items-center px-4 md:px-6 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden mr-3 p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-base font-semibold text-gray-900">{NAV_ITEMS.find(n => n.id === activeTab)?.icon} {NAV_ITEMS.find(n => n.id === activeTab)?.label}</h2>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-y-auto"><div className="max-w-7xl mx-auto">
          {activeTab === "daily" && renderDaily()}
          {activeTab === "attendance" && renderPA()}
          {activeTab === "reports" && renderReports()}
        </div></main>
      </div>
    </div>
  );
}