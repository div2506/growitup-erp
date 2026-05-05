import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AuthContext = createContext(null);

// Helper: returns headers with Authorization if token in localStorage
function authHeaders() {
  const token = localStorage.getItem("session_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

// Helper: fetch with both cookie + Authorization header fallback
function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: { ...(options.headers || {}), ...authHeaders() },
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [myEmployee, setMyEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employeeLoading, setEmployeeLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    setEmployeeLoading(true);
    try {
      const response = await authFetch(`${API}/auth/me`);
      if (!response.ok) {
        // Only clear session on auth errors (401/403), not on server/network errors
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem("session_token");
          setUser(null); setMyEmployee(null);
        }
        // For 5xx or other errors, keep existing user state (don't log out)
        setLoading(false); setEmployeeLoading(false);
        return;
      }
      const userData = await response.json();
      if (!userData || !userData.user_id) {
        setUser(null); setMyEmployee(null);
        setLoading(false); setEmployeeLoading(false);
        return;
      }
      setUser(userData);
      setLoading(false);
      try {
        const empRes = await authFetch(`${API}/me/employee`);
        if (empRes.ok) {
          const empData = await empRes.json();
          if (empData?.employee_id) setMyEmployee(empData);
          else setMyEmployee(null);
        } else {
          setMyEmployee(null);
        }
      } catch {
        // Network error fetching employee — keep existing employee state
      }
    } catch {
      // Network error — do NOT log out, keep existing user state
      // This prevents logout on temporary connectivity issues
    } finally {
      setLoading(false);
      setEmployeeLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ user, setUser, myEmployee, setMyEmployee, loading, employeeLoading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { API, authHeaders, authFetch };
