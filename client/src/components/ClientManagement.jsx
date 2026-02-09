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

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    try {
      setLoading(true);
      const res = await api.get("/admin/clients");
      setClients(res.data);
    } catch (err) {
      console.error("Error loading clients:", err);
      alert("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setModalMode("add");
    setClientName("");
    setCurrentClient(null);
    setShowModal(true);
  }

  function openEditModal(client) {
    setModalMode("edit");
    setCurrentClient(client);
    setClientName(client.name);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setClientName("");
    setCurrentClient(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    if (!clientName.trim()) {
      alert("Client name is required");
      return;
    }

    try {
      if (modalMode === "add") {
        await api.post("/admin/clients", { name: clientName });
      } else {
        await api.put(`/admin/clients/${currentClient.id}`, { name: clientName });
      }
      await loadClients();
      closeModal();
      alert(`Client ${modalMode === "add" ? "added" : "updated"} successfully!`);
    } catch (err) {
      console.error("Error saving client:", err);
      alert(err.response?.data?.message || "Failed to save client");
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Are you sure you want to delete "${name}"?\n\nThis will fail if the client has attendance records.`)) {
      return;
    }
    
    try {
      await api.delete(`/admin/clients/${id}`);
      await loadClients();
      alert("Client deleted successfully!");
    } catch (err) {
      console.error("Error deleting client:", err);
      alert(err.response?.data?.message || "Failed to delete client. It may have attendance records.");
    }
  }

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Client Management</h2>
          <p className="text-sm text-gray-500">Manage clients and their project sites</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600"
        >
          + Add Client
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search clients..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />

      {/* Table */}
      {loading ? (
        <LoadingSpinner label="Loading clients..." />
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created At</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                    No clients found
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{client.id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{client.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {new Date(client.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                      <button
                        onClick={() => openEditModal(client)}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(client.id, client.name)}
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
                {modalMode === "add" ? "Add New Client" : "Edit Client"}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Enter client name"
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
                  {modalMode === "add" ? "Add Client" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
