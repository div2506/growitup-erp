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

// ── LocalStorage cache helpers ────────────────────────────────────────────────
// We persist a minimal user snapshot so that on page refresh, if the backend is
// temporarily unreachable, the user stays logged in instead of being kicked out.
function readCachedUser() {
  try {
    const raw = localStorage.getItem("cached_user");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeCachedUser(u) {
  try {
    if (u) localStorage.setItem("cached_user", JSON.stringify(u));
    else localStorage.removeItem("cached_user");
  } catch {}
}
function readCachedEmployee() {
  try {
    const raw = localStorage.getItem("cached_employee");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeCachedEmployee(e) {
  try {
    if (e) localStorage.setItem("cached_employee", JSON.stringify(e));
    else localStorage.removeItem("cached_employee");
  } catch {}
}

export function AuthProvider({ children }) {
  // Initialise from cache — so ProtectedRoute never sees user=null on first render
  // while the network call is in flight (prevents flash-redirect to /login).
  const [user, setUserState] = useState(readCachedUser);
  const [myEmployee, setMyEmployeeState] = useState(readCachedEmployee);
  const [loading, setLoading] = useState(true);
  const [employeeLoading, setEmployeeLoading] = useState(true);

  // Wrap setters so the localStorage cache always stays in sync
  const setUser = useCallback((u) => {
    setUserState(u);
    writeCachedUser(u);
  }, []);

  const setMyEmployee = useCallback((e) => {
    setMyEmployeeState(e);
    writeCachedEmployee(e);
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    setEmployeeLoading(true);
    try {
      let response = await authFetch(`${API}/auth/me`);

      // On 401, wait 1.5 s and retry once before logging out.
      // This handles transient issues (cache expiry race, brief network hiccup).
      if (response.status === 401 || response.status === 403) {
        await new Promise(r => setTimeout(r, 1500));
        response = await authFetch(`${API}/auth/me`);
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Genuine auth failure after retry — clear everything and log out
          localStorage.removeItem("session_token");
          setUser(null);
          setMyEmployee(null);
        }
        // 5xx or any other non-auth error: keep the cached user alive.
        // The backend might be restarting; don't punish the user for that.
        setLoading(false);
        setEmployeeLoading(false);
        return;
      }

      const userData = await response.json();
      if (!userData?.user_id) {
        // Unexpected empty body — keep existing state rather than logging out
        setLoading(false);
        setEmployeeLoading(false);
        return;
      }

      setUser(userData);
      setLoading(false);

      // Fetch employee profile (non-blocking for auth gate)
      try {
        const empRes = await authFetch(`${API}/me/employee`);
        if (empRes.ok) {
          const empData = await empRes.json();
          if (empData?.employee_id) setMyEmployee(empData);
          // If 404 / no profile, leave whatever is cached so the sidebar still renders
        }
      } catch {
        // Network error fetching employee — keep cached employee, don't blank out
      }
    } catch {
      // ── Network / connection error on /auth/me ──────────────────────────────
      // The backend is unreachable (server restart, cold-start, brief outage).
      // DO NOT clear the user — the cached user from localStorage keeps the
      // session alive visually.  ProtectedRoute will still render the app.
      // The next API call that succeeds will re-validate everything normally.
      console.warn("[AuthContext] /auth/me unreachable — keeping cached session");
    } finally {
      setLoading(false);
      setEmployeeLoading(false);
    }
  }, [setUser, setMyEmployee]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ user, setUser, myEmployee, setMyEmployee, loading, employeeLoading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { API, authHeaders, authFetch };
