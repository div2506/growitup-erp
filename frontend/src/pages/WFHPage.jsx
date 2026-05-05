import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Plus, X, CheckCircle, XCircle, Hourglass, Ban, Laptop,
  AlertTriangle, Calendar, Clock, ChevronDown
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
const WFH_LIMIT = 3;

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

function fmtDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function calcWorkingDays(from, to) {
  if (!from || !to || to < from) return 0;
  let count = 0;
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const cur = new Date(start);
  while (cur <= end) {
    if (cur.getDay() !== 0) count++; // skip Sundays
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ─────────────────────────────────────────────
// Request WFH Modal
// ─────────────────────────────────────────────
function RequestWFHModal({ usage, onClose, onSubmitted }) {
  const [form, setForm] = useState({ from_date: "", to_date: "", reason: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const workingDays = calcWorkingDays(form.from_date, form.to_date);
  const totalAfter = (usage?.wfh_days_used || 0) + workingDays;
  const exceedsLimit = workingDays > 0 && totalAfter > WFH_LIMIT;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isSunday = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr + "T00:00:00").getDay() === 0;
  };

  const validate = () => {
    const e = {};
    if (!form.from_date) e.from_date = "From date required";
    if (!form.to_date) e.to_date = "To date required";
    if (form.from_date && form.from_date < today()) e.from_date = "Cannot select past dates";
    if (form.from_date && isSunday(form.from_date)) e.from_date = "Cannot select Sunday";
    if (form.to_date && form.from_date && form.to_date < form.from_date) e.to_date = "Must be on or after From date";
    if (form.to_date && isSunday(form.to_date)) e.to_date = "Cannot select Sunday";
    if (!form.reason.trim()) e.reason = "Reason is required";
    if (form.reason.length > 1000) e.reason = "Max 1000 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/wfh/requests`, {
        from_date: form.from_date,
        to_date: form.to_date,
        reason: form.reason.trim()
      }, { withCredentials: true });
      toast.success("WFH request submitted successfully!");
      onSubmitted();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit WFH request");
    } finally {
      setSubmitting(false);
    }
  };

  const usedCount = usage?.wfh_days_used || 0;
  const usageColor = usedCount >= WFH_LIMIT ? "text-yellow-400" : "text-green-400";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-lg w-[calc(100%-2rem)] rounded-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Request Work From Home
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* WFH Usage */}
          <div className="bg-[#191919] rounded-lg border border-white/10 px-4 py-3">
            <p className="text-[#B3B3B3] text-xs mb-1">WFH Used This Month</p>
            <p className={`text-lg font-bold ${usageColor}`}>
              {usedCount} <span className="text-[#B3B3B3] text-sm font-normal">/ {WFH_LIMIT} days</span>
            </p>
          </div>

          {/* From Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={labelCls}>From Date *</Label>
              <Input
                type="date"
                value={form.from_date}
                min={today()}
                onChange={e => {
                  const v = e.target.value;
                  set("from_date", v);
                  if (form.to_date && v > form.to_date) set("to_date", v);
                }}
                className={inputCls}
              />
              {errors.from_date && <p className="text-red-400 text-xs">{errors.from_date}</p>}
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>To Date *</Label>
              <Input
                type="date"
                value={form.to_date}
                min={form.from_date || today()}
                onChange={e => set("to_date", e.target.value)}
                className={inputCls}
              />
              {errors.to_date && <p className="text-red-400 text-xs">{errors.to_date}</p>}
            </div>
          </div>

          {/* Working Days */}
          {workingDays > 0 && (
            <div className="bg-[#191919] rounded-lg border border-white/10 px-4 py-2.5">
              <p className="text-[#B3B3B3] text-xs">Total WFH Days: <span className="text-white font-medium">{workingDays} day{workingDays !== 1 ? "s" : ""}</span> <span className="text-[#666] text-xs">(Sundays excluded)</span></p>
            </div>
          )}

          {/* Limit Warning */}
          {exceedsLimit && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-yellow-400 text-sm font-medium mb-1">Monthly Limit Notice</p>
                  <p className="text-yellow-300/80 text-xs">
                    You've used <strong>{usedCount}</strong> WFH day{usedCount !== 1 ? "s" : ""} this month.
                    You're requesting <strong>{workingDays}</strong> day{workingDays !== 1 ? "s" : ""}.
                  </p>
                  <p className="text-yellow-300/80 text-xs mt-1">
                    Days 1–{WFH_LIMIT}: Normal request · Days {WFH_LIMIT + 1}+: Exceeds monthly limit
                  </p>
                  <p className="text-yellow-300/80 text-xs mt-1 font-medium">
                    Please provide a strong reason. Admin approval required.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1">
            <Label className={labelCls}>Reason * <span className="text-[#666]">(max 1000 chars)</span></Label>
            <Textarea
              value={form.reason}
              onChange={e => set("reason", e.target.value)}
              placeholder={exceedsLimit
                ? "Please provide a valid reason for exceeding the monthly limit..."
                : "Please provide reason for WFH request..."
              }
              rows={3}
              className={`${inputCls} resize-none`}
              maxLength={1000}
            />
            <div className="flex justify-between">
              {errors.reason ? <p className="text-red-400 text-xs">{errors.reason}</p> : <span />}
              <p className="text-[#666] text-xs">{form.reason.length}/1000</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-blue-500/10 border border-blue-500/40 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/60 border-0"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Cancel Confirmation Dialog
// ─────────────────────────────────────────────
function CancelConfirmDialog({ reqId, onClose, onCancelled }) {
  const [submitting, setSubmitting] = useState(false);
  const handleCancel = async () => {
    setSubmitting(true);
    try {
      await axios.put(`${API}/wfh/requests/${reqId}/cancel`, {}, { withCredentials: true });
      toast.success("WFH request cancelled");
      onCancelled();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to cancel");
    } finally { setSubmitting(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-sm w-[calc(100%-2rem)] rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-white">Cancel WFH Request</DialogTitle>
        </DialogHeader>
        <p className="text-[#B3B3B3] text-sm">Are you sure you want to cancel this WFH request?</p>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Keep It</Button>
          <Button onClick={handleCancel} disabled={submitting} className="flex-1 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 border-0">
            {submitting ? "Cancelling..." : "Yes, Cancel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Main WFH Page (Employee view)
// ─────────────────────────────────────────────
export default function WFHPage() {
  const { myEmployee } = useAuth();
  const [usage, setUsage] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("");

  const isEligible = !!myEmployee?.wfh_eligible;

  const currentMonth = new Date().toISOString().slice(0, 7) + "-01";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usageRes, reqRes] = await Promise.all([
        axios.get(`${API}/wfh/usage`, { withCredentials: true }),
        axios.get(`${API}/wfh/requests`, { withCredentials: true }),
      ]);
      setUsage(usageRes.data);
      setRequests(reqRes.data);
    } catch {
      toast.error("Failed to load WFH data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const STATUS_TABS = ["All", "Pending", "Approved", "Rejected", "Cancelled"];

  const filtered = requests.filter(r => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (monthFilter) {
      const m = monthFilter;
      if (r.from_date.slice(0, 7) !== m && r.to_date.slice(0, 7) !== m) return false;
    }
    return true;
  });

  const usedCount = usage?.wfh_days_used || 0;
  const usageColor = usedCount >= 3 ? "text-yellow-400" : "text-green-400";

  // Generate last 12 months for filter
  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
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
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Work From Home
          </h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">Manage your WFH requests</p>
        </div>
        {isEligible ? (
          <Button
            onClick={() => setShowModal(true)}
            className="bg-blue-500/10 border border-blue-500/40 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/60 border-0 gap-2"
          >
            <Plus size={16} /> Request WFH
          </Button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10">
            <Laptop size={16} className="text-[#B3B3B3]" />
            <span className="text-[#B3B3B3] text-sm">Not eligible for WFH</span>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <p className="text-[#B3B3B3] text-xs mb-1">This Month</p>
          <p className={`text-2xl font-bold ${usageColor}`}>
            {usedCount} <span className="text-[#B3B3B3] text-sm font-normal">/ {WFH_LIMIT} days</span>
          </p>
          <p className="text-[#666] text-xs mt-1">WFH days used</p>
        </div>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <p className="text-[#B3B3B3] text-xs mb-1">Remaining</p>
          <p className="text-2xl font-bold text-white">
            {Math.max(0, WFH_LIMIT - usedCount)} <span className="text-[#B3B3B3] text-sm font-normal">days</span>
          </p>
          <p className="text-[#666] text-xs mt-1">Available this month</p>
        </div>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <p className="text-[#B3B3B3] text-xs mb-1">Eligibility</p>
          <p className={`text-lg font-bold ${isEligible ? "text-green-400" : "text-[#B3B3B3]"}`}>
            {isEligible ? "Eligible ✓" : "Not Eligible"}
          </p>
          <p className="text-[#666] text-xs mt-1">{isEligible ? "You can request WFH" : "Contact HR to enable"}</p>
        </div>
      </div>

      {/* Requests Section */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10">
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-white font-semibold text-sm">My WFH Requests</p>
            {/* Month filter */}
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="bg-[#191919] border border-white/10 text-[#B3B3B3] text-sm rounded-lg px-3 py-2 focus:outline-none"
            >
              <option value="">All Months</option>
              {monthOptions.map(m => {
                const d = new Date(m + "-02");
                return <option key={m} value={m}>{d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>;
              })}
            </select>
          </div>
          {/* Status tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto no-scrollbar">
            {STATUS_TABS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === s
                    ? "bg-white/10 text-white"
                    : "text-[#B3B3B3] hover:text-white hover:bg-white/5"
                }`}
              >
                {s}
                {s !== "All" && (
                  <span className="ml-1.5 text-[#666]">
                    ({requests.filter(r => r.status === s).length})
                  </span>
                )}
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
            <Laptop size={40} className="text-white/20 mx-auto mb-3" />
            <p className="text-[#B3B3B3] text-sm">No WFH requests found</p>
            {isEligible && statusFilter === "All" && (
              <p className="text-[#666] text-xs mt-1">Click "Request WFH" to submit your first request</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(r => (
              <div key={r.request_id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-white font-medium text-sm">
                        {fmtDate(r.from_date)}
                        {r.from_date !== r.to_date && <> — {fmtDate(r.to_date)}</>}
                      </p>
                      <StatusBadge status={r.status} />
                      {r.exceeds_limit && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs">
                          <AlertTriangle size={10} /> Exceeds Limit
                        </span>
                      )}
                    </div>
                    <p className="text-[#B3B3B3] text-xs mb-1">
                      {r.total_days} day{r.total_days !== 1 ? "s" : ""} · Requested {fmtDateTime(r.requested_at)}
                    </p>
                    <p className="text-[#B3B3B3] text-xs line-clamp-2">{r.reason}</p>

                    {/* Partial approval breakdown */}
                    {r.status === "Approved" && r.approved_days && r.approved_days.length > 0 && r.rejected_days && r.rejected_days.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-green-400 text-xs">✓ Approved: {r.approved_days.map(fmtDate).join(", ")}</p>
                        <p className="text-red-400 text-xs">✗ Rejected: {r.rejected_days.map(fmtDate).join(", ")}</p>
                      </div>
                    )}

                    {/* Admin notes (rejection reason) */}
                    {r.admin_notes && (
                      <p className="text-[#B3B3B3] text-xs mt-1 italic">Admin note: {r.admin_notes}</p>
                    )}
                  </div>

                  {/* Cancel button */}
                  {(r.status === "Pending" ||
                    (r.status === "Approved" && r.from_date >= today())) && (
                    <button
                      onClick={() => setCancelId(r.request_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs transition-colors whitespace-nowrap"
                    >
                      <X size={12} /> Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <RequestWFHModal
          usage={usage}
          onClose={() => setShowModal(false)}
          onSubmitted={() => { setShowModal(false); fetchData(); }}
        />
      )}
      {cancelId && (
        <CancelConfirmDialog
          reqId={cancelId}
          onClose={() => setCancelId(null)}
          onCancelled={() => { setCancelId(null); fetchData(); }}
        />
      )}
    </div>
  );
}
