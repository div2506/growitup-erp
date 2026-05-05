import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Building2, Briefcase, Users, Database, Lock, ExternalLink, Upload, FileJson, Clock, RefreshCw, CheckCircle, XCircle, Hourglass, AlertCircle, CalendarDays, Copy, Key, Eye, EyeOff, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import DeleteConfirm from "@/components/DeleteConfirm";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DB_TYPES = ["Video Editing", "Thumbnail", "Script"];
const LEVELS = ["Beginner", "Intermediate", "Advanced"];

const inputCls = "bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] focus-visible:ring-white/20 focus-visible:border-white/30";
const labelCls = "text-[#B3B3B3] text-sm";

function SystemBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-white/5 text-[#B3B3B3] border border-white/10">
      <Lock size={9} /> System
    </span>
  );
}

// ================== DEPARTMENTS TAB ==================
function DepartmentsTab() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchDepts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/departments`, { withCredentials: true });
      setDepartments(data);
    } catch { toast.error("Failed to load departments"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDepts(); }, [fetchDepts]);

  const openAdd = () => { setEditDept(null); setName(""); setError(""); setShowModal(true); };
  const openEdit = (d) => { setEditDept(d); setName(d.department_name); setError(""); setShowModal(true); };

  const handleSave = async () => {
    if (!name.trim()) { setError("Department name is required"); return; }
    setSaving(true);
    try {
      if (editDept) {
        const { data } = await axios.put(`${API}/departments/${editDept.department_id}`, { department_name: name.trim() }, { withCredentials: true });
        setDepartments(prev => prev.map(d => d.department_id === data.department_id ? data : d));
        toast.success("Department updated");
      } else {
        const { data } = await axios.post(`${API}/departments`, { department_name: name.trim() }, { withCredentials: true });
        setDepartments(prev => [...prev, data]);
        toast.success("Department added");
      }
      setShowModal(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  const handleDelete = async (dept) => {
    try {
      await axios.delete(`${API}/departments/${dept.department_id}`, { withCredentials: true });
      setDepartments(prev => prev.filter(d => d.department_id !== dept.department_id));
      toast.success("Department deleted");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to delete"); }
    setDeleteTarget(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[#B3B3B3] text-sm">{departments.length} departments</p>
        <button data-testid="add-department-button" onClick={openAdd}
          className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
          <Plus size={15} /> Add Department
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[480px]" data-testid="departments-table">
            <thead className="bg-[#191919] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Name</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Type</th>
                <th className="text-right py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-[#2F2F2F] divide-y divide-white/5">
              {departments.map((dept) => (
                <tr key={dept.department_id} className="hover:bg-white/5 transition-colors" data-testid="department-row">
                  <td className="py-3.5 px-5 text-sm text-white font-medium">{dept.department_name}</td>
                  <td className="py-3.5 px-5">{dept.is_system ? <SystemBadge /> : <span className="text-xs text-[#B3B3B3]">Custom</span>}</td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button data-testid="edit-department-button" onClick={() => openEdit(dept)}
                        className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded transition-colors">
                        <Pencil size={14} />
                      </button>
                      {!dept.is_system && (
                        <button data-testid="delete-department-button" onClick={() => setDeleteTarget(dept)}
                          className="p-1.5 text-[#B3B3B3] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showModal} onOpenChange={(o) => { if (!o) setShowModal(false); }}>
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white w-[calc(100%-2rem)] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
              {editDept ? "Edit Department" : "Add Department"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className={labelCls}>Department Name *</Label>
              <Input data-testid="department-name-input" value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className={inputCls} placeholder="e.g. Marketing"
                disabled={editDept?.is_system} />
              {editDept?.is_system && <p className="text-xs text-amber-400">System departments cannot be renamed.</p>}
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowModal(false)} className="bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
              <Button data-testid="save-department-button" onClick={handleSave} disabled={saving || editDept?.is_system} className="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60">
                {saving ? "Saving..." : editDept ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirm open={!!deleteTarget} title="Delete Department"
        description={deleteTarget ? `Delete "${deleteTarget.department_name}"? This will also delete all job positions in this department.` : ""}
        onConfirm={() => handleDelete(deleteTarget)} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

// ================== JOB POSITIONS TAB ==================
function JobPositionsTab() {
  const [positions, setPositions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [form, setForm] = useState({ position_name: "", department_id: "", has_levels: false, available_levels: [] });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterDept, setFilterDept] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const [posRes, deptRes] = await Promise.all([
        axios.get(`${API}/job-positions`, { withCredentials: true }),
        axios.get(`${API}/departments`, { withCredentials: true }),
      ]);
      setPositions(posRes.data);
      setDepartments(deptRes.data);
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = filterDept === "all" ? positions : positions.filter(p => p.department_id === filterDept);

  const openAdd = () => {
    setEditPos(null);
    setForm({ position_name: "", department_id: "", has_levels: false, available_levels: [] });
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (pos) => {
    setEditPos(pos);
    setForm({ position_name: pos.position_name, department_id: pos.department_id, has_levels: pos.has_levels, available_levels: pos.available_levels || [] });
    setErrors({});
    setShowModal(true);
  };

  const toggleLevel = (level) => {
    setForm(prev => ({
      ...prev,
      available_levels: prev.available_levels.includes(level)
        ? prev.available_levels.filter(l => l !== level)
        : [...prev.available_levels, level]
    }));
  };

  const handleSave = async () => {
    const e = {};
    if (!form.position_name.trim()) e.position_name = "Required";
    if (!form.department_id) e.department_id = "Required";
    if (form.has_levels && form.available_levels.length === 0) e.available_levels = "Select at least one level";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    try {
      const payload = { ...form };
      if (editPos) {
        const { data } = await axios.put(`${API}/job-positions/${editPos.position_id}`, payload, { withCredentials: true });
        setPositions(prev => prev.map(p => p.position_id === data.position_id ? data : p));
        toast.success("Position updated");
      } else {
        const { data } = await axios.post(`${API}/job-positions`, payload, { withCredentials: true });
        setPositions(prev => [...prev, data]);
        toast.success("Position added");
      }
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  const handleDelete = async (pos) => {
    try {
      await axios.delete(`${API}/job-positions/${pos.position_id}`, { withCredentials: true });
      setPositions(prev => prev.filter(p => p.position_id !== pos.position_id));
      toast.success("Position deleted");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to delete"); }
    setDeleteTarget(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-[#B3B3B3] text-sm">{filtered.length} positions</p>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="bg-[#191919] border border-white/10 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/20">
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
          </select>
        </div>
        <button data-testid="add-position-button" onClick={openAdd}
          className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
          <Plus size={15} /> Add Position
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-[#191919] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Position</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Department</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Levels</th>
                <th className="text-right py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-[#2F2F2F] divide-y divide-white/5">
              {filtered.map((pos) => (
                <tr key={pos.position_id} className="hover:bg-white/5 transition-colors">
                  <td className="py-3.5 px-5 text-sm text-white font-medium">
                    <div className="flex items-center gap-2">{pos.position_name}{pos.is_system && <SystemBadge />}</div>
                  </td>
                  <td className="py-3.5 px-5 text-sm text-[#B3B3B3]">{pos.department_name}</td>
                  <td className="py-3.5 px-5">
                    {pos.has_levels ? (
                      <div className="flex gap-1 flex-wrap">
                        {(pos.available_levels || []).map(l => (
                          <span key={l} className="px-1.5 py-0.5 text-[10px] bg-white/5 text-[#B3B3B3] rounded border border-white/10">{l}</span>
                        ))}
                      </div>
                    ) : <span className="text-[#B3B3B3] text-xs">—</span>}
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(pos)} className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded transition-colors">
                        <Pencil size={14} />
                      </button>
                      {!pos.is_system && (
                        <button onClick={() => setDeleteTarget(pos)} className="p-1.5 text-[#B3B3B3] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showModal} onOpenChange={(o) => { if (!o) setShowModal(false); }}>
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white w-[calc(100%-2rem)] max-w-lg rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
              {editPos ? "Edit Position" : "Add Job Position"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className={labelCls}>Position Name *</Label>
              <Input value={form.position_name} onChange={e => setForm(p => ({ ...p, position_name: e.target.value }))}
                className={inputCls} placeholder="e.g. Content Creator"
                disabled={editPos?.is_system} />
              {editPos?.is_system && <p className="text-xs text-amber-400">System positions cannot be renamed.</p>}
              {errors.position_name && <p className="text-red-400 text-xs">{errors.position_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Department *</Label>
              <Select value={form.department_id} onValueChange={v => setForm(p => ({ ...p, department_id: v }))}>
                <SelectTrigger className={`${inputCls} focus:ring-0`}><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10">
                  {departments.map(d => <SelectItem key={d.department_id} value={d.department_id} className="text-white focus:bg-white/10">{d.department_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.department_id && <p className="text-red-400 text-xs">{errors.department_id}</p>}
            </div>
            <div className="flex items-center justify-between">
              <Label className={labelCls}>Has Levels?</Label>
              <Switch checked={form.has_levels} onCheckedChange={v => setForm(p => ({ ...p, has_levels: v, available_levels: [] }))} />
            </div>
            {form.has_levels && (
              <div className="space-y-1.5">
                <Label className={labelCls}>Available Levels *</Label>
                <div className="flex gap-2 flex-wrap">
                  {LEVELS.map(l => (
                    <button key={l} type="button" onClick={() => toggleLevel(l)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.available_levels.includes(l) ? "bg-white/10 text-white border-white/30" : "bg-transparent text-[#B3B3B3] border-white/10 hover:border-white/20"}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {errors.available_levels && <p className="text-red-400 text-xs">{errors.available_levels}</p>}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowModal(false)} className="bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60">
                {saving ? "Saving..." : editPos ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirm open={!!deleteTarget} title="Delete Position"
        description={deleteTarget ? `Delete "${deleteTarget.position_name}"?` : ""}
        onConfirm={() => handleDelete(deleteTarget)} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

// ================== TEAMS TAB ==================
function TeamsTab() {
  const [teams, setTeams] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTeam, setEditTeam] = useState(null);
  const [form, setForm] = useState({ team_name: "", team_manager_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [teamsRes, empsRes] = await Promise.all([
        axios.get(`${API}/teams`, { withCredentials: true }),
        axios.get(`${API}/employees`, { withCredentials: true }),
      ]);
      setTeams(teamsRes.data);
      setEmployees(empsRes.data);
    } catch { toast.error("Failed to load teams"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => { setEditTeam(null); setForm({ team_name: "", team_manager_id: "" }); setError(""); setShowModal(true); };
  const openEdit = (t) => { setEditTeam(t); setForm({ team_name: t.team_name, team_manager_id: t.team_manager_id || "" }); setError(""); setShowModal(true); };

  const handleSave = async () => {
    if (!form.team_name.trim()) { setError("Team name is required"); return; }
    setSaving(true);
    try {
      const payload = { team_name: form.team_name.trim(), team_manager_id: form.team_manager_id || null };
      if (editTeam) {
        const { data } = await axios.put(`${API}/teams/${editTeam.team_id}`, payload, { withCredentials: true });
        setTeams(prev => prev.map(t => t.team_id === data.team_id ? data : t));
        toast.success("Team updated");
      } else {
        const { data } = await axios.post(`${API}/teams`, payload, { withCredentials: true });
        setTeams(prev => [...prev, data]);
        toast.success("Team created");
      }
      setShowModal(false);
    } catch (err) { setError(err.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  const handleDelete = async (team) => {
    try {
      await axios.delete(`${API}/teams/${team.team_id}`, { withCredentials: true });
      setTeams(prev => prev.filter(t => t.team_id !== team.team_id));
      toast.success("Team deleted");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to delete"); }
    setDeleteTarget(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[#B3B3B3] text-sm">{teams.length} teams</p>
        <button data-testid="add-team-button" onClick={openAdd}
          className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
          <Plus size={15} /> Add Team
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={32} className="text-[#B3B3B3] mb-3" />
          <p className="text-white font-medium">No teams yet</p>
          <p className="text-[#B3B3B3] text-sm">Create a team and assign a manager</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[480px]" data-testid="teams-table">
            <thead className="bg-[#191919] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Team Name</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Manager</th>
                <th className="text-right py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-[#2F2F2F] divide-y divide-white/5">
              {teams.map((team) => (
                <tr key={team.team_id} className="hover:bg-white/5 transition-colors" data-testid="team-row">
                  <td className="py-3.5 px-5 text-sm text-white font-medium">{team.team_name}</td>
                  <td className="py-3.5 px-5 text-sm text-[#B3B3B3]">{team.team_manager_name || "—"}</td>
                  <td className="py-3.5 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button data-testid="edit-team-button" onClick={() => openEdit(team)} className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded transition-colors"><Pencil size={14} /></button>
                      <button data-testid="delete-team-button" onClick={() => setDeleteTarget(team)} className="p-1.5 text-[#B3B3B3] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showModal} onOpenChange={(o) => { if (!o) setShowModal(false); }}>
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white w-[calc(100%-2rem)] max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
              {editTeam ? "Edit Team" : "Create Team"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className={labelCls}>Team Name *</Label>
              <Input data-testid="team-name-input" value={form.team_name}
                onChange={e => { setForm(p => ({ ...p, team_name: e.target.value })); setError(""); }}
                className={inputCls} placeholder="e.g. Content Team A" />
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Team Manager</Label>
              <Select value={form.team_manager_id || "__none__"} onValueChange={v => setForm(p => ({ ...p, team_manager_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger data-testid="team-manager-select" className={`${inputCls} focus:ring-0`}><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-52">
                  <SelectItem value="__none__" className="text-[#B3B3B3] focus:bg-white/10">None</SelectItem>
                  {employees.map(e => (
                    <SelectItem key={e.employee_id} value={e.employee_id} className="text-white focus:bg-white/10">
                      {e.first_name} {e.last_name} ({e.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowModal(false)} className="bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
              <Button data-testid="save-team-button" onClick={handleSave} disabled={saving} className="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60">
                {saving ? "Saving..." : editTeam ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirm open={!!deleteTarget} title="Delete Team"
        description={deleteTarget ? `Delete "${deleteTarget.team_name}"?` : ""}
        onConfirm={() => handleDelete(deleteTarget)} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

// ================== NOTION INTEGRATION TAB ==================
function NotionIntegrationTab() {
  const [databases, setDatabases] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editDb, setEditDb] = useState(null);
  const [form, setForm] = useState({ database_name: "", notion_api_token: "", notion_database_id: "", database_type: "Video Editing", team_id: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const API_URL = process.env.REACT_APP_BACKEND_URL;

  const fetchData = useCallback(async () => {
    try {
      const [dbRes, teamsRes] = await Promise.all([
        axios.get(`${API}/notion-databases`, { withCredentials: true }),
        axios.get(`${API}/teams`, { withCredentials: true }),
      ]);
      setDatabases(dbRes.data);
      setTeams(teamsRes.data);
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => {
    setEditDb(null);
    setForm({ database_name: "", notion_api_token: "", notion_database_id: "", database_type: "Video Editing", team_id: "", is_active: true });
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (db) => {
    setEditDb(db);
    setForm({ database_name: db.database_name, notion_api_token: db.notion_api_token, notion_database_id: db.notion_database_id, database_type: db.database_type, team_id: db.team_id, is_active: db.is_active });
    setErrors({});
    setShowModal(true);
  };

  const handleSave = async () => {
    const e = {};
    if (!form.database_name.trim()) e.database_name = "Required";
    if (!form.notion_api_token.trim()) e.notion_api_token = "Required";
    if (!form.notion_database_id.trim()) e.notion_database_id = "Required";
    if (!form.team_id) e.team_id = "Required";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    try {
      if (editDb) {
        const { data } = await axios.put(`${API}/notion-databases/${editDb.db_id}`, form, { withCredentials: true });
        setDatabases(prev => prev.map(d => d.db_id === data.db_id ? data : d));
        toast.success("Integration updated");
      } else {
        const { data } = await axios.post(`${API}/notion-databases`, form, { withCredentials: true });
        setDatabases(prev => [...prev, data]);
        toast.success("Integration added");
      }
      setShowModal(false);
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  const handleDelete = async (db) => {
    try {
      await axios.delete(`${API}/notion-databases/${db.db_id}`, { withCredentials: true });
      setDatabases(prev => prev.filter(d => d.db_id !== db.db_id));
      toast.success("Integration deleted");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to delete"); }
    setDeleteTarget(null);
  };

  const webhookUrl = (notionDbId) => `${API_URL}/api/webhooks/notion/${notionDbId}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[#B3B3B3] text-sm">{databases.length} integrations</p>
        <button data-testid="add-notion-db-button" onClick={openAdd}
          className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
          <Plus size={15} /> Add Integration
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : databases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Database size={32} className="text-[#B3B3B3] mb-3" />
          <p className="text-white font-medium">No Notion integrations yet</p>
          <p className="text-[#B3B3B3] text-sm">Connect a Notion database to start receiving performance data</p>
        </div>
      ) : (
        <div className="space-y-3">
          {databases.map((db) => (
            <div key={db.db_id} data-testid="notion-db-row" className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-medium text-sm">{db.database_name}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${db.is_active ? "bg-green-500/15 text-green-400" : "bg-white/5 text-[#B3B3B3]"}`}>
                      {db.is_active ? "Active" : "Inactive"}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/15 text-blue-400">{db.database_type}</span>
                  </div>
                  <p className="text-[#B3B3B3] text-xs mb-2">Team: {db.team_name || "—"}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#B3B3B3]">Webhook URL:</span>
                    <code className="text-[10px] text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded font-mono truncate max-w-xs">
                      {webhookUrl(db.notion_database_id)}
                    </code>
                    <button onClick={() => { navigator.clipboard.writeText(webhookUrl(db.notion_database_id)); toast.success("Webhook URL copied!"); }}
                      className="text-[#B3B3B3] hover:text-white transition-colors" title="Copy webhook URL">
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button data-testid="edit-notion-db-button" onClick={() => openEdit(db)} className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded transition-colors"><Pencil size={14} /></button>
                  <button data-testid="delete-notion-db-button" onClick={() => setDeleteTarget(db)} className="p-1.5 text-[#B3B3B3] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={(o) => { if (!o) setShowModal(false); }}>
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white w-[calc(100%-2rem)] max-w-lg rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
              {editDb ? "Edit Integration" : "Add Notion Integration"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label className={labelCls}>Integration Name *</Label>
              <Input data-testid="notion-db-name-input" value={form.database_name}
                onChange={e => setForm(p => ({ ...p, database_name: e.target.value }))}
                className={inputCls} placeholder="e.g. Video Editing DB - Team A" />
              {errors.database_name && <p className="text-red-400 text-xs">{errors.database_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Notion API Token *</Label>
              <Input data-testid="notion-token-input" type="password" value={form.notion_api_token}
                onChange={e => setForm(p => ({ ...p, notion_api_token: e.target.value }))}
                className={inputCls} placeholder="secret_xxxxxxxxxxxx" />
              {errors.notion_api_token && <p className="text-red-400 text-xs">{errors.notion_api_token}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Notion Database ID *</Label>
              <Input data-testid="notion-db-id-input" value={form.notion_database_id}
                onChange={e => setForm(p => ({ ...p, notion_database_id: e.target.value }))}
                className={inputCls} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
              {errors.notion_database_id && <p className="text-red-400 text-xs">{errors.notion_database_id}</p>}
              <p className="text-[#B3B3B3] text-[10px]">Found in your Notion database URL after the workspace name.</p>
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Database Type *</Label>
              <Select value={form.database_type} onValueChange={v => setForm(p => ({ ...p, database_type: v }))}>
                <SelectTrigger className={`${inputCls} focus:ring-0`}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10">
                  {DB_TYPES.map(t => <SelectItem key={t} value={t} className="text-white focus:bg-white/10">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Team *</Label>
              <Select value={form.team_id} onValueChange={v => setForm(p => ({ ...p, team_id: v }))}>
                <SelectTrigger data-testid="notion-team-select" className={`${inputCls} focus:ring-0`}><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10">
                  {teams.map(t => <SelectItem key={t.team_id} value={t.team_id} className="text-white focus:bg-white/10">{t.team_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.team_id && <p className="text-red-400 text-xs">{errors.team_id}</p>}
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className={labelCls}>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowModal(false)} className="bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
              <Button data-testid="save-notion-db-button" onClick={handleSave} disabled={saving} className="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60">
                {saving ? "Saving..." : editDb ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirm open={!!deleteTarget} title="Delete Integration"
        description={deleteTarget ? `Delete "${deleteTarget.database_name}"? This will stop receiving webhook data.` : ""}
        onConfirm={() => handleDelete(deleteTarget)} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

// ================== ATTENDANCE INTEGRATION TAB ==================
function AttendanceIntegrationTab() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/attendance/integration-info`, { withCredentials: true });
        if (!cancelled) setApiKey(data.api_key || "");
      } catch {
        if (!cancelled) setApiKey("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const baseUrl = process.env.REACT_APP_BACKEND_URL || "";
  const endpointUrl = `${baseUrl}/api/attendance/entries`;
  const exampleBodyBiometric = JSON.stringify(
    { source: "easytime_pro", biometric_employee_code: "12", timestamp: "2026-05-04T09:15:30" },
    null, 2
  );
  const exampleBodyDirect = JSON.stringify(
    { employee_id: "GM002", timestamp: "2026-05-04T09:15:30" },
    null, 2
  );
  const successResponse = JSON.stringify(
    { success: true, message: "Attendance entry recorded", entry_id: "ae_abc123def456" },
    null, 2
  );
  const skippedResponse = JSON.stringify(
    { success: true, message: "Punch already recorded", skipped: true },
    null, 2
  );
  const errorResponse = JSON.stringify(
    { detail: "No employee found for biometric code 12" },
    null, 2
  );

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const maskedKey = apiKey ? `${apiKey.slice(0, 4)}${"•".repeat(Math.max(apiKey.length - 8, 4))}${apiKey.slice(-4)}` : "—";

  return (
    <div className="space-y-6 max-w-4xl" data-testid="attendance-integration-tab">
      {/* Intro */}
      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-5">
        <div className="flex items-start gap-3">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 shrink-0">
            <Fingerprint size={20} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-base">Attendance Integration</h3>
            <p className="text-[#B3B3B3] text-sm mt-0.5">
              Use this REST endpoint to push biometric punches from your hardware/software into the system in real time.
            </p>
          </div>
        </div>
      </div>

      {/* Endpoint */}
      <section data-testid="att-int-endpoint">
        <h4 className="text-[#B3B3B3] text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
          <ExternalLink size={13} /> API Endpoint
        </h4>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 flex items-center gap-3">
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-green-500/10 text-green-400 border border-green-500/30 shrink-0">POST</span>
          <code className="flex-1 text-white text-sm font-mono break-all" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {endpointUrl}
          </code>
          <button
            data-testid="copy-att-endpoint-btn"
            onClick={() => copy(endpointUrl, "Endpoint URL")}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white transition-colors"
          >
            <Copy size={13} /> Copy URL
          </button>
        </div>
      </section>

      <hr className="border-white/10" />

      {/* Authentication */}
      <section data-testid="att-int-auth">
        <h4 className="text-[#B3B3B3] text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
          <Key size={13} /> Authentication
        </h4>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 space-y-3">
          <p className="text-[#B3B3B3] text-sm">
            All requests must include the <code className="bg-white/5 px-1.5 py-0.5 rounded text-white text-xs font-mono">X-API-Key</code> header. Keep this key secret — anyone with it can post attendance.
          </p>
          <div className="flex items-center gap-3 bg-[#191919] border border-white/10 rounded-lg px-3 py-2">
            <code className="flex-1 text-white text-sm font-mono break-all" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {loading ? "Loading…" : showKey ? (apiKey || "—") : maskedKey}
            </code>
            <button
              data-testid="toggle-att-key-btn"
              onClick={() => setShowKey(s => !s)}
              disabled={!apiKey}
              className="shrink-0 p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded transition-colors disabled:opacity-40"
              title={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              data-testid="copy-att-key-btn"
              onClick={() => copy(apiKey, "API key")}
              disabled={!apiKey}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white transition-colors disabled:opacity-40"
            >
              <Copy size={13} /> Copy Key
            </button>
          </div>
        </div>
      </section>

      <hr className="border-white/10" />

      {/* Request Format */}
      <section data-testid="att-int-request">
        <h4 className="text-[#B3B3B3] text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
          <FileJson size={13} /> Request Format
        </h4>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4 space-y-4">
          <div>
            <p className="text-[#B3B3B3] text-xs mb-1.5">Headers</p>
            <pre className="bg-[#191919] border border-white/10 rounded-lg p-3 text-white text-sm font-mono whitespace-pre-wrap" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
{`Content-Type: application/json
X-API-Key: <your-api-key>`}
            </pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[#B3B3B3] text-xs">Option A — Biometric device code <span className="text-blue-400 font-medium">(recommended for EasyTime Pro / ZKTeco)</span></p>
              <button data-testid="copy-att-body-btn" onClick={() => copy(exampleBodyBiometric, "Request body")} className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-white transition-colors">
                <Copy size={11} /> Copy
              </button>
            </div>
            <pre className="bg-[#191919] border border-white/10 rounded-lg p-3 text-white text-sm font-mono whitespace-pre overflow-x-auto" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
{exampleBodyBiometric}
            </pre>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[#B3B3B3] text-xs">Option B — Direct HRMS employee ID</p>
              <button onClick={() => copy(exampleBodyDirect, "Request body")} className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-white transition-colors">
                <Copy size={11} /> Copy
              </button>
            </div>
            <pre className="bg-[#191919] border border-white/10 rounded-lg p-3 text-white text-sm font-mono whitespace-pre overflow-x-auto" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
{exampleBodyDirect}
            </pre>
          </div>
        </div>
      </section>

      <hr className="border-white/10" />

      {/* Parameters */}
      <section data-testid="att-int-params">
        <h4 className="text-[#B3B3B3] text-xs uppercase tracking-wider font-semibold mb-2">Parameters</h4>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 divide-y divide-white/10">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-white font-mono text-sm" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>biometric_employee_code</code>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-[#B3B3B3] border border-white/10">string</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">Option A</span>
            </div>
            <p className="text-[#B3B3B3] text-sm">The employee&apos;s code in the biometric device (e.g. <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">12</code>). Must match the <strong className="text-white">Biometric Employee Code</strong> set in the employee profile.</p>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-white font-mono text-sm" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>employee_id</code>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-[#B3B3B3] border border-white/10">string</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-[#B3B3B3] border border-white/10">Option B</span>
            </div>
            <p className="text-[#B3B3B3] text-sm">Direct HRMS employee ID (e.g., <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">GM002</code>). Use only if the biometric device is configured with HRMS IDs.</p>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-white font-mono text-sm" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>source</code>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-[#B3B3B3] border border-white/10">string</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-[#B3B3B3] border border-white/10">optional</span>
            </div>
            <p className="text-[#B3B3B3] text-sm">Identifier for the punch source, e.g. <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">easytime_pro</code> or <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">zkteco</code>. Stored for audit purposes.</p>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-white font-mono text-sm" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>timestamp</code>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-[#B3B3B3] border border-white/10">string</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30">required</span>
            </div>
            <p className="text-[#B3B3B3] text-sm">
              ISO 8601 format: <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">YYYY-MM-DDTHH:MM:SS</code>. Example: <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">2026-05-04T09:15:30</code>.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-white/10" />

      {/* How punches are processed */}
      <section data-testid="att-int-behaviour">
        <h4 className="text-[#B3B3B3] text-xs uppercase tracking-wider font-semibold mb-2">How punches are processed</h4>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 divide-y divide-white/10">
          <div className="p-4 flex items-start gap-3">
            <span className="mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 shrink-0">1 punch</span>
            <p className="text-[#B3B3B3] text-sm">Stored as <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">check_in</code>. Check-out is left empty. Status is set to <strong className="text-white">Incomplete</strong> until the next punch arrives.</p>
          </div>
          <div className="p-4 flex items-start gap-3">
            <span className="mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold bg-green-500/10 text-green-400 border border-green-500/30 shrink-0">2+ punches</span>
            <p className="text-[#B3B3B3] text-sm">First punch = <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">check_in</code>, last punch = <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">check_out</code>. Total hours calculated and status set to <strong className="text-white">Present / Half Day / Absent</strong> based on hours worked.</p>
          </div>
          <div className="p-4 flex items-start gap-3">
            <span className="mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30 shrink-0">Forgot punch-out</span>
            <p className="text-[#B3B3B3] text-sm">When the next day&apos;s first punch arrives, if yesterday still has only 1 punch, it is automatically marked as <strong className="text-white">Forgot Punch Out</strong>. Admin can manually edit the check-out time to correct it.</p>
          </div>
          <div className="p-4 flex items-start gap-3">
            <span className="mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold bg-white/5 text-[#B3B3B3] border border-white/10 shrink-0">Duplicate</span>
            <p className="text-[#B3B3B3] text-sm">If the same <code className="bg-white/5 px-1 rounded text-white text-xs font-mono">employee_id + timestamp</code> is sent again, it is silently skipped. Safe to re-send bulk data.</p>
          </div>
        </div>
      </section>

      <hr className="border-white/10" />

      {/* Response */}
      <section data-testid="att-int-response">
        <h4 className="text-[#B3B3B3] text-xs uppercase tracking-wider font-semibold mb-2">Response</h4>
        <div className="space-y-3">
          <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-green-500/10 text-green-400 border border-green-500/30">200 OK</span>
              <span className="text-[#B3B3B3] text-xs">Punch recorded</span>
            </div>
            <pre className="bg-[#191919] border border-white/10 rounded-lg p-3 text-white text-sm font-mono whitespace-pre overflow-x-auto" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
{successResponse}
            </pre>
          </div>
          <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-green-500/10 text-green-400 border border-green-500/30">200 OK</span>
              <span className="text-[#B3B3B3] text-xs">Duplicate — already recorded, skipped</span>
            </div>
            <pre className="bg-[#191919] border border-white/10 rounded-lg p-3 text-white text-sm font-mono whitespace-pre overflow-x-auto" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
{skippedResponse}
            </pre>
          </div>
          <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/30">400 Bad Request</span>
              <span className="text-[#B3B3B3] text-xs">Invalid employee or timestamp</span>
            </div>
            <pre className="bg-[#191919] border border-white/10 rounded-lg p-3 text-white text-sm font-mono whitespace-pre overflow-x-auto" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
{errorResponse}
            </pre>
          </div>
          <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">401 Unauthorized</span>
              <span className="text-[#B3B3B3] text-xs">Missing or invalid API key</span>
            </div>
            <pre className="bg-[#191919] border border-white/10 rounded-lg p-3 text-white text-sm font-mono whitespace-pre overflow-x-auto" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
{`{
  "detail": "Invalid or missing API key"
}`}
            </pre>
          </div>
        </div>
      </section>

      <hr className="border-white/10" />

      {/* cURL example */}
      <section data-testid="att-int-curl">
        <h4 className="text-[#B3B3B3] text-xs uppercase tracking-wider font-semibold mb-2">Quick test (cURL)</h4>
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
          <pre className="bg-[#191919] border border-white/10 rounded-lg p-3 text-white text-sm font-mono whitespace-pre-wrap break-all" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
{`curl -X POST '${endpointUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: <your-api-key>' \\
  -d '{"employee_id":"GM002","timestamp":"2026-05-04T09:15:30"}'`}
          </pre>
        </div>
      </section>
    </div>
  );
}


// ================== DATA IMPORT TAB ==================
function DataImportTab() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith(".json")) {
        toast.error("Only .json files are accepted");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setProgress("Validating...");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      setProgress("Processing...");
      await new Promise(r => setTimeout(r, 300));
      setProgress("Importing...");

      const response = await fetch(`${API}/import/performance`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(`Error: ${data.detail || "Import failed"}`);
      } else {
        toast.success(`Successfully imported ${data.imported} documents${data.skipped > 0 ? `, skipped ${data.skipped} duplicates` : ""}`);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      toast.error("Error: Failed to connect to server");
    } finally {
      setImporting(false);
      setProgress("");
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-lg">
      <div className="mb-5">
        <h2 className="text-white text-base font-semibold" style={{ fontFamily: "Manrope, sans-serif" }}>
          Import Performance Data
        </h2>
        <p className="text-[#B3B3B3] text-xs mt-1">
          Upload a JSON file containing performance data. File must be a JSON array with performance records.
        </p>
      </div>

      <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-6 space-y-5">
        {/* File Upload Area */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
            id="json-file-input"
            data-testid="json-file-input"
          />
          <label htmlFor="json-file-input">
            <div
              data-testid="file-upload-area"
              className="border border-dashed border-white/20 rounded-lg p-8 text-center cursor-pointer hover:border-white/40 hover:bg-white/5 transition-all"
            >
              <FileJson size={28} className="text-[#B3B3B3] mx-auto mb-3" />
              <p className="text-white text-sm font-medium mb-1">Choose File</p>
              <p className="text-[#B3B3B3] text-xs">Click to browse or drag and drop</p>
              <p className="text-[#B3B3B3] text-[10px] mt-1">Accepts .json files only</p>
            </div>
          </label>
        </div>

        {/* Selected File Info */}
        {selectedFile && (
          <div data-testid="selected-file-info" className="flex items-center gap-3 bg-[#191919] rounded-lg px-4 py-3 border border-white/10">
            <FileJson size={18} className="text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm truncate">{selectedFile.name}</p>
              <p className="text-[#B3B3B3] text-xs">{formatSize(selectedFile.size)}</p>
            </div>
            <button
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-[#B3B3B3] hover:text-red-400 transition-colors text-xs px-2 py-1 rounded hover:bg-red-400/10"
              data-testid="remove-file-button"
            >
              Remove
            </button>
          </div>
        )}

        {/* Progress */}
        {importing && progress && (
          <div data-testid="import-progress" className="flex items-center gap-3 text-[#B3B3B3] text-sm">
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />
            {progress}
          </div>
        )}

        {/* Import Button */}
        <button
          data-testid="import-button"
          onClick={handleImport}
          disabled={!selectedFile || importing}
          className="w-full flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Upload size={15} />
          {importing ? "Importing..." : "Import"}
        </button>
      </div>
    </div>
  );
}


// ================== SHIFTS TAB ==================
const BREAK_OPTIONS = [0, 30, 60, 90, 120];

function formatTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function calcHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let startM = sh * 60 + sm;
  let endM = eh * 60 + em;
  if (endM <= startM) endM += 24 * 60;
  return ((endM - startM) / 60).toFixed(2);
}

function ShiftsTab() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editShift, setEditShift] = useState(null);
  const [form, setForm] = useState({ shift_name: "", start_time: "09:00", end_time: "18:00", break_duration: 60 });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/shifts`, { withCredentials: true });
      setShifts(data);
    } catch { toast.error("Failed to load shifts"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  const openAdd = () => {
    setEditShift(null);
    setForm({ shift_name: "", start_time: "09:00", end_time: "18:00", break_duration: 60 });
    setFormErrors({});
    setShowModal(true);
  };
  const openEdit = (s) => {
    setEditShift(s);
    setForm({ shift_name: s.shift_name, start_time: s.start_time, end_time: s.end_time, break_duration: s.break_duration });
    setFormErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const e = {};
    if (!form.shift_name.trim()) e.shift_name = "Shift name is required";
    if (!form.start_time) e.start_time = "Start time is required";
    if (!form.end_time) e.end_time = "End time is required";
    if (form.start_time && form.end_time && form.start_time === form.end_time) e.end_time = "End time must differ from start time";
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editShift) {
        const { data } = await axios.put(`${API}/shifts/${editShift.shift_id}`, form, { withCredentials: true });
        setShifts(prev => prev.map(s => s.shift_id === data.shift_id ? { ...s, ...data } : s));
        toast.success("Shift updated");
      } else {
        const { data } = await axios.post(`${API}/shifts`, form, { withCredentials: true });
        setShifts(prev => [...prev, { ...data, employee_count: 0 }]);
        toast.success("Shift created");
      }
      setShowModal(false);
    } catch (err) {
      setFormErrors(e => ({ ...e, shift_name: err.response?.data?.detail || "Failed to save" }));
    } finally { setSaving(false); }
  };

  const handleDelete = async (shift) => {
    try {
      await axios.delete(`${API}/shifts/${shift.shift_id}`, { withCredentials: true });
      toast.success("Shift deleted");
      fetchShifts();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to delete"); }
    setDeleteTarget(null);
  };

  const totalHours = calcHours(form.start_time, form.end_time);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[#B3B3B3] text-sm">{shifts.length} shift{shifts.length !== 1 ? "s" : ""}</p>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
          <Plus size={15} /> Add Shift
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-[#191919] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Shift Name</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Timing</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Hours</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Break</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Employees</th>
                <th className="py-3 px-4 w-24" />
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift, i) => (
                <tr key={shift.shift_id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${i % 2 === 0 ? "bg-[#2F2F2F]" : "bg-[#2F2F2F]/60"}`}>
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{shift.shift_name}</span>
                      {shift.is_system_default && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <Lock size={9} /> Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-[#B3B3B3]">{formatTime(shift.start_time)} – {formatTime(shift.end_time)}</td>
                  <td className="py-3 px-4 text-sm text-white">{shift.total_hours}h</td>
                  <td className="py-3 px-4 text-sm text-[#B3B3B3]">{shift.break_duration} min</td>
                  <td className="py-3 px-4 text-sm text-[#B3B3B3]">{shift.employee_count || 0}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(shift)} className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <Pencil size={14} />
                      </button>
                      {!shift.is_system_default && (
                        <button onClick={() => setDeleteTarget(shift)} className="p-1.5 text-[#B3B3B3] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Shift Modal */}
      <Dialog open={showModal} onOpenChange={(o) => { if (!o) setShowModal(false); }}>
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-md w-[calc(100%-2rem)] rounded-xl p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/10 shrink-0">
            <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
              {editShift ? "Edit Shift" : "Add New Shift"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 py-5 space-y-4">
            <div className="space-y-1">
              <Label className={labelCls}>Shift Name *</Label>
              <Input value={form.shift_name} onChange={e => setForm(f => ({ ...f, shift_name: e.target.value }))}
                disabled={editShift?.is_system_default}
                className={`${inputCls} ${editShift?.is_system_default ? "opacity-50 cursor-not-allowed" : ""}`}
                placeholder="e.g. Early 8-5" />
              {editShift?.is_system_default && <p className="text-[#666] text-xs">System default shift name cannot be changed</p>}
              {formErrors.shift_name && <p className="text-red-400 text-xs">{formErrors.shift_name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>Start Time *</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className={inputCls} />
                {formErrors.start_time && <p className="text-red-400 text-xs">{formErrors.start_time}</p>}
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>End Time *</Label>
                <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className={inputCls} />
                {formErrors.end_time && <p className="text-red-400 text-xs">{formErrors.end_time}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label className={labelCls}>Break Duration *</Label>
              <Select value={String(form.break_duration)} onValueChange={v => setForm(f => ({ ...f, break_duration: Number(v) }))}>
                <SelectTrigger className={`${inputCls} focus:ring-0`}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10">
                  {BREAK_OPTIONS.map(b => <SelectItem key={b} value={String(b)} className="text-white focus:bg-white/10">{b === 0 ? "No break" : `${b} minutes`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Calculated Total Hours */}
            <div className="bg-[#191919] border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-[#B3B3B3] text-sm">Total Hours (calculated)</span>
              <span className="text-white font-semibold text-lg">{totalHours}h</span>
            </div>
          </div>
          <div className="px-5 pb-5 flex gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}
              className="flex-1 bg-transparent border-white/20 text-[#B3B3B3] hover:bg-white/5 hover:text-white min-h-[44px]">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}
              className="flex-1 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 min-h-[44px]">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <DeleteConfirm
          message={`Are you sure you want to delete "${deleteTarget.shift_name}"? ${deleteTarget.employee_count > 0 ? `${deleteTarget.employee_count} employee(s) assigned to this shift will be moved to "Regular 9-6".` : ""}`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}


// ================== SHIFT REQUESTS TAB ==================
export function ShiftRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("Pending");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [processing, setProcessing] = useState(null);

  const fetchRequests = useCallback(async (statusFilter) => {
    setLoading(true);
    try {
      const params = statusFilter !== "All" ? `?status=${statusFilter}` : "";
      const { data } = await axios.get(`${API}/shift-change-requests${params}`, { withCredentials: true });
      setRequests(data);
    } catch { toast.error("Failed to load requests"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(activeFilter); }, [activeFilter, fetchRequests]);

  const handleApprove = async (requestId, empName) => {
    setProcessing(requestId);
    try {
      await axios.put(`${API}/shift-change-requests/${requestId}/review`, { status: "Approved" }, { withCredentials: true });
      toast.success(`Shift change approved for ${empName}`);
      fetchRequests(activeFilter);
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to approve"); }
    finally { setProcessing(null); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setProcessing(rejectTarget.request_id);
    try {
      await axios.put(`${API}/shift-change-requests/${rejectTarget.request_id}/review`,
        { status: "Rejected", admin_notes: rejectNotes.trim() || "" },
        { withCredentials: true }
      );
      toast.success("Shift change rejected");
      setRejectTarget(null);
      setRejectNotes("");
      fetchRequests(activeFilter);
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to reject"); }
    finally { setProcessing(null); }
  };

  const formatDate = (d) => {
    if (!d) return "—";
    try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return d; }
  };

  const filterTabs = ["Pending", "Approved", "Rejected", "All"];
  const statusColors = {
    Pending: "bg-amber-400/10 text-amber-400 border-amber-400/20",
    Approved: "bg-green-400/10 text-green-400 border-green-400/20",
    Rejected: "bg-red-400/10 text-red-400 border-red-400/20",
  };

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {filterTabs.map(f => (
          <button key={f} onClick={() => setActiveFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeFilter === f ? "bg-white/10 text-white" : "text-[#B3B3B3] hover:bg-white/5 hover:text-white"}`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : requests.length === 0 ? (
        <div className="bg-[#2F2F2F] rounded-xl border border-white/10 p-10 text-center">
          <RefreshCw size={28} className="text-[#B3B3B3] mx-auto mb-3" />
          <p className="text-[#B3B3B3]">No {activeFilter !== "All" ? activeFilter.toLowerCase() : ""} shift change requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.request_id} className="bg-[#2F2F2F] rounded-xl border border-white/10 p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Employee info */}
                <div className="flex items-center gap-3 shrink-0">
                  {req.employee?.profile_picture ? (
                    <img src={req.employee.profile_picture} alt="" className="w-10 h-10 rounded-full object-cover border border-white/10" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white text-sm font-bold">
                      {req.employee?.first_name?.[0] || "?"}
                    </div>
                  )}
                  <div>
                    <p className="text-white text-sm font-medium">{req.employee ? `${req.employee.first_name} ${req.employee.last_name}` : "Unknown"}</p>
                    <p className="text-[#B3B3B3] text-xs">{req.employee?.employee_id}</p>
                  </div>
                </div>

                {/* Request details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[req.status] || ""}`}>
                      {req.status}
                    </span>
                    <span className="text-[#B3B3B3] text-xs">{formatDate(req.from_date)} → {formatDate(req.to_date)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5 text-sm">
                    <span className="text-[#B3B3B3]">{req.current_shift?.shift_name || "—"}</span>
                    <span className="text-[#B3B3B3]">→</span>
                    <span className="text-blue-400 font-medium">{req.requested_shift?.shift_name || "—"}</span>
                  </div>
                  <p className="text-[#B3B3B3] text-xs line-clamp-2">{req.reason}</p>
                  {req.status === "Rejected" && req.admin_notes && (
                    <div className="mt-1.5 flex items-start gap-1.5 bg-red-400/10 border border-red-400/20 rounded px-2.5 py-1.5">
                      <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-red-400 text-xs">{req.admin_notes}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {req.status === "Pending" && (
                  <div className="flex sm:flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(req.request_id, `${req.employee?.first_name} ${req.employee?.last_name}`)}
                      disabled={processing === req.request_id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[36px]"
                    >
                      <CheckCircle size={13} /> Approve
                    </button>
                    <button
                      onClick={() => { setRejectTarget(req); setRejectNotes(""); }}
                      disabled={processing === req.request_id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 rounded-lg text-sm transition-colors disabled:opacity-50 min-h-[36px]"
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectNotes(""); } }}>
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-md w-[calc(100%-2rem)] rounded-xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/10">
            <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Reject Shift Request</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <p className="text-[#B3B3B3] text-sm">
              Rejecting shift change request for <span className="text-white font-medium">
                {rejectTarget?.employee ? `${rejectTarget.employee.first_name} ${rejectTarget.employee.last_name}` : ""}
              </span>
            </p>
            <div className="space-y-1">
              <Label className={labelCls}>Rejection Reason (optional)</Label>
              <Textarea value={rejectNotes} onChange={e => setRejectNotes(e.target.value)}
                className={`${inputCls} min-h-[80px] resize-none`}
                placeholder="Explain why the request is being rejected..." />
            </div>
          </div>
          <div className="px-5 pb-5 flex gap-3">
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectNotes(""); }}
              className="flex-1 bg-transparent border-white/20 text-[#B3B3B3] hover:bg-white/5 min-h-[44px]">
              Cancel
            </Button>
            <Button onClick={handleReject} disabled={processing !== null}
              className="flex-1 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 min-h-[44px]">
              {processing ? "Rejecting..." : "Reject Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ================== HOLIDAYS TAB ==================
function HolidaysTab() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editHoliday, setEditHoliday] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ holiday_name: "", date: "" });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/holidays`, { withCredentials: true });
      setHolidays(data);
    } catch { toast.error("Failed to load holidays"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

  const openAdd = () => {
    setEditHoliday(null);
    setForm({ holiday_name: "", date: "" });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (h) => {
    setEditHoliday(h);
    setForm({ holiday_name: h.holiday_name, date: h.date });
    setFormErrors({});
    setShowModal(true);
  };

  const handleSave = async () => {
    const errors = {};
    if (!form.holiday_name.trim()) errors.holiday_name = "Holiday name required";
    if (!form.date) errors.date = "Date required";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      if (editHoliday) {
        await axios.put(`${API}/holidays/${editHoliday.holiday_id}`, form, { withCredentials: true });
        toast.success("Holiday updated");
      } else {
        await axios.post(`${API}/holidays`, form, { withCredentials: true });
        toast.success("Holiday added");
      }
      setShowModal(false);
      fetchHolidays();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save holiday");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/holidays/${deleteConfirm.holiday_id}`, { withCredentials: true });
      toast.success("Holiday deleted");
      setDeleteConfirm(null);
      fetchHolidays();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete holiday");
    } finally { setDeleting(false); }
  };

  // Group holidays by year
  const grouped = holidays.reduce((acc, h) => {
    const yr = h.date.slice(0, 4);
    if (!acc[yr]) acc[yr] = [];
    acc[yr].push(h);
    return acc;
  }, {});
  const years = Object.keys(grouped).sort();

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-white font-semibold">Company Holidays</p>
          <p className="text-[#B3B3B3] text-sm mt-0.5">{holidays.length} holiday{holidays.length !== 1 ? "s" : ""} defined</p>
        </div>
        <Button onClick={openAdd} className="bg-white text-black hover:bg-white/90 gap-2 text-sm h-9">
          <Plus size={15} /> Add Holiday
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : holidays.length === 0 ? (
        <div className="bg-[#191919] rounded-xl border border-white/10 text-center py-12">
          <CalendarDays size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-[#B3B3B3] text-sm">No holidays defined yet</p>
          <p className="text-[#666] text-xs mt-1">Click "Add Holiday" to add your first holiday. Run seed-v2 to pre-load 2026 holidays.</p>
        </div>
      ) : (
        years.map(yr => (
          <div key={yr} className="mb-6">
            <p className="text-[#B3B3B3] text-xs font-semibold uppercase tracking-wider mb-2">{yr}</p>
            <div className="bg-[#191919] rounded-xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[450px]">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-3 text-[#666] text-xs font-medium w-8">#</th>
                      <th className="text-left px-4 py-3 text-[#B3B3B3] text-xs font-medium">Holiday Name</th>
                      <th className="text-left px-4 py-3 text-[#B3B3B3] text-xs font-medium">Date</th>
                      <th className="text-left px-4 py-3 text-[#B3B3B3] text-xs font-medium">Day</th>
                      <th className="text-right px-4 py-3 text-[#B3B3B3] text-xs font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[yr].map((h, i) => {
                      const dt = new Date(h.date + "T00:00:00");
                      const isPast = dt < new Date(new Date().toDateString());
                      return (
                        <tr key={h.holiday_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3 text-[#666] text-xs">{i + 1}</td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${isPast ? "text-[#B3B3B3]" : "text-white"}`}>{h.holiday_name}</span>
                            {isPast && <span className="ml-2 text-[#666] text-xs">(past)</span>}
                          </td>
                          <td className="px-4 py-3 text-[#B3B3B3] text-sm">
                            {dt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[#666] text-xs">{dt.toLocaleDateString("en-IN", { weekday: "long" })}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(h)}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-[#B3B3B3] hover:text-white transition-colors">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => setDeleteConfirm(h)}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-[#B3B3B3] hover:text-red-400 transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowModal(false); }}>
          <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-sm w-[calc(100%-2rem)] rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-white">{editHoliday ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className={labelCls}>Holiday Name *</Label>
                <Input
                  value={form.holiday_name}
                  onChange={e => setForm(f => ({ ...f, holiday_name: e.target.value }))}
                  placeholder="e.g. Republic Day"
                  className={inputCls}
                />
                {formErrors.holiday_name && <p className="text-red-400 text-xs">{formErrors.holiday_name}</p>}
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Date *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className={inputCls}
                />
                {form.date && (() => {
                  const d = new Date(form.date + "T00:00:00");
                  return <p className="text-[#B3B3B3] text-xs">{d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>;
                })()}
                {formErrors.date && <p className="text-red-400 text-xs">{formErrors.date}</p>}
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={() => setShowModal(false)}
                  className="flex-1 bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
                <Button onClick={handleSave} disabled={saving}
                  className="flex-1 bg-white text-black hover:bg-white/90">
                  {saving ? "Saving..." : editHoliday ? "Save Changes" : "Add Holiday"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
          <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white sm:max-w-sm w-[calc(100%-2rem)] rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-white">Delete Holiday</DialogTitle>
            </DialogHeader>
            <p className="text-[#B3B3B3] text-sm">
              Are you sure you want to delete <strong className="text-white">{deleteConfirm.holiday_name}</strong>?
              This cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
              <Button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60">
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


// ================== MAIN SETTINGS PAGE ==================
export default function SettingsPage() {
  const { user, myEmployee } = useAuth();
  const isAdmin = user?.is_admin || myEmployee?.department_name?.toLowerCase() === "admin";

  const [activeGroup, setActiveGroup] = useState("general");
  const [activeSub, setActiveSub] = useState({
    general: "departments",
    integration: "notion",
    "data-import": "data-import",
  });

  useEffect(() => {
    axios.post(`${API}/seed-v2`, {}, { withCredentials: true }).catch(() => {});
  }, []);

  const groups = [
    { val: "general", label: "General" },
    { val: "integration", label: "Integration" },
    ...(isAdmin ? [{ val: "data-import", label: "Data Import" }] : []),
  ];

  const subItems = {
    general: [
      { val: "departments", label: "Departments", icon: Building2 },
      { val: "job-positions", label: "Job Positions", icon: Briefcase },
      { val: "teams", label: "Teams", icon: Users },
      ...(isAdmin ? [
        { val: "shifts", label: "Shifts", icon: Clock },
        { val: "holidays", label: "Holidays", icon: CalendarDays },
      ] : []),
    ],
    integration: [
      { val: "notion", label: "Notion Integration", icon: Database },
      ...(isAdmin ? [{ val: "attendance-integration", label: "Attendance Integration", icon: Fingerprint }] : []),
    ],
    "data-import": [
      { val: "data-import", label: "Performance Data", icon: Upload },
    ],
  };

  const currentSub = activeSub[activeGroup];

  const handleGroupChange = (g) => setActiveGroup(g);
  const handleSubChange = (val) => setActiveSub(prev => ({ ...prev, [activeGroup]: val }));

  const currentItems = subItems[activeGroup] || [];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Settings</h1>
        <p className="text-[#B3B3B3] text-sm mt-0.5">Manage departments, positions, teams, and integrations</p>
      </div>

      {/* Top group tabs */}
      <div className="flex gap-1 mb-5 md:mb-6 bg-[#191919] border border-white/10 p-1 rounded-lg w-fit overflow-x-auto no-scrollbar">
        {groups.map(({ val, label }) => (
          <button
            key={val}
            onClick={() => handleGroupChange(val)}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-colors ${
              activeGroup === val ? "bg-[#2F2F2F] text-white" : "text-[#B3B3B3] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sidebar + content layout — stacked on mobile, side-by-side on md+ */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
        {/* Left sidebar — horizontal scrollable pills on mobile, vertical nav on md+ */}
        <div className="w-full md:w-48 md:shrink-0">
          <nav className="flex flex-row md:flex-col gap-1 md:gap-0.5 overflow-x-auto no-scrollbar">
            {currentItems.map(({ val, label, icon: Icon }) => (
              <button
                key={val}
                onClick={() => handleSubChange(val)}
                className={`flex items-center gap-2 md:gap-3 px-3 py-2 md:py-2.5 rounded-lg text-xs md:text-sm transition-colors text-left whitespace-nowrap shrink-0 md:w-full ${
                  currentSub === val
                    ? "bg-[#2F2F2F] text-white font-medium"
                    : "text-[#B3B3B3] hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Divider — horizontal on mobile, vertical on md+ */}
        <div className="hidden md:block w-px self-stretch bg-white/10 shrink-0" />
        <div className="block md:hidden h-px w-full bg-white/10 shrink-0" />

        {/* Content */}
        <div className="flex-1 min-w-0 w-full">
          {currentSub === "departments" && <DepartmentsTab />}
          {currentSub === "job-positions" && <JobPositionsTab />}
          {currentSub === "teams" && <TeamsTab />}
          {currentSub === "notion" && <NotionIntegrationTab />}
          {isAdmin && currentSub === "shifts" && <ShiftsTab />}
          {isAdmin && currentSub === "holidays" && <HolidaysTab />}
          {isAdmin && currentSub === "attendance-integration" && <AttendanceIntegrationTab />}
          {isAdmin && currentSub === "data-import" && <DataImportTab />}
        </div>
      </div>
    </div>
  );
}
