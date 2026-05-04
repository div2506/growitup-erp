import { useAuth } from "@/contexts/AuthContext";
import OvertimePage from "@/pages/OvertimePage";
import OvertimeRequestsPage from "@/pages/OvertimeRequestsPage";

export default function OvertimeIndexPage() {
  const { user, myEmployee } = useAuth();
  const isAdminDept = user?.is_admin || myEmployee?.department_name === "Admin";
  return isAdminDept ? <OvertimeRequestsPage /> : <OvertimePage />;
}
