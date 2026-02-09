import React, { useEffect, useState } from "react";
import { api } from "../api";
import { LoadingSpinner } from "./LoadingSpinner";

export function LabourManagement() {
  const [labours, setLabours] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [currentLabour, setCurrentLabour] = useState(null);
  const [formData, setFormData] = useState({
    name: "", daily_wage: "", phone: "", passport_id: "", designation: "", date_of_joining: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [importing, setImporting] = useState(false);
  // Store plain PINs from creation/reset (keyed by labour id)
  const [knownPins, setKnownPins] = useState({});

  useEffect(() => {
    loadLabours();
  }, []);

  async function loadLabours() {
    try {
      setLoading(true);
      const res = await api.get("/admin/labours");
      setLabours(res.data);
    } catch (err) {
      console.error("Error loading labours:", err);
      alert("Failed to load labours");
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setModalMode("add");
    setFormData({ name: "", daily_wage: "", phone: "", passport_id: "", designation: "", date_of_joining: "" });
    setCurrentLabour(null);
    setShowModal(true);
  }

  function openEditModal(labour) {
    setModalMode("edit");
    setCurrentLabour(labour);
    setFormData({
      name: labour.name,
      daily_wage: labour.daily_wage,
      phone: labour.phone || "",
      passport_id: labour.passport_id || "",
      designation: labour.designation || "",
      date_of_joining: labour.date_of_joining || "",
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setFormData({ name: "", daily_wage: "", phone: "", passport_id: "", designation: "", date_of_joining: "" });
    setCurrentLabour(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name || !formData.daily_wage) {
      alert("Name and Monthly Wages are required");
      return;
    }

    try {
      if (modalMode === "add") {
        const res = await api.post("/admin/labours", formData);
        // Store the plain PIN from creation
        setKnownPins((prev) => ({ ...prev, [res.data.id]: res.data.pin }));
        alert(`Labour added!\n\nID: ${res.data.id}\nPIN: ${res.data.pin}\n\nPlease note the PIN!`);
      } else {
        await api.put(`/admin/labours/${currentLabour.id}`, formData);
        alert("Labour updated successfully!");
      }
      await loadLabours();
      closeModal();
    } catch (err) {
      console.error("Error saving labour:", err);
      alert(err.response?.data?.message || "Failed to save labour");
    }
  }

  async function handleDeactivate(id, name) {
    if (!window.confirm(`Deactivate ${name}?`)) return;
    try {
      await api.delete(`/admin/labours/${id}`);
      await loadLabours();
    } catch (err) {
      console.error(err);
      alert("Failed to deactivate");
    }
  }

  async function handleActivate(id, name) {
    if (!window.confirm(`Reactivate ${name}?`)) return;
    try {
      await api.put(`/admin/labours/${id}/activate`);
      await loadLabours();
    } catch (err) {
      console.error(err);
      alert("Failed to activate");
    }
  }

  async function handlePermanentDelete(id, name) {
    if (!window.confirm(`PERMANENTLY DELETE ${name} and ALL their attendance records?\n\nThis CANNOT be undone!`)) return;
    try {
      await api.delete(`/admin/labours/${id}/permanent`);
      await loadLabours();
      alert("Labour permanently deleted.");
    } catch (err) {
      console.error(err);
      alert("Failed to delete");
    }
  }

  async function handleResetPin(id, name) {
    if (!window.confirm(`Reset PIN for ${name}?`)) return;
    try {
      const res = await api.post(`/admin/labours/${id}/reset-pin`);
      setKnownPins((prev) => ({ ...prev, [id]: res.data.newPin }));
      alert(`New PIN for ${name}: ${res.data.newPin}\n\nPlease note this down!`);
    } catch (err) {
      console.error(err);
      alert("Failed to reset PIN");
    }
  }

  async function handleCSVImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);

    try {
      setImporting(true);
      const res = await api.post("/admin/labours/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // Store PINs
      const newPins = {};
      let message = `✅ Imported ${res.data.createdCount} labours!\n\nLogin credentials:\n\n`;
      res.data.labours.forEach((l) => {
        newPins[l.id] = l.pin;
        message += `ID: ${l.id} | Name: ${l.name} | PIN: ${l.pin}\n`;
      });
      setKnownPins((prev) => ({ ...prev, ...newPins }));
      alert(message);
      await loadLabours();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to import CSV");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  const filteredLabours = labours.filter(
    (l) =>
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(l.id).includes(searchTerm) ||
      (l.passport_id && l.passport_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.designation && l.designation.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Labour Management</h2>
          <p className="text-sm text-gray-500">Manage labour employees and their details</p>
        </div>
        <div className="flex gap-2">
          <label className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium cursor-pointer hover:bg-blue-600">
            📁 Import CSV
            <input type="file" accept=".csv" onChange={handleCSVImport} disabled={importing} className="hidden" />
          </label>
          <button onClick={openAddModal}
            className="px-4 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600">
            + Add Labour
          </button>
        </div>
      </div>

      {/* Search */}
      <input type="text" placeholder="Search by name or ID..."
        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />

      {/* CSV Import Format */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm">
        <p className="font-medium text-blue-900">CSV Import Format:</p>
        <code className="text-xs bg-blue-100 px-2 py-1 rounded mt-1 inline-block">
          name,daily_wage,phone,passport_id,designation,date_of_joining
        </code>
        <p className="text-xs text-blue-700 mt-1">System will auto-generate IDs and PINs. daily_wage = monthly wages.</p>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingSpinner label="Loading labours..." />
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Designation</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monthly Wages</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Passport ID</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joining Date</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">PIN</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLabours.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-4 py-8 text-center text-gray-500">No labours found</td>
                </tr>
              ) : (
                filteredLabours.map((labour) => (
                  <tr key={labour.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 whitespace-nowrap font-medium">{labour.id}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{labour.name}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">{labour.designation || "-"}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-right">
                      AED {Number(labour.daily_wage).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{labour.phone || "-"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{labour.passport_id || "-"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {labour.date_of_joining
                        ? new Date(labour.date_of_joining).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                        : "-"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-center">
                      {knownPins[labour.id] ? (
                        <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-mono font-bold">
                          {knownPins[labour.id]}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">••••</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        labour.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}>
                        {labour.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-right space-x-1">
                      <button onClick={() => openEditModal(labour)}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">
                        Edit
                      </button>
                      <button onClick={() => handleResetPin(labour.id, labour.name)}
                        className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600">
                        Reset PIN
                      </button>
                      {labour.status === "active" ? (
                        <button onClick={() => handleDeactivate(labour.id, labour.name)}
                          className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600">
                          Deactivate
                        </button>
                      ) : (
                        <button onClick={() => handleActivate(labour.id, labour.name)}
                          className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600">
                          Activate
                        </button>
                      )}
                      <button onClick={() => handlePermanentDelete(labour.id, labour.name)}
                        className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">
                {modalMode === "add" ? "Add New Labour" : "Edit Labour"}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input type="text" required value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Enter labour name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monthly Wages (AED) <span className="text-red-500">*</span>
                </label>
                <input type="number" required min="1" value={formData.daily_wage}
                  onChange={(e) => setFormData({ ...formData, daily_wage: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="e.g. 1200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="+971 50 123 4567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Passport ID</label>
                <input type="text" value={formData.passport_id}
                  onChange={(e) => setFormData({ ...formData, passport_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="e.g. AB1234567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                <input type="text" value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="e.g. Helper, Carpenter" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining</label>
                <input type="date" value={formData.date_of_joining}
                  onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              {modalMode === "edit" && currentLabour && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={formData.status || currentLabour.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600">
                  {modalMode === "add" ? "Add Labour" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}