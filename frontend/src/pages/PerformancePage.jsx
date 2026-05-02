import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronRight, ChevronLeft, ExternalLink, Users, User, BarChart2,
  Search, Calendar, Pencil, Trash2, TrendingUp, Trophy
} from "lucide-react";
import DeleteConfirm from "@/components/DeleteConfirm";
import UpgradeLevelModal from "@/components/UpgradeLevelModal";
import CreativeTeamOfMonth from "@/components/CreativeTeamOfMonth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ITEMS_PER_PAGE = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

// ── UI Atoms ─────────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className="text-[#B3B3B3] text-xs">—</span>;
  const n = parseFloat(score);
  const cls = n >= 7 ? "text-green-400 bg-green-400/10" : n >= 5 ? "text-amber-400 bg-amber-400/10" : "text-red-400 bg-red-400/10";
  return <span className={`inline-flex items-center justify-center w-10 h-7 rounded-lg font-bold text-sm ${cls}`}>{n.toFixed(1)}</span>;
}

function DeadlineBadge({ status }) {
  if (!status || status === "No Date") return <span className="text-[#B3B3B3] text-xs">No Date</span>;
  const ok = status === "On Time";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ok ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"}`}>
      {ok ? "On Time" : status.replace("Missed Deadline ", "Late ")}
    </span>
  );
}

function StarRating({ value }) {
  if (value === null || value === undefined) return <span className="text-[#B3B3B3] text-xs">—</span>;
  const n = Math.min(5, Math.max(0, parseInt(value)));
  return <span className="text-amber-400 text-sm">{"⭐".repeat(n)}<span className="text-[#B3B3B3] text-xs ml-1">({value}/5)</span></span>;
}

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, accent }) {
  const accentCls = accent === "green" ? "text-green-400" : accent === "amber" ? "text-amber-400" : accent === "red" ? "text-red-400" : "text-white";
  return (
    <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 flex flex-col gap-1">
      <p className="text-[#B3B3B3] text-xs">{label}</p>
      <p className={`text-xl font-bold ${accentCls}`} data-testid="metric-value">{value}</p>
    </div>
  );
}

function scoreAccent(pct) { return pct === "—" ? "default" : parseFloat(pct) >= 70 ? "green" : parseFloat(pct) >= 50 ? "amber" : "red"; }
function perfAccent(v) { return v === "—" ? "default" : parseFloat(v) >= 7 ? "green" : parseFloat(v) >= 5 ? "amber" : "red"; }
function qualAccent10(v) { return v === "—" ? "default" : parseFloat(v) >= 7 ? "green" : parseFloat(v) >= 5 ? "amber" : "red"; }
function qualAccent5(v) { return v === "—" ? "default" : parseFloat(v) >= 3.5 ? "green" : parseFloat(v) >= 2.5 ? "amber" : "red"; }

function MetricsSection({ records, dbType }) {
  const total = records.length;
  if (total === 0) return null;

  const onTime = records.filter(r => r.deadline_status === "On Time").length;
  const dlScore = total > 0 ? ((onTime / total) * 100).toFixed(1) + "%" : "—";
  const dlAccent = total > 0 ? scoreAccent(dlScore) : "default";

  const withScore = records.filter(r => r.performance_score != null);
  const avgPerf = withScore.length > 0
    ? (withScore.reduce((s, r) => s + r.performance_score, 0) / withScore.length).toFixed(2) + "/10"
    : "—";

  let row1 = [], row2 = [];

  if (dbType === "Video Editing") {
    const withQ = records.filter(r => r.intro_rating != null && r.overall_rating != null);
    const qual = withQ.length > 0
      ? ((withQ.reduce((s, r) => s + r.intro_rating + r.overall_rating, 0) / withQ.length)).toFixed(1) + "/10"
      : "—";
    const totalLen = records.reduce((s, r) => s + (r.video_length || 0), 0);
    const withChanges = records.filter(r => r.changes_count != null);
    const avgChanges = withChanges.length > 0
      ? (withChanges.reduce((s, r) => s + r.changes_count, 0) / withChanges.length).toFixed(1) + " changes"
      : "—";
    row1 = [
      <MetricCard key="q" label="Quality Score" value={qual} accent={qualAccent10(qual)} />,
      <MetricCard key="d" label="Deadline Score" value={dlScore} accent={dlAccent} />,
      <MetricCard key="p" label="Performance Score" value={avgPerf} accent={perfAccent(avgPerf)} />,
    ];
    row2 = [
      <MetricCard key="v" label="Total Videos" value={total} />,
      <MetricCard key="l" label="Total Length" value={`${totalLen} min`} />,
      <MetricCard key="c" label="Avg Changes" value={avgChanges} />,
    ];
  } else if (dbType === "Thumbnail") {
    const withQ = records.filter(r => r.thumbnail_rating != null);
    const qual = withQ.length > 0
      ? (withQ.reduce((s, r) => s + r.thumbnail_rating, 0) / withQ.length).toFixed(1) + "/5"
      : "—";
    row1 = [
      <MetricCard key="q" label="Quality Score" value={qual} accent={qualAccent5(qual)} />,
      <MetricCard key="d" label="Deadline Score" value={dlScore} accent={dlAccent} />,
      <MetricCard key="p" label="Performance Score" value={avgPerf} accent={perfAccent(avgPerf)} />,
    ];
    row2 = [<MetricCard key="t" label="Total Thumbnails" value={total} />];
  } else if (dbType === "Script") {
    const withQ = records.filter(r => r.script_rating != null);
    const qual = withQ.length > 0
      ? (withQ.reduce((s, r) => s + r.script_rating, 0) / withQ.length).toFixed(1) + "/5"
      : "—";
    row1 = [
      <MetricCard key="q" label="Quality Score" value={qual} accent={qualAccent5(qual)} />,
      <MetricCard key="d" label="Deadline Score" value={dlScore} accent={dlAccent} />,
      <MetricCard key="p" label="Performance Score" value={avgPerf} accent={perfAccent(avgPerf)} />,
    ];
    row2 = [<MetricCard key="s" label="Total Scripts" value={total} />];
  } else {
    row1 = [
      <MetricCard key="d" label="Deadline Score" value={dlScore} accent={dlAccent} />,
      <MetricCard key="p" label="Performance Score" value={avgPerf} accent={perfAccent(avgPerf)} />,
      <MetricCard key="t" label="Total Tasks" value={total} />,
    ];
  }

  return (
    <div className="mb-2">
      <p className="text-[#B3B3B3] text-xs uppercase tracking-wider mb-2 font-medium">{dbType}</p>
      <div className="grid grid-cols-3 gap-3 mb-3">{row1}</div>
      {row2.length > 0 && (
        <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: `repeat(${row2.length}, minmax(0,1fr))` }}>
          {row2}
        </div>
      )}
    </div>
  );
}

