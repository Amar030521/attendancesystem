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

  useEffect(() => {
    loadClients();
    loadSites();
  }, []);

  async function loadClients() {
    try {
      const res = await api.get("/admin/clients");
      setClients(res.data);
    } catch (err) {
      console.error("Error loading clients:", err);
    }
  }

  async function loadSites() {
    try {
      setLoading(true);
      const res = await api.get("/admin/sites");
      setSites(res.data);
    } catch (err) {
      console.error("Error loading sites:", err);
      alert("Failed to load sites");
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setModalMode("add");
    setFormData({ client_id: "", name: "" });
    setCurrentSite(null);
    setShowModal(true);
  }

  function openEditModal(site) {
    setModalMode("edit");
    setCurrentSite(site);
    setFormData({ client_id: site.client_id, name: site.name });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setFormData({ client_id: "", name: "" });
    setCurrentSite(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    if (!formData.client_id || !formData.name.trim()) {
      alert("Client and site name are required");
      return;
    }

    try {
      if (modalMode === "add") {
        await api.post("/admin/sites", formData);
      } else {
        await api.put(`/admin/sites/${currentSite.id}`, formData);
      }
      await loadSites();
      closeModal();
      alert(`Site ${modalMode === "add" ? "added" : "updated"} successfully!`);
    } catch (err) {
      console.error("Error saving site:", err);
      alert(err.response?.data?.message || "Failed to save site");
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Are you sure you want to delete "${name}"?\n\nThis will fail if the site has attendance records.`)) {
      return;
    }
    
    try {
      await api.delete(`/admin/sites/${id}`);
      await loadSites();
      alert("Site deleted successfully!");
    } catch (err) {
      console.error("Error deleting site:", err);
      alert(err.response?.data?.message || "Failed to delete site. It may have attendance records.");
    }
  }

  const filteredSites = sites.filter(s => {
    const matchesClient = !filterClient || s.client_id === parseInt(filterClient);
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         s.client_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesClient && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Site Management</h2>
          <p className="text-sm text-gray-500">Manage project sites for each client</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600"
        >
          + Add Site
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search sites..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      {/* Table */}
      {loading ? (
        <LoadingSpinner label="Loading sites..." />
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created At</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSites.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                    No sites found
                  </td>
                </tr>
              ) : (
                filteredSites.map((site) => (
                  <tr key={site.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{site.id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        {site.client_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{site.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {new Date(site.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                      <button
                        onClick={() => openEditModal(site)}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(site.id, site.name)}
                        className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                      >
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">
                {modalMode === "add" ? "Add New Site" : "Edit Site"}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Select a client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Site Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Enter site name"
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
                  {modalMode === "add" ? "Add Site" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
