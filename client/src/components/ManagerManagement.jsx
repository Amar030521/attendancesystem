import React, { useEffect, useState } from "react";
import { api } from "../api";

export function ManagerManagement() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ username: "", name: "", pin: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [createdPin, setCreatedPin] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setLoading(true); const { data } = await api.get("/admin/managers"); setManagers(data || []); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function openAdd() { setEditId(null); setForm({ username: "", name: "", pin: "", phone: "" }); setCreatedPin(null); setShowForm(true); }
  function openEdit(m) { setEditId(m.id); setForm({ username: m.username, name: m.name, pin: "", phone: m.phone || "" }); setCreatedPin(null); setShowForm(true); }

  async function handleSave() {
    if (!editId && (!form.username || !form.name || !form.pin)) return alert("Username, name, and PIN required");
    if (editId && !form.name) return alert("Name required");
    try {
      setSaving(true);
      if (editId) {
        const body = { name: form.name, phone: form.phone || null };
        if (form.pin) body.pin = form.pin;
        await api.put(`/admin/managers/${editId}`, body);
        setShowForm(false);
      } else {
        const { data } = await api.post("/admin/managers", form);
        setCreatedPin(data.pin);
      }
      await load();
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setSaving(false); }
  }

  async function toggleStatus(m) {
    try { await api.put(`/admin/managers/${m.id}`, { status: m.status === "active" ? "inactive" : "active" }); await load(); }
    catch (err) { alert("Failed"); }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this manager permanently?")) return;
    try { await api.delete(`/admin/managers/${id}`); await load(); } catch (err) { alert("Failed"); }
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">System Managers</h3>
        <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">+ Add Manager</button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        👤 Managers can: download reports, mark present/absent, edit attendance. They cannot manage labours, clients, sites, config, or other managers.
      </div>

      {managers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">No managers yet.</div>
      ) : (
        <div className="space-y-2">
          {managers.map(m => (
            <div key={m.id} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${m.status === "active" ? "border-blue-500" : "border-gray-300"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{m.name}</span>
                    <span className="text-xs text-gray-400">@{m.username}</span>
                    {m.status !== "active" && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  {m.phone && <div className="text-xs text-gray-500 mt-0.5">{m.phone}</div>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => toggleStatus(m)} className={`px-2.5 py-1 rounded-md text-xs font-semibold ${m.status === "active" ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"}`}>
                    {m.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => openEdit(m)} className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-600 text-xs font-semibold">Edit</button>
                  <button onClick={() => handleDelete(m.id)} className="px-2.5 py-1 rounded-md bg-red-50 text-red-600 text-xs font-semibold">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="px-5 py-4 border-b bg-gray-50 rounded-t-2xl">
              <h3 className="text-base font-semibold">{editId ? "Edit" : "Add"} Manager</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              {createdPin ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <div className="text-green-800 font-bold text-lg mb-1">Manager Created!</div>
                  <div className="text-sm text-green-700">Username: <strong>{form.username}</strong></div>
                  <div className="text-sm text-green-700">PIN: <strong className="text-2xl">{createdPin}</strong></div>
                  <p className="text-xs text-green-600 mt-2">Save this PIN — it won't be shown again.</p>
                </div>
              ) : (
                <>
                  {!editId && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Username <span className="text-red-500">*</span></label>
                      <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" placeholder="e.g. manager1" />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-1">Name <span className="text-red-500">*</span></label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">PIN (4 digits) {!editId && <span className="text-red-500">*</span>}</label>
                    <input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" placeholder={editId ? "Leave blank to keep current" : "4-digit PIN"} maxLength={4} type="password" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone</label>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" />
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border rounded-xl text-sm font-medium">{createdPin ? "Close" : "Cancel"}</button>
              {!createdPin && <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}