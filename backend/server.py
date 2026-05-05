from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import re
import asyncio
import requests as http_requests
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import logging
import json
import calendar as cal_module
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

ADMIN_EMAIL = "info.growitup@gmail.com"
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
ATTENDANCE_API_KEY = os.environ.get('ATTENDANCE_API_KEY', 'att_growitup_key_2026')


class GoogleAuth(BaseModel):
    credential: dict  # userinfo dict from Google (email, name, picture, sub)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory session cache: token → (user_dict, expires_at)
_session_cache: dict = {}
_SESSION_CACHE_TTL = 60  # seconds before re-validating against DB


# ===================== MODELS =====================

class SessionExchange(BaseModel):
    session_id: str  # kept for backward compat (unused)

class DepartmentCreate(BaseModel):
    department_name: str
    is_system: bool = False

class JobPositionCreate(BaseModel):
    position_name: str
    department_id: str
    has_levels: bool = False
    available_levels: List[str] = []
    is_system: bool = False

class EmployeeCreate(BaseModel):
    first_name: str
    last_name: str
    personal_email: str
    phone: str
    date_of_birth: str
    gender: str
    qualification: str
    address: str
    country: str = "India"
    state_id: str
    state_name: str
    city_id: str
    city_name: str
    zipcode: str
    emergency_contact_name: str
    emergency_contact_number: str
    emergency_contact_relation: str
    work_email: str
    department_id: str
    department_name: str
    job_position_id: str
    job_position_name: str
    level: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    reporting_manager_name: Optional[str] = None
    employee_type: str
    joining_date: str
    basic_salary: float
    bank_name: str
    account_name: str
    account_number: str
    ifsc_code: str
    profile_picture: Optional[str] = None
    status: str = "Active"
    teams: List[str] = []
    shift_id: Optional[str] = None  # Shift assignment
    paid_leave_eligible: Optional[bool] = False  # Whether employee receives monthly paid leave
    wfh_eligible: Optional[bool] = False  # Whether employee can request WFH
    biometric_employee_code: Optional[str] = None  # EasyTime Pro / ZKTeco device employee code

class TeamCreate(BaseModel):
    team_name: str
    team_manager_id: Optional[str] = None

class NotionDatabaseCreate(BaseModel):
    database_name: str
    notion_api_token: str
    notion_database_id: str
    database_type: str  # "Video Editing", "Thumbnail", "Script"
    team_id: str
    is_active: bool = True

class ManagerPerformanceCreate(BaseModel):
    manager_id: str
    month: str  # Format: "2026-04-01" (first day of month)
    client_performance_score: float  # 0-100
    client_feedback_score: float  # 0-100
    creative_task_score: float  # 0-100
    report_link: Optional[str] = None  # Optional URL to external report


class ShiftCreate(BaseModel):
    shift_name: str
    start_time: str   # "09:00"
    end_time: str     # "18:00"
    break_duration: int  # minutes: 0, 30, 60, 90, 120
    is_system_default: bool = False


class ShiftChangeRequestCreate(BaseModel):
    requested_shift_id: str
    from_date: str   # "2024-01-15"
    to_date: str     # "2024-01-20"
    reason: str


class ShiftChangeRequestReview(BaseModel):
    status: str  # "Approved" or "Rejected"
    admin_notes: Optional[str] = None


class LeaveRequestCreate(BaseModel):
    from_date: str         # "YYYY-MM-DD"
    to_date: str           # "YYYY-MM-DD"
    leave_type: str        # "Full Day" or "Half Day"
    half_day_type: Optional[str] = None  # "First Half" or "Second Half"
    reason: str


class LeaveRequestReview(BaseModel):
    status: str  # "Approved" or "Rejected"
    admin_notes: Optional[str] = None


class WFHRequestCreate(BaseModel):
    from_date: str   # "YYYY-MM-DD"
    to_date: str     # "YYYY-MM-DD"
    reason: str


class WFHRequestReview(BaseModel):
    status: str  # "Approved" or "Rejected"
    admin_notes: Optional[str] = None
    approved_days: Optional[List[str]] = None  # For partial approval (list of date strings)


class OvertimeRequestCreate(BaseModel):
    date: str           # "YYYY-MM-DD"
    overtime_from: str  # "HH:MM" - must be >= shift end time
    overtime_to: str    # "HH:MM" - must be > overtime_from
    reason: str


class OvertimeRequestReview(BaseModel):
    status: str  # "Approved" or "Rejected"
    admin_notes: Optional[str] = None


class HolidayCreate(BaseModel):
    holiday_name: str
    date: str  # "YYYY-MM-DD"


# ===================== PAYROLL HELPERS =====================

