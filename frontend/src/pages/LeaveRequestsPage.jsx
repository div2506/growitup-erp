import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, Hourglass, Ban, AlertCircle, FileText, Search, Filter, X
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
            className={`flex-1 min-h-[44px] text-white ${isReject ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}>
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
        <div className="space-y-3">
          {filtered.map(req => (
            <div key={req.request_id} data-testid={`leave-request-row-${req.request_id}`}
              className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                {/* Left: employee + request */}
                <div className="flex gap-3 flex-1 min-w-0">
                  <Avatar employee={req.employee} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-white font-medium text-sm truncate">
                        {req.employee?.first_name} {req.employee?.last_name}
                      </span>
                      <span className="text-[#666] text-xs">{req.employee?.employee_id}</span>
                      {req.employee?.department_name && (
                        <span className="text-[#B3B3B3] text-xs bg-white/5 px-2 py-0.5 rounded">{req.employee.department_name}</span>
                      )}
                      <StatusBadge status={req.status} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
                      <span className="text-white">
                        {req.leave_type === "Half Day"
                          ? `${fmtDate(req.from_date)} (${req.half_day_type})`
                          : req.from_date === req.to_date
                            ? fmtDate(req.from_date)
                            : `${fmtDate(req.from_date)} – ${fmtDate(req.to_date)}`}
                      </span>
                      <span className="text-[#B3B3B3] text-xs">
                        {req.total_days} day{req.total_days !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {req.paid_days > 0 && (
                        <span className="text-xs bg-green-400/10 text-green-400 border border-green-400/20 px-2 py-0.5 rounded">
                          {req.paid_days} Paid
                        </span>
                      )}
                      {req.regular_days > 0 && (
                        <span className="text-xs bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded">
                          {req.regular_days} Regular (Unpaid)
                        </span>
                      )}
                      {req.employee_balance && (
                        <span className="text-xs bg-white/5 text-[#B3B3B3] border border-white/10 px-2 py-0.5 rounded">
                          Balance: {req.employee_balance.paid_leave_balance || 0} paid
                        </span>
                      )}
                    </div>

                    <p className="text-[#B3B3B3] text-sm line-clamp-3">{req.reason}</p>

                    {req.status === "Rejected" && req.admin_notes && (
                      <div className="mt-2 flex items-start gap-1.5 bg-red-400/10 border border-red-400/20 rounded px-2.5 py-1.5">
                        <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                        <p className="text-red-400 text-xs">{req.admin_notes}</p>
                      </div>
                    )}
                    {req.status === "Approved" && req.admin_notes && (
                      <div className="mt-2 flex items-start gap-1.5 bg-green-400/10 border border-green-400/20 rounded px-2.5 py-1.5">
                        <CheckCircle size={12} className="text-green-400 mt-0.5 shrink-0" />
                        <p className="text-green-400 text-xs">{req.admin_notes}</p>
                      </div>
                    )}
                    {(req.status === "Approved" || req.status === "Rejected") && req.reviewer_name && (
                      <p className="text-[#666] text-xs mt-1">
                        Reviewed by {req.reviewer_name} • {fmtDateTime(req.reviewed_at)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex md:flex-col items-start md:items-end gap-2 shrink-0">
                  <span className="text-[#666] text-xs">Req: {fmtDateTime(req.requested_at)}</span>
                  {req.status === "Pending" && (
                    <div className="flex gap-2">
                      <button
                        data-testid={`reject-btn-${req.request_id}`}
                        onClick={() => setReviewTarget({ request: req, action: "Rejected" })}
                        className="px-3 py-1.5 text-xs text-red-400 border border-red-400/30 hover:bg-red-400/10 rounded-lg transition-colors inline-flex items-center gap-1">
                        <XCircle size={12} /> Reject
                      </button>
                      <button
                        data-testid={`approve-btn-${req.request_id}`}
                        onClick={() => setReviewTarget({ request: req, action: "Approved" })}
                        className="px-3 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors inline-flex items-center gap-1">
                        <CheckCircle size={12} /> Approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
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
