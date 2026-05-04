import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import LeavePage from "@/pages/LeavePage";
import LeaveRequestsPage from "@/pages/LeaveRequestsPage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Leave entry point — routes to the correct view based on the user's role:
 * - Admin department → Tabbed view: "My Leaves" + "Team Requests"
 * - Everyone else    → Personal Leave view (balance + my requests)
 */
export default function LeaveIndexPage() {
  const { user, myEmployee } = useAuth();
  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";
  const [tab, setTab] = useState("mine");

  if (!isAdminDept) return <LeavePage />;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList
          data-testid="leave-admin-tabs"
          className="bg-[#191919] border border-white/10"
        >
          <TabsTrigger
            value="mine"
            data-testid="leave-tab-mine"
            className="data-[state=active]:bg-white data-[state=active]:text-black text-[#B3B3B3]"
          >
            My Leaves
          </TabsTrigger>
          <TabsTrigger
            value="team"
            data-testid="leave-tab-team"
            className="data-[state=active]:bg-white data-[state=active]:text-black text-[#B3B3B3]"
          >
            Team Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-4">
          <LeavePage />
        </TabsContent>
        <TabsContent value="team" className="mt-4">
          <LeaveRequestsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
