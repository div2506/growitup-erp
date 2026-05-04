import { useAuth } from "@/contexts/AuthContext";
import WFHPage from "@/pages/WFHPage";
import WFHRequestsPage from "@/pages/WFHRequestsPage";

/**
 * WFH entry point — routes to the correct view based on the user's role:
 * - Admin department → WFH Requests approval console
 * - Everyone else    → Employee WFH page (request + my requests)
 */
export default function WFHIndexPage() {
  const { user, myEmployee } = useAuth();
  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";
  return isAdminDept ? <WFHRequestsPage /> : <WFHPage />;
}
