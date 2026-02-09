import React, { useEffect, useState } from "react";
import { api } from "../api";
import { LoadingSpinner } from "./LoadingSpinner";

export function ConfigManagement() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    regular_hours: "",
    helper_ot_rate: "",
    non_helper_ot_rate: "",
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
        helper_ot_rate: res.data.helper_ot_rate?.value || "3",
        non_helper_ot_rate: res.data.non_helper_ot_rate?.value || "4",
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
      console.error("Error updating config:", err);
      alert(err.response?.data?.message || "Failed to update configuration");
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingSpinner label="Loading configuration..." />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">System Configuration</h2>
        <p className="text-sm text-gray-500">Configure wage calculation rules</p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-sm">
        <p className="font-medium text-yellow-900">⚠️ Important:</p>
        <p className="text-yellow-700 mt-1">
          Changes to these settings will affect all future attendance calculations.
          Past attendance records will NOT be recalculated.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Standard Working Hours per Day</label>
            <input type="number" step="0.5" min="1" max="24" required value={formData.regular_hours}
              onChange={(e) => setFormData({ ...formData, regular_hours: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <p className="text-xs text-gray-500 mt-1">Current: {config.regular_hours?.value || "10"} hours</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Helper OT Rate (AED/hr)</label>
            <input type="number" step="0.5" min="0" max="50" required value={formData.helper_ot_rate}
              onChange={(e) => setFormData({ ...formData, helper_ot_rate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <p className="text-xs text-gray-500 mt-1">Current: AED {config.helper_ot_rate?.value || "3"}/hr — Fixed overtime rate for Helper designation</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Non-Helper OT Rate (AED/hr)</label>
            <input type="number" step="0.5" min="0" max="50" required value={formData.non_helper_ot_rate}
              onChange={(e) => setFormData({ ...formData, non_helper_ot_rate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <p className="text-xs text-gray-500 mt-1">Current: AED {config.non_helper_ot_rate?.value || "4"}/hr — Fixed overtime rate for Mason, Carpenter, etc.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sunday/Holiday OT Multiplier</label>
            <input type="number" step="0.1" min="1" max="5" required value={formData.sunday_ot_multiplier}
              onChange={(e) => setFormData({ ...formData, sunday_ot_multiplier: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <p className="text-xs text-gray-500 mt-1">Current: {config.sunday_ot_multiplier?.value || "1.5"}× — Sunday rate = OT Rate × this multiplier</p>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm">
          <p className="font-medium text-gray-900 mb-2">💡 Rate Summary (based on current settings):</p>
          <div className="space-y-1 text-gray-700">
            <p>• <strong>Standard Rate</strong> = Monthly Salary ÷ Days in Month ÷ {formData.regular_hours || "10"}h</p>
            <p>• <strong>OT Rate</strong> = Helper: AED {formData.helper_ot_rate || "3"}/hr | Non-Helper: AED {formData.non_helper_ot_rate || "4"}/hr</p>
            <p>• <strong>Sunday/Holiday Rate</strong> = OT Rate × {formData.sunday_ot_multiplier || "1.5"} → Helper: AED {(parseFloat(formData.helper_ot_rate || "3") * parseFloat(formData.sunday_ot_multiplier || "1.5")).toFixed(2)}/hr | Non-Helper: AED {(parseFloat(formData.non_helper_ot_rate || "4") * parseFloat(formData.sunday_ot_multiplier || "1.5")).toFixed(2)}/hr</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="px-6 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 disabled:opacity-50">
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}