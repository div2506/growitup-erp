import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading, employeeLoading } = useAuth();
  const location = useLocation();

  // Wait until BOTH user auth AND employee profile are fully resolved.
  // This prevents race conditions where pages render before myEmployee is ready.
  if (loading || employeeLoading) {
    return (
      <div className="min-h-screen bg-[#191919] flex animate-pulse">
        {/* Sidebar skeleton */}
        <div className="w-60 shrink-0 bg-[#2F2F2F] border-r border-white/10 p-4 flex flex-col gap-3">
          <div className="h-8 w-32 bg-white/10 rounded-lg mb-4" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-9 bg-white/10 rounded-lg" />
          ))}
        </div>
        {/* Main content skeleton */}
        <div className="flex-1 p-8 space-y-4">
          <div className="h-8 w-48 bg-white/10 rounded-lg" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-white/10 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-white/10 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
