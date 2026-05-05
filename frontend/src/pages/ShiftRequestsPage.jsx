import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, Hourglass, Ban, Search, RefreshCw,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const inputCls = "bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] focus-visible:ring-white/20";
const labelCls = "text-[#B3B3B3] text-sm";

const STATUS_CONFIG = {
  Pending:  { cls: "bg-amber-400/10 text-amber-400 border-amber-400/20",  icon: Hourglass },
  Approved: { cls: "bg-green-400/10 text-green-400 border-green-400/20",  icon: CheckCircle },
  Rejected: { cls: "bg-red-400/10 text-red-400 border-red-400/20",        icon: XCircle },
  Cancelled:{ cls: "bg-white/5 text-[#B3B3B3] border-white/10",           icon: Ban },
};

function StatusBadge({ status }) {
  const { cls, icon: Icon } = STATUS_CONFIG[status] || STATUS_CONFIG.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
      <Icon size={11} /> {status}
    </span>
  );
}

function Avatar({ employee, size = 40 }) {
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
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}

function fmtDateTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// ── Review Dialog ─────────────────────────────────────────────────────────────
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
        `${API}/shift-change-requests/${request.request_id}/review`,
        { status: action, admin_notes: notes.trim() || null },
        { withCredentials: true }
      );
      toast.success(`Shift request ${action.toLowerCase()}`);
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
            {isReject ? "Reject Shift Request" : "Approve Shift Request"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-[#191919] rounded-lg border border-white/10 px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <Avatar employee={request?.employee} size={28} />
              <span className="text-white font-medium">{request?.employee?.first_name} {request?.employee?.last_name}</span>
              <span className="text-[#666] text-xs">{request?.employee?.employee_id}</span>
            </div>
            <p className="text-[#B3B3B3]">
              {request?.current_shift_name} → <span className="text-blue-400">{request?.requested_shift_name}</span>
            </p>
          </div>

          <div className="space-y-1">
            <Label className={labelCls}>{isReject ? "Rejection Reason *" : "Notes (optional)"}</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isReject ? "Please provide a reason for rejecting..." : "Optional approval notes..."}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ShiftRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [monthFilter, setMonthFilter] = useState("");
  const [search, setSearch] = useState("");
  const [reviewDialog, setReviewDialog] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== "All") params.status = statusFilter;
      const res = await axios.get(`${API}/shift-change-requests`, { params, withCredentials: true });
      setRequests(res.data);
    } catch {
      toast.error("Failed to load shift requests");
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const STATUS_TABS = ["Pending", "Approved", "Rejected", "All"];

  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    monthOptions.push(d.toISOString().slice(0, 7));
  }

  const filtered = requests.filter(r => {
    if (monthFilter && !r.requested_at?.startsWith(monthFilter)) return false;
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
            Shift Requests
          </h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">
            {pending.length > 0
              ? <span className="text-amber-400">{pending.length} pending review</span>
              : "All requests reviewed"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 mb-4">
        <div className="px-4 pt-4 pb-3 border-b border-white/10">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {STATUS_TABS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === s ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:text-white hover:bg-white/5"
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
            <RefreshCw size={40} className="text-white/20 mx-auto mb-3" />
            <p className="text-[#B3B3B3] text-sm">No shift requests found</p>
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
                <StatusBadge status={r.status} />
              </div>

              {/* Details */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#191919] rounded-lg border border-white/10 px-3 py-2.5">
                  <p className="text-[#B3B3B3] text-xs mb-0.5">Current Shift</p>
                  <p className="text-white text-sm font-medium">{r.current_shift_name || r.current_shift?.shift_name || "—"}</p>
                </div>
                <div className="bg-[#191919] rounded-lg border border-white/10 px-3 py-2.5">
                  <p className="text-[#B3B3B3] text-xs mb-0.5">Requested Shift</p>
                  <p className="text-blue-400 text-sm font-medium">{r.requested_shift_name || r.requested_shift?.shift_name || "—"}</p>
                </div>
              </div>

              {/* Reason */}
              <div className="mt-3 bg-[#191919] rounded-lg border border-white/10 px-3 py-2.5">
                <p className="text-[#B3B3B3] text-xs mb-1">Reason</p>
                <p className="text-white text-sm">{r.reason}</p>
              </div>

              {/* Admin notes */}
              {r.admin_notes && (
                <div className="mt-2 px-3 py-2 bg-[#191919] rounded-lg border border-white/10">
                  <p className="text-[#B3B3B3] text-xs italic">Note: {r.admin_notes}</p>
                </div>
              )}

              <p className="text-[#666] text-xs mt-2">Requested {fmtDateTime(r.requested_at)}</p>

              {/* Actions */}
              {r.status === "Pending" && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
                  <Button
                    onClick={() => setReviewDialog({ request: r, action: "Approved" })}
                    size="sm"
                    className="bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 hover:border-green-500/60 text-xs h-8"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => setReviewDialog({ request: r, action: "Rejected" })}
                    size="sm"
                    className="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 text-xs h-8"
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {reviewDialog && (
        <ReviewDialog
          request={reviewDialog.request}
          action={reviewDialog.action}
          onClose={() => setReviewDialog(null)}
          onDone={() => { setReviewDialog(null); fetchRequests(); }}
        />
      )}
    </div>
  );
}
