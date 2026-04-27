from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import re
import requests as http_requests
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import logging
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

ADMIN_EMAIL = "info.growitup@gmail.com"
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')


class GoogleAuth(BaseModel):
    credential: dict  # userinfo dict from Google (email, name, picture, sub)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
    client_performance_notes: Optional[str] = None  # Optional, max 500 chars
    client_feedback_notes: Optional[str] = None  # Optional, max 500 chars
    creative_task_notes: Optional[str] = None  # Optional, max 500 chars


# ===================== HELPERS =====================

async def get_current_user(request: Request):
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            session_token = auth[7:]
    if not session_token:
        raise HTTPException(401, "Not authenticated")

    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def get_next_employee_id():
    employees = await db.employees.find({}, {"employee_id": 1, "_id": 0}).to_list(10000)
    max_num = 0
    for emp in employees:
        eid = emp.get("employee_id", "")
        if eid.startswith("GM"):
            try:
                num = int(eid[2:])
                max_num = max(max_num, num)
            except Exception:
                pass
    return f"GM{str(max_num + 1).zfill(3)}"


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
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", path="/", max_age=604800
    )

    return {"user": {
        "user_id": user_id, "email": email, "name": name,
        "picture": picture, "is_admin": is_admin
    }}


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

    emp_id = await get_next_employee_id()
    now = datetime.now(timezone.utc).isoformat()
    emp = {"employee_id": emp_id, **body.model_dump(), "created_at": now, "updated_at": now}
    await db.employees.insert_one(emp)
    return {k: v for k, v in emp.items() if k != "_id"}


@api_router.put("/employees/{emp_id}")
async def update_employee(emp_id: str, body: EmployeeCreate, request: Request):
    await get_current_user(request)
    existing = await db.employees.find_one({"employee_id": emp_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Employee not found")
    dup = await db.employees.find_one({
        "work_email": {"$regex": f"^{body.work_email}$", "$options": "i"},
        "employee_id": {"$ne": emp_id}
    }, {"_id": 0})
    if dup:
        raise HTTPException(400, "Work email already in use by another employee")

    old_email = existing.get("work_email", "")
    new_email = body.work_email
    email_changed = old_email.lower() != new_email.lower()

    update = {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.employees.update_one({"employee_id": emp_id}, {"$set": update})

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
    
    # Validate notes length (optional fields)
    if body.client_performance_notes and len(body.client_performance_notes) > 500:
        raise HTTPException(400, "Client performance notes must be 500 characters or less")
    if body.client_feedback_notes and len(body.client_feedback_notes) > 500:
        raise HTTPException(400, "Client feedback notes must be 500 characters or less")
    if body.creative_task_notes and len(body.creative_task_notes) > 500:
        raise HTTPException(400, "Creative task notes must be 500 characters or less")
    
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
        "client_performance_notes": body.client_performance_notes or "",
        "client_feedback_notes": body.client_feedback_notes or "",
        "creative_task_notes": body.creative_task_notes or "",
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
    
    # Validate notes length (optional fields)
    if body.client_performance_notes and len(body.client_performance_notes) > 500:
        raise HTTPException(400, "Client performance notes must be 500 characters or less")
    if body.client_feedback_notes and len(body.client_feedback_notes) > 500:
        raise HTTPException(400, "Client feedback notes must be 500 characters or less")
    if body.creative_task_notes and len(body.creative_task_notes) > 500:
        raise HTTPException(400, "Creative task notes must be 500 characters or less")
    
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
            "client_performance_notes": body.client_performance_notes or "",
            "client_feedback_notes": body.client_feedback_notes or "",
            "creative_task_notes": body.creative_task_notes or "",
            "total_points_month": total_points_month,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    updated = await db.manager_performance.find_one({"perf_id": perf_id}, {"_id": 0})
    return updated


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
