import React from "react";
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

// Set axios defaults so ALL requests include the session token as Bearer header.
// This is the cross-device/mobile fallback when cookies are blocked (Safari, strict browsers).
axios.defaults.withCredentials = true;
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("session_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Global 401 handler: when any request returns 401, verify with /auth/me before logging out.
// This prevents false logouts from transient server errors on data endpoints.
let _verifyingSession = false;
const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const requestUrl = error?.config?.url || "";
    // Only act on 401; ignore if it's already from /auth/me (avoid loop)
    if (status === 401 && !requestUrl.includes("/auth/me") && !_verifyingSession) {
      _verifyingSession = true;
      try {
        const token = localStorage.getItem("session_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include", headers });
        if (res.status === 401 || res.status === 403) {
          // Session is genuinely dead — clear and redirect to login
          localStorage.removeItem("session_token");
          window.location.href = "/login";
        }
        // If /auth/me is OK (2xx/5xx), session is fine — transient 401 on data endpoint, do nothing
      } catch {
        // Network error during verify — keep user logged in
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
