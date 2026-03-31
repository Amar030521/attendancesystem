import React, { useEffect, useState, useMemo } from "react";
import { api } from "../api";
import { LoadingSpinner } from "./LoadingSpinner";
import { Pagination } from "./Pagination";

const PAGE_SIZE = 15;

export function LabourManagement() {
  const [labours, setLabours] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [currentLabour, setCurrentLabour] = useState(null);
  const [formData, setFormData] = useState({ name: "", daily_wage: "", phone: "", passport_id: "", designation: "", date_of_joining: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [importing, setImporting] = useState(false);
  const [knownPins, setKnownPins] = useState({});
  const [detailLabour, setDetailLabour] = useState(null);
  const [page, setPage] = useState(1);

  // Advance payment state
  const [advanceModal, setAdvanceModal] = useState(null); // { labour_id, name }
  const [advanceRecords, setAdvanceRecords] = useState([]);
  const [advanceTotal, setAdvanceTotal] = useState(0);
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  const [advanceSaving, setAdvanceSaving] = useState(false);

  // Track advance totals per labour for display
  const [advanceTotals, setAdvanceTotals] = useState({});

  useEffect(() => { loadLabours(); loadAdvanceSummary(); }, []);

  async function loadLabours() {
    try { setLoading(true); setLabours((await api.get("/admin/labours")).data); }
    catch (err) { console.error(err); alert("Failed to load labours"); }
    finally { setLoading(false); }
  }

  async function loadAdvanceSummary() {
    try {
      const { data } = await api.get("/admin/advance-payments-summary");
      setAdvanceTotals(data.byLabour || {});
    } catch (err) { console.error(err); }
  }

  async function loadAdvanceRecords(labourId) {
    try {
      setAdvanceLoading(true);
      const { data } = await api.get(`/admin/advance-payments/${labourId}`);
      setAdvanceRecords(data.records || []);
      setAdvanceTotal(data.total || 0);
    } catch (err) { console.error(err); }
    finally { setAdvanceLoading(false); }
  }

  function openAddModal() { setModalMode("add"); setFormData({ name: "", daily_wage: "", phone: "", passport_id: "", designation: "", date_of_joining: "" }); setCurrentLabour(null); setShowModal(true); }
  function openEditModal(labour) { setModalMode("edit"); setCurrentLabour(labour); setFormData({ name: labour.name, daily_wage: labour.daily_wage, phone: labour.phone || "", passport_id: labour.passport_id || "", designation: labour.designation || "", date_of_joining: labour.date_of_joining || "" }); setShowModal(true); setDetailLabour(null); }
  function closeModal() { setShowModal(false); setFormData({ name: "", daily_wage: "", phone: "", passport_id: "", designation: "", date_of_joining: "" }); setCurrentLabour(null); }

  function openAdvanceModal(labour) {
    setAdvanceModal({ labour_id: labour.id, name: labour.name });
    setAdvanceForm({ amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
    loadAdvanceRecords(labour.id);
    setDetailLabour(null);
  }

  async function handleAddAdvance() {
    if (!advanceForm.amount || Number(advanceForm.amount) <= 0) { alert("Enter a valid amount"); return; }
    if (!advanceForm.date) { alert("Select a date"); return; }
    try {
      setAdvanceSaving(true);
      await api.post("/admin/advance-payments", { labour_id: advanceModal.labour_id, amount: Number(advanceForm.amount), date: advanceForm.date, notes: advanceForm.notes });
      setAdvanceForm({ amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
      await loadAdvanceRecords(advanceModal.labour_id);
      await loadAdvanceSummary();
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setAdvanceSaving(false); }
  }

  async function handleDeleteAdvance(id) {
    if (!window.confirm("Delete this advance record?")) return;
    try {
      await api.delete(`/admin/advance-payments/${id}`);
      await loadAdvanceRecords(advanceModal.labour_id);
      await loadAdvanceSummary();
    } catch (err) { alert("Failed to delete"); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name || !formData.daily_wage) { alert("Name and Monthly Wages are required"); return; }
    try {
      if (modalMode === "add") {
        const res = await api.post("/admin/labours", formData);
        setKnownPins(prev => ({ ...prev, [res.data.id]: res.data.pin }));
        alert(`Labour added!\n\nID: ${res.data.id}\nPIN: ${res.data.pin}\n\nPlease note the PIN!`);
      } else {
        await api.put(`/admin/labours/${currentLabour.id}`, formData);
        alert("Labour updated successfully!");
      }
      await loadLabours(); closeModal();
    } catch (err) { alert(err.response?.data?.message || "Failed to save labour"); }
  }

  async function handleDeactivate(id, name) { if (!window.confirm(`Deactivate ${name}?`)) return; try { await api.delete(`/admin/labours/${id}`); await loadLabours(); setDetailLabour(null); } catch (err) { alert("Failed"); } }
  async function handleActivate(id, name) { if (!window.confirm(`Reactivate ${name}?`)) return; try { await api.put(`/admin/labours/${id}/activate`); await loadLabours(); setDetailLabour(null); } catch (err) { alert("Failed"); } }
  async function handlePermanentDelete(id, name) { if (!window.confirm(`PERMANENTLY DELETE ${name} and ALL their records?\n\nThis CANNOT be undone!`)) return; try { await api.delete(`/admin/labours/${id}/permanent`); await loadLabours(); setDetailLabour(null); alert("Deleted."); } catch (err) { alert("Failed"); } }
  async function handleResetPin(id, name) { if (!window.confirm(`Reset PIN for ${name}?`)) return; try { const res = await api.post(`/admin/labours/${id}/reset-pin`); setKnownPins(prev => ({ ...prev, [id]: res.data.newPin })); alert(`New PIN for ${name}: ${res.data.newPin}`); } catch (err) { alert("Failed"); } }

  async function handleCSVImport(e) {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      setImporting(true);
      const res = await api.post("/admin/labours/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const newPins = {}; let message = `Imported ${res.data.createdCount} labours!\n\n`;
      res.data.labours.forEach(l => { newPins[l.id] = l.pin; message += `ID: ${l.id} | ${l.name} | PIN: ${l.pin}\n`; });
      setKnownPins(prev => ({ ...prev, ...newPins })); alert(message); await loadLabours();
    } catch (err) { alert(err.response?.data?.message || "Failed to import"); }
    finally { setImporting(false); e.target.value = ""; }
  }

  const filteredLabours = useMemo(() => labours.filter(l =>
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) || String(l.id).includes(searchTerm) ||
    (l.passport_id && l.passport_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (l.designation && l.designation.toLowerCase().includes(searchTerm.toLowerCase()))
  ), [labours, searchTerm]);

  useEffect(() => { setPage(1); }, [searchTerm]);
  const totalPages = Math.ceil(filteredLabours.length / PAGE_SIZE);
  const pagedLabours = filteredLabours.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Labour Management</h2><p className="text-sm text-gray-500">Manage labour employees and their details</p></div>
        <div className="flex gap-2">
          <label className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700">📁 Import<input type="file" accept=".csv,.xlsx,.xls" onChange={handleCSVImport} disabled={importing} className="hidden" /></label>
          <button onClick={openAddModal} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">+ Add Labour</button>
        </div>
      </div>

      <input type="text" placeholder="Search by name, ID, or designation..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm">
        <p className="font-medium text-blue-900">Import Format (CSV or Excel):</p>
        <code className="text-xs bg-blue-100 px-2 py-1 rounded mt-1 inline-block">name, daily_wage, phone, passport_id, designation, date_of_joining</code>
        <p className="text-xs text-blue-700 mt-1">Supports .csv and .xlsx files. Wages can have commas. IDs and PINs auto-generated.</p>
      </div>

      {loading ? <LoadingSpinner label="Loading labours..." /> : (<>
        {/* MOBILE CARDS */}
        <div className="md:hidden space-y-2">
          {pagedLabours.length === 0 ? <p className="text-center text-gray-400 py-8">No labours found</p> :
            pagedLabours.map(l => (
              <button key={l.id} onClick={() => setDetailLabour(l)} className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 active:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-sm font-bold text-gray-900 truncate">{l.name}</span><span className="text-[10px] text-gray-400 shrink-0">#{l.id}</span></div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{l.designation || "No designation"}</span>
                      <span className="text-xs text-gray-300">•</span>
                      <span className="text-xs font-medium text-gray-600">AED {Number(l.daily_wage).toLocaleString()}/mo</span>
                      {advanceTotals[l.id] > 0 && <><span className="text-xs text-gray-300">•</span><span className="text-xs font-medium text-red-500">Adv: {Number(advanceTotals[l.id]).toLocaleString()}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${l.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{l.status}</span>
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </button>
            ))
          }
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={filteredLabours.length} pageSize={PAGE_SIZE} />
        </div>

        {/* DESKTOP TABLE */}
        <div className="hidden md:block overflow-x-auto bg-white rounded-xl border border-gray-100 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600">ID</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600">Name</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600">Designation</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600">Monthly Wages</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600">Advance</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600">Phone</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600">Passport</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600">Joining</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600">PIN</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {pagedLabours.length === 0 ? <tr><td colSpan="11" className="px-4 py-8 text-center text-gray-400">No labours found</td></tr> :
                pagedLabours.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-3 font-medium">{l.id}</td>
                    <td className="px-3 py-3">{l.name}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{l.designation || "-"}</td>
                    <td className="px-3 py-3 text-right">AED {Number(l.daily_wage).toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">{advanceTotals[l.id] > 0 ? <button onClick={() => openAdvanceModal(l)} className="text-red-600 font-semibold hover:underline">AED {Number(advanceTotals[l.id]).toLocaleString()}</button> : <button onClick={() => openAdvanceModal(l)} className="text-gray-400 hover:text-blue-600 text-xs">+ Add</button>}</td>
                    <td className="px-3 py-3">{l.phone || "-"}</td>
                    <td className="px-3 py-3">{l.passport_id || "-"}</td>
                    <td className="px-3 py-3">{fmtDate(l.date_of_joining)}</td>
                    <td className="px-3 py-3 text-center">{knownPins[l.id] ? <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-mono font-bold">{knownPins[l.id]}</span> : <span className="text-gray-400 text-xs">••••</span>}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-1 text-xs font-medium rounded-full ${l.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{l.status}</span></td>
                    <td className="px-3 py-3 text-right space-x-1">
                      <button onClick={() => openEditModal(l)} className="px-2 py-1 bg-blue-500 text-white rounded text-xs">Edit</button>
                      <button onClick={() => handleResetPin(l.id, l.name)} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs">Reset PIN</button>
                      {l.status === "active" ? <button onClick={() => handleDeactivate(l.id, l.name)} className="px-2 py-1 bg-orange-500 text-white rounded text-xs">Deactivate</button> : <button onClick={() => handleActivate(l.id, l.name)} className="px-2 py-1 bg-green-500 text-white rounded text-xs">Activate</button>}
                      <button onClick={() => handlePermanentDelete(l.id, l.name)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Delete</button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100"><Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={filteredLabours.length} pageSize={PAGE_SIZE} /></div>
        </div>
      </>)}

      {/* MOBILE DETAIL POPUP */}
      {detailLabour && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setDetailLabour(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div><h3 className="text-base font-bold text-gray-900">{detailLabour.name}</h3><p className="text-xs text-gray-400">ID: {detailLabour.id}</p></div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${detailLabour.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{detailLabour.status}</span>
                <button onClick={() => setDetailLabour(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[{ label: "Designation", value: detailLabour.designation || "-" },{ label: "Monthly Wages", value: `AED ${Number(detailLabour.daily_wage).toLocaleString()}` },{ label: "Advance Payment", value: advanceTotals[detailLabour.id] > 0 ? `AED ${Number(advanceTotals[detailLabour.id]).toLocaleString()}` : "None" },{ label: "Phone", value: detailLabour.phone || "-" },{ label: "Passport ID", value: detailLabour.passport_id || "-" },{ label: "Date of Joining", value: fmtDate(detailLabour.date_of_joining) },{ label: "PIN", value: knownPins[detailLabour.id] || "••••" }].map((row, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"><span className="text-xs text-gray-500 font-medium">{row.label}</span><span className="text-sm font-medium text-gray-900">{row.value}</span></div>
              ))}
            </div>
            <div className="px-5 pb-5 pt-1 space-y-2">
              <button onClick={() => openAdvanceModal(detailLabour)} className="w-full py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">💸 Advance Payments</button>
              <button onClick={() => openEditModal(detailLabour)} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">Edit Details</button>
              <button onClick={() => handleResetPin(detailLabour.id, detailLabour.name)} className="w-full py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold">Reset PIN</button>
              <div className="grid grid-cols-2 gap-2">
                {detailLabour.status === "active" ? <button onClick={() => handleDeactivate(detailLabour.id, detailLabour.name)} className="py-2.5 bg-orange-100 text-orange-700 rounded-xl text-sm font-semibold">Deactivate</button> : <button onClick={() => handleActivate(detailLabour.id, detailLabour.name)} className="py-2.5 bg-green-100 text-green-700 rounded-xl text-sm font-semibold">Activate</button>}
                <button onClick={() => handlePermanentDelete(detailLabour.id, detailLabour.name)} className="py-2.5 bg-red-100 text-red-700 rounded-xl text-sm font-semibold">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADVANCE PAYMENT MODAL */}
      {advanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b bg-red-50 rounded-t-xl">
              <h3 className="text-base font-bold text-red-900">💸 Advance Payments — {advanceModal.name}</h3>
              <p className="text-xs text-red-600 mt-0.5">Total: AED {advanceTotal.toLocaleString()}</p>
            </div>
            {/* Add new advance */}
            <div className="px-5 py-4 border-b border-gray-100 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Add New Advance</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">Amount (AED) *</label><input type="number" min="1" value={advanceForm.amount} onChange={e => setAdvanceForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. 200" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Date *</label><input type="date" value={advanceForm.date} onChange={e => setAdvanceForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Notes (optional)</label><input type="text" value={advanceForm.notes} onChange={e => setAdvanceForm(f => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Arrival advance, Emergency" /></div>
              <button onClick={handleAddAdvance} disabled={advanceSaving} className="w-full py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{advanceSaving ? "Saving..." : "+ Add Advance"}</button>
            </div>
            {/* History */}
            <div className="px-5 py-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">History</p>
              {advanceLoading ? <p className="text-center text-gray-400 py-4 text-sm">Loading...</p> :
                advanceRecords.length === 0 ? <p className="text-center text-gray-400 py-4 text-sm">No advance payments recorded</p> :
                <div className="space-y-2">
                  {advanceRecords.map(r => (
                    <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-red-600">AED {Number(r.amount).toLocaleString()}</span>
                          <span className="text-[10px] text-gray-400">{fmtDate(r.date)}</span>
                        </div>
                        {r.notes && <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>}
                      </div>
                      <button onClick={() => handleDeleteAdvance(r.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1">✕</button>
                    </div>
                  ))}
                </div>
              }
            </div>
            <div className="px-5 py-3 border-t"><button onClick={() => setAdvanceModal(null)} className="w-full py-2.5 border rounded-xl text-sm font-medium">Close</button></div>
          </div>
        </div>
      )}

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b bg-gray-50 rounded-t-xl"><h3 className="text-lg font-semibold">{modalMode === "add" ? "Add New Labour" : "Edit Labour"}</h3></div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label><input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2.5 border rounded-xl text-sm" placeholder="Enter labour name" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Monthly Wages (AED) <span className="text-red-500">*</span></label><input type="number" required min="1" value={formData.daily_wage} onChange={e => setFormData({ ...formData, daily_wage: e.target.value })} className="w-full px-3 py-2.5 border rounded-xl text-sm" placeholder="e.g. 1200" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Passport ID</label><input type="text" value={formData.passport_id} onChange={e => setFormData({ ...formData, passport_id: e.target.value })} className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Designation</label><input type="text" value={formData.designation} onChange={e => setFormData({ ...formData, designation: e.target.value })} className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining</label><input type="date" value={formData.date_of_joining} onChange={e => setFormData({ ...formData, date_of_joining: e.target.value })} className="w-full px-3 py-2.5 border rounded-xl text-sm" /></div>
              {modalMode === "edit" && currentLabour && (<div><label className="block text-sm font-medium text-gray-700 mb-1">Status</label><select value={formData.status || currentLabour.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full px-3 py-2.5 border rounded-xl text-sm"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>)}
              <div className="flex gap-3 pt-2"><button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 border rounded-xl text-sm font-medium">Cancel</button><button type="submit" className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold">{modalMode === "add" ? "Add Labour" : "Save Changes"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}