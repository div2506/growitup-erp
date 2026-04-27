import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "@/contexts/AuthContext";
import { Users, Settings, BarChart2, LogOut } from "lucide-react";

export default function Layout() {
  const { user, setUser, myEmployee, setMyEmployee } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("session_token");
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
    } catch {}
    localStorage.removeItem("session_token");
    setUser(null);
    setMyEmployee(null);
    navigate("/login", { replace: true });
  };

  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";

  const navItems = [
    { path: "/employees", label: "Employees", icon: Users },
    { path: "/performance", label: "Performance", icon: BarChart2 },
    ...(isAdminDept ? [{ path: "/settings", label: "Settings", icon: Settings }] : []),
  ];

  const displayName = myEmployee
    ? `${myEmployee.first_name} ${myEmployee.last_name}`
    : user?.name || "User";
  const displayEmail = myEmployee?.work_email || user?.email || "";
  const displayPicture = myEmployee?.profile_picture || null;

  return (
    <div className="flex min-h-screen bg-[#191919]">
      <aside className="w-64 fixed top-0 left-0 h-screen bg-[#191919] border-r border-white/10 z-40 flex flex-col">
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src="/growitup-logo.png"
              alt="GrowItUp"
              className="w-9 h-9 rounded-lg object-cover"
            />
            <div>
              <p className="text-white font-semibold text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>GrowItUp</p>
              <p className="text-[#B3B3B3] text-xs">Management</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" data-testid="sidebar-nav">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path || location.pathname.startsWith(path + "/");
            return (
              <Link key={path} to={path} data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:bg-white/5 hover:text-white"
                }`}>
                <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg mb-2">
            {displayPicture ? (
              <img src={displayPicture} alt={displayName} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold">
                {displayName?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{displayName}</p>
              <p className="text-[#B3B3B3] text-xs truncate">{displayEmail}</p>
            </div>
          </div>
          <button data-testid="logout-button" onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#B3B3B3] hover:text-white hover:bg-white/5 text-sm transition-colors">
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="ml-64 flex-1 min-h-screen bg-[#191919]">
        <Outlet />
      </main>
    </div>
  );
}