// ── Time Period Selector ──────────────────────────────────────────────────────

function TimePeriodSelector({ value, onChange, customFrom, customTo, onCustomFromChange, onCustomToChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Calendar size={15} className="text-[#B3B3B3] shrink-0" />
      <select
        data-testid="period-selector"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-[#2F2F2F] border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none cursor-pointer"
      >
        <option value="current">Current Month</option>
        <option value="last">Last Month</option>
        <option value="90days">Last 90 Days</option>
        <option value="all">All Time</option>
        <option value="custom">Custom</option>
      </select>
      {value === "custom" && (
        <>
          <input
            type="date"
            data-testid="custom-from"
            value={customFrom}
            onChange={e => onCustomFromChange(e.target.value)}
            className="bg-[#2F2F2F] border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          <span className="text-[#B3B3B3] text-xs">to</span>
          <input
            type="date"
            data-testid="custom-to"
            value={customTo}
            onChange={e => onCustomToChange(e.target.value)}
            className="bg-[#2F2F2F] border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </>
      )}
    </div>
  );
}

function filterByPeriod(records, period, customFrom, customTo) {
  const now = new Date();
  if (period === "all") return records;
  if (period === "current") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return records.filter(r => { const d = new Date(r.due_date || r.updated_at); return !isNaN(d) && d >= start; });
  }
  if (period === "last") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return records.filter(r => { const d = new Date(r.due_date || r.updated_at); return !isNaN(d) && d >= start && d <= end; });
  }
  if (period === "90days") {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    return records.filter(r => { const d = new Date(r.due_date || r.updated_at); return !isNaN(d) && d >= cutoff; });
  }
  if (period === "custom" && customFrom && customTo) {
    const from = new Date(customFrom);
    const to = new Date(customTo); to.setHours(23, 59, 59, 999);
    return records.filter(r => { const d = new Date(r.due_date || r.updated_at); return !isNaN(d) && d >= from && d <= to; });
  }
  return records;
}

// ── Edit Performance Modal ────────────────────────────────────────────────────

