import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LoginPage from "@/pages/LoginPage";
import EmployeesPage from "@/pages/EmployeesPage";
import DepartmentsPage from "@/pages/DepartmentsPage";
import JobPositionsPage from "@/pages/JobPositionsPage";
import AuthCallback from "@/components/AuthCallback";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import { AuthProvider } from "@/contexts/AuthContext";
import "@/App.css";

function AppRouter() {
  const location = useLocation();
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  // Synchronously detect session_id in hash to prevent race conditions
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
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
      </Route>
      <Route path="*" element={<Navigate to="/employees" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster theme="dark" richColors position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
