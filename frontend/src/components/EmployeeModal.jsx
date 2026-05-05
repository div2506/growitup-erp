import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, ChevronRight, ChevronLeft, Check, User } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const GENDERS = ["Male", "Female", "Other"];
const EMP_TYPES = ["Full-time", "Part-time", "Freelance", "Intern", "Trainee"];
const STATUSES = ["Active", "Inactive"];

const EMPTY_FORM = {
  first_name: "", last_name: "", personal_email: "", phone: "",
  date_of_birth: "", gender: "", qualification: "", address: "",
  country: "India", state_id: "", state_name: "", city_id: "", city_name: "",
  zipcode: "", emergency_contact_name: "", emergency_contact_number: "",
  emergency_contact_relation: "", work_email: "", department_id: "",
  department_name: "", job_position_id: "", job_position_name: "", level: "",
  reporting_manager_id: "", reporting_manager_name: "", employee_type: "",
  joining_date: "", basic_salary: "", bank_name: "", account_name: "",
  account_number: "", ifsc_code: "", profile_picture: null, status: "Active",
  teams: [],
  shift_id: "",
  paid_leave_eligible: false,
  wfh_eligible: false
};

const inputCls = "bg-[#191919] border-white/10 text-white placeholder-[#B3B3B3] focus-visible:ring-white/20 focus-visible:border-white/30";
const labelCls = "text-[#B3B3B3] text-sm";

function FieldError({ msg }) {
  return msg ? <p className="text-red-400 text-xs mt-0.5">{msg}</p> : null;
}

function FormField({ label, required, error, children }) {
  return (
    <div className="space-y-1">
      <Label className={labelCls}>{label}{required && " *"}</Label>
      {children}
      <FieldError msg={error} />
    </div>
  );
}

