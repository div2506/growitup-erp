import { useState, useEffect, useCallback, useMemo } from "react";
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

// ── Self Profile Modal (non-admin employees — own profile, partial edit) ────────

const SELF_EDITABLE = ["profile_picture", "address", "zipcode", "state_name", "city_name",
  "emergency_contact_name", "emergency_contact_number", "emergency_contact_relation",
  "bank_name", "account_name", "account_number", "ifsc_code"];

function SelfProfileModal({ employee: initialEmp, onClose, onSaved }) {
  const { setMyEmployee } = useAuth();
  const [emp, setEmp] = useState(initialEmp);
  const [tab, setTab] = useState("personal");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    profile_picture: initialEmp?.profile_picture || null,
    address: initialEmp?.address || "",
    zipcode: initialEmp?.zipcode || "",
    state_name: initialEmp?.state_name || "",
    city_name: initialEmp?.city_name || "",
    emergency_contact_name: initialEmp?.emergency_contact_name || "",
    emergency_contact_number: initialEmp?.emergency_contact_number || "",
    emergency_contact_relation: initialEmp?.emergency_contact_relation || "",
    bank_name: initialEmp?.bank_name || "",
    account_name: initialEmp?.account_name || "",
    account_number: initialEmp?.account_number || "",
    ifsc_code: initialEmp?.ifsc_code || "",
  });

  if (!emp) return null;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => set("profile_picture", ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await axios.patch(`${API}/employees/${emp.employee_id}/self`, form, { withCredentials: true });
      setEmp(data);
      setMyEmployee(data);
      onSaved(data);
      setIsEditing(false);
      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm({
      profile_picture: emp?.profile_picture || null,
      address: emp?.address || "",
      zipcode: emp?.zipcode || "",
      state_name: emp?.state_name || "",
      city_name: emp?.city_name || "",
      emergency_contact_name: emp?.emergency_contact_name || "",
      emergency_contact_number: emp?.emergency_contact_number || "",
      emergency_contact_relation: emp?.emergency_contact_relation || "",
      bank_name: emp?.bank_name || "",
      account_name: emp?.account_name || "",
      account_number: emp?.account_number || "",
      ifsc_code: emp?.ifsc_code || "",
    });
    setIsEditing(false);
  };

  // View-mode field
  const ReadField = ({ label, value }) => (
    <div className="py-2 border-b border-white/5 last:border-0">
      <p className="text-[#B3B3B3] text-xs mb-0.5">{label}</p>
      <p className="text-white text-sm">{value || "—"}</p>
    </div>
  );

  // Locked field in edit mode (not editable)
  const LockedField = ({ label, value }) => (
    <div className="py-2 border-b border-white/5 last:border-0 opacity-50">
      <p className="text-[#B3B3B3] text-xs mb-0.5">{label}</p>
      <p className="text-[#B3B3B3] text-sm">{value || "—"}</p>
    </div>
  );

  // Editable input in edit mode
  const EditField = ({ label, fkey, type = "text", placeholder = "" }) => (
    <div className="py-1.5">
      <label className="text-[#B3B3B3] text-xs block mb-1">{label}</label>
      <input
        type={type}
        data-testid={`self-edit-${fkey}`}
        value={form[fkey] || ""}
        onChange={e => set(fkey, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#191919] border border-white/15 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/30 transition-colors placeholder-[#555]"
      />
    </div>
  );

  const displayPicture = isEditing ? (form.profile_picture || null) : (emp.profile_picture || null);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center sm:p-4">
      <div className="bg-[#2F2F2F] sm:border border-white/10 sm:rounded-2xl w-full sm:max-w-lg shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              {displayPicture ? (
                <img src={displayPicture} alt={emp.first_name} className="w-11 h-11 rounded-full object-cover border border-white/10" />
              ) : (
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 border border-white/10 flex items-center justify-center text-white font-bold">
                  {(emp.first_name?.[0] || "?").toUpperCase()}{(emp.last_name?.[0] || "").toUpperCase()}
                </div>
              )}
              {isEditing && (
                <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#E53935] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#F44336] transition-colors" title="Change photo">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" data-testid="self-edit-profile-picture-input" />
                </label>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-white font-semibold text-sm truncate">{emp.first_name} {emp.last_name}</h3>
              <p className="text-[#B3B3B3] text-xs truncate">{emp.employee_id} · {emp.department_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing && (
              <button
                data-testid="self-edit-toggle-btn"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors border border-white/10"
              >
                Edit
              </button>
            )}
            <button onClick={onClose} className="text-[#B3B3B3] hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors text-lg leading-none">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 shrink-0 overflow-x-auto no-scrollbar">
          {[["personal", "Personal Info"], ["work", "Work Info"], ["bank", "Bank Info"]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-4 sm:px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${tab === v ? "text-white border-b-2 border-white" : "text-[#B3B3B3] hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-4 sm:px-5 py-4 overflow-y-auto flex-1">
          {tab === "personal" && !isEditing && (
            <div className="space-y-0.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <ReadField label="First Name" value={emp.first_name} />
                <ReadField label="Last Name" value={emp.last_name} />
                <ReadField label="Personal Email" value={emp.personal_email} />
                <ReadField label="Phone" value={emp.phone} />
                <ReadField label="Date of Birth" value={emp.date_of_birth} />
                <ReadField label="Gender" value={emp.gender} />
              </div>
              <ReadField label="Qualification" value={emp.qualification} />
              <ReadField label="Address" value={emp.address} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
                <ReadField label="City" value={emp.city_name} />
                <ReadField label="State" value={emp.state_name} />
                <ReadField label="Country" value={emp.country} />
              </div>
              <ReadField label="Zipcode" value={emp.zipcode} />
              <div className="mt-3 pt-2 border-t border-white/10">
                <p className="text-[#B3B3B3] text-xs uppercase tracking-wider mb-2">Emergency Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
                  <ReadField label="Name" value={emp.emergency_contact_name} />
                  <ReadField label="Number" value={emp.emergency_contact_number} />
                  <ReadField label="Relation" value={emp.emergency_contact_relation} />
                </div>
              </div>
            </div>
          )}
          {tab === "personal" && isEditing && (
            <div className="space-y-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <LockedField label="First Name" value={emp.first_name} />
                <LockedField label="Last Name" value={emp.last_name} />
                <LockedField label="Personal Email" value={emp.personal_email} />
                <LockedField label="Phone" value={emp.phone} />
                <LockedField label="Date of Birth" value={emp.date_of_birth} />
                <LockedField label="Gender" value={emp.gender} />
              </div>
              <LockedField label="Qualification" value={emp.qualification} />
              <EditField label="Address" fkey="address" placeholder="Enter address" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3">
                <EditField label="City" fkey="city_name" placeholder="City" />
                <EditField label="State" fkey="state_name" placeholder="State" />
                <LockedField label="Country" value={emp.country} />
              </div>
              <EditField label="Zipcode" fkey="zipcode" placeholder="Zipcode" />
              <div className="mt-3 pt-2 border-t border-white/10">
                <p className="text-[#B3B3B3] text-xs uppercase tracking-wider mb-2">Emergency Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3">
                  <EditField label="Name" fkey="emergency_contact_name" placeholder="Contact name" />
                  <EditField label="Number" fkey="emergency_contact_number" placeholder="Number" />
                  <EditField label="Relation" fkey="emergency_contact_relation" placeholder="Relation" />
                </div>
              </div>
            </div>
          )}
          {tab === "work" && (
            <div className="space-y-0.5">
              <ReadField label="Work Email" value={emp.work_email} />
              <ReadField label="Employee ID" value={emp.employee_id} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <ReadField label="Department" value={emp.department_name} />
                <ReadField label="Job Position" value={emp.job_position_name} />
                <ReadField label="Level" value={emp.level} />
                <ReadField label="Employment Type" value={emp.employee_type} />
                <ReadField label="Joining Date" value={emp.joining_date} />
                <ReadField label="Status" value={emp.status} />
              </div>
              <ReadField label="Basic Salary" value={emp.basic_salary ? `₹${emp.basic_salary.toLocaleString()}` : null} />
              {emp.teams?.length > 0 && (
                <div className="py-2">
                  <p className="text-[#B3B3B3] text-xs mb-1">Teams</p>
                  <div className="flex flex-wrap gap-1.5">
                    {emp.teams.map((t, i) => <span key={i} className="px-2 py-0.5 bg-white/5 rounded-md text-white text-xs">{t}</span>)}
                  </div>
                </div>
              )}
              {isEditing && <p className="text-[#B3B3B3] text-xs mt-3 italic">Work information can only be updated by HR Admin.</p>}
            </div>
          )}
          {tab === "bank" && !isEditing && (
            <div className="space-y-0.5">
              <ReadField label="Bank Name" value={emp.bank_name} />
              <ReadField label="Account Name" value={emp.account_name} />
              <ReadField label="Account Number" value={emp.account_number ? `••••••${emp.account_number.slice(-4)}` : null} />
              <ReadField label="IFSC Code" value={emp.ifsc_code} />
            </div>
          )}
          {tab === "bank" && isEditing && (
            <div className="space-y-1">
              <EditField label="Bank Name" fkey="bank_name" placeholder="Bank name" />
              <EditField label="Account Name" fkey="account_name" placeholder="Account holder name" />
              <EditField label="Account Number" fkey="account_number" placeholder="Account number" />
              <EditField label="IFSC Code" fkey="ifsc_code" placeholder="IFSC code" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-white/10 shrink-0 flex items-center justify-between gap-3">
          {isEditing ? (
            <>
              <p className="text-[#B3B3B3] text-xs hidden sm:block">Editable fields are highlighted</p>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button onClick={handleCancelEdit} className="px-4 py-2 text-sm text-[#B3B3B3] hover:text-white border border-white/10 rounded-lg transition-colors min-h-[40px]">Cancel</button>
                <button
                  data-testid="self-edit-save-btn"
                  onClick={handleSave} disabled={saving}
                  className="px-4 py-2 text-sm bg-white text-[#191919] font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors min-h-[40px]"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-[#B3B3B3] text-xs w-full text-center">Contact HR Admin to update locked fields</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const { user, myEmployee } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewEmployee, setViewEmployee] = useState(null);

  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
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

  // Compute filtered list synchronously via useMemo — no separate state,
  // so there's never a frame where loading=false and filtered=[] at the same time.
  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const sl = search.toLowerCase();
    return employees.filter(e =>
      (e.first_name + " " + e.last_name).toLowerCase().includes(sl) ||
      e.work_email?.toLowerCase().includes(sl) ||
      e.employee_id?.toLowerCase().includes(sl) ||
      e.department_name?.toLowerCase().includes(sl) ||
      e.job_position_name?.toLowerCase().includes(sl)
    );
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
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
            Employees
          </h1>
          <p className="text-[#B3B3B3] text-sm mt-0.5">
            {loading ? "Loading..." : `${filtered.length} total`}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-5 md:mb-6">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B3B3B3]" />
          <input
            data-testid="employee-search"
            type="text"
            placeholder="Search by name, email, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#2F2F2F] border border-white/10 text-white placeholder-[#B3B3B3] rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-white/30 transition-colors min-h-[44px] md:min-h-0"
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
          className="fixed bottom-5 right-5 md:bottom-20 md:right-8 bg-[#E53935] hover:bg-[#F44336] text-white rounded-full w-14 h-14 md:w-auto md:h-auto md:px-5 md:py-3.5 shadow-xl flex items-center gap-2 z-30 transition-colors font-medium text-sm justify-center"
        >
          <Plus size={20} />
          <span className="hidden md:inline">Add Employee</span>
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

      {/* Non-admin read-only / self-edit modal */}
      {viewEmployee && (
        <SelfProfileModal
          employee={viewEmployee}
          onClose={() => setViewEmployee(null)}
          onSaved={(updated) => {
            setEmployees(prev => prev.map(e => e.employee_id === updated.employee_id ? updated : e));
            setViewEmployee(updated);
          }}
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
