import React, { useEffect, useState, createContext, useContext, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/sonner";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EmployeesPage from "@/pages/EmployeesPage";
import DepartmentsPage from "@/pages/DepartmentsPage";
import JobPositionsPage from "@/pages/JobPositionsPage";
import SettingsPage from "@/pages/SettingsPage";
import PerformancePage from "@/pages/PerformancePage";
import ShiftsPage from "@/pages/ShiftsPage";
import AttendanceIndexPage from "@/pages/AttendanceIndexPage";
import LeaveIndexPage from "@/pages/LeaveIndexPage";
import WFHIndexPage from "@/pages/WFHIndexPage";
import OvertimeIndexPage from "@/pages/OvertimeIndexPage";
import PayrollIndexPage from "@/pages/PayrollIndexPage";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import { AuthProvider } from "@/contexts/AuthContext";
import axios from "axios";
import "@/App.css";

// ── Server-down context ───────────────────────────────────────────────────────
const ServerDownContext = createContext({ serverDown: false, firstLoad: true });
export const useServerDown = () => useContext(ServerDownContext);

// Set axios defaults so ALL requests include the session token as Bearer header.
axios.defaults.withCredentials = true;
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("session_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEALTH_URL = `${process.env.REACT_APP_BACKEND_URL}/health`;

// Module-level callbacks so the interceptor can talk to the React tree
let _setServerDown = null;
let _verifyingSession = false;

async function _checkSessionAlive() {
  try {
    const token = localStorage.getItem("session_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include", headers });
    return res.status;
  } catch {
    return null; // network error — server unreachable
  }
}

axios.interceptors.response.use(
  (response) => {
    // Any successful response means server is up
    if (_setServerDown) _setServerDown(false);
    return response;
  },
  async (error) => {
    const status = error?.response?.status;
    const requestUrl = error?.config?.url || "";

    // No response = network error — let the heartbeat decide if server is truly down.
    // Don't set serverDown=true here; a single failed request is not conclusive.
    if (!error?.response) {
      return Promise.reject(error);
    }

    // Server responded (even with error) → it's up
    if (_setServerDown) _setServerDown(false);

    // 401 handling — verify before logging out
    if (status === 401 && !requestUrl.includes("/auth/me") && !_verifyingSession) {
      _verifyingSession = true;
      try {
        await new Promise(r => setTimeout(r, 800));
        const firstCheck = await _checkSessionAlive();
        if (firstCheck === null) return Promise.reject(error);
        if (firstCheck === 401 || firstCheck === 403) {
          await new Promise(r => setTimeout(r, 1200));
          const secondCheck = await _checkSessionAlive();
          if (secondCheck === null) return Promise.reject(error);
          if (secondCheck === 401 || secondCheck === 403) {
            localStorage.removeItem("session_token");
            localStorage.removeItem("cached_user");
            localStorage.removeItem("cached_employee");
            window.location.href = "/login";
          }
        }
      } finally {
        _verifyingSession = false;
      }
    }
    return Promise.reject(error);
  }
);

// ── Full-screen server-down overlay ──────────────────────────────────────────
function ServerDownOverlay({ firstLoad }) {
  const [dots, setDots] = useState(".");

  // Animate dots
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 500);
    return () => clearInterval(id);
  }, []);

  if (firstLoad) {
    // First load / page refresh — full opaque screen
    return (
      <div className="fixed inset-0 z-[9999] bg-[#191919] flex flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-4">
          {/* Pulsing logo area */}
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="#444" strokeWidth="2" />
              <path d="M10 22 L16 10 L22 22" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {/* Skeleton bars */}
          <div className="space-y-2 w-48">
            <div className="h-2.5 bg-white/10 rounded animate-pulse" />
            <div className="h-2.5 bg-white/10 rounded animate-pulse w-3/4 mx-auto" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-white text-sm font-medium">Server is starting up{dots}</p>
          <p className="text-[#555] text-xs mt-1">This usually takes 30–60 seconds. Please wait.</p>
        </div>
      </div>
    );
  }

  // Mid-session drop — slim top banner + backdrop
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex flex-col items-start justify-start">
      <div className="w-full bg-[#2F2F2F] border-b border-amber-500/30 px-4 py-3 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <div>
          <p className="text-amber-400 text-sm font-medium">Connection lost — reconnecting{dots}</p>
          <p className="text-[#B3B3B3] text-xs">Server is temporarily unavailable. Retrying automatically.</p>
        </div>
      </div>
    </div>
  );
}

// ── Server-down monitor ───────────────────────────────────────────────────────
function ServerDownMonitor({ children }) {
  const [serverDown, setServerDown] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);
  const firstLoadRef = useRef(true);
  const debounceTimer = useRef(null);

  // Wire the module-level setter into this component's state.
  // Debounce "down" signals — only show the overlay if the server has been
  // unreachable for 3 consecutive seconds. This prevents a single failed
  // request during page load from triggering a reload loop.
  useEffect(() => {
    _setServerDown = (down) => {
      if (down) {
        // Only set serverDown=true after 3s of continuous failure
        if (!debounceTimer.current) {
          debounceTimer.current = setTimeout(() => {
            debounceTimer.current = null;
            setServerDown(true);
          }, 3000);
        }
      } else {
        // Server is reachable — cancel any pending debounce and clear the flag
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
        }
        setServerDown(false);
        if (firstLoadRef.current) {
          firstLoadRef.current = false;
          setFirstLoad(false);
        }
      }
    };
    return () => {
      _setServerDown = null;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Always-on heartbeat — pings /health every 30s regardless of user activity.
  // This detects server going down even when no API calls are in flight.
  useEffect(() => {
    const heartbeat = setInterval(async () => {
      try {
        const res = await fetch(HEALTH_URL);
        if (res.ok) {
          setServerDown(false);
          if (firstLoadRef.current) { firstLoadRef.current = false; setFirstLoad(false); }
        } else {
          setServerDown(true);
        }
      } catch {
        setServerDown(true);
      }
    }, 30000);
    return () => clearInterval(heartbeat);
  }, []);

  // When server is down, additionally poll /health every 5s for faster recovery
  useEffect(() => {
    if (!serverDown) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(HEALTH_URL);
        if (res.ok) {
          if (document.visibilityState === 'visible') {
            // Tab is active — reload so all data re-fetches cleanly
            window.location.reload();
          } else {
            // Tab is in background — just dismiss the overlay silently
            setServerDown(false);
            if (firstLoadRef.current) { firstLoadRef.current = false; setFirstLoad(false); }
          }
        }
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [serverDown]);

  return (
    <ServerDownContext.Provider value={{ serverDown, firstLoad }}>
      {children}
      {serverDown && <ServerDownOverlay firstLoad={firstLoad} />}
    </ServerDownContext.Provider>
  );
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="job-positions" element={<JobPositionsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="attendance" element={<AttendanceIndexPage />} />
        <Route path="leave" element={<LeaveIndexPage />} />
        <Route path="leave-requests" element={<LeaveIndexPage />} />
        <Route path="wfh" element={<WFHIndexPage />} />
        <Route path="overtime" element={<OvertimeIndexPage />} />
        <Route path="payroll" element={<PayrollIndexPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID || "placeholder";

function App() {
  return (
    <div className="App">
      <GoogleOAuthProvider clientId={googleClientId}>
        <BrowserRouter>
          <AuthProvider>
            <ServerDownMonitor>
              <AppRouter />
              <Toaster theme="dark" richColors position="top-right" />
            </ServerDownMonitor>
          </AuthProvider>
        </BrowserRouter>
      </GoogleOAuthProvider>
    </div>
  );
}

export default App;
