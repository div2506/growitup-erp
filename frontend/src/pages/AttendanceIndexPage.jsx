import { useState } from "react";
import { Calendar, Clock, Home, Timer } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import AttendancePage from "@/pages/AttendancePage";
import ShiftsPage from "@/pages/ShiftsPage";
import WFHPage from "@/pages/WFHPage";
import WFHRequestsPage from "@/pages/WFHRequestsPage";
import OvertimePage from "@/pages/OvertimePage";
import OvertimeRequestsPage from "@/pages/OvertimeRequestsPage";
import { ShiftRequestsTab } from "@/pages/SettingsPage";

/**
 * Attendance entry point — surfaces all attendance-related modules as tabs.
 *
 * Admin dept tabs:    Attendance | Shift Requests | WFH Requests | Overtime Requests
 * Non-admin tabs:     Attendance | Request Shift Change | Request WFH | Log Overtime
 */
export default function AttendanceIndexPage() {
  const { user, myEmployee } = useAuth();
  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";
  const [tab, setTab] = useState("attendance");

  const tabs = isAdminDept
    ? [
        { val: "attendance",         label: "Attendance",         icon: Calendar },
        { val: "shift-requests",     label: "Shift Requests",     icon: Clock },
        { val: "wfh-requests",       label: "WFH Requests",       icon: Home },
        { val: "overtime-requests",  label: "Overtime Requests",  icon: Timer },
      ]
    : [
        { val: "attendance",         label: "Attendance",          icon: Calendar },
        { val: "shift",              label: "Request Shift Change", icon: Clock },
        { val: "wfh",                label: "Request WFH",         icon: Home },
        { val: "overtime",           label: "Log Overtime",        icon: Timer },
      ];

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      {/* Tab navigation — matches Settings/Performance styling */}
      <div
        className="overflow-x-auto no-scrollbar px-4 md:px-8 pt-4 md:pt-8"
        data-testid="attendance-tabs-nav"
      >
        <TabsList className="bg-[#191919] border border-white/10 p-1 rounded-lg h-auto flex gap-1 w-fit">
          {tabs.map(({ val, label, icon: Icon }) => (
            <TabsTrigger
              key={val}
              value={val}
              data-testid={`attendance-tab-${val}`}
              className="data-[state=active]:bg-[#2F2F2F] data-[state=active]:text-white text-[#B3B3B3] rounded-md px-3 sm:px-4 py-2 text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap"
            >
              <Icon size={15} />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* Tab content — each child page brings its own padding/header */}
      <TabsContent value="attendance" className="mt-0">
        <AttendancePage />
      </TabsContent>

      {isAdminDept ? (
        <>
          <TabsContent value="shift-requests" className="mt-0">
            <div className="p-4 md:p-8">
              <div className="mb-6">
                <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                  Shift Change Requests
                </h1>
                <p className="text-[#B3B3B3] text-sm mt-0.5">Review and approve employee shift change requests</p>
              </div>
              <ShiftRequestsTab />
            </div>
          </TabsContent>
          <TabsContent value="wfh-requests" className="mt-0">
            <WFHRequestsPage />
          </TabsContent>
          <TabsContent value="overtime-requests" className="mt-0">
            <OvertimeRequestsPage />
          </TabsContent>
        </>
      ) : (
        <>
          <TabsContent value="shift" className="mt-0">
            <ShiftsPage />
          </TabsContent>
          <TabsContent value="wfh" className="mt-0">
            <WFHPage />
          </TabsContent>
          <TabsContent value="overtime" className="mt-0">
            <OvertimePage />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
