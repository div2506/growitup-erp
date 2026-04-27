import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, Plus, Info } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

function AddDetailsModal({ onClose, onSuccess, selectedMonth, managers }) {
  const [formData, setFormData] = useState({
    manager_id: "",
    month: selectedMonth || "",
    client_performance_score: "",
    client_feedback_score: "",
    creative_task_score: "",
    client_performance_notes: "",
    client_feedback_notes: "",
    creative_task_notes: ""
  });
  const [submitting, setSubmitting] = useState(false);

  const totalPoints = formData.client_performance_score && formData.client_feedback_score && formData.creative_task_score
    ? ((parseFloat(formData.client_performance_score) + parseFloat(formData.client_feedback_score) + parseFloat(formData.creative_task_score)) / 3).toFixed(2)
    : "0.00";

  const canSubmit = formData.manager_id && formData.month &&
    formData.client_performance_score && formData.client_feedback_score && formData.creative_task_score &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    // Validate ranges
    const scores = [
      parseFloat(formData.client_performance_score),
      parseFloat(formData.client_feedback_score),
      parseFloat(formData.creative_task_score)
    ];

    for (const score of scores) {
      if (isNaN(score) || score < 0 || score > 100) {
        toast.error("All scores must be numbers between 0 and 100");
        return;
      }
    }

    setSubmitting(true);

    try {
      await axios.post(`${API}/manager-performance`, {
        manager_id: formData.manager_id,
        month: formData.month,
        client_performance_score: scores[0],
        client_feedback_score: scores[1],
        creative_task_score: scores[2],
        client_performance_notes: formData.client_performance_notes || null,
        client_feedback_notes: formData.client_feedback_notes || null,
        creative_task_notes: formData.creative_task_notes || null
      }, { withCredentials: true });

      toast.success("✅ Manager performance added successfully!");
      onSuccess();
      onClose();
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to save performance data";
      toast.error(`❌ ${msg}`);
      setSubmitting(false);
    }
  };

  const monthOptions = getMonthOptions();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-[#2F2F2F] border-white/10 text-white max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-white">Add Manager Performance Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-[#B3B3B3] text-sm">Manager *</Label>
            <Select value={formData.manager_id} onValueChange={(v) => setFormData({ ...formData, manager_id: v })}>
              <SelectTrigger className="bg-[#191919] border-white/10 text-white">
                <SelectValue placeholder="Select manager" />
              </SelectTrigger>
              <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-[300px]">
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
            <Select value={formData.month} onValueChange={(v) => setFormData({ ...formData, month: v })}>
              <SelectTrigger className="bg-[#191919] border-white/10 text-white">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-[300px]">
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

          <div className="space-y-2">
            <Label className="text-[#B3B3B3] text-sm">Client Performance Score (0-100) *</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.client_performance_score}
              onChange={(e) => setFormData({ ...formData, client_performance_score: e.target.value })}
              placeholder="Enter score (0-100)"
              className="bg-[#191919] border-white/10 text-white"
            />
            <Label className="text-[#B3B3B3] text-xs mt-1">Client Performance Notes (optional)</Label>
            <Textarea
              value={formData.client_performance_notes}
              onChange={(e) => setFormData({ ...formData, client_performance_notes: e.target.value })}
              placeholder="Add notes about client performance (optional)"
              maxLength={500}
              className="bg-[#191919] border-white/10 text-white text-sm resize-none h-20"
            />
            <div className="text-xs text-[#B3B3B3] text-right">{formData.client_performance_notes.length}/500</div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#B3B3B3] text-sm">Client Feedback (0-100) *</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.client_feedback_score}
              onChange={(e) => setFormData({ ...formData, client_feedback_score: e.target.value })}
              placeholder="Enter score (0-100)"
              className="bg-[#191919] border-white/10 text-white"
            />
            <Label className="text-[#B3B3B3] text-xs mt-1">Client Feedback Notes (optional)</Label>
            <Textarea
              value={formData.client_feedback_notes}
              onChange={(e) => setFormData({ ...formData, client_feedback_notes: e.target.value })}
              placeholder="Add notes about client feedback (optional)"
              maxLength={500}
              className="bg-[#191919] border-white/10 text-white text-sm resize-none h-20"
            />
            <div className="text-xs text-[#B3B3B3] text-right">{formData.client_feedback_notes.length}/500</div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#B3B3B3] text-sm">Creative Task (0-100) *</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.creative_task_score}
              onChange={(e) => setFormData({ ...formData, creative_task_score: e.target.value })}
              placeholder="Enter score (0-100)"
              className="bg-[#191919] border-white/10 text-white"
            />
            <Label className="text-[#B3B3B3] text-xs mt-1">Creative Task Notes (optional)</Label>
            <Textarea
              value={formData.creative_task_notes}
              onChange={(e) => setFormData({ ...formData, creative_task_notes: e.target.value })}
              placeholder="Add notes about creative task (optional)"
              maxLength={500}
              className="bg-[#191919] border-white/10 text-white text-sm resize-none h-20"
            />
            <div className="text-xs text-[#B3B3B3] text-right">{formData.creative_task_notes.length}/500</div>
          </div>

          <div className="space-y-2">
            <Label className="text-[#B3B3B3] text-sm">Total Points (This month)</Label>
            <div className="bg-[#191919] border border-white/10 text-white text-sm rounded-lg px-3 py-2 opacity-60">
              {totalPoints}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="bg-transparent border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`${canSubmit
                  ? "bg-green-500 hover:bg-green-600 text-white"
                  : "bg-white/5 text-[#B3B3B3] cursor-not-allowed"
                }`}
            >
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CreativeTeamOfMonth() {
  const { user, myEmployee } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const isAdmin = user?.is_admin || myEmployee?.department_name === "Admin";

  const monthOptions = getMonthOptions();

  // Set default month to current month
  useEffect(() => {
    if (!selectedMonth && monthOptions.length > 0) {
      setSelectedMonth(monthOptions[0].value);
    }
  }, [monthOptions, selectedMonth]);

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
      const response = await axios.get(`${API}/manager-performance?month=${selectedMonth}`, {
        withCredentials: true
      });

      const performances = response.data;

      // Calculate overall scores for each manager
      const leaderboardData = await Promise.all(
        performances.map(async (perf) => {
          // Fetch all months data for this manager to calculate overall
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
            team_name: `${perf.manager.first_name} ${perf.manager.last_name}'s Team`
          };
        })
      );

      // Sort by total_points_month descending
      leaderboardData.sort((a, b) => b.total_points_month - a.total_points_month);

      // Add ranking
      leaderboardData.forEach((entry, index) => {
        entry.rank = index + 1;
      });

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
  }, [loadManagers]);

  useEffect(() => {
    if (selectedMonth) {
      loadLeaderboard();
    }
  }, [selectedMonth, loadLeaderboard]);

  const handleAddSuccess = () => {
    loadLeaderboard();
  };

  const getRankStyle = (rank) => {
    if (rank === 1) return "bg-gradient-to-r from-yellow-600/20 to-yellow-500/10 border-yellow-500/30";
    if (rank === 2) return "bg-gradient-to-r from-gray-400/20 to-gray-300/10 border-gray-400/30";
    if (rank === 3) return "bg-gradient-to-r from-orange-600/20 to-orange-500/10 border-orange-600/30";
    return "bg-[#2F2F2F] border-white/10";
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return rank;
  };

  const currentMonthLabel = monthOptions.find(opt => opt.value === selectedMonth)?.label || "";

  return (
    <div>
      {/* Header Section */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy size={28} className="text-yellow-500" />
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Team of the month
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition-colors text-sm font-medium"
            >
              <Plus size={16} />
              Add Details
            </button>
          )}
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="bg-[#2F2F2F] border-white/10 text-white w-[180px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-[300px]">
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

      {/* Reward Banner */}
      <div className="mb-6 p-6 bg-[#2F2F2F] border border-white/10 rounded-xl text-center">
        <p className="text-[#B3B3B3] text-sm uppercase tracking-wider mb-3">Reward (This year)</p>
        <div className="flex items-center justify-center">
          <Trophy size={80} className="text-yellow-500" />
        </div>
      </div>

      {/* Leaderboard Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="text-center py-20">
          <Trophy size={48} className="mx-auto text-[#B3B3B3] mb-4" />
          <p className="text-white font-medium">No performance data for {currentMonthLabel}</p>
          <p className="text-[#B3B3B3] text-sm mt-1">
            {isAdmin ? "Click 'Add Details' to add manager performance data" : "Check back later for updates"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium">Rank</th>
                <th className="text-left text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium">Team</th>
                <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium">Client Performance</th>
                <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium">Client Feedback</th>
                <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium">Creative Task</th>
                <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium">Total (This month)</th>
                <th className="text-right text-[#B3B3B3] text-xs uppercase tracking-wider py-3 px-4 font-medium">Total (Overall)</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry) => (
                <tr
                  key={entry.perf_id}
                  className={`border border-transparent ${getRankStyle(entry.rank)} transition-colors`}
                >
                  <td className="py-4 px-4">
                    <div className="text-2xl font-bold text-white">{getRankIcon(entry.rank)}</div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col items-center gap-2">
                      {entry.manager.profile_picture ? (
                        <img
                          src={entry.manager.profile_picture}
                          alt={entry.team_name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white text-sm font-bold">
                          {entry.manager.first_name[0]}{entry.manager.last_name[0]}
                        </div>
                      )}
                      <span className="text-white font-medium text-sm">{entry.team_name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <TooltipProvider>
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-white font-medium">{entry.client_performance_score.toFixed(1)}</span>
                        {entry.client_performance_notes && entry.client_performance_notes.trim() && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info size={14} className="text-[#B3B3B3] hover:text-white cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-[#1F1F1F] border-white/20 text-white max-w-[300px] text-sm p-3">
                              {entry.client_performance_notes}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <TooltipProvider>
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-white font-medium">{entry.client_feedback_score.toFixed(1)}</span>
                        {entry.client_feedback_notes && entry.client_feedback_notes.trim() && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info size={14} className="text-[#B3B3B3] hover:text-white cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-[#1F1F1F] border-white/20 text-white max-w-[300px] text-sm p-3">
                              {entry.client_feedback_notes}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <TooltipProvider>
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-white font-medium">{entry.creative_task_score.toFixed(1)}</span>
                        {entry.creative_task_notes && entry.creative_task_notes.trim() && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info size={14} className="text-[#B3B3B3] hover:text-white cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-[#1F1F1F] border-white/20 text-white max-w-[300px] text-sm p-3">
                              {entry.creative_task_notes}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="text-white font-bold text-lg">{entry.total_points_month.toFixed(2)}</span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#B3B3B3] font-medium">{entry.total_points_overall.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Details Modal */}
      {showAddModal && (
        <AddDetailsModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
          selectedMonth={selectedMonth}
          managers={managers}
        />
      )}
    </div>
  );
}
