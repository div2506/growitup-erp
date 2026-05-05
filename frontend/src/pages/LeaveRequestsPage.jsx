import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, Hourglass, Ban, AlertCircle, FileText, Search, Filter, X, ChevronDown, ChevronUp
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

const ACCENT = { Approved: "#4ade80", Rejected: "#f87171", Cancelled: "#555", Pending: "#fbbf24" };
const thCls = "px-4 py-3 text-left text-xs font-semibold text-[#B3B3B3] uppercase tracking-wider whitespace-nowrap";
const tdCls = "px-4 py-3.5 text-sm align-middle";

function LeaveRequestRow({ req, onReview }) {
  const [open, setOpen] = useState(false);
  const accent = ACCENT[req.status] ?? ACCENT.Pending;
  const totalDays = req.total_days ?? ((req.paid_days ?? 0) + (req.regular_days ?? 0));
  const dateLabel = req.leave_type === "Half Day"
    ? `${fmtDate(req.from_date)} · ${req.half_day_type}`
    : req.from_date === req.to_date
      ? fmtDate(req.from_date)
      : `${fmtDate(req.from_date)} – ${fmtDate(req.to_date)}`;

  return (
    <>
      <tr
        data-testid={`leave-request-row-${req.request_id}`}
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        {/* Employee */}
        <td className={tdCls}>
          <div className="flex items-center gap-2.5">
            <Avatar employee={req.employee} size={32} />
            <div className="min-w-0">
              <p className="text-white font-medium text-sm truncate">
                {req.employee?.first_name} {req.employee?.last_name}
              </p>
              <p className="text-[#666] text-xs">{req.employee?.employee_id}</p>
            </div>
          </div>
        </td>

        {/* Dept */}
        <td className={tdCls}>
          <span className="text-[#B3B3B3] text-xs bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
            {req.employee?.department_name || "—"}
          </span>
        </td>

        {/* Date */}
        <td className={tdCls}>
          <span className="text-white">{dateLabel}</span>
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

        {/* Balance */}
        <td className={tdCls}>
          <span className="text-[#B3B3B3] text-xs">
            {req.employee_balance?.paid_leave_balance ?? "—"} days
          </span>
        </td>

        {/* Status */}
        <td className={tdCls}>
          <StatusBadge status={req.status} />
        </td>

        {/* Actions */}
        <td className={`${tdCls} text-right`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            {req.status === "Pending" && (
              <>
                <button
                  data-testid={`reject-btn-${req.request_id}`}
                  onClick={() => onReview(req, "Rejected")}
                  className="p-1.5 rounded-lg text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors">
                  <XCircle size={15} />
                </button>
                <button
                  data-testid={`approve-btn-${req.request_id}`}
                  onClick={() => onReview(req, "Approved")}
                  className="p-1.5 rounded-lg text-green-400 border border-green-400/30 hover:bg-green-400/10 transition-colors">
                  <CheckCircle size={15} />
                </button>
              </>
            )}
            {open ? <ChevronUp size={14} className="text-[#666]" /> : <ChevronDown size={14} className="text-[#666]" />}
          </div>
        </td>
      </tr>

      {/* Expanded detail */}
      {open && (
        <tr className="bg-[#252525]" style={{ borderLeft: `3px solid ${accent}` }}>
          <td colSpan={7} className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Leave Type</p>
                <p className="text-white text-sm">{req.leave_type === "Half Day" ? `Half Day · ${req.half_day_type}` : "Full Day"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Date Range</p>
                <p className="text-white text-sm">{dateLabel}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Duration</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-white text-sm">{totalDays} day{totalDays !== 1 ? "s" : ""}</span>
                  {req.paid_days > 0 && <span className="text-[10px] bg-green-400/10 text-green-400 border border-green-400/20 px-1.5 py-0.5 rounded-full">{req.paid_days} paid</span>}
                  {req.regular_days > 0 && <span className="text-[10px] bg-white/5 text-[#B3B3B3] border border-white/10 px-1.5 py-0.5 rounded-full">{req.regular_days} unpaid</span>}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Leave Balance</p>
                <p className="text-white text-sm">{req.employee_balance?.paid_leave_balance ?? "—"} paid days remaining</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Requested At</p>
                <p className="text-[#B3B3B3] text-sm">{fmtDateTime(req.requested_at)}</p>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Reason</p>
                <p className="text-[#B3B3B3] text-sm">{req.reason || "—"}</p>
              </div>
            </div>

            {req.admin_notes && (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 border ${req.status === "Rejected" ? "bg-red-400/10 border-red-400/20" : "bg-green-400/10 border-green-400/20"}`}>
                {req.status === "Rejected"
                  ? <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                  : <CheckCircle size={13} className="text-green-400 mt-0.5 shrink-0" />}
                <div>
                  <p className={`text-[10px] uppercase tracking-wider mb-0.5 ${req.status === "Rejected" ? "text-red-400/70" : "text-green-400/70"}`}>Admin Note</p>
                  <p className={`text-sm ${req.status === "Rejected" ? "text-red-400" : "text-green-400"}`}>{req.admin_notes}</p>
                </div>
              </div>
            )}
            {(req.status === "Approved" || req.status === "Rejected") && req.reviewer_name && (
              <p className="text-[#555] text-xs mt-2">Reviewed by {req.reviewer_name} · {fmtDateTime(req.reviewed_at)}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function LeaveRequestTable({ requests, onReview }) {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
      <table className="w-full min-w-[760px] bg-[#2F2F2F]">
        <thead className="bg-[#191919] border-b border-white/10">
          <tr>
            <th className={thCls}>Employee</th>
            <th className={thCls}>Department</th>
            <th className={thCls}>Date</th>
            <th className={thCls}>Days</th>
            <th className={thCls}>Balance</th>
            <th className={thCls}>Status</th>
            <th className={`${thCls} text-right`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(req => (
            <LeaveRequestRow key={req.request_id} req={req} onReview={onReview} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────
// Review (Approve / Reject) Dialog
// ─────────────────────────────────────────────
function ReviewDialog({ request, action, onClose, onDone }) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isReject = action === "Rejected";

  const handleSubmit = async () => {
    if (isReject && !notes.trim()) {
      toast.error("Rejection note is required");
      return;
    }
    setSubmitting(true);
    try {
      await axios.put(
        `${API}/leave/requests/${request.request_id}/review`,
        { status: action, admin_notes: notes.trim() || null },
        { withCredentials: true }
      );
      toast.success(`Leave request ${action.toLowerCase()}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${action.toLowerCase()} request`);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-md w-[calc(100%-2rem)] rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            {isReject ? "Reject Leave Request" : "Approve Leave Request"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-[#191919] rounded-lg border border-white/10 px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <Avatar employee={request?.employee} size={28} />
              <span className="text-white font-medium">
                {request?.employee?.first_name} {request?.employee?.last_name}
              </span>
            </div>
            <p className="text-[#B3B3B3] text-xs">
              {request?.leave_type === "Half Day"
                ? `${fmtDate(request?.from_date)} (${request?.half_day_type})`
                : request?.from_date === request?.to_date
                  ? fmtDate(request?.from_date)
                  : `${fmtDate(request?.from_date)} – ${fmtDate(request?.to_date)}`}
              {" • "}{request?.total_days} day{request?.total_days !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {request?.paid_days > 0 && (
                <span className="text-xs bg-green-400/10 text-green-400 border border-green-400/20 px-2 py-0.5 rounded">
                  {request.paid_days} Paid
                </span>
              )}
              {request?.regular_days > 0 && (
                <span className="text-xs bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded">
                  {request.regular_days} Regular (Unpaid)
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className={labelCls}>
              {isReject ? "Reason for Rejection *" : "Admin Notes (optional)"}
            </Label>
            <Textarea
              data-testid="review-notes-input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={`${inputCls} min-h-[80px] resize-none`}
              placeholder={isReject ? "Explain why this request is being rejected..." : "Any notes for the employee..."}
              maxLength={500}
            />
            <p className="text-[#666] text-xs text-right">{notes.length}/500</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} data-testid="review-cancel-btn"
            className="flex-1 bg-transparent border-white/20 text-[#B3B3B3] hover:bg-white/5 min-h-[44px]">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid={`review-submit-${action.toLowerCase()}-btn`}
            className={`flex-1 min-h-[44px] text-white ${isReject ? "bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60" : "bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 hover:border-green-500/60"}`}>
            {submitting ? "Submitting..." : isReject ? "Reject" : "Approve"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Main Leave Requests Page (Admin)
// ─────────────────────────────────────────────
export default function LeaveRequestsPage() {
  const { user, myEmployee } = useAuth();
  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("Pending");
  const [search, setSearch] = useState("");
  const [reviewTarget, setReviewTarget] = useState(null); // { request, action }

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus && filterStatus !== "All" ? `?status=${filterStatus}` : "";
      const { data } = await axios.get(`${API}/leave/requests${params}`, { withCredentials: true });
      setRequests(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load requests");
      setRequests([]);
    } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { if (isAdminDept) fetchRequests(); }, [fetchRequests, isAdminDept]);

  const filtered = useMemo(() => {
    if (!search.trim()) return requests;
    const q = search.toLowerCase();
    return requests.filter(r => {
      const emp = r.employee;
      return (
        emp?.first_name?.toLowerCase().includes(q) ||
        emp?.last_name?.toLowerCase().includes(q) ||
        emp?.employee_id?.toLowerCase().includes(q) ||
        emp?.department_name?.toLowerCase().includes(q)
      );
    });
  }, [requests, search]);

  const counts = useMemo(() => {
    const c = { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 };
    requests.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
    return c;
  }, [requests]);

  if (!isAdminDept) {
    return (
      <div className="p-4 md:p-8">
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-10 text-center">
          <AlertCircle size={32} className="text-amber-400 mx-auto mb-2" />
          <p className="text-white font-medium">Admins only</p>
          <p className="text-[#B3B3B3] text-sm">This page is restricted to the Admin department.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8" data-testid="leave-requests-page">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Leave Requests</h1>
        <p className="text-[#B3B3B3] text-sm mt-0.5">Review and approve employee leave requests</p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1.5 flex-wrap mb-4" data-testid="leave-requests-filters">
        {[
          { key: "Pending", label: "Pending", count: counts.Pending },
          { key: "Approved", label: "Approved", count: counts.Approved },
          { key: "Rejected", label: "Rejected", count: counts.Rejected },
          { key: "Cancelled", label: "Cancelled", count: counts.Cancelled },
          { key: "All", label: "All", count: null },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            data-testid={`leave-filter-${key.toLowerCase()}`}
            onClick={() => setFilterStatus(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
              filterStatus === key ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:bg-white/5 hover:text-white"
            }`}>
            {label}
            {count !== null && filterStatus === key && (
              <span className="bg-white/10 text-white rounded px-1.5 text-[10px]">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B3B3B3]" />
        <Input
          data-testid="leave-requests-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, ID or department..."
          className={`${inputCls} pl-9 pr-8`}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B3B3B3] hover:text-white">
            <X size={14} />
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-28 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-10 text-center">
          <FileText size={28} className="text-[#B3B3B3] mx-auto mb-2" />
          <p className="text-[#B3B3B3]">
            {search ? "No requests match your search" : `No ${filterStatus !== "All" ? filterStatus.toLowerCase() : ""} leave requests`}
          </p>
        </div>
      ) : (
        <LeaveRequestTable
          requests={filtered}
          onReview={(req, action) => setReviewTarget({ request: req, action })}
        />
      )}

      {reviewTarget && (
        <ReviewDialog
          request={reviewTarget.request}
          action={reviewTarget.action}
          onClose={() => setReviewTarget(null)}
          onDone={() => { setReviewTarget(null); fetchRequests(); }}
        />
      )}
    </div>
  );
}
