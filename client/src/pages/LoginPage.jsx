import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuth } from "../api";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username || !pin) { setError("Username and PIN are required."); return; }
    if (!/^\d{4}$/.test(pin)) { setError("PIN must be exactly 4 digits."); return; }
    try {
      setLoading(true);
      const res = await api.post("/auth/login", { username, pin });
      setAuth(res.data.token, res.data.user);
      navigate(res.data.user.role === "admin" ? "/admin" : "/labour");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-4">
      <div className="max-w-sm w-full">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-lg mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">WorkTrack</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Employee ID</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={10}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="Enter your ID" autoComplete="username" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">PIN</label>
              <div className="flex items-center border border-gray-300 rounded-xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                <input type={showPin ? "text" : "password"} value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="flex-1 border-none outline-none text-base py-0.5 bg-transparent" placeholder="••••"
                  autoComplete="current-password" inputMode="numeric" />
                <button type="button" onClick={() => setShowPin((v) => !v)}
                  className="text-sm text-gray-500 hover:text-blue-600 font-medium ml-2 transition-colors">
                  {showPin ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300" />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <button type="button" onClick={() => setShowForgot(true)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Forgot PIN?
              </button>
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          WorkTrack &copy; {new Date().getFullYear()}
        </p>
      </div>

      {/* Forgot PIN Modal */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForgot(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mb-3">
                <span className="text-2xl">🔑</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Forgot your PIN?</h3>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <p>Contact your admin to reset your PIN.</p>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-700 mb-1">Steps:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-gray-500">
                  <li>Inform your supervisor or admin</li>
                  <li>Admin resets PIN </li>
                  <li>You'll receive your new 4-digit PIN</li>
                  <li>Login with your ID and new PIN</li>
                </ol>
              </div>
            </div>
            <button onClick={() => setShowForgot(false)}
              className="w-full mt-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}