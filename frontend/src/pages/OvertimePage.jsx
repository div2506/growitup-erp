import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Plus, CheckCircle, XCircle, Hourglass, Clock,
  Timer, Calendar, TrendingUp, IndianRupee
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const inputCls = "bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] focus-visible:ring-white/20";
const labelCls = "text-[#B3B3B3] text-sm";

const STATUS_CONFIG = {
  Pending:  { cls: "bg-amber-400/10 text-amber-400 border-amber-400/20",  icon: Hourglass },
  Approved: { cls: "bg-green-400/10 text-green-400 border-green-400/20",  icon: CheckCircle },
  Rejected: { cls: "bg-red-400/10 text-red-400 border-red-400/20",        icon: XCircle },
};

function StatusBadge({ status }) {
  const { cls, icon: Icon } = STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
      <Icon size={11} /> {status}
    </span>
  );
}

function todayStr() { return new Date().toISOString().split("T")[0]; }

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", weekday: "short" });
}

function fmtDateTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function fmtTime(t) {
  if (!t) return "—";
  try {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2, "0")} ${period}`;
  } catch { return t; }
}

function calcOTHours(from, to) {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  let fromM = fh * 60 + fm;
  let toM = th * 60 + tm;
  if (toM <= fromM) toM += 24 * 60;
  return Math.max(0, parseFloat(((toM - fromM) / 60).toFixed(2)));
}

function calcOTPayFront(hours, basic_salary, date) {
  if (!basic_salary || !date || !hours) return 0;
  const dt = new Date(date + "-02");
  const year = dt.getFullYear();
  const month = dt.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const hourly = basic_salary / daysInMonth / 8;
  return parseFloat((hours * hourly * 1.25).toFixed(2));
}

// ─────────────────────────────────────────────
// Log Overtime Modal
// ─────────────────────────────────────────────
function LogOvertimeModal({ myEmployee, onClose, onSubmitted }) {
  const [date, setDate] = useState(todayStr());
  const [shiftInfo, setShiftInfo] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [overtimeFrom, setOvertimeFrom] = useState("");
  const [overtimeTo, setOvertimeTo] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const otHours = calcOTHours(overtimeFrom, overtimeTo);
  const otPay = calcOTPayFront(otHours, myEmployee?.basic_salary, date);
  const hourlyRate = myEmployee?.basic_salary && date
    ? (() => {
        const dt = new Date(date + "-02");
        const daysInMonth = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
        return parseFloat((myEmployee.basic_salary / daysInMonth / 8).toFixed(4));
      })()
    : 0;

  // Fetch shift info whenever date changes
  useEffect(() => {
    if (!date) return;
    setShiftInfo(null);
    setShiftError("");
    setOvertimeFrom("");
    setOvertimeTo("");
    setShiftLoading(true);
    axios.get(`${API}/overtime/shift-info`, { params: { date }, withCredentials: true })
      .then(r => {
        setShiftInfo(r.data);
        setOvertimeFrom(r.data.end_time || ""); // pre-fill with shift end
      })
      .catch(err => {
        setShiftError(err.response?.data?.detail || "Could not load shift info");
      })
      .finally(() => setShiftLoading(false));
  }, [date]);

  const validate = () => {
    const e = {};
    if (!date) e.date = "Date required";
    if (date > todayStr()) e.date = "Cannot select future dates";
    if (!overtimeFrom) e.overtimeFrom = "Start time required";
    if (!overtimeTo) e.overtimeTo = "End time required";
    if (shiftInfo && overtimeFrom) {
      const [fh, fm] = overtimeFrom.split(":").map(Number);
      const [eh, em] = shiftInfo.end_time.split(":").map(Number);
      if (fh * 60 + fm < eh * 60 + em) e.overtimeFrom = `Must be at or after shift end (${fmtTime(shiftInfo.end_time)})`;
    }
    if (overtimeFrom && overtimeTo) {
      const hrs = calcOTHours(overtimeFrom, overtimeTo);
      if (hrs <= 0) e.overtimeTo = "End time must be after start time";
    }
    if (!reason.trim()) e.reason = "Reason required";
    if (reason.length > 1000) e.reason = "Max 1000 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/overtime/requests`, {
        date, overtime_from: overtimeFrom, overtime_to: overtimeTo, reason: reason.trim()
      }, { withCredentials: true });
      toast.success("Overtime logged successfully!");
      onSubmitted();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to log overtime");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-lg w-[calc(100%-2rem)] rounded-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Log Overtime</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date */}
          <div className="space-y-1">
            <Label className={labelCls}>Date *</Label>
            <Input type="date" value={date} max={todayStr()}
              onChange={e => setDate(e.target.value)} className={inputCls} />
            {errors.date && <p className="text-red-400 text-xs">{errors.date}</p>}
          </div>

          {/* Shift Info */}
          {shiftLoading && (
            <div className="flex items-center gap-2 text-[#B3B3B3] text-sm">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Loading shift...
            </div>
          )}
          {shiftError && <p className="text-red-400 text-xs">{shiftError}</p>}
          {shiftInfo && (
            <div className="bg-[#191919] rounded-lg border border-white/10 px-4 py-3">
              <p className="text-[#B3B3B3] text-xs mb-0.5">Active Shift</p>
              <p className="text-white text-sm font-medium">{shiftInfo.shift_name}</p>
              <p className="text-[#B3B3B3] text-xs">{fmtTime(shiftInfo.start_time)} – {fmtTime(shiftInfo.end_time)}</p>
            </div>
          )}

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={labelCls}>Overtime From *</Label>
              <Input type="time" value={overtimeFrom} onChange={e => setOvertimeFrom(e.target.value)} className={inputCls} />
              {errors.overtimeFrom && <p className="text-red-400 text-xs">{errors.overtimeFrom}</p>}
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>Overtime To *</Label>
              <Input type="time" value={overtimeTo} onChange={e => setOvertimeTo(e.target.value)} className={inputCls} />
              {errors.overtimeTo && <p className="text-red-400 text-xs">{errors.overtimeTo}</p>}
            </div>
          </div>

          {/* Live Calculation */}
          {otHours > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
              <p className="text-blue-400 text-xs font-medium uppercase tracking-wide">Live Calculation</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[#B3B3B3] text-xs">Total Hours</p>
                  <p className="text-white font-bold text-lg">{otHours}h</p>
                </div>
                <div>
                  <p className="text-[#B3B3B3] text-xs">Overtime Pay</p>
                  <p className="text-green-400 font-bold text-lg">₹{otPay.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
              {hourlyRate > 0 && (
                <p className="text-[#666] text-xs">
                  Formula: {otHours}h × ₹{hourlyRate.toFixed(2)}/hr × 1.25x
                </p>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1">
            <Label className={labelCls}>Reason * <span className="text-[#666]">(max 1000 chars)</span></Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Describe the work done during overtime..."
              rows={3} maxLength={1000} className={`${inputCls} resize-none`} />
            <div className="flex justify-between">
              {errors.reason ? <p className="text-red-400 text-xs">{errors.reason}</p> : <span />}
              <p className="text-[#666] text-xs">{reason.length}/1000</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !shiftInfo}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white border-0">
              {submitting ? "Submitting..." : "Log Overtime"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Main Employee Overtime Page
// ─────────────────────────────────────────────
export default function OvertimePage() {
  const { myEmployee } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/overtime/requests`, { withCredentials: true });
      setRequests(res.data);
    } catch { toast.error("Failed to load overtime data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const STATUS_TABS = ["All", "Pending", "Approved", "Rejected"];
  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    monthOptions.push(d.toISOString().slice(0, 7));
  }

  const filtered = requests.filter(r => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (monthFilter && r.date.slice(0, 7) !== monthFilter) return false;
    return true;
  });

  // Summary
  const approvedRequests = requests.filter(r => r.status === "Approved");
  const totalApprovedHours = approvedRequests.reduce((s, r) => s + (r.total_hours || 0), 0);
  const totalApprovedPay = approvedRequests.reduce((s, r) => s + (r.overtime_pay || 0), 0);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Overtime</h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">Log and track your overtime hours</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white border-0 gap-2">
          <Plus size={16} /> Log Overtime
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <p className="text-[#B3B3B3] text-xs mb-1">Total Requests</p>
          <p className="text-2xl font-bold text-white">{requests.length}</p>
          <p className="text-[#666] text-xs mt-1">{requests.filter(r => r.status === "Pending").length} pending</p>
        </div>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <p className="text-[#B3B3B3] text-xs mb-1">Approved Hours</p>
          <p className="text-2xl font-bold text-white">{totalApprovedHours.toFixed(1)}h</p>
          <p className="text-[#666] text-xs mt-1">{approvedRequests.length} approved requests</p>
        </div>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <p className="text-[#B3B3B3] text-xs mb-1">Overtime Pay Earned</p>
          <p className="text-2xl font-bold text-green-400">₹{totalApprovedPay.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          <p className="text-[#666] text-xs mt-1">Approved earnings</p>
        </div>
      </div>

      {/* Log Section */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10">
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-white font-semibold text-sm">My Overtime Log</p>
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
              className="bg-[#191919] border border-white/10 text-[#B3B3B3] text-sm rounded-lg px-3 py-2 focus:outline-none">
              <option value="">All Months</option>
              {monthOptions.map(m => {
                const d = new Date(m + "-02");
                return <option key={m} value={m}>{d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>;
              })}
            </select>
          </div>
          <div className="flex gap-1 mt-3 overflow-x-auto no-scrollbar">
            {STATUS_TABS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === s ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:text-white hover:bg-white/5"
                }`}>
                {s}{s !== "All" && <span className="ml-1.5 text-[#666]">({requests.filter(r => r.status === s).length})</span>}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Timer size={40} className="text-white/20 mx-auto mb-3" />
            <p className="text-[#B3B3B3] text-sm">No overtime records found</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(r => (
              <div key={r.request_id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-white font-medium text-sm">{fmtDate(r.date)}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-[#B3B3B3] text-xs mb-1">
                      {fmtTime(r.overtime_from)} – {fmtTime(r.overtime_to)}
                      <span className="ml-2 text-white font-medium">{r.total_hours}h</span>
                    </p>
                    <p className="text-[#B3B3B3] text-xs line-clamp-2">{r.reason}</p>
                    {r.admin_notes && <p className="text-[#B3B3B3] text-xs mt-1 italic">Admin note: {r.admin_notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-green-400 font-bold text-sm">₹{(r.overtime_pay || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                    <p className="text-[#666] text-xs mt-0.5">{r.total_hours}h × 1.25x</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <LogOvertimeModal
          myEmployee={myEmployee}
          onClose={() => setShowModal(false)}
          onSubmitted={() => { setShowModal(false); fetchData(); }}
        />
      )}
    </div>
  );
}
