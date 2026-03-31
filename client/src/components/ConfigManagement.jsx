import React, { useEffect, useState } from "react";
import { api } from "../api";
import { LoadingSpinner } from "./LoadingSpinner";

export function ConfigManagement() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    regular_hours: "",
    sunday_ot_multiplier: "",
  });

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      const res = await api.get("/admin/config");
      setConfig(res.data);
      setFormData({
        regular_hours: res.data.regular_hours?.value || "10",
        sunday_ot_multiplier: res.data.sunday_ot_multiplier?.value || "1.5",
      });
    } catch (err) {
      console.error("Error loading config:", err);
      alert("Failed to load configuration");
    } finally { setLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      await api.put("/admin/config", formData);
      await loadConfig();
      alert("Configuration updated successfully!");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update configuration");
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingSpinner label="Loading configuration..." />;

  const stdHours = parseFloat(formData.regular_hours || "10");
  const sunMult = parseFloat(formData.sunday_ot_multiplier || "1.5");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">System Configuration</h2>
        <p className="text-sm text-gray-500">Configure wage calculation rules</p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm">
        <p className="font-medium text-yellow-900">⚠️ Important:</p>
        <p className="text-yellow-700 mt-1">
          Changes to these settings will affect all future attendance calculations.
          Past attendance records will NOT be recalculated.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Standard Working Hours per Day</label>
            <input type="number" step="0.5" min="1" max="24" required value={formData.regular_hours}
              onChange={(e) => setFormData({ ...formData, regular_hours: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
            <p className="text-xs text-gray-500 mt-1">Current: {config.regular_hours?.value || "10"} hours</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sunday/Holiday OT Multiplier</label>
            <input type="number" step="0.1" min="1" max="5" required value={formData.sunday_ot_multiplier}
              onChange={(e) => setFormData({ ...formData, sunday_ot_multiplier: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
            <p className="text-xs text-gray-500 mt-1">Current: {config.sunday_ot_multiplier?.value || "1.5"}× — Sunday rate = OT Rate × this multiplier</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-blue-900 mb-3">💡 Payment Formula Summary</p>
          <div className="space-y-2 text-blue-800">
            <p><strong>Standard Rate</strong> = Monthly Salary ÷ Days in Month ÷ {stdHours}h</p>
            <p><strong>OT Rate</strong> = Monthly Salary ÷ 30 ÷ 10</p>
            <p><strong>Sunday/Holiday OT Rate</strong> = OT Rate × {sunMult}</p>
          </div>
          <div className="mt-3 pt-3 border-t border-blue-200 space-y-1 text-blue-700 text-xs">
            <p>Example (Salary AED 1,500): OT = 1500÷30÷10 = <strong>AED 5.00/hr</strong> → Sunday OT = 5.00 × {sunMult} = <strong>AED {(5 * sunMult).toFixed(2)}/hr</strong></p>
            <p>Example (Salary AED 1,200): OT = 1200÷30÷10 = <strong>AED 4.00/hr</strong> → Sunday OT = 4.00 × {sunMult} = <strong>AED {(4 * sunMult).toFixed(2)}/hr</strong></p>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-emerald-900 mb-2">📅 Sunday/Holiday Auto-Pay</p>
          <p className="text-emerald-700">Every Sunday and holiday automatically includes base daily pay (Salary ÷ Days in Month) in the monthly total, even if the labour did not mark attendance. If they did work on Sunday, all worked hours are treated as overtime.</p>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}