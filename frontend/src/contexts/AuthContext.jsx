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
        setUser(null); setMyEmployee(null);
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
        setMyEmployee(null);
      }
    } catch {
      setUser(null); setMyEmployee(null);
      setLoading(false);
    } finally {
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
