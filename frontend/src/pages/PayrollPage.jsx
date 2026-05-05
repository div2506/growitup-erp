import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Printer, Download, ChevronLeft, Search, IndianRupee,
  TrendingUp, TrendingDown, Users, Wallet, Eye, X
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function prevMonthStr() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function fmtMonthLabel(monthStr) {
  if (!monthStr) return "";
  const d = new Date((monthStr.length === 7 ? monthStr + "-02" : monthStr));
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function fmt(n, digits = 2) {
  if (n == null || isNaN(n)) return "₹0.00";
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function Avatar({ emp, size = 36 }) {
  if (emp?.profile_picture)
    return <img src={emp.profile_picture} alt={emp.first_name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  const initials = `${emp?.first_name?.[0] || ""}${emp?.last_name?.[0] || ""}`.toUpperCase() || "?";
  return (
    <div className="rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ width: size, height: size }}>
      {initials}
    </div>
  );
}

// ─────────────────────────────────────────────
// Payslip Component (used in modal + print)
// ─────────────────────────────────────────────
function PayslipContent({ data }) {
  if (!data) return null;
  const { employee: emp, earnings: E, deductions: D, net_salary, attendance_summary: A, month, days_in_month } = data;
  const monthLabel = fmtMonthLabel(month);

  return (
    <div className="payslip-body font-mono text-sm" style={{ fontFamily: "monospace" }}>
      {/* Header */}
      <div className="border-b border-white/20 pb-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white text-lg font-bold" style={{ fontFamily: "Manrope, sans-serif" }}>PAYSLIP</p>
            <p className="text-[#B3B3B3] text-sm">{monthLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-white font-bold">{emp?.first_name} {emp?.last_name}</p>
            <p className="text-[#B3B3B3] text-xs">{emp?.employee_id}</p>
          </div>
        </div>
        <div className="mt-2">
          <p className="text-[#B3B3B3] text-xs">{emp?.job_position_name} · {emp?.department_name}</p>
          <p className="text-[#666] text-xs">{days_in_month} days in month</p>
        </div>
      </div>

      {/* Earnings */}
      <div className="mb-4">
        <p className="text-[#B3B3B3] text-xs font-semibold uppercase tracking-wider mb-2">Earnings</p>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-white">Basic Salary</span>
            <span className="text-white font-medium">{fmt(E.basic_salary)}</span>
          </div>
          {E.overtime_pay > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#B3B3B3]">Overtime ({E.overtime_hours}h, {E.overtime_count} session{E.overtime_count !== 1 ? "s" : ""})</span>
              <span className="text-green-400">+{fmt(E.overtime_pay)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between mt-2 pt-2 border-t border-white/10 text-sm font-bold">
          <span className="text-white">Gross Earnings</span>
          <span className="text-green-400">{fmt(E.gross_earnings)}</span>
        </div>
      </div>

      {/* Deductions */}
      {D.total_deductions > 0 && (
        <div className="mb-4">
          <p className="text-[#B3B3B3] text-xs font-semibold uppercase tracking-wider mb-2">Deductions</p>
          <div className="space-y-1.5">
            {D.regular_leave.days > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#B3B3B3]">Regular Leave ({D.regular_leave.days} day{D.regular_leave.days !== 1 ? "s" : ""})</span>
                <span className="text-red-400">-{fmt(D.regular_leave.amount)}</span>
              </div>
            )}
            {D.paid_leave.days > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#B3B3B3]">Paid Leave ({D.paid_leave.days} day{D.paid_leave.days !== 1 ? "s" : ""}) <span className="text-green-400 text-xs">(no deduction)</span></span>
                <span className="text-[#B3B3B3]">-{fmt(0)}</span>
              </div>
            )}
            {D.absences.count > 0 && (
              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#B3B3B3]">Unapproved Absence{D.absences.count !== 1 ? "s" : ""}</span>
                  <span className="text-red-400">-{fmt(D.absences.amount)}</span>
                </div>
                {D.absences.details.map((ab, i) => (
                  <div key={i} className="flex justify-between text-xs pl-3 text-[#666] mt-0.5">
                    <span>• {new Date(ab.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} (salary {fmt(ab.day_salary)} + penalty {fmt(ab.penalty)})</span>
                  </div>
                ))}
              </div>
            )}
            {D.late_penalties.penalties.length > 0 && (
              <div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#B3B3B3]">Late Penalties ({D.late_penalties.late_count} late arrival{D.late_penalties.late_count !== 1 ? "s" : ""})</span>
                  <span className="text-red-400">-{fmt(D.late_penalties.amount)}</span>
                </div>
                {D.late_penalties.penalties.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs pl-3 text-[#666] mt-0.5">
                    <span>• {new Date(p.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — {p.type} ({p.description})</span>
                    <span className="text-red-400/70">-{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {D.half_days.count > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#B3B3B3]">Half Days ({D.half_days.count} day{D.half_days.count !== 1 ? "s" : ""})</span>
                <span className="text-red-400">-{fmt(D.half_days.amount)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-white/10 text-sm font-bold">
            <span className="text-white">Total Deductions</span>
            <span className="text-red-400">-{fmt(D.total_deductions)}</span>
          </div>
        </div>
      )}

      {/* Net Salary */}
      <div className="flex justify-between py-3 px-4 bg-white/5 rounded-lg border border-white/10 text-sm font-bold">
        <span className="text-white">Net Salary</span>
        <span className="text-white text-lg">{fmt(net_salary)}</span>
      </div>

      {/* Attendance Summary */}
      {A && (
        <div className="mt-4">
          <p className="text-[#B3B3B3] text-xs font-semibold uppercase tracking-wider mb-2">Attendance Summary</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {[
              { label: "Present", val: A.present, color: "text-green-400" },
              { label: "Half Day", val: A.half_day, color: "text-yellow-400" },
              { label: "Absent", val: A.absent, color: "text-red-400" },
              { label: "Leave", val: A.leave, color: "text-blue-400" },
              { label: "WFH", val: A.wfh, color: "text-purple-400" },
              { label: "Holiday", val: A.holiday, color: "text-orange-400" },
              { label: "Late", val: A.late_count, color: "text-amber-400" },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-[#191919] rounded-lg border border-white/10 px-3 py-2 text-center">
                <p className={`text-lg font-bold ${color}`}>{val}</p>
                <p className="text-[#666] text-xs">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Payslip Modal
// ─────────────────────────────────────────────
function PayslipModal({ employeeId, month, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef();

  useEffect(() => {
    if (!employeeId || !month) return;
    setLoading(true);
    axios.get(`${API}/payroll/calculate`, {
      params: { employee_id: employeeId, month },
      withCredentials: true
    }).then(r => setData(r.data))
      .catch(() => toast.error("Failed to load payslip"))
      .finally(() => setLoading(false));
  }, [employeeId, month]);

  const handlePrint = () => {
    const printContents = printRef.current?.innerHTML;
    const win = window.open("", "_blank", "width=800,height=900");
    win.document.write(`
      <html><head><title>Payslip</title>
      <style>
        body { background: #1a1a1a; color: #fff; font-family: monospace; padding: 32px; font-size: 13px; }
        .border-b { border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom:16px; margin-bottom:16px; }
        .border-t { border-top: 1px solid rgba(255,255,255,0.1); margin-top:8px; padding-top:8px; }
        .text-green-400 { color: #4ade80; }
        .text-red-400 { color: #f87171; }
        .text-yellow-400 { color: #facc15; }
        .text-blue-400 { color: #60a5fa; }
        .text-purple-400 { color: #c084fc; }
        .text-orange-400 { color: #fb923c; }
        .text-amber-400 { color: #fbbf24; }
        @media print { body { background: white; color: black; } }
      </style></head>
      <body>${printContents}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-2xl w-[calc(100%-2rem)] rounded-xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Payslip — {fmtMonthLabel(month)}</h2>
          <div className="flex items-center gap-2">
            {data && (
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors">
                <Printer size={13} /> Print
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-[#B3B3B3]">
              <X size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4 py-4">
            <div className="flex justify-between items-center">
              <div className="h-5 bg-white/10 rounded w-1/3" />
              <div className="h-5 bg-white/10 rounded w-1/4" />
            </div>
            <div className="h-px bg-white/10" />
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-3.5 bg-white/10 rounded w-1/3" />
                <div className="h-3.5 bg-white/10 rounded w-1/5" />
              </div>
            ))}
            <div className="h-px bg-white/10" />
            <div className="flex justify-between">
              <div className="h-4 bg-white/10 rounded w-1/4" />
              <div className="h-4 bg-white/10 rounded w-1/6" />
            </div>
          </div>
        ) : data ? (
          <div ref={printRef}>
            <PayslipContent data={data} />
          </div>
        ) : (
          <p className="text-[#B3B3B3] text-sm text-center py-8">Failed to load payslip</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Admin Summary Table
// ─────────────────────────────────────────────
function AdminPayrollView({ month }) {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [viewPayslip, setViewPayslip] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/payroll/summary`, {
        params: { month, department: deptFilter || undefined },
        withCredentials: true
      });
      setSummary(data);
    } catch { toast.error("Failed to load payroll summary"); }
    finally { setLoading(false); }
  }, [month, deptFilter]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const filtered = summary.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${s.employee?.first_name || ""} ${s.employee?.last_name || ""}`.toLowerCase();
    return name.includes(q) || s.employee_id?.toLowerCase().includes(q);
  });

  const totalPayroll = filtered.reduce((s, r) => s + (r.net_salary || 0), 0);
  const avgSalary = filtered.length ? totalPayroll / filtered.length : 0;

  // Unique departments
  const depts = [...new Set(summary.map(s => s.employee?.department_name).filter(Boolean))].sort();

  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <p className="text-[#B3B3B3] text-xs mb-1">Total Payroll</p>
          <p className="text-2xl font-bold text-white">{fmt(totalPayroll)}</p>
          <p className="text-[#666] text-xs mt-1">Net salaries</p>
        </div>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <p className="text-[#B3B3B3] text-xs mb-1">Total Employees</p>
          <p className="text-2xl font-bold text-white">{filtered.length}</p>
          <p className="text-[#666] text-xs mt-1">Active this month</p>
        </div>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <p className="text-[#B3B3B3] text-xs mb-1">Average Salary</p>
          <p className="text-2xl font-bold text-white">{fmt(avgSalary)}</p>
          <p className="text-[#666] text-xs mt-1">Per employee</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B3B3B3]" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or ID..."
            className="bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] pl-9 text-sm h-9 focus-visible:ring-white/20" />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="bg-[#191919] border border-white/10 text-[#B3B3B3] text-sm rounded-lg px-3 py-2 h-9 focus:outline-none">
          <option value="">All Departments</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="animate-pulse">
            <table className="w-full">
              <tbody>
                {[...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="px-4 py-3"><div className="h-3.5 bg-white/10 rounded w-3/4" /></td>
                    <td className="px-4 py-3"><div className="h-3.5 bg-white/10 rounded w-1/2" /></td>
                    <td className="px-4 py-3"><div className="h-3.5 bg-white/10 rounded w-1/2" /></td>
                    <td className="px-4 py-3"><div className="h-3.5 bg-white/10 rounded w-1/3" /></td>
                    <td className="px-4 py-3"><div className="h-3.5 bg-white/10 rounded w-1/3" /></td>
                    <td className="px-4 py-3"><div className="h-6 bg-white/10 rounded-full w-16" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Wallet size={40} className="text-white/20 mx-auto mb-3" />
            <p className="text-[#B3B3B3] text-sm">No employees found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-[#B3B3B3] text-xs font-medium">Employee</th>
                  <th className="text-left px-4 py-3 text-[#B3B3B3] text-xs font-medium">Department</th>
                  <th className="text-right px-4 py-3 text-[#B3B3B3] text-xs font-medium">Basic</th>
                  <th className="text-right px-4 py-3 text-[#B3B3B3] text-xs font-medium">Gross</th>
                  <th className="text-right px-4 py-3 text-[#B3B3B3] text-xs font-medium">Deductions</th>
                  <th className="text-right px-4 py-3 text-[#B3B3B3] text-xs font-medium">Net Salary</th>
                  <th className="text-right px-4 py-3 text-[#B3B3B3] text-xs font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.employee_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar emp={s.employee} size={30} />
                        <div>
                          <p className="text-white text-sm font-medium">{s.employee?.first_name} {s.employee?.last_name}</p>
                          <p className="text-[#666] text-xs">{s.employee_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#B3B3B3] text-sm">{s.employee?.department_name}</td>
                    <td className="px-4 py-3 text-right text-[#B3B3B3] text-sm">{fmt(s.basic_salary)}</td>
                    <td className="px-4 py-3 text-right text-white text-sm">{fmt(s.gross_earnings)}</td>
                    <td className="px-4 py-3 text-right text-red-400 text-sm">{s.total_deductions > 0 ? `-${fmt(s.total_deductions)}` : fmt(0)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-white font-bold text-sm">{fmt(s.net_salary)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setViewPayslip(s.employee_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors ml-auto">
                        <Eye size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewPayslip && (
        <PayslipModal
          employeeId={viewPayslip}
          month={month}
          onClose={() => setViewPayslip(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Employee Payslip View (self)
// ─────────────────────────────────────────────
function EmployeePayslipView({ month }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef();

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    axios.get(`${API}/payroll/calculate`, { params: { month }, withCredentials: true })
      .then(r => setData(r.data))
      .catch(() => toast.error("Failed to load payslip"))
      .finally(() => setLoading(false));
  }, [month]);

  const handlePrint = () => {
    const printContents = printRef.current?.innerHTML;
    const win = window.open("", "_blank", "width=800,height=900");
    win.document.write(`
      <html><head><title>Payslip ${fmtMonthLabel(month)}</title>
      <style>
        body { background: #1a1a1a; color: #fff; font-family: monospace; padding: 32px; font-size: 13px; }
        .border-b { border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom:16px; margin-bottom:16px; }
        .border-t { border-top: 1px solid rgba(255,255,255,0.1); margin-top:8px; padding-top:8px; }
        .text-green-400 { color: #4ade80; } .text-red-400 { color: #f87171; }
        .text-yellow-400 { color: #facc15; } .text-blue-400 { color: #60a5fa; }
        .text-purple-400 { color: #c084fc; } .text-orange-400 { color: #fb923c; }
        .text-amber-400 { color: #fbbf24; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .rounded-lg { border: 1px solid rgba(255,255,255,0.1); padding: 8px; text-align: center; }
      </style></head>
      <body>${printContents}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div>
      {loading ? (
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 md:p-6 animate-pulse space-y-4">
          <div className="flex justify-between items-center">
            <div className="h-5 bg-white/10 rounded w-1/3" />
            <div className="h-5 bg-white/10 rounded w-1/4" />
          </div>
          <div className="h-px bg-white/10" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-3.5 bg-white/10 rounded w-1/3" />
              <div className="h-3.5 bg-white/10 rounded w-1/5" />
            </div>
          ))}
          <div className="h-px bg-white/10" />
          <div className="flex justify-between">
            <div className="h-4 bg-white/10 rounded w-1/4" />
            <div className="h-4 bg-white/10 rounded w-1/6" />
          </div>
        </div>
      ) : data ? (
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 md:p-6">
          <div ref={printRef}>
            <PayslipContent data={data} />
          </div>
        </div>
      ) : (
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 text-center py-12">
          <Wallet size={40} className="text-white/20 mx-auto mb-3" />
          <p className="text-[#B3B3B3] text-sm">No payroll data available</p>
          <p className="text-[#666] text-xs mt-1">Attendance and salary data needed for calculation</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Payroll Page
// ─────────────────────────────────────────────
export default function PayrollPage() {
  const { user, myEmployee } = useAuth();
  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";
  const [month, setMonth] = useState(prevMonthStr());

  // Generate last 12 months
  const monthOptions = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    monthOptions.push(d.toISOString().slice(0, 7));
  }

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Payroll</h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">
            {isAdminDept ? "Monthly salary breakdown for all employees" : "Your monthly salary breakdown"}
          </p>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-[#B3B3B3] text-sm whitespace-nowrap">Month:</label>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-[#2F2F2F] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none flex-1 sm:flex-none"
          >
            {monthOptions.map(m => (
              <option key={m} value={m}>{fmtMonthLabel(m)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {isAdminDept ? (
        <AdminPayrollView key={month} month={month} />
      ) : (
        <EmployeePayslipView key={month} month={month} />
      )}
    </div>
  );
}
