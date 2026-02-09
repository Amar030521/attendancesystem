import React, { useEffect, useState, useMemo } from "react";
import { LayoutShell } from "../components/LayoutShell";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { LabourManagement } from "../components/LabourManagement";
import { ClientManagement } from "../components/ClientManagement";
import { SiteManagement } from "../components/SiteManagement";
import { HolidayManagement } from "../components/HolidayManagement";
import { ConfigManagement } from "../components/ConfigManagement";
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

function ReportCard({ title, icon, color, desc, loading, onDownload }) {
  const bc = { blue: "border-blue-500", purple: "border-purple-500", red: "border-red-500" }[color] || "border-gray-500";
  const btn = { blue: "bg-blue-600 hover:bg-blue-700", purple: "bg-purple-600 hover:bg-purple-700", red: "bg-red-600 hover:bg-red-700" }[color] || "bg-gray-600";
  return (<div className={`bg-white rounded-lg shadow-sm border-l-4 ${bc} p-4`}><h3 className="font-semibold text-gray-800">{icon} {title}</h3><p className="text-xs text-gray-400 mb-3">{desc}</p>
    <button onClick={onDownload} disabled={loading} className={`w-full px-3 py-2 ${btn} text-white text-sm font-semibold rounded-lg disabled:opacity-40`}>{loading ? "..." : "📥 Download Excel"}</button></div>);
}

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("daily");
  const [settingsTab, setSettingsTab] = useState("labours");

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
  const [markModal, setMarkModal] = useState(null); // { labour_id, name, action: "present" }
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

  async function loadMaster() { try { const [c, s] = await Promise.all([api.get("/admin/clients"), api.get("/admin/sites")]); setClients(c.data || []); setSites(s.data || []); } catch (e) { console.error(e); } }
  async function loadDaily() { try { setDailyLoading(true); setDailyRows((await api.get(`/admin/attendance?date=${date}`)).data); } catch (e) { console.error(e); } finally { setDailyLoading(false); } }
  async function loadPA() { try { setPaLoading(true); setPaData((await api.get(`/admin/present-absent?date=${paDate}`)).data); } catch (e) { console.error(e); } finally { setPaLoading(false); } }
  async function loadReportData() { try { const [l, c, s] = await Promise.all([api.get("/admin/labours"), api.get("/admin/clients"), api.get("/admin/sites")]); setReportLabours(l.data || []); setReportClients(c.data || []); setReportSites(s.data || []); } catch (e) { console.error(e); } }

  // FILTERS
  const clientSites = useMemo(() => filterClient ? sites.filter(s => String(s.client_id) === String(filterClient)) : [], [filterClient, sites]);
  const filteredRows = useMemo(() => { let r = dailyRows; if (filterClient) r = r.filter(x => String(x.client_id) === String(filterClient)); if (filterSites.length) r = r.filter(x => filterSites.includes(String(x.site_id))); return r; }, [dailyRows, filterClient, filterSites]);
  const summary = useMemo(() => ({ total: filteredRows.length, pending: filteredRows.filter(r => !r.admin_verified).length, wages: filteredRows.reduce((s, r) => s + (r.total_pay || 0), 0) }), [filteredRows]);
  const filterLabel = useMemo(() => { if (!filterClient) return ""; const c = clients.find(c => String(c.id) === String(filterClient)); let l = c ? c.name : ""; if (filterSites.length && filterSites.length < clientSites.length) l += " > " + filterSites.map(sid => { const s = sites.find(x => String(x.id) === sid); return s ? s.name : sid; }).join(", "); return l; }, [filterClient, filterSites, clients, sites, clientSites]);
  const editSites = sites.filter(s => String(s.client_id) === String(editForm.client_id));
  const markSites = sites.filter(s => String(s.client_id) === String(markForm.client_id));
  const reportClientSites = useMemo(() => selectedClient ? reportSites.filter(s => String(s.client_id) === String(selectedClient)) : [], [selectedClient, reportSites]);
  const paFilteredLabours = useMemo(() => { if (!paData) return []; return paFilter === "all" ? paData.labours : paData.labours.filter(l => l.status === paFilter); }, [paData, paFilter]);

  // DAILY HANDLERS
  async function handleVerifyRow(id) { try { setVerifying(true); await api.put(`/admin/attendance/${id}/verify`); await loadDaily(); } catch (e) { console.error(e); } finally { setVerifying(false); } }
  async function handleVerifyAll() { try { setVerifying(true); const ids = filteredRows.filter(r => !r.admin_verified).map(r => r.id); if (!ids.length) return; await api.put("/admin/attendance/bulk-verify", { ids }); await loadDaily(); } catch (e) { console.error(e); } finally { setVerifying(false); } }
  async function handleDeleteAtt(id, name) { if (!window.confirm(`Delete record for ${name}?`)) return; try { await api.delete(`/admin/attendance/${id}`); await loadDaily(); } catch (e) { alert("Failed to delete"); } }
  function openEdit(row) { setEditModal(row); setEditForm({ client_id: row.client_id, site_id: row.site_id, start_time: row.start_time, end_time: row.end_time }); }
  async function saveEdit() { try { setEditSaving(true); await api.put(`/admin/attendance/${editModal.id}`, editForm); setEditModal(null); await loadDaily(); } catch (e) { alert(e.response?.data?.message || "Failed"); } finally { setEditSaving(false); } }
  async function dlExcel() { try { setDownloading(true); let u = `/admin/reports/daily?date=${date}&format=xlsx`; if (filterClient) u += `&client_id=${filterClient}`; if (filterSites.length) u += `&site_ids=${filterSites.join(",")}`; await downloadFile(u, `Report_${date}.xlsx`); } catch (e) { alert("Failed"); } finally { setDownloading(false); } }
  async function dlPdf() { try { setDownloading(true); let u = `/admin/reports/daily?date=${date}&format=pdf`; if (filterClient) u += `&client_id=${filterClient}`; if (filterSites.length) u += `&site_ids=${filterSites.join(",")}`; await downloadPdf(u, `Report_${date}.pdf`); } catch (e) { alert("Failed"); } finally { setDownloading(false); } }
  async function dlReport(url, fn, key) { try { setReportDownloading(key); await downloadFile(url, fn); } catch (e) { alert("Download failed"); } finally { setReportDownloading(""); } }

  // MARK PRESENT/ABSENT HANDLERS
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

  // ========== DAILY OPERATIONS ==========
  const renderDaily = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-4"><div className="flex flex-wrap items-end gap-4">
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Client</label><select value={filterClient} onChange={e => { setFilterClient(e.target.value); setFilterSites([]); }} className="border rounded-lg px-3 py-2 text-sm min-w-[160px]"><option value="">All Clients</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {filterClient && clientSites.length > 0 && (<div><label className="block text-xs font-medium text-gray-500 mb-1">Sites</label><div className="flex flex-wrap gap-2">{clientSites.map(s => (<button key={s.id} onClick={() => setFilterSites(p => p.includes(String(s.id)) ? p.filter(x => x !== String(s.id)) : [...p, String(s.id)])} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filterSites.length === 0 || filterSites.includes(String(s.id)) ? "bg-blue-100 border-blue-400 text-blue-800" : "bg-gray-50 border-gray-300 text-gray-500"}`}>{s.name}</button>))}</div></div>)}
      </div></div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={handleVerifyAll} disabled={verifying || !summary.pending} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-40">✓ Verify All ({summary.pending})</button>
          {filterLabel && <span className="text-sm text-blue-700 bg-blue-50 px-3 py-1 rounded-full">🔍 {filterLabel}</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-4 text-sm"><span>Workers: <strong>{summary.total}</strong></span><span>Pending: <strong className="text-amber-600">{summary.pending}</strong></span><span>Wages: <strong>{formatCurrency(summary.wages)}</strong></span></div>
          <button onClick={dlExcel} disabled={downloading || !filteredRows.length} className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-40">📥 Excel</button>
          <button onClick={dlPdf} disabled={downloading || !filteredRows.length} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-40">📥 PDF</button>
        </div>
      </div>
      {dailyLoading ? <LoadingSpinner label="Loading..." /> : !filteredRows.length ? (
        <div className="bg-gray-50 border rounded-lg p-8 text-center"><p className="text-gray-600">{!dailyRows.length ? `No records for ${date}` : "No match"}</p></div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow-sm"><table className="min-w-full text-xs"><thead><tr className="border-b text-[11px] text-gray-500 bg-gray-50 uppercase">
          <th className="px-2 py-2.5 text-left">ID</th><th className="px-2 py-2.5 text-left">Name</th><th className="px-2 py-2.5 text-left">Client</th><th className="px-2 py-2.5 text-left">Site</th>
          <th className="px-2 py-2.5 text-center">In</th><th className="px-2 py-2.5 text-center">Out</th><th className="px-2 py-2.5 text-right">Hours</th><th className="px-2 py-2.5 text-right">Regular</th>
          <th className="px-2 py-2.5 text-right">OT</th><th className="px-2 py-2.5 text-right">Total</th><th className="px-2 py-2.5 text-center">Status</th><th className="px-2 py-2.5 text-center">Actions</th>
        </tr></thead><tbody>{filteredRows.map(row => (
          <tr key={row.id} className="border-b last:border-0 hover:bg-blue-50/30">
            <td className="px-2 py-2 font-medium">{row.labour_id}</td><td className="px-2 py-2">{row.labour_name}</td><td className="px-2 py-2 text-gray-600">{row.client_name}</td><td className="px-2 py-2 text-gray-600">{row.site_name}</td>
            <td className="px-2 py-2 text-center">{row.start_time}</td><td className="px-2 py-2 text-center">{row.end_time}</td><td className="px-2 py-2 text-right">{row.hours_worked}</td>
            <td className="px-2 py-2 text-right">{formatCurrency(row.regular_pay)}</td><td className="px-2 py-2 text-right">{formatCurrency(row.ot_pay)}</td><td className="px-2 py-2 text-right font-semibold">{formatCurrency(row.total_pay)}</td>
            <td className="px-2 py-2 text-center">{row.admin_verified ? <span className="text-green-600 font-bold">✓</span> : <span className="text-amber-500">⏳</span>}</td>
            <td className="px-2 py-2 text-center whitespace-nowrap space-x-1">
              <button onClick={() => openEdit(row)} className="px-2 py-1 rounded bg-blue-500 text-white text-[11px]">Edit</button>
              {!row.admin_verified && <button onClick={() => handleVerifyRow(row.id)} disabled={verifying} className="px-2 py-1 rounded bg-green-500 text-white text-[11px]">✓</button>}
              <button onClick={() => handleDeleteAtt(row.id, row.labour_name)} className="px-2 py-1 rounded bg-red-500 text-white text-[11px]">🗑</button>
            </td>
          </tr>
        ))}</tbody></table></div>
      )}
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

  // ========== PRESENT / ABSENT ==========
  const renderPA = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap items-end gap-4">
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Date</label><input type="date" value={paDate} onChange={e => setPaDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        <button onClick={() => setPaDate(yesterdayISO())} className={`px-3 py-2 text-sm font-medium rounded-lg ${paDate === yesterdayISO() ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-800 hover:bg-blue-200"}`}>Yesterday</button>
        <button onClick={() => setPaDate(todayISO())} className={`px-3 py-2 text-sm font-medium rounded-lg ${paDate === todayISO() ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Today</button>
      </div>
      {paLoading ? <LoadingSpinner label="Loading..." /> : !paData ? <div className="text-center text-gray-500 py-8">Select a date</div> : (<>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{ l: "Total", v: paData.summary.total, c: "bg-gray-100 text-gray-800", f: "all" },
            { l: "Present", v: paData.summary.present, c: "bg-green-100 text-green-800", f: "present" },
            { l: "Absent", v: paData.summary.absent, c: "bg-red-100 text-red-800", f: "absent" },
            { l: "Pending", v: paData.summary.pending, c: "bg-amber-100 text-amber-800", f: "pending" },
          ].map(card => (
            <button key={card.f} onClick={() => setPaFilter(card.f)} className={`rounded-lg p-3 text-center ${card.c} ${paFilter === card.f ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}>
              <div className="text-2xl font-bold">{card.v}</div><div className="text-xs font-medium">{card.l}</div>
            </button>
          ))}
        </div>
        {paData.cutoffNote && <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">⚠️ {paData.cutoffNote}</div>}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full text-sm"><thead className="bg-gray-50"><tr>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
          </tr></thead><tbody className="divide-y divide-gray-100">{paFilteredLabours.map(l => (
            <tr key={l.labour_id} className="hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium">{l.labour_id}</td>
              <td className="px-3 py-2.5">{l.name}</td>
              <td className="px-3 py-2.5 text-center">
                {l.status === "present" && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">✓ Present</span>}
                {l.status === "absent" && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">✗ Absent</span>}
                {l.status === "pending" && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">⏳ Pending</span>}
              </td>
              <td className="px-3 py-2.5 text-xs text-gray-500">
                {l.attendance ? `${l.attendance.client_name} • ${l.attendance.site_name} • ${l.attendance.start_time}-${l.attendance.end_time} • ${l.attendance.hours_worked}h • ${formatCurrency(l.attendance.total_pay)}` : l.status === "absent" ? "Did not check in" : "Waiting..."}
              </td>
              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                {l.status === "present" ? (
                  <button onClick={() => handleMarkAbsent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors">
                    Mark Absent
                  </button>
                ) : (
                  <button onClick={() => openMarkPresent(l)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                    Mark Present
                  </button>
                )}
              </td>
            </tr>
          ))}</tbody></table>
        </div>
      </>)}

      {/* Mark Present Modal */}
      {markModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b bg-green-50 rounded-t-xl">
              <h3 className="text-lg font-semibold text-green-900">Mark Present — {markModal.name}</h3>
              <p className="text-xs text-green-700 mt-0.5">Date: {paDate}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div><label className="block text-sm font-medium mb-1">Client <span className="text-red-500">*</span></label>
                <select value={markForm.client_id} onChange={e => setMarkForm(f => ({ ...f, client_id: e.target.value, site_id: "" }))} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Select client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Site <span className="text-red-500">*</span></label>
                <select value={markForm.site_id} onChange={e => setMarkForm(f => ({ ...f, site_id: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" disabled={!markForm.client_id}>
                  <option value="">{markForm.client_id ? "Select site" : "Select client first"}</option>{markSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Start Time</label><input type="time" value={markForm.start_time} onChange={e => setMarkForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium mb-1">End Time</label><input type="time" value={markForm.end_time} onChange={e => setMarkForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <p className="text-xs text-gray-400">This will create an attendance record and calculate wages automatically.</p>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex gap-3">
              <button onClick={() => setMarkModal(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleMarkPresent} disabled={markSaving} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{markSaving ? "Saving..." : "✓ Mark Present"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ========== REPORTS ==========
  const renderReports = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-4"><h3 className="text-sm font-semibold text-gray-700 mb-3">📅 Date Range</h3><div className="flex flex-wrap gap-4">
        <div><label className="block text-xs text-gray-500 mb-1">Month</label><input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Start</label><input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">End</label><input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" /></div>
      </div></div>
      <div className="grid md:grid-cols-2 gap-4">
        <ReportCard title="Daily Report" icon="📅" color="blue" desc={`Date: ${reportStart}`} loading={reportDownloading === "daily"} onDownload={() => dlReport(`/admin/reports/daily?date=${reportStart}&format=xlsx`, `Daily_${reportStart}.xlsx`, "daily")} />
        <ReportCard title="Monthly Summary" icon="📊" color="purple" desc={`Month: ${reportMonth}`} loading={reportDownloading === "monthly"} onDownload={() => dlReport(`/admin/reports/monthly?month=${reportMonth}&format=xlsx`, `Monthly_${reportMonth}.xlsx`, "monthly")} />
        <div className="bg-white rounded-lg shadow-sm border-l-4 border-green-500 p-4"><h3 className="font-semibold text-gray-800">👷 Labour Report</h3><p className="text-xs text-gray-500 mb-2">Individual history</p>
          <select value={selectedLabour} onChange={e => setSelectedLabour(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-3"><option value="">Select...</option>{reportLabours.filter(l => l.status === "active").map(l => <option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}</select>
          <button onClick={() => dlReport(`/admin/reports/labour/${selectedLabour}?month=${reportMonth}&format=xlsx`, `Labour_${selectedLabour}.xlsx`, "labour")} disabled={!selectedLabour || reportDownloading === "labour"} className="w-full px-3 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "labour" ? "..." : "📥 Download"}</button></div>
        <ReportCard title="Payroll Summary" icon="💰" color="red" desc={`Month: ${reportMonth}`} loading={reportDownloading === "payroll"} onDownload={() => dlReport(`/admin/reports/payroll?month=${reportMonth}&format=xlsx`, `Payroll_${reportMonth}.xlsx`, "payroll")} />
        <div className="bg-white rounded-lg shadow-sm border-l-4 border-orange-500 p-4"><h3 className="font-semibold text-gray-800">🏢 Client Report</h3><p className="text-xs text-gray-500 mb-2">{reportStart} to {reportEnd}</p>
          <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setSelectedSite(""); }} className="w-full px-3 py-2 border rounded-lg text-sm mb-3"><option value="">Select...</option>{reportClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button onClick={() => dlReport(`/admin/reports/client/${selectedClient}?start=${reportStart}&end=${reportEnd}&format=xlsx`, `Client_${selectedClient}.xlsx`, "client")} disabled={!selectedClient || reportDownloading === "client"} className="w-full px-3 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "client" ? "..." : "📥 Download"}</button></div>
        <div className="bg-white rounded-lg shadow-sm border-l-4 border-teal-500 p-4"><h3 className="font-semibold text-gray-800">📍 Site Report</h3><p className="text-xs text-gray-500 mb-2">{reportStart} to {reportEnd}</p>
          <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-3"><option value="">Select...</option>{(selectedClient ? reportClientSites : reportSites).map(s => <option key={s.id} value={s.id}>{s.name}{s.client_name ? ` (${s.client_name})` : ""}</option>)}</select>
          <button onClick={() => dlReport(`/admin/reports/site/${selectedSite}?start=${reportStart}&end=${reportEnd}&format=xlsx`, `Site_${selectedSite}.xlsx`, "site")} disabled={!selectedSite || reportDownloading === "site"} className="w-full px-3 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40">{reportDownloading === "site" ? "..." : "📥 Download"}</button></div>
      </div>
    </div>
  );

  // ========== SETTINGS ==========
  const renderSettings = () => (<div>
    <div className="mb-6 border-b"><nav className="-mb-px flex space-x-4 overflow-x-auto">
      {[{ id: "labours", l: "👷 Labours" }, { id: "clients", l: "🏢 Clients" }, { id: "sites", l: "📍 Sites" }, { id: "holidays", l: "📅 Holidays" }, { id: "config", l: "⚙️ Config" }].map(t => (
        <button key={t.id} onClick={() => setSettingsTab(t.id)} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${settingsTab === t.id ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500"}`}>{t.l}</button>
      ))}</nav></div>
    {settingsTab === "labours" && <LabourManagement />}{settingsTab === "clients" && <ClientManagement />}{settingsTab === "sites" && <SiteManagement />}{settingsTab === "holidays" && <HolidayManagement />}{settingsTab === "config" && <ConfigManagement />}
  </div>);

  return (
    <LayoutShell title="Admin Dashboard">
      <div className="mb-4 border-b"><nav className="-mb-px flex space-x-4">
        {[{ id: "daily", l: "📋 Daily Operations" }, { id: "attendance", l: "👥 Present / Absent" }, { id: "reports", l: "📊 Reports" }, { id: "settings", l: "⚙️ Settings" }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-3 py-2 text-sm font-medium border-b-2 ${activeTab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{t.l}</button>
        ))}</nav></div>
      {activeTab === "daily" && renderDaily()}
      {activeTab === "attendance" && renderPA()}
      {activeTab === "reports" && renderReports()}
      {activeTab === "settings" && renderSettings()}
    </LayoutShell>
  );
}