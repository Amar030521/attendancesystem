import React, { useEffect, useState } from "react";
import { api } from "../api";
import { LoadingSpinner } from "./LoadingSpinner";

export function HolidayManagement() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ date: "", name: "" });
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadHolidays();
  }, []);

  async function loadHolidays() {
    try {
      setLoading(true);
      const res = await api.get("/admin/holidays");
      setHolidays(res.data);
    } catch (err) {
      console.error("Error loading holidays:", err);
      alert("Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setFormData({ date: "", name: "" });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setFormData({ date: "", name: "" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    if (!formData.date || !formData.name.trim()) {
      alert("Date and name are required");
      return;
    }

    try {
      await api.post("/admin/holidays", formData);
      await loadHolidays();
      closeModal();
      alert("Holiday added successfully!");
    } catch (err) {
      console.error("Error adding holiday:", err);
      alert(err.response?.data?.message || "Failed to add holiday");
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    
    try {
      await api.delete(`/admin/holidays/${id}`);
      await loadHolidays();
      alert("Holiday deleted successfully!");
    } catch (err) {
      console.error("Error deleting holiday:", err);
      alert("Failed to delete holiday");
    }
  }

  async function handleCSVImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setImporting(true);
      const res = await api.post("/admin/holidays/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadHolidays();
      alert(`✅ Imported ${res.data.createdCount} holidays!`);
    } catch (err) {
      console.error("Error importing CSV:", err);
      alert(err.response?.data?.message || "Failed to import CSV");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  // Group holidays by year
  const holidaysByYear = holidays.reduce((acc, holiday) => {
    const year = new Date(holiday.date).getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(holiday);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Holiday Management</h2>
          <p className="text-sm text-gray-500">Manage public holidays for wage calculation</p>
        </div>
        <div className="flex gap-2">
          <label className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium cursor-pointer hover:bg-blue-600">
            📁 Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              disabled={importing}
              className="hidden"
            />
          </label>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600"
          >
            + Add Holiday
          </button>
        </div>
      </div>

      {/* CSV Import Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm">
        <p className="font-medium text-blue-900">CSV Import Format:</p>
        <code className="text-xs bg-blue-100 px-2 py-1 rounded mt-1 inline-block">
          date,name
        </code>
        <p className="text-xs text-blue-700 mt-1">Date format: YYYY-MM-DD (e.g., 2026-12-25)</p>
      </div>

      {/* Holidays by Year */}
      {loading ? (
        <LoadingSpinner label="Loading holidays..." />
      ) : Object.keys(holidaysByYear).length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No holidays configured
        </div>
      ) : (
        <div className="space-y-6">
          {Object.keys(holidaysByYear).sort((a, b) => b - a).map((year) => (
            <div key={year} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h3 className="font-semibold text-gray-700">Year {year}</h3>
              </div>
              <div className="divide-y">
                {holidaysByYear[year]
                  .sort((a, b) => new Date(a.date) - new Date(b.date))
                  .map((holiday) => (
                    <div
                      key={holiday.id}
                      className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-700">
                            {new Date(holiday.date).getDate()}
                          </div>
                          <div className="text-xs text-gray-500 uppercase">
                            {new Date(holiday.date).toLocaleDateString("en-US", {
                              month: "short",
                            })}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">{holiday.name}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(holiday.date).toLocaleDateString("en-US", {
                              weekday: "long",
                            })}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(holiday.id, holiday.name)}
                        className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Add New Holiday</h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Holiday Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="e.g., National Day"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600"
                >
                  Add Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
