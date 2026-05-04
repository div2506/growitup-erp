import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Clock, Calendar, RefreshCw, X, ChevronDown, AlertCircle, CheckCircle, XCircle, Hourglass } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const inputCls = "bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] focus-visible:ring-white/20 focus-visible:border-white/30";
const labelCls = "text-[#B3B3B3] text-sm";

function formatTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDate(d) {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return d; }
}

function StatusBadge({ status }) {
  const map = {
    Pending: { cls: "bg-amber-400/10 text-amber-400 border-amber-400/20", icon: Hourglass },
    Approved: { cls: "bg-green-400/10 text-green-400 border-green-400/20", icon: CheckCircle },
    Rejected: { cls: "bg-red-400/10 text-red-400 border-red-400/20", icon: XCircle },
  };
  const { cls, icon: Icon } = map[status] || map.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
      <Icon size={11} />
      {status}
    </span>
  );
}

// Get today's date in YYYY-MM-DD format
function today() {
  return new Date().toISOString().split("T")[0];
}

export default function ShiftsPage() {
  const { myEmployee } = useAuth();
  const [currentShift, setCurrentShift] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingShift, setLoadingShift] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);

  // Form state
  const [form, setForm] = useState({
    requested_shift_id: "",
    from_date: "",
    to_date: "",
    reason: ""
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchCurrentShift = useCallback(async () => {
    if (!myEmployee?.employee_id) return;
    setLoadingShift(true);
    try {
      const { data } = await axios.get(`${API}/employee-shifts/${myEmployee.employee_id}`, { withCredentials: true });
      setCurrentShift(data);
    } catch {
      setCurrentShift(null);
    } finally { setLoadingShift(false); }
  }, [myEmployee?.employee_id]);

  const fetchShifts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/shifts`, { withCredentials: true });
      setShifts(data);
    } catch { setShifts([]); }
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const { data } = await axios.get(`${API}/shift-change-requests`, { withCredentials: true });
      setRequests(data);
    } catch {
      setRequests([]);
    } finally { setLoadingRequests(false); }
  }, []);

  useEffect(() => {
    fetchCurrentShift();
    fetchShifts();
    fetchRequests();
  }, [fetchCurrentShift, fetchShifts, fetchRequests]);

  const otherShifts = shifts.filter(s => s.shift_id !== currentShift?.shift_id);

  const validateForm = () => {
    const e = {};
    if (!form.requested_shift_id) e.requested_shift_id = "Please select a shift";
    if (!form.from_date) e.from_date = "From date is required";
    if (!form.to_date) e.to_date = "To date is required";
    if (form.from_date && form.from_date < today()) e.from_date = "Cannot select past dates";
    if (form.from_date && form.to_date && form.to_date < form.from_date) e.to_date = "To date must be on or after from date";
    if (!form.reason.trim()) e.reason = "Reason is required";
    if (form.reason.length > 500) e.reason = "Max 500 characters";
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmitRequest = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/shift-change-requests`, form, { withCredentials: true });
      toast.success("Shift change request submitted successfully!");
      setShowRequestForm(false);
      setForm({ requested_shift_id: "", from_date: "", to_date: "", reason: "" });
      setFormErrors({});
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit request");
    } finally { setSubmitting(false); }
  };

  const handleCancel = async (requestId) => {
    try {
      await axios.delete(`${API}/shift-change-requests/${requestId}`, { withCredentials: true });
      toast.success("Request cancelled");
      setCancelTarget(null);
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to cancel request");
    }
  };

  const shiftInfo = currentShift?.shift;

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>My Shift</h1>
        <p className="text-[#B3B3B3] text-sm mt-0.5">View your current work shift and manage shift change requests</p>
      </div>

      {/* Current Shift Card */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Clock size={16} className="text-blue-400" />
            </div>
            <h2 className="text-white font-semibold">Current Shift</h2>
          </div>
        </div>

        {loadingShift ? (
          <div className="h-20 bg-white/5 rounded-lg animate-pulse" />
        ) : shiftInfo ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[#B3B3B3] text-xs mb-1">Shift Name</p>
              <p className="text-white font-semibold">{shiftInfo.shift_name}</p>
              {shiftInfo.is_system_default && (
                <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded mt-1 inline-block">Default</span>
              )}
            </div>
            <div>
              <p className="text-[#B3B3B3] text-xs mb-1">Start Time</p>
              <p className="text-white font-semibold">{formatTime(shiftInfo.start_time)}</p>
            </div>
            <div>
              <p className="text-[#B3B3B3] text-xs mb-1">End Time</p>
              <p className="text-white font-semibold">{formatTime(shiftInfo.end_time)}</p>
            </div>
            <div>
              <p className="text-[#B3B3B3] text-xs mb-1">Hours / Break</p>
              <p className="text-white font-semibold">{shiftInfo.total_hours}h / {shiftInfo.break_duration}min</p>
            </div>
          </div>
        ) : (
          <p className="text-[#B3B3B3] text-sm">No shift assigned yet</p>
        )}
      </div>

      {/* Request Shift Change */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold">Shift Change Requests</h2>
        <button
          onClick={() => { setShowRequestForm(true); setForm({ requested_shift_id: "", from_date: "", to_date: "", reason: "" }); setFormErrors({}); }}
          className="flex items-center gap-2 bg-[#E53935] hover:bg-[#F44336] text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} /> Request Shift Change
        </button>
      </div>

      {/* Requests List */}
      {loadingRequests ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-10 text-center">
          <Calendar size={32} className="text-[#B3B3B3] mx-auto mb-3" />
          <p className="text-[#B3B3B3]">No shift change requests yet</p>
          <p className="text-[#666] text-sm mt-1">Submit a request above to temporarily change your work shift</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.request_id} className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <StatusBadge status={req.status} />
                    <span className="text-[#B3B3B3] text-xs">
                      {formatDate(req.from_date)} → {formatDate(req.to_date)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <span className="text-white text-sm">
                      <span className="text-[#B3B3B3]">Current: </span>
                      <span className="font-medium">{req.current_shift?.shift_name || "—"}</span>
                    </span>
                    <span className="text-[#B3B3B3]">→</span>
                    <span className="text-white text-sm">
                      <span className="text-[#B3B3B3]">Requested: </span>
                      <span className="font-medium text-blue-400">{req.requested_shift?.shift_name || "—"}</span>
                    </span>
                  </div>
                  <p className="text-[#B3B3B3] text-sm line-clamp-2">{req.reason}</p>
                  {req.status === "Rejected" && req.admin_notes && (
                    <div className="mt-2 flex items-start gap-2 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                      <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-red-400 text-xs">{req.admin_notes}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[#666] text-xs">{new Date(req.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  {req.status === "Pending" && (
                    <button
                      onClick={() => setCancelTarget(req.request_id)}
                      className="px-2.5 py-1.5 text-xs text-red-400 border border-red-400/30 hover:bg-red-400/10 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request Shift Change Modal */}
      <Dialog open={showRequestForm} onOpenChange={(o) => { if (!o) setShowRequestForm(false); }}>
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white w-full sm:max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] max-w-none sm:rounded-lg rounded-none p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/10 shrink-0">
            <DialogTitle className="text-white text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>
              Request Shift Change
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {/* Current Shift (read-only) */}
            <div>
              <Label className={labelCls}>Current Shift</Label>
              <div className="mt-1 px-3 py-2 bg-[#191919] border border-white/10 rounded-md text-[#B3B3B3] text-sm">
                {shiftInfo ? `${shiftInfo.shift_name} (${formatTime(shiftInfo.start_time)} – ${formatTime(shiftInfo.end_time)})` : "Not assigned"}
              </div>
            </div>

            {/* Requested Shift */}
            <div className="space-y-1">
              <Label className={labelCls}>Requested Shift *</Label>
              <Select value={form.requested_shift_id} onValueChange={v => { setForm(f => ({ ...f, requested_shift_id: v })); setFormErrors(e => ({ ...e, requested_shift_id: "" })); }}>
                <SelectTrigger className={`${inputCls} focus:ring-0`}>
                  <SelectValue placeholder="Select a shift" />
                </SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10">
                  {otherShifts.map(s => (
                    <SelectItem key={s.shift_id} value={s.shift_id} className="text-white focus:bg-white/10">
                      {s.shift_name} ({formatTime(s.start_time)} – {formatTime(s.end_time)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.requested_shift_id && <p className="text-red-400 text-xs">{formErrors.requested_shift_id}</p>}
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>From Date *</Label>
                <Input type="date" min={today()} value={form.from_date}
                  onChange={e => { setForm(f => ({ ...f, from_date: e.target.value })); setFormErrors(er => ({ ...er, from_date: "" })); }}
                  className={inputCls} />
                {formErrors.from_date && <p className="text-red-400 text-xs">{formErrors.from_date}</p>}
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>To Date *</Label>
                <Input type="date" min={form.from_date || today()} value={form.to_date}
                  onChange={e => { setForm(f => ({ ...f, to_date: e.target.value })); setFormErrors(er => ({ ...er, to_date: "" })); }}
                  className={inputCls} />
                {formErrors.to_date && <p className="text-red-400 text-xs">{formErrors.to_date}</p>}
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1">
              <Label className={labelCls}>Reason * <span className="text-[#666] text-xs">(max 500 chars)</span></Label>
              <Textarea
                value={form.reason}
                onChange={e => { setForm(f => ({ ...f, reason: e.target.value })); setFormErrors(er => ({ ...er, reason: "" })); }}
                className={`${inputCls} min-h-[100px] resize-none`}
                placeholder="Please explain why you need a shift change..."
                maxLength={500}
              />
              <div className="flex justify-between items-center">
                {formErrors.reason ? <p className="text-red-400 text-xs">{formErrors.reason}</p> : <span />}
                <p className="text-[#666] text-xs">{form.reason.length}/500</p>
              </div>
            </div>
          </div>
          <div className="px-5 py-4 border-t border-white/10 shrink-0 flex gap-3 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowRequestForm(false)}
              className="flex-1 bg-transparent border-white/20 text-[#B3B3B3] hover:bg-white/5 hover:text-white min-h-[44px]">
              Cancel
            </Button>
            <Button onClick={handleSubmitRequest} disabled={submitting}
              className="flex-1 bg-[#E53935] hover:bg-[#F44336] text-white min-h-[44px]">
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirm Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-sm w-[calc(100%-2rem)] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Cancel Request</DialogTitle>
          </DialogHeader>
          <p className="text-[#B3B3B3] text-sm">Are you sure you want to cancel this shift change request?</p>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}
              className="flex-1 bg-transparent border-white/20 text-[#B3B3B3] hover:bg-white/5 min-h-[44px]">
              Keep it
            </Button>
            <Button onClick={() => handleCancel(cancelTarget)}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white min-h-[44px]">
              Yes, Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
