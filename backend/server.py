from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import requests as http_requests
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

ADMIN_EMAIL = "info.growitup@gmail.com"
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ===================== MODELS =====================

class SessionExchange(BaseModel):
    session_id: str

class DepartmentCreate(BaseModel):
    department_name: str

class JobPositionCreate(BaseModel):
    position_name: str
    department_id: str
    has_levels: bool = False
    available_levels: List[str] = []

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

@api_router.post("/auth/session")
async def exchange_session(body: SessionExchange, response: Response):
    try:
        headers = {"X-Session-ID": body.session_id}
        r = http_requests.get(EMERGENT_AUTH_URL, headers=headers, timeout=10)
        if r.status_code != 200:
            raise HTTPException(400, "Invalid session ID")
        data = r.json()
    except http_requests.RequestException as e:
        raise HTTPException(500, f"Auth service error: {str(e)}")

    email = data.get("email", "")
    name = data.get("name", "")
    picture = data.get("picture")
    session_token = data.get("session_token")

    is_admin = (email.lower() == ADMIN_EMAIL.lower())
    if not is_admin:
        employee = await db.employees.find_one(
            {"work_email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0}
        )
        if not employee:
            raise HTTPException(403, "Access denied. Contact admin.")

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
    return await get_current_user(request)


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
    await db.departments.update_one({"department_id": dept_id}, {"$set": {"department_name": body.department_name}})
    await db.employees.update_many({"department_id": dept_id}, {"$set": {"department_name": body.department_name}})
    await db.job_positions.update_many({"department_id": dept_id}, {"$set": {"department_name": body.department_name}})
    return {**existing, "department_name": body.department_name}


@api_router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, request: Request):
    await get_current_user(request)
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
async def get_employees(request: Request, search: Optional[str] = None, status: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if status and status != "All":
        query["status"] = status
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

    update = {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.employees.update_one({"employee_id": emp_id}, {"$set": update})
    return {**existing, **update}


@api_router.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str, request: Request):
    await get_current_user(request)
    emp = await db.employees.find_one({"employee_id": emp_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employee not found")
    await db.employees.delete_one({"employee_id": emp_id})
    return {"message": "Deleted"}


# ===================== SEED ROUTE =====================

@api_router.post("/seed")
async def seed_data():
    count = await db.departments.count_documents({})
    if count > 0:
        return {"message": "Already seeded"}

    now = datetime.now(timezone.utc).isoformat()

    depts = [
        {"department_id": "dept_operations", "department_name": "Operations", "created_at": now},
        {"department_id": "dept_sales", "department_name": "Sales", "created_at": now},
        {"department_id": "dept_admin", "department_name": "Admin", "created_at": now},
    ]
    await db.departments.insert_many(depts)

    positions = [
        {"position_id": "pos_video_editor", "position_name": "Video Editor", "department_id": "dept_operations", "department_name": "Operations", "has_levels": True, "available_levels": ["Beginner", "Intermediate", "Advanced"], "created_at": now},
        {"position_id": "pos_thumbnail_designer", "position_name": "Thumbnail Designer", "department_id": "dept_operations", "department_name": "Operations", "has_levels": True, "available_levels": ["Beginner", "Intermediate", "Advanced"], "created_at": now},
        {"position_id": "pos_script_writer", "position_name": "Script Writer", "department_id": "dept_operations", "department_name": "Operations", "has_levels": False, "available_levels": [], "created_at": now},
        {"position_id": "pos_manager", "position_name": "Manager", "department_id": "dept_operations", "department_name": "Operations", "has_levels": False, "available_levels": [], "created_at": now},
        {"position_id": "pos_sales_rep", "position_name": "Sales Representative", "department_id": "dept_sales", "department_name": "Sales", "has_levels": False, "available_levels": [], "created_at": now},
        {"position_id": "pos_sales_manager", "position_name": "Sales Manager", "department_id": "dept_sales", "department_name": "Sales", "has_levels": False, "available_levels": [], "created_at": now},
        {"position_id": "pos_director", "position_name": "Director/CEO/COO", "department_id": "dept_admin", "department_name": "Admin", "has_levels": False, "available_levels": [], "created_at": now},
        {"position_id": "pos_hr_manager", "position_name": "HR Manager", "department_id": "dept_admin", "department_name": "Admin", "has_levels": False, "available_levels": [], "created_at": now},
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


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
