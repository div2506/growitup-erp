import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const labelCls = "text-[#B3B3B3] text-sm";
const infoCls = "bg-[#191919] border border-white/10 text-white text-sm rounded-lg px-3 py-2";

function getLevelOptions(currentLevel) {
  const options = {
    "Beginner": ["Beginner", "Intermediate"],
    "Intermediate": ["Intermediate", "Advanced"],
    "Advanced": ["Advanced", "Manager (Growth Expert)"],
    null: ["Beginner", "Intermediate", "Advanced", "Manager (Growth Expert)"],
    "": ["Beginner", "Intermediate", "Advanced", "Manager (Growth Expert)"]
  };
  return options[currentLevel] || options[null];
}

function getExamMonths() {
  const today = new Date();
  const currentDay = today.getDate();
  const monthNames = ["January", "February", "March", "April", "May", "June", 
                      "July", "August", "September", "October", "November", "December"];
  
  let startMonth = today.getMonth();
  let startYear = today.getFullYear();
  
  // If today is after 5th, skip current month
  if (currentDay > 5) {
    startMonth++;
    if (startMonth > 11) {
      startMonth = 0;
      startYear++;
    }
  }
  
  const months = [];
  for (let i = 0; i < 12; i++) {
    const month = (startMonth + i) % 12;
    const year = startYear + Math.floor((startMonth + i) / 12);
    months.push(`${monthNames[month]} ${year}`);
  }
  
  return months;
}

export default function UpgradeLevelModal({ employee, onClose }) {
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const levelOptions = getLevelOptions(employee?.level);
  const monthOptions = getExamMonths();
  const canSubmit = selectedLevel && selectedMonth && !submitting;

  const handleSubmit = async () => {
    if (!selectedLevel || !selectedMonth) {
      toast.error("Please select all required fields");
      return;
    }

    setSubmitting(true);

    const requestData = {
      employee_id: employee.employee_id,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      job_position: employee.job_position_name,
      current_level: employee.level || "No Level",
      requested_level: selectedLevel,
      exam_month: selectedMonth
    };

    try {
      const response = await fetch(`${API}/upgrade-level-request`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(requestData)
      });

      if (response.ok) {
        toast.success("✅ Upgrade request submitted successfully!");
        onClose();
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Submission failed');
      }
    } catch (error) {
      toast.error("❌ Failed to submit request. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-[#2F2F2F] border-white/10 text-white max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <TrendingUp size={20} className="text-green-400" />
            Upgrade Your Level
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Employee Info Section - Read Only */}
          <div className="bg-[#191919] rounded-lg p-4 space-y-3 border border-white/10">
            <p className="text-xs text-[#B3B3B3] uppercase tracking-wider font-medium mb-3">Employee Information</p>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>Name</Label>
                <div className={infoCls}>
                  {employee?.first_name} {employee?.last_name}
                </div>
              </div>
              
              <div className="space-y-1">
                <Label className={labelCls}>Employee ID</Label>
                <div className={infoCls}>
                  {employee?.employee_id}
                </div>
              </div>
              
              <div className="space-y-1">
                <Label className={labelCls}>Job Position</Label>
                <div className={infoCls}>
                  {employee?.job_position_name}
                </div>
              </div>
              
              <div className="space-y-1">
                <Label className={labelCls}>Current Level</Label>
                <div className={infoCls}>
                  {employee?.level || "No Level"}
                </div>
              </div>
            </div>
          </div>

          {/* Form Fields Section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className={labelCls}>Select Level Exam *</Label>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger className="bg-[#191919] border-white/10 text-white focus:ring-white/20 focus:border-white/30">
                  <SelectValue placeholder="Choose exam level" />
                </SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10">
                  {levelOptions.map(level => (
                    <SelectItem 
                      key={level} 
                      value={level}
                      className="text-white hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                    >
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={labelCls}>Select Exam Month *</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="bg-[#191919] border-white/10 text-white focus:ring-white/20 focus:border-white/30">
                  <SelectValue placeholder="Choose exam month" />
                </SelectTrigger>
                <SelectContent className="bg-[#2F2F2F] border-white/10 max-h-[300px]">
                  {monthOptions.map(month => (
                    <SelectItem 
                      key={month} 
                      value={month}
                      className="text-white hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                    >
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="bg-transparent border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`${
                canSubmit 
                  ? "bg-green-500 hover:bg-green-600 text-white" 
                  : "bg-white/5 text-[#B3B3B3] cursor-not-allowed"
              }`}
            >
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
