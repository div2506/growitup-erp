import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

let _verifyingSession = false;

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
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const requestUrl = error?.config?.url || "";

    if (!error?.response) {
      return Promise.reject(error);
    }

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
            <AppRouter />
            <Toaster theme="dark" richColors position="top-right" />
          </AuthProvider>
        </BrowserRouter>
      </GoogleOAuthProvider>
    </div>
  );
}

export default App;
