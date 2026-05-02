import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "@/contexts/AuthContext";
import { Users, Settings, BarChart2, LogOut, Menu, X } from "lucide-react";

export default function Layout() {
  const { user, setUser, myEmployee, setMyEmployee } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Lock body scroll while drawer open on mobile
  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

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

  const SidebarContent = () => (
    <>
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
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
        {/* Close button — mobile drawer only */}
        <button
          data-testid="sidebar-close-button"
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden text-[#B3B3B3] hover:text-white p-2 -mr-2 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" data-testid="sidebar-nav">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path || location.pathname.startsWith(path + "/");
          return (
            <Link key={path} to={path} data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
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
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[#B3B3B3] hover:text-white hover:bg-white/5 text-sm transition-colors duration-200">
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#191919]">
      {/* Mobile topbar — visible below lg */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#191919] border-b border-white/10 z-30 flex items-center justify-between px-4">
        <button
          data-testid="sidebar-open-button"
          onClick={() => setDrawerOpen(true)}
          className="text-white p-2 -ml-2 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <img src="/growitup-logo.png" alt="GrowItUp" className="w-7 h-7 rounded-md object-cover" />
          <span className="text-white font-semibold text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>GrowItUp</span>
        </div>
        <div className="w-10" /> {/* spacer for symmetry */}
      </header>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          data-testid="sidebar-backdrop"
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar — fixed on desktop, slide-in drawer on mobile */}
      <aside
        className={`fixed top-0 left-0 h-[100dvh] w-[85%] max-w-[280px] lg:w-64 lg:max-w-none bg-[#191919] border-r border-white/10 z-50 flex flex-col transform transition-transform duration-300 ease-out lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Sidebar"
      >
        <SidebarContent />
      </aside>

      {/* Main */}
      <main className="lg:ml-64 min-h-screen bg-[#191919] pt-14 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
