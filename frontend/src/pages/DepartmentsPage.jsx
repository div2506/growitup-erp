import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import DeleteConfirm from "@/components/DeleteConfirm";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchDepts = async () => {
    try {
      const { data } = await axios.get(`${API}/departments`, { withCredentials: true });
      setDepartments(data);
    } catch {
      toast.error("Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDepts(); }, []);

  const openAdd = () => { setEditDept(null); setName(""); setError(""); setShowModal(true); };
  const openEdit = (d) => { setEditDept(d); setName(d.department_name); setError(""); setShowModal(true); };

  const handleSave = async () => {
    if (!name.trim()) { setError("Department name is required"); return; }
    setSaving(true);
    try {
      if (editDept) {
        const { data } = await axios.put(
          `${API}/departments/${editDept.department_id}`,
          { department_name: name.trim() },
          { withCredentials: true }
        );
        setDepartments(prev => prev.map(d => d.department_id === data.department_id ? data : d));
        toast.success("Department updated");
      } else {
        const { data } = await axios.post(
          `${API}/departments`,
          { department_name: name.trim() },
          { withCredentials: true }
        );
        setDepartments(prev => [...prev, data]);
        toast.success("Department added");
      }
      setShowModal(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dept) => {
    try {
      await axios.delete(`${API}/departments/${dept.department_id}`, { withCredentials: true });
      setDepartments(prev => prev.filter(d => d.department_id !== dept.department_id));
      toast.success("Department deleted");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    }
    setDeleteTarget(null);
  };

  const formatDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Departments
          </h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">{departments.length} total</p>
        </div>
        <button
          data-testid="add-department-button"
          onClick={openAdd}
          className="flex items-center gap-2 bg-[#E53935] hover:bg-[#F44336] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Department
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />
          ))}
        </div>
      ) : departments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Building2 size={36} className="text-[#B3B3B3] mb-3" />
          <p className="text-white font-medium">No departments yet</p>
          <p className="text-[#B3B3B3] text-sm">Add your first department to get started</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full" data-testid="departments-table">
            <thead className="bg-[#191919] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">
                  Department Name
                </th>
                <th className="text-left py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">
                  Created
                </th>
                <th className="text-right py-3 px-5 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-[#2F2F2F] divide-y divide-white/5">
              {departments.map((dept) => (
                <tr key={dept.department_id} className="hover:bg-white/5 transition-colors" data-testid="department-row">
                  <td className="py-4 px-5 text-sm text-white font-medium">{dept.department_name}</td>
                  <td className="py-4 px-5 text-sm text-[#B3B3B3]">{formatDate(dept.created_at)}</td>
                  <td className="py-4 px-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        data-testid="edit-department-button"
                        onClick={() => openEdit(dept)}
                        className="p-1.5 text-[#B3B3B3] hover:text-white hover:bg-white/10 rounded transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        data-testid="delete-department-button"
                        onClick={() => setDeleteTarget(dept)}
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
              {editDept ? "Edit Department" : "Add Department"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-[#B3B3B3] text-sm">Department Name *</Label>
              <Input
                data-testid="department-name-input"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] focus-visible:ring-white/20"
                placeholder="e.g. Operations"
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                className="bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                data-testid="save-department-button"
                onClick={handleSave}
                disabled={saving}
                className="bg-[#E53935] hover:bg-[#F44336] text-white border-0"
              >
                {saving ? "Saving..." : editDept ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirm
        open={!!deleteTarget}
        title="Delete Department"
        description={deleteTarget ? `Delete "${deleteTarget.department_name}"? This will also delete all job positions in this department.` : ""}
        onConfirm={() => handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
