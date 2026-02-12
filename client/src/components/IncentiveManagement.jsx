import React, { useEffect, useState } from "react";
import { api } from "../api";

export function IncentiveManagement() {
  const [rules, setRules] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ client_id: "", name: "", description: "", rule_type: "sunday_count", threshold: 2, amount: "", per_occurrence: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const [r, c] = await Promise.all([api.get("/admin/incentive-rules"), api.get("/admin/clients")]);
      setRules(r.data || []);
      setClients(c.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function openAdd() { setEditId(null); setForm({ client_id: "", name: "", description: "", rule_type: "sunday_count", threshold: 2, amount: "", per_occurrence: false }); setShowForm(true); }
  function openEdit(r) { setEditId(r.id); setForm({ client_id: r.client_id, name: r.name, description: r.description || "", rule_type: r.rule_type, threshold: r.threshold, amount: r.amount, per_occurrence: r.per_occurrence }); setShowForm(true); }

  async function handleSave() {
    if (!form.client_id || !form.name || !form.amount) return alert("Client, name, and amount required");
    try {
      setSaving(true);
      if (editId) { await api.put(`/admin/incentive-rules/${editId}`, { ...form, threshold: Number(form.threshold), amount: Number(form.amount) }); }
      else { await api.post("/admin/incentive-rules", { ...form, threshold: Number(form.threshold), amount: Number(form.amount) }); }
      setShowForm(false);
      await load();
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) { if (!window.confirm("Delete this incentive rule?")) return; try { await api.delete(`/admin/incentive-rules/${id}`); await load(); } catch (err) { alert("Failed"); } }
  async function toggleActive(r) { try { await api.put(`/admin/incentive-rules/${r.id}`, { active: !r.active }); await load(); } catch (err) { alert("Failed"); } }

  const ruleTypeLabel = { sunday_count: "Sunday Count", days_worked: "Days Worked", fixed: "Fixed Bonus" };

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Incentive Rules</h3>
        <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">+ Add Rule</button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        💡 Define client-specific incentive rules. These are automatically calculated in the Payroll with Incentives report.
      </div>

      {rules.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">No incentive rules yet. Add one to get started.</div>
      ) : (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${r.active ? "border-green-500" : "border-gray-300"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{r.name}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{r.client_name}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{ruleTypeLabel[r.rule_type] || r.rule_type}</span>
                    {!r.active && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  {r.description && <div className="text-xs text-gray-500 mt-1">{r.description}</div>}
                  <div className="text-xs text-gray-600 mt-1">
                    Threshold: <strong>{r.threshold}</strong> • Amount: <strong>AED {r.amount}</strong>
                    {r.per_occurrence && " (per occurrence)"}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 ml-3">
                  <button onClick={() => toggleActive(r)} className={`px-2.5 py-1 rounded-md text-xs font-semibold ${r.active ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"}`}>
                    {r.active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => openEdit(r)} className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-600 text-xs font-semibold">Edit</button>
                  <button onClick={() => handleDelete(r.id)} className="px-2.5 py-1 rounded-md bg-red-50 text-red-600 text-xs font-semibold">Delete</button>
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
              <h3 className="text-base font-semibold">{editId ? "Edit" : "Add"} Incentive Rule</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Client <span className="text-red-500">*</span></label>
                <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm">
                  <option value="">Select client</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rule Name <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" placeholder="e.g. Sunday Incentive" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" placeholder="e.g. Bonus for 2+ Sundays" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rule Type</label>
                <select value={form.rule_type} onChange={e => setForm(f => ({ ...f, rule_type: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm">
                  <option value="sunday_count">Sunday Count (worked X Sundays for this client)</option>
                  <option value="days_worked">Days Worked (worked X days for this client)</option>
                  <option value="fixed">Fixed Bonus (any work for this client)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Threshold</label>
                  <input type="number" min="1" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Min occurrences to qualify</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Amount (AED) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.per_occurrence} onChange={e => setForm(f => ({ ...f, per_occurrence: e.target.checked }))} className="rounded" />
                <span className="text-sm">Per occurrence above threshold (multiply amount)</span>
              </label>
            </div>
            <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border rounded-xl text-sm font-medium">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}