import { useState } from "react";
import { CalendarCheck, Inbox } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import LeavePage from "@/pages/LeavePage";
import LeaveRequestsPage from "@/pages/LeaveRequestsPage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Leave entry point — routes based on role:
 * - Admin department → Tabs: "My Leaves" + "Team Requests"
 * - Everyone else    → Personal Leave view
 */
export default function LeaveIndexPage() {
  const { user, myEmployee } = useAuth();
  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";
  const [tab, setTab] = useState("mine");

  if (!isAdminDept) return <LeavePage />;

  const tabs = [
    { val: "mine", label: "My Leaves",     icon: CalendarCheck },
    { val: "team", label: "Team Requests", icon: Inbox },
  ];

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <div
        className="overflow-x-auto no-scrollbar px-4 md:px-8 pt-4 md:pt-8"
        data-testid="leave-admin-tabs"
      >
        <TabsList className="bg-[#191919] border border-white/10 p-1 rounded-lg h-auto flex gap-1 w-fit">
          {tabs.map(({ val, label, icon: Icon }) => (
            <TabsTrigger
              key={val}
              value={val}
              data-testid={`leave-tab-${val}`}
              className="data-[state=active]:bg-[#2F2F2F] data-[state=active]:text-white text-[#B3B3B3] rounded-md px-3 sm:px-4 py-2 text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap"
            >
              <Icon size={15} />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="mine" className="mt-0">
        <LeavePage />
      </TabsContent>
      <TabsContent value="team" className="mt-0">
        <LeaveRequestsPage />
      </TabsContent>
    </Tabs>
  );
}
