import { useAuth } from "@/contexts/AuthContext";
import LeavePage from "@/pages/LeavePage";
import LeaveRequestsPage from "@/pages/LeaveRequestsPage";

/**
 * Leave entry point — routes to the correct view based on the user's role:
 * - Admin department → Leave Requests approval console
 * - Everyone else    → Personal Leave view (balance + my requests)
 */
export default function LeaveIndexPage() {
  const { user, myEmployee } = useAuth();
  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";
  return isAdminDept ? <LeaveRequestsPage /> : <LeavePage />;
}