function EditModal({ record, onClose, onSaved }) {
  const dbType = record?.database_type;
  const [vals, setVals] = useState({
    intro_rating: record?.intro_rating ?? "",
    overall_rating: record?.overall_rating ?? "",
    changes_count: record?.changes_count ?? "",
    video_length: record?.video_length ?? "",
    thumbnail_rating: record?.thumbnail_rating ?? "",
    script_rating: record?.script_rating ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setVals(p => ({ ...p, [k]: v }));
  const numOrNull = v => v === "" ? null : Number(v);

  const handleSave = async () => {
    setSaving(true);
    try {
      const id = record.perf_id || record.page_id;
      const payload = {
        intro_rating: numOrNull(vals.intro_rating),
        overall_rating: numOrNull(vals.overall_rating),
        changes_count: numOrNull(vals.changes_count),
        video_length: numOrNull(vals.video_length),
        thumbnail_rating: numOrNull(vals.thumbnail_rating),
        script_rating: numOrNull(vals.script_rating),
      };
      const { data } = await axios.put(`${API}/performance/${id}`, payload, { withCredentials: true });
      toast.success("Performance entry updated");
      onSaved(data);
    } catch {
      toast.error("Failed to update entry");
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, fkey, min = 0, max = 99, step = 1 }) => (
    <div>
      <label className="text-[#B3B3B3] text-xs block mb-1">{label}</label>
      <input
        type="number" min={min} max={max} step={step}
        value={vals[fkey]}
        onChange={e => set(fkey, e.target.value)}
        className="w-full bg-[#191919] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#2F2F2F] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h3 className="text-white font-semibold text-sm">Edit Performance Entry</h3>
            <p className="text-[#B3B3B3] text-xs truncate max-w-xs mt-0.5">{record?.title || "Untitled"}</p>
          </div>
          <button onClick={onClose} className="text-[#B3B3B3] hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {/* Read-only info */}
          <div className="grid grid-cols-2 gap-3 mb-1">
            <div><p className="text-[#B3B3B3] text-xs">Type</p><p className="text-white text-sm">{dbType || "—"}</p></div>
            <div><p className="text-[#B3B3B3] text-xs">Deadline</p><p className="text-white text-sm">{record?.deadline_status || "—"}</p></div>
          </div>
          {/* Editable fields by type */}
          {dbType === "Video Editing" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Intro Rating (1-5)" fkey="intro_rating" min={1} max={5} />
                <Field label="Overall Rating (1-5)" fkey="overall_rating" min={1} max={5} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Changes Count" fkey="changes_count" min={0} max={999} />
                <Field label="Video Length (min)" fkey="video_length" min={0} max={999} step={0.1} />
              </div>
            </>
          )}
          {dbType === "Thumbnail" && (
            <Field label="Thumbnail Rating (1-5)" fkey="thumbnail_rating" min={1} max={5} />
          )}
          {dbType === "Script" && (
            <Field label="Script Rating (1-5)" fkey="script_rating" min={1} max={5} />
          )}
        </div>
        <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#B3B3B3] hover:text-white border border-white/10 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-white text-[#191919] font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Performance View (Level 3) ────────────────────────────────────────────────

function PerformanceView({ employeeId, employeeName, employee, onBack, showBackLabel, isAdminDept }) {
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState("current");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editRecord, setEditRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const loadRecords = useCallback(() => {
    setLoading(true);
    axios.get(`${API}/performance?employee_id=${employeeId}`, { withCredentials: true })
      .then(r => setAllRecords(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employeeId]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, typeFilter, deadlineFilter, selectedPeriod, customFrom, customTo]);

  // Records filtered by period only → for metrics
  const monthRecords = useMemo(
    () => filterByPeriod(allRecords, selectedPeriod, customFrom, customTo),
    [allRecords, selectedPeriod, customFrom, customTo]
  );

  // Records filtered by all filters → for table
  const tableRecords = useMemo(() => {
    let r = monthRecords;
    if (search) r = r.filter(x => (x.title || "").toLowerCase().includes(search.toLowerCase()));
    if (typeFilter !== "all") r = r.filter(x => (x.task_type || "").includes(typeFilter) || x.database_type === typeFilter);
    if (deadlineFilter === "on_time") r = r.filter(x => x.deadline_status === "On Time");
    if (deadlineFilter === "missed") r = r.filter(x => (x.deadline_status || "").includes("Missed"));
    return r;
  }, [monthRecords, search, typeFilter, deadlineFilter]);

  const totalPages = Math.ceil(tableRecords.length / ITEMS_PER_PAGE);
  const pageRecords = tableRecords.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Only show Video Editing-specific columns when at least one visible record is that type
  const hasVideoEditing = useMemo(
    () => tableRecords.some(r => r.database_type === "Video Editing"),
    [tableRecords]
  );

  // Group month records by database_type for metrics
  const byType = useMemo(() => {
    const g = {};
    monthRecords.forEach(r => {
      const t = r.database_type || "Other";
      if (!g[t]) g[t] = [];
      g[t].push(r);
    });
    return g;
  }, [monthRecords]);

  // Distinct task types for filter dropdown
  const taskTypes = useMemo(() => {
    const s = new Set();
    allRecords.forEach(r => { if (r.task_type) r.task_type.split(", ").forEach(t => s.add(t.trim())); });
    return Array.from(s).sort();
  }, [allRecords]);

  const avg = allRecords.filter(r => r.performance_score != null);
  const overallAvg = avg.length > 0
    ? (avg.reduce((s, r) => s + r.performance_score, 0) / avg.length).toFixed(1)
    : null;

  // 90-day avg for Upgrade button (independent of period filter)
  const ninety90Cutoff = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 90); return d; }, []);
  const last90Records = useMemo(
    () => allRecords.filter(r => { const d = new Date(r.due_date || r.updated_at); return !isNaN(d) && d >= ninety90Cutoff && r.performance_score != null; }),
    [allRecords, ninety90Cutoff]
  );
  const avg90 = last90Records.length > 0
    ? last90Records.reduce((s, r) => s + r.performance_score, 0) / last90Records.length
    : null;
  const upgradeEnabled = avg90 !== null && avg90 >= 7;

  const handleDelete = async () => {
    try {
      const id = deleteTarget.perf_id || deleteTarget.page_id;
      await axios.delete(`${API}/performance/${id}`, { withCredentials: true });
      toast.success("Performance entry deleted");
      setAllRecords(prev => prev.filter(r => (r.perf_id || r.page_id) !== id));
    } catch {
      toast.error("Failed to delete entry");
    }
    setDeleteTarget(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-[#B3B3B3] hover:text-white text-sm transition-colors">
            <ChevronLeft size={16} /> {showBackLabel || "Back"}
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {employeeName?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <h2 className="text-white font-semibold truncate" style={{ fontFamily: "Manrope, sans-serif" }}>{employeeName}</h2>
            <p className="text-[#B3B3B3] text-xs">{allRecords.length} total tasks</p>
          </div>
          {overallAvg !== null && (
            <div className="ml-2 flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 sm:px-3 py-1.5 shrink-0">
              <BarChart2 size={13} className="text-[#B3B3B3]" />
              <span className="text-[#B3B3B3] text-xs hidden sm:inline">All-time avg</span>
              <span className="text-[#B3B3B3] text-xs sm:hidden">Avg</span>
              <ScoreBadge score={overallAvg} />
            </div>
          )}
        </div>
        <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          {/* Upgrade Your Level button — always visible, enabled based on 90-day avg */}
          <button
            data-testid="upgrade-level-btn"
            disabled={!upgradeEnabled}
            onClick={() => upgradeEnabled && setShowUpgradeModal(true)}
            title={avg90 !== null ? `90-day avg: ${avg90.toFixed(1)}/10 (need ≥ 7 to upgrade)` : "Not enough data in last 90 days"}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors min-h-[40px] ${
              upgradeEnabled
                ? "bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25 cursor-pointer"
                : "bg-white/5 border-white/10 text-[#B3B3B3] cursor-not-allowed opacity-60"
            }`}
          >
            <TrendingUp size={15} />
            <span className="hidden sm:inline">Upgrade Your Level</span>
            <span className="sm:hidden">Upgrade</span>
            {avg90 !== null && (
              <span className={`text-xs font-bold ml-1 ${upgradeEnabled ? "text-green-300" : "text-[#B3B3B3]"}`}>
                {avg90.toFixed(1)}/10
              </span>
            )}
          </button>
          <TimePeriodSelector
            value={selectedPeriod}
            onChange={v => setSelectedPeriod(v)}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
        </div>
      </div>

      {/* Metrics Cards */}
      {!loading && monthRecords.length > 0 && (
        <div className="mb-5 p-4 bg-[#1E1E1E] rounded-xl border border-white/10">
          {Object.entries(byType).map(([dbType, recs]) => (
            <MetricsSection key={dbType} records={recs} dbType={dbType} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap" data-testid="performance-filters">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B3B3B3]" />
          <input
            data-testid="perf-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full bg-[#2F2F2F] border border-white/10 text-white text-sm rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20 placeholder-[#B3B3B3]"
          />
        </div>
        {taskTypes.length > 0 && (
          <select data-testid="perf-type-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-[#2F2F2F] border border-white/10 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20">
            <option value="all">All Types</option>
            {taskTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select data-testid="perf-deadline-filter" value={deadlineFilter} onChange={e => setDeadlineFilter(e.target.value)}
          className="bg-[#2F2F2F] border border-white/10 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20">
          <option value="all">All Deadlines</option>
          <option value="on_time">On Time</option>
          <option value="missed">Missed</option>
        </select>
        {(search || typeFilter !== "all" || deadlineFilter !== "all") && (
          <button onClick={() => { setSearch(""); setTypeFilter("all"); setDeadlineFilter("all"); }}
            className="text-xs text-[#B3B3B3] hover:text-white border border-white/10 rounded-lg px-3 py-2 transition-colors">
            Clear
          </button>
        )}
        <span className="text-[#B3B3B3] text-xs ml-auto">{tableRecords.length} result{tableRecords.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : tableRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 size={32} className="text-[#B3B3B3] mb-3" />
          <p className="text-white font-medium">{allRecords.length === 0 ? "No performance data yet" : "No results match your filters"}</p>
          <p className="text-[#B3B3B3] text-sm">{allRecords.length === 0 ? "Data will appear once Notion webhooks start syncing" : "Try adjusting your filters"}</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
            <table className={`w-full ${hasVideoEditing ? "min-w-[960px]" : "min-w-[720px]"}`} data-testid="performance-table">
              <thead className="bg-[#191919] border-b border-white/10">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Task</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Due Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Deadline</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Ratings</th>
                  {hasVideoEditing && <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Changes</th>}
                  {hasVideoEditing && <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Vid Len</th>}
                  <th className="text-center py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Score</th>
                  {isAdminDept && <th className="text-center py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody className="bg-[#2F2F2F] divide-y divide-white/5">
                {pageRecords.map(record => (
                  <tr key={record.perf_id || record.page_id} className="hover:bg-white/5 transition-colors" data-testid="performance-row">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium max-w-xs truncate">{record.title || "Untitled"}</span>
                        {record.page_url && (
                          <a href={record.page_url} target="_blank" rel="noopener noreferrer" className="text-[#B3B3B3] hover:text-white transition-colors shrink-0">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/15 text-blue-400">
                        {record.task_type || record.database_type || "—"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-sm text-[#B3B3B3] whitespace-nowrap">{fmtDate(record.due_date)}</td>
                    <td className="py-3.5 px-4"><DeadlineBadge status={record.deadline_status} /></td>
                    <td className="py-3.5 px-4">
                      {record.database_type === "Video Editing" ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1"><span className="text-[#B3B3B3] text-[10px] w-12">Intro:</span><StarRating value={record.intro_rating} /></div>
                          <div className="flex items-center gap-1"><span className="text-[#B3B3B3] text-[10px] w-12">Overall:</span><StarRating value={record.overall_rating} /></div>
                        </div>
                      ) : record.database_type === "Thumbnail" ? (
                        <StarRating value={record.thumbnail_rating} />
                      ) : record.database_type === "Script" ? (
                        <StarRating value={record.script_rating} />
                      ) : <span className="text-[#B3B3B3] text-xs">—</span>}
                    </td>
                    {hasVideoEditing && (
                      <td className="py-3.5 px-4 text-sm text-[#B3B3B3]">
                        {record.database_type === "Video Editing" && record.changes_count != null ? record.changes_count : "—"}
                      </td>
                    )}
                    {hasVideoEditing && (
                      <td className="py-3.5 px-4 text-sm text-[#B3B3B3]">
                        {record.database_type === "Video Editing" && record.video_length != null ? `${record.video_length} min` : "—"}
                      </td>
                    )}
                    <td className="py-3.5 px-4 text-center"><ScoreBadge score={record.performance_score} /></td>
                    {isAdminDept && (
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            data-testid="edit-performance-btn"
                            onClick={() => setEditRecord(record)}
                            className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            data-testid="delete-performance-btn"
                            onClick={() => setDeleteTarget(record)}
                            className="p-1.5 text-[#B3B3B3] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4" data-testid="pagination">
              <p className="text-[#B3B3B3] text-xs">
                Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, tableRecords.length)} of {tableRecords.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg text-[#B3B3B3] hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p2 = start + i;
                  return p2 <= totalPages ? (
                    <button key={p2} onClick={() => setPage(p2)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p2 === page ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:text-white hover:bg-white/5"}`}>
                      {p2}
                    </button>
                  ) : null;
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-[#B3B3B3] hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Modal */}
      {editRecord && (
        <EditModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={(updated) => {
            setAllRecords(prev => prev.map(r =>
              (r.perf_id || r.page_id) === (updated.perf_id || updated.page_id) ? updated : r
            ));
            setEditRecord(null);
          }}
        />
      )}

      {/* Delete Confirm */}
      <DeleteConfirm
        open={!!deleteTarget}
        title="Delete Performance Entry"
        description={deleteTarget ? `Are you sure you want to delete "${deleteTarget.title || "this entry"}"? This cannot be undone.` : ""}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Upgrade Level Modal */}
      {showUpgradeModal && employee && (
        <UpgradeLevelModal
          employee={employee}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </div>
  );
}

// ── Employee Selection (Level 2) ──────────────────────────────────────────────

function EmployeeSelection({ teamId, teamName, onSelectEmployee, onBack }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = teamId ? `${API}/employees?team_id=${teamId}` : `${API}/employees`;
    axios.get(url, { withCredentials: true })
      .then(r => setEmployees(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-[#B3B3B3] hover:text-white text-sm transition-colors">
            <ChevronLeft size={16} /> Teams
          </button>
        )}
        <div>
          <h2 className="text-white font-semibold" style={{ fontFamily: "Manrope, sans-serif" }}>{teamName}</h2>
          <p className="text-[#B3B3B3] text-xs">Select an employee to view performance</p>
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User size={32} className="text-[#B3B3B3] mb-3" />
          <p className="text-white font-medium">No employees in this team</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="employee-selection-grid">
          {employees.map(emp => (
            <button key={emp.employee_id} data-testid="employee-select-card"
              onClick={() => onSelectEmployee(emp)}
              className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 text-left hover:border-white/30 hover:-translate-y-0.5 transition-all duration-200 group">
              <div className="flex items-center gap-3 mb-2">
                {emp.profile_picture ? (
                  <img src={emp.profile_picture} alt={emp.first_name} className="w-10 h-10 rounded-full object-cover border border-white/20" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-sm border border-white/20">
                    {emp.first_name?.[0]?.toUpperCase()}{emp.last_name?.[0]?.toUpperCase()}
                  </div>
                )}
                <ChevronRight size={16} className="ml-auto text-[#B3B3B3] group-hover:text-white transition-colors" />
              </div>
              <p className="text-white font-medium text-sm truncate">{emp.first_name} {emp.last_name}</p>
              <p className="text-[#B3B3B3] text-xs truncate">{emp.job_position_name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Multi-Team Employee Selection (for managers with multiple teams) ──────────

function MultiTeamEmployeeSelection({ teams, onSelectEmployee }) {
  const [teamEmployees, setTeamEmployees] = useState({}); // { team_id: [emp, ...] }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teams || teams.length === 0) { setLoading(false); return; }
    Promise.all(
      teams.map(t =>
        axios.get(`${API}/employees?team_id=${t.team_id}`, { withCredentials: true })
          .then(r => ({ team_id: t.team_id, employees: r.data }))
          .catch(() => ({ team_id: t.team_id, employees: [] }))
      )
    ).then(results => {
      const map = {};
      results.forEach(({ team_id, employees }) => { map[team_id] = employees; });
      setTeamEmployees(map);
    }).finally(() => setLoading(false));
  }, [teams]);

  const totalCount = Object.values(teamEmployees).reduce((s, arr) => s + arr.length, 0);
  const showTeamHeaders = teams.length > 1;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-white font-semibold" style={{ fontFamily: "Manrope, sans-serif" }}>
          {showTeamHeaders ? `My Teams (${teams.length})` : (teams[0]?.team_name || "My Team")}
        </h2>
        <p className="text-[#B3B3B3] text-xs mt-0.5">Select an employee to view performance</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}
        </div>
      ) : totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User size={32} className="text-[#B3B3B3] mb-3" />
          <p className="text-white font-medium">No employees in your team{teams.length > 1 ? "s" : ""}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {teams.map(team => {
            const emps = teamEmployees[team.team_id] || [];
            if (emps.length === 0) return null;
            return (
              <div key={team.team_id}>
                {/* Team header — only shown when managing multiple teams */}
                {showTeamHeaders && (
                  <div className="flex items-center gap-2 mb-3">
                    <Users size={14} className="text-[#B3B3B3]" />
                    <span className="text-[#B3B3B3] text-xs font-semibold uppercase tracking-wider">
                      {team.team_name}
                    </span>
                    <span className="text-[#B3B3B3] text-xs">· {emps.length} member{emps.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="employee-selection-grid">
                  {emps.map(emp => (
                    <button key={emp.employee_id} data-testid="employee-select-card"
                      onClick={() => onSelectEmployee(emp)}
                      className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 text-left hover:border-white/30 hover:-translate-y-0.5 transition-all duration-200 group">
                      <div className="flex items-center gap-3 mb-2">
                        {emp.profile_picture ? (
                          <img src={emp.profile_picture} alt={emp.first_name} className="w-10 h-10 rounded-full object-cover border border-white/20" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-sm border border-white/20">
                            {emp.first_name?.[0]?.toUpperCase()}{emp.last_name?.[0]?.toUpperCase()}
                          </div>
                        )}
                        <ChevronRight size={16} className="ml-auto text-[#B3B3B3] group-hover:text-white transition-colors" />
                      </div>
                      <p className="text-white font-medium text-sm truncate">{emp.first_name} {emp.last_name}</p>
                      <p className="text-[#B3B3B3] text-xs truncate">{emp.job_position_name || emp.department_name || "—"}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



function TeamSelection({ onSelectTeam }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/teams`, { withCredentials: true })
      .then(r => setTeams(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <p className="text-[#B3B3B3] text-sm mb-6">Select a team to view employee performance</p>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={32} className="text-[#B3B3B3] mb-3" />
          <p className="text-white font-medium">No teams configured</p>
          <p className="text-[#B3B3B3] text-sm">Create teams in Settings → Teams</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="team-selection-grid">
          {teams.map(team => (
            <button key={team.team_id} data-testid="team-select-card"
              onClick={() => onSelectTeam(team)}
              className="bg-[#2F2F2F] rounded-xl border border-white/10 p-5 text-left hover:border-white/30 hover:-translate-y-0.5 transition-all duration-200 group">
              {/* Manager photo */}
              <div className="flex items-center gap-3 mb-3">
                {team.team_manager_picture ? (
                  <img src={team.team_manager_picture} alt={team.team_manager_name} className="w-10 h-10 rounded-full object-cover border border-white/20" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white font-bold text-sm">
                    {team.team_manager_name?.[0]?.toUpperCase() || <Users size={16} className="text-[#B3B3B3]" />}
                  </div>
                )}
                <ChevronRight size={16} className="ml-auto text-[#B3B3B3] group-hover:text-white transition-colors" />
              </div>
              <p className="text-white font-semibold text-sm">{team.team_name}</p>
              {team.team_manager_name && (
                <p className="text-[#B3B3B3] text-xs mt-0.5 truncate">Manager: {team.team_manager_name}</p>
              )}
              <p className="text-[#B3B3B3] text-xs mt-1">
                {team.member_count || 0} member{(team.member_count || 0) !== 1 ? "s" : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Employee Performance with Tabs ────────────────────────────────────────────

function EmployeePerformanceWithTabs({ myEmployee, isAdminDept }) {
  const [activeTab, setActiveTab] = useState("performance");

  const tabs = [
    { val: "performance", label: "My Performance", icon: BarChart2 },
    { val: "team-of-month", label: "Team of the Month", icon: Trophy },
  ];

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 mb-5 md:mb-6">
          <TabsList className="bg-[#191919] border border-white/10 p-1 rounded-lg h-auto flex gap-1 w-fit">
          {tabs.map(({ val, label, icon: Icon }) => (
            <TabsTrigger
              key={val}
              value={val}
              className="data-[state=active]:bg-[#2F2F2F] data-[state=active]:text-white text-[#B3B3B3] rounded-md px-3 sm:px-4 py-2 text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap"
            >
              <Icon size={15} />{label}
            </TabsTrigger>
          ))}
          </TabsList>
        </div>

        <TabsContent value="performance">
          <PerformanceView
            employeeId={myEmployee.employee_id}
            employeeName={`${myEmployee.first_name} ${myEmployee.last_name}`}
            employee={myEmployee}
            onBack={null}
            isAdminDept={isAdminDept}
          />
        </TabsContent>

        <TabsContent value="team-of-month">
          <CreativeTeamOfMonth />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Admin/Manager Landing with Tabs ────────────────────────────────────────

function AdminManagerLanding({ 
  isAdminDept, 
  myEmployee, 
  myManagedTeams,
  // Admin drill-down state lifted from PerformancePage so breadcrumbs stay in sync
  adminSelectedTeam,
  setAdminSelectedTeam,
  adminSelectedEmployee,
  setAdminSelectedEmployee,
}) {
  // Determine if user is manager (has managed teams) vs admin
  const isManager = myManagedTeams && myManagedTeams.length > 0;

  // Default tab = first tab (Team Performance / My Team Performance) for all roles.
  const [activeTab, setActiveTab] = useState("team-performance");
  const [selectedEmployeeFromTab, setSelectedEmployeeFromTab] = useState(null);

  // Build tabs based on role — Team Performance is the FIRST tab,
  // Team of the Month is the SECOND tab for all roles.
  const tabs = [];

  if (isAdminDept && !isManager) {
    tabs.push({ val: "team-performance", label: "Team Performance", icon: BarChart2 });
  } else if (isManager) {
    tabs.push({ val: "team-performance", label: "My Team Performance", icon: Users });
  }

  tabs.push({ val: "team-of-month", label: "Team of the Month", icon: Trophy });

  // Manager: if employee selected via tab, show their performance view
  if (selectedEmployeeFromTab) {
    return (
      <PerformanceView
        employeeId={selectedEmployeeFromTab.employee_id}
        employeeName={`${selectedEmployeeFromTab.first_name} ${selectedEmployeeFromTab.last_name}`}
        employee={selectedEmployeeFromTab}
        onBack={() => setSelectedEmployeeFromTab(null)}
        showBackLabel={isManager ? "My Team" : "Team Members"}
        isAdminDept={isAdminDept}
      />
    );
  }

  // Admin: if drilled into a specific employee, show performance view (full screen)
  if (isAdminDept && !isManager && adminSelectedTeam && adminSelectedEmployee) {
    return (
      <PerformanceView
        employeeId={adminSelectedEmployee.employee_id}
        employeeName={`${adminSelectedEmployee.first_name} ${adminSelectedEmployee.last_name}`}
        employee={adminSelectedEmployee}
        onBack={() => setAdminSelectedEmployee(null)}
        showBackLabel={adminSelectedTeam.team_name}
        isAdminDept={isAdminDept}
      />
    );
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 mb-5 md:mb-6">
          <TabsList className="bg-[#191919] border border-white/10 p-1 rounded-lg h-auto flex gap-1 w-fit">
          {tabs.map(({ val, label, icon: Icon }) => (
            <TabsTrigger
              key={val}
              value={val}
              className="data-[state=active]:bg-[#2F2F2F] data-[state=active]:text-white text-[#B3B3B3] rounded-md px-3 sm:px-4 py-2 text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap"
            >
              <Icon size={15} />{label}
            </TabsTrigger>
          ))}
          </TabsList>
        </div>

        <TabsContent value="team-of-month">
          <CreativeTeamOfMonth />
        </TabsContent>

        <TabsContent value="team-performance">
          {isManager ? (
            // Manager: Show their team members directly
            <MultiTeamEmployeeSelection
              teams={myManagedTeams}
              onSelectEmployee={setSelectedEmployeeFromTab}
            />
          ) : (
            // Admin: render drill-down inline so tabs stay visible across the flow
            <>
              {!adminSelectedTeam && (
                <TeamSelection onSelectTeam={setAdminSelectedTeam} />
              )}
              {adminSelectedTeam && !adminSelectedEmployee && (
                <EmployeeSelection
                  teamId={adminSelectedTeam.team_id}
                  teamName={adminSelectedTeam.team_name}
                  onSelectEmployee={setAdminSelectedEmployee}
                  onBack={() => setAdminSelectedTeam(null)}
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { user, myEmployee } = useAuth();
  const [myManagedTeams, setMyManagedTeams] = useState([]);
  const [roleLoading, setRoleLoading] = useState(true);
  // Admin drill-down (lifted so tabs in AdminManagerLanding stay visible)
  const [adminSelectedTeam, setAdminSelectedTeam] = useState(null);
  const [adminSelectedEmployee, setAdminSelectedEmployee] = useState(null);
  // Manager drill-down state (separate flow with no tabs once an employee is picked)
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const loadRole = useCallback(async () => {
    // Don't run until we know who the user is
    if (!user) return;
    try {
      const teamsRes = await axios.get(`${API}/teams`, { withCredentials: true });
      if (myEmployee?.employee_id) {
        setMyManagedTeams(teamsRes.data.filter(t => t.team_manager_id === myEmployee.employee_id));
      } else {
        setMyManagedTeams([]);
      }
    } catch {}
    finally { setRoleLoading(false); }
  }, [myEmployee, user]);

  useEffect(() => { loadRole(); }, [loadRole]);

  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";
  const isManager = !isAdminDept && myManagedTeams.length > 0;
  const isEmployee = !isAdminDept && !isManager && !!myEmployee?.employee_id;

  // Breadcrumbs
  const crumbs = ["Performance"];
  if (isManager && !selectedEmployee) crumbs.push(myManagedTeams.length > 1 ? "My Teams" : (myManagedTeams[0]?.team_name || "My Team"));
  if (isAdminDept && adminSelectedTeam) crumbs.push(adminSelectedTeam.team_name);
  if (isAdminDept && adminSelectedEmployee) crumbs.push(`${adminSelectedEmployee.first_name} ${adminSelectedEmployee.last_name}`);
  if (selectedEmployee) crumbs.push(`${selectedEmployee.first_name} ${selectedEmployee.last_name}`);

  if (roleLoading) {
    return (
      <div className="p-4 md:p-8">
        <div className="h-8 w-48 bg-[#2F2F2F] rounded animate-pulse mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Performance</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={14} className="text-[#B3B3B3]" />}
              <span className={i === crumbs.length - 1 ? "text-white text-sm" : "text-[#B3B3B3] text-sm"}>{c}</span>
            </span>
          ))}
        </div>
      </div>

      {isAdminDept && (
        <AdminManagerLanding 
          isAdminDept={isAdminDept}
          myEmployee={myEmployee}
          myManagedTeams={myManagedTeams}
          adminSelectedTeam={adminSelectedTeam}
          setAdminSelectedTeam={setAdminSelectedTeam}
          adminSelectedEmployee={adminSelectedEmployee}
          setAdminSelectedEmployee={setAdminSelectedEmployee}
        />
      )}

      {isManager && (
        <>
          {!selectedEmployee && (
            <AdminManagerLanding 
              isAdminDept={isAdminDept}
              myEmployee={myEmployee}
              myManagedTeams={myManagedTeams}
            />
          )}
          {selectedEmployee && selectedEmployee.showSelection && (
            <MultiTeamEmployeeSelection
              teams={myManagedTeams}
              onSelectEmployee={setSelectedEmployee}
            />
          )}
          {selectedEmployee && !selectedEmployee.showSelection && (
            <PerformanceView employeeId={selectedEmployee.employee_id}
              employeeName={`${selectedEmployee.first_name} ${selectedEmployee.last_name}`}
              employee={selectedEmployee}
              onBack={() => setSelectedEmployee(null)}
              showBackLabel={myManagedTeams.length > 1 ? "My Teams" : (myManagedTeams[0]?.team_name || "My Team")}
              isAdminDept={isAdminDept} />
          )}
        </>
      )}

      {isEmployee && (
        <EmployeePerformanceWithTabs myEmployee={myEmployee} isAdminDept={isAdminDept} />
      )}

      {!isAdminDept && !isManager && !isEmployee && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BarChart2 size={40} className="text-[#B3B3B3] mb-4" />
          <p className="text-white font-medium text-lg">Performance data unavailable</p>
          <p className="text-[#B3B3B3] text-sm mt-1">Your account is not linked to an employee profile.</p>
        </div>
      )}
    </div>
  );
}
