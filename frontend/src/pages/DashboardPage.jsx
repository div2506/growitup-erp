import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Palmtree, Home as HomeIcon, Clock, Cake, PartyPopper, Sparkles } from "lucide-react";

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
      className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 md:p-5 flex flex-col min-h-[320px]"
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
      <div className="flex-1 overflow-y-auto max-h-[280px] pr-1 -mr-1 space-y-2">
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

function EmployeeRow({ emp, onClick, right }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
    >
      <Avatar src={emp.profile_picture} first={emp.first_name} last={emp.last_name} size={36} />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">
          {emp.first_name} {emp.last_name}
        </p>
        <p className="text-[#B3B3B3] text-xs truncate">{emp.job_position_name || emp.department_name || "—"}</p>
      </div>
      {right}
    </button>
  );
}

function BirthdayCard({ emp, onClick }) {
  const subtitle = emp.age ? `Turns ${emp.age} today` : emp.job_position_name || "";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="dashboard-birthday-card"
      className="group relative shrink-0 w-[180px] md:w-[200px] bg-gradient-to-br from-fuchsia-500/10 via-purple-500/10 to-amber-400/10 border border-fuchsia-400/20 hover:border-fuchsia-400/40 rounded-xl p-4 flex flex-col items-center text-center transition-all hover:-translate-y-0.5"
    >
      <div className="absolute top-2 right-2 text-base opacity-70 group-hover:opacity-100 transition-opacity">
        <PartyPopper size={14} className="text-fuchsia-300" />
      </div>
      <div className="relative mb-2">
        <div className="absolute inset-0 bg-fuchsia-400/30 blur-xl rounded-full" />
        <Avatar src={emp.profile_picture} first={emp.first_name} last={emp.last_name} size={72} />
      </div>
      <p className="text-white font-semibold text-sm leading-tight">
        {emp.first_name} {emp.last_name}
      </p>
      <p className="text-[#D9D9D9] text-xs mt-0.5 truncate max-w-full">{emp.job_position_name || "—"}</p>
      <p className="text-fuchsia-300 text-xs mt-1.5 font-medium flex items-center gap-1">
        <Cake size={12} /> {subtitle}
      </p>
    </button>
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

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: payload } = await axios.get(`${API}/dashboard/today`, { withCredentials: true });
      setData(payload);
    } catch {
      setData({ on_leave: [], wfh: [], late: [], birthdays: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 5 minutes
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const gotoEmployee = (empId) => {
    navigate(`/employees?focus=${empId}`);
  };

  const formatLeaveType = (row) => {
    if (row.leave_type === "Half Day" && row.half_day_type) {
      return `Half Day · ${row.half_day_type}`;
    }
    return row.leave_type || "Full Day";
  };

  const today = new Date();

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="mb-5 md:mb-6 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Dashboard
          </h1>
          <span className="text-[#B3B3B3] text-sm">{formatHumanDate(today)}</span>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  const { on_leave = [], wfh = [], late = [], birthdays = [] } = data || {};

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

      {/* Top row — 3 attendance cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-5 md:mb-6">
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
            <EmployeeRow
              key={emp.employee_id}
              emp={emp}
              onClick={() => gotoEmployee(emp.employee_id)}
              right={
                <span className="text-[10px] font-medium text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {formatLeaveType(emp)}
                </span>
              }
            />
          ))}
        </SectionCard>

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
            <EmployeeRow
              key={emp.employee_id}
              emp={emp}
              onClick={() => gotoEmployee(emp.employee_id)}
              right={
                <span className="text-[10px] font-medium text-purple-400 bg-purple-400/10 border border-purple-400/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                  WFH
                </span>
              }
            />
          ))}
        </SectionCard>

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
            <EmployeeRow
              key={emp.employee_id}
              emp={emp}
              onClick={() => gotoEmployee(emp.employee_id)}
              right={
                <div className="flex flex-col items-end gap-0.5 whitespace-nowrap">
                  <span className="text-[11px] text-white font-medium tabular-nums">{emp.check_in || "—"}</span>
                  <span className="text-[10px] font-medium text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full">
                    Late by {emp.late_minutes}m
                  </span>
                </div>
              }
            />
          ))}
        </SectionCard>
      </div>

      {/* Birthday section — full width, celebratory */}
      <div
        data-testid="dashboard-birthdays-section"
        className="relative overflow-hidden rounded-2xl border border-fuchsia-400/20 p-5 md:p-7 bg-gradient-to-br from-[#2A1538] via-[#1F1A2E] to-[#2A1F0F]"
      >
        {/* Decorative orbs */}
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-fuchsia-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-8 w-48 h-48 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
        <div className="absolute top-4 right-6 opacity-40 pointer-events-none">
          <Sparkles size={18} className="text-fuchsia-300" />
        </div>

        <div className="relative flex flex-col items-center mb-4 md:mb-5">
          <div className="flex items-center gap-2">
            <Cake size={22} className="text-fuchsia-300" />
            <h2 className="text-lg md:text-xl font-bold text-white tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
              Birthdays Today
            </h2>
            {birthdays.length > 0 && (
              <span className="text-[11px] font-semibold bg-white/10 text-white px-2 py-0.5 rounded-full border border-white/10 tabular-nums">
                {birthdays.length}
              </span>
            )}
          </div>
          {birthdays.length > 0 && (
            <p className="text-[#D9D9D9] text-xs mt-1">Send some love to the team 🎉</p>
          )}
        </div>

        {birthdays.length === 0 ? (
          <div className="relative flex flex-col items-center py-6 text-center">
            <div className="text-4xl mb-2 opacity-80">🎉</div>
            <p className="text-white/90 text-sm font-medium">No birthdays today</p>
            <p className="text-[#B3B3B3] text-xs mt-1">We&apos;ll celebrate again soon!</p>
          </div>
        ) : (
          <div className="relative flex gap-3 md:gap-4 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            {birthdays.map(emp => (
              <BirthdayCard
                key={emp.employee_id}
                emp={emp}
                onClick={() => gotoEmployee(emp.employee_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
