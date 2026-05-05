import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Palmtree, Home as HomeIcon, Clock, Cake, PartyPopper, Sparkles, Star, FileText, Hourglass, CheckCircle, XCircle, Ban } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatHumanDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function Avatar({ src, first, last, size = 40 }) {
  const initials = `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase() || "?";
  if (src) {
    return (
      <img
        src={src}
        alt={`${first || ""} ${last || ""}`.trim()}
        className="rounded-full object-cover border border-white/10 shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-white/10 flex items-center justify-center text-white font-bold shrink-0 border border-white/10"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.3)) }}
    >
      {initials}
    </div>
  );
}

function SectionCard({ icon: Icon, iconColor, title, count, emptyText, emptyIcon, children, testId }) {
  return (
    <div
      data-testid={testId}
      className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 md:p-5 flex flex-col"
    >
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${iconColor}`}>
            <Icon size={16} className="text-white" />
          </div>
          <h3 className="text-white font-semibold text-sm md:text-base">{title}</h3>
        </div>
        {count > 0 && (
          <span className="text-[11px] font-semibold bg-white/10 text-white px-2 py-0.5 rounded-full border border-white/10 tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="overflow-y-auto pr-1 -mr-1" style={{ maxHeight: "calc(7 * 44px)", scrollbarWidth: "none" }}>
        {count === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center py-6 opacity-70">
            {emptyIcon}
            <p className="text-[#B3B3B3] text-xs mt-2">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function EmployeeRow({ emp, right }) {
  return (
    <div
      className="w-full flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 text-left px-1"
    >
      <Avatar src={emp.profile_picture} first={emp.first_name} last={emp.last_name} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-medium truncate">
          {emp.first_name} {emp.last_name}
        </p>
        <p className="text-[#B3B3B3] text-[10px] truncate">{emp.job_position_name || emp.department_name || "—"}</p>
      </div>
      {right}
    </div>
  );
}

function CelebrationCard({ emp }) {
  const isBirthday   = emp.type === "birthday" || emp.type === "both";
  const isAnniversary = emp.type === "anniversary" || emp.type === "both";

  const gradientCls = isAnniversary && !isBirthday
    ? "from-amber-500/10 via-yellow-500/10 to-orange-400/10 border-amber-400/20 hover:border-amber-400/40"
    : "from-fuchsia-500/10 via-purple-500/10 to-amber-400/10 border-fuchsia-400/20 hover:border-fuchsia-400/40";

  const glowCls = isAnniversary && !isBirthday ? "bg-amber-400/30" : "bg-fuchsia-400/30";

  return (
    <div
      data-testid="dashboard-birthday-card"
      className={`group relative w-full bg-gradient-to-br ${gradientCls} border rounded-xl p-4 flex flex-col items-center text-center`}
    >
      <div className="absolute top-2 left-2">
        {isBirthday && !isAnniversary && (
          <span className="text-[9px] font-semibold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/30 px-1.5 py-0.5 rounded-full">Birthday</span>
        )}
        {isAnniversary && !isBirthday && (
          <span className="text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded-full">Anniversary</span>
        )}
        {isBirthday && isAnniversary && (
          <span className="text-[9px] font-semibold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/30 px-1.5 py-0.5 rounded-full">Birthday & Anniversary</span>
        )}
      </div>
      <div className="absolute top-2 right-2 opacity-70 group-hover:opacity-100 transition-opacity">
        {isBirthday ? <PartyPopper size={14} className="text-fuchsia-300" /> : <Star size={14} className="text-amber-300" />}
      </div>

      <div className="relative mb-2">
        <div className={`absolute inset-0 ${glowCls} blur-xl rounded-full`} />
        <Avatar src={emp.profile_picture} first={emp.first_name} last={emp.last_name} size={72} />
      </div>

      <p className="text-white font-semibold text-sm leading-tight">
        {emp.first_name} {emp.last_name}
      </p>
      <p className="text-[#D9D9D9] text-xs mt-0.5 truncate max-w-full">{emp.job_position_name || "—"}</p>

      <div className="mt-1.5 flex flex-col gap-0.5 items-center">
        {isBirthday && (
          <p className="text-fuchsia-300 text-xs font-medium flex items-center gap-1">
            <Cake size={11} />
            {emp.age ? `Turns ${emp.age} today` : "Birthday today 🎂"}
          </p>
        )}
        {isAnniversary && (
          <p className="text-amber-300 text-xs font-medium flex items-center gap-1">
            <Star size={11} />
            {emp.years === 1 ? "1 year at GrowItUp 🌟" : `${emp.years} years at GrowItUp 🌟`}
          </p>
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 md:space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-[#2F2F2F] rounded-xl border border-white/10 p-5 animate-pulse">
            <div className="h-4 w-24 bg-white/10 rounded mb-4" />
            {[0, 1, 2].map(j => (
              <div key={j} className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-white/10" />
                <div className="flex-1">
                  <div className="h-3 w-24 bg-white/10 rounded mb-1.5" />
                  <div className="h-2.5 w-16 bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-6 h-48 animate-pulse" />
    </div>
  );
}

const STATUS_CONFIG = {
  Pending:   { cls: "bg-amber-400/10 text-amber-400 border-amber-400/20",   icon: Hourglass },
  Approved:  { cls: "bg-green-400/10 text-green-400 border-green-400/20",   icon: CheckCircle },
  Rejected:  { cls: "bg-red-400/10 text-red-400 border-red-400/20",         icon: XCircle },
  Cancelled: { cls: "bg-white/5 text-[#B3B3B3] border-white/10",            icon: Ban },
};

function MiniStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.cls}`}>
      <Icon size={9} /> {status}
    </span>
  );
}

function RequestRow({ req, isAdmin, navigate }) {
  const typeLabel = req.type === "leave" ? "Leave" : req.type === "wfh" ? "WFH" : "Overtime";
  const typeColor = req.type === "leave" ? "text-blue-400 bg-blue-400/10 border-blue-400/20"
    : req.type === "wfh" ? "text-purple-400 bg-purple-400/10 border-purple-400/20"
    : "text-orange-400 bg-orange-400/10 border-orange-400/20";
  const dateStr = req.from_date === req.to_date
    ? req.from_date : `${req.from_date} – ${req.to_date}`;

  const destination = req.type === "leave"
    ? (isAdmin ? "/leave-requests" : "/leave")
    : req.type === "wfh"
    ? "/wfh"
    : "/overtime";

  return (
    <button
      type="button"
      onClick={() => navigate(destination)}
      className="w-full flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors px-1 rounded text-left"
    >
      {isAdmin && (
        <Avatar src={req.profile_picture} first={req.employee_name?.split(" ")[0]} last={req.employee_name?.split(" ")[1]} size={32} />
      )}
      <div className="flex-1 min-w-0">
        {isAdmin && <p className="text-white text-xs font-medium truncate">{req.employee_name}</p>}
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span className={`text-[10px] border px-1.5 py-0.5 rounded-full font-medium ${typeColor}`}>{typeLabel}</span>
          <span className="text-[#B3B3B3] text-[10px]">{dateStr}</span>
        </div>
      </div>
      <MiniStatusBadge status={req.status} />
    </button>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [myReqData, setMyReqData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [todayRes, myReqRes] = await Promise.all([
        axios.get(`${API}/dashboard/today`, { withCredentials: true }),
        axios.get(`${API}/dashboard/my-requests`, { withCredentials: true }),
      ]);
      setData(todayRes.data);
      setMyReqData(myReqRes.data);
    } catch {
      setData({ on_leave: [], wfh: [], late: [], birthdays: [] });
      setMyReqData({ is_admin: false, requests: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const gotoEmployee = (empId) => navigate(`/employees?focus=${empId}`);

  const formatLeaveType = (row) => {
    if (row.leave_type === "Half Day" && row.half_day_type) return `Half Day · ${row.half_day_type}`;
    return row.leave_type || "Full Day";
  };

  const today = new Date();

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="mb-5 md:mb-6 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Dashboard</h1>
          <span className="text-[#B3B3B3] text-sm">{formatHumanDate(today)}</span>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  const { on_leave = [], wfh = [], late = [], birthdays = [] } = data || {};
  const { is_admin = false, requests: myRequests = [] } = myReqData || {};

  return (
    <div className="p-4 md:p-8" data-testid="dashboard-page">
      {/* Header */}
      <div className="mb-5 md:mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Dashboard
          </h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">What&apos;s happening today across the team</p>
        </div>
        <span data-testid="dashboard-date" className="text-[#B3B3B3] text-sm self-end md:self-auto">
          {formatHumanDate(today)}
        </span>
      </div>

      {/* Main grid: 3 cols, 2 rows — col 3 spans both rows */}
      <div className="grid grid-cols-1 gap-4 md:gap-5" style={{ gridTemplateColumns: "2fr 2fr 1fr" }}>

        {/* Row 1 Col 1 — On Leave Today */}
        <SectionCard
          testId="dashboard-leave-card"
          icon={Palmtree}
          iconColor="bg-blue-500/20 border border-blue-500/30"
          title="On Leave Today"
          count={on_leave.length}
          emptyText="No one on leave today"
          emptyIcon={<Palmtree size={28} className="text-[#B3B3B3]" />}
        >
          {on_leave.map(emp => (
            <EmployeeRow key={emp.employee_id} emp={emp}
              right={
                <span className="text-[10px] font-medium text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {formatLeaveType(emp)}
                </span>
              }
            />
          ))}
        </SectionCard>

        {/* Row 1 Col 2 — Work From Home */}
        <SectionCard
          testId="dashboard-wfh-card"
          icon={HomeIcon}
          iconColor="bg-purple-500/20 border border-purple-500/30"
          title="Work From Home"
          count={wfh.length}
          emptyText="No one working from home today"
          emptyIcon={<HomeIcon size={28} className="text-[#B3B3B3]" />}
        >
          {wfh.map(emp => (
            <EmployeeRow key={emp.employee_id} emp={emp}
              right={
                <span className="text-[10px] font-medium text-purple-400 bg-purple-400/10 border border-purple-400/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                  WFH
                </span>
              }
            />
          ))}
        </SectionCard>

        {/* Col 3 — Birthdays & Anniversaries spanning BOTH rows */}
        {(() => {
          const hasBirthdays    = birthdays.some(e => e.type === "birthday" || e.type === "both");
          const hasAnniversaries = birthdays.some(e => e.type === "anniversary" || e.type === "both");

          return (
            <div
              data-testid="dashboard-birthdays-section"
              className="md:row-span-2 relative overflow-hidden rounded-2xl border border-fuchsia-400/20 p-5 bg-gradient-to-br from-[#2A1538] via-[#1F1A2E] to-[#2A1F0F] flex flex-col"
            >
              <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-fuchsia-500/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -right-8 w-48 h-48 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
              <div className="absolute top-4 right-4 opacity-40 pointer-events-none">
                <Sparkles size={16} className="text-fuchsia-300" />
              </div>

              <div className="relative mb-4 shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="p-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 flex items-center gap-1">
                      {hasBirthdays && <Cake size={13} className="text-fuchsia-300" />}
                      {hasAnniversaries && <Star size={12} className="text-amber-300" />}
                    </div>
                    <h2 className="text-sm font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                      Announcements
                    </h2>
                  </div>
                  {birthdays.length > 0 && (
                    <span className="text-[10px] font-semibold bg-white/10 text-white px-2 py-0.5 rounded-full border border-white/10 tabular-nums">
                      {birthdays.length}
                    </span>
                  )}
                </div>
                <p className="text-[#B3B3B3] text-[10px]">Birthdays & Work Anniversaries</p>
              </div>

              {birthdays.length === 0 ? (
                <div className="relative flex-1 flex flex-col items-center justify-center text-center py-6">
                  <div className="text-4xl mb-2 opacity-40">🎂</div>
                  <p className="text-[#B3B3B3] text-sm">No announcements today</p>
                </div>
              ) : (
                <div className="relative flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "calc(3 * 220px)", scrollbarWidth: "none" }}>
                  {birthdays.map(emp => (
                    <CelebrationCard
                      key={`${emp.employee_id}-${emp.type}`}
                      emp={emp}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Row 2 Col 1 — Late Today */}
        <SectionCard
          testId="dashboard-late-card"
          icon={Clock}
          iconColor="bg-amber-500/20 border border-amber-500/30"
          title="Late Today"
          count={late.length}
          emptyText="No late arrivals today"
          emptyIcon={<Clock size={28} className="text-[#B3B3B3]" />}
        >
          {late.map(emp => (
            <EmployeeRow key={emp.employee_id} emp={emp}
              right={
                <div className="flex flex-col items-end gap-0.5 whitespace-nowrap">
                  <span className="text-[11px] text-white font-medium tabular-nums">{emp.check_in || "—"}</span>
                  <span className="text-[10px] font-medium text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">
                    +{emp.late_minutes}m
                  </span>
                </div>
              }
            />
          ))}
        </SectionCard>

        {/* Row 2 Col 2 — My Requests / Pending Approvals */}
        <div className="bg-[#2F2F2F] rounded-2xl border border-white/10 p-4 flex flex-col min-h-[220px]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
              <FileText size={14} className="text-green-400" />
            </div>
            <span className="text-white font-semibold text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>
              {is_admin ? "Pending Approvals" : "My Requests"}
            </span>
            {myRequests.length > 0 && (
              <span className="ml-auto text-[10px] font-semibold bg-white/10 text-white px-2 py-0.5 rounded-full border border-white/10">
                {myRequests.length}
              </span>
            )}
          </div>

          {myRequests.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
              <FileText size={24} className="text-[#B3B3B3] mb-2 opacity-50" />
              <p className="text-[#B3B3B3] text-sm">
                {is_admin ? "No pending requests" : "No recent requests"}
              </p>
              {!is_admin && <p className="text-[#555] text-xs mt-0.5">Last 7 days</p>}
            </div>
          ) : (
            <div className="overflow-y-auto pr-1 -mr-1" style={{ maxHeight: "calc(7 * 44px)", scrollbarWidth: "none" }}>
              {myRequests.map((req, i) => (
                <RequestRow key={req.request_id || i} req={req} isAdmin={is_admin} navigate={navigate} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
