import React, { useEffect, useState } from "react";
import { api } from "../api";
import { LoadingSpinner } from "./LoadingSpinner";

export function ClientManagement() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [currentClient, setCurrentClient] = useState(null);
  const [clientName, setClientName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [detailClient, setDetailClient] = useState(null);

  useEffect(() => { loadClients(); }, []);

  async function loadClients() { try { setLoading(true); setClients((await api.get("/admin/clients")).data); } catch (err) { alert("Failed to load clients"); } finally { setLoading(false); } }
  function openAddModal() { setModalMode("add"); setClientName(""); setCurrentClient(null); setShowModal(true); }
  function openEditModal(c) { setModalMode("edit"); setCurrentClient(c); setClientName(c.name); setShowModal(true); setDetailClient(null); }
  function closeModal() { setShowModal(false); setClientName(""); setCurrentClient(null); }

  async function handleSubmit(e) {
    e.preventDefault(); if (!clientName.trim()) { alert("Client name is required"); return; }
    try {
      if (modalMode === "add") await api.post("/admin/clients", { name: clientName });
      else await api.put(`/admin/clients/${currentClient.id}`, { name: clientName });
      await loadClients(); closeModal();
    } catch (err) { alert(err.response?.data?.message || "Failed to save client"); }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"?\n\nThis will fail if the client has attendance records.`)) return;
    try { await api.delete(`/admin/clients/${id}`); await loadClients(); setDetailClient(null); } catch (err) { alert(err.response?.data?.message || "Failed to delete"); }
  }

  const filtered = clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Client Management</h2><p className="text-sm text-gray-500">Manage clients and their project sites</p></div>
        <button onClick={openAddModal} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">+ Add Client</button>
      </div>
      <input type="text" placeholder="Search clients..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />

      {loading ? <LoadingSpinner label="Loading clients..." /> : (<>
        {/* MOBILE */}
        <div className="md:hidden space-y-2">
          {filtered.length === 0 ? <p className="text-center text-gray-400 py-8">No clients found</p> : filtered.map(c => (
            <button key={c.id} onClick={() => setDetailClient(c)} className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 active:bg-gray-50">
              <div className="flex items-center justify-between">
                <div><span className="text-sm font-bold text-gray-900">{c.name}</span><span className="text-[10px] text-gray-400 ml-2">#{c.id}</span></div>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </div>
            </button>
          ))}
        </div>
        {/* DESKTOP */}
        <div className="hidden md:block overflow-x-auto bg-white rounded-xl border border-gray-100 shadow-sm">
          <table className="min-w-full text-sm"><thead className="bg-gray-50"><tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">ID</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Client Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Created</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Actions</th>
          </tr></thead><tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">No clients found</td></tr> : filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium">{c.id}</td>
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEditModal(c)} className="px-3 py-1 bg-blue-500 text-white rounded text-xs">Edit</button>
                  <button onClick={() => handleDelete(c.id, c.name)} className="px-3 py-1 bg-red-500 text-white rounded text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </>)}

      {/* MOBILE DETAIL */}
      {detailClient && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setDetailClient(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div><h3 className="text-base font-bold text-gray-900">{detailClient.name}</h3><p className="text-xs text-gray-400">Client ID: {detailClient.id}</p></div>
              <button onClick={() => setDetailClient(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="px-5 py-4">
              <div className="flex justify-between py-2 border-b border-gray-50"><span className="text-xs text-gray-500">Created</span><span className="text-sm font-medium">{new Date(detailClient.created_at).toLocaleDateString()}</span></div>
            </div>
            <div className="px-5 pb-5 space-y-2">
              <button onClick={() => openEditModal(detailClient)} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold">Edit</button>
              <button onClick={() => handleDelete(detailClient.id, detailClient.name)} className="w-full py-2.5 bg-red-100 text-red-700 rounded-xl text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-6 py-4 border-b bg-gray-50 rounded-t-xl"><h3 className="text-lg font-semibold">{modalMode === "add" ? "Add New Client" : "Edit Client"}</h3></div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div><label className="block text-sm font-medium mb-1">Client Name <span className="text-red-500">*</span></label><input type="text" required value={clientName} onChange={e => setClientName(e.target.value)} className="w-full px-3 py-2.5 border rounded-xl text-sm" placeholder="Enter client name" /></div>
              <div className="flex gap-3 pt-2"><button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 border rounded-xl text-sm font-medium">Cancel</button><button type="submit" className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold">{modalMode === "add" ? "Add Client" : "Save"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}