import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { API } from "@/contexts/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
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
        // Clear hash from URL and navigate to app
        window.history.replaceState(null, "", window.location.pathname);
        navigate("/employees", { replace: true, state: { user: data.user } });
      } catch (err) {
        navigate("/login?error=Authentication+failed", { replace: true });
      }
    };

    exchangeSession();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen bg-[#191919] flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      <p className="text-[#B3B3B3] text-sm">Signing you in...</p>
    </div>
  );
}
