import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Plus, X, ChevronDown, ChevronUp, AlertCircle, CheckCircle, XCircle,
  Hourglass, Ban, Clock, Calendar, FileText
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const inputCls = "bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] focus-visible:ring-white/20";
const labelCls = "text-[#B3B3B3] text-sm";

const STATUS_CONFIG = {
  Pending:   { cls: "bg-amber-400/10 text-amber-400 border-amber-400/20",   icon: Hourglass },
  Approved:  { cls: "bg-green-400/10 text-green-400 border-green-400/20",   icon: CheckCircle },
  Rejected:  { cls: "bg-red-400/10 text-red-400 border-red-400/20",         icon: XCircle },
  Cancelled: { cls: "bg-white/5 text-[#B3B3B3] border-white/10",            icon: Ban },
};

function StatusBadge({ status }) {
  const { cls, icon: Icon } = STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
      <Icon size={11} /> {status}
    </span>
  );
}

function today() { return new Date().toISOString().split("T")[0]; }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─────────────────────────────────────────────
// Apply Leave Modal
// ─────────────────────────────────────────────
function ApplyLeaveModal({ balance, onClose, onSubmitted }) {
  const [form, setForm] = useState({
    leave_type: "Full Day",
    half_day_type: "First Half",
    from_date: "",
    to_date: "",
    reason: ""
  });
  const [workingDays, setWorkingDays] = useState(null);
  const [deduction, setDeduction] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Calculate working days & deduction whenever dates change
  useEffect(() => {
    if (form.from_date && form.to_date && form.to_date >= form.from_date) {
      if (form.leave_type === "Half Day") {
        setWorkingDays(0.5);
        // Deduction
        const paid = Math.min(0.5, balance?.paid_leave_balance || 0);
        setDeduction({ paid_days: paid, regular_days: 0.5 - paid });
        return;
      }
      axios.get(`${API}/leave/working-days?from_date=${form.from_date}&to_date=${form.to_date}`, { withCredentials: true })
        .then(res => {
          const days = res.data.working_days;
          setWorkingDays(days);
          const paid_bal = balance?.paid_leave_balance || 0;
          if (paid_bal >= days) setDeduction({ paid_days: days, regular_days: 0 });
          else if (paid_bal > 0) setDeduction({ paid_days: paid_bal, regular_days: days - paid_bal });
          else setDeduction({ paid_days: 0, regular_days: days });
        })
        .catch(() => {});
    } else {
      setWorkingDays(null);
      setDeduction(null);
    }
  }, [form.from_date, form.to_date, form.leave_type, balance]);

  const validate = () => {
    const e = {};
    if (!form.from_date) e.from_date = "From date required";
    if (!form.to_date) e.to_date = "To date required";
    if (form.from_date && form.from_date < today()) e.from_date = "Cannot select past dates";
    if (form.to_date && form.from_date && form.to_date < form.from_date) e.to_date = "Must be on or after From date";
    if (form.leave_type === "Half Day" && !form.half_day_type) e.half_day_type = "Select First or Second Half";
    if (!form.reason.trim()) e.reason = "Reason is required";
    if (form.reason.length > 1000) e.reason = "Max 1000 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/leave/requests`, {
        from_date: form.from_date,
        to_date: form.to_date,
        leave_type: form.leave_type,
        half_day_type: form.leave_type === "Half Day" ? form.half_day_type : null,
        reason: form.reason
      }, { withCredentials: true });
      toast.success("Leave request submitted successfully!");
      onSubmitted();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit request");
    } finally { setSubmitting(false); }
  };

  const paidBal = balance?.paid_leave_balance || 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white w-full sm:max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] max-w-none sm:rounded-lg rounded-none p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/10 shrink-0">
          <DialogTitle className="text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Apply for Leave</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Balance Info */}
          <div className="bg-[#191919] border border-white/10 rounded-lg px-4 py-3 flex flex-wrap gap-4">
            <div>
              <p className="text-xs text-[#B3B3B3]">Paid Leave Balance</p>
              <p className={`text-lg font-bold ${paidBal > 0 ? "text-green-400" : "text-[#B3B3B3]"}`}>{paidBal} days</p>
            </div>
            <div>
              <p className="text-xs text-[#B3B3B3]">Regular Leave</p>
              <p className="text-lg font-bold text-white">Unlimited</p>
            </div>
          </div>

          {/* Leave Type */}
          <div className="space-y-2">
            <Label className={labelCls}>Leave Type *</Label>
            <div className="flex gap-3">
              {["Full Day", "Half Day"].map(t => (
                <label key={t} className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg border transition-colors flex-1 justify-center ${form.leave_type === t ? "bg-white/10 border-white/30 text-white" : "border-white/10 text-[#B3B3B3] hover:border-white/20"}`}>
                  <input type="radio" className="sr-only" checked={form.leave_type === t} onChange={() => setForm(f => ({ ...f, leave_type: t, half_day_type: "First Half" }))} />
                  {t}
                </label>
              ))}
            </div>
          </div>

          {/* Half Day Type */}
          {form.leave_type === "Half Day" && (
            <div className="space-y-2">
              <Label className={labelCls}>Half Day Period *</Label>
              <div className="flex gap-3">
                {["First Half", "Second Half"].map(t => (
                  <label key={t} className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg border transition-colors flex-1 justify-center ${form.half_day_type === t ? "bg-white/10 border-white/30 text-white" : "border-white/10 text-[#B3B3B3] hover:border-white/20"}`}>
                    <input type="radio" className="sr-only" checked={form.half_day_type === t} onChange={() => setForm(f => ({ ...f, half_day_type: t }))} />
                    {t}
                  </label>
                ))}
              </div>
              {errors.half_day_type && <p className="text-red-400 text-xs">{errors.half_day_type}</p>}
            </div>
          )}

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={labelCls}>From Date *</Label>
              <Input type="date" min={today()} value={form.from_date}
                onChange={e => setForm(f => ({ ...f, from_date: e.target.value, to_date: form.leave_type === "Half Day" ? e.target.value : (f.to_date < e.target.value ? e.target.value : f.to_date) }))}
                className={inputCls} />
              {errors.from_date && <p className="text-red-400 text-xs">{errors.from_date}</p>}
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>To Date *</Label>
              <Input type="date" min={form.from_date || today()} value={form.to_date}
                disabled={form.leave_type === "Half Day"}
                onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))}
                className={`${inputCls} disabled:opacity-60`} />
              {errors.to_date && <p className="text-red-400 text-xs">{errors.to_date}</p>}
            </div>
          </div>

          {/* Working Days & Deduction Preview */}
          {workingDays !== null && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 space-y-2">
              <p className="text-blue-400 text-sm font-medium">Total working days: <span className="font-bold">{workingDays}</span></p>
              {deduction && (
                <div className="text-sm space-y-0.5">
                  <p className="text-[#B3B3B3] text-xs font-medium">Leave Breakdown:</p>
                  {deduction.paid_days > 0 && <p className="text-green-400 text-xs">• Paid Leave: {deduction.paid_days} day{deduction.paid_days !== 1 ? "s" : ""}</p>}
                  {deduction.regular_days > 0 && <p className="text-amber-400 text-xs">• Regular Leave (Unpaid): {deduction.regular_days} day{deduction.regular_days !== 1 ? "s" : ""}</p>}
                </div>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1">
            <Label className={labelCls}>Reason * <span className="text-[#666] text-xs">(max 1000 chars)</span></Label>
            <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className={`${inputCls} min-h-[90px] resize-none`}
              placeholder="Please provide reason for leave..."
              maxLength={1000} />
            <div className="flex justify-between">
              {errors.reason ? <p className="text-red-400 text-xs">{errors.reason}</p> : <span />}
              <p className="text-[#666] text-xs">{form.reason.length}/1000</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-white/10 shrink-0 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent border-white/20 text-[#B3B3B3] hover:bg-white/5 min-h-[44px]">Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 min-h-[44px]">
            {submitting ? "Submitting..." : "Submit Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Cancel Confirm
// ─────────────────────────────────────────────
function CancelConfirmDialog({ request, onConfirm, onClose }) {
  const [cancelling, setCancelling] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-sm w-[calc(100%-2rem)] rounded-xl">
        <DialogHeader><DialogTitle className="text-white">Cancel Leave Request</DialogTitle></DialogHeader>
        <p className="text-[#B3B3B3] text-sm">
          Are you sure you want to cancel the leave request for <span className="text-white font-medium">{fmtDate(request?.from_date)} – {fmtDate(request?.to_date)}</span>?
        </p>
        {request?.status === "Approved" && (
          <p className="text-amber-400 text-xs">⚠️ Approved leave will be restored to your balance.</p>
        )}
        <div className="flex gap-3 mt-2">
          <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent border-white/20 text-[#B3B3B3] hover:bg-white/5 min-h-[44px]">Keep it</Button>
          <Button onClick={async () => {
            setCancelling(true);
            await onConfirm();
            setCancelling(false);
          }} className="flex-1 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 min-h-[44px]">
            {cancelling ? "Cancelling..." : "Yes, Cancel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// My Leave Requests List
// ─────────────────────────────────────────────
const ACCENT = {
  Approved:  "#4ade80",
  Rejected:  "#f87171",
  Cancelled: "#555",
  Pending:   "#fbbf24",
};

const thCls = "px-4 py-3 text-left text-xs font-semibold text-[#B3B3B3] uppercase tracking-wider select-none whitespace-nowrap";
const tdCls = "px-4 py-3.5 text-sm align-middle";

function LeaveRow({ req, canCancel, onCancel }) {
  const [open, setOpen] = useState(false);
  const totalDays = req.total_days ?? ((req.paid_days ?? 0) + (req.regular_days ?? 0));
  const accent = ACCENT[req.status] ?? ACCENT.Pending;

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        {/* Leave Type */}
        <td className={tdCls}>
          <span className="text-white font-medium">
            {req.leave_type === "Half Day" ? `Half Day` : "Full Day"}
          </span>
          {req.leave_type === "Half Day" && req.half_day_type && (
            <span className="ml-1.5 text-[11px] text-[#B3B3B3]">({req.half_day_type})</span>
          )}
        </td>

        {/* Start Date */}
        <td className={tdCls}>
          <span className="text-white">{fmtDate(req.from_date)}</span>
        </td>

        {/* End Date */}
        <td className={tdCls}>
          <span className="text-white">{fmtDate(req.to_date)}</span>
        </td>

        {/* Days */}
        <td className={tdCls}>
          <div className="flex items-center gap-1.5">
            <span className="text-white">{totalDays}</span>
            {req.paid_days > 0 && (
              <span className="text-[10px] bg-green-400/10 text-green-400 border border-green-400/20 px-1.5 py-0.5 rounded-full">{req.paid_days}P</span>
            )}
            {req.regular_days > 0 && (
              <span className="text-[10px] bg-white/5 text-[#B3B3B3] border border-white/10 px-1.5 py-0.5 rounded-full">{req.regular_days}U</span>
            )}
          </div>
        </td>

        {/* Status */}
        <td className={tdCls}>
          <StatusBadge status={req.status} />
        </td>

        {/* Action */}
        <td className={`${tdCls} text-right`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            {canCancel(req) && (
              <button onClick={() => onCancel(req)}
                className="px-2.5 py-1 text-xs text-red-400 border border-red-400/30 hover:bg-red-400/10 rounded-lg transition-colors font-medium">
                Cancel
              </button>
            )}
            {open
              ? <ChevronUp size={14} className="text-[#666]" />
              : <ChevronDown size={14} className="text-[#666]" />}
          </div>
        </td>
      </tr>

      {/* Expanded row */}
      {open && (
        <tr className="bg-[#252525]" style={{ borderLeft: `3px solid ${accent}` }}>
          <td colSpan={6} className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Leave Type</p>
                <p className="text-white text-sm font-medium">
                  {req.leave_type === "Half Day" ? `Half Day${req.half_day_type ? ` · ${req.half_day_type}` : ""}` : "Full Day"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Duration</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-white text-sm font-medium">{totalDays} day{totalDays !== 1 ? "s" : ""}</span>
                  {req.paid_days > 0 && (
                    <span className="text-[10px] bg-green-400/10 text-green-400 border border-green-400/20 px-1.5 py-0.5 rounded-full">{req.paid_days} paid</span>
                  )}
                  {req.regular_days > 0 && (
                    <span className="text-[10px] bg-white/5 text-[#B3B3B3] border border-white/10 px-1.5 py-0.5 rounded-full">{req.regular_days} unpaid</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Date Range</p>
                <p className="text-white text-sm">
                  {req.from_date === req.to_date
                    ? fmtDate(req.from_date)
                    : `${fmtDate(req.from_date)} – ${fmtDate(req.to_date)}`}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Applied On</p>
                <p className="text-[#B3B3B3] text-sm">
                  {req.requested_at
                    ? new Date(req.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Reason</p>
                <p className="text-[#B3B3B3] text-sm">{req.reason || "—"}</p>
              </div>
            </div>

            {req.status === "Rejected" && req.admin_notes && (
              <div className="flex items-start gap-1.5 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-red-400/70 mb-0.5">Admin Note</p>
                  <p className="text-red-400 text-sm">{req.admin_notes}</p>
                </div>
              </div>
            )}
            {req.status === "Approved" && req.reviewer_name && (
              <div className="flex items-center gap-1.5 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
                <CheckCircle size={12} className="text-green-400 shrink-0" />
                <p className="text-green-400 text-sm">Approved by <span className="font-medium">{req.reviewer_name}</span></p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function LeaveList({ requests, canCancel, onCancel }) {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
      <table className="w-full min-w-[600px] bg-[#2F2F2F]">
        <thead className="bg-[#191919] border-b border-white/10">
          <tr>
            <th className={thCls}>Leave Type</th>
            <th className={thCls}>Start Date</th>
            <th className={thCls}>End Date</th>
            <th className={thCls}>Days</th>
            <th className={thCls}>Status</th>
            <th className={`${thCls} text-right`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(req => (
            <LeaveRow key={req.request_id} req={req} canCancel={canCancel} onCancel={onCancel} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MyLeaveRequests({ requests, loading, onCancel }) {
  const [filterStatus, setFilterStatus] = useState("All");
  const [cancelTarget, setCancelTarget] = useState(null);

  const filtered = filterStatus === "All" ? requests : requests.filter(r => r.status === filterStatus);
  const today = new Date().toISOString().split("T")[0];

  const handleCancel = async (req) => {
    try {
      await axios.put(`${API}/leave/requests/${req.request_id}/cancel`, {}, { withCredentials: true });
      toast.success("Leave request cancelled");
      setCancelTarget(null);
      onCancel();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to cancel");
    }
  };

  const canCancel = (req) => req.status === "Pending" || (req.status === "Approved" && req.from_date >= today);

  return (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-4">
        {["All", "Pending", "Approved", "Rejected", "Cancelled"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:bg-white/5 hover:text-white"}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-[#2F2F2F] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-10 text-center">
          <FileText size={28} className="text-[#B3B3B3] mx-auto mb-2" />
          <p className="text-[#B3B3B3]">No {filterStatus !== "All" ? filterStatus.toLowerCase() : ""} leave requests</p>
        </div>
      ) : (
        <LeaveList requests={filtered} canCancel={canCancel} onCancel={setCancelTarget} />
      )}

      {cancelTarget && (
        <CancelConfirmDialog
          request={cancelTarget}
          onConfirm={() => handleCancel(cancelTarget)}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main LeavePage
// ─────────────────────────────────────────────
export default function LeavePage() {
  const { myEmployee } = useAuth();
  const [balance, setBalance] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [showApplyForm, setShowApplyForm] = useState(false);

  const fetchBalance = useCallback(async () => {
    setLoadingBalance(true);
    try {
      const { data } = await axios.get(`${API}/leave/balance`, { withCredentials: true });
      setBalance(data);
    } catch { setBalance(null); }
    finally { setLoadingBalance(false); }
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      // Always scope to the logged-in employee (so admins only see their own
      // leaves on the personal "My Leaves" tab — not every employee's request).
      const params = myEmployee?.employee_id
        ? `?employee_id=${encodeURIComponent(myEmployee.employee_id)}`
        : "";
      const { data } = await axios.get(`${API}/leave/requests${params}`, { withCredentials: true });
      setRequests(data);
    } catch { setRequests([]); }
    finally { setLoadingRequests(false); }
  }, [myEmployee?.employee_id]);

  useEffect(() => { fetchBalance(); fetchRequests(); }, [fetchBalance, fetchRequests]);

  const paidBal = balance?.paid_leave_balance || 0;

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>My Leave</h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">Manage your leave requests and view balance</p>
        </div>
        <button onClick={() => setShowApplyForm(true)}
          className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 rounded-lg px-4 py-2 text-sm font-medium transition-colors">
          <Plus size={15} /> Apply for Leave
        </button>
      </div>

      {/* Leave Balance Card */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
            <Calendar size={15} className="text-green-400" />
          </div>
          <h2 className="text-white font-semibold">Leave Balance</h2>
        </div>
        {loadingBalance ? (
          <div className="h-16 bg-white/5 rounded-lg animate-pulse" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[#B3B3B3] text-xs mb-1">Paid Leave</p>
              <p className={`text-2xl font-bold ${paidBal > 0 ? "text-green-400" : "text-[#B3B3B3]"}`}>{paidBal}</p>
              <p className="text-[#666] text-xs">days available</p>
            </div>
            <div>
              <p className="text-[#B3B3B3] text-xs mb-1">Regular Leave</p>
              <p className="text-2xl font-bold text-white">∞</p>
              <p className="text-[#666] text-xs">Unpaid (unlimited)</p>
            </div>
            <div>
              <p className="text-[#B3B3B3] text-xs mb-1">Monthly Credit</p>
              {balance?.paid_leave_eligible ? (
                <p className="text-blue-400 text-sm font-medium mt-1">✓ Eligible (1/month)</p>
              ) : (
                <p className="text-[#666] text-sm mt-1">Not enrolled</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* My Leave Requests */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold">My Requests</h2>
        <span className="text-[#B3B3B3] text-xs">{requests.length} total</span>
      </div>
      <MyLeaveRequests requests={requests} loading={loadingRequests} onCancel={() => { fetchRequests(); fetchBalance(); }} />

      {/* Apply Leave Modal */}
      {showApplyForm && (
        <ApplyLeaveModal
          balance={balance}
          onClose={() => setShowApplyForm(false)}
          onSubmitted={() => { fetchRequests(); fetchBalance(); }}
        />
      )}
    </div>
  );
}
