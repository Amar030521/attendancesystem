import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { LabourDashboard } from "./pages/LabourDashboard";
import { AdminDashboard } from "./pages/AdminDashboard";
import { getStoredUser } from "./api";

function ProtectedRoute({ children, role }) {
  const user = getStoredUser();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/labour"
        element={
          <ProtectedRoute role="labour">
            <LabourDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

