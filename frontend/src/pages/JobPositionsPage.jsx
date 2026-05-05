import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DeleteConfirm from "@/components/DeleteConfirm";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LEVELS = ["Beginner", "Intermediate", "Advanced"];

export default function JobPositionsPage() {
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

  const fetchData = async () => {
    try {
      const [posRes, deptRes] = await Promise.all([
        axios.get(`${API}/job-positions`, { withCredentials: true }),
        axios.get(`${API}/departments`, { withCredentials: true }),
      ]);
      setPositions(posRes.data);
      setDepartments(deptRes.data);
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = filterDept === "all" ? positions : positions.filter(p => p.department_id === filterDept);

  const openAdd = () => {
    setEditPos(null);
    setForm({ position_name: "", department_id: "", has_levels: false, available_levels: [] });
    setErrors({});
    setShowModal(true);
  };
  const openEdit = (pos) => {
    setEditPos(pos);
    setForm({
      position_name: pos.position_name,
      department_id: pos.department_id,
      has_levels: pos.has_levels,
      available_levels: pos.available_levels || []
    });
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

  const validate = () => {
    const e = {};
    if (!form.position_name.trim()) e.position_name = "Position name is required";
    if (!form.department_id) e.department_id = "Department is required";
    if (form.has_levels && form.available_levels.length === 0) e.available_levels = "Select at least one level";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      position_name: form.position_name.trim(),
      department_id: form.department_id,
      has_levels: form.has_levels,
      available_levels: form.has_levels ? form.available_levels : []
    };
    try {
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
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Job Positions
          </h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">{filtered.length} total</p>
        </div>
        <button
          data-testid="add-position-button"
          onClick={openAdd}
          className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Position
        </button>
      </div>

      {/* Filter by dept */}
      <div className="mb-5">
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-52 bg-[#2F2F2F] border-white/10 text-white focus:ring-0">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent className="bg-[#2F2F2F] border-white/10 text-white">
            <SelectItem value="all" className="text-white focus:bg-white/10">All Departments</SelectItem>
            {departments.map(d => (
              <SelectItem key={d.department_id} value={d.department_id} className="text-white focus:bg-white/10">
                {d.department_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Briefcase size={36} className="text-[#B3B3B3] mb-3" />
          <p className="text-white font-medium">No job positions</p>
          <p className="text-[#B3B3B3] text-sm">Add your first job position to get started</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[560px]" data-testid="positions-table">
            <thead className="bg-[#191919] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Position</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Department</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Has Levels</th>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Levels</th>
                <th className="text-right py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-[#2F2F2F] divide-y divide-white/5">
              {filtered.map((pos) => (
                <tr key={pos.position_id} className="hover:bg-white/5 transition-colors" data-testid="position-row">
                  <td className="py-4 px-5 text-sm text-white font-medium">{pos.position_name}</td>
                  <td className="py-4 px-5 text-sm text-[#B3B3B3]">{pos.department_name}</td>
                  <td className="py-4 px-5 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${pos.has_levels ? "bg-green-500/20 text-green-400" : "bg-white/10 text-[#B3B3B3]"}`}>
                      {pos.has_levels ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="py-4 px-5 text-sm text-[#B3B3B3]">
                    {pos.has_levels && pos.available_levels?.length > 0
                      ? pos.available_levels.join(", ")
                      : "—"}
                  </td>
                  <td className="py-4 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        data-testid="edit-position-button"
                        onClick={() => openEdit(pos)}
                        className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        data-testid="delete-position-button"
                        onClick={() => setDeleteTarget(pos)}
                        className="p-1.5 text-[#B3B3B3] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={(o) => { if (!o) setShowModal(false); }}>
        <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
              {editPos ? "Edit Job Position" : "Add Job Position"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-[#B3B3B3] text-sm">Position Name *</Label>
              <Input
                data-testid="position-name-input"
                value={form.position_name}
                onChange={(e) => setForm(p => ({ ...p, position_name: e.target.value }))}
                className="bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] focus-visible:ring-white/20"
                placeholder="e.g. Video Editor"
              />
              {errors.position_name && <p className="text-red-400 text-xs">{errors.position_name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[#B3B3B3] text-sm">Department *</Label>
              <Select value={form.department_id} onValueChange={(v) => setForm(p => ({ ...p, department_id: v }))}>
                <SelectTrigger
                  data-testid="position-department-select"
                  className="bg-[#191919] border-white/10 text-white focus:ring-0"
                >
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10 text-white">
                  {departments.map(d => (
                    <SelectItem key={d.department_id} value={d.department_id} className="text-white focus:bg-white/10">
                      {d.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.department_id && <p className="text-red-400 text-xs">{errors.department_id}</p>}
            </div>

            <div className="flex items-center gap-3">
              <Switch
                data-testid="has-levels-toggle"
                checked={form.has_levels}
                onCheckedChange={(v) => setForm(p => ({ ...p, has_levels: v, available_levels: v ? p.available_levels : [] }))}
              />
              <Label className="text-[#B3B3B3] text-sm">Has Levels</Label>
            </div>

            {form.has_levels && (
              <div className="space-y-2">
                <Label className="text-[#B3B3B3] text-sm">Available Levels *</Label>
                <div className="flex gap-3">
                  {LEVELS.map(level => (
                    <label
                      key={level}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                        form.available_levels.includes(level)
                          ? "border-white/30 bg-white/10 text-white"
                          : "border-white/10 text-[#B3B3B3] hover:border-white/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={form.available_levels.includes(level)}
                        onChange={() => toggleLevel(level)}
                      />
                      {level}
                    </label>
                  ))}
                </div>
                {errors.available_levels && <p className="text-red-400 text-xs">{errors.available_levels}</p>}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                className="bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                data-testid="save-position-button"
                onClick={handleSave}
                disabled={saving}
                className="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 border-0"
              >
                {saving ? "Saving..." : editPos ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirm
        open={!!deleteTarget}
        title="Delete Job Position"
        description={deleteTarget ? `Delete "${deleteTarget.position_name}"? This cannot be undone.` : ""}
        onConfirm={() => handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
