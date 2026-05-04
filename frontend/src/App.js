import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/sonner";
import LoginPage from "@/pages/LoginPage";
import EmployeesPage from "@/pages/EmployeesPage";
import DepartmentsPage from "@/pages/DepartmentsPage";
import JobPositionsPage from "@/pages/JobPositionsPage";
import SettingsPage from "@/pages/SettingsPage";
import PerformancePage from "@/pages/PerformancePage";
import ShiftsPage from "@/pages/ShiftsPage";
import AttendancePage from "@/pages/AttendancePage";
import LeaveIndexPage from "@/pages/LeaveIndexPage";
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
        <Route index element={<Navigate to="/employees" replace />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="job-positions" element={<JobPositionsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<LeaveIndexPage />} />
        <Route path="leave-requests" element={<LeaveIndexPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/employees" replace />} />
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