async def calculate_monthly_payroll_fn(employee_id: str, month_str: str) -> dict:
    """
    Calculate full monthly payroll for one employee.
    month_str: "YYYY-MM" or "YYYY-MM-DD" (first day of month).
    Returns complete earnings/deductions/net breakdown.
    """
    month_first = month_str[:7] + "-01"
    try:
        month_dt = datetime.strptime(month_first, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, f"Invalid month: {month_str}")

    year = month_dt.year
    month_num = month_dt.month
    days_in_month = cal_module.monthrange(year, month_num)[1]
    last_day = f"{year}-{month_num:02d}-{days_in_month:02d}"

    # ---------- Employee ----------
    emp = await db.employees.find_one({"employee_id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, f"Employee {employee_id} not found")

    basic_salary = float(emp.get("basic_salary") or 0)
    day_rate = basic_salary / days_in_month if days_in_month else 0

    # ---------- Fetch all data in parallel ----------
    date_filter = {"$gte": month_first, "$lte": last_day}
    (
        ot_records,
        leave_records,
        absent_records,
        late_tracking,
        half_day_records,
        all_att,
    ) = await asyncio.gather(
        db.overtime_requests.find(
            {"employee_id": employee_id, "status": "Approved", "date": date_filter}, {"_id": 0}
        ).to_list(200),
        db.leave_requests.find(
            {"employee_id": employee_id, "status": "Approved",
             "$or": [{"from_date": date_filter}, {"to_date": date_filter}]},
            {"_id": 0}
        ).to_list(200),
        db.daily_attendance.find(
            {"employee_id": employee_id, "status": "Absent", "date": date_filter}, {"_id": 0}
        ).sort("date", 1).to_list(200),
        db.monthly_late_tracking.find_one(
            {"employee_id": employee_id, "month": month_first}, {"_id": 0}
        ),
        db.daily_attendance.find(
            {"employee_id": employee_id, "status": "Half Day", "date": date_filter}, {"_id": 0}
        ).to_list(200),
        db.daily_attendance.find(
            {"employee_id": employee_id, "date": date_filter}, {"_id": 0}
        ).to_list(500),
    )

    # ---------- 1. Overtime ----------
    overtime_pay = round(sum(r.get("overtime_pay", 0) for r in ot_records), 2)
    overtime_hours = round(sum(r.get("total_hours", 0) for r in ot_records), 2)
    gross_earnings = round(basic_salary + overtime_pay, 2)

    # ---------- 2. Regular Leave Deductions ----------
    regular_leave_days = round(sum(r.get("regular_days", 0) for r in leave_records), 2)
    paid_leave_days = round(sum(r.get("paid_days", 0) for r in leave_records), 2)
    regular_leave_deduction = round(day_rate * regular_leave_days, 2)

    # ---------- 3. Unapproved Absence Deductions ----------
    absence_list = []
    total_absence_deduction = 0.0
    for ar in absent_records:
        day_sal = round(day_rate, 2)
        penalty = round(basic_salary * 0.0167, 2)
        total = round(day_sal + penalty, 2)
        total_absence_deduction += total
        absence_list.append({"date": ar["date"], "day_salary": day_sal, "penalty": penalty, "amount": total})
    total_absence_deduction = round(total_absence_deduction, 2)

    # ---------- 4. Late Penalties ----------
    late_count = late_tracking.get("late_count", 0) if late_tracking else 0
    late_penalty_list = []
    total_late_deduction = 0.0
    if late_tracking:
        for p in late_tracking.get("penalties_applied", []):
            ptype = p.get("type", "")
            amount = float(p.get("amount", 0))
            if ptype == "leave_or_salary_deduction":
                total_late_deduction += amount
                late_penalty_list.append({"date": p.get("date", ""), "type": "4th Late Arrival", "description": "1 day salary", "amount": round(amount, 2)})
            elif ptype == "salary_deduction_1_67pct":
                total_late_deduction += amount
                late_penalty_list.append({"date": p.get("date", ""), "type": f"{p.get('late_number', 5)}th+ Late Arrival", "description": "1.67% salary", "amount": round(amount, 2)})
    total_late_deduction = round(total_late_deduction, 2)

    # ---------- 5. Half-Day Deductions ----------
    half_day_count = len(half_day_records)
    half_day_deduction = round(day_rate * 0.5 * half_day_count, 2)

    # ---------- 6. Attendance Summary (already fetched above) ----------

    att_summary = {"present": 0, "half_day": 0, "absent": 0, "leave": 0, "wfh": 0, "holiday": 0, "late_count": 0}
    for a in all_att:
        s = a.get("status", "")
        if s == "Present": att_summary["present"] += 1
        elif s == "Half Day": att_summary["half_day"] += 1
        elif s == "Absent": att_summary["absent"] += 1
        elif s == "Leave": att_summary["leave"] += 1
        elif s == "WFH": att_summary["wfh"] += 1
        elif s == "Holiday": att_summary["holiday"] += 1
        if a.get("is_late"): att_summary["late_count"] += 1

    # ---------- Final ----------
    total_deductions = round(regular_leave_deduction + total_absence_deduction + total_late_deduction + half_day_deduction, 2)
    net_salary = round(gross_earnings - total_deductions, 2)

    return {
        "employee_id": employee_id,
        "employee": {
            "first_name": emp.get("first_name"), "last_name": emp.get("last_name"),
            "profile_picture": emp.get("profile_picture"),
            "department_name": emp.get("department_name"),
            "job_position_name": emp.get("job_position_name"),
            "employee_id": employee_id, "basic_salary": basic_salary
        },
        "month": month_first, "year": year, "days_in_month": days_in_month,
        "earnings": {
            "basic_salary": round(basic_salary, 2),
            "overtime_pay": overtime_pay, "overtime_hours": overtime_hours,
            "overtime_count": len(ot_records), "gross_earnings": gross_earnings
        },
        "deductions": {
            "regular_leave": {"days": regular_leave_days, "amount": regular_leave_deduction},
            "paid_leave": {"days": paid_leave_days, "amount": 0},
            "absences": {"count": len(absent_records), "details": absence_list, "amount": total_absence_deduction},
            "late_penalties": {"late_count": late_count, "penalties": late_penalty_list, "amount": total_late_deduction},
            "half_days": {"count": half_day_count, "amount": half_day_deduction},
            "total_deductions": total_deductions
        },
        "net_salary": net_salary,
        "attendance_summary": att_summary
    }


class AttendanceEntryCreate(BaseModel):
    employee_id: Optional[str] = None          # Direct HRMS employee ID (e.g. GM002)
    biometric_employee_code: Optional[str] = None  # EasyTime Pro / ZKTeco device code (e.g. "12")
    source: Optional[str] = None               # e.g. "easytime_pro", "zkteco"
    timestamp: str                             # ISO format: "2026-04-27T09:15:30"


class DailyAttendanceUpdate(BaseModel):
    status: str  # "Present", "Half Day", "Absent", "Leave", "WFH", "Holiday"
    notes: Optional[str] = None
    check_in: Optional[str] = None   # "HH:MM"
    check_out: Optional[str] = None  # "HH:MM"


# ===================== HELPERS =====================

async def get_current_user(request: Request):
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            session_token = auth[7:]
    if not session_token:
        raise HTTPException(401, "Not authenticated")

    now = datetime.now(timezone.utc)

    # Check in-memory cache first
    cached = _session_cache.get(session_token)
    if cached:
        user, session_expires, cache_ts = cached
        if now.timestamp() - cache_ts < _SESSION_CACHE_TTL:
            if session_expires < now:
                _session_cache.pop(session_token, None)
                raise HTTPException(401, "Session expired")
            return user

    # Cache miss — hit DB (session + user in parallel)
    session_task = db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    session = await session_task
    if not session:
        raise HTTPException(401, "Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        raise HTTPException(401, "Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")

    # Store in cache
    _session_cache[session_token] = (user, expires_at, now.timestamp())
    return user


async def get_next_employee_id():
    """Returns the next available GM### id, filling gaps in the sequence first."""
    # Only fetch employee_id field, use projection — no full doc scan
    employees = await db.employees.find(
        {"employee_id": {"$regex": "^GM"}},
        {"employee_id": 1, "_id": 0}
    ).to_list(None)
    nums = set()
    for emp in employees:
        eid = emp.get("employee_id", "")
        if eid.startswith("GM"):
            try:
                nums.add(int(eid[2:]))
            except Exception:
                pass
    if not nums:
        return "GM001"
    max_num = max(nums)
    for i in range(1, max_num + 1):
        if i not in nums:
            return f"GM{str(i).zfill(3)}"
    return f"GM{str(max_num + 1).zfill(3)}"


def calc_total_hours(start_time: str, end_time: str) -> float:
    """Calculate total hours between start and end time strings (HH:MM)."""
    try:
        sh, sm = map(int, start_time.split(":"))
        eh, em = map(int, end_time.split(":"))
        start_mins = sh * 60 + sm
        end_mins = eh * 60 + em
        if end_mins <= start_mins:  # crosses midnight
            end_mins += 24 * 60
        return round((end_mins - start_mins) / 60, 2)
    except Exception:
        return 0.0


async def get_default_shift():
    """Get the system default shift."""
    return await db.shifts.find_one({"is_system_default": True}, {"_id": 0})


async def ensure_default_shift():
    """Create the default Regular 9-6 shift if it doesn't exist."""
    existing = await db.shifts.find_one({"is_system_default": True}, {"_id": 0})
    if not existing:
        default_shift = {
            "shift_id": f"shift_default",
            "shift_name": "Regular 9-6",
            "start_time": "09:00",
            "end_time": "18:00",
            "break_duration": 60,
            "total_hours": calc_total_hours("09:00", "18:00"),
            "is_system_default": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.shifts.insert_one(default_shift)
        return {k: v for k, v in default_shift.items() if k != "_id"}
    return existing


# ===================== ATTENDANCE HELPERS =====================

def is_1st_or_3rd_saturday(date_obj) -> bool:
    """Check if date is 1st or 3rd Saturday of the month."""
    if date_obj.weekday() != 5:  # Not Saturday
        return False
    day = date_obj.day
    saturday_num = (day - 1) // 7 + 1
    return saturday_num in [1, 3]


def get_shift_timings_for_date(shift: dict, date_obj) -> dict:
    """Get actual shift timings for a date (handles Saturday half-day)."""
    if shift.get("shift_name") == "Regular 9-6" and is_1st_or_3rd_saturday(date_obj):
        return {**shift, "start_time": "08:00", "end_time": "13:00", "total_hours": 5, "break_duration": 0}
    return shift


async def get_active_shift_for_date_async(employee_id: str, date_obj) -> dict:
    """Get the active shift for an employee on a specific date (handles temp shift changes)."""
    date_str = date_obj.strftime("%Y-%m-%d")
    # Check approved temporary shift change for this date
    temp_req = await db.shift_change_requests.find_one({
        "employee_id": employee_id, "status": "Approved",
        "from_date": {"$lte": date_str}, "to_date": {"$gte": date_str}
    }, {"_id": 0})
    if temp_req:
        shift = await db.shifts.find_one({"shift_id": temp_req["requested_shift_id"]}, {"_id": 0})
        if shift:
            return shift
    # Permanent shift assignment
    emp_shift = await db.employee_shifts.find_one({"employee_id": employee_id}, {"_id": 0})
    if emp_shift:
        shift = await db.shifts.find_one({"shift_id": emp_shift["shift_id"]}, {"_id": 0})
        if shift:
            return shift
    return await get_default_shift()


async def upsert_daily_attendance(employee_id: str, date_str: str, data: dict) -> dict:
    """Create or update a daily attendance record (won't override Leave/WFH/Holiday unless explicitly set)."""
    existing = await db.daily_attendance.find_one(
        {"employee_id": employee_id, "date": date_str}, {"_id": 0}
    )
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        # Don't override protected statuses unless explicitly provided in data
        if existing.get("status") in ["Leave", "WFH", "Holiday"] and "status" not in data:
            return existing
        update = {**data, "updated_at": now}
        await db.daily_attendance.update_one(
            {"employee_id": employee_id, "date": date_str}, {"$set": update}
        )
        return {**existing, **update}
    else:
        record = {
            "attendance_id": f"att_{uuid.uuid4().hex[:12]}",
            "employee_id": employee_id, "date": date_str,
            **data, "created_at": now, "updated_at": now
        }
        await db.daily_attendance.insert_one(record)
        return {k: v for k, v in record.items() if k != "_id"}


async def process_daily_attendance_fn(employee_id: str, date_str: str) -> Optional[dict]:
    """Process biometric punches → DailyAttendance record with status + late tracking."""
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        shift = await get_active_shift_for_date_async(employee_id, date_obj)
        if not shift:
            return None
        shift_timings = get_shift_timings_for_date(shift, date_obj)

        # Don't override manually-set Leave/WFH/Holiday
        existing = await db.daily_attendance.find_one(
            {"employee_id": employee_id, "date": date_str}, {"_id": 0}
        )
        if existing and existing.get("status") in ["Leave", "WFH", "Holiday"]:
            return existing

        # Sunday → Holiday
        if date_obj.weekday() == 6:
            return await upsert_daily_attendance(employee_id, date_str, {
                "shift_id": shift["shift_id"], "check_in": None, "check_out": None,
                "total_hours": None, "status": "Holiday", "is_late": False, "late_minutes": 0, "notes": "Sunday"
            })

        # Get raw punches sorted ascending
        punches = await db.attendance_entries.find(
            {"employee_id": employee_id, "punch_date": date_str}, {"_id": 0}
        ).sort("punch_time", 1).to_list(1000)

        if not punches:
            # Check for approved leave request covering this date
            leave_req = await db.leave_requests.find_one({
                "employee_id": employee_id, "status": "Approved",
                "from_date": {"$lte": date_str}, "to_date": {"$gte": date_str}
            }, {"_id": 0})
            if leave_req:
                note = f"Leave ({leave_req.get('leave_type','Full Day')}{' - ' + leave_req['half_day_type'] if leave_req.get('half_day_type') else ''})"
                return await upsert_daily_attendance(employee_id, date_str, {
                    "shift_id": shift["shift_id"], "check_in": None, "check_out": None,
                    "total_hours": None, "status": "Leave",
                    "is_late": False, "late_minutes": 0, "notes": note
                })
            return await upsert_daily_attendance(employee_id, date_str, {
                "shift_id": shift["shift_id"], "check_in": None, "check_out": None,
                "total_hours": 0, "status": "Absent", "is_late": False, "late_minutes": 0, "notes": None
            })

        ci_dt = datetime.fromisoformat(punches[0]["punch_time"])

        # Only 1 punch → check_in recorded, check_out pending
        if len(punches) == 1:
            # Late detection for check_in
            exp_h, exp_m = map(int, shift_timings["start_time"].split(":"))
            exp_start_mins = exp_h * 60 + exp_m
            grace_cutoff = exp_start_mins + 10
            ci_mins = ci_dt.hour * 60 + ci_dt.minute
            is_late = ci_mins > grace_cutoff
            late_minutes = max(0, ci_mins - exp_start_mins) if is_late else 0

            result = await upsert_daily_attendance(employee_id, date_str, {
                "shift_id": shift["shift_id"],
                "check_in": ci_dt.strftime("%H:%M"),
                "check_out": None,
                "total_hours": None, "status": "Incomplete",
                "is_late": is_late, "late_minutes": late_minutes,
                "notes": "Punch-out missing"
            })
            if is_late:
                await update_late_tracking_fn(employee_id, date_str, late_minutes)
            return result

        co_dt = datetime.fromisoformat(punches[-1]["punch_time"])

        # Total hours minus break
        total_minutes = max(0, (co_dt - ci_dt).total_seconds() / 60 - shift_timings.get("break_duration", 0))
        total_hours = round(total_minutes / 60, 2)

        # Late detection: 10-minute grace period
        exp_h, exp_m = map(int, shift_timings["start_time"].split(":"))
        exp_start_mins = exp_h * 60 + exp_m
        grace_cutoff = exp_start_mins + 10
        ci_mins = ci_dt.hour * 60 + ci_dt.minute
        is_late = ci_mins > grace_cutoff
        late_minutes = max(0, ci_mins - exp_start_mins) if is_late else 0

        # Status thresholds (Saturday half-day uses different thresholds)
        if shift_timings.get("total_hours") == 5:
            full_threshold = 4 * 60 + 50  # 4h50m
            half_threshold = 2 * 60 + 30  # 2h30m
        else:
            full_threshold = 8 * 60 + 50  # 8h50m
            half_threshold = 3 * 60 + 50  # 3h50m

        if total_minutes >= full_threshold:
            status = "Present"
        elif total_minutes >= half_threshold:
            status = "Half Day"
        else:
            status = "Absent"

        result = await upsert_daily_attendance(employee_id, date_str, {
            "shift_id": shift["shift_id"],
            "check_in": ci_dt.strftime("%H:%M"),
            "check_out": co_dt.strftime("%H:%M"),
            "total_hours": total_hours, "status": status,
            "is_late": is_late, "late_minutes": late_minutes, "notes": None
        })
        if is_late:
            await update_late_tracking_fn(employee_id, date_str, late_minutes)
        return result
    except Exception as e:
        logger.error(f"[Attendance] Error processing {employee_id} {date_str}: {e}")
        return None


async def update_late_tracking_fn(employee_id: str, date_str: str, late_minutes: int):
    """Update monthly late count and apply penalties."""
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        month_str = date_obj.strftime("%Y-%m-01")
        year = date_obj.year

        tracking = await db.monthly_late_tracking.find_one(
            {"employee_id": employee_id, "month": month_str}, {"_id": 0}
        )
        now = datetime.now(timezone.utc).isoformat()
        if not tracking:
            tracking = {
                "tracking_id": f"lt_{uuid.uuid4().hex[:12]}",
                "employee_id": employee_id, "month": month_str, "year": year,
                "late_count": 0, "penalties_applied": [], "created_at": now, "updated_at": now
            }
            await db.monthly_late_tracking.insert_one(tracking)

        new_count = tracking["late_count"] + 1
        penalties = list(tracking.get("penalties_applied", []))

        if new_count >= 4:
            emp = await db.employees.find_one({"employee_id": employee_id}, {"_id": 0})
            if emp:
                days_in_month = cal_module.monthrange(date_obj.year, date_obj.month)[1]
                if new_count == 4:
                    one_day_salary = round(emp.get("basic_salary", 0) / days_in_month, 2)
                    penalties.append({
                        "date": date_str, "late_number": new_count,
                        "type": "leave_or_salary_deduction", "amount": one_day_salary,
                        "description": f"4th late: 1 paid leave OR {one_day_salary} salary deduction"
                    })
                else:
                    penalty = round(emp.get("basic_salary", 0) * 0.0167, 2)
                    penalties.append({
                        "date": date_str, "late_number": new_count,
                        "type": "salary_deduction_1_67pct", "amount": penalty, "percentage": 1.67,
                        "description": f"{new_count}th late: 1.67% salary deduction = {penalty}"
                    })

        await db.monthly_late_tracking.update_one(
            {"employee_id": employee_id, "month": month_str},
            {"$set": {"late_count": new_count, "penalties_applied": penalties, "updated_at": now}}
        )
    except Exception as e:
        logger.error(f"[Late Tracking] Error for {employee_id}: {e}")


# ===================== LEAVE MANAGEMENT HELPERS =====================

def calc_working_days_between(from_date_str: str, to_date_str: str, exclude_dates: Optional[set] = None) -> int:
    """Count working days (Mon-Sat) between two dates inclusive, excluding Sundays and optionally extra dates."""
    try:
        start = datetime.strptime(from_date_str, "%Y-%m-%d")
        end = datetime.strptime(to_date_str, "%Y-%m-%d")
        days = 0
        current = start
        while current <= end:
            d = current.strftime("%Y-%m-%d")
            if current.weekday() != 6 and (exclude_dates is None or d not in exclude_dates):
                days += 1
            current += timedelta(days=1)
        return days
    except Exception:
        return 0


def calc_leave_deduction(balance: dict, total_days: float) -> dict:
    """Split total_days into paid_days and regular_days based on balance."""
    paid_bal = float(balance.get("paid_leave_balance", 0))
    if paid_bal >= total_days:
        return {"paid_days": total_days, "regular_days": 0.0}
    elif paid_bal > 0:
        return {"paid_days": paid_bal, "regular_days": round(total_days - paid_bal, 2)}
    return {"paid_days": 0.0, "regular_days": total_days}


async def get_or_create_leave_balance(employee_id: str) -> dict:
    """Get or create LeaveBalance record for an employee."""
    bal = await db.leave_balance.find_one({"employee_id": employee_id}, {"_id": 0})
    if not bal:
        now = datetime.now(timezone.utc).isoformat()
        bal = {
            "balance_id": f"lb_{uuid.uuid4().hex[:12]}",
            "employee_id": employee_id, "paid_leave_balance": 0.0,
            "paid_leave_eligible": False, "last_credited_month": None,
            "created_at": now, "updated_at": now
        }
        await db.leave_balance.insert_one(bal)
        return {k: v for k, v in bal.items() if k != "_id"}
    return bal


async def create_leave_txn(employee_id: str, txn_type: str, leave_type: str, amount: float,
                            balance_before: float, balance_after: float, ref_type: str,
                            ref_id: str, date_str: str, notes: str) -> dict:
    """Append a leave transaction to the audit trail."""
    now = datetime.now(timezone.utc).isoformat()
    txn = {
        "transaction_id": f"ltxn_{uuid.uuid4().hex[:10]}",
        "employee_id": employee_id, "transaction_type": txn_type,
        "leave_type": leave_type, "amount": amount,
        "balance_before": balance_before, "balance_after": balance_after,
        "reference_type": ref_type, "reference_id": ref_id,
        "date": date_str, "notes": notes, "created_at": now
    }
    await db.leave_transactions.insert_one(txn)
    return {k: v for k, v in txn.items() if k != "_id"}


async def mark_leave_in_attendance(leave_request: dict):
    """Create/update DailyAttendance records for each working day in a leave request."""
    emp_id = leave_request["employee_id"]
    leave_type = leave_request.get("leave_type", "Full Day")
    half_day_type = leave_request.get("half_day_type") or ""
    note = f"Leave ({leave_type}{' - ' + half_day_type if half_day_type else ''})"
    try:
        start = datetime.strptime(leave_request["from_date"], "%Y-%m-%d")
        end = datetime.strptime(leave_request["to_date"], "%Y-%m-%d")
        current = start
        while current <= end:
            if current.weekday() != 6:  # Skip Sundays
                date_str = current.strftime("%Y-%m-%d")
                shift = await get_active_shift_for_date_async(emp_id, current)
                shift_id = shift["shift_id"] if shift else None
                await upsert_daily_attendance(emp_id, date_str, {
                    "shift_id": shift_id, "status": "Leave",
                    "check_in": None, "check_out": None,
                    "total_hours": None, "is_late": False, "late_minutes": 0, "notes": note
                })
            current += timedelta(days=1)
    except Exception as e:
        logger.error(f"[Leave] Error marking attendance: {e}")


async def notify_leave_submitted(leave_req: dict, employee: dict) -> None:
    """Fire-and-forget Slack ping when a new leave request is submitted.
    Silently no-ops if SLACK_WEBHOOK_URL is unset or Slack is unreachable."""
    slack_url = os.environ.get("SLACK_WEBHOOK_URL", "").strip()
    if not slack_url or slack_url == "YOUR_SLACK_WEBHOOK_URL":
        return
    try:
        emp_name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
        emp_id = employee.get("employee_id", "")
        dept = employee.get("department_name", "")
        lt = leave_req.get("leave_type", "Full Day")
        hdt = leave_req.get("half_day_type")
        date_part = (
            f"{leave_req['from_date']} ({hdt})"
            if lt == "Half Day" and hdt
            else leave_req["from_date"]
            if leave_req["from_date"] == leave_req["to_date"]
            else f"{leave_req['from_date']} – {leave_req['to_date']}"
        )
        total = leave_req.get("total_days", 0)
        paid = leave_req.get("paid_days", 0)
        regular = leave_req.get("regular_days", 0)
        split = []
        if paid > 0:
            split.append(f"{paid} Paid")
        if regular > 0:
            split.append(f"{regular} Regular")
        split_str = f" ({' + '.join(split)})" if split else ""
        reason = (leave_req.get("reason") or "").strip()
        if len(reason) > 200:
            reason = reason[:200] + "…"

        text = (
            f":calendar: *New Leave Request*\n"
            f"*Employee:* {emp_name} ({emp_id}{' · ' + dept if dept else ''})\n"
            f"*Dates:* {date_part} · {total} day{'s' if total != 1 else ''}{split_str}\n"
            f"*Type:* {lt}\n"
            f"*Reason:* {reason}"
        )
        http_requests.post(
            slack_url,
            json={"text": text},
            headers={"Content-Type": "application/json"},
            timeout=5,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[Leave] Slack notification failed (non-blocking): {exc}")


async def notify_wfh_submitted(wfh_req: dict, employee: dict) -> None:
    """Fire-and-forget Slack ping when a new WFH request is submitted.
    Silently no-ops if SLACK_WEBHOOK_URL is unset or Slack is unreachable."""
    slack_url = os.environ.get("SLACK_WEBHOOK_URL", "").strip()
    if not slack_url or slack_url == "YOUR_SLACK_WEBHOOK_URL":
        return
    try:
        emp_name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
        emp_id = employee.get("employee_id", "")
        dept = employee.get("department_name", "")
        from_date = wfh_req.get("from_date", "")
        to_date = wfh_req.get("to_date", "")
        total = wfh_req.get("total_days", 0)
        date_part = (
            from_date
            if from_date == to_date
            else f"{from_date} – {to_date}"
        )
        exceeds = wfh_req.get("exceeds_limit", False)
        reason = (wfh_req.get("reason") or "").strip()
        if len(reason) > 200:
            reason = reason[:200] + "…"

        text = (
            f":house_with_garden: *New WFH Request*\n"
            f"*Employee:* {emp_name} ({emp_id}{' · ' + dept if dept else ''})\n"
            f"*Dates:* {date_part} · {total} day{'s' if total != 1 else ''}"
            + (f" ⚠️ _Exceeds monthly limit_" if exceeds else "") +
            f"\n*Reason:* {reason}"
        )
        http_requests.post(
            slack_url,
            json={"text": text},
            headers={"Content-Type": "application/json"},
            timeout=5,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[WFH] Slack notification failed (non-blocking): {exc}")


# ===================== OVERTIME HELPERS =====================

def get_days_in_month(date_str: str) -> int:
    """Return number of days in the month of the given date."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return cal_module.monthrange(dt.year, dt.month)[1]
    except Exception:
        return 30


def calc_hourly_rate(basic_salary: float, date_str: str) -> float:
    """Hourly rate = basic_salary / days_in_month / 8 working hours."""
    days = get_days_in_month(date_str)
    if days == 0:
        days = 30
    return round(basic_salary / days / 8, 4)


def calc_overtime_hours(from_time: str, to_time: str) -> float:
    """Calculate duration in hours between two HH:MM times. Handles midnight crossover."""
    try:
        fh, fm = map(int, from_time.split(":"))
        th, tm = map(int, to_time.split(":"))
        from_mins = fh * 60 + fm
        to_mins = th * 60 + tm
        if to_mins <= from_mins:          # midnight crossover
            to_mins += 24 * 60
        return round((to_mins - from_mins) / 60, 2)
    except Exception:
        return 0.0


def calc_overtime_pay(total_hours: float, hourly_rate: float) -> float:
    """Overtime pay = total_hours × hourly_rate × 1.25."""
    return round(total_hours * hourly_rate * 1.25, 2)


# ===================== WFH HELPERS =====================

WFH_MONTHLY_LIMIT = 3


async def get_holidays_in_range_db(from_date_str: str, to_date_str: str) -> set:
    """Fetch holiday dates from DB that fall within the given range. Returns a set of date strings."""
    holidays = await db.holidays.find(
        {"date": {"$gte": from_date_str, "$lte": to_date_str}},
        {"_id": 0, "date": 1}
    ).to_list(200)
    return {h["date"] for h in holidays}


async def is_holiday_db(date_str: str) -> Optional[str]:
    """Return holiday name if the date is a company holiday, else None."""
    h = await db.holidays.find_one({"date": date_str}, {"_id": 0, "holiday_name": 1})
    return h["holiday_name"] if h else None


def get_dates_in_range(from_date_str: str, to_date_str: str, exclude_dates: Optional[set] = None) -> List[str]:
    """Return all non-Sunday dates between from_date and to_date inclusive, optionally excluding extra dates."""
    dates = []
    try:
        start = datetime.strptime(from_date_str, "%Y-%m-%d")
        end = datetime.strptime(to_date_str, "%Y-%m-%d")
        current = start
        while current <= end:
            d = current.strftime("%Y-%m-%d")
            if current.weekday() != 6 and (exclude_dates is None or d not in exclude_dates):
                dates.append(d)
            current += timedelta(days=1)
    except Exception:
        pass
    return dates


async def get_wfh_usage_for_month(employee_id: str, month_str: str) -> dict:
    """Get WFH tracking record for employee for a given month (month_str: 'YYYY-MM-01' or 'YYYY-MM-DD')."""
    month_first = month_str[:7] + "-01" if len(month_str) >= 7 else month_str
    try:
        year = int(month_first[:4])
    except Exception:
        year = datetime.now().year
    tracking = await db.wfh_tracking.find_one(
        {"employee_id": employee_id, "month": month_first, "year": year}, {"_id": 0}
    )
    return tracking or {
        "employee_id": employee_id, "month": month_first, "year": year,
        "wfh_days_used": 0, "wfh_dates": []
    }


async def update_wfh_tracking_fn(employee_id: str, dates: List[str]):
    """Add WFH dates to monthly tracking (idempotent per date)."""
    from collections import defaultdict as _dd
    month_map: dict = _dd(list)
    for d in dates:
        try:
            dt = datetime.strptime(d, "%Y-%m-%d")
            if dt.weekday() == 6:
                continue
            month_map[dt.strftime("%Y-%m-01")].append(d)
        except Exception:
            pass
    for month_str, md_list in month_map.items():
        year = int(month_str[:4])
        now_iso = datetime.now(timezone.utc).isoformat()
        existing = await db.wfh_tracking.find_one(
            {"employee_id": employee_id, "month": month_str, "year": year}, {"_id": 0}
        )
        current_set = set(existing.get("wfh_dates", []) if existing else [])
        new_dates = sorted(current_set | set(md_list))
        tid = (existing or {}).get("tracking_id") or f"wt_{uuid.uuid4().hex[:12]}"
        await db.wfh_tracking.update_one(
            {"employee_id": employee_id, "month": month_str, "year": year},
            {"$set": {
                "tracking_id": tid, "employee_id": employee_id,
                "month": month_str, "year": year,
                "wfh_days_used": len(new_dates), "wfh_dates": new_dates,
                "updated_at": now_iso
            }, "$setOnInsert": {"created_at": now_iso}},
            upsert=True
        )


async def remove_wfh_tracking_fn(employee_id: str, dates: List[str]):
    """Remove WFH dates from monthly tracking (called on cancellation)."""
    from collections import defaultdict as _dd
    month_map: dict = _dd(list)
    for d in dates:
        try:
            dt = datetime.strptime(d, "%Y-%m-%d")
            month_map[dt.strftime("%Y-%m-01")].append(d)
        except Exception:
            pass
    for month_str, md_list in month_map.items():
        year = int(month_str[:4])
        existing = await db.wfh_tracking.find_one(
            {"employee_id": employee_id, "month": month_str, "year": year}, {"_id": 0}
        )
        if existing:
            current_set = set(existing.get("wfh_dates", []))
            new_dates = sorted(current_set - set(md_list))
            await db.wfh_tracking.update_one(
                {"employee_id": employee_id, "month": month_str, "year": year},
                {"$set": {
                    "wfh_days_used": len(new_dates), "wfh_dates": new_dates,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )


async def mark_wfh_in_attendance_fn(employee_id: str, dates: List[str]):
    """Upsert daily_attendance records with status='WFH' for given working dates."""
    for date_str in dates:
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
        except Exception:
            continue
        if dt.weekday() == 6:
            continue
        shift = await get_active_shift_for_date_async(employee_id, dt)
        shift_id = shift["shift_id"] if shift else None
        await upsert_daily_attendance(employee_id, date_str, {
            "shift_id": shift_id, "status": "WFH",
            "check_in": None, "check_out": None,
            "total_hours": 8.0, "is_late": False, "late_minutes": 0,
            "notes": "Work From Home"
        })


async def auto_credit_monthly_leave() -> int:
    """Credit 1 paid leave to all eligible employees for the current month (idempotent)."""
    current_month = datetime.now(timezone.utc).strftime("%Y-%m-01")
    eligible = await db.leave_balance.find({"paid_leave_eligible": True}, {"_id": 0}).to_list(1000)
    count = 0
    for bal in eligible:
        if bal.get("last_credited_month") == current_month:
            continue
        bal_before = float(bal.get("paid_leave_balance", 0))
        bal_after = bal_before + 1.0
        now = datetime.now(timezone.utc).isoformat()
        await db.leave_balance.update_one(
            {"employee_id": bal["employee_id"]},
            {"$set": {"paid_leave_balance": bal_after, "last_credited_month": current_month, "updated_at": now}}
        )
        await create_leave_txn(
            employee_id=bal["employee_id"], txn_type="Credit", leave_type="Paid",
            amount=1.0, balance_before=bal_before, balance_after=bal_after,
            ref_type="Monthly Credit", ref_id=current_month,
            date_str=current_month, notes="Monthly paid leave credit"
        )
        count += 1
    return count


# ===================== AUTH ROUTES =====================

@api_router.post("/auth/google")
async def google_login(body: GoogleAuth, response: Response):
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    info = body.credential  # userinfo dict sent from frontend after access_token exchange

    email = info.get("email", "")
    name = info.get("name", "")
    picture = info.get("picture", "")

    if not email:
        raise HTTPException(400, "No email returned from Google")

    is_admin = (email.lower() == ADMIN_EMAIL.lower())
    if not is_admin:
        employee = await db.employees.find_one(
            {"work_email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0}
        )
        if not employee:
            raise HTTPException(403, "You are not registered in the system. Please contact your HR department to get access.")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture, "is_admin": is_admin}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name,
            "picture": picture, "is_admin": is_admin,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    session_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    # Allow multiple concurrent sessions (one per device) — do NOT delete existing sessions.
    # Previously delete_many wiped all sessions on every login, causing other devices to go 401.
    # Clean up only expired sessions for this user to keep the DB tidy.
    await db.user_sessions.delete_many({
        "user_id": user_id,
        "expires_at": {"$lt": datetime.now(timezone.utc).isoformat()}
    })
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", path="/", max_age=2592000  # 30 days
    )

    return {"user": {
        "user_id": user_id, "email": email, "name": name,
        "picture": picture, "is_admin": is_admin
    }, "session_token": session_token}


@api_router.get("/auth/me")
async def get_me(request: Request):
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            session_token = auth[7:]
    if not session_token:
        return None

    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        return None

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    return user or None


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
        _session_cache.pop(session_token, None)
    response.delete_cookie(key="session_token", path="/", samesite="none", secure=True)
    return {"message": "Logged out"}


# ===================== DEPARTMENT ROUTES =====================

@api_router.get("/departments")
async def get_departments(request: Request):
    await get_current_user(request)
    depts = await db.departments.find({}, {"_id": 0}).sort("department_name", 1).to_list(1000)
    return depts


@api_router.post("/departments")
async def create_department(body: DepartmentCreate, request: Request):
    await get_current_user(request)
    existing = await db.departments.find_one(
        {"department_name": {"$regex": f"^{body.department_name}$", "$options": "i"}}, {"_id": 0}
    )
    if existing:
        raise HTTPException(400, "Department already exists")
    dept = {
        "department_id": f"dept_{uuid.uuid4().hex[:8]}",
        "department_name": body.department_name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.departments.insert_one(dept)
    return {k: v for k, v in dept.items() if k != "_id"}


@api_router.put("/departments/{dept_id}")
async def update_department(dept_id: str, body: DepartmentCreate, request: Request):
    await get_current_user(request)
    existing = await db.departments.find_one({"department_id": dept_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Department not found")
    if existing.get("is_system") and body.department_name.strip().lower() != existing["department_name"].strip().lower():
        raise HTTPException(400, "Cannot rename a system department")
    await db.departments.update_one({"department_id": dept_id}, {"$set": {"department_name": body.department_name}})
    await db.employees.update_many({"department_id": dept_id}, {"$set": {"department_name": body.department_name}})
    await db.job_positions.update_many({"department_id": dept_id}, {"$set": {"department_name": body.department_name}})
    return {**existing, "department_name": body.department_name}


@api_router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, request: Request):
    await get_current_user(request)
    existing = await db.departments.find_one({"department_id": dept_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Department not found")
    if existing.get("is_system"):
        raise HTTPException(400, "Cannot delete a system department")
    emp_count = await db.employees.count_documents({"department_id": dept_id})
    if emp_count > 0:
        raise HTTPException(400, f"Cannot delete: {emp_count} employee(s) belong to this department")
    await db.departments.delete_one({"department_id": dept_id})
    await db.job_positions.delete_many({"department_id": dept_id})
    return {"message": "Deleted"}


# ===================== JOB POSITION ROUTES =====================

@api_router.get("/job-positions")
async def get_job_positions(request: Request, department_id: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if department_id:
        query["department_id"] = department_id
    positions = await db.job_positions.find(query, {"_id": 0}).sort("position_name", 1).to_list(1000)
    return positions


@api_router.post("/job-positions")
async def create_job_position(body: JobPositionCreate, request: Request):
    await get_current_user(request)
    dept = await db.departments.find_one({"department_id": body.department_id}, {"_id": 0})
    if not dept:
        raise HTTPException(404, "Department not found")
    pos = {
        "position_id": f"pos_{uuid.uuid4().hex[:8]}",
        "position_name": body.position_name,
        "department_id": body.department_id,
        "department_name": dept["department_name"],
        "has_levels": body.has_levels,
        "available_levels": body.available_levels if body.has_levels else [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.job_positions.insert_one(pos)
    return {k: v for k, v in pos.items() if k != "_id"}


@api_router.put("/job-positions/{pos_id}")
async def update_job_position(pos_id: str, body: JobPositionCreate, request: Request):
    await get_current_user(request)
    existing = await db.job_positions.find_one({"position_id": pos_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Job position not found")
    if existing.get("is_system") and body.position_name.strip().lower() != existing["position_name"].strip().lower():
        raise HTTPException(400, "Cannot rename a system job position")
    dept = await db.departments.find_one({"department_id": body.department_id}, {"_id": 0})
    dept_name = dept["department_name"] if dept else existing["department_name"]
    update = {
        "position_name": body.position_name,
        "department_id": body.department_id,
        "department_name": dept_name,
        "has_levels": body.has_levels,
        "available_levels": body.available_levels if body.has_levels else []
    }
    await db.job_positions.update_one({"position_id": pos_id}, {"$set": update})
    return {**existing, **update}


@api_router.delete("/job-positions/{pos_id}")
async def delete_job_position(pos_id: str, request: Request):
    await get_current_user(request)
    existing = await db.job_positions.find_one({"position_id": pos_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Job position not found")
    if existing.get("is_system"):
        raise HTTPException(400, "Cannot delete a system job position")
    emp_count = await db.employees.count_documents({"job_position_id": pos_id})
    if emp_count > 0:
        raise HTTPException(400, f"Cannot delete: {emp_count} employee(s) have this position")
    await db.job_positions.delete_one({"position_id": pos_id})
    return {"message": "Deleted"}


# ===================== STATES & CITIES ROUTES =====================

@api_router.get("/states")
async def get_states(request: Request):
    await get_current_user(request)
    states = await db.states.find({}, {"_id": 0}).sort("state_name", 1).to_list(100)
    return states


@api_router.get("/cities")
async def get_cities(request: Request, state_id: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if state_id:
        query["state_id"] = state_id
    cities = await db.cities.find(query, {"_id": 0}).sort("city_name", 1).to_list(1000)
    return cities


# ===================== EMPLOYEE ROUTES =====================

@api_router.get("/employees")
async def get_employees(request: Request, search: Optional[str] = None, status: Optional[str] = None, team_id: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status and status != "All":
        query["status"] = status
    if team_id:
        query["teams"] = team_id
    employees = await db.employees.find(query, {"_id": 0}).to_list(10000)
    if search:
        sl = search.lower()
        employees = [e for e in employees if
            sl in e.get("first_name", "").lower() or
            sl in e.get("last_name", "").lower() or
            sl in (e.get("first_name", "") + " " + e.get("last_name", "")).lower() or
            sl in e.get("work_email", "").lower() or
            sl in e.get("employee_id", "").lower() or
            sl in e.get("department_name", "").lower() or
            sl in e.get("job_position_name", "").lower()
        ]
    # Sort by employee_id ascending (numeric portion of GM###) so GM001, GM002, GM003... order is stable
    def _emp_sort_key(e):
        eid = e.get("employee_id", "") or ""
        if eid.startswith("GM"):
            try:
                return (0, int(eid[2:]))
            except Exception:
                pass
        return (1, eid)
    employees.sort(key=_emp_sort_key)
    return employees


@api_router.get("/employees/{emp_id}")
async def get_employee(emp_id: str, request: Request):
    await get_current_user(request)
    emp = await db.employees.find_one({"employee_id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    return emp


@api_router.post("/employees")
async def create_employee(body: EmployeeCreate, request: Request):
    await get_current_user(request)
    existing = await db.employees.find_one(
        {"work_email": {"$regex": f"^{body.work_email}$", "$options": "i"}}, {"_id": 0}
    )
    if existing:
        raise HTTPException(400, "Work email already exists")

    # Biometric code uniqueness check
    if body.biometric_employee_code:
        bio_dup = await db.employees.find_one(
            {"biometric_employee_code": body.biometric_employee_code}, {"_id": 0, "employee_id": 1}
        )
        if bio_dup:
            raise HTTPException(400, f"Biometric code '{body.biometric_employee_code}' is already assigned to {bio_dup['employee_id']}")

    emp_id = await get_next_employee_id()
    now = datetime.now(timezone.utc).isoformat()
    emp_data = body.model_dump()
    shift_id = emp_data.pop("shift_id", None)
    paid_leave_eligible = emp_data.pop("paid_leave_eligible", False) or False
    emp = {"employee_id": emp_id, **emp_data, "created_at": now, "updated_at": now}
    await db.employees.insert_one(emp)

    # Assign shift (use provided or default)
    if not shift_id:
        default_shift = await get_default_shift()
        shift_id = default_shift["shift_id"] if default_shift else None
    if shift_id:
        await db.employee_shifts.update_one(
            {"employee_id": emp_id},
            {"$set": {"employee_id": emp_id, "shift_id": shift_id, "assigned_at": now, "assigned_by": None}},
            upsert=True
        )

    # Create LeaveBalance record
    await db.leave_balance.update_one(
        {"employee_id": emp_id},
        {"$set": {
            "balance_id": f"lb_{uuid.uuid4().hex[:10]}",
            "employee_id": emp_id, "paid_leave_balance": 0.0,
            "paid_leave_eligible": paid_leave_eligible,
            "last_credited_month": None, "created_at": now, "updated_at": now
        }}, upsert=True
    )

    return {k: v for k, v in emp.items() if k != "_id"}


@api_router.put("/employees/{emp_id}")
async def update_employee(emp_id: str, body: EmployeeCreate, request: Request):
    user = await get_current_user(request)
    existing = await db.employees.find_one({"employee_id": emp_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Employee not found")
    dup = await db.employees.find_one({
        "work_email": {"$regex": f"^{body.work_email}$", "$options": "i"},
        "employee_id": {"$ne": emp_id}
    }, {"_id": 0})
    if dup:
        raise HTTPException(400, "Work email already in use by another employee")

    # Biometric code uniqueness check
    if body.biometric_employee_code:
        bio_dup = await db.employees.find_one({
            "biometric_employee_code": body.biometric_employee_code,
            "employee_id": {"$ne": emp_id}
        }, {"_id": 0, "employee_id": 1})
        if bio_dup:
            raise HTTPException(400, f"Biometric code '{body.biometric_employee_code}' is already assigned to {bio_dup['employee_id']}")

    old_email = existing.get("work_email", "")
    new_email = body.work_email
    email_changed = old_email.lower() != new_email.lower()

    emp_data = body.model_dump()
    shift_id = emp_data.pop("shift_id", None)
    paid_leave_eligible = emp_data.pop("paid_leave_eligible", None)
    update = {**emp_data, "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.employees.update_one({"employee_id": emp_id}, {"$set": update})

    # Update shift assignment if shift_id provided
    if shift_id:
        requesting_emp = await db.employees.find_one(
            {"work_email": {"$regex": f"^{user.get('email', '')}$", "$options": "i"}}, {"_id": 0}
        )
        assigned_by_id = requesting_emp["employee_id"] if requesting_emp else None
        await db.employee_shifts.update_one(
            {"employee_id": emp_id},
            {"$set": {"employee_id": emp_id, "shift_id": shift_id,
                      "assigned_at": datetime.now(timezone.utc).isoformat(), "assigned_by": assigned_by_id}},
            upsert=True
        )

    # Update leave balance eligibility if explicitly changed
    if paid_leave_eligible is not None:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.leave_balance.update_one(
            {"employee_id": emp_id},
            {
                "$set": {"paid_leave_eligible": paid_leave_eligible, "updated_at": now_iso},
                "$setOnInsert": {
                    "balance_id": f"lb_{uuid.uuid4().hex[:10]}",
                    "employee_id": emp_id,
                    "paid_leave_balance": 0.0,
                    "last_credited_month": None,
                    "created_at": now_iso,
                },
            },
            upsert=True
        )

    # If work_email changed: invalidate all sessions for the old email and update the user record
    if email_changed and old_email:
        old_user = await db.users.find_one(
            {"email": {"$regex": f"^{old_email}$", "$options": "i"}}, {"_id": 0}
        )
        if old_user:
            await db.user_sessions.delete_many({"user_id": old_user["user_id"]})
            await db.users.update_one(
                {"user_id": old_user["user_id"]},
                {"$set": {"email": new_email}}
            )
            logger.info(f"[EMAIL CHANGE] Invalidated sessions for '{old_email}', updated user to '{new_email}'")

    return {**existing, **update}


@api_router.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str, request: Request):
    await get_current_user(request)
    emp = await db.employees.find_one({"employee_id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    await db.employees.delete_one({"employee_id": emp_id})
    return {"message": "Deleted"}


class SelfEditBody(BaseModel):
    profile_picture: Optional[str] = None
    address: Optional[str] = None
    zipcode: Optional[str] = None
    state_name: Optional[str] = None
    city_name: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None


@api_router.patch("/employees/{emp_id}/self")
async def self_update_employee(emp_id: str, body: SelfEditBody, request: Request):
    user = await get_current_user(request)
    existing = await db.employees.find_one({"employee_id": emp_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Employee not found")
    if existing.get("work_email", "").lower() != user.get("email", "").lower():
        raise HTTPException(403, "You can only edit your own profile")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.employees.update_one({"employee_id": emp_id}, {"$set": update})
    return {**existing, **update}


# ===================== ME / CURRENT EMPLOYEE =====================

@api_router.get("/me/employee")
async def get_my_employee(request: Request):
    user = await get_current_user(request)
    email = user.get("email", "")
    emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0}
    )
    return emp or {}


# ===================== TEAM ROUTES =====================

@api_router.get("/teams")
async def get_teams(request: Request):
    await get_current_user(request)
    teams = await db.teams.find({}, {"_id": 0}).sort("team_name", 1).to_list(1000)
    for team in teams:
        team["member_count"] = await db.employees.count_documents({"teams": team["team_id"]})
        if team.get("team_manager_id"):
            mgr = await db.employees.find_one(
                {"employee_id": team["team_manager_id"]}, {"_id": 0, "profile_picture": 1}
            )
            team["team_manager_picture"] = mgr.get("profile_picture") if mgr else None
        else:
            team["team_manager_picture"] = None
    return teams


@api_router.post("/teams")
async def create_team(body: TeamCreate, request: Request):
    await get_current_user(request)
    existing = await db.teams.find_one(
        {"team_name": {"$regex": f"^{re.escape(body.team_name)}$", "$options": "i"}}, {"_id": 0}
    )
    if existing:
        raise HTTPException(400, "Team name already exists")
    manager_name = None
    if body.team_manager_id:
        mgr = await db.employees.find_one({"employee_id": body.team_manager_id}, {"_id": 0})
        if mgr:
            manager_name = f"{mgr['first_name']} {mgr['last_name']}"
    team = {
        "team_id": f"team_{uuid.uuid4().hex[:8]}",
        "team_name": body.team_name,
        "team_manager_id": body.team_manager_id,
        "team_manager_name": manager_name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.teams.insert_one(team)
    return {k: v for k, v in team.items() if k != "_id"}


@api_router.put("/teams/{team_id}")
async def update_team(team_id: str, body: TeamCreate, request: Request):
    await get_current_user(request)
    existing = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Team not found")
    manager_name = None
    if body.team_manager_id:
        mgr = await db.employees.find_one({"employee_id": body.team_manager_id}, {"_id": 0})
        if mgr:
            manager_name = f"{mgr['first_name']} {mgr['last_name']}"
    update = {
        "team_name": body.team_name,
        "team_manager_id": body.team_manager_id,
        "team_manager_name": manager_name
    }
    await db.teams.update_one({"team_id": team_id}, {"$set": update})
    return {**existing, **update}


@api_router.delete("/teams/{team_id}")
async def delete_team(team_id: str, request: Request):
    await get_current_user(request)
    existing = await db.teams.find_one({"team_id": team_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Team not found")
    await db.teams.delete_one({"team_id": team_id})
    return {"message": "Deleted"}


# ===================== NOTION DATABASE ROUTES =====================

@api_router.get("/notion-databases")
async def get_notion_databases(request: Request):
    await get_current_user(request)
    dbs = await db.notion_databases.find({}, {"_id": 0}).sort("database_name", 1).to_list(1000)
    return dbs


@api_router.post("/notion-databases")
async def create_notion_database(body: NotionDatabaseCreate, request: Request):
    await get_current_user(request)
    team = await db.teams.find_one({"team_id": body.team_id}, {"_id": 0})
    ndb = {
        "db_id": f"ndb_{uuid.uuid4().hex[:8]}",
        "database_name": body.database_name,
        "notion_api_token": body.notion_api_token,
        "notion_database_id": body.notion_database_id,
        "database_type": body.database_type,
        "team_id": body.team_id,
        "team_name": team["team_name"] if team else "",
        "is_active": body.is_active,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notion_databases.insert_one(ndb)
    return {k: v for k, v in ndb.items() if k != "_id"}


@api_router.put("/notion-databases/{db_id}")
async def update_notion_database(db_id: str, body: NotionDatabaseCreate, request: Request):
    await get_current_user(request)
    existing = await db.notion_databases.find_one({"db_id": db_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Notion database not found")
    team = await db.teams.find_one({"team_id": body.team_id}, {"_id": 0})
    update = {
        "database_name": body.database_name,
        "notion_api_token": body.notion_api_token,
        "notion_database_id": body.notion_database_id,
        "database_type": body.database_type,
        "team_id": body.team_id,
        "team_name": team["team_name"] if team else "",
        "is_active": body.is_active
    }
    await db.notion_databases.update_one({"db_id": db_id}, {"$set": update})
    return {**existing, **update}


@api_router.delete("/notion-databases/{db_id}")
async def delete_notion_database(db_id: str, request: Request):
    await get_current_user(request)
    existing = await db.notion_databases.find_one({"db_id": db_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Notion database not found")
    await db.notion_databases.delete_one({"db_id": db_id})
    return {"message": "Deleted"}


# ===================== PERFORMANCE HELPERS =====================

# Valid statuses (same as VALID_STATUSES in the appscript)
VALID_STATUSES = {"Review", "Approved", "Changes", "Final Review"}
# Statuses where manager rating fields may be written
RATING_STATUSES = {"Approved", "Changes", "Final Review"}


def get_star_count(prop_value: dict) -> Optional[int]:
    """Exact mirror of getStarRatingNumber_() from the appscript."""
    if not prop_value:
        return None
    select_obj = prop_value.get("select")
    if not select_obj or not select_obj.get("name"):
        return None
    value = select_obj["name"].strip()

    # 1. Count actual star Unicode chars (excluding variation selectors \uFE0F)
    actual_stars = re.findall(r'[\u2B50\u2606\u2605]', value)
    if actual_stars:
        return len(actual_stars)

    # 2. Fallback: extract a plain number from the string
    num_match = re.search(r'(\d+)', value)
    if num_match:
        return int(num_match.group(1))

    # 3. Last resort: count non-space non-variation-selector characters (1–5)
    clean = re.sub(r'[\s\uFE0F]', '', value)
    if 1 <= len(clean) <= 5:
        return len(clean)

    return None


def get_deadline_status(due_date_str: Optional[str], moved_to_review_str: Optional[str]) -> str:
    if not due_date_str or not moved_to_review_str:
        return "No Date"
    try:
        due_dt = datetime.fromisoformat(due_date_str.replace('Z', '+00:00'))
        review_dt = datetime.fromisoformat(moved_to_review_str.replace('Z', '+00:00'))
        if due_dt.tzinfo is None:
            due_dt = due_dt.replace(tzinfo=timezone.utc)
        if review_dt.tzinfo is None:
            review_dt = review_dt.replace(tzinfo=timezone.utc)
        if review_dt >= due_dt:
            diff_minutes = (review_dt - due_dt).total_seconds() / 60
            hours = int(diff_minutes // 60)
            mins = int(diff_minutes % 60)
            return f"Missed Deadline ({hours}h {mins}min)"
        else:
            return "On Time"
    except Exception:
        return "No Date"


def compute_performance_score(
    database_type: str,
    intro_rating: Optional[int],
    overall_rating: Optional[int],
    thumbnail_rating: Optional[int],
    script_rating: Optional[int],
    deadline_status: str,
    changes_count: Optional[int]
) -> Optional[float]:
    if deadline_status == "No Date":
        return None

    if database_type == "Video Editing":
        if any(v is None for v in [intro_rating, overall_rating, changes_count]):
            return None
        quality = intro_rating + overall_rating
        if quality >= 10: video_pts = 4
        elif quality >= 8: video_pts = 3
        elif quality >= 6: video_pts = 2
        elif quality >= 4: video_pts = 1
        else: video_pts = 0

        if "On Time" in deadline_status:
            dl_pts = 3
        elif "Missed" in deadline_status:
            hm = re.search(r'(\d+)h', deadline_status)
            mm = re.search(r'(\d+)min', deadline_status)
            total_mins = (int(hm.group(1)) if hm else 0) * 60 + (int(mm.group(1)) if mm else 0)
            if total_mins < 30: dl_pts = 2
            elif total_mins <= 60: dl_pts = 1
            else: dl_pts = 0
        else:
            return None

        if changes_count == 0: change_pts = 3
        elif changes_count <= 5: change_pts = 2
        elif changes_count <= 10: change_pts = 1
        else: change_pts = 0

        return float(video_pts + dl_pts + change_pts)

    elif database_type in ("Thumbnail", "Script"):
        rating = thumbnail_rating if database_type == "Thumbnail" else script_rating
        if rating is None:
            return None
        rating_pts = {5: 6, 4: 4, 3: 3, 2: 1, 1: 0}.get(int(rating), 0)

        if "On Time" in deadline_status:
            dl_pts = 4
        elif "Missed" in deadline_status:
            hm = re.search(r'(\d+)h', deadline_status)
            mm = re.search(r'(\d+)min', deadline_status)
            total_mins = (int(hm.group(1)) if hm else 0) * 60 + (int(mm.group(1)) if mm else 0)
            if total_mins < 30: dl_pts = 3
            elif total_mins <= 60: dl_pts = 2
            elif total_mins <= 120: dl_pts = 1
            else: dl_pts = 0
        else:
            return None

        return float(rating_pts + dl_pts)

    return None


# ===================== WEBHOOK ROUTES =====================

@api_router.post("/webhooks/notion/debug-capture")
async def notion_webhook_debug(request: Request):
    """Captures raw payload for debugging - no auth required"""
    try:
        payload = await request.json()
    except Exception as e:
        payload = {"error": str(e)}
    doc = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }
    await db.webhook_debug.insert_one(doc)
    logger.info(f"[WEBHOOK DEBUG] Payload keys: {list(payload.keys()) if isinstance(payload, dict) else type(payload).__name__}")
    if isinstance(payload, dict):
        data = payload.get("data", payload)
        if isinstance(data, dict):
            props = data.get("properties", {})
            logger.info(f"[WEBHOOK DEBUG] Page object: id={data.get('id')}, props_count={len(props)}, prop_names={list(props.keys())[:15]}")
    return {"message": "Debug payload captured", "keys": list(payload.keys()) if isinstance(payload, dict) else []}


@api_router.get("/webhooks/notion/debug-last")
async def get_last_debug_payload(request: Request):
    """Returns last 3 captured debug payloads"""
    await get_current_user(request)
    docs = await db.webhook_debug.find({}, {"_id": 0}).sort("received_at", -1).limit(3).to_list(3)
    return docs


@api_router.post("/webhooks/notion/{notion_database_id}")
async def notion_webhook(notion_database_id: str, request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"message": "Invalid JSON payload"}

    logger.info(f"[WEBHOOK] db_id={notion_database_id}, top_keys={list(payload.keys()) if isinstance(payload, dict) else 'not-dict'}")

    # Extract page object from webhook payload (get page_id at minimum)
    page_stub = payload.get("data", payload)
    if not isinstance(page_stub, dict) or page_stub.get("object") != "page":
        for v in payload.values():
            if isinstance(v, dict) and v.get("object") == "page":
                page_stub = v
                break

    if not isinstance(page_stub, dict) or not page_stub.get("id"):
        logger.info(f"[WEBHOOK] No valid page for db {notion_database_id}. Payload: {str(payload)[:500]}")
        return {"message": "No page data found"}

    notion_db = await db.notion_databases.find_one(
        {"notion_database_id": notion_database_id, "is_active": True}, {"_id": 0}
    )
    if not notion_db:
        return {"message": "Database not configured or inactive"}

    page_id_raw = page_stub.get("id", "")  # UUID with dashes
    api_token = notion_db.get("notion_api_token", "")

    # Notion webhook payloads often have empty properties — fetch full page from Notion API
    try:
        notion_resp = http_requests.get(
            f"https://api.notion.com/v1/pages/{page_id_raw}",
            headers={"Authorization": f"Bearer {api_token}", "Notion-Version": "2022-06-28"},
            timeout=10
        )
        if notion_resp.status_code == 200:
            page = notion_resp.json()
            logger.info(f"[WEBHOOK] Fetched full page from Notion API, props_count={len(page.get('properties', {}))}")
        else:
            logger.warning(f"[WEBHOOK] Notion API returned {notion_resp.status_code}, falling back to payload")
            page = page_stub
    except Exception as e:
        logger.warning(f"[WEBHOOK] Failed to fetch from Notion API: {e}, falling back to payload")
        page = page_stub

    properties = page.get("properties", {})
    page_id = page_id_raw.replace("-", "")
    page_url = page.get("url", page_stub.get("url", ""))

    logger.info(f"[WEBHOOK] page_id={page_id}, properties_count={len(properties)}, property_names={list(properties.keys())[:15]}")

    # Store debug snapshot
    await db.webhook_debug.insert_one({
        "received_at": datetime.now(timezone.utc).isoformat(),
        "notion_database_id": notion_database_id,
        "page_id": page_id,
        "payload_keys": list(payload.keys()),
        "page_keys": list(page.keys()),
        "property_names": list(properties.keys()),
    })

    # ── 1. STATUS FILTER ──────────────────────────────────────────
    # Only process pages in the 4 valid statuses (same as appscript VALID_STATUSES)
    page_status = ""
    for pname, prop in properties.items():
        if pname == "Status" and prop.get("type") == "status":
            page_status = (prop.get("status") or {}).get("name", "")
            break
    if page_status not in VALID_STATUSES:
        logger.info(f"[WEBHOOK] Skipping page {page_id}: status='{page_status}' not in valid statuses")
        return {"message": f"Skipped: status '{page_status}' not in {sorted(VALID_STATUSES)}"}

    # ── TITLE ─────────────────────────────────────────────────────
    title = ""
    for prop in properties.values():
        if prop.get("type") == "title":
            title = " ".join(t.get("plain_text", "") for t in prop.get("title", []))
            break

    # ── MULTIPLE ASSIGNEES ────────────────────────────────────────
    # Support both "Assignee" and "Assigned To" (case-insensitive, exact match like appscript)
    assignees = []
    for pname, prop in properties.items():
        if prop.get("type") == "people" and pname in ("Assignee", "Assigned To"):
            assignees = prop.get("people", [])
            break

    # ── 7. SKIP IF NO ASSIGNEE ────────────────────────────────────
    if not assignees:
        logger.info(f"[WEBHOOK] Skipping page {page_id}: no assignee")
        return {"message": "Skipped: no assignee"}

    # ── DUE DATE (with fallback) ──────────────────────────────────
    # Support "Due date" AND "Due Date" (exact appscript PROP_DUE_1 / PROP_DUE_2)
    due_date = None
    for pname, prop in properties.items():
        if prop.get("type") == "date" and pname in ("Due date", "Due Date"):
            d = prop.get("date")
            if d:
                due_date = d.get("start")
            break

    # ── MOVED TO REVIEW ───────────────────────────────────────────
    moved_to_review = None
    for pname, prop in properties.items():
        if prop.get("type") == "date" and pname == "Moved To Review":
            d = prop.get("date")
            if d:
                moved_to_review = d.get("start")
            break

    # ── RATINGS & CHANGES ─────────────────────────────────────────
    # Extracted from Notion; will only be written when status is in RATING_STATUSES
    intro_rating = None
    overall_rating = None
    thumbnail_rating = None
    script_rating = None
    changes_count = None
    video_length = None

    for pname, prop in properties.items():
        if pname == "Intro / Hook Rating" and prop.get("type") == "select":
            intro_rating = get_star_count(prop)
        elif pname == "Overall Editing Quality Rating" and prop.get("type") == "select":
            overall_rating = get_star_count(prop)
        elif "Thumbnail" in pname and "Rating" in pname and prop.get("type") == "select":
            thumbnail_rating = get_star_count(prop)
        elif "Script" in pname and "Rating" in pname and prop.get("type") == "select":
            script_rating = get_star_count(prop)
        elif pname == "Changes (No.)" and prop.get("type") == "number":
            changes_count = prop.get("number")
        elif pname == "Video Length" and prop.get("type") == "number":
            video_length = prop.get("number")

    # Task type (multi_select) — extracted exactly as getMultiSelectNames_() in the appscript
    task_type = ""
    for pname, prop in properties.items():
        if pname == "Task type" and prop.get("type") == "multi_select":
            task_type = ", ".join(i.get("name", "") for i in prop.get("multi_select", []))
            break

    database_type = notion_db.get("database_type", "Video Editing")
    team_id = notion_db.get("team_id", "")
    deadline_status = get_deadline_status(due_date, moved_to_review)

    # ── 4. RATINGS ONLY WRITTEN FOR APPROVED / CHANGES / FINAL REVIEW ──
    write_ratings = page_status in RATING_STATUSES

    # Pre-load all employees for name matching
    all_emps = await db.employees.find(
        {}, {"_id": 0, "employee_id": 1, "first_name": 1, "last_name": 1}
    ).to_list(5000)

    now = datetime.now(timezone.utc).isoformat()
    processed = []

    # ── 3. PROCESS EACH ASSIGNEE SEPARATELY ──────────────────────
    for person in assignees:
        assignee_name = (person.get("name") or "").strip()
        if not assignee_name:
            continue

        # ── 8. SKIP IF NO MATCHING EMPLOYEE ─────────────────────
        employee_id = None
        for emp in all_emps:
            full_name = f"{emp['first_name']} {emp['last_name']}".lower()
            if full_name == assignee_name.lower() or emp["first_name"].lower() == assignee_name.lower():
                employee_id = emp["employee_id"]
                break
        if not employee_id:
            logger.info(f"[WEBHOOK] Skipping assignee '{assignee_name}': no matching employee")
            continue

        # Composite unique key: page_id + employee_id  (one record per page per person)
        perf_id = f"{page_id}_{employee_id}"

        # Find existing record — support both new perf_id and legacy page_id-only records
        existing = await db.performance_data.find_one(
            {"$or": [{"perf_id": perf_id}, {"page_id": page_id, "employee_id": employee_id}]},
            {"_id": 0}
        )

        if existing:
            # ── MANAGER RATING PROTECTION (if updating) ─────────
            # Always recalculate score using best available data
            eff_intro = existing.get("intro_rating")
            eff_overall = existing.get("overall_rating")
            eff_thumbnail = existing.get("thumbnail_rating")
            eff_script = existing.get("script_rating")
            eff_changes = existing.get("changes_count")

            # "Always update" fields
            update: dict = {
                "perf_id": perf_id,
                "assignee_name": assignee_name,
                "employee_id": employee_id,
                "team_id": team_id,
                "database_type": database_type,
                "status": page_status,
                "video_length": video_length,
                "updated_at": now,
            }

            # title, page_url, task_type — set on INSERT only, never overwrite

            # "Fill once if empty, never overwrite" — due_date / moved_to_review / deadline_status
            eff_due_date = existing.get("due_date")
            eff_moved_to_review = existing.get("moved_to_review")
            eff_deadline_status = existing.get("deadline_status")

            if eff_due_date is None and due_date is not None:
                update["due_date"] = due_date
                eff_due_date = due_date
            if eff_moved_to_review is None and moved_to_review is not None:
                update["moved_to_review"] = moved_to_review
                eff_moved_to_review = moved_to_review
            if eff_deadline_status is None and deadline_status is not None:
                update["deadline_status"] = deadline_status
                eff_deadline_status = deadline_status

            # Only fill rating fields when status allows AND field is currently empty
            if write_ratings:
                if eff_intro is None and intro_rating is not None:
                    update["intro_rating"] = intro_rating
                    eff_intro = intro_rating
                if eff_overall is None and overall_rating is not None:
                    update["overall_rating"] = overall_rating
                    eff_overall = overall_rating
                if eff_thumbnail is None and thumbnail_rating is not None:
                    update["thumbnail_rating"] = thumbnail_rating
                    eff_thumbnail = thumbnail_rating
                if eff_script is None and script_rating is not None:
                    update["script_rating"] = script_rating
                    eff_script = script_rating
                if eff_changes is None and changes_count is not None:
                    update["changes_count"] = changes_count
                    eff_changes = changes_count

            # Always recalculate performance_score with effective values
            update["performance_score"] = compute_performance_score(
                database_type, eff_intro, eff_overall, eff_thumbnail, eff_script,
                eff_deadline_status, eff_changes
            )

            await db.performance_data.update_one(
                {"$or": [{"perf_id": perf_id}, {"page_id": page_id, "employee_id": employee_id}]},
                {"$set": update}
            )
            processed.append({"assignee": assignee_name, "employee_id": employee_id,
                               "action": "updated", "score": update["performance_score"]})
        else:
            # New record — only store rating fields if status allows
            r_intro = intro_rating if write_ratings else None
            r_overall = overall_rating if write_ratings else None
            r_thumbnail = thumbnail_rating if write_ratings else None
            r_script = script_rating if write_ratings else None
            r_changes = changes_count if write_ratings else None

            perf_score = compute_performance_score(
                database_type, r_intro, r_overall, r_thumbnail, r_script, deadline_status, r_changes
            )
            doc = {
                "perf_id": perf_id, "page_id": page_id, "title": title, "page_url": page_url,
                "assignee_name": assignee_name, "employee_id": employee_id,
                "team_id": team_id, "database_type": database_type, "task_type": task_type,
                "due_date": due_date, "moved_to_review": moved_to_review, "status": page_status,
                "deadline_status": deadline_status, "performance_score": perf_score,
                "intro_rating": r_intro, "overall_rating": r_overall,
                "thumbnail_rating": r_thumbnail, "script_rating": r_script,
                "changes_count": r_changes, "video_length": video_length,
                "created_at": now, "updated_at": now,
            }
            await db.performance_data.insert_one(doc)
            processed.append({"assignee": assignee_name, "employee_id": employee_id,
                               "action": "inserted", "score": perf_score})

    if not processed:
        return {"message": "No matching employees found for any assignee", "page_id": page_id}

    return {
        "message": "Processed",
        "page_id": page_id,
        "status": page_status,
        "processed_count": len(processed),
        "entries": processed,
    }


# ===================== PERFORMANCE ROUTES =====================

@api_router.get("/performance")
async def get_performance(
    request: Request,
    team_id: Optional[str] = None,
    employee_id: Optional[str] = None
):
    await get_current_user(request)
    query = {}
    if team_id:
        query["team_id"] = team_id
    if employee_id:
        query["employee_id"] = employee_id
    data = await db.performance_data.find(query, {"_id": 0}).sort("due_date", -1).to_list(10000)
    return data


class PerformanceEdit(BaseModel):
    intro_rating: Optional[int] = None
    overall_rating: Optional[int] = None
    changes_count: Optional[int] = None
    video_length: Optional[float] = None
    thumbnail_rating: Optional[int] = None
    script_rating: Optional[int] = None


@api_router.put("/performance/{perf_id}")
async def update_performance(perf_id: str, body: PerformanceEdit, request: Request):
    await get_current_user(request)
    query = {"$or": [{"perf_id": perf_id}, {"page_id": perf_id}]}
    existing = await db.performance_data.find_one(query, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Performance record not found")

    update: dict = {}
    if body.intro_rating is not None:
        update["intro_rating"] = body.intro_rating
    if body.overall_rating is not None:
        update["overall_rating"] = body.overall_rating
    if body.changes_count is not None:
        update["changes_count"] = body.changes_count
    if body.video_length is not None:
        update["video_length"] = body.video_length
    if body.thumbnail_rating is not None:
        update["thumbnail_rating"] = body.thumbnail_rating
    if body.script_rating is not None:
        update["script_rating"] = body.script_rating

    merged = {**existing, **update}
    update["performance_score"] = compute_performance_score(
        merged.get("database_type"),
        merged.get("intro_rating"),
        merged.get("overall_rating"),
        merged.get("thumbnail_rating"),
        merged.get("script_rating"),
        merged.get("deadline_status"),
        merged.get("changes_count"),
    )
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.performance_data.update_one(query, {"$set": update})
    return {**existing, **update}


@api_router.delete("/performance/{perf_id}")
async def delete_performance(perf_id: str, request: Request):
    await get_current_user(request)
    result = await db.performance_data.delete_one(
        {"$or": [{"perf_id": perf_id}, {"page_id": perf_id}]}
    )
    if result.deleted_count == 0:
        raise HTTPException(404, "Performance record not found")
    return {"message": "Deleted"}


# ===================== SEED V2 =====================

@api_router.post("/seed-v2")
async def seed_v2():
    """Idempotent: add is_system flags + Human Resource dept"""
    now = datetime.now(timezone.utc).isoformat()
    system_dept_ids = ["dept_operations", "dept_sales", "dept_admin"]
    for dept_id in system_dept_ids:
        await db.departments.update_one(
            {"department_id": dept_id}, {"$set": {"is_system": True}}
        )
    hr_dept = await db.departments.find_one({"department_id": "dept_hr"})
    if not hr_dept:
        await db.departments.insert_one({
            "department_id": "dept_hr", "department_name": "Human Resource",
            "is_system": True, "created_at": now
        })
    system_pos_ids = [
        "pos_video_editor", "pos_thumbnail_designer", "pos_script_writer", "pos_manager",
        "pos_sales_rep", "pos_sales_manager", "pos_director", "pos_hr_manager"
    ]
    for pos_id in system_pos_ids:
        await db.job_positions.update_one(
            {"position_id": pos_id}, {"$set": {"is_system": True}}
        )
    hr_positions = [
        {"position_id": "pos_hr_executive", "position_name": "HR Executive",
         "department_id": "dept_hr", "department_name": "Human Resource",
         "has_levels": False, "available_levels": [], "is_system": True, "created_at": now},
    ]
    for pos in hr_positions:
        if not await db.job_positions.find_one({"position_id": pos["position_id"]}):
            await db.job_positions.insert_one(pos)
    # Remove the duplicate HR Manager from HR dept if it exists
    await db.job_positions.delete_one({"position_id": "pos_hr_manager_hr"})
    # Ensure default shift exists
    await ensure_default_shift()
    # Ensure LeaveBalance exists for all existing employees
    all_emps = await db.employees.find({}, {"employee_id": 1, "_id": 0}).to_list(10000)
    for emp in all_emps:
        eid = emp["employee_id"]
        existing_bal = await db.leave_balance.find_one({"employee_id": eid}, {"_id": 0})
        if not existing_bal:
            now = datetime.now(timezone.utc).isoformat()
            await db.leave_balance.insert_one({
                "balance_id": f"lb_{uuid.uuid4().hex[:10]}",
                "employee_id": eid, "paid_leave_balance": 0.0,
                "paid_leave_eligible": False, "last_credited_month": None,
                "created_at": now, "updated_at": now
            })

    # Seed 2026 Indian public holidays (idempotent by date)
    holidays_2026 = [
        {"holiday_name": "Republic Day",      "date": "2026-01-26"},
        {"holiday_name": "Holi",              "date": "2026-03-25"},
        {"holiday_name": "Good Friday",       "date": "2026-04-03"},
        {"holiday_name": "Eid al-Fitr",       "date": "2026-04-11"},
        {"holiday_name": "Independence Day",  "date": "2026-08-15"},
        {"holiday_name": "Gandhi Jayanti",    "date": "2026-10-02"},
        {"holiday_name": "Dussehra",          "date": "2026-10-22"},
        {"holiday_name": "Diwali",            "date": "2026-11-11"},
        {"holiday_name": "Christmas",         "date": "2026-12-25"},
    ]
    for h in holidays_2026:
        if not await db.holidays.find_one({"date": h["date"]}):
            now_ts = datetime.now(timezone.utc).isoformat()
            await db.holidays.insert_one({
                "holiday_id": f"hol_{uuid.uuid4().hex[:10]}",
                "holiday_name": h["holiday_name"],
                "date": h["date"],
                "created_by": None,
                "created_at": now_ts,
                "updated_at": now_ts
            })

    return {"message": "Seeded v2 successfully"}


# ===================== SEED ROUTE =====================

@api_router.post("/seed")
async def seed_data():
    count = await db.departments.count_documents({})
    if count > 0:
        return {"message": "Already seeded"}

    now = datetime.now(timezone.utc).isoformat()

    depts = [
        {"department_id": "dept_operations", "department_name": "Operations", "is_system": True, "created_at": now},
        {"department_id": "dept_sales", "department_name": "Sales", "is_system": True, "created_at": now},
        {"department_id": "dept_admin", "department_name": "Admin", "is_system": True, "created_at": now},
        {"department_id": "dept_hr", "department_name": "Human Resource", "is_system": True, "created_at": now},
    ]
    await db.departments.insert_many(depts)

    positions = [
        {"position_id": "pos_video_editor", "position_name": "Video Editor", "department_id": "dept_operations", "department_name": "Operations", "has_levels": True, "available_levels": ["Beginner", "Intermediate", "Advanced"], "is_system": True, "created_at": now},
        {"position_id": "pos_thumbnail_designer", "position_name": "Thumbnail Designer", "department_id": "dept_operations", "department_name": "Operations", "has_levels": True, "available_levels": ["Beginner", "Intermediate", "Advanced"], "is_system": True, "created_at": now},
        {"position_id": "pos_script_writer", "position_name": "Script Writer", "department_id": "dept_operations", "department_name": "Operations", "has_levels": False, "available_levels": [], "is_system": True, "created_at": now},
        {"position_id": "pos_manager", "position_name": "Manager", "department_id": "dept_operations", "department_name": "Operations", "has_levels": False, "available_levels": [], "is_system": True, "created_at": now},
        {"position_id": "pos_sales_rep", "position_name": "Sales Representative", "department_id": "dept_sales", "department_name": "Sales", "has_levels": False, "available_levels": [], "is_system": True, "created_at": now},
        {"position_id": "pos_sales_manager", "position_name": "Sales Manager", "department_id": "dept_sales", "department_name": "Sales", "has_levels": False, "available_levels": [], "is_system": True, "created_at": now},
        {"position_id": "pos_director", "position_name": "Director/CEO/COO", "department_id": "dept_admin", "department_name": "Admin", "has_levels": False, "available_levels": [], "is_system": True, "created_at": now},
        {"position_id": "pos_hr_manager", "position_name": "HR Manager", "department_id": "dept_admin", "department_name": "Admin", "has_levels": False, "available_levels": [], "is_system": True, "created_at": now},
        {"position_id": "pos_hr_executive", "position_name": "HR Executive", "department_id": "dept_hr", "department_name": "Human Resource", "has_levels": False, "available_levels": [], "is_system": True, "created_at": now},
        {"position_id": "pos_hr_manager_hr", "position_name": "HR Manager", "department_id": "dept_hr", "department_name": "Human Resource", "has_levels": False, "available_levels": [], "is_system": True, "created_at": now},
    ]
    await db.job_positions.insert_many(positions)

    states = [
        {"state_id": "state_001", "state_name": "Andhra Pradesh"},
        {"state_id": "state_002", "state_name": "Arunachal Pradesh"},
        {"state_id": "state_003", "state_name": "Assam"},
        {"state_id": "state_004", "state_name": "Bihar"},
        {"state_id": "state_005", "state_name": "Chhattisgarh"},
        {"state_id": "state_006", "state_name": "Goa"},
        {"state_id": "state_007", "state_name": "Gujarat"},
        {"state_id": "state_008", "state_name": "Haryana"},
        {"state_id": "state_009", "state_name": "Himachal Pradesh"},
        {"state_id": "state_010", "state_name": "Jharkhand"},
        {"state_id": "state_011", "state_name": "Karnataka"},
        {"state_id": "state_012", "state_name": "Kerala"},
        {"state_id": "state_013", "state_name": "Madhya Pradesh"},
        {"state_id": "state_014", "state_name": "Maharashtra"},
        {"state_id": "state_015", "state_name": "Manipur"},
        {"state_id": "state_016", "state_name": "Meghalaya"},
        {"state_id": "state_017", "state_name": "Mizoram"},
        {"state_id": "state_018", "state_name": "Nagaland"},
        {"state_id": "state_019", "state_name": "Odisha"},
        {"state_id": "state_020", "state_name": "Punjab"},
        {"state_id": "state_021", "state_name": "Rajasthan"},
        {"state_id": "state_022", "state_name": "Sikkim"},
        {"state_id": "state_023", "state_name": "Tamil Nadu"},
        {"state_id": "state_024", "state_name": "Telangana"},
        {"state_id": "state_025", "state_name": "Tripura"},
        {"state_id": "state_026", "state_name": "Uttar Pradesh"},
        {"state_id": "state_027", "state_name": "Uttarakhand"},
        {"state_id": "state_028", "state_name": "West Bengal"},
        {"state_id": "state_029", "state_name": "Andaman and Nicobar Islands"},
        {"state_id": "state_030", "state_name": "Chandigarh"},
        {"state_id": "state_031", "state_name": "Delhi"},
        {"state_id": "state_032", "state_name": "Dadra and Nagar Haveli and Daman and Diu"},
        {"state_id": "state_033", "state_name": "Jammu and Kashmir"},
        {"state_id": "state_034", "state_name": "Ladakh"},
        {"state_id": "state_035", "state_name": "Lakshadweep"},
        {"state_id": "state_036", "state_name": "Puducherry"},
    ]
    await db.states.insert_many(states)

    cities = [
        # Andhra Pradesh
        {"city_id": "city_ap_001", "city_name": "Visakhapatnam", "state_id": "state_001"},
        {"city_id": "city_ap_002", "city_name": "Vijayawada", "state_id": "state_001"},
        {"city_id": "city_ap_003", "city_name": "Guntur", "state_id": "state_001"},
        {"city_id": "city_ap_004", "city_name": "Nellore", "state_id": "state_001"},
        {"city_id": "city_ap_005", "city_name": "Kurnool", "state_id": "state_001"},
        {"city_id": "city_ap_006", "city_name": "Tirupati", "state_id": "state_001"},
        # Arunachal Pradesh
        {"city_id": "city_ar_001", "city_name": "Itanagar", "state_id": "state_002"},
        # Assam
        {"city_id": "city_as_001", "city_name": "Guwahati", "state_id": "state_003"},
        {"city_id": "city_as_002", "city_name": "Silchar", "state_id": "state_003"},
        {"city_id": "city_as_003", "city_name": "Dibrugarh", "state_id": "state_003"},
        {"city_id": "city_as_004", "city_name": "Jorhat", "state_id": "state_003"},
        # Bihar
        {"city_id": "city_br_001", "city_name": "Patna", "state_id": "state_004"},
        {"city_id": "city_br_002", "city_name": "Gaya", "state_id": "state_004"},
        {"city_id": "city_br_003", "city_name": "Muzaffarpur", "state_id": "state_004"},
        {"city_id": "city_br_004", "city_name": "Bhagalpur", "state_id": "state_004"},
        # Chhattisgarh
        {"city_id": "city_cg_001", "city_name": "Raipur", "state_id": "state_005"},
        {"city_id": "city_cg_002", "city_name": "Bhilai", "state_id": "state_005"},
        {"city_id": "city_cg_003", "city_name": "Bilaspur", "state_id": "state_005"},
        # Goa
        {"city_id": "city_ga_001", "city_name": "Panaji", "state_id": "state_006"},
        {"city_id": "city_ga_002", "city_name": "Margao", "state_id": "state_006"},
        {"city_id": "city_ga_003", "city_name": "Vasco da Gama", "state_id": "state_006"},
        # Gujarat
        {"city_id": "city_gj_001", "city_name": "Ahmedabad", "state_id": "state_007"},
        {"city_id": "city_gj_002", "city_name": "Surat", "state_id": "state_007"},
        {"city_id": "city_gj_003", "city_name": "Vadodara", "state_id": "state_007"},
        {"city_id": "city_gj_004", "city_name": "Rajkot", "state_id": "state_007"},
        {"city_id": "city_gj_005", "city_name": "Bhavnagar", "state_id": "state_007"},
        {"city_id": "city_gj_006", "city_name": "Jamnagar", "state_id": "state_007"},
        {"city_id": "city_gj_007", "city_name": "Gandhinagar", "state_id": "state_007"},
        # Haryana
        {"city_id": "city_hr_001", "city_name": "Gurgaon", "state_id": "state_008"},
        {"city_id": "city_hr_002", "city_name": "Faridabad", "state_id": "state_008"},
        {"city_id": "city_hr_003", "city_name": "Ambala", "state_id": "state_008"},
        {"city_id": "city_hr_004", "city_name": "Hisar", "state_id": "state_008"},
        {"city_id": "city_hr_005", "city_name": "Rohtak", "state_id": "state_008"},
        # Himachal Pradesh
        {"city_id": "city_hp_001", "city_name": "Shimla", "state_id": "state_009"},
        {"city_id": "city_hp_002", "city_name": "Manali", "state_id": "state_009"},
        {"city_id": "city_hp_003", "city_name": "Dharamsala", "state_id": "state_009"},
        # Jharkhand
        {"city_id": "city_jh_001", "city_name": "Ranchi", "state_id": "state_010"},
        {"city_id": "city_jh_002", "city_name": "Jamshedpur", "state_id": "state_010"},
        {"city_id": "city_jh_003", "city_name": "Dhanbad", "state_id": "state_010"},
        # Karnataka
        {"city_id": "city_ka_001", "city_name": "Bengaluru", "state_id": "state_011"},
        {"city_id": "city_ka_002", "city_name": "Mysuru", "state_id": "state_011"},
        {"city_id": "city_ka_003", "city_name": "Hubballi", "state_id": "state_011"},
        {"city_id": "city_ka_004", "city_name": "Mangaluru", "state_id": "state_011"},
        {"city_id": "city_ka_005", "city_name": "Belagavi", "state_id": "state_011"},
        # Kerala
        {"city_id": "city_kl_001", "city_name": "Thiruvananthapuram", "state_id": "state_012"},
        {"city_id": "city_kl_002", "city_name": "Kochi", "state_id": "state_012"},
        {"city_id": "city_kl_003", "city_name": "Kozhikode", "state_id": "state_012"},
        {"city_id": "city_kl_004", "city_name": "Thrissur", "state_id": "state_012"},
        # Madhya Pradesh
        {"city_id": "city_mp_001", "city_name": "Bhopal", "state_id": "state_013"},
        {"city_id": "city_mp_002", "city_name": "Indore", "state_id": "state_013"},
        {"city_id": "city_mp_003", "city_name": "Jabalpur", "state_id": "state_013"},
        {"city_id": "city_mp_004", "city_name": "Gwalior", "state_id": "state_013"},
        # Maharashtra
        {"city_id": "city_mh_001", "city_name": "Mumbai", "state_id": "state_014"},
        {"city_id": "city_mh_002", "city_name": "Pune", "state_id": "state_014"},
        {"city_id": "city_mh_003", "city_name": "Nagpur", "state_id": "state_014"},
        {"city_id": "city_mh_004", "city_name": "Thane", "state_id": "state_014"},
        {"city_id": "city_mh_005", "city_name": "Nashik", "state_id": "state_014"},
        {"city_id": "city_mh_006", "city_name": "Aurangabad", "state_id": "state_014"},
        {"city_id": "city_mh_007", "city_name": "Navi Mumbai", "state_id": "state_014"},
        # Manipur
        {"city_id": "city_mn_001", "city_name": "Imphal", "state_id": "state_015"},
        # Meghalaya
        {"city_id": "city_ml_001", "city_name": "Shillong", "state_id": "state_016"},
        # Mizoram
        {"city_id": "city_mz_001", "city_name": "Aizawl", "state_id": "state_017"},
        # Nagaland
        {"city_id": "city_nl_001", "city_name": "Kohima", "state_id": "state_018"},
        {"city_id": "city_nl_002", "city_name": "Dimapur", "state_id": "state_018"},
        # Odisha
        {"city_id": "city_od_001", "city_name": "Bhubaneswar", "state_id": "state_019"},
        {"city_id": "city_od_002", "city_name": "Cuttack", "state_id": "state_019"},
        {"city_id": "city_od_003", "city_name": "Rourkela", "state_id": "state_019"},
        # Punjab
        {"city_id": "city_pb_001", "city_name": "Ludhiana", "state_id": "state_020"},
        {"city_id": "city_pb_002", "city_name": "Amritsar", "state_id": "state_020"},
        {"city_id": "city_pb_003", "city_name": "Jalandhar", "state_id": "state_020"},
        {"city_id": "city_pb_004", "city_name": "Patiala", "state_id": "state_020"},
        # Rajasthan
        {"city_id": "city_rj_001", "city_name": "Jaipur", "state_id": "state_021"},
        {"city_id": "city_rj_002", "city_name": "Jodhpur", "state_id": "state_021"},
        {"city_id": "city_rj_003", "city_name": "Udaipur", "state_id": "state_021"},
        {"city_id": "city_rj_004", "city_name": "Kota", "state_id": "state_021"},
        {"city_id": "city_rj_005", "city_name": "Bikaner", "state_id": "state_021"},
        # Sikkim
        {"city_id": "city_sk_001", "city_name": "Gangtok", "state_id": "state_022"},
        # Tamil Nadu
        {"city_id": "city_tn_001", "city_name": "Chennai", "state_id": "state_023"},
        {"city_id": "city_tn_002", "city_name": "Coimbatore", "state_id": "state_023"},
        {"city_id": "city_tn_003", "city_name": "Madurai", "state_id": "state_023"},
        {"city_id": "city_tn_004", "city_name": "Tiruchirappalli", "state_id": "state_023"},
        {"city_id": "city_tn_005", "city_name": "Salem", "state_id": "state_023"},
        {"city_id": "city_tn_006", "city_name": "Vellore", "state_id": "state_023"},
        # Telangana
        {"city_id": "city_tg_001", "city_name": "Hyderabad", "state_id": "state_024"},
        {"city_id": "city_tg_002", "city_name": "Warangal", "state_id": "state_024"},
        {"city_id": "city_tg_003", "city_name": "Nizamabad", "state_id": "state_024"},
        {"city_id": "city_tg_004", "city_name": "Karimnagar", "state_id": "state_024"},
        # Tripura
        {"city_id": "city_tr_001", "city_name": "Agartala", "state_id": "state_025"},
        # Uttar Pradesh
        {"city_id": "city_up_001", "city_name": "Lucknow", "state_id": "state_026"},
        {"city_id": "city_up_002", "city_name": "Kanpur", "state_id": "state_026"},
        {"city_id": "city_up_003", "city_name": "Agra", "state_id": "state_026"},
        {"city_id": "city_up_004", "city_name": "Varanasi", "state_id": "state_026"},
        {"city_id": "city_up_005", "city_name": "Prayagraj", "state_id": "state_026"},
        {"city_id": "city_up_006", "city_name": "Meerut", "state_id": "state_026"},
        {"city_id": "city_up_007", "city_name": "Noida", "state_id": "state_026"},
        # Uttarakhand
        {"city_id": "city_uk_001", "city_name": "Dehradun", "state_id": "state_027"},
        {"city_id": "city_uk_002", "city_name": "Haridwar", "state_id": "state_027"},
        {"city_id": "city_uk_003", "city_name": "Rishikesh", "state_id": "state_027"},
        # West Bengal
        {"city_id": "city_wb_001", "city_name": "Kolkata", "state_id": "state_028"},
        {"city_id": "city_wb_002", "city_name": "Howrah", "state_id": "state_028"},
        {"city_id": "city_wb_003", "city_name": "Asansol", "state_id": "state_028"},
        {"city_id": "city_wb_004", "city_name": "Siliguri", "state_id": "state_028"},
        # Andaman and Nicobar
        {"city_id": "city_an_001", "city_name": "Port Blair", "state_id": "state_029"},
        # Chandigarh
        {"city_id": "city_ch_001", "city_name": "Chandigarh", "state_id": "state_030"},
        # Delhi
        {"city_id": "city_dl_001", "city_name": "New Delhi", "state_id": "state_031"},
        {"city_id": "city_dl_002", "city_name": "Dwarka", "state_id": "state_031"},
        {"city_id": "city_dl_003", "city_name": "Rohini", "state_id": "state_031"},
        {"city_id": "city_dl_004", "city_name": "Saket", "state_id": "state_031"},
        # Dadra and Nagar Haveli
        {"city_id": "city_dd_001", "city_name": "Silvassa", "state_id": "state_032"},
        {"city_id": "city_dd_002", "city_name": "Daman", "state_id": "state_032"},
        # Jammu and Kashmir
        {"city_id": "city_jk_001", "city_name": "Srinagar", "state_id": "state_033"},
        {"city_id": "city_jk_002", "city_name": "Jammu", "state_id": "state_033"},
        # Ladakh
        {"city_id": "city_la_001", "city_name": "Leh", "state_id": "state_034"},
        {"city_id": "city_la_002", "city_name": "Kargil", "state_id": "state_034"},
        # Lakshadweep
        {"city_id": "city_ld_001", "city_name": "Kavaratti", "state_id": "state_035"},
        # Puducherry
        {"city_id": "city_py_001", "city_name": "Puducherry", "state_id": "state_036"},
    ]
    await db.cities.insert_many(cities)

    admin_emp = {
        "employee_id": "GM001",
        "first_name": "Admin",
        "last_name": "GrowItUp",
        "personal_email": "info.growitup@gmail.com",
        "phone": "9999999999",
        "date_of_birth": "1990-01-01",
        "gender": "Other",
        "qualification": "MBA",
        "address": "GrowItUp Headquarters",
        "country": "India",
        "state_id": "state_014",
        "state_name": "Maharashtra",
        "city_id": "city_mh_001",
        "city_name": "Mumbai",
        "zipcode": "400001",
        "emergency_contact_name": "Admin",
        "emergency_contact_number": "9999999999",
        "emergency_contact_relation": "Self",
        "work_email": "info.growitup@gmail.com",
        "department_id": "dept_admin",
        "department_name": "Admin",
        "job_position_id": "pos_director",
        "job_position_name": "Director/CEO/COO",
        "level": None,
        "reporting_manager_id": None,
        "reporting_manager_name": None,
        "employee_type": "Full-time",
        "joining_date": "2020-01-01",
        "basic_salary": 0,
        "bank_name": "N/A",
        "account_name": "N/A",
        "account_number": "0",
        "ifsc_code": "N/A",
        "profile_picture": None,
        "status": "Active",
        "created_at": now,
        "updated_at": now
    }
    await db.employees.insert_one(admin_emp)

    return {"message": "Seeded successfully"}


# ===================== HEALTH =====================

@api_router.get("/")
async def root():
    return {"message": "GrowItUp Employee Management API"}


# ===================== DATA IMPORT =====================

VALID_DATABASE_TYPES = {"Video Editing", "Thumbnail", "Script"}
ISO_DATE_RE = re.compile(
    r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
)

REQUIRED_FIELDS_BASE = [
    "page_id", "title", "page_url", "assignee_name", "employee_id",
    "team_id", "database_type", "task_type", "due_date", "moved_to_review",
    "status", "deadline_status", "performance_score", "created_at", "updated_at"
]

DB_TYPE_REQUIRED = {
    "Video Editing": ["intro_rating", "overall_rating", "changes_count"],
    "Thumbnail": ["thumbnail_rating"],
    "Script": ["script_rating"],
}


def validate_iso_date(value: str) -> bool:
    """Accept ISO 8601 strings like 2026-01-02T13:00:00.000+05:30"""
    if not isinstance(value, str):
        return False
    return bool(ISO_DATE_RE.match(value))


@api_router.post("/import/performance")
async def import_performance_data(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)

    # Access control: only Admin department employees can import
    email = user.get("email", "")
    emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}, {"_id": 0}
    )
    # Allow admin system user or Admin dept employees
    is_system_admin = email.lower() == ADMIN_EMAIL.lower()
    is_admin_dept = emp and emp.get("department_name", "").strip().lower() == "admin"
    if not is_system_admin and not is_admin_dept:
        raise HTTPException(403, "Only Admin department employees can import data")

    # Read and parse file
    content = await file.read()
    try:
        records = json.loads(content)
    except Exception:
        raise HTTPException(400, "Invalid file format. Please upload a valid JSON file.")

    if not isinstance(records, list):
        raise HTTPException(400, "Invalid file format. Please upload a valid JSON file.")

    if len(records) == 0:
        raise HTTPException(400, "JSON array is empty. Nothing to import.")

    # Pre-load valid employee_ids and team_ids
    all_emp_ids = set(
        e["employee_id"] for e in
        await db.employees.find({}, {"_id": 0, "employee_id": 1}).to_list(10000)
    )
    all_team_ids = set(
        t["team_id"] for t in
        await db.teams.find({}, {"_id": 0, "team_id": 1}).to_list(10000)
    )

    # Validate all records first (fail entirely on first error)
    for idx, doc in enumerate(records):
        if not isinstance(doc, dict):
            raise HTTPException(400, f"Document at index {idx} is not an object.")

        # Check base required fields
        for field in REQUIRED_FIELDS_BASE:
            if field not in doc or doc[field] is None:
                raise HTTPException(400, f"Document at index {idx} is missing required field: {field}")

        # Validate database_type
        db_type = doc.get("database_type", "")
        if db_type not in VALID_DATABASE_TYPES:
            raise HTTPException(400, "Database type must be 'Video Editing', 'Thumbnail', or 'Script'")

        # Validate database-type specific fields
        for field in DB_TYPE_REQUIRED.get(db_type, []):
            if field not in doc or doc[field] is None:
                raise HTTPException(400, f"Document at index {idx} is missing required field: {field}")

        # Validate employee_id
        emp_id_val = doc.get("employee_id", "")
        if emp_id_val not in all_emp_ids:
            raise HTTPException(400, f"Employee ID {emp_id_val} not found in system")

        # Validate team_id
        team_id_val = doc.get("team_id", "")
        if team_id_val not in all_team_ids:
            raise HTTPException(400, f"Team ID {team_id_val} not found in system")

        # Validate date fields (strict ISO 8601 with timezone)
        for date_field in ["due_date", "moved_to_review", "created_at", "updated_at"]:
            val = doc.get(date_field)
            if val is not None and not validate_iso_date(str(val)):
                raise HTTPException(400, f"Invalid date format for {date_field} at document index {idx}")

        # Validate performance_score is a number 0-10
        score = doc.get("performance_score")
        if score is not None:
            try:
                score_f = float(score)
                if not (0 <= score_f <= 10):
                    raise HTTPException(400, f"performance_score at index {idx} must be between 0 and 10")
            except (TypeError, ValueError):
                raise HTTPException(400, f"performance_score at index {idx} must be a number")

    # Collect existing page_ids (normalize: strip dashes to match webhook-generated IDs)
    existing_docs = await db.performance_data.find({}, {"_id": 0, "page_id": 1}).to_list(100000)
    existing_page_ids = set()
    for d in existing_docs:
        pid = d.get("page_id", "")
        if pid:
            existing_page_ids.add(pid)
            existing_page_ids.add(pid.replace("-", ""))

    # Separate new vs duplicate records
    to_insert = []
    skipped = 0

    for doc in records:
        raw_pid = str(doc.get("page_id", ""))
        norm_pid = raw_pid.replace("-", "")

        if raw_pid in existing_page_ids or norm_pid in existing_page_ids:
            skipped += 1
            continue

        # Build insert document
        insert_doc = {
            "page_id": raw_pid,
            "title": doc.get("title"),
            "page_url": doc.get("page_url"),
            "assignee_name": doc.get("assignee_name"),
            "employee_id": doc.get("employee_id"),
            "team_id": doc.get("team_id"),
            "database_type": doc.get("database_type"),
            "task_type": doc.get("task_type"),
            "due_date": doc.get("due_date"),
            "moved_to_review": doc.get("moved_to_review"),
            "status": doc.get("status"),
            "deadline_status": doc.get("deadline_status"),
            "performance_score": doc.get("performance_score"),
            "intro_rating": doc.get("intro_rating"),
            "overall_rating": doc.get("overall_rating"),
            "changes_count": doc.get("changes_count"),
            "thumbnail_rating": doc.get("thumbnail_rating"),
            "script_rating": doc.get("script_rating"),
            "video_length": doc.get("video_length"),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
        }
        # Set perf_id for consistency with webhook-generated records
        emp_id_val = doc.get("employee_id", "")
        insert_doc["perf_id"] = f"{norm_pid}_{emp_id_val}"

        to_insert.append(insert_doc)
        # Track within-batch duplicates
        existing_page_ids.add(raw_pid)
        existing_page_ids.add(norm_pid)

    imported = 0
    if to_insert:
        await db.performance_data.insert_many(to_insert, ordered=False)
        imported = len(to_insert)

    return {
        "imported": imported,
        "skipped": skipped,
        "message": f"Imported {imported} new documents, skipped {skipped} duplicates"
    }


# ===================== UPGRADE LEVEL REQUEST =====================

class UpgradeLevelRequest(BaseModel):
    employee_id: str
    employee_name: str
    job_position: str
    current_level: str
    requested_level: str
    exam_month: str

@api_router.post("/upgrade-level-request")
async def submit_upgrade_request(body: UpgradeLevelRequest, request: Request):
    user = await get_current_user(request)
    
    # Verify the request is for the logged-in user's employee
    if user.get("is_admin"):
        # Admin can submit for any employee
        pass
    else:
        # Non-admin can only submit for their own employee record
        my_emp = await db.employees.find_one(
            {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
        )
        if not my_emp or my_emp.get("employee_id") != body.employee_id:
            raise HTTPException(403, "You can only submit upgrade requests for yourself")
    
    # Format Slack message
    today = datetime.now(timezone.utc)
    request_date = today.strftime("%B %d, %Y")
    
    slack_message = {
        "text": f"🎓 Level Upgrade Request\n\nName: {body.employee_name}\nEmployee ID: {body.employee_id}\nCurrent Position: {body.job_position}\nCurrent Level: {body.current_level}\nRequested Exam Level: {body.requested_level}\nExam Month: {body.exam_month}\nRequest Date: {request_date}"
    }
    
    # Send to Slack webhook - URL should be set in environment variable SLACK_WEBHOOK_URL
    # Default fallback for backward compatibility
    slack_webhook_url = os.environ.get(
        'SLACK_WEBHOOK_URL',
        'YOUR_SLACK_WEBHOOK_URL'
    )
    
    try:
        response = http_requests.post(
            slack_webhook_url,
            json=slack_message,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code != 200:
            logger.error(f"Slack webhook failed: {response.status_code} - {response.text}")
            raise HTTPException(500, "Failed to submit upgrade request")
        
        return {"message": "Upgrade request submitted successfully"}
    
    except http_requests.exceptions.RequestException as e:
        logger.error(f"Slack webhook error: {str(e)}")
        raise HTTPException(500, "Failed to submit upgrade request")


# ===================== MANAGER PERFORMANCE ROUTES =====================

def _validate_report_link(url: Optional[str]) -> Optional[str]:
    """Return a cleaned URL string (http/https required) or None. Raises 400 on malformed input."""
    if not url:
        return None
    url = url.strip()
    if not url:
        return None
    if len(url) > 2048:
        raise HTTPException(400, "Report link is too long (max 2048 chars)")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(400, "Report link must be a valid http(s) URL")
    return url


@api_router.get("/manager-performance")
async def get_manager_performance(request: Request, month: Optional[str] = None, manager_id: Optional[str] = None):
    """Get manager performance data. Filter by month and/or manager_id if provided."""
    await get_current_user(request)
    
    query = {}
    if month:
        query["month"] = month
    if manager_id:
        query["manager_id"] = manager_id
    
    performances = await db.manager_performance.find(query, {"_id": 0}).to_list(1000)
    
    # Enrich with manager details
    for perf in performances:
        manager = await db.employees.find_one({"employee_id": perf["manager_id"]}, {"_id": 0})
        if manager:
            perf["manager"] = {
                "employee_id": manager.get("employee_id"),
                "first_name": manager.get("first_name"),
                "last_name": manager.get("last_name"),
                "profile_picture": manager.get("profile_picture")
            }
    
    return performances


@api_router.get("/managers-with-teams")
async def get_managers_with_teams(request: Request):
    """Get list of all employees who are team managers."""
    await get_current_user(request)
    
    # Get all teams
    teams = await db.teams.find({}, {"_id": 0}).to_list(1000)
    
    # Extract unique manager IDs
    manager_ids = list(set([team["team_manager_id"] for team in teams if team.get("team_manager_id")]))
    
    # Get employee details for these managers
    managers = []
    for manager_id in manager_ids:
        manager = await db.employees.find_one({"employee_id": manager_id}, {"_id": 0})
        if manager:
            managers.append({
                "employee_id": manager["employee_id"],
                "first_name": manager["first_name"],
                "last_name": manager["last_name"],
                "profile_picture": manager.get("profile_picture")
            })
    
    # Sort by name
    managers.sort(key=lambda m: f"{m['first_name']} {m['last_name']}")
    
    return managers


@api_router.post("/manager-performance")
async def create_manager_performance(body: ManagerPerformanceCreate, request: Request):
    """Create new manager performance entry."""
    user = await get_current_user(request)
    
    # Only admin can create
    if not user.get("is_admin"):
        my_emp = await db.employees.find_one(
            {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
        )
        if not my_emp or my_emp.get("department_name") != "Admin":
            raise HTTPException(403, "Only Admin department can add manager performance data")
    
    # Check if manager exists and is a team manager
    manager = await db.employees.find_one({"employee_id": body.manager_id}, {"_id": 0})
    if not manager:
        raise HTTPException(404, "Manager not found")
    
    # Check if manager has a team
    team = await db.teams.find_one({"team_manager_id": body.manager_id}, {"_id": 0})
    if not team:
        raise HTTPException(400, "This employee is not a team manager")
    
    # Validate scores
    if not (0 <= body.client_performance_score <= 100):
        raise HTTPException(400, "Client performance score must be between 0 and 100")
    if not (0 <= body.client_feedback_score <= 100):
        raise HTTPException(400, "Client feedback score must be between 0 and 100")
    if not (0 <= body.creative_task_score <= 100):
        raise HTTPException(400, "Creative task score must be between 0 and 100")
    
    # Validate report_link — must be a valid URL if provided
    report_link_clean = _validate_report_link(body.report_link)
    
    # Check for duplicate (same manager + month)
    existing = await db.manager_performance.find_one({
        "manager_id": body.manager_id,
        "month": body.month
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(400, "Performance data for this manager and month already exists. Please edit the existing entry or select a different manager/month.")
    
    # Calculate total points (weighted: 45% Client Performance, 35% Client Feedback, 20% Creative Task)
    total_points_month = round(
        body.client_performance_score * 0.45 +
        body.client_feedback_score * 0.35 +
        body.creative_task_score * 0.20,
        2
    )
    
    # Create entry
    perf_entry = {
        "perf_id": f"mperf_{uuid.uuid4().hex[:12]}",
        "manager_id": body.manager_id,
        "month": body.month,
        "client_performance_score": body.client_performance_score,
        "client_feedback_score": body.client_feedback_score,
        "creative_task_score": body.creative_task_score,
        "report_link": report_link_clean,
        "total_points_month": total_points_month,
        "created_by": user.get("email"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.manager_performance.insert_one(perf_entry)
    
    return {k: v for k, v in perf_entry.items() if k != "_id"}


@api_router.put("/manager-performance/{perf_id}")
async def update_manager_performance(perf_id: str, body: ManagerPerformanceCreate, request: Request):
    """Update existing manager performance entry."""
    user = await get_current_user(request)
    
    # Only admin can update
    if not user.get("is_admin"):
        my_emp = await db.employees.find_one(
            {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
        )
        if not my_emp or my_emp.get("department_name") != "Admin":
            raise HTTPException(403, "Only Admin department can update manager performance data")
    
    # Find existing entry
    existing = await db.manager_performance.find_one({"perf_id": perf_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Performance entry not found")
    
    # Validate scores
    if not (0 <= body.client_performance_score <= 100):
        raise HTTPException(400, "Client performance score must be between 0 and 100")
    if not (0 <= body.client_feedback_score <= 100):
        raise HTTPException(400, "Client feedback score must be between 0 and 100")
    if not (0 <= body.creative_task_score <= 100):
        raise HTTPException(400, "Creative task score must be between 0 and 100")
    
    # Validate report_link — must be a valid URL if provided
    report_link_clean = _validate_report_link(body.report_link)
    
    # Calculate new total points (weighted: 45% Client Performance, 35% Client Feedback, 20% Creative Task)
    total_points_month = round(
        body.client_performance_score * 0.45 +
        body.client_feedback_score * 0.35 +
        body.creative_task_score * 0.20,
        2
    )
    
    # Update entry
    await db.manager_performance.update_one(
        {"perf_id": perf_id},
        {"$set": {
            "client_performance_score": body.client_performance_score,
            "client_feedback_score": body.client_feedback_score,
            "creative_task_score": body.creative_task_score,
            "report_link": report_link_clean,
            "total_points_month": total_points_month,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.manager_performance.find_one({"perf_id": perf_id}, {"_id": 0})
    return updated


# ===================== SHIFTS MANAGEMENT =====================

@api_router.get("/shifts")
async def get_shifts(request: Request):
    await get_current_user(request)
    await ensure_default_shift()
    shifts = await db.shifts.find({}, {"_id": 0}).sort("shift_name", 1).to_list(1000)
    for shift in shifts:
        count = await db.employee_shifts.count_documents({"shift_id": shift["shift_id"]})
        shift["employee_count"] = count
    return shifts


@api_router.post("/shifts")
async def create_shift(body: ShiftCreate, request: Request):
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can manage shifts")

    if not body.start_time or not body.end_time:
        raise HTTPException(400, "Start time and end time are required")
    if body.start_time == body.end_time:
        raise HTTPException(400, "Start time and end time cannot be the same")

    existing = await db.shifts.find_one(
        {"shift_name": {"$regex": f"^{re.escape(body.shift_name)}$", "$options": "i"}}, {"_id": 0}
    )
    if existing:
        raise HTTPException(400, "A shift with this name already exists")

    total_hours = calc_total_hours(body.start_time, body.end_time)
    shift = {
        "shift_id": f"shift_{uuid.uuid4().hex[:8]}",
        "shift_name": body.shift_name.strip(),
        "start_time": body.start_time,
        "end_time": body.end_time,
        "break_duration": body.break_duration,
        "total_hours": total_hours,
        "is_system_default": body.is_system_default,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.shifts.insert_one(shift)
    return {k: v for k, v in shift.items() if k != "_id"}


@api_router.put("/shifts/{shift_id}")
async def update_shift(shift_id: str, body: ShiftCreate, request: Request):
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can manage shifts")

    existing = await db.shifts.find_one({"shift_id": shift_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Shift not found")

    if existing.get("is_system_default") and body.shift_name.strip().lower() != existing["shift_name"].strip().lower():
        raise HTTPException(400, "Cannot rename the system default shift")

    if body.shift_name.strip().lower() != existing["shift_name"].strip().lower():
        dup = await db.shifts.find_one(
            {"shift_name": {"$regex": f"^{re.escape(body.shift_name)}$", "$options": "i"},
             "shift_id": {"$ne": shift_id}}, {"_id": 0}
        )
        if dup:
            raise HTTPException(400, "A shift with this name already exists")

    total_hours = calc_total_hours(body.start_time, body.end_time)
    update = {
        "shift_name": body.shift_name.strip(),
        "start_time": body.start_time,
        "end_time": body.end_time,
        "break_duration": body.break_duration,
        "total_hours": total_hours,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.shifts.update_one({"shift_id": shift_id}, {"$set": update})
    return {**existing, **update}


@api_router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str, request: Request):
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can manage shifts")

    existing = await db.shifts.find_one({"shift_id": shift_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Shift not found")
    if existing.get("is_system_default"):
        raise HTTPException(400, "Cannot delete the system default shift")

    default_shift = await get_default_shift()
    if not default_shift:
        raise HTTPException(500, "System default shift not found")

    now = datetime.now(timezone.utc).isoformat()
    await db.employee_shifts.update_many(
        {"shift_id": shift_id},
        {"$set": {"shift_id": default_shift["shift_id"], "assigned_at": now}}
    )
    await db.shifts.delete_one({"shift_id": shift_id})
    return {"message": "Shift deleted. Employees reassigned to default shift."}


# ===================== EMPLOYEE SHIFTS =====================

@api_router.get("/employee-shifts/{employee_id}")
async def get_employee_shift(employee_id: str, request: Request):
    await get_current_user(request)
    await ensure_default_shift()
    emp_shift = await db.employee_shifts.find_one({"employee_id": employee_id}, {"_id": 0})
    if not emp_shift:
        default_shift = await get_default_shift()
        if default_shift:
            return {"employee_id": employee_id, "shift_id": default_shift["shift_id"], "shift": default_shift, "is_default": True}
        return None
    shift = await db.shifts.find_one({"shift_id": emp_shift["shift_id"]}, {"_id": 0})
    if not shift:
        # Shift was deleted, fallback to default
        default_shift = await get_default_shift()
        shift = default_shift
    emp_shift["shift"] = shift
    emp_shift["is_default"] = False
    return emp_shift


@api_router.post("/employee-shifts")
async def assign_employee_shift(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can assign shifts")

    employee_id = body.get("employee_id")
    shift_id = body.get("shift_id")
    if not employee_id or not shift_id:
        raise HTTPException(400, "employee_id and shift_id required")

    shift = await db.shifts.find_one({"shift_id": shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(404, "Shift not found")
    emp = await db.employees.find_one({"employee_id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")

    assigned_by_id = my_emp["employee_id"] if my_emp else None
    now = datetime.now(timezone.utc).isoformat()
    await db.employee_shifts.update_one(
        {"employee_id": employee_id},
        {"$set": {"employee_id": employee_id, "shift_id": shift_id,
                  "assigned_at": now, "assigned_by": assigned_by_id}},
        upsert=True
    )
    return {"employee_id": employee_id, "shift_id": shift_id, "shift": shift, "assigned_at": now}


# ===================== SHIFT CHANGE REQUESTS =====================

@api_router.get("/shift-change-requests")
async def get_shift_change_requests(
    request: Request,
    status: Optional[str] = None,
    employee_id: Optional[str] = None
):
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    query = {}
    if status:
        query["status"] = status
    if is_admin:
        if employee_id:
            query["employee_id"] = employee_id
    else:
        if not my_emp:
            return []
        query["employee_id"] = my_emp["employee_id"]

    requests_list = await db.shift_change_requests.find(query, {"_id": 0}).sort("requested_at", -1).to_list(1000)

    for req in requests_list:
        emp = await db.employees.find_one({"employee_id": req["employee_id"]}, {"_id": 0})
        req["employee"] = {
            "employee_id": emp["employee_id"],
            "first_name": emp["first_name"],
            "last_name": emp["last_name"],
            "profile_picture": emp.get("profile_picture")
        } if emp else None

        requested_shift = await db.shifts.find_one({"shift_id": req["requested_shift_id"]}, {"_id": 0})
        req["requested_shift"] = requested_shift

        emp_shift = await db.employee_shifts.find_one({"employee_id": req["employee_id"]}, {"_id": 0})
        if emp_shift:
            curr_shift = await db.shifts.find_one({"shift_id": emp_shift["shift_id"]}, {"_id": 0})
            req["current_shift"] = curr_shift
        else:
            req["current_shift"] = await get_default_shift()

        if req.get("reviewed_by"):
            reviewer = await db.employees.find_one({"employee_id": req["reviewed_by"]}, {"_id": 0})
            if reviewer:
                req["reviewer_name"] = f"{reviewer['first_name']} {reviewer['last_name']}"

    return requests_list


@api_router.post("/shift-change-requests")
async def create_shift_change_request(body: ShiftChangeRequestCreate, request: Request):
    user = await get_current_user(request)

    # Check if user is super admin first (is_admin flag)
    if user.get("is_admin"):
        raise HTTPException(403, "Admin department users cannot submit shift change requests")

    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    if not my_emp:
        raise HTTPException(403, "Employee profile not found")

    is_admin = my_emp.get("department_name") == "Admin"
    if is_admin:
        raise HTTPException(403, "Admin department users cannot submit shift change requests")

    requested_shift = await db.shifts.find_one({"shift_id": body.requested_shift_id}, {"_id": 0})
    if not requested_shift:
        raise HTTPException(404, "Requested shift not found")

    try:
        from_date_dt = datetime.strptime(body.from_date, "%Y-%m-%d")
        to_date_dt = datetime.strptime(body.to_date, "%Y-%m-%d")
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    if from_date_dt < today:
        raise HTTPException(400, "Cannot request shift change for past dates")
    if to_date_dt < from_date_dt:
        raise HTTPException(400, "To date must be >= From date")

    if not body.reason or not body.reason.strip():
        raise HTTPException(400, "Reason is required")
    if len(body.reason) > 500:
        raise HTTPException(400, "Reason must be 500 characters or less")

    # Check for overlapping pending/approved requests
    overlapping = await db.shift_change_requests.find_one({
        "employee_id": my_emp["employee_id"],
        "status": {"$in": ["Pending", "Approved"]},
        "from_date": {"$lte": body.to_date},
        "to_date": {"$gte": body.from_date}
    }, {"_id": 0})
    if overlapping:
        raise HTTPException(400, "You already have a shift change request for these dates")

    now = datetime.now(timezone.utc).isoformat()
    new_request = {
        "request_id": f"scr_{uuid.uuid4().hex[:12]}",
        "employee_id": my_emp["employee_id"],
        "requested_shift_id": body.requested_shift_id,
        "from_date": body.from_date,
        "to_date": body.to_date,
        "reason": body.reason.strip(),
        "status": "Pending",
        "requested_at": now,
        "reviewed_by": None,
        "reviewed_at": None,
        "admin_notes": None
    }
    await db.shift_change_requests.insert_one(new_request)
    return {k: v for k, v in new_request.items() if k != "_id"}


@api_router.put("/shift-change-requests/{request_id}/review")
async def review_shift_change_request(request_id: str, body: ShiftChangeRequestReview, request: Request):
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can review shift change requests")

    if body.status not in ["Approved", "Rejected"]:
        raise HTTPException(400, "Status must be 'Approved' or 'Rejected'")

    existing = await db.shift_change_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Request not found")
    if existing["status"] != "Pending":
        raise HTTPException(400, "Can only review pending requests")

    reviewer_id = my_emp["employee_id"] if my_emp else None
    now = datetime.now(timezone.utc).isoformat()
    update = {
        "status": body.status,
        "reviewed_by": reviewer_id,
        "reviewed_at": now,
        "admin_notes": body.admin_notes or ""
    }
    await db.shift_change_requests.update_one({"request_id": request_id}, {"$set": update})
    return {**existing, **update}


@api_router.delete("/shift-change-requests/{request_id}")
async def cancel_shift_change_request(request_id: str, request: Request):
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    if not my_emp:
        raise HTTPException(403, "Employee profile not found")

    existing = await db.shift_change_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Request not found")

    is_admin = user.get("is_admin") or my_emp.get("department_name") == "Admin"
    if not is_admin and existing["employee_id"] != my_emp["employee_id"]:
        raise HTTPException(403, "You can only cancel your own requests")

    if existing["status"] != "Pending":
        raise HTTPException(400, "Only pending requests can be cancelled")

    await db.shift_change_requests.delete_one({"request_id": request_id})
    return {"message": "Request cancelled"}


# ===================== LEAVE MANAGEMENT =====================

@api_router.get("/leave/balance")
async def get_leave_balance(request: Request, employee_id: Optional[str] = None):
    """Get leave balance for an employee. Auto-credits monthly if eligible."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    if not employee_id:
        if not my_emp:
            raise HTTPException(400, "employee_id required")
        employee_id = my_emp["employee_id"]

    if not is_admin and (not my_emp or my_emp["employee_id"] != employee_id):
        raise HTTPException(403, "Access denied")

    balance = await get_or_create_leave_balance(employee_id)
    # Auto-credit current month if eligible and not yet credited
    if balance.get("paid_leave_eligible"):
        current_month = datetime.now(timezone.utc).strftime("%Y-%m-01")
        if balance.get("last_credited_month") != current_month:
            await auto_credit_monthly_leave()
            balance = await get_or_create_leave_balance(employee_id)
    return balance


@api_router.get("/leave/working-days")
async def get_working_days_endpoint(request: Request, from_date: str, to_date: str):
    """Calculate working days (excluding Sundays and company holidays) between two dates."""
    await get_current_user(request)
    holiday_dates = await get_holidays_in_range_db(from_date, to_date)
    days = calc_working_days_between(from_date, to_date, exclude_dates=holiday_dates)
    return {"from_date": from_date, "to_date": to_date, "working_days": days, "holidays_excluded": len(holiday_dates)}


@api_router.get("/leave/requests")
async def get_leave_requests(
    request: Request,
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    month: Optional[str] = None
):
    """List leave requests. Admin sees all, employees see own."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    query: dict = {}
    if status and status != "All":
        query["status"] = status

    if is_admin:
        if employee_id:
            query["employee_id"] = employee_id
    else:
        if not my_emp:
            return []
        query["employee_id"] = my_emp["employee_id"]

    if month:
        try:
            mdt = datetime.strptime(month, "%Y-%m-%d")
            last = cal_module.monthrange(mdt.year, mdt.month)[1]
            ms = mdt.strftime("%Y-%m-01")
            me = mdt.strftime(f"%Y-%m-{last:02d}")
            query["$or"] = [
                {"from_date": {"$gte": ms, "$lte": me}},
                {"to_date": {"$gte": ms, "$lte": me}}
            ]
        except ValueError:
            pass

    requests_list = await db.leave_requests.find(query, {"_id": 0}).sort("requested_at", -1).to_list(1000)

    for req in requests_list:
        emp = await db.employees.find_one({"employee_id": req["employee_id"]}, {"_id": 0})
        req["employee"] = {
            "employee_id": emp["employee_id"], "first_name": emp["first_name"],
            "last_name": emp["last_name"], "profile_picture": emp.get("profile_picture"),
            "department_name": emp.get("department_name"),
        } if emp else None

        if req.get("reviewed_by"):
            rv = await db.employees.find_one({"employee_id": req["reviewed_by"]}, {"_id": 0})
            req["reviewer_name"] = f"{rv['first_name']} {rv['last_name']}" if rv else None

        req["employee_balance"] = await db.leave_balance.find_one(
            {"employee_id": req["employee_id"]}, {"_id": 0}
        )
    return requests_list


@api_router.post("/leave/requests")
async def create_leave_request(body: LeaveRequestCreate, request: Request):
    """Submit a leave request."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    if not my_emp:
        raise HTTPException(403, "Employee profile not found")

    if body.leave_type not in ["Full Day", "Half Day"]:
        raise HTTPException(400, "leave_type must be 'Full Day' or 'Half Day'")
    if body.leave_type == "Half Day" and body.half_day_type not in ["First Half", "Second Half"]:
        raise HTTPException(400, "half_day_type required: 'First Half' or 'Second Half'")
    if not body.reason or not body.reason.strip():
        raise HTTPException(400, "Reason is required")
    if len(body.reason) > 1000:
        raise HTTPException(400, "Reason must be 1000 characters or less")

    try:
        from_dt = datetime.strptime(body.from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(body.to_date, "%Y-%m-%d")
        today_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    if from_dt < today_dt:
        raise HTTPException(400, "Cannot apply for leave on past dates")
    if to_dt < from_dt:
        raise HTTPException(400, "To date must be >= From date")
    if from_dt.weekday() == 6:
        raise HTTPException(400, "Cannot apply for leave starting on Sunday")

    # Check for overlapping pending/approved requests
    overlapping = await db.leave_requests.find_one({
        "employee_id": my_emp["employee_id"], "status": {"$in": ["Pending", "Approved"]},
        "from_date": {"$lte": body.to_date}, "to_date": {"$gte": body.from_date}
    }, {"_id": 0})
    if overlapping:
        raise HTTPException(400, "You already have a leave request for overlapping dates")

    # Holiday validation — reject leave on a holiday
    hn = await is_holiday_db(body.from_date)
    if hn:
        raise HTTPException(400, f"Cannot apply for leave on a public holiday: {hn}")

    # Calculate working days (excluding Sundays AND holidays)
    holiday_dates = await get_holidays_in_range_db(body.from_date, body.to_date)
    total_days = float(calc_working_days_between(body.from_date, body.to_date, exclude_dates=holiday_dates))
    if body.leave_type == "Half Day":
        total_days = 0.5
    if total_days == 0:
        raise HTTPException(400, "No working days in selected range (all Sundays/holidays)")

    balance = await get_or_create_leave_balance(my_emp["employee_id"])
    deduction = calc_leave_deduction(balance, total_days)

    now = datetime.now(timezone.utc).isoformat()
    new_req = {
        "request_id": f"lr_{uuid.uuid4().hex[:12]}",
        "employee_id": my_emp["employee_id"],
        "from_date": body.from_date, "to_date": body.to_date,
        "leave_type": body.leave_type,
        "half_day_type": body.half_day_type if body.leave_type == "Half Day" else None,
        "total_days": total_days,
        "paid_days": deduction["paid_days"], "regular_days": deduction["regular_days"],
        "reason": body.reason.strip(), "status": "Pending",
        "requested_at": now, "reviewed_by": None, "reviewed_at": None,
        "admin_notes": None, "cancelled_at": None, "created_at": now, "updated_at": now
    }
    await db.leave_requests.insert_one(new_req)
    # Fire-and-forget Slack notification (does not block or fail the request)
    try:
        await notify_leave_submitted(new_req, my_emp)
    except Exception:  # noqa: BLE001
        pass
    return {k: v for k, v in new_req.items() if k != "_id"}


@api_router.put("/leave/requests/{request_id}/review")
async def review_leave_request(request_id: str, body: LeaveRequestReview, request: Request):
    """Admin approve or reject a leave request."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can review leave requests")

    if body.status not in ["Approved", "Rejected"]:
        raise HTTPException(400, "Status must be 'Approved' or 'Rejected'")

    existing = await db.leave_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Leave request not found")
    if existing["status"] != "Pending":
        raise HTTPException(400, "Only pending requests can be reviewed")

    reviewer_id = my_emp["employee_id"] if my_emp else None
    now = datetime.now(timezone.utc).isoformat()

    if body.status == "Approved":
        # Deduct paid leave balance
        if existing.get("paid_days", 0) > 0:
            bal = await get_or_create_leave_balance(existing["employee_id"])
            bal_before = float(bal.get("paid_leave_balance", 0))
            bal_after = round(max(0.0, bal_before - existing["paid_days"]), 2)
            await db.leave_balance.update_one(
                {"employee_id": existing["employee_id"]},
                {"$set": {"paid_leave_balance": bal_after, "updated_at": now}}
            )
            await create_leave_txn(
                employee_id=existing["employee_id"], txn_type="Debit", leave_type="Paid",
                amount=existing["paid_days"], balance_before=bal_before, balance_after=bal_after,
                ref_type="Leave Request", ref_id=request_id, date_str=now[:10],
                notes=f"Leave approved: {existing['from_date']} to {existing['to_date']}"
            )
        # Mark attendance as Leave
        await mark_leave_in_attendance(existing)

    update = {
        "status": body.status, "reviewed_by": reviewer_id,
        "reviewed_at": now, "admin_notes": body.admin_notes or "", "updated_at": now
    }
    await db.leave_requests.update_one({"request_id": request_id}, {"$set": update})
    return {**existing, **update}


@api_router.put("/leave/requests/{request_id}/cancel")
async def cancel_leave_request(request_id: str, request: Request):
    """Employee (or admin) cancels a pending/approved leave request."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )

    existing = await db.leave_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Leave request not found")

    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin and (not my_emp or existing["employee_id"] != my_emp["employee_id"]):
        raise HTTPException(403, "You can only cancel your own leave requests")

    if existing["status"] not in ["Pending", "Approved"]:
        raise HTTPException(400, "Only Pending or Approved requests can be cancelled")

    if existing["status"] == "Approved":
        today_str = datetime.now().strftime("%Y-%m-%d")
        if existing["from_date"] < today_str:
            raise HTTPException(400, "Cannot cancel a leave that has already started")
        # Restore paid leave balance
        if existing.get("paid_days", 0) > 0:
            bal = await get_or_create_leave_balance(existing["employee_id"])
            bal_before = float(bal.get("paid_leave_balance", 0))
            bal_after = round(bal_before + existing["paid_days"], 2)
            now_str = datetime.now(timezone.utc).isoformat()
            await db.leave_balance.update_one(
                {"employee_id": existing["employee_id"]},
                {"$set": {"paid_leave_balance": bal_after, "updated_at": now_str}}
            )
            await create_leave_txn(
                employee_id=existing["employee_id"], txn_type="Credit", leave_type="Paid",
                amount=existing["paid_days"], balance_before=bal_before, balance_after=bal_after,
                ref_type="Leave Cancelled", ref_id=request_id, date_str=now_str[:10],
                notes=f"Leave cancelled: {existing['from_date']} to {existing['to_date']}"
            )
        # Remove Leave attendance records in the date range
        await db.daily_attendance.delete_many({
            "employee_id": existing["employee_id"], "status": "Leave",
            "date": {"$gte": existing["from_date"], "$lte": existing["to_date"]}
        })

    now = datetime.now(timezone.utc).isoformat()
    update = {"status": "Cancelled", "cancelled_at": now, "updated_at": now}
    await db.leave_requests.update_one({"request_id": request_id}, {"$set": update})
    return {**existing, **update}


@api_router.get("/leave/transactions")
async def get_leave_transactions(request: Request, employee_id: Optional[str] = None):
    """Get leave audit trail for an employee."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    if not employee_id:
        if not my_emp:
            raise HTTPException(400, "employee_id required")
        employee_id = my_emp["employee_id"]

    if not is_admin and (not my_emp or my_emp["employee_id"] != employee_id):
        raise HTTPException(403, "Access denied")

    txns = await db.leave_transactions.find({"employee_id": employee_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return txns


@api_router.post("/leave/credit-monthly")
async def credit_monthly_leave_endpoint(request: Request):
    """Admin: manually trigger monthly paid leave credit for all eligible employees."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Admin only")
    count = await auto_credit_monthly_leave()
    return {"message": f"Credited paid leave to {count} employees", "credited_count": count}


@api_router.post("/leave/reset-yearly")
async def reset_yearly_leave_endpoint(request: Request):
    """Admin: reset all paid leave balances to 0 for new year."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Admin only")
    count = await auto_reset_yearly_leave()
    return {"message": f"Reset leave balances for {count} employees", "reset_count": count}


async def auto_reset_yearly_leave() -> int:
    """Reset paid_leave_balance=0 and clear last_credited_month for ALL balances.
    Emits an audit 'Reset' transaction only for employees whose balance was non-zero."""
    balances = await db.leave_balance.find({}, {"_id": 0}).to_list(10000)
    today_str = datetime.now().strftime("%Y-%m-%d")
    count = 0
    for bal in balances:
        bal_before = float(bal.get("paid_leave_balance", 0))
        now = datetime.now(timezone.utc).isoformat()
        await db.leave_balance.update_one(
            {"employee_id": bal["employee_id"]},
            {"$set": {"paid_leave_balance": 0.0, "last_credited_month": None, "updated_at": now}}
        )
        if bal_before > 0:
            await create_leave_txn(
                employee_id=bal["employee_id"], txn_type="Reset", leave_type="Paid",
                amount=-bal_before, balance_before=bal_before, balance_after=0.0,
                ref_type="Year Reset", ref_id=today_str,
                date_str=today_str, notes="Annual paid leave balance reset"
            )
            count += 1
    return count


# ===================== ATTENDANCE SYSTEM =====================

@api_router.get("/dashboard/today")
async def get_dashboard_today(request: Request):
    """Aggregated dashboard payload for today: on-leave, WFH, late arrivals, birthdays."""
    await get_current_user(request)
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    mm_dd = now.strftime("%m-%d")  # for birthday match on any year

    # Fetch today's attendance rows with relevant statuses + late flag
    att_rows = await db.daily_attendance.find(
        {
            "date": today_str,
            "$or": [
                {"status": {"$in": ["Leave", "WFH"]}},
                {"is_late": True},
            ],
        },
        {"_id": 0},
    ).to_list(500)

    # Collect employee_ids to batch-fetch
    emp_ids = sorted({r["employee_id"] for r in att_rows})
    emp_map: dict = {}
    if emp_ids:
        emp_docs = await db.employees.find(
            {"employee_id": {"$in": emp_ids}},
            {"_id": 0, "employee_id": 1, "first_name": 1, "last_name": 1,
             "profile_picture": 1, "job_position_name": 1, "department_name": 1},
        ).to_list(len(emp_ids))
        emp_map = {e["employee_id"]: e for e in emp_docs}

    def enrich(row):
        emp = emp_map.get(row["employee_id"]) or {}
        return {
            "employee_id": row["employee_id"],
            "first_name": emp.get("first_name"),
            "last_name": emp.get("last_name"),
            "profile_picture": emp.get("profile_picture"),
            "job_position_name": emp.get("job_position_name"),
            "department_name": emp.get("department_name"),
        }

    # On leave today — batch-fetch all leave_requests covering today in one query
    leave_emp_ids = [r["employee_id"] for r in att_rows if r.get("status") == "Leave"]
    leave_req_map: dict = {}
    if leave_emp_ids:
        lr_docs = await db.leave_requests.find(
            {
                "employee_id": {"$in": leave_emp_ids},
                "status": "Approved",
                "from_date": {"$lte": today_str},
                "to_date": {"$gte": today_str},
            },
            {"_id": 0, "employee_id": 1, "leave_type": 1, "half_day_type": 1},
        ).to_list(len(leave_emp_ids))
        for lr in lr_docs:
            leave_req_map[lr["employee_id"]] = lr

    leave_list = []
    for r in att_rows:
        if r.get("status") != "Leave":
            continue
        base = enrich(r)
        lr = leave_req_map.get(r["employee_id"]) or {}
        base["leave_type"] = lr.get("leave_type") or "Full Day"
        base["half_day_type"] = lr.get("half_day_type")
        leave_list.append(base)

    # WFH today
    wfh_list = [enrich(r) for r in att_rows if r.get("status") == "WFH"]

    # Late arrivals — sorted by late_minutes desc
    late_rows = [r for r in att_rows if r.get("is_late")]
    late_rows.sort(key=lambda r: r.get("late_minutes") or 0, reverse=True)
    late_list = []
    for r in late_rows:
        base = enrich(r)
        base["check_in"] = r.get("check_in")
        base["late_minutes"] = r.get("late_minutes") or 0
        late_list.append(base)

    # Birthdays + Work anniversaries today — match on month-day regardless of year
    bday_regex = f"-{mm_dd}$"
    bday_docs, anniv_docs = await asyncio.gather(
        db.employees.find(
            {"date_of_birth": {"$regex": bday_regex}, "status": "Active"},
            {"_id": 0, "employee_id": 1, "first_name": 1, "last_name": 1,
             "profile_picture": 1, "job_position_name": 1, "department_name": 1,
             "date_of_birth": 1},
        ).to_list(200),
        db.employees.find(
            {"joining_date": {"$regex": bday_regex}, "status": "Active"},
            {"_id": 0, "employee_id": 1, "first_name": 1, "last_name": 1,
             "profile_picture": 1, "job_position_name": 1, "department_name": 1,
             "joining_date": 1},
        ).to_list(200),
    )

    bday_list = []
    seen_ids = set()

    for e in bday_docs:
        age = None
        try:
            dob = datetime.strptime(e["date_of_birth"], "%Y-%m-%d")
            age = now.year - dob.year
            if (now.month, now.day) < (dob.month, dob.day):
                age -= 1
        except Exception:
            age = None
        seen_ids.add(e["employee_id"])
        bday_list.append({
            "employee_id": e["employee_id"],
            "first_name": e.get("first_name"),
            "last_name": e.get("last_name"),
            "profile_picture": e.get("profile_picture"),
            "job_position_name": e.get("job_position_name"),
            "department_name": e.get("department_name"),
            "type": "birthday",
            "age": age,
        })

    for e in anniv_docs:
        years = None
        try:
            jd = datetime.strptime(e["joining_date"], "%Y-%m-%d")
            years = now.year - jd.year
            if (now.month, now.day) < (jd.month, jd.day):
                years -= 1
        except Exception:
            years = None
        if years is None or years < 1:
            continue  # skip day-1 joins
        entry = {
            "employee_id": e["employee_id"],
            "first_name": e.get("first_name"),
            "last_name": e.get("last_name"),
            "profile_picture": e.get("profile_picture"),
            "job_position_name": e.get("job_position_name"),
            "department_name": e.get("department_name"),
            "years": years,
        }
        if e["employee_id"] in seen_ids:
            # Same person has both birthday + anniversary today — merge
            for item in bday_list:
                if item["employee_id"] == e["employee_id"]:
                    item["type"] = "both"
                    item["years"] = years
        else:
            entry["type"] = "anniversary"
            bday_list.append(entry)

    return {
        "date": today_str,
        "on_leave": leave_list,
        "wfh": wfh_list,
        "late": late_list,
        "birthdays": bday_list,
    }


@api_router.get("/dashboard/my-requests")
async def get_dashboard_my_requests(request: Request):
    """
    For employees: their own leave/WFH/overtime requests in the last 7 days.
    For admins: pending leave/WFH/overtime requests across all employees that need action.
    """
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    if is_admin:
        # Fetch all pending requests across leave / WFH / overtime
        leave_pending, wfh_pending, ot_pending = await asyncio.gather(
            db.leave_requests.find({"status": "Pending"}, {"_id": 0}).sort("created_at", -1).to_list(50),
            db.wfh_requests.find({"status": "Pending"}, {"_id": 0}).sort("created_at", -1).to_list(50),
            db.overtime_requests.find({"status": "Pending"}, {"_id": 0}).sort("created_at", -1).to_list(50),
        )
        # Batch-fetch employee info
        all_ids = list({r.get("employee_id") for r in leave_pending + wfh_pending + ot_pending if r.get("employee_id")})
        emp_docs = await db.employees.find(
            {"employee_id": {"$in": all_ids}},
            {"_id": 0, "employee_id": 1, "first_name": 1, "last_name": 1, "profile_picture": 1, "department_name": 1, "job_position_name": 1}
        ).to_list(None)
        emp_map = {e["employee_id"]: e for e in emp_docs}

        def enrich_req(r, rtype):
            emp = emp_map.get(r.get("employee_id"), {})
            return {
                "type": rtype,
                "request_id": r.get("leave_request_id") or r.get("wfh_request_id") or r.get("overtime_request_id"),
                "employee_id": r.get("employee_id"),
                "employee_name": f"{emp.get('first_name','')} {emp.get('last_name','')}".strip(),
                "profile_picture": emp.get("profile_picture"),
                "department_name": emp.get("department_name"),
                "status": r.get("status"),
                "from_date": r.get("from_date") or r.get("date"),
                "to_date": r.get("to_date") or r.get("date"),
                "reason": r.get("reason"),
                "created_at": r.get("created_at"),
            }

        requests_list = (
            [enrich_req(r, "leave") for r in leave_pending] +
            [enrich_req(r, "wfh") for r in wfh_pending] +
            [enrich_req(r, "overtime") for r in ot_pending]
        )
        requests_list.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return {"is_admin": True, "requests": requests_list[:30]}

    else:
        # Employee: their own requests in the last 7 days
        if not my_emp:
            return {"is_admin": False, "requests": []}
        emp_id = my_emp["employee_id"]
        seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

        leave_reqs, wfh_reqs, ot_reqs = await asyncio.gather(
            db.leave_requests.find(
                {"employee_id": emp_id, "created_at": {"$gte": seven_days_ago}}, {"_id": 0}
            ).sort("created_at", -1).to_list(20),
            db.wfh_requests.find(
                {"employee_id": emp_id, "created_at": {"$gte": seven_days_ago}}, {"_id": 0}
            ).sort("created_at", -1).to_list(20),
            db.overtime_requests.find(
                {"employee_id": emp_id, "created_at": {"$gte": seven_days_ago}}, {"_id": 0}
            ).sort("created_at", -1).to_list(20),
        )

        def fmt(r, rtype):
            return {
                "type": rtype,
                "request_id": r.get("leave_request_id") or r.get("wfh_request_id") or r.get("overtime_request_id"),
                "status": r.get("status"),
                "from_date": r.get("from_date") or r.get("date"),
                "to_date": r.get("to_date") or r.get("date"),
                "reason": r.get("reason"),
                "created_at": r.get("created_at"),
            }

        requests_list = (
            [fmt(r, "leave") for r in leave_reqs] +
            [fmt(r, "wfh") for r in wfh_reqs] +
            [fmt(r, "overtime") for r in ot_reqs]
        )
        requests_list.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return {"is_admin": False, "requests": requests_list}


@api_router.post("/attendance/entries")
@api_router.post("/attendance/entry")
async def create_attendance_entry(body: AttendanceEntryCreate, request: Request):
    """Public biometric endpoint — requires X-API-Key header or ?api_key= query param.
    Accepts either employee_id (HRMS) or biometric_employee_code (device code)."""
    api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
    if api_key != ATTENDANCE_API_KEY:
        raise HTTPException(401, "Invalid or missing API key")

    if not body.employee_id and not body.biometric_employee_code:
        raise HTTPException(400, "Provide either employee_id or biometric_employee_code")

    # Resolve employee
    if body.biometric_employee_code:
        matches = await db.employees.find(
            {"biometric_employee_code": body.biometric_employee_code}, {"_id": 0}
        ).to_list(5)
        if not matches:
            raise HTTPException(400, f"No employee found for biometric code {body.biometric_employee_code}")
        if len(matches) > 1:
            raise HTTPException(400, f"Multiple employees found for biometric code {body.biometric_employee_code}")
        emp = matches[0]
    else:
        emp = await db.employees.find_one({"employee_id": body.employee_id}, {"_id": 0})
        if not emp:
            raise HTTPException(400, f"Employee {body.employee_id} not found")

    try:
        punch_dt = datetime.fromisoformat(body.timestamp)
        punch_date = punch_dt.strftime("%Y-%m-%d")
        punch_time_str = punch_dt.isoformat()
    except ValueError:
        raise HTTPException(400, "Invalid timestamp. Use ISO format: YYYY-MM-DDTHH:MM:SS")

    resolved_employee_id = emp["employee_id"]

    # Deduplicate: skip if this exact punch already exists
    existing = await db.attendance_entries.find_one(
        {"employee_id": resolved_employee_id, "punch_time": punch_time_str},
        {"_id": 1}
    )
    if existing:
        return {"success": True, "message": "Punch already recorded", "skipped": True}

    now = datetime.now(timezone.utc).isoformat()
    entry = {
        "entry_id": f"ae_{uuid.uuid4().hex[:12]}",
        "employee_id": resolved_employee_id,
        "punch_time": punch_time_str,
        "punch_date": punch_date,
        "created_at": now,
    }
    if body.source:
        entry["source"] = body.source
    if body.biometric_employee_code:
        entry["biometric_employee_code"] = body.biometric_employee_code
    await db.attendance_entries.insert_one(entry)

    # Check if previous day has an "Incomplete" record (forgot to punch out)
    prev_date_obj = datetime.strptime(punch_date, "%Y-%m-%d") - timedelta(days=1)
    prev_date_str = prev_date_obj.strftime("%Y-%m-%d")
    prev_record = await db.daily_attendance.find_one(
        {"employee_id": resolved_employee_id, "date": prev_date_str, "status": "Incomplete"},
        {"_id": 0}
    )
    if prev_record:
        # Previous day had only 1 punch — still only 1 punch, mark as "Forgot to Punch Out"
        await db.daily_attendance.update_one(
            {"employee_id": resolved_employee_id, "date": prev_date_str},
            {"$set": {"status": "Forgot Punch Out", "notes": "Employee forgot to punch out"}}
        )

    # Process today's attendance
    await process_daily_attendance_fn(resolved_employee_id, punch_date)
    return {"success": True, "message": "Attendance entry recorded", "entry_id": entry["entry_id"]}


@api_router.post("/attendance/process")
async def process_attendance_endpoint(request: Request):
    """Process/re-process attendance for employee + date. Useful for manual trigger."""
    user = await get_current_user(request)
    body = await request.json()
    employee_id = body.get("employee_id")
    date_str = body.get("date")
    if not employee_id or not date_str:
        raise HTTPException(400, "employee_id and date required")

    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin and (not my_emp or my_emp["employee_id"] != employee_id):
        raise HTTPException(403, "Access denied")

    result = await process_daily_attendance_fn(employee_id, date_str)
    return result or {"message": "No punches found for this date"}


@api_router.get("/attendance/integration-info")
async def get_attendance_integration_info(request: Request):
    """Admin-only: returns the public ingestion endpoint and API key for biometric integrations."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Access denied")
    return {"api_key": ATTENDANCE_API_KEY}


@api_router.get("/attendance/daily")
async def get_daily_attendance(
    request: Request,
    employee_id: Optional[str] = None,
    month: Optional[str] = None  # "YYYY-MM-DD" first day of month
):
    """Get all daily attendance records for employee in a month."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    if not employee_id:
        if not my_emp:
            raise HTTPException(400, "employee_id required")
        employee_id = my_emp["employee_id"]

    if not is_admin and (not my_emp or my_emp["employee_id"] != employee_id):
        raise HTTPException(403, "Access denied")

    query: dict = {"employee_id": employee_id}
    if month:
        try:
            mdt = datetime.strptime(month, "%Y-%m-%d")
            last = cal_module.monthrange(mdt.year, mdt.month)[1]
            query["date"] = {"$gte": mdt.strftime("%Y-%m-01"), "$lte": mdt.strftime(f"%Y-%m-{last:02d}")}
        except ValueError:
            pass

    records = await db.daily_attendance.find(query, {"_id": 0}).sort("date", 1).to_list(1000)

    # Enrich with shift name
    shift_cache: dict = {}
    for rec in records:
        sid = rec.get("shift_id")
        if sid:
            if sid not in shift_cache:
                s = await db.shifts.find_one({"shift_id": sid}, {"_id": 0})
                shift_cache[sid] = s
            rec["shift"] = shift_cache.get(sid)
    return records


@api_router.get("/attendance/summary")
async def get_attendance_summary(
    request: Request,
    employee_id: Optional[str] = None,
    month: Optional[str] = None
):
    """Get attendance summary (counts by status + late tracking) for a month."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    if not employee_id:
        if not my_emp:
            raise HTTPException(400, "employee_id required")
        employee_id = my_emp["employee_id"]

    if not is_admin and (not my_emp or my_emp["employee_id"] != employee_id):
        raise HTTPException(403, "Access denied")

    query: dict = {"employee_id": employee_id}
    if month:
        try:
            mdt = datetime.strptime(month, "%Y-%m-%d")
            last = cal_module.monthrange(mdt.year, mdt.month)[1]
            query["date"] = {"$gte": mdt.strftime("%Y-%m-01"), "$lte": mdt.strftime(f"%Y-%m-{last:02d}")}
        except ValueError:
            pass

    records = await db.daily_attendance.find(query, {"_id": 0}).to_list(1000)
    summary = {
        "present": sum(1 for r in records if r.get("status") == "Present"),
        "half_day": sum(1 for r in records if r.get("status") == "Half Day"),
        "absent": sum(1 for r in records if r.get("status") == "Absent"),
        "leave": sum(1 for r in records if r.get("status") == "Leave"),
        "wfh": sum(1 for r in records if r.get("status") == "WFH"),
        "holiday": sum(1 for r in records if r.get("status") == "Holiday"),
        "late_count": sum(1 for r in records if r.get("is_late")),
        "total_hours": round(sum(r.get("total_hours") or 0 for r in records), 2)
    }

    late_tracking = None
    if month:
        month_str = datetime.strptime(month, "%Y-%m-%d").strftime("%Y-%m-01")
        late_tracking = await db.monthly_late_tracking.find_one(
            {"employee_id": employee_id, "month": month_str}, {"_id": 0}
        )

    return {"summary": summary, "late_tracking": late_tracking}


@api_router.get("/attendance/all-employees-summary")
async def get_all_employees_attendance_summary(
    request: Request,
    month: Optional[str] = None
):
    """Admin only: attendance summary for all employees in a month."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Admin department only")

    date_query: dict = {}
    if month:
        try:
            mdt = datetime.strptime(month, "%Y-%m-%d")
            last = cal_module.monthrange(mdt.year, mdt.month)[1]
            date_query = {"$gte": mdt.strftime("%Y-%m-01"), "$lte": mdt.strftime(f"%Y-%m-{last:02d}")}
        except ValueError:
            pass

    employees = await db.employees.find({"status": "Active"}, {"_id": 0}).to_list(1000)
    emp_map = {e["employee_id"]: e for e in employees}

    # Single aggregation instead of N per-employee queries
    att_query: dict = {}
    if date_query:
        att_query["date"] = date_query
    pipeline = [
        {"$match": att_query},
        {"$group": {
            "_id": "$employee_id",
            "present": {"$sum": {"$cond": [{"$eq": ["$status", "Present"]}, 1, 0]}},
            "half_day": {"$sum": {"$cond": [{"$eq": ["$status", "Half Day"]}, 1, 0]}},
            "absent": {"$sum": {"$cond": [{"$eq": ["$status", "Absent"]}, 1, 0]}},
            "late_count": {"$sum": {"$cond": ["$is_late", 1, 0]}},
            "total_hours": {"$sum": {"$ifNull": ["$total_hours", 0]}},
        }},
    ]
    agg_rows = await db.daily_attendance.aggregate(pipeline).to_list(None)
    agg_map = {row["_id"]: row for row in agg_rows}

    result = []
    for emp in employees:
        agg = agg_map.get(emp["employee_id"], {})
        result.append({
            "employee_id": emp["employee_id"],
            "first_name": emp["first_name"],
            "last_name": emp["last_name"],
            "department_name": emp.get("department_name"),
            "profile_picture": emp.get("profile_picture"),
            "present": agg.get("present", 0),
            "half_day": agg.get("half_day", 0),
            "absent": agg.get("absent", 0),
            "late_count": agg.get("late_count", 0),
            "total_hours": round(agg.get("total_hours", 0), 2),
        })
    return result


@api_router.put("/attendance/{attendance_id}")
async def update_daily_attendance(attendance_id: str, body: DailyAttendanceUpdate, request: Request):
    """Admin only: manually override attendance status/times for any date."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can override attendance")

    existing = await db.daily_attendance.find_one({"attendance_id": attendance_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Attendance record not found")

    valid = ["Present", "Half Day", "Absent", "Leave", "WFH", "Holiday", "Incomplete", "Forgot Punch Out"]
    if body.status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(valid)}")

    # Fetch employee for biometric_employee_code
    emp = await db.employees.find_one({"employee_id": existing["employee_id"]}, {"_id": 0, "biometric_employee_code": 1})

    update: dict = {
        "status": body.status,
        "source": "manual",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if emp and emp.get("biometric_employee_code"):
        update["biometric_employee_code"] = emp["biometric_employee_code"]
    if body.notes is not None:
        update["notes"] = body.notes
    if body.check_in is not None:
        update["check_in"] = body.check_in
    if body.check_out is not None:
        update["check_out"] = body.check_out

    await db.daily_attendance.update_one({"attendance_id": attendance_id}, {"$set": update})
    return {**existing, **update}


@api_router.post("/attendance/manual")
async def create_manual_attendance(request: Request):
    """Admin only: create or override attendance record manually for any employee+date."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can manually create attendance")

    body = await request.json()
    employee_id = body.get("employee_id")
    date_str = body.get("date")
    status = body.get("status")
    notes = body.get("notes", "")
    check_in = body.get("check_in")
    check_out = body.get("check_out")

    if not employee_id or not date_str or not status:
        raise HTTPException(400, "employee_id, date, and status required")

    valid = ["Present", "Half Day", "Absent", "Leave", "WFH", "Holiday"]
    if status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(valid)}")

    emp = await db.employees.find_one({"employee_id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")

    shift = await get_active_shift_for_date_async(employee_id, datetime.strptime(date_str, "%Y-%m-%d"))
    shift_id = shift["shift_id"] if shift else None

    bio_code = emp.get("biometric_employee_code") or None

    record = await upsert_daily_attendance(employee_id, date_str, {
        "shift_id": shift_id, "status": status,
        "check_in": check_in, "check_out": check_out,
        "total_hours": None, "is_late": False, "late_minutes": 0,
        "notes": notes, "source": "manual",
        **({"biometric_employee_code": bio_code} if bio_code else {}),
    })
    return record


@api_router.get("/attendance/late-tracking")
async def get_late_tracking(
    request: Request,
    employee_id: Optional[str] = None,
    month: Optional[str] = None
):
    """Get monthly late tracking data for an employee."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    if not employee_id:
        if not my_emp:
            raise HTTPException(400, "employee_id required")
        employee_id = my_emp["employee_id"]

    if not is_admin and (not my_emp or my_emp["employee_id"] != employee_id):
        raise HTTPException(403, "Access denied")

    query: dict = {"employee_id": employee_id}
    if month:
        query["month"] = datetime.strptime(month, "%Y-%m-%d").strftime("%Y-%m-01")

    records = await db.monthly_late_tracking.find(query, {"_id": 0}).sort("month", -1).to_list(24)
    return records


# ===================== OVERTIME ROUTES =====================

@api_router.get("/overtime/shift-info")
async def get_overtime_shift_info(request: Request, date: str):
    """Return the active shift info (including effective end_time) for the logged-in employee on a given date."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    if not my_emp:
        raise HTTPException(403, "Employee profile not found")
    try:
        date_dt = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    shift = await get_active_shift_for_date_async(my_emp["employee_id"], date_dt)
    if not shift:
        raise HTTPException(404, "No active shift found for this date")

    timings = get_shift_timings_for_date(shift, date_dt)
    return {
        "shift_id": shift["shift_id"],
        "shift_name": shift["shift_name"],
        "start_time": timings.get("start_time", shift["start_time"]),
        "end_time": timings.get("end_time", shift["end_time"]),
        "total_hours": timings.get("total_hours", shift.get("total_hours")),
    }


@api_router.get("/overtime/requests")
async def get_overtime_requests(
    request: Request,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    month: Optional[str] = None
):
    """Get overtime requests. Admin sees all, employee sees own."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    query: dict = {}
    if not is_admin:
        if not my_emp:
            return []
        query["employee_id"] = my_emp["employee_id"]
    elif employee_id:
        query["employee_id"] = employee_id

    if status and status != "All":
        query["status"] = status

    if month:
        m = month[:7] if len(month) >= 7 else month
        try:
            yr, mo = m.split("-")
            first_day = f"{yr}-{mo}-01"
            last_day = f"{yr}-{mo}-{cal_module.monthrange(int(yr), int(mo))[1]:02d}"
            query["date"] = {"$gte": first_day, "$lte": last_day}
        except Exception:
            pass

    ot_list = await db.overtime_requests.find(query, {"_id": 0}).sort("date", -1).to_list(500)

    # Enrich with employee info
    emp_cache: dict = {}
    for r in ot_list:
        eid = r["employee_id"]
        if eid not in emp_cache:
            e = await db.employees.find_one({"employee_id": eid}, {
                "_id": 0, "employee_id": 1, "first_name": 1, "last_name": 1,
                "profile_picture": 1, "department_name": 1, "job_position_name": 1,
                "basic_salary": 1
            })
            emp_cache[eid] = e
        r["employee"] = emp_cache.get(eid)

        if r.get("reviewed_by"):
            rev = await db.employees.find_one({"employee_id": r["reviewed_by"]}, {"_id": 0, "first_name": 1, "last_name": 1})
            r["reviewer_name"] = f"{rev['first_name']} {rev['last_name']}" if rev else None
        else:
            r["reviewer_name"] = None

    return ot_list


@api_router.post("/overtime/requests")
async def create_overtime_request(body: OvertimeRequestCreate, request: Request):
    """Submit an overtime request."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    if not my_emp:
        raise HTTPException(403, "Employee profile not found")

    # Reason validation
    if not body.reason or not body.reason.strip():
        raise HTTPException(400, "Reason is required")
    if len(body.reason) > 1000:
        raise HTTPException(400, "Reason must be 1000 characters or less")

    # Date validation — no future dates
    try:
        date_dt = datetime.strptime(body.date, "%Y-%m-%d")
        today_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    if date_dt > today_dt:
        raise HTTPException(400, "Cannot log overtime for future dates")

    # Duplicate check (one overtime per employee per day)
    existing_ot = await db.overtime_requests.find_one({
        "employee_id": my_emp["employee_id"], "date": body.date
    }, {"_id": 0})
    if existing_ot:
        raise HTTPException(400, "Overtime already logged for this date")

    # Cannot log on Leave or Absent days
    att = await db.daily_attendance.find_one({
        "employee_id": my_emp["employee_id"], "date": body.date
    }, {"_id": 0})
    if att and att.get("status") in ["Leave", "Absent"]:
        raise HTTPException(400, f"Cannot log overtime for a day marked as {att['status']}")

    # Get active shift
    shift = await get_active_shift_for_date_async(my_emp["employee_id"], date_dt)
    if not shift:
        raise HTTPException(400, "No active shift found for this date. Contact HR.")

    timings = get_shift_timings_for_date(shift, date_dt)
    shift_end_time = timings.get("end_time", shift.get("end_time", "18:00"))

    # Validate time format
    try:
        end_h, end_m = map(int, shift_end_time.split(":"))
        fh, fm = map(int, body.overtime_from.split(":"))
        th, tm = map(int, body.overtime_to.split(":"))
    except Exception:
        raise HTTPException(400, "Invalid time format. Use HH:MM")

    from_mins = fh * 60 + fm
    end_mins = end_h * 60 + end_m
    to_mins = th * 60 + tm
    to_mins_adj = to_mins if to_mins > from_mins else to_mins + 24 * 60

    if from_mins < end_mins:
        raise HTTPException(400, f"Overtime start time must be at or after shift end time ({shift_end_time})")
    if to_mins_adj <= from_mins:
        raise HTTPException(400, "Overtime end time must be after start time")

    # Calculate
    total_hours = calc_overtime_hours(body.overtime_from, body.overtime_to)
    basic_salary = float(my_emp.get("basic_salary") or 0)
    hourly_rate = calc_hourly_rate(basic_salary, body.date)
    overtime_pay = calc_overtime_pay(total_hours, hourly_rate)

    now = datetime.now(timezone.utc).isoformat()
    new_req = {
        "request_id": f"ot_{uuid.uuid4().hex[:12]}",
        "employee_id": my_emp["employee_id"],
        "date": body.date,
        "shift_id": shift["shift_id"],
        "shift_end_time": shift_end_time,
        "overtime_from": body.overtime_from,
        "overtime_to": body.overtime_to,
        "total_hours": total_hours,
        "hourly_rate": hourly_rate,
        "overtime_pay": overtime_pay,
        "reason": body.reason.strip(),
        "status": "Pending",
        "requested_at": now,
        "reviewed_by": None, "reviewed_at": None,
        "admin_notes": None,
        "created_at": now, "updated_at": now
    }
    await db.overtime_requests.insert_one(new_req)
    return {k: v for k, v in new_req.items() if k != "_id"}


@api_router.put("/overtime/requests/{request_id}/review")
async def review_overtime_request(request_id: str, body: OvertimeRequestReview, request: Request):
    """Admin approve or reject an overtime request."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can review overtime requests")

    if body.status not in ["Approved", "Rejected"]:
        raise HTTPException(400, "Status must be 'Approved' or 'Rejected'")

    existing = await db.overtime_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Overtime request not found")
    if existing["status"] != "Pending":
        raise HTTPException(400, "Only pending requests can be reviewed")

    reviewer_id = my_emp["employee_id"] if my_emp else None
    now = datetime.now(timezone.utc).isoformat()
    update = {
        "status": body.status, "reviewed_by": reviewer_id,
        "reviewed_at": now, "admin_notes": body.admin_notes or "",
        "updated_at": now
    }
    await db.overtime_requests.update_one({"request_id": request_id}, {"$set": update})
    return {**existing, **update}


# ===================== HOLIDAY ROUTES =====================

@api_router.get("/holidays")
async def get_holidays(request: Request, year: Optional[int] = None):
    """Get all holidays (any authenticated user can view)."""
    await get_current_user(request)
    query: dict = {}
    if year:
        query["date"] = {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}
    holidays = await db.holidays.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    return holidays


@api_router.post("/holidays")
async def create_holiday(body: HolidayCreate, request: Request):
    """Create a holiday. Admin department only."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can manage holidays")

    if not body.holiday_name.strip():
        raise HTTPException(400, "Holiday name is required")
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    existing = await db.holidays.find_one({"date": body.date})
    if existing:
        raise HTTPException(400, "A holiday already exists on this date")

    now = datetime.now(timezone.utc).isoformat()
    new_holiday = {
        "holiday_id": f"hol_{uuid.uuid4().hex[:10]}",
        "holiday_name": body.holiday_name.strip(),
        "date": body.date,
        "created_by": my_emp["employee_id"] if my_emp else None,
        "created_at": now, "updated_at": now
    }
    await db.holidays.insert_one(new_holiday)
    return {k: v for k, v in new_holiday.items() if k != "_id"}


@api_router.put("/holidays/{holiday_id}")
async def update_holiday(holiday_id: str, body: HolidayCreate, request: Request):
    """Update a holiday. Admin department only."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can manage holidays")

    existing = await db.holidays.find_one({"holiday_id": holiday_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Holiday not found")

    if not body.holiday_name.strip():
        raise HTTPException(400, "Holiday name is required")
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    # Unique date check (exclude current holiday)
    conflict = await db.holidays.find_one({"date": body.date, "holiday_id": {"$ne": holiday_id}})
    if conflict:
        raise HTTPException(400, "A holiday already exists on this date")

    now = datetime.now(timezone.utc).isoformat()
    update = {"holiday_name": body.holiday_name.strip(), "date": body.date, "updated_at": now}
    await db.holidays.update_one({"holiday_id": holiday_id}, {"$set": update})
    return {**existing, **update}


@api_router.delete("/holidays/{holiday_id}")
async def delete_holiday(holiday_id: str, request: Request):
    """Delete a holiday. Admin department only."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can manage holidays")

    existing = await db.holidays.find_one({"holiday_id": holiday_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Holiday not found")

    await db.holidays.delete_one({"holiday_id": holiday_id})
    return {"message": "Holiday deleted successfully"}


# ===================== PAYROLL ROUTES =====================

@api_router.get("/payroll/calculate")
async def get_payroll_calculate(request: Request, employee_id: Optional[str] = None, month: Optional[str] = None):
    """
    Calculate detailed payroll for one employee for a given month.
    Admin can query any employee; non-admin can only query themselves.
    """
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    # Determine target employee
    if not employee_id:
        if not my_emp:
            raise HTTPException(400, "employee_id required")
        employee_id = my_emp["employee_id"]
    elif not is_admin and (not my_emp or employee_id != my_emp["employee_id"]):
        raise HTTPException(403, "Cannot view other employees' payroll")

    # Default: previous month
    if not month:
        today = datetime.now()
        first = today.replace(day=1)
        prev = first - timedelta(days=1)
        month = prev.strftime("%Y-%m")

    return await calculate_monthly_payroll_fn(employee_id, month)


@api_router.get("/payroll/summary")
async def get_payroll_summary(
    request: Request,
    month: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None
):
    """
    Calculate payroll summary for ALL employees for a given month.
    Admin department only.
    """
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can view payroll summary")

    if not month:
        today = datetime.now()
        first = today.replace(day=1)
        prev = first - timedelta(days=1)
        month = prev.strftime("%Y-%m")

    # Fetch active employees
    emp_query: dict = {"status": "Active"}
    if department:
        emp_query["department_name"] = department
    if search:
        emp_query["$or"] = [
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"employee_id": {"$regex": search, "$options": "i"}}
        ]

    employees_list = await db.employees.find(emp_query, {"_id": 0}).to_list(500)

    # Calculate payroll for all employees in parallel
    import asyncio as _asyncio
    results = await _asyncio.gather(
        *[calculate_monthly_payroll_fn(e["employee_id"], month) for e in employees_list],
        return_exceptions=True
    )

    summary = []
    for r in results:
        if isinstance(r, Exception):
            continue
        summary.append({
            "employee_id": r["employee_id"],
            "employee": r["employee"],
            "month": r["month"],
            "basic_salary": r["earnings"]["basic_salary"],
            "gross_earnings": r["earnings"]["gross_earnings"],
            "total_deductions": r["deductions"]["total_deductions"],
            "net_salary": r["net_salary"],
        })

    summary.sort(key=lambda x: x.get("employee", {}).get("first_name", "") or "")
    return summary


app.include_router(api_router)

@api_router.get("/wfh/usage")
async def get_wfh_usage(
    request: Request,
    employee_id: Optional[str] = None,
    month: Optional[str] = None
):
    """Get WFH usage for employee for the specified month (default: current month)."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    # Determine target employee
    if not employee_id:
        if not my_emp:
            raise HTTPException(400, "employee_id required")
        employee_id = my_emp["employee_id"]
    elif employee_id != (my_emp["employee_id"] if my_emp else None) and not is_admin:
        raise HTTPException(403, "Cannot view other employees' WFH usage")

    month_str = month[:7] + "-01" if month and len(month) >= 7 else datetime.now().strftime("%Y-%m-01")
    tracking = await get_wfh_usage_for_month(employee_id, month_str)
    return {
        "employee_id": employee_id,
        "month": month_str,
        "wfh_days_used": tracking.get("wfh_days_used", 0),
        "wfh_dates": tracking.get("wfh_dates", []),
        "monthly_limit": WFH_MONTHLY_LIMIT
    }


@api_router.get("/wfh/requests")
async def get_wfh_requests(
    request: Request,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    month: Optional[str] = None
):
    """Get WFH requests. Admin sees all, employee sees own."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")

    query: dict = {}
    if not is_admin:
        if not my_emp:
            return []
        query["employee_id"] = my_emp["employee_id"]
    elif employee_id:
        query["employee_id"] = employee_id

    if status and status != "All":
        query["status"] = status

    if month:
        m = month[:7] if len(month) >= 7 else month
        try:
            yr, mo = m.split("-")
            first_day = f"{yr}-{mo}-01"
            last_day = f"{yr}-{mo}-{cal_module.monthrange(int(yr), int(mo))[1]:02d}"
            query["$and"] = [
                {"from_date": {"$lte": last_day}},
                {"to_date": {"$gte": first_day}}
            ]
        except Exception:
            pass

    requests_list = await db.wfh_requests.find(query, {"_id": 0}).sort("requested_at", -1).to_list(500)

    # Enrich with employee info
    emp_cache: dict = {}
    for r in requests_list:
        eid = r["employee_id"]
        if eid not in emp_cache:
            e = await db.employees.find_one({"employee_id": eid}, {
                "_id": 0, "employee_id": 1, "first_name": 1, "last_name": 1,
                "profile_picture": 1, "department_name": 1, "job_position_name": 1
            })
            emp_cache[eid] = e
        r["employee"] = emp_cache.get(eid)

        if r.get("reviewed_by"):
            rev = await db.employees.find_one({"employee_id": r["reviewed_by"]}, {"_id": 0, "first_name": 1, "last_name": 1})
            r["reviewer_name"] = f"{rev['first_name']} {rev['last_name']}" if rev else None
        else:
            r["reviewer_name"] = None

        # Add current month usage for admin view
        from_month = r["from_date"][:7] + "-01"
        usage = await get_wfh_usage_for_month(r["employee_id"], from_month)
        r["employee_wfh_used"] = usage.get("wfh_days_used", 0)

    return requests_list


@api_router.post("/wfh/requests")
async def create_wfh_request(body: WFHRequestCreate, request: Request):
    """Submit a WFH request."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    if not my_emp:
        raise HTTPException(403, "Employee profile not found")

    # WFH eligibility check
    if not my_emp.get("wfh_eligible"):
        raise HTTPException(403, "You are not eligible to request WFH")

    # Reason validation
    if not body.reason or not body.reason.strip():
        raise HTTPException(400, "Reason is required")
    if len(body.reason) > 1000:
        raise HTTPException(400, "Reason must be 1000 characters or less")

    # Date validation
    try:
        from_dt = datetime.strptime(body.from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(body.to_date, "%Y-%m-%d")
        today_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    if from_dt < today_dt:
        raise HTTPException(400, "Cannot request WFH for past dates")
    if to_dt < from_dt:
        raise HTTPException(400, "To date must be >= From date")
    if from_dt.weekday() == 6:
        raise HTTPException(400, "Cannot request WFH starting on Sunday")

    # Overlapping request check
    overlapping = await db.wfh_requests.find_one({
        "employee_id": my_emp["employee_id"], "status": {"$in": ["Pending", "Approved"]},
        "from_date": {"$lte": body.to_date}, "to_date": {"$gte": body.from_date}
    }, {"_id": 0})
    if overlapping:
        raise HTTPException(400, "You already have a WFH request for overlapping dates")

    # Check holiday validation (from_date must not be a holiday)
    if from_dt.weekday() != 6:  # already checked Sunday above
        hn = await is_holiday_db(body.from_date)
        if hn:
            raise HTTPException(400, f"Cannot request WFH on a public holiday: {hn}")

    # Fetch holidays in range to exclude from working day count
    holiday_dates = await get_holidays_in_range_db(body.from_date, body.to_date)

    # Calculate total working days (excluding Sundays AND holidays)
    total_days = calc_working_days_between(body.from_date, body.to_date, exclude_dates=holiday_dates)
    if total_days == 0:
        raise HTTPException(400, "No working days in selected range (all Sundays/holidays)")

    # Monthly limit check
    month_str = from_dt.strftime("%Y-%m-01")
    usage = await get_wfh_usage_for_month(my_emp["employee_id"], month_str)
    current_usage = usage.get("wfh_days_used", 0)
    exceeds_limit = (current_usage + total_days) > WFH_MONTHLY_LIMIT

    now = datetime.now(timezone.utc).isoformat()
    new_req = {
        "request_id": f"wfh_{uuid.uuid4().hex[:12]}",
        "employee_id": my_emp["employee_id"],
        "from_date": body.from_date, "to_date": body.to_date,
        "total_days": total_days,
        "reason": body.reason.strip(),
        "status": "Pending",
        "exceeds_limit": exceeds_limit,
        "approved_days": None, "rejected_days": None,
        "requested_at": now, "reviewed_by": None, "reviewed_at": None,
        "admin_notes": None, "cancelled_at": None,
        "created_at": now, "updated_at": now
    }
    await db.wfh_requests.insert_one(new_req)
    # Fire-and-forget Slack notification (does not block or fail the request)
    try:
        await notify_wfh_submitted(new_req, my_emp)
    except Exception:  # noqa: BLE001
        pass
    return {k: v for k, v in new_req.items() if k != "_id"}


@api_router.put("/wfh/requests/{request_id}/review")
async def review_wfh_request(request_id: str, body: WFHRequestReview, request: Request):
    """Admin approve (full or partial) or reject a WFH request."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )
    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin:
        raise HTTPException(403, "Only Admin department can review WFH requests")

    if body.status not in ["Approved", "Rejected"]:
        raise HTTPException(400, "Status must be 'Approved' or 'Rejected'")

    existing = await db.wfh_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "WFH request not found")
    if existing["status"] != "Pending":
        raise HTTPException(400, "Only pending requests can be reviewed")

    reviewer_id = my_emp["employee_id"] if my_emp else None
    now = datetime.now(timezone.utc).isoformat()

    update: dict = {
        "status": body.status, "reviewed_by": reviewer_id,
        "reviewed_at": now, "admin_notes": body.admin_notes or "",
        "updated_at": now
    }

    if body.status == "Approved":
        all_dates = get_dates_in_range(existing["from_date"], existing["to_date"])
        if body.approved_days:
            # Partial approval — only approve selected dates
            approved_dates = [d for d in body.approved_days if d in all_dates]
            rejected_dates = [d for d in all_dates if d not in approved_dates]
        else:
            # Full approval
            approved_dates = all_dates
            rejected_dates = []

        update["approved_days"] = approved_dates
        update["rejected_days"] = rejected_dates

        if approved_dates:
            await update_wfh_tracking_fn(existing["employee_id"], approved_dates)
            await mark_wfh_in_attendance_fn(existing["employee_id"], approved_dates)

    await db.wfh_requests.update_one({"request_id": request_id}, {"$set": update})
    return {**existing, **update}


@api_router.put("/wfh/requests/{request_id}/cancel")
async def cancel_wfh_request(request_id: str, request: Request):
    """Cancel a WFH request (employee own pending/approved, or admin)."""
    user = await get_current_user(request)
    my_emp = await db.employees.find_one(
        {"work_email": {"$regex": f"^{user['email']}$", "$options": "i"}}, {"_id": 0}
    )

    existing = await db.wfh_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "WFH request not found")

    is_admin = user.get("is_admin") or (my_emp and my_emp.get("department_name") == "Admin")
    if not is_admin and (not my_emp or existing["employee_id"] != my_emp["employee_id"]):
        raise HTTPException(403, "You can only cancel your own WFH requests")

    if existing["status"] not in ["Pending", "Approved"]:
        raise HTTPException(400, "Only Pending or Approved requests can be cancelled")

    if existing["status"] == "Approved":
        today_str = datetime.now().strftime("%Y-%m-%d")
        if existing["from_date"] < today_str:
            raise HTTPException(400, "Cannot cancel a WFH request that has already started")
        # Remove from WFH tracking
        approved_dates = existing.get("approved_days") or get_dates_in_range(existing["from_date"], existing["to_date"])
        await remove_wfh_tracking_fn(existing["employee_id"], approved_dates)
        # Remove WFH attendance records
        await db.daily_attendance.delete_many({
            "employee_id": existing["employee_id"], "status": "WFH",
            "date": {"$in": approved_dates}
        })

    now = datetime.now(timezone.utc).isoformat()
    update = {"status": "Cancelled", "cancelled_at": now, "updated_at": now}
    await db.wfh_requests.update_one({"request_id": request_id}, {"$set": update})
    return {**existing, **update}


app.include_router(api_router)


# Custom CORS middleware that always reflects the request Origin back.
# This is required because allow_credentials=True is incompatible with
# allow_origins=["*"] per the CORS spec — browsers block it.
# By echoing the exact Origin header, cookies work on any frontend domain.
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

class ReflectOriginCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        origin = request.headers.get("origin", "")

        # Handle preflight OPTIONS request
        if request.method == "OPTIONS":
            response = StarletteResponse(status_code=204)
            if origin:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Cookie, X-Requested-With"
            response.headers["Access-Control-Max-Age"] = "86400"
            response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
            return response

        response = await call_next(request)

        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Cookie, X-Requested-With"

        response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
        return response

app.add_middleware(ReflectOriginCORSMiddleware)


# ===================== SCHEDULED JOBS =====================
# Automates monthly paid-leave credit (1st of every month) and annual reset (Jan 1).
# Runs in-process via APScheduler — no external cron needed.
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")  # GrowItUp is India-based

async def _scheduled_monthly_credit():
    try:
        n = await auto_credit_monthly_leave()
        logging.info(f"[Scheduler] Monthly paid-leave credit complete: {n} employees credited.")
    except Exception as exc:  # noqa: BLE001
        logging.error(f"[Scheduler] Monthly credit failed: {exc}")

async def _scheduled_yearly_reset():
    try:
        n = await auto_reset_yearly_leave()
        logging.info(f"[Scheduler] Yearly leave reset complete: {n} non-zero balances reset to 0.")
    except Exception as exc:  # noqa: BLE001
        logging.error(f"[Scheduler] Yearly reset failed: {exc}")


async def _create_indexes():
    """Create MongoDB indexes for fast lookups. Safe to call on every startup (idempotent)."""
    await asyncio.gather(
        # Auth — hit on every single API request
        db.user_sessions.create_index("session_token", unique=True, background=True),
        db.user_sessions.create_index("expires_at", background=True),
        db.users.create_index("user_id", unique=True, background=True),
        db.users.create_index("email", background=True),

        # Employees
        db.employees.create_index("employee_id", unique=True, background=True),
        db.employees.create_index("work_email", background=True),
        db.employees.create_index("status", background=True),
        db.employees.create_index("department_id", background=True),
        db.employees.create_index("department_name", background=True),

        # Attendance — most queried collection
        db.daily_attendance.create_index([("employee_id", 1), ("date", -1)], background=True),
        db.daily_attendance.create_index("date", background=True),

        # Leave
        db.leave_requests.create_index([("employee_id", 1), ("status", 1)], background=True),
        db.leave_requests.create_index("status", background=True),

        # Overtime
        db.overtime_requests.create_index([("employee_id", 1), ("status", 1)], background=True),

        # WFH & late tracking (month-keyed lookups)
        db.wfh_tracking.create_index([("employee_id", 1), ("month_key", 1)], unique=True, background=True),
        db.monthly_late_tracking.create_index([("employee_id", 1), ("month_key", 1)], unique=True, background=True),

        # Performance
        db.performance.create_index("employee_id", background=True),
        db.performance.create_index("notion_database_id", background=True),

        # Payroll
        db.payroll.create_index([("employee_id", 1), ("month", -1)], background=True),

        # Leave balances
        db.leave_balances.create_index("employee_id", unique=True, background=True),
    )
    logger.info("[Startup] MongoDB indexes created/verified.")


@app.on_event("startup")
async def _start_scheduler():
    await _create_indexes()
    # Monthly: run at 00:05 on day 1 of every month
    scheduler.add_job(
        _scheduled_monthly_credit,
        CronTrigger(day=1, hour=0, minute=5),
        id="monthly_paid_leave_credit",
        replace_existing=True,
        misfire_grace_time=60 * 60,  # 1hr grace in case of container restart near the minute
    )
    # Yearly: run at 00:00 on January 1
    scheduler.add_job(
        _scheduled_yearly_reset,
        CronTrigger(month=1, day=1, hour=0, minute=0),
        id="yearly_leave_reset",
        replace_existing=True,
        misfire_grace_time=60 * 60,
    )
    scheduler.start()
    logging.info("[Scheduler] Started with jobs: monthly_paid_leave_credit (day=1 00:05 IST), yearly_leave_reset (Jan 1 00:00 IST)")


@app.on_event("shutdown")
async def _stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
