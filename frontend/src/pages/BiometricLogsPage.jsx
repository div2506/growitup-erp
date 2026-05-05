import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { RefreshCw, Fingerprint, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CFG = {
  recorded:  { label: "Recorded",  bg: "bg-green-500/10",  text: "text-green-400",  border: "border-green-500/20"  },
  duplicate: { label: "Duplicate", bg: "bg-amber-500/10",  text: "text-amber-400",  border: "border-amber-500/20"  },
  skipped:   { label: "Skipped",   bg: "bg-blue-500/10",   text: "text-blue-400",   border: "border-blue-500/20"   },
  error:     { label: "Error",     bg: "bg-red-500/10",    text: "text-red-400",    border: "border-red-500/20"    },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, bg: "bg-white/5", text: "text-[#B3B3B3]", border: "border-white/10" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

function fmt(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ts; }
}

function fmt12(t) {
  if (!t) return "—";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${mStr} ${ampm}`;
}

// ── Call-level row with expandable detail ─────────────────────────────────────
function CallRow({ call }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  const hasError = call.error > 0;
  const allOk = call.error === 0 && call.skipped === 0;
  const statusColor = hasError ? "text-red-400" : allOk ? "text-green-400" : "text-amber-400";
  const statusLabel = hasError ? "Has Errors" : allOk ? "Success" : "Partial";
  const statusBg = hasError ? "bg-red-500/10 border-red-500/20" : allOk ? "bg-green-500/10 border-green-500/20" : "bg-amber-500/10 border-amber-500/20";

  const toggle = async () => {
    if (!expanded && !detail) {
      setLoading(true);
      try {
        const { data } = await axios.get(`${API}/attendance/biometric-calls/${call.call_id}`, { withCredentials: true });
        setDetail(data.logs || []);
      } catch {
        setDetail([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(e => !e);
  };

  return (
    <>
      <tr
        onClick={toggle}
        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown size={13} className="text-[#B3B3B3] shrink-0" /> : <ChevronRight size={13} className="text-[#B3B3B3] shrink-0" />}
            <div>
              <p className="text-white text-xs font-medium">{fmt(call.called_at)}</p>
              <p className="text-[#555] text-[10px] font-mono mt-0.5">{call.call_id}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="text-[10px] font-medium text-[#B3B3B3] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full capitalize">
            {call.call_type || "single"}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-[10px] font-medium text-[#B3B3B3] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
            {call.source || "—"}
          </span>
        </td>
        <td className="px-4 py-3 text-white text-sm font-semibold">{call.total}</td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {call.recorded  > 0 && <span className="text-[10px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">+{call.recorded} recorded</span>}
            {call.duplicate > 0 && <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">{call.duplicate} dup</span>}
            {call.skipped   > 0 && <span className="text-[10px] font-semibold text-blue-400  bg-blue-500/10  border border-blue-500/20  px-1.5 py-0.5 rounded-full">{call.skipped} skipped</span>}
            {call.error     > 0 && <span className="text-[10px] font-semibold text-red-400   bg-red-500/10   border border-red-500/20   px-1.5 py-0.5 rounded-full">{call.error} error</span>}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBg} ${statusColor}`}>
            {statusLabel}
          </span>
        </td>
      </tr>

      {/* Expanded detail rows */}
      {expanded && (
        <tr className="border-b border-white/5">
          <td colSpan={6} className="px-0 py-0">
            <div className="bg-[#191919] border-t border-white/5">
              {loading ? (
                <div className="flex items-center gap-2 px-8 py-4">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <p className="text-[#B3B3B3] text-xs">Loading entries…</p>
                </div>
              ) : !detail || detail.length === 0 ? (
                <p className="text-[#B3B3B3] text-xs px-8 py-4">No entries found for this call.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
                      {["Employee", "Biometric Code", "Punch Time", "Status", "Message"].map(h => (
                        <th key={h} className="px-6 py-2 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map(log => (
                      <tr key={log.log_id} className="border-b border-white/5 hover:bg-white/3">
                        <td className="px-6 py-2">
                          {log.employee_name ? (
                            <div>
                              <p className="text-white text-xs font-medium">{log.employee_name}</p>
                              <p className="text-[#555] text-[10px]">{log.resolved_employee_id || "—"}</p>
                            </div>
                          ) : (
                            <span className="text-[#555] text-xs">{log.employee_id_input || "—"}</span>
                          )}
                        </td>
                        <td className="px-6 py-2 text-xs font-mono text-[#B3B3B3]">{log.biometric_employee_code || "—"}</td>
                        <td className="px-6 py-2 text-xs text-white whitespace-nowrap">
                          {log.punch_date ? `${log.punch_date} ${fmt12(log.punch_time?.split("T")[1]?.slice(0,5))}` : "—"}
                        </td>
                        <td className="px-6 py-2"><StatusBadge status={log.status} /></td>
                        <td className="px-6 py-2 text-xs text-[#B3B3B3] max-w-[200px] truncate" title={log.message}>{log.message || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BiometricLogsPage() {
  const [calls, setCalls] = useState([]);
  const [summary, setSummary] = useState({ recorded: 0, duplicate: 0, skipped: 0, error: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate) params.date = filterDate;
      const { data } = await axios.get(`${API}/attendance/biometric-calls`, { params, withCredentials: true });
      setCalls(data.calls || []);
      setSummary(data.summary || { recorded: 0, duplicate: 0, skipped: 0, error: 0, total: 0 });
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [filterDate]);

  useEffect(() => { load(); }, [load]);

  const summaryCards = [
    { label: "Total Punches", value: summary.total,     color: "text-white",       bg: "bg-white/5",        border: "border-white/10"        },
    { label: "Recorded",      value: summary.recorded,  color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20"    },
    { label: "Duplicate",     value: summary.duplicate, color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"    },
    { label: "Skipped",       value: summary.skipped,   color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20"     },
    { label: "Errors",        value: summary.error,     color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20"      },
  ];

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Fingerprint size={18} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-base md:text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Biometric API Logs</h2>
            <p className="text-[#B3B3B3] text-xs mt-0.5">Each row = one API call. Click to see individual punches.</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm hover:bg-white/10 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {summaryCards.map(c => (
          <div key={c.label} className={`rounded-xl border p-3 text-center ${c.bg} ${c.border}`}>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[#B3B3B3] text-xs mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Date Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="bg-[#2F2F2F] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-white/30"
        />
        <span className="text-[#B3B3B3] text-xs ml-auto">{calls.length} call{calls.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Calls Table */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-[#B3B3B3] text-sm">Loading…</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Fingerprint size={32} className="text-[#B3B3B3] mb-3 opacity-40" />
            <p className="text-white font-medium text-sm">No API calls found</p>
            <p className="text-[#B3B3B3] text-xs mt-1">No biometric API calls recorded for the selected date</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10">
                  {["Called At", "Type", "Source", "Total", "Breakdown", "Status"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-[#B3B3B3] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calls.map(call => (
                  <CallRow key={call.call_id} call={call} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