export default function EmployeeModal({ employee, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [tab, setTab] = useState("personal");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [tab1Done, setTab1Done] = useState(false);
  const [tab2Done, setTab2Done] = useState(false);

  // Reference data
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [jobPositions, setJobPositions] = useState([]); // filtered by dept
  const [allEmployees, setAllEmployees] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [allShifts, setAllShifts] = useState([]);

  const selectedJobPos = jobPositions.find(jp => jp.position_id === form.job_position_id);
  const showLevel = selectedJobPos?.has_levels === true;

  // Load initial data
  useEffect(() => {
    const load = async () => {
      try {
        const [statesRes, deptsRes, empsRes, teamsRes, shiftsRes] = await Promise.all([
          axios.get(`${API}/states`, { withCredentials: true }),
          axios.get(`${API}/departments`, { withCredentials: true }),
          axios.get(`${API}/employees`, { withCredentials: true }),
          axios.get(`${API}/teams`, { withCredentials: true }),
          axios.get(`${API}/shifts`, { withCredentials: true }),
        ]);
        setStates(statesRes.data);
        setDepartments(deptsRes.data);
        setAllEmployees(empsRes.data);
        setAllTeams(teamsRes.data);
        setAllShifts(shiftsRes.data);
      } catch {
        toast.error("Failed to load form data");
      }
    };
    load();
  }, []);

  // Pre-fill if editing
  useEffect(() => {
    if (employee) {
      setForm({
        ...EMPTY_FORM,
        ...employee,
        basic_salary: employee.basic_salary?.toString() || "",
        level: employee.level || "",
        reporting_manager_id: employee.reporting_manager_id || "",
        reporting_manager_name: employee.reporting_manager_name || "",
        profile_picture: employee.profile_picture || null,
        teams: employee.teams || [],
        shift_id: employee.shift_id || "",
        paid_leave_eligible: false, // will be overridden by balance fetch below
      });
      // Load employee's current shift if editing
      if (employee.employee_id) {
        axios.get(`${API}/employee-shifts/${employee.employee_id}`, { withCredentials: true })
          .then(res => {
            if (res.data?.shift_id) {
              setForm(prev => ({ ...prev, shift_id: res.data.shift_id }));
            }
          })
          .catch(() => {});
        // Load paid leave eligibility from leave_balance
        axios.get(`${API}/leave/balance?employee_id=${employee.employee_id}`, { withCredentials: true })
          .then(res => {
            setForm(prev => ({ ...prev, paid_leave_eligible: !!res.data?.paid_leave_eligible }));
          })
          .catch(() => {});
      }
    } else {
      setForm(EMPTY_FORM);
    }
    setTab("personal");
    setErrors({});
  }, [employee]);

  // Load cities when state changes
  useEffect(() => {
    if (form.state_id) {
      axios.get(`${API}/cities?state_id=${form.state_id}`, { withCredentials: true })
        .then(res => setCities(res.data))
        .catch(() => setCities([]));
    } else {
      setCities([]);
    }
  }, [form.state_id]);

  // Load job positions when department changes
  useEffect(() => {
    if (form.department_id) {
      axios.get(`${API}/job-positions?department_id=${form.department_id}`, { withCredentials: true })
        .then(res => setJobPositions(res.data))
        .catch(() => setJobPositions([]));
    } else {
      setJobPositions([]);
    }
  }, [form.department_id]);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: "" }));
  };

  const handleStateChange = (stateId) => {
    const state = states.find(s => s.state_id === stateId);
    setForm(prev => ({ ...prev, state_id: stateId, state_name: state?.state_name || "", city_id: "", city_name: "" }));
    setErrors(prev => ({ ...prev, state_id: "", city_id: "" }));
  };

  const handleCityChange = (cityId) => {
    const city = cities.find(c => c.city_id === cityId);
    setForm(prev => ({ ...prev, city_id: cityId, city_name: city?.city_name || "" }));
    setErrors(prev => ({ ...prev, city_id: "" }));
  };

  const handleDeptChange = (deptId) => {
    const dept = departments.find(d => d.department_id === deptId);
    setForm(prev => ({
      ...prev,
      department_id: deptId, department_name: dept?.department_name || "",
      job_position_id: "", job_position_name: "", level: ""
    }));
    setErrors(prev => ({ ...prev, department_id: "", job_position_id: "", level: "" }));
  };

  const handlePosChange = (posId) => {
    const pos = jobPositions.find(p => p.position_id === posId);
    setForm(prev => ({
      ...prev,
      job_position_id: posId, job_position_name: pos?.position_name || "",
      level: pos?.has_levels ? prev.level : ""
    }));
    setErrors(prev => ({ ...prev, job_position_id: "", level: "" }));
  };

  const handleManagerChange = (empId) => {
    const actualId = empId === "__none__" ? "" : empId;
    const emp = allEmployees.find(e => e.employee_id === actualId);
    setForm(prev => ({
      ...prev,
      reporting_manager_id: actualId,
      reporting_manager_name: emp ? `${emp.first_name} ${emp.last_name}` : ""
    }));
  };

  const handlePicture = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
    const reader = new FileReader();
    reader.onloadend = () => set("profile_picture", reader.result);
    reader.readAsDataURL(file);
  };

  // Tab 1 required fields
  const tab1Required = ["first_name", "last_name", "personal_email", "phone", "date_of_birth", "gender", "qualification", "address", "state_id", "city_id", "zipcode", "emergency_contact_name", "emergency_contact_number", "emergency_contact_relation"];
  // Tab 2 required fields
  const tab2Required = ["work_email", "department_id", "job_position_id", "employee_type", "joining_date", "basic_salary"];
  // Tab 3 required fields
  const tab3Required = ["bank_name", "account_name", "account_number", "ifsc_code"];

  const validateTab = (fields) => {
    const e = {};
    fields.forEach(f => { if (!form[f] || form[f].toString().trim() === "") e[f] = "Required"; });
    if (fields.includes("personal_email") && form.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personal_email)) e.personal_email = "Invalid email";
    if (fields.includes("work_email") && form.work_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.work_email)) e.work_email = "Invalid email";
    if (showLevel && fields.includes("job_position_id") && !form.level) e.level = "Level is required for this position";
    setErrors(prev => ({ ...prev, ...e }));
    return Object.keys(e).length === 0;
  };

  const goToTab2 = () => {
    if (validateTab(tab1Required)) { setTab1Done(true); setTab("work"); }
  };

  const goToTab3 = () => {
    if (validateTab(tab2Required)) { setTab2Done(true); setTab("bank"); }
  };

  const handleSave = async () => {
    const allValid = validateTab(tab3Required);
    if (!allValid) return;
    // Also validate tabs 1 and 2 just in case
    const t1 = tab1Required.every(f => form[f] && form[f].toString().trim() !== "");
    const t2 = tab2Required.every(f => form[f] && form[f].toString().trim() !== "");
    if (!t1) { setTab("personal"); toast.error("Please complete Personal Info"); return; }
    if (!t2) { setTab("work"); toast.error("Please complete Work Info"); return; }

    setSaving(true);
    const payload = {
      ...form,
      basic_salary: parseFloat(form.basic_salary) || 0,
      level: form.level || null,
      reporting_manager_id: form.reporting_manager_id || null,
      reporting_manager_name: form.reporting_manager_name || null,
      teams: form.teams || [],
    };
    delete payload.employee_id;
    delete payload.created_at;
    delete payload.updated_at;

    try {
      if (employee) {
        await axios.put(`${API}/employees/${employee.employee_id}`, payload, { withCredentials: true });
        toast.success("Employee updated successfully");
      } else {
        await axios.post(`${API}/employees`, payload, { withCredentials: true });
        toast.success("Employee added successfully");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  // Managers list (exclude current employee when editing)
  const managerOptions = allEmployees.filter(e => !employee || e.employee_id !== employee.employee_id);

  const tabStatus = (t) => {
    if (t === "personal") return tab1Done;
    if (t === "work") return tab2Done;
    return false;
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#2F2F2F] border border-white/10 text-white w-full sm:max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[90vh] max-w-none sm:rounded-lg rounded-none p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-white/10 shrink-0">
          <DialogTitle className="text-white text-lg sm:text-xl" style={{ fontFamily: "Manrope, sans-serif" }}>
            {employee ? `Edit Employee — ${employee.employee_id}` : "Add New Employee"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 sm:px-6 pt-4 shrink-0">
            <TabsList className="bg-[#191919] border border-white/10 w-full p-1 grid grid-cols-3 h-auto rounded-lg">
              {[["personal", "Personal Info"], ["work", "Work Info"], ["bank", "Bank Info"]].map(([val, lbl]) => (
                <TabsTrigger
                  key={val}
                  value={val}
                  data-testid={`tab-${val}`}
                  className="data-[state=active]:bg-[#2F2F2F] data-[state=active]:text-white text-[#B3B3B3] rounded-md py-2 text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all whitespace-nowrap"
                >
                  {tabStatus(val) && <Check size={13} className="text-green-400" />}
                  <span className="truncate">{lbl}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
          {/* ===== TAB 1: PERSONAL INFO ===== */}
          <TabsContent value="personal" className="px-4 sm:px-6 pb-6 pt-4 mt-0">
            {/* Profile Picture */}
            <div className="flex items-center gap-4 sm:gap-5 mb-5 sm:mb-6 pb-5 border-b border-white/10 flex-wrap">
              <div className="relative">
                {form.profile_picture ? (
                  <img src={form.profile_picture} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-white/10" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-[#191919] border-2 border-white/10 flex items-center justify-center">
                    <User size={28} className="text-[#B3B3B3]" />
                  </div>
                )}
                <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#E53935] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#F44336] transition-colors">
                  <Upload size={13} className="text-white" />
                  <input type="file" accept="image/*" className="sr-only" onChange={handlePicture} data-testid="profile-picture-input" />
                </label>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">Profile Picture</p>
                <p className="text-[#B3B3B3] text-xs mt-0.5">PNG, JPG up to 2MB</p>
                {form.profile_picture && (
                  <button onClick={() => set("profile_picture", null)} className="text-xs text-red-400 hover:text-red-300 mt-1">Remove</button>
                )}
              </div>
              {employee && (
                <div className="sm:ml-auto">
                  <p className="text-[#B3B3B3] text-xs">Employee ID</p>
                  <p className="text-white font-bold text-lg">{employee.employee_id}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="First Name" required error={errors.first_name}>
                <Input data-testid="first-name-input" value={form.first_name} onChange={e => set("first_name", e.target.value)} className={inputCls} placeholder="John" />
              </FormField>
              <FormField label="Last Name" required error={errors.last_name}>
                <Input data-testid="last-name-input" value={form.last_name} onChange={e => set("last_name", e.target.value)} className={inputCls} placeholder="Doe" />
              </FormField>
              <FormField label="Personal Email" required error={errors.personal_email}>
                <Input data-testid="personal-email-input" type="email" value={form.personal_email} onChange={e => set("personal_email", e.target.value)} className={inputCls} placeholder="john@gmail.com" />
              </FormField>
              <FormField label="Phone Number" required error={errors.phone}>
                <Input data-testid="phone-input" type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} className={inputCls} placeholder="9876543210" />
              </FormField>
              <FormField label="Date of Birth" required error={errors.date_of_birth}>
                <Input data-testid="dob-input" type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} className={inputCls} />
              </FormField>
              <FormField label="Gender" required error={errors.gender}>
                <Select value={form.gender} onValueChange={v => set("gender", v)}>
                  <SelectTrigger data-testid="gender-select" className={`${inputCls} focus:ring-0`}><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent className="bg-[#2F2F2F] border-white/10">
                    {GENDERS.map(g => <SelectItem key={g} value={g} className="text-white focus:bg-white/10">{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Qualification" required error={errors.qualification}>
                <Input data-testid="qualification-input" value={form.qualification} onChange={e => set("qualification", e.target.value)} className={inputCls} placeholder="e.g. B.Tech, MBA" />
              </FormField>
              <FormField label="Zipcode" required error={errors.zipcode}>
                <Input data-testid="zipcode-input" value={form.zipcode} onChange={e => set("zipcode", e.target.value)} className={inputCls} placeholder="380001" />
              </FormField>

              <div className="sm:col-span-2">
                <FormField label="Address" required error={errors.address}>
                  <Textarea data-testid="address-input" value={form.address} onChange={e => set("address", e.target.value)} className={`${inputCls} min-h-[70px] resize-none`} placeholder="Street address, area..." />
                </FormField>
              </div>

              <FormField label="Country" required error={errors.country}>
                <Input value="India" disabled className="bg-[#191919] border-white/10 text-[#B3B3B3] opacity-70" />
              </FormField>
              <FormField label="State" required error={errors.state_id}>
                <Select value={form.state_id} onValueChange={handleStateChange}>
                  <SelectTrigger data-testid="state-select" className={`${inputCls} focus:ring-0`}><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-52">
                    {states.map(s => <SelectItem key={s.state_id} value={s.state_id} className="text-white focus:bg-white/10">{s.state_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="City" required error={errors.city_id}>
                <Select value={form.city_id} onValueChange={handleCityChange} disabled={!form.state_id}>
                  <SelectTrigger data-testid="city-select" className={`${inputCls} focus:ring-0 disabled:opacity-50`}><SelectValue placeholder={form.state_id ? "Select city" : "Select state first"} /></SelectTrigger>
                  <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-52">
                    {cities.map(c => <SelectItem key={c.city_id} value={c.city_id} className="text-white focus:bg-white/10">{c.city_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <div className="hidden sm:block" /> {/* spacer */}
            </div>

            {/* Emergency Contact */}
            <div className="mt-5 pt-5 border-t border-white/10">
              <p className="text-white font-medium text-sm mb-3">Emergency Contact</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Contact Name" required error={errors.emergency_contact_name}>
                  <Input data-testid="emergency-name-input" value={form.emergency_contact_name} onChange={e => set("emergency_contact_name", e.target.value)} className={inputCls} placeholder="Name" />
                </FormField>
                <FormField label="Contact Number" required error={errors.emergency_contact_number}>
                  <Input data-testid="emergency-number-input" value={form.emergency_contact_number} onChange={e => set("emergency_contact_number", e.target.value)} className={inputCls} placeholder="Number" />
                </FormField>
                <FormField label="Relation" required error={errors.emergency_contact_relation}>
                  <Input data-testid="emergency-relation-input" value={form.emergency_contact_relation} onChange={e => set("emergency_contact_relation", e.target.value)} className={inputCls} placeholder="e.g. Father" />
                </FormField>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <Button data-testid="tab1-next" onClick={goToTab2} className="bg-white text-black hover:bg-gray-100 gap-1.5 min-h-[44px]">
                Next: Work Info <ChevronRight size={16} />
              </Button>
            </div>
          </TabsContent>

          {/* ===== TAB 2: WORK INFO ===== */}
          <TabsContent value="work" className="px-4 sm:px-6 pb-6 pt-4 mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <FormField label="Work Email (Login Email)" required error={errors.work_email}>
                  <div className="relative">
                    <Input data-testid="work-email-input" type="email" value={form.work_email} onChange={e => set("work_email", e.target.value)} className={`${inputCls} pr-28`} placeholder="john@growitup.com" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded whitespace-nowrap">Login Email</span>
                  </div>
                </FormField>
              </div>

              <FormField label="Department" required error={errors.department_id}>
                <Select value={form.department_id} onValueChange={handleDeptChange}>
                  <SelectTrigger data-testid="department-select" className={`${inputCls} focus:ring-0`}><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent className="bg-[#2F2F2F] border-white/10">
                    {departments.map(d => <SelectItem key={d.department_id} value={d.department_id} className="text-white focus:bg-white/10">{d.department_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Job Position" required error={errors.job_position_id}>
                <Select value={form.job_position_id} onValueChange={handlePosChange} disabled={!form.department_id}>
                  <SelectTrigger data-testid="job-position-select" className={`${inputCls} focus:ring-0 disabled:opacity-50`}><SelectValue placeholder={form.department_id ? "Select position" : "Select dept first"} /></SelectTrigger>
                  <SelectContent className="bg-[#2F2F2F] border-white/10">
                    {jobPositions.map(p => <SelectItem key={p.position_id} value={p.position_id} className="text-white focus:bg-white/10">{p.position_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>

              {showLevel && (
                <FormField label="Level" required error={errors.level}>
                  <Select value={form.level} onValueChange={v => set("level", v)}>
                    <SelectTrigger data-testid="level-select" className={`${inputCls} focus:ring-0`}><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent className="bg-[#2F2F2F] border-white/10">
                      {(selectedJobPos?.available_levels || []).map(l => (
                        <SelectItem key={l} value={l} className="text-white focus:bg-white/10">{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}

              <FormField label="Reporting Manager" error={errors.reporting_manager_id}>
                <Select value={form.reporting_manager_id || "__none__"} onValueChange={handleManagerChange}>
                  <SelectTrigger data-testid="manager-select" className={`${inputCls} focus:ring-0`}><SelectValue placeholder="Select manager" /></SelectTrigger>
                  <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-52">
                    <SelectItem value="__none__" className="text-[#B3B3B3] focus:bg-white/10">None</SelectItem>
                    {managerOptions.map(e => (
                      <SelectItem key={e.employee_id} value={e.employee_id} className="text-white focus:bg-white/10">
                        {e.first_name} {e.last_name} ({e.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Employee Type" required error={errors.employee_type}>
                <Select value={form.employee_type} onValueChange={v => set("employee_type", v)}>
                  <SelectTrigger data-testid="employee-type-select" className={`${inputCls} focus:ring-0`}><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent className="bg-[#2F2F2F] border-white/10">
                    {EMP_TYPES.map(t => <SelectItem key={t} value={t} className="text-white focus:bg-white/10">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Joining Date" required error={errors.joining_date}>
                <Input data-testid="joining-date-input" type="date" value={form.joining_date} onChange={e => set("joining_date", e.target.value)} className={inputCls} />
              </FormField>

              <FormField label="Basic Salary (₹)" required error={errors.basic_salary}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B3B3B3] text-sm">₹</span>
                  <Input data-testid="salary-input" type="number" value={form.basic_salary} onChange={e => set("basic_salary", e.target.value)} className={`${inputCls} pl-7`} placeholder="50000" />
                </div>
              </FormField>

              <FormField label="Status" required error={errors.status}>
                <Select value={form.status} onValueChange={v => set("status", v)}>
                  <SelectTrigger className={`${inputCls} focus:ring-0`}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#2F2F2F] border-white/10">
                    {STATUSES.map(s => <SelectItem key={s} value={s} className="text-white focus:bg-white/10">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            {/* Teams Multi-Select */}
            {allTeams.length > 0 && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <p className="text-white font-medium text-sm mb-3">Team Assignment</p>
                <div className="space-y-1.5">
                  <Label className={labelCls}>Teams (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2" data-testid="teams-multiselect">
                    {allTeams.map(team => {
                      const isSelected = (form.teams || []).includes(team.team_id);
                      return (
                        <button
                          key={team.team_id}
                          type="button"
                          data-testid={`team-toggle-${team.team_id}`}
                          onClick={() => {
                            const current = form.teams || [];
                            const updated = isSelected
                              ? current.filter(id => id !== team.team_id)
                              : [...current, team.team_id];
                            set("teams", updated);
                          }}
                          className={`px-3 py-2 rounded-lg text-sm border transition-colors min-h-[40px] ${
                            isSelected
                              ? "bg-white/10 text-white border-white/30"
                              : "bg-transparent text-[#B3B3B3] border-white/10 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {team.team_name}
                          {isSelected && <span className="ml-1.5 text-green-400">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  {(form.teams || []).length > 0 && (
                    <p className="text-[#B3B3B3] text-xs mt-1">
                      {(form.teams || []).length} team{(form.teams || []).length !== 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Shift Assignment */}
            {allShifts.length > 0 && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <p className="text-white font-medium text-sm mb-3">Shift Assignment</p>
                <FormField label="Assigned Shift" error={errors.shift_id}>
                  <Select value={form.shift_id || "__default__"} onValueChange={v => set("shift_id", v === "__default__" ? "" : v)}>
                    <SelectTrigger className={`${inputCls} focus:ring-0`}>
                      <SelectValue placeholder="Select shift (defaults to Regular 9-6)" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#2F2F2F] border-white/10">
                      {allShifts.map(s => {
                        const sh = s.start_time ? (() => {
                          const [h, m] = s.start_time.split(":").map(Number);
                          const ampm = h >= 12 ? "PM" : "AM";
                          const hr = h % 12 || 12;
                          return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
                        })() : "";
                        const eh = s.end_time ? (() => {
                          const [h, m] = s.end_time.split(":").map(Number);
                          const ampm = h >= 12 ? "PM" : "AM";
                          const hr = h % 12 || 12;
                          return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
                        })() : "";
                        return (
                          <SelectItem key={s.shift_id} value={s.shift_id} className="text-white focus:bg-white/10">
                            {s.shift_name} {sh && eh ? `(${sh} – ${eh})` : ""}
                            {s.is_system_default ? " — Default" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[#666] text-xs mt-1">Defaults to "Regular 9-6" if not selected</p>
                </FormField>
              </div>
            )}

            {/* Paid Leave Eligibility */}
            <div className="mt-5 pt-5 border-t border-white/10">
              <p className="text-white font-medium text-sm mb-3">Leave Eligibility</p>
              <label className="flex items-start gap-3 cursor-pointer bg-[#191919] border border-white/10 rounded-lg px-4 py-3 hover:border-white/20 transition-colors">
                <input
                  type="checkbox"
                  data-testid="paid-leave-eligible-checkbox"
                  checked={!!form.paid_leave_eligible}
                  onChange={e => set("paid_leave_eligible", e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-white/20 bg-[#191919] accent-green-500 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">Eligible for Paid Leave</p>
                  <p className="text-[#B3B3B3] text-xs mt-0.5">
                    When enabled, this employee accrues <span className="text-green-400">1 paid leave per month</span> automatically. Disabled employees can still apply for unpaid (regular) leave.
                  </p>
                </div>
              </label>
            </div>

            {/* WFH Eligibility */}
            <div className="mt-5 pt-5 border-t border-white/10">
              <p className="text-white font-medium text-sm mb-3">WFH Eligibility</p>
              <label className="flex items-start gap-3 cursor-pointer bg-[#191919] border border-white/10 rounded-lg px-4 py-3 hover:border-white/20 transition-colors">
                <input
                  type="checkbox"
                  data-testid="wfh-eligible-checkbox"
                  checked={!!form.wfh_eligible}
                  onChange={e => set("wfh_eligible", e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-white/20 bg-[#191919] accent-blue-500 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">Eligible for Work From Home</p>
                  <p className="text-[#B3B3B3] text-xs mt-0.5">
                    When enabled, this employee can request WFH days (<span className="text-blue-400">max 3 days/month</span>). Requests require admin approval.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex justify-between mt-6 gap-3">
              <Button variant="outline" onClick={() => setTab("personal")} className="bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white gap-1.5 min-h-[44px]">
                <ChevronLeft size={16} /> Back
              </Button>
              <Button data-testid="tab2-next" onClick={goToTab3} className="bg-white text-black hover:bg-gray-100 gap-1.5 min-h-[44px]">
                Next: Bank Info <ChevronRight size={16} />
              </Button>
            </div>
          </TabsContent>

          {/* ===== TAB 3: BANK INFO ===== */}
          <TabsContent value="bank" className="px-4 sm:px-6 pb-6 pt-4 mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Bank Name" required error={errors.bank_name}>
                <Input data-testid="bank-name-input" value={form.bank_name} onChange={e => set("bank_name", e.target.value)} className={inputCls} placeholder="e.g. HDFC Bank" />
              </FormField>
              <FormField label="Account Name" required error={errors.account_name}>
                <Input data-testid="account-name-input" value={form.account_name} onChange={e => set("account_name", e.target.value)} className={inputCls} placeholder="Name as per bank" />
              </FormField>
              <FormField label="Account Number" required error={errors.account_number}>
                <Input data-testid="account-number-input" value={form.account_number} onChange={e => set("account_number", e.target.value)} className={inputCls} placeholder="Account number" />
              </FormField>
              <FormField label="IFSC Code" required error={errors.ifsc_code}>
                <Input data-testid="ifsc-input" value={form.ifsc_code} onChange={e => set("ifsc_code", e.target.value.toUpperCase())} className={inputCls} placeholder="e.g. HDFC0001234" />
              </FormField>
            </div>

            <div className="flex justify-between mt-6 gap-3">
              <Button variant="outline" onClick={() => setTab("work")} className="bg-transparent border-white/10 text-white hover:bg-white/10 hover:text-white gap-1.5 min-h-[44px]">
                <ChevronLeft size={16} /> Back
              </Button>
              <Button
                data-testid="save-employee-button"
                onClick={handleSave}
                disabled={saving}
                className="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 min-w-[120px] min-h-[44px]"
              >
                {saving ? "Saving..." : employee ? "Update" : "Add Employee"}
              </Button>
            </div>
          </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
