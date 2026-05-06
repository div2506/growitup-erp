import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Calendar, Table2, ChevronLeft, ChevronRight, Users,
  Clock, AlertCircle, CheckCircle, XCircle, Pencil, X,
  TrendingDown, Hourglass, CloudOff, Home, Timer, IndianRupee
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────
const STATUS_CONFIG = {
  Present:           { label: "P",    bg: "bg-green-500/20",  text: "text-green-400",  border: "border-green-500/30",  dot: "bg-green-400"  },
  "Half Day":        { label: "HD",   bg: "bg-amber-500/20",  text: "text-amber-400",  border: "border-amber-500/30",  dot: "bg-amber-400"  },
  Absent:            { label: "A",    bg: "bg-red-500/20",    text: "text-red-400",    border: "border-red-500/30",    dot: "bg-red-400"    },
  Leave:             { label: "L",    bg: "bg-blue-500/20",   text: "text-blue-400",   border: "border-blue-500/30",   dot: "bg-blue-400"   },
  WFH:               { label: "WFH",  bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30", dot: "bg-purple-400" },
  Holiday:           { label: "HOL",  bg: "bg-white/5",       text: "text-[#B3B3B3]",  border: "border-white/10",      dot: "bg-[#B3B3B3]"  },
  Incomplete:        { label: "INC",  bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-400" },
  "Forgot Punch Out":{ label: "FPO",  bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-400" },
};
const VALID_STATUSES = ["Present", "Half Day", "Absent", "Leave", "WFH", "Incomplete", "Forgot Punch Out"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmt12(t) {
  if (!t) return "—";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${mStr} ${ampm}`;
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function fmtMonthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }

// ─────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────
function StatusBadge({ status, size = "sm" }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border} ${size === "lg" ? "text-sm px-3 py-1" : ""}`}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────
// Calendar Day Cell
// ─────────────────────────────────────────────
function DayCell({ date, record, isToday, isFuture, isHoliday, onClick }) {
  if (!date) return <div />;
  const isSun = date.getDay() === 0;
  // Holidays (Sundays + DB holidays) always show HOL styling regardless of record
  const cfg = (isSun || isHoliday)
    ? STATUS_CONFIG.Holiday
    : record ? STATUS_CONFIG[record.status] : null;
  const label = cfg ? cfg.label : (isFuture ? "" : "");

  return (
    <button
      onClick={() => !isFuture && onClick(date, record)}
      disabled={isFuture}
      className={`relative flex flex-col items-start p-1.5 md:p-2 rounded-lg border min-h-[58px] md:min-h-[76px] transition-all
        ${isFuture ? "opacity-30 cursor-default" : "hover:brightness-110 cursor-pointer"}
        ${isToday ? "ring-2 ring-blue-500/60" : ""}
        ${cfg ? `${cfg.bg} ${cfg.border}` : "bg-[#2A2A2A] border-white/8"}
      `}
    >
      <span className={`text-[11px] md:text-xs font-semibold ${isToday ? "text-blue-400" : "text-[#B3B3B3]"}`}>
        {date.getDate()}
      </span>
      {label && (
        <span className={`mt-0.5 text-[9px] md:text-[10px] font-bold leading-tight ${cfg?.text}`}>{label}</span>
      )}
      {/* Late / Early-departure indicators */}
      <div className="absolute top-1 right-1 flex flex-col gap-0.5 items-end">
        {record?.is_late && (
          <span className="w-2 h-2 rounded-full bg-red-400" title="Late arrival" />
        )}
        {record?.left_early && (
          <span className="w-2 h-2 rounded-full bg-orange-400" title="Left early" />
        )}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────
// Summary Cards
// ─────────────────────────────────────────────
function SummaryCards({ summary, lateTracking }) {
  const cards = [
    { label: "Present",    value: summary.present,    color: "text-green-400",   bg: "bg-green-400/10",  border: "border-green-400/20" },
    { label: "Half Day",   value: summary.half_day,   color: "text-amber-400",   bg: "bg-amber-400/10",  border: "border-amber-400/20" },
    { label: "Absent",     value: summary.absent,     color: "text-red-400",     bg: "bg-red-400/10",    border: "border-red-400/20"   },
    { label: "Leave",      value: summary.leave,      color: "text-blue-400",    bg: "bg-blue-400/10",   border: "border-blue-400/20"  },
    { label: "WFH",        value: summary.wfh,        color: "text-purple-400",  bg: "bg-purple-400/10", border: "border-purple-400/20"},
    { label: "Late Count", value: lateTracking?.late_count ?? summary.late_count, color: "text-orange-400",  bg: "bg-orange-400/10", border: "border-orange-400/20"},
  ];
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-5">
      {cards.map(c => (
        <div key={c.label} className={`rounded-xl border p-3 md:p-4 text-center ${c.bg} ${c.border}`}>
          <p className={`text-xl md:text-2xl font-bold ${c.color}`}>{c.value ?? 0}</p>
          <p className="text-[#B3B3B3] text-[10px] md:text-xs mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Date Detail Modal
// ─────────────────────────────────────────────
function DateDetailModal({ date, record, isAdmin, isHoliday, onClose, onEdit, isFuture }) {
  const navigate = useNavigate();
  if (!date) return null;
  const dateLabel = date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const cfg = record ? STATUS_CONFIG[record.status] : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-md w-[calc(100%-2rem)] rounded-xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10 flex-row items-center justify-between">
          <DialogTitle className="text-white text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
            {dateLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 py-5 space-y-4">
          {!record ? (
            <div className="text-center py-4">
              <CloudOff size={28} className="text-[#B3B3B3] mx-auto mb-2" />
              <p className="text-[#B3B3B3]">No attendance record for this date</p>
              {isAdmin && (
                <button onClick={onEdit} className="mt-3 px-4 py-2 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 rounded-lg text-sm font-medium">
                  Add Attendance
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[#B3B3B3] text-sm">Status</span>
                <StatusBadge status={record.status} size="lg" />
              </div>
              {record.check_in && (
                <div className="flex items-center justify-between">
                  <span className="text-[#B3B3B3] text-sm">Check-in</span>
                  <div className="text-right">
                    <span className="text-white font-medium">{fmt12(record.check_in)}</span>
                    {record.is_late && (
                      <p className="text-red-400 text-xs mt-0.5">Late by {record.late_minutes} min</p>
                    )}
                  </div>
                </div>
              )}
              {record.check_out && (
                <div className="flex items-center justify-between">
                  <span className="text-[#B3B3B3] text-sm">Check-out</span>
                  <div className="text-right">
                    <span className="text-white font-medium">{fmt12(record.check_out)}</span>
                    {record.left_early && (
                      <p className="text-orange-400 text-xs mt-0.5">Left early by {record.early_departure_minutes} min</p>
                    )}
                  </div>
                </div>
              )}
              {record.total_hours != null && record.total_hours > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[#B3B3B3] text-sm">Total Hours</span>
                  <span className="text-white font-medium">{record.total_hours}h</span>
                </div>
              )}
              {record.shift?.shift_name && (
                <div className="flex items-center justify-between">
                  <span className="text-[#B3B3B3] text-sm">Shift</span>
                  <span className="text-white text-sm">{record.shift.shift_name}</span>
                </div>
              )}
              {record.notes && (
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <p className="text-[#B3B3B3] text-xs mb-1">Notes</p>
                  <p className="text-white text-sm">{record.notes}</p>
                </div>
              )}
              {isHoliday ? (
                <div className="space-y-2">
                  <div className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/10 rounded-lg text-[#555] text-sm cursor-not-allowed select-none">
                    <span>🔒</span> Holiday — attendance cannot be edited
                  </div>
                  {!isFuture && (
                    <button
                      onClick={() => { onClose(); navigate("/overtime"); }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-400 text-sm font-medium transition-colors"
                    >
                      <Timer size={14} /> Log Overtime for this Holiday
                    </button>
                  )}
                </div>
              ) : isAdmin ? (
                <button onClick={onEdit}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[#B3B3B3] hover:text-white text-sm transition-colors">
                  <Pencil size={14} /> Edit Attendance
                </button>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Admin Edit Attendance Modal
// ─────────────────────────────────────────────
function EditAttendanceModal({ date, record, employeeId, onClose, onSaved }) {
  const inputCls = "bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] focus-visible:ring-white/20";
  const labelCls = "text-[#B3B3B3] text-sm";
  const [form, setForm] = useState({
    status: record?.status || "Present",
    check_in: record?.check_in || "",
    check_out: record?.check_out || "",
    notes: record?.notes || ""
  });
  const [saving, setSaving] = useState(false);

  const dateLabel = date?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const handleSave = async () => {
    setSaving(true);
    try {
      if (record?.attendance_id) {
        await axios.put(`${API}/attendance/${record.attendance_id}`, form, { withCredentials: true });
      } else {
        await axios.post(`${API}/attendance/manual`, {
          employee_id: employeeId,
          date: date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}` : undefined,
          ...form
        }, { withCredentials: true });
      }
      toast.success("Attendance updated");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-md w-[calc(100%-2rem)] rounded-xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10">
          <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Edit Attendance — {dateLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 py-5 space-y-4">
          <div className="space-y-1">
            <Label className={labelCls}>Status *</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className={`${inputCls} focus:ring-0`}><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#2F2F2F] border-white/10">
                {VALID_STATUSES.map(s => <SelectItem key={s} value={s} className="text-white focus:bg-white/10">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {["Present", "Half Day", "Incomplete", "Forgot Punch Out"].includes(form.status) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>Check-in</Label>
                <Input type="time" value={form.check_in} onChange={e => setForm(f => ({ ...f, check_in: e.target.value }))} className={inputCls} />
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Check-out</Label>
                <Input type="time" value={form.check_out} onChange={e => setForm(f => ({ ...f, check_out: e.target.value }))} className={inputCls} />
              </div>
            </div>
          )}
          {["Incomplete", "Forgot Punch Out"].includes(form.status) && (
            <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2.5">
              <span className="text-orange-400 text-xs mt-0.5">⚠</span>
              <p className="text-orange-400 text-xs">Employee forgot to punch out. Please set the correct check-out time and update status to <strong>Present</strong> or <strong>Half Day</strong>.</p>
            </div>
          )}
          <div className="space-y-1">
            <Label className={labelCls}>Notes (optional)</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} placeholder="Any additional notes..." />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent border-white/20 text-[#B3B3B3] hover:bg-white/5 min-h-[44px]">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 min-h-[44px]">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Calendar View
// ─────────────────────────────────────────────
function CalendarView({ attendanceMap, currentMonth, isAdmin, onDateClick, holidayDates = new Set() }) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div>
      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className={`text-center py-2 text-xs font-semibold ${d === "Sun" ? "text-red-400/70" : "text-[#B3B3B3]"}`}>{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;
          const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
          const record = attendanceMap[ds];
          const isToday = ds === today;
          const isFuture = ds > today;
          const isHoliday = holidayDates.has(ds);
          return (
            <DayCell key={ds} date={date} record={record} isToday={isToday} isFuture={isFuture}
              isHoliday={isHoliday}
              onClick={() => onDateClick(date, record)} />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 justify-center">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center border ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
            <span className="text-[#B3B3B3] text-xs">{status}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
          <span className="text-[#B3B3B3] text-xs">Late arrival</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
          <span className="text-[#B3B3B3] text-xs">Left early</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Table View
// ─────────────────────────────────────────────
function TableView({ records, isAdmin, onEdit }) {
  const [filterStatus, setFilterStatus] = useState("All");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const filtered = filterStatus === "All" ? records : records.filter(r => r.status === filterStatus);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const total = sorted.length;
  const paged = sorted.slice((page-1)*perPage, page*perPage);
  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {["All", ...VALID_STATUSES].map(s => (
            <button key={s} onClick={() => { setFilterStatus(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:bg-white/5 hover:text-white"}`}>
              {s}
            </button>
          ))}
        </div>
        <p className="text-[#B3B3B3] text-xs">{total} record{total !== 1 ? "s" : ""}</p>
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-[#191919] border-b border-white/10">
            <tr>
              {["Date","Day","Check-in","Check-out","Hours","Status","Flags"].map(h => (
                <th key={h} className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">{h}</th>
              ))}
              {isAdmin && <th className="py-3 px-4 w-16" />}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-[#B3B3B3]">No records</td></tr>
            ) : paged.map((rec, i) => {
              const dateObj = new Date(rec.date + "T00:00:00");
              const cfg = STATUS_CONFIG[rec.status];
              return (
                <tr key={rec.attendance_id || i} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${i % 2 === 0 ? "bg-[#2F2F2F]" : "bg-[#2F2F2F]/60"}`}>
                  <td className="py-3 px-4 text-white">{rec.date}</td>
                  <td className="py-3 px-4 text-[#B3B3B3]">{WEEKDAYS[dateObj.getDay()]}</td>
                  <td className="py-3 px-4 text-white">{fmt12(rec.check_in)}</td>
                  <td className="py-3 px-4 text-white">{fmt12(rec.check_out)}</td>
                  <td className="py-3 px-4 text-white">{rec.total_hours != null && rec.total_hours > 0 ? `${rec.total_hours}h` : "—"}</td>
                  <td className="py-3 px-4">
                    {cfg ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>{rec.status}</span>
                    ) : "—"}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      {rec.is_late && (
                        <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          Late {rec.late_minutes}m
                        </span>
                      )}
                      {rec.left_early && (
                        <span className="inline-flex items-center gap-1 text-orange-400 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                          Left early {rec.early_departure_minutes}m
                        </span>
                      )}
                      {rec.notes && <span className="text-[#B3B3B3] text-xs italic">{rec.notes}</span>}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="py-3 px-4">
                      {rec.status === "Holiday" ? (
                        <span className="p-1.5 text-[#333] cursor-not-allowed" title="Holiday — cannot edit">
                          <Pencil size={13} />
                        </span>
                      ) : (
                        <button onClick={() => onEdit(dateObj, rec)}
                          className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                          <Pencil size={13} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#B3B3B3] disabled:opacity-40 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[#B3B3B3] text-sm">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#B3B3B3] disabled:opacity-40 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Late Penalty Alert (compact + collapsible)
// ─────────────────────────────────────────────
function LatePenaltyAlert({ lateTracking }) {
  const [expanded, setExpanded] = useState(false);
  const hasPenalty = lateTracking.late_count >= 4;
  const penalties = lateTracking.penalties_applied || [];
  const totalDeduction = penalties.reduce((s, p) => s + (p.amount || 0), 0);

  const borderCls  = hasPenalty ? "border-red-500/20"    : "border-orange-500/20";
  const bgCls      = hasPenalty ? "bg-red-500/10"        : "bg-orange-500/10";
  const textCls    = hasPenalty ? "text-red-400"         : "text-orange-400";
  const mutedCls   = hasPenalty ? "text-red-400/60"      : "text-orange-400/60";
  const pillBg     = hasPenalty ? "bg-red-500/20"        : "bg-orange-500/20";

  return (
    <div className={`mb-5 rounded-xl border ${bgCls} ${borderCls}`}>
      {/* Header row — always visible */}
      <div className="flex items-center gap-3 px-4 py-3">
        <AlertCircle size={16} className={`${textCls} shrink-0`} />
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${textCls}`}>
            {hasPenalty
              ? `⚠️ ${lateTracking.late_count} late arrivals this month — Penalty applied`
              : `⚠️ ${lateTracking.late_count} late arrivals — Next late will trigger a penalty`}
          </span>
        </div>
        {/* Summary pills */}
        <div className="flex items-center gap-2 shrink-0">
          {penalties.length > 0 && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pillBg} ${textCls}`}>
              {penalties.length} penalty{penalties.length !== 1 ? "s" : ""}
            </span>
          )}
          {totalDeduction > 0 && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pillBg} ${textCls}`}>
              ₹{totalDeduction.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          )}
          {penalties.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className={`text-xs ${mutedCls} hover:${textCls} flex items-center gap-1 transition-colors`}
            >
              {expanded ? "Hide" : "Details"}
              <ChevronRight size={12} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible breakdown */}
      {expanded && penalties.length > 0 && (
        <div className={`border-t ${borderCls} px-4 py-3`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {penalties.map((p, i) => (
              <div key={i} className={`flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg ${pillBg}`}>
                <span className={mutedCls}>{p.description?.split(":")[0]}</span>
                <span className={`${textCls} font-medium`}>
                  {p.amount ? `₹${Number(p.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : p.description?.split(": ")[1] || ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// All Employees Summary (Admin bulk view)
// ─────────────────────────────────────────────
function AllEmployeesSummary({ month, onSelectEmployee }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows } = await axios.get(`${API}/attendance/all-employees-summary?month=${month}`, { withCredentials: true });
      setData(rows);
    } catch { toast.error("Failed to load summary"); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = data.filter(e =>
    `${e.first_name} ${e.last_name} ${e.employee_id}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-[#191919] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-[#B3B3B3] outline-none focus:border-white/30"
          placeholder="Search employee..." />
        <span className="text-[#B3B3B3] text-xs">{filtered.length} employees</span>
      </div>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead className="bg-[#191919] border-b border-white/10">
              <tr>
                {["Employee","Dept","Present","Half Day","Absent","Late"].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={e.employee_id} onClick={() => onSelectEmployee(e.employee_id)}
                  className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${i%2===0 ? "bg-[#2F2F2F]" : "bg-[#2F2F2F]/60"}`}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {e.profile_picture ? (
                        <img src={e.profile_picture} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs text-white font-bold">
                          {e.first_name?.[0]}
                        </div>
                      )}
                      <div>
                        <p className="text-white text-xs font-medium">{e.first_name} {e.last_name}</p>
                        <p className="text-[#666] text-[10px]">{e.employee_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[#B3B3B3] text-xs">{e.department_name || "—"}</td>
                  <td className="py-3 px-4 text-green-400 font-semibold">{e.present}</td>
                  <td className="py-3 px-4 text-amber-400 font-semibold">{e.half_day}</td>
                  <td className="py-3 px-4 text-red-400 font-semibold">{e.absent}</td>
                  <td className="py-3 px-4 text-orange-400 font-semibold">{e.late_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function AttendancePage() {
  const { user, myEmployee } = useAuth();
  const isAdmin = user?.is_admin || myEmployee?.department_name === "Admin";

  const [currentMonth, setCurrentMonth] = useState(() => monthStart(new Date()));
  // Initialize directly from myEmployee — ProtectedRoute guarantees myEmployee is ready
  const [selectedEmployee, setSelectedEmployee] = useState(() => myEmployee?.employee_id || null);

  const [viewMode, setViewMode] = useState("calendar");  // "calendar" | "table" | "all"
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [summary, setSummary] = useState({ present:0,half_day:0,absent:0,leave:0,wfh:0,holiday:0,late_count:0,total_hours:0 });
  const [lateTracking, setLateTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [holidayDates, setHolidayDates] = useState(new Set()); // "YYYY-MM-DD" strings
  const [allEmployees, setAllEmployees] = useState([]);
  const allEmployeesRef = useRef([]);

  // Modal state
  const [detailModal, setDetailModal] = useState(null);  // { date, record }
  const [editModal, setEditModal] = useState(null);      // { date, record }

  const targetEmployee = selectedEmployee || myEmployee?.employee_id || null;
  const monthKey = fmtMonthKey(currentMonth);

  const fetchAttendance = useCallback(async (empIdOverride) => {
    const empId = empIdOverride || targetEmployee || allEmployeesRef.current[0]?.employee_id || null;
    if (!empId) { setLoading(false); return; }
    setLoading(true);
    try {
      const year = monthKey.split("-")[0];
      const [dailyRes, summaryRes, holidayRes] = await Promise.all([
        axios.get(`${API}/attendance/daily?employee_id=${empId}&month=${monthKey}`, { withCredentials: true }),
        axios.get(`${API}/attendance/summary?employee_id=${empId}&month=${monthKey}`, { withCredentials: true }),
        axios.get(`${API}/holidays?year=${year}`, { withCredentials: true }),
      ]);
      setAttendanceRecords(dailyRes.data);
      setSummary(summaryRes.data.summary || {});
      setLateTracking(summaryRes.data.late_tracking || null);
      setHolidayDates(new Set((holidayRes.data || []).map(h => h.date)));
    } catch { toast.error("Failed to load attendance"); }
    finally { setLoading(false); }
  }, [targetEmployee, monthKey]);

  // Load employees list (admin only) and attendance in parallel — single effect, no double-fetch
  useEffect(() => {
    if (isAdmin) {
      // Fetch employees + attendance in parallel
      const empFetch = axios.get(`${API}/employees`, { withCredentials: true })
        .then(res => {
          allEmployeesRef.current = res.data;
          setAllEmployees(res.data);
          // Super admin (no myEmployee): select first employee if nothing selected yet
          if (!myEmployee?.employee_id && !selectedEmployee && res.data.length > 0) {
            setSelectedEmployee(res.data[0].employee_id);
            // fetchAttendance will re-run via targetEmployee change
          }
        })
        .catch(() => {});
      // Attendance fetch runs immediately with whatever targetEmployee we have
      fetchAttendance();
      return;
    }
    // Non-admin: just fetch attendance directly
    fetchAttendance();
  // Only re-run when month or selected employee changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetEmployee, monthKey, isAdmin]);

  // Map records by date for calendar
  const attendanceMap = attendanceRecords.reduce((acc, rec) => {
    acc[rec.date] = rec;
    return acc;
  }, {});

  const prevMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => {
    const n = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    if (n <= monthStart(new Date())) setCurrentMonth(n);
  };
  const isNextDisabled = currentMonth >= monthStart(new Date());

  const monthLabel = `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  const selectedEmployeeObj = allEmployees.find(e => e.employee_id === selectedEmployee);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Attendance</h1>
            <p className="text-[#B3B3B3] text-sm mt-0.5">
              {isAdmin ? "Track employee attendance and manage records" : "View your attendance history"}
            </p>
          </div>

          {/* View Toggle (admin gets "All Employees" option) */}
          <div className="flex gap-1 bg-[#2F2F2F] rounded-lg p-1 border border-white/10 self-start sm:self-auto">
            <button onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === "calendar" ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:text-white"}`}>
              <Calendar size={13} /> Calendar
            </button>
            <button onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === "table" ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:text-white"}`}>
              <Table2 size={13} /> Table
            </button>
            {isAdmin && (
              <button onClick={() => setViewMode("all")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === "all" ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:text-white"}`}>
                <Users size={13} /> All
              </button>
            )}
          </div>
        </div>

        {/* Month Nav + Employee Selector Row */}
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="flex items-center gap-2 bg-[#2F2F2F] border border-white/10 rounded-lg px-2 py-1">
            <button onClick={prevMonth} className="p-1.5 hover:bg-white/10 rounded text-[#B3B3B3] hover:text-white transition-colors"><ChevronLeft size={15} /></button>
            <span className="text-white text-sm font-medium px-2 min-w-[110px] md:min-w-[130px] text-center">{monthLabel}</span>
            <button onClick={nextMonth} disabled={isNextDisabled}
              className="p-1.5 hover:bg-white/10 rounded text-[#B3B3B3] hover:text-white disabled:opacity-30 transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>

          {isAdmin && viewMode !== "all" && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {allEmployees.length === 0 ? (
                // Employees still loading — show skeleton so user knows it's coming
                <div className="bg-[#2F2F2F] border border-white/10 rounded-lg px-3 py-2 w-full sm:min-w-[200px] flex items-center gap-2 animate-pulse">
                  <div className="h-3 bg-white/10 rounded w-32" />
                  <div className="ml-auto h-3 w-3 bg-white/10 rounded" />
                </div>
              ) : (
                <Select
                  value={selectedEmployee || myEmployee?.employee_id || ""}
                  onValueChange={v => setSelectedEmployee(v)}
                >
                  <SelectTrigger className="bg-[#2F2F2F] border-white/10 text-white w-full sm:min-w-[200px] focus:ring-0">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-60">
                    {/* My own entry at the top labelled "My Attendance", rest below */}
                    {myEmployee?.employee_id && (
                      <SelectItem value={myEmployee.employee_id} className="text-white focus:bg-white/10">
                        My Attendance
                      </SelectItem>
                    )}
                    {allEmployees
                      .filter(e => e.employee_id !== myEmployee?.employee_id)
                      .map(e => (
                        <SelectItem key={e.employee_id} value={e.employee_id} className="text-white focus:bg-white/10">
                          {e.first_name} {e.last_name} ({e.employee_id})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {selectedEmployeeObj && (
            <div className="flex items-center gap-2">
              {selectedEmployeeObj.profile_picture ? (
                <img src={selectedEmployeeObj.profile_picture} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs text-white font-bold">
                  {selectedEmployeeObj.first_name[0]}
                </div>
              )}
              <span className="text-white text-sm">{selectedEmployeeObj.first_name} {selectedEmployeeObj.last_name}</span>
            </div>
          )}
        </div>
      </div>

      {/* All Employees View */}
      {viewMode === "all" && isAdmin ? (
        <AllEmployeesSummary month={monthKey} onSelectEmployee={id => { setSelectedEmployee(id); setViewMode("calendar"); }} />
      ) : loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : (
        <>
          {/* Summary Cards */}
          <SummaryCards summary={summary} lateTracking={lateTracking} />

          {/* Late Penalty Alert */}
          {lateTracking && lateTracking.late_count >= 3 && (
            <LatePenaltyAlert lateTracking={lateTracking} />
          )}

          {/* Calendar / Table */}
          <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 md:p-5">
            {viewMode === "calendar" ? (
              <CalendarView
                attendanceMap={attendanceMap}
                currentMonth={currentMonth}
                isAdmin={isAdmin}
                holidayDates={holidayDates}
                onDateClick={(date, record) => {
                  const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
                  const today = new Date(); today.setHours(0,0,0,0);
                  setDetailModal({ date, record, isHoliday: record?.status === "Holiday" || holidayDates.has(ds), isFuture: date > today });
                }}
              />
            ) : (
              <TableView
                records={attendanceRecords}
                isAdmin={isAdmin}
                onEdit={(date, record) => {
                  const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
                  setEditModal({ date, record, isHoliday: record?.status === "Holiday" || holidayDates.has(ds) });
                }}
              />
            )}
          </div>
        </>
      )}

      {/* Date Detail Modal */}
      {detailModal && (
        <DateDetailModal
          date={detailModal.date}
          record={detailModal.record}
          isAdmin={isAdmin}
          isHoliday={detailModal.isHoliday}
          isFuture={detailModal.isFuture}
          onClose={() => setDetailModal(null)}
          onEdit={() => { setEditModal(detailModal); setDetailModal(null); }}
        />
      )}

      {/* Edit Attendance Modal — never open on holidays */}
      {editModal && !editModal.isHoliday && (
        <EditAttendanceModal
          date={editModal.date}
          record={editModal.record}
          employeeId={targetEmployee}
          onClose={() => setEditModal(null)}
          onSaved={() => { fetchAttendance(); }}
        />
      )}
    </div>
  );
}
