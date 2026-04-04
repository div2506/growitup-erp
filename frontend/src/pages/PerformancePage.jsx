import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronRight, ChevronLeft, ExternalLink, Users, User, BarChart2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function ScoreBadge({ score }) {
  if (score === null || score === undefined || score === "") {
    return <span className="text-[#B3B3B3] text-xs">—</span>;
  }
  const num = parseFloat(score);
  const color = num >= 7 ? "text-green-400 bg-green-400/10" : num >= 5 ? "text-amber-400 bg-amber-400/10" : "text-red-400 bg-red-400/10";
  return (
    <span className={`inline-flex items-center justify-center w-10 h-7 rounded-lg font-bold text-sm ${color}`}>
      {num.toFixed(1)}
    </span>
  );
}

function DeadlineBadge({ status }) {
  if (!status || status === "No Date") return <span className="text-[#B3B3B3] text-xs">No Date</span>;
  const isOnTime = status === "On Time";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isOnTime ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"}`}>
      {isOnTime ? "On Time" : status.replace("Missed Deadline ", "Late ")}
    </span>
  );
}

function StarRating({ value }) {
  if (value === null || value === undefined) return <span className="text-[#B3B3B3] text-xs">—</span>;
  return (
    <span className="text-amber-400 text-sm">
      {"⭐".repeat(Math.min(5, Math.max(0, parseInt(value))))}
      <span className="text-[#B3B3B3] text-xs ml-1">({value}/5)</span>
    </span>
  );
}

