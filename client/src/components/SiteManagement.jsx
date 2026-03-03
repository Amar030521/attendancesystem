import React, { useEffect, useState } from "react";
import { api } from "../api";
import { LoadingSpinner } from "./LoadingSpinner";

export function SiteManagement() {
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [currentSite, setCurrentSite] = useState(null);
  const [formData, setFormData] = useState({ client_id: "", name: "" });
  const [filterClient, setFilterClient] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [detailSite, setDetailSite] = useState(null);

  useEffect(() => { loadClients(); loadSites(); }, []);

  async function loadClients() { try { setClients((await api.get("/admin/clients")).data); } catch (err) { console.error(err); } }
  async function loadSites() { try { setLoading(true); setSites((await api.get("/admin/sites")).data); } catch (err) { alert("Failed to load sites"); } finally { setLoading(false); } }
  function openAddModal() { setModalMode("add"); setFormData({ client_id: "", name: "" }); setCurrentSite(null); setShowModal(true); }
  function openEditModal(s) { setModalMode("edit"); setCurrentSite(s); setFormData({ client_id: s.client_id, name: s.name }); setShowModal(true); setDetailSite(null); }
  function closeModal() { setShowModal(false); setFormData({ client_id: "", name: "" }); setCurrentSite(null); }

  async function handleSubmit(e) {
    e.preventDefault(); if (!formData.client_id || !formData.name.trim()) { alert("Client and site name required"); return; }
    try {
      if (modalMode === "add") await api.post("/admin/sites", formData);
      else await api.put(`/admin/sites/${currentSite.id}`, formData);
      await loadSites(); closeModal();
    } catch (err) { alert(err.response?.data?.message || "Failed to save site"); }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"?\n\nThis will fail if the site has attendance records.`)) return;
    try { await api.delete(`/admin/sites/${id}`); await loadSites(); setDetailSite(null); } catch (err) { alert(err.response?.data?.message || "Failed to delete"); }
  }

  const filtered = sites.filter(s => {
    const matchesClient = !filterClient || s.client_id === parseInt(filterClient);
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.client_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesClient && matchesSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Site Management</h2><p className="text-sm text-gray-500">Manage project sites for each client</p></div>
        <button onClick={openAddModal} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">+ Add Site</button>
      </div>
      <div className="flex gap-3">
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm"><option value="">All Clients</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input type="text" placeholder="Search sites..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
      </div>

      {loading ? <LoadingSpinner label="Loading sites..." /> : (<>
        {/* MOBILE */}
        <div className="md:hidden space-y-2">
          {filtered.length === 0 ? <p className="text-center text-gray-400 py-8">No sites found</p> : filtered.map(s => (
            <button key={s.id} onClick={() => setDetailSite(s)} className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 active:bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-gray-900">{s.name}</span>
                  <div className="flex items-center gap-2 mt-0.5"><span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{s.client_name}</span><span className="text-[10px] text-gray-400">#{s.id}</span></div>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </div>
            </button>
          ))}
        </div>
        {/* DESKTOP */}
        <div className="hidden md:block overflow-x-auto bg-white rounded-xl border border-gray-100 shadow-sm">
          <table className="min-w-full text-sm"><thead className="bg-gray-50"><tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">ID</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Client</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Site Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Created</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Actions</th>
          </tr></thead><tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">No sites found</td></tr> : filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium">{s.id}</td>
                <td className="px-4 py-3"><span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{s.client_name}</span></td>
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEditModal(s)} className="px-3 py-1 bg-blue-500 text-white rounded text-xs">Edit</button>
                  <button onClick={() => handleDelete(s.id, s.name)} className="px-3 py-1 bg-red-500 text-white rounded text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </>)}

      {/* MOBILE DETAIL */}
      {detailSite && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setDetailSite(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div><h3 className="text-base font-bold text-gray-900">{detailSite.name}</h3><p className="text-xs text-gray-400">Site ID: {detailSite.id}</p></div>
              <button onClick={() => setDetailSite(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex justify-between py-1.5 border-b border-gray-50"><span className="text-xs text-gray-500">Client</span><span className="text-sm font-medium">{detailSite.client_name}</span></div>
              <div className="flex justify-between py-1.5 border-b border-gray-50"><span className="text-xs text-gray-500">Created</span><span className="text-sm font-medium">{new Date(detailSite.created_at).toLocaleDateString()}</span></div>
            </div>
            <div className="px-5 pb-5 space-y-2">
              <button onClick={() => openEditModal(detailSite)} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold">Edit</button>
              <button onClick={() => handleDelete(detailSite.id, detailSite.name)} className="w-full py-2.5 bg-red-100 text-red-700 rounded-xl text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b bg-gray-50 rounded-t-xl"><h3 className="text-lg font-semibold">{modalMode === "add" ? "Add New Site" : "Edit Site"}</h3></div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div><label className="block text-sm font-medium mb-1">Client <span className="text-red-500">*</span></label><select required value={formData.client_id} onChange={e => setFormData({ ...formData, client_id: e.target.value })} className="w-full px-3 py-2.5 border rounded-xl text-sm"><option value="">Select a client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Site Name <span className="text-red-500">*</span></label><input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2.5 border rounded-xl text-sm" placeholder="Enter site name" /></div>
              <div className="flex gap-3 pt-2"><button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 border rounded-xl text-sm font-medium">Cancel</button><button type="submit" className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold">{modalMode === "add" ? "Add Site" : "Save"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}