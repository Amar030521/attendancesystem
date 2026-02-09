import React from "react";
import { useNavigate } from "react-router-dom";
import { getStoredUser, setAuth } from "../api";

export function LayoutShell({ children, title, designation }) {
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => { setAuth(null, null); navigate("/"); };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-primary text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{title || "WorkTrack"}</h1>
          {user && (
            <div className="text-sm text-blue-100">
              {user.name}
              {(designation || user.designation) && (
                <span className="ml-1 text-blue-200 text-xs">• {designation || user.designation}</span>
              )}
            </div>
          )}
        </div>
        {user && (
          <button onClick={handleLogout} className="px-4 py-2 bg-white text-primary font-medium rounded-md shadow-sm hover:bg-blue-50 text-sm">
            Logout
          </button>
        )}
      </header>
      <main className="flex-1 px-3 py-4 md:px-6 md:py-6">{children}</main>
    </div>
  );
}