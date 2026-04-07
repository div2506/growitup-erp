import { useState, useEffect, useCallback } from "react";
import { MoreVertical, Plus, Search, User } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EmployeeModal from "@/components/EmployeeModal";
import DeleteConfirm from "@/components/DeleteConfirm";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Read-Only Profile Modal ───────────────────────────────────────────────────

function ReadOnlyProfileModal({ employee: emp, onClose }) {
  const [tab, setTab] = useState("personal");

  if (!emp) return null;

  const Row = ({ label, value }) => (
    <div className="py-2 border-b border-white/5 last:border-0">
      <p className="text-[#B3B3B3] text-xs mb-0.5">{label}</p>
      <p className="text-white text-sm">{value || "—"}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#2F2F2F] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            {emp.profile_picture ? (
              <img src={emp.profile_picture} alt={emp.first_name} className="w-10 h-10 rounded-full object-cover border border-white/10" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 border border-white/10 flex items-center justify-center text-white font-bold">
                {(emp.first_name?.[0] || "?").toUpperCase()}{(emp.last_name?.[0] || "").toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-white font-semibold text-sm">{emp.first_name} {emp.last_name}</h3>
              <p className="text-[#B3B3B3] text-xs">{emp.employee_id} · {emp.department_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#B3B3B3] hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors text-lg leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 shrink-0">
          {[["personal", "Personal Info"], ["work", "Work Info"], ["bank", "Bank Info"]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${tab === v ? "text-white border-b-2 border-white" : "text-[#B3B3B3] hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {tab === "personal" && (
            <div className="space-y-0.5">
              <div className="grid grid-cols-2 gap-x-6">
                <Row label="First Name" value={emp.first_name} />
                <Row label="Last Name" value={emp.last_name} />
                <Row label="Personal Email" value={emp.personal_email} />
                <Row label="Phone" value={emp.phone} />
                <Row label="Date of Birth" value={emp.date_of_birth} />
                <Row label="Gender" value={emp.gender} />
              </div>
              <Row label="Qualification" value={emp.qualification} />
              <Row label="Address" value={emp.address} />
              <div className="grid grid-cols-3 gap-x-6">
                <Row label="City" value={emp.city_name} />
                <Row label="State" value={emp.state_name} />
                <Row label="Country" value={emp.country} />
              </div>
              <Row label="Zipcode" value={emp.zipcode} />
              <div className="mt-3 pt-2 border-t border-white/10">
                <p className="text-[#B3B3B3] text-xs uppercase tracking-wider mb-2">Emergency Contact</p>
                <div className="grid grid-cols-3 gap-x-6">
                  <Row label="Name" value={emp.emergency_contact_name} />
                  <Row label="Number" value={emp.emergency_contact_number} />
                  <Row label="Relation" value={emp.emergency_contact_relation} />
                </div>
              </div>
            </div>
          )}
          {tab === "work" && (
            <div className="space-y-0.5">
              <Row label="Work Email" value={emp.work_email} />
              <Row label="Employee ID" value={emp.employee_id} />
              <div className="grid grid-cols-2 gap-x-6">
                <Row label="Department" value={emp.department_name} />
                <Row label="Job Position" value={emp.job_position_name} />
                <Row label="Level" value={emp.level} />
                <Row label="Employment Type" value={emp.employee_type} />
                <Row label="Joining Date" value={emp.joining_date} />
                <Row label="Status" value={emp.status} />
              </div>
              <Row label="Basic Salary" value={emp.basic_salary ? `₹${emp.basic_salary.toLocaleString()}` : null} />
              {emp.teams?.length > 0 && (
                <div className="py-2">
                  <p className="text-[#B3B3B3] text-xs mb-1">Teams</p>
                  <div className="flex flex-wrap gap-1.5">
                    {emp.teams.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 bg-white/5 rounded-md text-white text-xs">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "bank" && (
            <div className="space-y-0.5">
              <Row label="Bank Name" value={emp.bank_name} />
              <Row label="Account Name" value={emp.account_name} />
              <Row label="Account Number" value={emp.account_number ? `••••••${emp.account_number.slice(-4)}` : null} />
              <Row label="IFSC Code" value={emp.ifsc_code} />
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/10 shrink-0">
          <p className="text-[#B3B3B3] text-xs text-center">Read-only view — contact HR to make changes</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const { user, myEmployee } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewEmployee, setViewEmployee] = useState(null);

  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";

  const fetchEmployees = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/employees`, { withCredentials: true });
      setEmployees(data);
    } catch {
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    let result = employees;
    if (search.trim()) {
      const sl = search.toLowerCase();
      result = result.filter(e =>
        (e.first_name + " " + e.last_name).toLowerCase().includes(sl) ||
        e.work_email?.toLowerCase().includes(sl) ||
        e.employee_id?.toLowerCase().includes(sl) ||
        e.department_name?.toLowerCase().includes(sl) ||
        e.job_position_name?.toLowerCase().includes(sl)
      );
    }
    setFiltered(result);
  }, [employees, search]);

  const handleCardClick = (emp) => {
    if (isAdminDept) {
      setEditEmployee(emp);
      setShowModal(true);
    } else if (emp.employee_id === myEmployee?.employee_id) {
      setViewEmployee(emp);
    } else {
      toast("You don't have permission to view this profile", { description: "Only your own profile is accessible." });
    }
  };

  const handleDelete = async (emp) => {
    try {
      await axios.delete(`${API}/employees/${emp.employee_id}`, { withCredentials: true });
      toast.success(`${emp.first_name} ${emp.last_name} deleted`);
      setEmployees(prev => prev.filter(e => e.employee_id !== emp.employee_id));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    }
    setDeleteTarget(null);
  };

  const getPositionDisplay = (emp) => {
    if (emp.level) return `${emp.job_position_name} (${emp.level})`;
    return emp.job_position_name || "—";
  };

  const getInitials = (emp) =>
    `${(emp.first_name || "?")[0]}${(emp.last_name || "?")[0]}`.toUpperCase();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Employees
          </h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">{filtered.length} total</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B3B3B3]" />
          <input
            data-testid="employee-search"
            type="text"
            placeholder="Search by name, email, ID, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#2F2F2F] border border-white/10 text-white placeholder-[#B3B3B3] rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>
      </div>

      {/* Employee Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-[#2F2F2F] rounded-xl border border-white/10 p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-white/10 shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-white/10 rounded w-3/4" />
                  <div className="h-3 bg-white/10 rounded w-full" />
                  <div className="h-3 bg-white/10 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
            <User size={28} className="text-[#B3B3B3]" />
          </div>
          <p className="text-white font-medium mb-1">No employees found</p>
          <p className="text-[#B3B3B3] text-sm">
            {search ? "Try adjusting your search" : "Add your first employee to get started"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" data-testid="employee-grid">
          {filtered.map((emp) => {
            const isOwnCard = emp.employee_id === myEmployee?.employee_id;
            const canDelete = isAdminDept && !isOwnCard;
            const isClickable = isAdminDept || isOwnCard;
            return (
              <div
                key={emp.employee_id}
                data-testid="employee-card"
                onClick={() => handleCardClick(emp)}
                className={`employee-card relative bg-[#2F2F2F] rounded-xl border border-white/10 p-5 transition-all ${
                  isClickable
                    ? "cursor-pointer hover:border-white/25 hover:bg-[#363636]"
                    : "cursor-default"
                }`}
              >
                {/* 3-dot menu — admin dept only */}
                {isAdminDept && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        data-testid="employee-menu-button"
                        onClick={e => e.stopPropagation()}
                        className="absolute top-4 right-4 text-[#B3B3B3] hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-[#2F2F2F] border-white/10 text-white min-w-[150px]"
                    >
                      <DropdownMenuItem
                        data-testid="edit-employee-menu"
                        className="text-white hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                        onClick={() => { setEditEmployee(emp); setShowModal(true); }}
                      >
                        Edit Profile
                      </DropdownMenuItem>
                      {canDelete && (
                        <DropdownMenuItem
                          data-testid="delete-employee-menu"
                          className="text-red-400 hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                          onClick={() => setDeleteTarget(emp)}
                        >
                          Delete Profile
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    {emp.profile_picture ? (
                      <img
                        src={emp.profile_picture}
                        alt={emp.first_name}
                        className="w-16 h-16 rounded-full object-cover border-2 border-white/10"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 border-2 border-white/10 flex items-center justify-center text-white font-bold text-lg">
                        {getInitials(emp)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pr-5">
                    <div className="flex items-baseline gap-1.5 mb-0.5 flex-wrap">
                      <span className="font-bold text-white text-sm leading-tight">
                        {emp.first_name} {emp.last_name}
                      </span>
                      <span className="text-xs text-[#B3B3B3]">({emp.employee_id})</span>
                    </div>
                    <p className="text-xs text-[#B3B3B3] truncate mb-1.5">{emp.work_email}</p>
                    <p className="text-sm font-medium text-white truncate leading-tight">
                      {getPositionDisplay(emp)}
                    </p>
                    <span className="inline-block text-xs text-[#B3B3B3] mt-1 px-2 py-0.5 bg-white/5 rounded-md">
                      {emp.department_name}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB — only for admin dept */}
      {isAdminDept && (
        <button
          data-testid="add-employee-fab"
          onClick={() => { setEditEmployee(null); setShowModal(true); }}
          className="fixed bottom-20 right-8 bg-[#E53935] hover:bg-[#F44336] text-white rounded-full px-5 py-3.5 shadow-xl flex items-center gap-2 z-50 transition-colors font-medium text-sm"
        >
          <Plus size={20} />
          Add Employee
        </button>
      )}

      {/* Admin edit/add modal */}
      {showModal && (
        <EmployeeModal
          employee={editEmployee}
          onClose={() => { setShowModal(false); setEditEmployee(null); }}
          onSaved={fetchEmployees}
        />
      )}

      {/* Non-admin read-only view modal */}
      {viewEmployee && (
        <ReadOnlyProfileModal
          employee={viewEmployee}
          onClose={() => setViewEmployee(null)}
        />
      )}

      <DeleteConfirm
        open={!!deleteTarget}
        title="Delete Employee"
        description={deleteTarget ? `Are you sure you want to delete ${deleteTarget.first_name} ${deleteTarget.last_name}? This action cannot be undone.` : ""}
        onConfirm={() => handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
