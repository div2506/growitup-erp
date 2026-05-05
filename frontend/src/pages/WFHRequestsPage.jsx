import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, Hourglass, Ban, AlertTriangle,
  Search, Laptop, ChevronDown, X
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

function Avatar({ employee, size = 36 }) {
  if (employee?.profile_picture) {
    return <img src={employee.profile_picture} alt={employee.first_name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  const initials = `${employee?.first_name?.[0] || ""}${employee?.last_name?.[0] || ""}`.toUpperCase() || "?";
  return (
    <div className="rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ width: size, height: size }}>
      {initials}
    </div>
  );
}

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

function getDayOfWeek(dateStr) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date(dateStr + "T00:00:00").getDay()];
}

// ─────────────────────────────────────────────
// Review Dialog (Approve All / Reject All)
// ─────────────────────────────────────────────
function ReviewDialog({ request, action, onClose, onDone }) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isReject = action === "Rejected";

  const handleSubmit = async () => {
    if (isReject && !notes.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setSubmitting(true);
    try {
      await axios.put(
        `${API}/wfh/requests/${request.request_id}/review`,
        { status: action, admin_notes: notes.trim() || null },
        { withCredentials: true }
      );
      toast.success(`WFH request ${action.toLowerCase()}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${action.toLowerCase()} request`);
    } finally { setSubmitting(false); }
  };

  const emp = request?.employee;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-md w-[calc(100%-2rem)] rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            {isReject ? "Reject WFH Request" : "Approve WFH Request"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-[#191919] rounded-lg border border-white/10 px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <Avatar employee={emp} size={28} />
              <span className="text-white font-medium">{emp?.first_name} {emp?.last_name}</span>
              <span className="text-[#666] text-xs">{emp?.employee_id}</span>
            </div>
            <p className="text-[#B3B3B3]">
              {fmtDate(request.from_date)}{request.from_date !== request.to_date ? ` — ${fmtDate(request.to_date)}` : ""}
              <span className="ml-2 text-[#666]">({request.total_days} day{request.total_days !== 1 ? "s" : ""})</span>
            </p>
          </div>

          {isReject && (
            <div className="space-y-1">
              <Label className={labelCls}>Rejection Reason *</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Please provide a reason for rejecting..."
                rows={3}
                className={`${inputCls} resize-none`}
              />
            </div>
          )}
          {!isReject && (
            <div className="space-y-1">
              <Label className={labelCls}>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional approval notes..."
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className={`flex-1 ${isReject ? "bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20" : "bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20"}`}
            >
              {submitting ? "Saving..." : isReject ? "Reject" : "Approve"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Partial Approval Modal (Review Days)
// ─────────────────────────────────────────────
function PartialApprovalModal({ request, onClose, onDone }) {
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");

  // Build list of all dates in range (excluding Sundays)
  const allDates = [];
  if (request?.from_date && request?.to_date) {
    const start = new Date(request.from_date + "T00:00:00");
    const end = new Date(request.to_date + "T00:00:00");
    const cur = new Date(start);
    while (cur <= end) {
      if (cur.getDay() !== 0) allDates.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  const currentUsed = request?.employee_wfh_used || 0;
  const [selected, setSelected] = useState(
    allDates.reduce((acc, d) => ({ ...acc, [d]: true }), {})
  );

  const toggleDate = (d) => setSelected(s => ({ ...s, [d]: !s[d] }));
  const approvedDates = allDates.filter(d => selected[d]);

  const handleSubmit = async () => {
    if (approvedDates.length === 0) {
      toast.error("Select at least one date to approve");
      return;
    }
    setSubmitting(true);
    try {
      await axios.put(
        `${API}/wfh/requests/${request.request_id}/review`,
        { status: "Approved", approved_days: approvedDates, admin_notes: notes.trim() || null },
        { withCredentials: true }
      );
      toast.success(`WFH approved for ${approvedDates.length} day${approvedDates.length !== 1 ? "s" : ""}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to approve");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-lg w-[calc(100%-2rem)] rounded-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Review WFH Days
          </DialogTitle>
        </DialogHeader>

        <p className="text-[#B3B3B3] text-sm">Select the dates to approve. Unselected dates will be rejected.</p>

        <div className="space-y-2 my-1">
          {allDates.map((d, i) => {
            const isWithinLimit = currentUsed + (i + 1) <= WFH_LIMIT;
            return (
              <label key={d} className="flex items-center gap-3 p-3 rounded-lg bg-[#191919] border border-white/10 hover:border-white/20 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={selected[d] || false}
                  onChange={() => toggleDate(d)}
                  className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-white text-sm">{fmtDate(d)} <span className="text-[#B3B3B3] text-xs">({getDayOfWeek(d)})</span></p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  isWithinLimit
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                }`}>
                  {isWithinLimit ? "Within limit" : "Exceeds limit"}
                </span>
              </label>
            );
          })}
        </div>

        <div className="space-y-1">
          <Label className={labelCls}>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes for partial approval..."
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>

        <div className="text-sm text-[#B3B3B3] bg-[#191919] rounded-lg px-3 py-2 border border-white/10">
          Approving <span className="text-white font-medium">{approvedDates.length}</span> of <span className="text-white font-medium">{allDates.length}</span> days
          {allDates.length - approvedDates.length > 0 && (
            <> · Rejecting <span className="text-red-400 font-medium">{allDates.length - approvedDates.length}</span> day{allDates.length - approvedDates.length !== 1 ? "s" : ""}</>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 hover:border-green-500/60">
            {submitting ? "Saving..." : "Approve Selected"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Main Admin WFH Requests Page
// ─────────────────────────────────────────────
export default function WFHRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [monthFilter, setMonthFilter] = useState("");
  const [search, setSearch] = useState("");
  const [exceedsOnly, setExceedsOnly] = useState(false);
  const [reviewDialog, setReviewDialog] = useState(null); // { request, action }
  const [partialModal, setPartialModal] = useState(null); // request

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== "All") params.status = statusFilter;
      if (monthFilter) params.month = monthFilter;
      const res = await axios.get(`${API}/wfh/requests`, { params, withCredentials: true });
      setRequests(res.data);
    } catch {
      toast.error("Failed to load WFH requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, monthFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const STATUS_TABS = ["Pending", "Approved", "Rejected", "Cancelled", "All"];

  // Generate last 12 months
  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    monthOptions.push(d.toISOString().slice(0, 7));
  }

  const filtered = requests.filter(r => {
    if (exceedsOnly && !r.exceeds_limit) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.employee?.first_name || ""} ${r.employee?.last_name || ""}`.toLowerCase();
      if (!name.includes(q) && !r.employee?.employee_id?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pending = requests.filter(r => r.status === "Pending");

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            WFH Requests
          </h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">
            {pending.length > 0 ? (
              <span className="text-amber-400">{pending.length} pending review</span>
            ) : "All requests reviewed"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 mb-4">
        {/* Status tabs */}
        <div className="px-4 pt-4 pb-3 border-b border-white/10">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
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
                <span className="ml-1.5 text-[#666]">
                  ({requests.filter(r => s === "All" ? true : r.status === s).length})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Search + Month + Exceeds filter */}
        <div className="px-4 py-3 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B3B3B3]" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or ID..."
              className={`${inputCls} pl-9 text-sm h-9`}
            />
          </div>
          <select
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            className="bg-[#191919] border border-white/10 text-[#B3B3B3] text-sm rounded-lg px-3 py-2 h-9 focus:outline-none"
          >
            <option value="">All Months</option>
            {monthOptions.map(m => {
              const d = new Date(m + "-02");
              return <option key={m} value={m}>{d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>;
            })}
          </select>
          <label className="flex items-center gap-2 cursor-pointer px-3 py-2 h-9 rounded-lg bg-[#191919] border border-white/10 hover:border-white/20 transition-colors">
            <input
              type="checkbox"
              checked={exceedsOnly}
              onChange={e => setExceedsOnly(e.target.checked)}
              className="w-3.5 h-3.5 accent-yellow-500"
            />
            <span className="text-[#B3B3B3] text-xs whitespace-nowrap">Exceeds Limit Only</span>
          </label>
        </div>
      </div>

      {/* Request List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#2F2F2F] rounded-xl border border-white/10 text-center py-12">
            <Laptop size={40} className="text-white/20 mx-auto mb-3" />
            <p className="text-[#B3B3B3] text-sm">No WFH requests found</p>
          </div>
        ) : (
          filtered.map(r => (
            <div key={r.request_id} className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
              <div className="flex flex-wrap items-start gap-4">
                {/* Employee Info */}
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                  <Avatar employee={r.employee} size={40} />
                  <div>
                    <p className="text-white font-medium text-sm">{r.employee?.first_name} {r.employee?.last_name}</p>
                    <p className="text-[#B3B3B3] text-xs">{r.employee?.employee_id} · {r.employee?.department_name}</p>
                  </div>
                </div>

                {/* Status + Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} />
                  {r.exceeds_limit && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs">
                      <AlertTriangle size={10} /> Exceeds Limit
                    </span>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#191919] rounded-lg border border-white/10 px-3 py-2.5">
                  <p className="text-[#B3B3B3] text-xs mb-0.5">Date Range</p>
                  <p className="text-white text-sm font-medium">
                    {fmtDate(r.from_date)}{r.from_date !== r.to_date ? ` — ${fmtDate(r.to_date)}` : ""}
                  </p>
                  <p className="text-[#666] text-xs">{r.total_days} working day{r.total_days !== 1 ? "s" : ""}</p>
                </div>
                <div className="bg-[#191919] rounded-lg border border-white/10 px-3 py-2.5">
                  <p className="text-[#B3B3B3] text-xs mb-0.5">Monthly WFH Usage</p>
                  <p className={`text-sm font-medium ${
                    r.employee_wfh_used >= WFH_LIMIT ? "text-yellow-400" : "text-white"
                  }`}>
                    {r.employee_wfh_used} / {WFH_LIMIT} days used
                  </p>
                  {r.exceeds_limit && (
                    <p className="text-yellow-400 text-xs">Days 1–{WFH_LIMIT}: Normal · Days {WFH_LIMIT + 1}+: Over limit</p>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div className="mt-3 bg-[#191919] rounded-lg border border-white/10 px-3 py-2.5">
                <p className="text-[#B3B3B3] text-xs mb-1">Reason</p>
                <p className="text-white text-sm">{r.reason}</p>
              </div>

              {/* Partial approval breakdown */}
              {r.status === "Approved" && r.approved_days && r.rejected_days && r.rejected_days.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-green-500/10 rounded-lg border border-green-500/20 px-3 py-2">
                    <p className="text-green-400 text-xs font-medium mb-1">Approved Dates</p>
                    {r.approved_days.map(d => (
                      <p key={d} className="text-green-300 text-xs">{fmtDate(d)}</p>
                    ))}
                  </div>
                  <div className="bg-red-500/10 rounded-lg border border-red-500/20 px-3 py-2">
                    <p className="text-red-400 text-xs font-medium mb-1">Rejected Dates</p>
                    {r.rejected_days.map(d => (
                      <p key={d} className="text-red-300 text-xs">{fmtDate(d)}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin notes */}
              {r.admin_notes && (
                <div className="mt-2 px-3 py-2 bg-[#191919] rounded-lg border border-white/10">
                  <p className="text-[#B3B3B3] text-xs italic">Note: {r.admin_notes}</p>
                </div>
              )}

              {/* Meta */}
              <p className="text-[#666] text-xs mt-2">Requested {fmtDateTime(r.requested_at)}</p>

              {/* Actions (Pending only) */}
              {r.status === "Pending" && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
                  {r.exceeds_limit && (
                    <Button
                      onClick={() => setPartialModal(r)}
                      size="sm"
                      className="bg-blue-500/10 border border-blue-500/40 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/60 text-xs h-8"
                    >
                      Review Days
                    </Button>
                  )}
                  <Button
                    onClick={() => setReviewDialog({ request: r, action: "Approved" })}
                    size="sm"
                    className="bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 hover:border-green-500/60 text-xs h-8"
                  >
                    Approve All
                  </Button>
                  <Button
                    onClick={() => setReviewDialog({ request: r, action: "Rejected" })}
                    size="sm"
                    className="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 text-xs h-8"
                  >
                    Reject All
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Dialogs */}
      {reviewDialog && (
        <ReviewDialog
          request={reviewDialog.request}
          action={reviewDialog.action}
          onClose={() => setReviewDialog(null)}
          onDone={() => { setReviewDialog(null); fetchRequests(); }}
        />
      )}
      {partialModal && (
        <PartialApprovalModal
          request={partialModal}
          onClose={() => setPartialModal(null)}
          onDone={() => { setPartialModal(null); fetchRequests(); }}
        />
      )}
    </div>
  );
}
