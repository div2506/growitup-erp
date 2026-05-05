import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { RefreshCw, CheckCircle, SkipForward, Copy2, AlertCircle, Clock, Fingerprint } from "lucide-react";

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

export default function BiometricLogsPage() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ recorded: 0, duplicate: 0, skipped: 0, error: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate) params.date = filterDate;
      if (filterStatus !== "all") params.status = filterStatus;
      const { data } = await axios.get(`${API}/attendance/biometric-logs`, { params, withCredentials: true });
      setLogs(data.logs || []);
      setSummary(data.summary || { recorded: 0, duplicate: 0, skipped: 0, error: 0, total: 0 });
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const summaryCards = [
    { label: "Total Calls", value: summary.total, color: "text-white", bg: "bg-white/5", border: "border-white/10" },
    { label: "Recorded", value: summary.recorded, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
    { label: "Duplicate", value: summary.duplicate, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    { label: "Skipped", value: summary.skipped, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
    { label: "Errors", value: summary.error, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
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
            <p className="text-[#B3B3B3] text-xs mt-0.5">Every punch received from biometric devices</p>
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="bg-[#2F2F2F] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-white/30"
        />
        <div className="flex items-center gap-1 bg-[#2F2F2F] border border-white/10 rounded-lg p-1">
          {["all", "recorded", "duplicate", "skipped", "error"].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                filterStatus === s ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:text-white"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
        <span className="text-[#B3B3B3] text-xs ml-auto">{logs.length} records</span>
      </div>

      {/* Logs Table */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-[#B3B3B3] text-sm">Loading logs…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Fingerprint size={32} className="text-[#B3B3B3] mb-3 opacity-40" />
            <p className="text-white font-medium text-sm">No logs found</p>
            <p className="text-[#B3B3B3] text-xs mt-1">No biometric API calls recorded for the selected filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10">
                  {["Time", "Employee", "Biometric Code", "Punch Time", "Source", "Status", "Message"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-[#B3B3B3] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map(log => (
                  <tr key={log.log_id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 text-xs text-[#B3B3B3] whitespace-nowrap">
                      {fmt(log.called_at)}
                    </td>
                    <td className="px-4 py-3">
                      {log.employee_name ? (
                        <div>
                          <p className="text-white text-xs font-medium">{log.employee_name}</p>
                          <p className="text-[#B3B3B3] text-[10px]">{log.resolved_employee_id || "—"}</p>
                        </div>
                      ) : (
                        <span className="text-[#555] text-xs">{log.employee_id_input || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-[#B3B3B3]">
                      {log.biometric_employee_code || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-white whitespace-nowrap">
                      {log.punch_date ? `${log.punch_date} ${fmt12(log.punch_time?.split("T")[1]?.slice(0,5))}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-medium text-[#B3B3B3] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                        {log.source || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[#B3B3B3] max-w-[200px] truncate" title={log.message}>
                      {log.message || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
