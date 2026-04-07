import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [myEmployee, setMyEmployee] = useState(null);
  const [loading, setLoading] = useState(true);       // auth check in progress
  const [employeeLoading, setEmployeeLoading] = useState(true); // employee fetch in progress

  const checkAuth = useCallback(async () => {
    setLoading(true);
    setEmployeeLoading(true);
    try {
      const response = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (!response.ok) {
        setUser(null);
        setMyEmployee(null);
        setLoading(false);
        setEmployeeLoading(false);
        return;
      }
      const userData = await response.json();
      // Backend returns null when not authenticated (200 with null body)
      if (!userData || !userData.user_id) {
        setUser(null);
        setMyEmployee(null);
        setLoading(false);
        setEmployeeLoading(false);
        return;
      }
      setUser(userData);
      setLoading(false); // user is ready — but employee still loading
      // Load employee profile right after auth
      try {
        const empRes = await fetch(`${API}/me/employee`, { credentials: "include" });
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
      setUser(null);
      setMyEmployee(null);
      setLoading(false);
    } finally {
      setEmployeeLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ user, setUser, myEmployee, setMyEmployee, loading, employeeLoading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { API };
