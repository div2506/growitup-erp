import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Building2, Briefcase, Users, Database, Lock, ExternalLink } from "lucide-react";
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
import DeleteConfirm from "@/components/DeleteConfirm";

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
          className="flex items-center gap-2 bg-[#E53935] hover:bg-[#F44336] text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
          <Plus size={15} /> Add Department
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full" data-testid="departments-table">
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
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white max-w-md">
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
              <Button data-testid="save-department-button" onClick={handleSave} disabled={saving || editDept?.is_system} className="bg-[#E53935] hover:bg-[#F44336] text-white border-0">
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
          className="flex items-center gap-2 bg-[#E53935] hover:bg-[#F44336] text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
          <Plus size={15} /> Add Position
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full">
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
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white max-w-lg">
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
              <Button onClick={handleSave} disabled={saving} className="bg-[#E53935] hover:bg-[#F44336] text-white border-0">
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
          className="flex items-center gap-2 bg-[#E53935] hover:bg-[#F44336] text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
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
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full" data-testid="teams-table">
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
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white max-w-md">
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
              <Button data-testid="save-team-button" onClick={handleSave} disabled={saving} className="bg-[#E53935] hover:bg-[#F44336] text-white border-0">
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
          className="flex items-center gap-2 bg-[#E53935] hover:bg-[#F44336] text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
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
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white max-w-lg">
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
              <Button data-testid="save-notion-db-button" onClick={handleSave} disabled={saving} className="bg-[#E53935] hover:bg-[#F44336] text-white border-0">
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

// ================== MAIN SETTINGS PAGE ==================
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("departments");

  useEffect(() => {
    // Auto-run seed-v2 to update is_system flags on existing data
    axios.post(`${API}/seed-v2`, {}, { withCredentials: true }).catch(() => {});
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Settings</h1>
        <p className="text-[#B3B3B3] text-sm mt-0.5">Manage departments, positions, teams, and integrations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[#191919] border border-white/10 p-1 rounded-lg mb-6 h-auto flex gap-1 w-fit">
          {[
            { val: "departments", label: "Departments", icon: Building2 },
            { val: "job-positions", label: "Job Positions", icon: Briefcase },
            { val: "teams", label: "Teams", icon: Users },
            { val: "notion", label: "Notion Integration", icon: Database },
          ].map(({ val, label, icon: Icon }) => (
            <TabsTrigger key={val} value={val} data-testid={`settings-tab-${val}`}
              className="data-[state=active]:bg-[#2F2F2F] data-[state=active]:text-white text-[#B3B3B3] rounded-md px-4 py-2 text-sm flex items-center gap-2 transition-all">
              <Icon size={15} />{label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="departments"><DepartmentsTab /></TabsContent>
        <TabsContent value="job-positions"><JobPositionsTab /></TabsContent>
        <TabsContent value="teams"><TeamsTab /></TabsContent>
        <TabsContent value="notion"><NotionIntegrationTab /></TabsContent>
      </Tabs>
    </div>
  );
}
