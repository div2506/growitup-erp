import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/employees", { replace: true });
    }
  }, [user, loading, navigate]);

  const handleGoogleSignIn = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#191919] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(https://static.prod-images.emergentagent.com/jobs/f01237da-b074-442a-8928-2bb02a0d751a/images/f378a40bdc55e806f7963cfbdbd9c7ac47666d31ea25afa55d2566b963c8abc3.png)`,
        }}
      />
      <div className="absolute inset-0 bg-black/70" />

      {/* Login Card */}
      <div
        className="relative z-10 w-full max-w-md mx-4 p-10 rounded-2xl border border-white/10 backdrop-blur-xl"
        style={{ background: "rgba(47,47,47,0.85)" }}
        data-testid="login-card"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="https://customer-assets.emergentagent.com/job_team-roster-95/artifacts/0sko7shb_Growitup.png1"
            alt="GrowItUp"
            className="w-16 h-16 rounded-2xl mb-4 object-cover"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = "https://static.prod-images.emergentagent.com/jobs/f01237da-b074-442a-8928-2bb02a0d751a/images/5b076fe5b949f10d2a338de5b0450680980d8bd1096ce704d123da4c41f306eb.png";
            }}
          />
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            GrowItUp
          </h1>
          <p className="text-[#B3B3B3] text-sm mt-1">Employee Management System</p>
        </div>

        <div className="border-t border-white/10 mb-8" />

        <div className="text-center mb-6">
          <p className="text-[#B3B3B3] text-sm">Sign in with your company Google account</p>
        </div>

        <button
          data-testid="google-signin-button"
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white text-gray-800 rounded-lg font-medium hover:bg-gray-100 transition-colors duration-200 shadow-lg"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-center text-xs text-[#B3B3B3] mt-6">
          Access restricted to authorized employees only
        </p>
      </div>
    </div>
  );
}
