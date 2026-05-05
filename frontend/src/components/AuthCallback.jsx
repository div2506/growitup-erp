import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { API } from "@/contexts/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser, setMyEmployee } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Use useRef to prevent double-execution under StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace("#", "?"));
    const sessionId = params.get("session_id");

    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }

    const exchangeSession = async () => {
      try {
        const response = await fetch(`${API}/auth/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ session_id: sessionId }),
        });

        if (!response.ok) {
          const err = await response.json();
          const msg = err.detail || "Authentication failed";
          navigate("/login?error=" + encodeURIComponent(msg), { replace: true });
          return;
        }

        const data = await response.json();
        setUser(data.user);
        // Load employee profile so sidebar/performance show correct data immediately
        try {
          const empRes = await fetch(`${API}/me/employee`, { credentials: "include" });
          if (empRes.ok) {
            const empData = await empRes.json();
            if (empData?.employee_id) setMyEmployee(empData);
          }
        } catch {}
        // Clear hash from URL and navigate to app
        window.history.replaceState(null, "", window.location.pathname);
        navigate("/employees", { replace: true, state: { user: data.user } });
      } catch (err) {
        navigate("/login?error=Authentication+failed", { replace: true });
      }
    };

    exchangeSession();
  }, [navigate, setUser, setMyEmployee]);

  return (
    <div className="min-h-screen bg-[#191919] flex flex-col items-center justify-center gap-6 animate-pulse">
      <div className="w-16 h-16 rounded-full bg-white/10" />
      <div className="space-y-2 text-center">
        <div className="h-4 w-40 bg-white/10 rounded mx-auto" />
        <div className="h-3 w-24 bg-white/5 rounded mx-auto" />
      </div>
    </div>
  );
}