// Level 3: Performance Table
function PerformanceTable({ employeeId, employeeName, onBack, showBackLabel }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await axios.get(`${API}/performance?employee_id=${employeeId}`, { withCredentials: true });
        setRecords(data);
      } catch { }
      finally { setLoading(false); }
    };
    fetch();
  }, [employeeId]);

  const avgScore = records.length > 0
    ? (records.filter(r => r.performance_score !== null && r.performance_score !== undefined)
        .reduce((sum, r) => sum + parseFloat(r.performance_score || 0), 0) /
       Math.max(1, records.filter(r => r.performance_score !== null && r.performance_score !== undefined).length)
      ).toFixed(1)
    : null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-[#B3B3B3] hover:text-white text-sm transition-colors">
            <ChevronLeft size={16} /> {showBackLabel || "Back"}
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold">
            {employeeName?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <h2 className="text-white font-semibold" style={{ fontFamily: "Manrope, sans-serif" }}>
              {employeeName}
            </h2>
            <p className="text-[#B3B3B3] text-xs">{records.length} tasks</p>
          </div>
          {avgScore !== null && (
            <div className="ml-3 flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
              <BarChart2 size={14} className="text-[#B3B3B3]" />
              <span className="text-[#B3B3B3] text-xs">Avg Score</span>
              <ScoreBadge score={avgScore} />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 size={32} className="text-[#B3B3B3] mb-3" />
          <p className="text-white font-medium">No performance data yet</p>
          <p className="text-[#B3B3B3] text-sm">Data will appear once Notion webhooks start syncing</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[900px]" data-testid="performance-table">
            <thead className="bg-[#191919] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Task</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Type</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Deadline</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Ratings</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Changes</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Vid Len</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-[#B3B3B3] uppercase tracking-wider">Score</th>
              </tr>
            </thead>
            <tbody className="bg-[#2F2F2F] divide-y divide-white/5">
              {records.map((record) => (
                <tr key={record.page_id} className="hover:bg-white/5 transition-colors" data-testid="performance-row">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{record.title || "Untitled"}</span>
                      {record.page_url && (
                        <a href={record.page_url} target="_blank" rel="noopener noreferrer"
                          className="text-[#B3B3B3] hover:text-white transition-colors">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/15 text-blue-400 w-fit">
                      {record.task_type || record.database_type || "—"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4"><DeadlineBadge status={record.deadline_status} /></td>
                  <td className="py-3.5 px-4">
                    {record.database_type === "Video Editing" ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#B3B3B3] text-[10px] w-14">Intro:</span>
                          <StarRating value={record.intro_rating} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#B3B3B3] text-[10px] w-14">Overall:</span>
                          <StarRating value={record.overall_rating} />
                        </div>
                      </div>
                    ) : record.database_type === "Thumbnail" ? (
                      <StarRating value={record.thumbnail_rating} />
                    ) : record.database_type === "Script" ? (
                      <StarRating value={record.script_rating} />
                    ) : <span className="text-[#B3B3B3] text-xs">—</span>}
                  </td>
                  <td className="py-3.5 px-4 text-sm text-[#B3B3B3]">
                    {record.changes_count !== null && record.changes_count !== undefined ? record.changes_count : "—"}
                  </td>
                  <td className="py-3.5 px-4 text-sm text-[#B3B3B3]">
                    {record.database_type === "Video Editing" && record.video_length !== null && record.video_length !== undefined
                      ? `${record.video_length} min`
                      : "—"}
                  </td>
                  <td className="py-3.5 px-4 text-center"><ScoreBadge score={record.performance_score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Level 2: Employee Selection
function EmployeeSelection({ teamId, teamName, onSelectEmployee, onBack }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const url = teamId ? `${API}/employees?team_id=${teamId}` : `${API}/employees`;
        const { data } = await axios.get(url, { withCredentials: true });
        setEmployees(data);
      } catch { }
      finally { setLoading(false); }
    };
    fetch();
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
          <h2 className="text-white font-semibold" style={{ fontFamily: "Manrope, sans-serif" }}>
            {teamName}
          </h2>
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
          <p className="text-[#B3B3B3] text-sm">Add employees to this team from the Employees section</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="employee-selection-grid">
          {employees.map((emp) => (
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
              <p className="text-[#B3B3B3] text-[10px] mt-1">{emp.employee_id}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Level 1: Team Selection
function TeamSelection({ onSelectTeam }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await axios.get(`${API}/teams`, { withCredentials: true });
        setTeams(data);
      } catch { }
      finally { setLoading(false); }
    };
    fetch();
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
          {teams.map((team) => (
            <button key={team.team_id} data-testid="team-select-card"
              onClick={() => onSelectTeam(team)}
              className="bg-[#2F2F2F] rounded-xl border border-white/10 p-5 text-left hover:border-white/30 hover:-translate-y-0.5 transition-all duration-200 group">
              <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                <Users size={18} className="text-[#B3B3B3] group-hover:text-white transition-colors" />
              </div>
              <p className="text-white font-semibold text-sm">{team.team_name}</p>
              {team.team_manager_name && (
                <p className="text-[#B3B3B3] text-xs mt-1 truncate">Manager: {team.team_manager_name}</p>
              )}
              <div className="flex items-center justify-end mt-3">
                <ChevronRight size={16} className="text-[#B3B3B3] group-hover:text-white transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PerformancePage() {
  const { user } = useAuth();
  const [myEmployee, setMyEmployee] = useState(null);
  const [myManagedTeams, setMyManagedTeams] = useState([]);
  const [roleLoading, setRoleLoading] = useState(true);

  // Drill-down state
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const loadRole = useCallback(async () => {
    try {
      const [empRes, teamsRes] = await Promise.all([
        axios.get(`${API}/me/employee`, { withCredentials: true }),
        axios.get(`${API}/teams`, { withCredentials: true }),
      ]);
      const emp = empRes.data;
      setMyEmployee(emp);
      if (emp && emp.employee_id) {
        const managed = teamsRes.data.filter(t => t.team_manager_id === emp.employee_id);
        setMyManagedTeams(managed);
      }
    } catch { }
    finally { setRoleLoading(false); }
  }, []);

  useEffect(() => { loadRole(); }, [loadRole]);

  const isAdmin = user?.is_admin;
  const isManager = !isAdmin && myManagedTeams.length > 0;
  const isEmployee = !isAdmin && !isManager && myEmployee?.employee_id;

  if (roleLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-[#2F2F2F] rounded animate-pulse mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-[#2F2F2F] rounded-xl animate-pulse border border-white/10" />)}
        </div>
      </div>
    );
  }

  // Breadcrumb
  const breadcrumbs = ["Performance"];
  if (selectedTeam) breadcrumbs.push(selectedTeam.team_name);
  if (selectedEmployee) breadcrumbs.push(`${selectedEmployee.first_name} ${selectedEmployee.last_name}`);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Performance</h1>
        <div className="flex items-center gap-2 mt-1">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={14} className="text-[#B3B3B3]" />}
              <span className={i === breadcrumbs.length - 1 ? "text-white text-sm" : "text-[#B3B3B3] text-sm"}>{crumb}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ADMIN VIEW */}
      {isAdmin && (
        <>
          {!selectedTeam && !selectedEmployee && (
            <TeamSelection onSelectTeam={(team) => setSelectedTeam(team)} />
          )}
          {selectedTeam && !selectedEmployee && (
            <EmployeeSelection
              teamId={selectedTeam.team_id}
              teamName={selectedTeam.team_name}
              onSelectEmployee={(emp) => setSelectedEmployee(emp)}
              onBack={() => setSelectedTeam(null)}
            />
          )}
          {selectedTeam && selectedEmployee && (
            <PerformanceTable
              employeeId={selectedEmployee.employee_id}
              employeeName={`${selectedEmployee.first_name} ${selectedEmployee.last_name}`}
              onBack={() => setSelectedEmployee(null)}
              showBackLabel={selectedTeam.team_name}
            />
          )}
        </>
      )}

      {/* MANAGER VIEW */}
      {isManager && (
        <>
          {!selectedEmployee && (
            <EmployeeSelection
              teamId={myManagedTeams[0]?.team_id}
              teamName={myManagedTeams[0]?.team_name || "My Team"}
              onSelectEmployee={(emp) => setSelectedEmployee(emp)}
              onBack={null}
            />
          )}
          {selectedEmployee && (
            <PerformanceTable
              employeeId={selectedEmployee.employee_id}
              employeeName={`${selectedEmployee.first_name} ${selectedEmployee.last_name}`}
              onBack={() => setSelectedEmployee(null)}
              showBackLabel="My Team"
            />
          )}
        </>
      )}

      {/* EMPLOYEE VIEW */}
      {isEmployee && (
        <PerformanceTable
          employeeId={myEmployee.employee_id}
          employeeName={`${myEmployee.first_name} ${myEmployee.last_name}`}
          onBack={null}
        />
      )}

      {/* No role detected fallback */}
      {!isAdmin && !isManager && !isEmployee && !roleLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BarChart2 size={40} className="text-[#B3B3B3] mb-4" />
          <p className="text-white font-medium text-lg">Performance data unavailable</p>
          <p className="text-[#B3B3B3] text-sm mt-1">Your account is not linked to an employee profile.</p>
        </div>
      )}
    </div>
  );
}
