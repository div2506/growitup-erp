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
      let response = await authFetch(`${API}/auth/me`);

      // On 401, wait 1.5s and retry once before logging out.
      // This handles transient issues (cache expiry race, brief network hiccup).
      if (response.status === 401 || response.status === 403) {
        await new Promise(r => setTimeout(r, 1500));
        response = await authFetch(`${API}/auth/me`);
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Genuine auth failure after retry — clear session and log out
          localStorage.removeItem("session_token");
          setUser(null);
          setMyEmployee(null);
        }
        // 5xx / network-level errors: keep existing user state, don't log out
        setLoading(false);
        setEmployeeLoading(false);
        return;
      }

      const userData = await response.json();
      // /auth/me now always returns a proper user object on 200, never null
      if (!userData?.user_id) {
        // Unexpected — keep existing state rather than logging out
        setLoading(false);
        setEmployeeLoading(false);
        return;
      }

      setUser(userData);
      setLoading(false);

      // Fetch employee profile in parallel-ish (non-blocking for auth)
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
      // Network / connection error on /auth/me — do NOT log out
      // User stays logged in; next successful request will re-verify
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
