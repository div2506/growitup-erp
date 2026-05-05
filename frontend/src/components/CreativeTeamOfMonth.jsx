import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, Plus, Pencil, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function getMonthOptions() {
  const options = [];
  const now = new Date();
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  // Generate current month and 11 months back
  for (let i = 0; i <= 11; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    options.push({ label, value });
  }

  return options;
}

// Accepts empty string OR a valid http(s) URL.
function isValidReportLink(v) {
  if (!v || !v.trim()) return true;
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Add / Edit Manager Performance Modal.
 * - When `editing` is provided, the modal runs in edit mode:
 *   manager + month are disabled; PUT /manager-performance/{perf_id} is used.
 */
function ManagerPerfModal({ onClose, onSuccess, selectedMonth, managers, editing }) {
  const isEdit = !!editing;

  const [formData, setFormData] = useState({
    manager_id: editing?.manager_id || "",
    month: editing?.month || selectedMonth || "",
    client_performance_score: editing?.client_performance_score?.toString() ?? "",
    client_feedback_score: editing?.client_feedback_score?.toString() ?? "",
    creative_task_score: editing?.creative_task_score?.toString() ?? "",
    report_link: editing?.report_link || "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [linkError, setLinkError] = useState("");

  const totalPoints =
    formData.client_performance_score &&
    formData.client_feedback_score &&
    formData.creative_task_score
      ? (
          parseFloat(formData.client_performance_score) * 0.45 +
          parseFloat(formData.client_feedback_score) * 0.35 +
          parseFloat(formData.creative_task_score) * 0.20
        ).toFixed(2)
      : "0.00";

  const canSubmit = formData.manager_id && formData.month &&
    formData.client_performance_score && formData.client_feedback_score && formData.creative_task_score &&
    !submitting;

  const handleLinkChange = (e) => {
    const v = e.target.value;
    setFormData(p => ({ ...p, report_link: v }));
    setLinkError(isValidReportLink(v) ? "" : "Enter a valid URL (http:// or https://)");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const scores = [
      parseFloat(formData.client_performance_score),
      parseFloat(formData.client_feedback_score),
      parseFloat(formData.creative_task_score),
    ];
    for (const score of scores) {
      if (isNaN(score) || score < 0 || score > 100) {
        toast.error("All scores must be numbers between 0 and 100");
        return;
      }
    }
    if (!isValidReportLink(formData.report_link)) {
      setLinkError("Enter a valid URL (http:// or https://)");
      toast.error("Report link must be a valid URL");
      return;
    }

    setSubmitting(true);

    const payload = {
      manager_id: formData.manager_id,
      month: formData.month,
      client_performance_score: scores[0],
      client_feedback_score: scores[1],
      creative_task_score: scores[2],
      report_link: formData.report_link.trim() || null,
    };

    try {
      if (isEdit) {
        await axios.put(`${API}/manager-performance/${editing.perf_id}`, payload, { withCredentials: true });
        toast.success("Manager performance updated successfully!");
      } else {
        await axios.post(`${API}/manager-performance`, payload, { withCredentials: true });
        toast.success("Manager performance added successfully!");
      }
      onSuccess();
      onClose();
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to save performance data";
      toast.error(msg);
      setSubmitting(false);
    }
  };

  const monthOptions = getMonthOptions();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent
        data-testid="manager-perf-modal"
        className="bg-[#2F2F2F] border-white/10 text-white w-full sm:max-w-[620px] max-w-none h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-lg rounded-none overflow-y-auto p-4 sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="text-white text-lg">
            {isEdit ? "Edit Manager Performance Details" : "Add Manager Performance Details"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Manager + Month — disabled in edit mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[#B3B3B3] text-sm">Manager *</Label>
              <Select
                value={formData.manager_id}
                onValueChange={(v) => setFormData({ ...formData, manager_id: v })}
                disabled={isEdit}
              >
                <SelectTrigger
                  data-testid="mgr-perf-manager-select"
                  className={`bg-[#191919] border-white/10 text-white min-h-[44px] ${isEdit ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-[250px]">
                  {managers.map(mgr => (
                    <SelectItem
                      key={mgr.employee_id}
                      value={mgr.employee_id}
                      className="text-white hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                    >
                      {mgr.first_name} {mgr.last_name} ({mgr.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[#B3B3B3] text-sm">Month *</Label>
              <Select
                value={formData.month}
                onValueChange={(v) => setFormData({ ...formData, month: v })}
                disabled={isEdit}
              >
                <SelectTrigger
                  data-testid="mgr-perf-month-select"
                  className={`bg-[#191919] border-white/10 text-white min-h-[44px] ${isEdit ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-[250px]">
                  {monthOptions.map(opt => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="text-white hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scores — three compact inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#191919] border border-white/10 rounded-lg p-3 space-y-1.5">
              <Label className="text-[#B3B3B3] text-xs">Client Performance *</Label>
              <Input
                data-testid="mgr-perf-cp-input"
                type="number" min="0" max="100" step="0.01"
                value={formData.client_performance_score}
                onChange={(e) => setFormData({ ...formData, client_performance_score: e.target.value })}
                placeholder="Score"
                className="bg-[#2F2F2F] border-white/10 text-white"
              />
              <div className="flex items-center justify-between">
                <p className="text-[#B3B3B3] text-[10px]">Weight: 45%</p>
                <p className="text-[#B3B3B3] text-[10px]">0–100</p>
              </div>
            </div>
            <div className="bg-[#191919] border border-white/10 rounded-lg p-3 space-y-1.5">
              <Label className="text-[#B3B3B3] text-xs">Client Feedback *</Label>
              <Input
                data-testid="mgr-perf-cf-input"
                type="number" min="0" max="100" step="0.01"
                value={formData.client_feedback_score}
                onChange={(e) => setFormData({ ...formData, client_feedback_score: e.target.value })}
                placeholder="Score"
                className="bg-[#2F2F2F] border-white/10 text-white"
              />
              <div className="flex items-center justify-between">
                <p className="text-[#B3B3B3] text-[10px]">Weight: 35%</p>
                <p className="text-[#B3B3B3] text-[10px]">0–100</p>
              </div>
            </div>
            <div className="bg-[#191919] border border-white/10 rounded-lg p-3 space-y-1.5">
              <Label className="text-[#B3B3B3] text-xs">Creative Task *</Label>
              <Input
                data-testid="mgr-perf-ct-input"
                type="number" min="0" max="100" step="0.01"
                value={formData.creative_task_score}
                onChange={(e) => setFormData({ ...formData, creative_task_score: e.target.value })}
                placeholder="Score"
                className="bg-[#2F2F2F] border-white/10 text-white"
              />
              <div className="flex items-center justify-between">
                <p className="text-[#B3B3B3] text-[10px]">Weight: 20%</p>
                <p className="text-[#B3B3B3] text-[10px]">0–100</p>
              </div>
            </div>
          </div>

          {/* Report Link */}
          <div className="space-y-1.5">
            <Label className="text-[#B3B3B3] text-sm">Report Link (optional)</Label>
            <Input
              data-testid="mgr-perf-report-link-input"
              type="url"
              value={formData.report_link}
              onChange={handleLinkChange}
              placeholder="https://example.com/report"
              className="bg-[#191919] border-white/10 text-white"
            />
            {linkError && <p className="text-red-400 text-xs">{linkError}</p>}
          </div>

          {/* Total Points banner */}
          <div className="bg-gradient-to-r from-green-500/10 via-green-500/5 to-transparent border border-green-500/20 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[#B3B3B3] text-xs uppercase tracking-wider">Total Points (This month)</p>
              <p className="text-[#B3B3B3] text-[10px] mt-0.5">Weighted: 45% Performance + 35% Feedback + 20% Creative</p>
            </div>
            <span data-testid="mgr-perf-total" className="text-2xl font-bold text-white tabular-nums">{totalPoints}</span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
            <Button
              type="button" variant="outline" onClick={onClose} disabled={submitting}
              className="bg-transparent border-white/20 text-white hover:bg-white/10 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              data-testid="mgr-perf-save-btn"
              type="button" onClick={handleSubmit} disabled={!canSubmit || !!linkError}
              className={`${canSubmit && !linkError
                  ? "bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 hover:border-green-500/60"
                  : "bg-white/5 text-[#B3B3B3] cursor-not-allowed"
                } min-h-[44px]`}
            >
              {submitting ? "Saving..." : isEdit ? "Update" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReportLinkCell({ url }) {
  if (!url || !url.trim()) return <span className="text-[#B3B3B3]">-</span>;
  return (
    <a
      data-testid="mgr-perf-report-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm underline-offset-2 hover:underline"
    >
      View Report <ExternalLink size={12} />
    </a>
  );
}

export default function CreativeTeamOfMonth() {
  const { user, myEmployee } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState({ open: false, editing: null });
  const [availableMonths, setAvailableMonths] = useState([]);

  const isAdmin = user?.is_admin || myEmployee?.department_name === "Admin";

  const loadAvailableMonths = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/manager-performance`, { withCredentials: true });
      const performances = response.data;

      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];

      if (performances.length === 0) {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        setAvailableMonths([{ label: `${monthNames[now.getMonth()]} ${now.getFullYear()}`, value: currentMonth }]);
        setSelectedMonth(currentMonth);
      } else {
        const uniqueMonths = [...new Set(performances.map(p => p.month))];
        const options = uniqueMonths.map(monthStr => {
          const date = new Date(monthStr);
          return {
            label: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
            value: monthStr,
            sortKey: new Date(monthStr).getTime(),
          };
        });
        options.sort((a, b) => b.sortKey - a.sortKey);
        setAvailableMonths(options);
        if (!selectedMonth && options.length > 0) {
          setSelectedMonth(options[0].value);
        }
      }
    } catch (error) {
      console.error("Failed to load available months:", error);
      const now = new Date();
      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      setAvailableMonths([{ label: `${monthNames[now.getMonth()]} ${now.getFullYear()}`, value: currentMonth }]);
      setSelectedMonth(currentMonth);
    }
  }, [selectedMonth]);

  const loadManagers = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/managers-with-teams`, { withCredentials: true });
      setManagers(response.data);
    } catch (error) {
      console.error("Failed to load managers:", error);
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    if (!selectedMonth) return;

    setLoading(true);
    try {
      const response = await axios.get(`${API}/manager-performance?month=${selectedMonth}`, { withCredentials: true });
      const performances = response.data;

      const leaderboardData = await Promise.all(
        performances.map(async (perf) => {
          const allMonthsRes = await axios.get(
            `${API}/manager-performance?manager_id=${perf.manager_id}`,
            { withCredentials: true }
          );
          const allMonths = allMonthsRes.data;
          const totalOverall = allMonths.length > 0
            ? (allMonths.reduce((sum, m) => sum + m.total_points_month, 0) / allMonths.length).toFixed(2)
            : perf.total_points_month.toFixed(2);

          return {
            ...perf,
            total_points_overall: parseFloat(totalOverall),
            team_name: `${perf.manager.first_name} ${perf.manager.last_name}'s Team`,
          };
        })
      );

      leaderboardData.sort((a, b) => b.total_points_month - a.total_points_month);
      leaderboardData.forEach((entry, index) => { entry.rank = index + 1; });

      setLeaderboard(leaderboardData);
    } catch (error) {
      console.error("Failed to load leaderboard:", error);
      toast.error("Failed to load leaderboard data");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadManagers();
    loadAvailableMonths();
  }, [loadManagers, loadAvailableMonths]);

  useEffect(() => {
    if (selectedMonth) loadLeaderboard();
  }, [selectedMonth, loadLeaderboard]);

  const handleSuccess = () => {
    loadLeaderboard();
    loadAvailableMonths();
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return rank;
  };

  const currentMonthLabel = availableMonths.find(opt => opt.value === selectedMonth)?.label || "";

  return (
    <div>
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
          Team of the Month
        </h2>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {isAdmin && (
            <button
              data-testid="mgr-perf-add-btn"
              onClick={() => setModalState({ open: true, editing: null })}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition-colors text-sm font-medium min-h-[40px]"
            >
              <Plus size={16} />
              Add Details
            </button>
          )}
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="bg-[#2F2F2F] border-white/10 text-white w-[160px] sm:w-[180px] min-h-[40px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-[300px]">
              {availableMonths.map(opt => (
                <SelectItem key={opt.value} value={opt.value}
                  className="text-white hover:bg-white/10 focus:bg-white/10 cursor-pointer">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Reward Banner */}
      <div className="mb-5 sm:mb-6 p-5 sm:p-8 bg-gradient-to-br from-[#2F2F2F] via-[#2F2F2F] to-[#252525] border border-white/10 rounded-xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-5">
          <div className="absolute top-4 left-4 w-12 sm:w-16 h-12 sm:h-16 border-2 border-yellow-500 rounded-full"></div>
          <div className="absolute bottom-4 right-4 w-16 sm:w-20 h-16 sm:h-20 border-2 border-yellow-500 rounded-full"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 sm:w-32 h-24 sm:h-32 border-2 border-yellow-500 rounded-full"></div>
        </div>
        <p className="text-[#B3B3B3] text-xs sm:text-sm uppercase tracking-wider mb-3 sm:mb-4 relative z-10">Reward (This year)</p>
        <div className="flex items-center justify-center relative z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-yellow-500/20 blur-2xl rounded-full"></div>
            <Trophy size={72} className="sm:hidden text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] relative" strokeWidth={1.5} />
            <Trophy size={96} className="hidden sm:block text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] relative" strokeWidth={1.5} />
          </div>
        </div>
        <p className="text-white/60 text-xs mt-3 sm:mt-4 relative z-10">Top performing team of the year</p>
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="text-center py-16 sm:py-20">
          <Trophy size={48} className="mx-auto text-[#B3B3B3] mb-4" />
          <p className="text-white font-medium">No performance data for {currentMonthLabel}</p>
          <p className="text-[#B3B3B3] text-sm mt-1">
            {isAdmin ? "Click 'Add Details' to add manager performance data" : "Check back later for updates"}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto bg-[#191919] rounded-lg border border-white/10">
            <table className="w-full" data-testid="mgr-perf-table">
              <thead>
                <tr className="border-b border-[#3F3F3F]">
                  <th className="text-left text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium bg-[#191919]">Rank</th>
                  <th className="text-center text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium bg-[#191919]">Team</th>
                  <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium bg-[#191919]">Client Performance</th>
                  <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium bg-[#191919]">Client Feedback</th>
                  <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium bg-[#191919]">Creative Task</th>
                  <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium bg-[#191919]">Total (This month)</th>
                  <th className="text-center text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium bg-[#191919]">Report</th>
                  <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium bg-[#191919]">Total (Overall)</th>
                  {isAdmin && (
                    <th className="text-center text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium bg-[#191919]">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, index) => (
                  <tr
                    key={entry.perf_id}
                    data-testid="mgr-perf-row"
                    className={`bg-[#2F2F2F] hover:bg-[#373737] border-white/5 transition-colors ${index !== leaderboard.length - 1 ? 'border-b border-[#3F3F3F]' : ''}`}
                  >
                    <td className="py-4 px-4">
                      <div className="text-xl font-bold text-white">{getRankIcon(entry.rank)}</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col items-center gap-2">
                        {entry.manager.profile_picture ? (
                          <img src={entry.manager.profile_picture} alt={entry.team_name}
                            className="w-10 h-10 rounded-full object-cover border border-white/10" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#191919] border border-white/10 flex items-center justify-center text-white text-xs font-bold">
                            {entry.manager.first_name[0]}{entry.manager.last_name[0]}
                          </div>
                        )}
                        <span className="text-white font-medium text-sm text-center">{entry.team_name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right text-white font-medium">{entry.client_performance_score.toFixed(1)}</td>
                    <td className="py-4 px-4 text-right text-white font-medium">{entry.client_feedback_score.toFixed(1)}</td>
                    <td className="py-4 px-4 text-right text-white font-medium">{entry.creative_task_score.toFixed(1)}</td>
                    <td className="py-4 px-4 text-right">
                      <span className="text-white font-bold text-lg">{entry.total_points_month.toFixed(2)}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <ReportLinkCell url={entry.report_link} />
                    </td>
                    <td className="py-4 px-4 text-right text-[#B3B3B3] font-medium">{entry.total_points_overall.toFixed(2)}</td>
                    {isAdmin && (
                      <td className="py-4 px-4 text-center">
                        <button
                          data-testid="mgr-perf-edit-btn"
                          onClick={() => setModalState({ open: true, editing: entry })}
                          className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {leaderboard.map((entry) => (
              <div key={entry.perf_id} className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/10">
                  <div className="text-2xl font-bold text-white w-10 text-center shrink-0">{getRankIcon(entry.rank)}</div>
                  {entry.manager.profile_picture ? (
                    <img src={entry.manager.profile_picture} alt={entry.team_name}
                      className="w-10 h-10 rounded-full object-cover border border-white/10" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#191919] border border-white/10 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {entry.manager.first_name[0]}{entry.manager.last_name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{entry.team_name}</p>
                    <p className="text-[#B3B3B3] text-xs">Total: <span className="text-white font-bold">{entry.total_points_month.toFixed(2)}</span></p>
                  </div>
                  {isAdmin && (
                    <button
                      data-testid="mgr-perf-edit-btn-mobile"
                      onClick={() => setModalState({ open: true, editing: entry })}
                      className="p-2 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded transition-colors shrink-0"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[#B3B3B3]">Client Performance</span>
                    <span className="text-white font-medium">{entry.client_performance_score.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B3B3B3]">Client Feedback</span>
                    <span className="text-white font-medium">{entry.client_feedback_score.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B3B3B3]">Creative Task</span>
                    <span className="text-white font-medium">{entry.creative_task_score.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-[#B3B3B3] text-xs">Report</span>
                    <ReportLinkCell url={entry.report_link} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B3B3B3] text-xs">Overall Avg</span>
                    <span className="text-[#B3B3B3] text-sm font-medium">{entry.total_points_overall.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      {modalState.open && (
        <ManagerPerfModal
          onClose={() => setModalState({ open: false, editing: null })}
          onSuccess={handleSuccess}
          selectedMonth={selectedMonth}
          managers={managers}
          editing={modalState.editing}
        />
      )}
    </div>
  );
}
