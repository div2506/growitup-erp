"""
Run once to populate the DB with realistic dummy data.
  python seed_dummy.py
"""
import asyncio, uuid, random
from datetime import datetime, timedelta, timezone, date
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os, calendar

load_dotenv(Path(__file__).parent / ".env")
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

# ── helpers ──────────────────────────────────────────────────────────────────
def uid(): return str(uuid.uuid4())
def today(): return date.today().isoformat()
def dstr(d): return d.isoformat()

AVATARS = [
    "https://api.dicebear.com/7.x/avataaars/svg?seed=",
]
def avatar(name): return f"https://api.dicebear.com/7.x/initials/svg?seed={name.replace(' ','')}&backgroundColor=2F2F2F"

# ── seed ─────────────────────────────────────────────────────────────────────
async def seed():
    print("Clearing existing data (except users/sessions)…")
    for col in [
        "departments","job_positions","teams","employees","shifts",
        "holidays","leave_balances","leave_requests","overtime_requests",
        "wfh_requests","wfh_tracking","daily_attendance","monthly_late_tracking",
        "payroll","performance","manager_performance","notion_databases",
    ]:
        await db[col].delete_many({})

    # ── DEPARTMENTS ───────────────────────────────────────────────────────────
    dept_data = [
        ("Admin",           True),
        ("Human Resource",  True),
        ("Creative",        False),
        ("Marketing",       False),
        ("Technology",      False),
        ("Finance",         False),
    ]
    depts = []
    for dname, is_sys in dept_data:
        doc = {"department_id": uid(), "department_name": dname, "is_system": is_sys,
               "created_at": datetime.now(timezone.utc).isoformat()}
        await db.departments.insert_one(doc)
        depts.append(doc)
    print(f"  {len(depts)} departments")
    dept_map = {d["department_name"]: d for d in depts}

    # ── JOB POSITIONS ─────────────────────────────────────────────────────────
    pos_data = [
        ("HR Manager",        "Human Resource",  True,  False, []),
        ("HR Executive",      "Human Resource",  False, False, []),
        ("Video Editor",      "Creative",        False, True,  ["Beginner","Intermediate","Advanced"]),
        ("Thumbnail Designer","Creative",        False, True,  ["Beginner","Intermediate","Advanced"]),
        ("Script Writer",     "Creative",        False, True,  ["Beginner","Intermediate","Advanced"]),
        ("Team Lead",         "Creative",        False, False, []),
        ("Marketing Manager", "Marketing",       False, False, []),
        ("SEO Specialist",    "Marketing",       False, False, []),
        ("Developer",         "Technology",      False, True,  ["Junior","Mid","Senior"]),
        ("Accounts Manager",  "Finance",         False, False, []),
        ("Admin Executive",   "Admin",           True,  False, []),
    ]
    positions = []
    for pname, dname, is_sys, has_lvl, levels in pos_data:
        d = dept_map.get(dname, depts[0])
        doc = {
            "position_id": uid(), "position_name": pname,
            "department_id": d["department_id"], "department_name": d["department_name"],
            "has_levels": has_lvl, "available_levels": levels,
            "is_system": is_sys, "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.job_positions.insert_one(doc)
        positions.append(doc)
    print(f"  {len(positions)} job positions")
    pos_map = {p["position_name"]: p for p in positions}

    # ── SHIFTS ────────────────────────────────────────────────────────────────
    shift_docs = [
        {"shift_name": "Morning Shift",   "start_time": "09:00", "end_time": "18:00", "break_duration": 60,  "is_system_default": True},
        {"shift_name": "Evening Shift",   "start_time": "13:00", "end_time": "22:00", "break_duration": 60,  "is_system_default": False},
        {"shift_name": "Half Day",        "start_time": "09:00", "end_time": "13:00", "break_duration": 0,   "is_system_default": False},
    ]
    shifts = []
    for s in shift_docs:
        s["shift_id"] = uid()
        s["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.shifts.insert_one(s)
        shifts.append(s)
    default_shift = shifts[0]
    print(f"  {len(shifts)} shifts")

    # ── TEAMS ─────────────────────────────────────────────────────────────────
    team_names = ["Alpha Team", "Beta Team", "Gamma Team"]
    teams = []
    for tname in team_names:
        doc = {"team_id": uid(), "team_name": tname, "team_manager_id": None,
               "created_at": datetime.now(timezone.utc).isoformat()}
        await db.teams.insert_one(doc)
        teams.append(doc)
    print(f"  {len(teams)} teams")

    # ── HOLIDAYS ──────────────────────────────────────────────────────────────
    yr = date.today().year
    holiday_list = [
        (f"{yr}-01-26", "Republic Day"),
        (f"{yr}-03-25", "Holi"),
        (f"{yr}-04-14", "Dr. Ambedkar Jayanti"),
        (f"{yr}-08-15", "Independence Day"),
        (f"{yr}-10-02", "Gandhi Jayanti"),
        (f"{yr}-10-24", "Dussehra"),
        (f"{yr}-11-01", "Diwali"),
        (f"{yr}-12-25", "Christmas"),
    ]
    for hdate, hname in holiday_list:
        await db.holidays.insert_one({
            "holiday_id": uid(), "holiday_date": hdate, "holiday_name": hname,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    print(f"  {len(holiday_list)} holidays")

    # ── EMPLOYEES ─────────────────────────────────────────────────────────────
    emp_blueprints = [
        # (first, last, dept, position, level, salary, type, joining, team_idx)
        ("Rahul",   "Sharma",    "Admin",         "Admin Executive",    None,          55000, "Full-Time", f"{yr-2}-01-15", None),
        ("Priya",   "Patel",     "Human Resource","HR Manager",         None,          70000, "Full-Time", f"{yr-2}-03-10", None),
        ("Anjali",  "Singh",     "Human Resource","HR Executive",       None,          45000, "Full-Time", f"{yr-1}-06-01", None),
        ("Vikram",  "Mehta",     "Creative",      "Team Lead",          None,          80000, "Full-Time", f"{yr-2}-05-20", 0),
        ("Sneha",   "Joshi",     "Creative",      "Video Editor",       "Intermediate",55000, "Full-Time", f"{yr-1}-02-14", 0),
        ("Arjun",   "Verma",     "Creative",      "Video Editor",       "Beginner",    40000, "Full-Time", f"{yr}-01-10", 0),
        ("Kavya",   "Reddy",     "Creative",      "Thumbnail Designer", "Advanced",    60000, "Full-Time", f"{yr-1}-07-01", 1),
        ("Rohan",   "Kumar",     "Creative",      "Thumbnail Designer", "Beginner",    38000, "Full-Time", f"{yr}-02-01", 1),
        ("Meera",   "Nair",      "Creative",      "Script Writer",      "Intermediate",52000, "Full-Time", f"{yr-1}-09-15", 2),
        ("Siddharth","Gupta",    "Marketing",     "Marketing Manager",  None,          75000, "Full-Time", f"{yr-2}-11-01", None),
        ("Divya",   "Agarwal",   "Marketing",     "SEO Specialist",     None,          48000, "Full-Time", f"{yr-1}-04-20", None),
        ("Karan",   "Malhotra",  "Technology",    "Developer",          "Mid",         90000, "Full-Time", f"{yr-1}-08-05", None),
        ("Nisha",   "Iyer",      "Finance",       "Accounts Manager",   None,          65000, "Full-Time", f"{yr-2}-07-12", None),
    ]

    employees = []
    for idx, (fn, ln, dname, pname, level, sal, etype, jdate, tidx) in enumerate(emp_blueprints, 1):
        d = dept_map[dname]
        p = pos_map[pname]
        eid = f"GM{idx:03d}"
        team_list = [teams[tidx]["team_id"]] if tidx is not None else []
        doc = {
            "employee_id": eid,
            "first_name": fn, "last_name": ln,
            "personal_email": f"{fn.lower()}.{ln.lower()}@gmail.com",
            "work_email": f"{fn.lower()}.{ln.lower()}@growitup.com",
            "phone": f"9{random.randint(100000000,999999999)}",
            "date_of_birth": f"{random.randint(1990,1998)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "gender": random.choice(["Male","Female"]),
            "qualification": random.choice(["B.Com","BBA","MBA","B.Tech","BA"]),
            "address": f"{random.randint(1,200)}, MG Road",
            "country": "India", "state_id": "MH", "state_name": "Maharashtra",
            "city_id": "MUM", "city_name": "Mumbai", "zipcode": "400001",
            "emergency_contact_name": "Parent",
            "emergency_contact_number": f"9{random.randint(100000000,999999999)}",
            "emergency_contact_relation": "Parent",
            "department_id": d["department_id"], "department_name": d["department_name"],
            "job_position_id": p["position_id"], "job_position_name": p["position_name"],
            "level": level,
            "reporting_manager_id": None, "reporting_manager_name": None,
            "employee_type": etype,
            "joining_date": jdate,
            "basic_salary": sal,
            "bank_name": random.choice(["HDFC Bank","ICICI Bank","SBI"]),
            "account_name": f"{fn} {ln}",
            "account_number": str(random.randint(10000000000, 99999999999)),
            "ifsc_code": "HDFC0001234",
            "profile_picture": avatar(f"{fn} {ln}"),
            "status": "Active",
            "teams": team_list,
            "shift_id": default_shift["shift_id"],
            "paid_leave_eligible": True,
            "wfh_eligible": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.employees.insert_one(doc)
        employees.append(doc)

    # assign team managers
    await db.teams.update_one({"team_id": teams[0]["team_id"]}, {"$set": {"team_manager_id": employees[3]["employee_id"]}})
    await db.teams.update_one({"team_id": teams[1]["team_id"]}, {"$set": {"team_manager_id": employees[3]["employee_id"]}})

    # set reporting manager for creative employees → Vikram
    mgr = employees[3]
    for emp in employees[4:9]:
        await db.employees.update_one(
            {"employee_id": emp["employee_id"]},
            {"$set": {"reporting_manager_id": mgr["employee_id"], "reporting_manager_name": f"{mgr['first_name']} {mgr['last_name']}"}}
        )
    print(f"  {len(employees)} employees")

    # ── LEAVE BALANCES ────────────────────────────────────────────────────────
    for emp in employees:
        await db.leave_balances.insert_one({
            "employee_id": emp["employee_id"],
            "paid_leave_balance": round(random.uniform(2, 12), 1),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    # ── ATTENDANCE — last 30 days ─────────────────────────────────────────────
    statuses = ["Present","Present","Present","Present","Present","Half Day","WFH","Leave","Absent"]
    att_docs = []
    late_tracking = {}  # (emp_id, month) → count

    for emp in employees:
        shift = default_shift
        shift_start_h, shift_start_m = map(int, shift["start_time"].split(":"))

        for offset in range(30, 0, -1):
            d = date.today() - timedelta(days=offset)
            if d.weekday() >= 5:   # skip weekends
                continue
            diso = dstr(d)
            month_key = diso[:7] + "-01"
            st = random.choice(statuses)

            is_late = False
            late_minutes = 0
            check_in = None
            check_out = None
            total_hours = 0.0

            if st in ("Present", "Half Day", "WFH"):
                late_chance = random.random()
                if late_chance < 0.15:
                    late_minutes = random.randint(5, 45)
                    is_late = True
                ci_h = shift_start_h + (late_minutes // 60)
                ci_m = shift_start_m + (late_minutes % 60)
                check_in = f"{ci_h:02d}:{ci_m:02d}"
                check_out = "18:00" if st != "Half Day" else "13:00"
                total_hours = 8.0 if st != "Half Day" else 4.0
                if is_late:
                    key = (emp["employee_id"], month_key)
                    late_tracking[key] = late_tracking.get(key, 0) + 1

            att_id = uid()
            att_docs.append({
                "attendance_id": att_id,
                "employee_id": emp["employee_id"],
                "date": diso, "status": st,
                "check_in": check_in, "check_out": check_out,
                "total_hours": total_hours,
                "is_late": is_late, "late_minutes": late_minutes,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    if att_docs:
        # Skip records that already exist (same employee_id + date)
        inserted = 0
        for doc in att_docs:
            exists = await db.daily_attendance.find_one(
                {"employee_id": doc["employee_id"], "date": doc["date"]},
                {"_id": 1}
            )
            if not exists:
                await db.daily_attendance.insert_one(doc)
                inserted += 1
        print(f"  {inserted} attendance records inserted ({len(att_docs) - inserted} skipped — already exist)")

    # ── MONTHLY LATE TRACKING ─────────────────────────────────────────────────
    for (eid, month), cnt in late_tracking.items():
        await db.monthly_late_tracking.update_one(
            {"employee_id": eid, "month": month},
            {"$set": {"employee_id": eid, "month": month, "month_key": month,
                       "late_count": cnt, "penalties_applied": []}},
            upsert=True
        )

    # ── LEAVE REQUESTS ────────────────────────────────────────────────────────
    leave_types = ["Full Day", "Half Day"]
    leave_statuses = ["Approved","Approved","Approved","Pending","Rejected"]
    lr_docs = []
    for emp in employees[:8]:
        for _ in range(random.randint(1,3)):
            offset = random.randint(5, 60)
            fd = date.today() - timedelta(days=offset)
            td = fd + timedelta(days=random.randint(0, 2))
            lt = random.choice(leave_types)
            lr_docs.append({
                "leave_request_id": uid(),
                "employee_id": emp["employee_id"],
                "from_date": dstr(fd), "to_date": dstr(td),
                "leave_type": lt,
                "half_day_type": random.choice(["First Half","Second Half"]) if lt == "Half Day" else None,
                "reason": random.choice(["Personal work","Medical appointment","Family function","Sick leave"]),
                "status": random.choice(leave_statuses),
                "regular_days": random.randint(0,2), "paid_days": random.randint(0,1),
                "admin_notes": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    if lr_docs:
        existing_leave = set(
            r["employee_id"] async for r in db.leave_requests.find({}, {"employee_id": 1, "_id": 0})
        )
        new_lr = [d for d in lr_docs if d["employee_id"] not in existing_leave]
        if new_lr:
            await db.leave_requests.insert_many(new_lr)
        print(f"  {len(new_lr)} leave requests inserted ({len(lr_docs)-len(new_lr)} skipped)")

    # ── OVERTIME REQUESTS ─────────────────────────────────────────────────────
    ot_docs = []
    for emp in employees[3:10]:
        for _ in range(random.randint(1,2)):
            offset = random.randint(3, 25)
            d = date.today() - timedelta(days=offset)
            hrs = random.randint(1, 3)
            pay = round(emp["basic_salary"] / 26 / 8 * 1.5 * hrs, 2)
            ot_docs.append({
                "overtime_request_id": uid(),
                "employee_id": emp["employee_id"],
                "date": dstr(d),
                "overtime_from": "18:00",
                "overtime_to": f"{18+hrs:02d}:00",
                "total_hours": hrs,
                "overtime_pay": pay,
                "reason": random.choice(["Project deadline","Client delivery","Sprint completion"]),
                "status": random.choice(["Approved","Approved","Pending"]),
                "admin_notes": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    if ot_docs:
        existing_ot = set(
            f"{r['employee_id']}_{r['date']}" async for r in db.overtime_requests.find({}, {"employee_id": 1, "date": 1, "_id": 0})
        )
        new_ot = [d for d in ot_docs if f"{d['employee_id']}_{d['date']}" not in existing_ot]
        if new_ot:
            await db.overtime_requests.insert_many(new_ot)
        print(f"  {len(new_ot)} overtime requests inserted ({len(ot_docs)-len(new_ot)} skipped)")

    # ── WFH REQUESTS ──────────────────────────────────────────────────────────
    wfh_docs = []
    for emp in employees[4:12]:
        offset = random.randint(1, 10)
        fd = date.today() + timedelta(days=offset)
        wfh_docs.append({
            "wfh_request_id": uid(),
            "employee_id": emp["employee_id"],
            "from_date": dstr(fd), "to_date": dstr(fd + timedelta(days=1)),
            "reason": "Working from home for personal convenience",
            "status": random.choice(["Approved","Pending","Pending"]),
            "approved_days": [],
            "admin_notes": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if wfh_docs:
        existing_wfh = set(
            r["employee_id"] async for r in db.wfh_requests.find({}, {"employee_id": 1, "_id": 0})
        )
        new_wfh = [d for d in wfh_docs if d["employee_id"] not in existing_wfh]
        if new_wfh:
            await db.wfh_requests.insert_many(new_wfh)
        print(f"  {len(new_wfh)} WFH requests inserted ({len(wfh_docs)-len(new_wfh)} skipped)")

    # ── PAYROLL — last 3 months ───────────────────────────────────────────────
    payroll_docs = []
    today_dt = date.today()
    for month_offset in range(1, 4):
        m = today_dt.month - month_offset
        y = today_dt.year
        if m <= 0:
            m += 12; y -= 1
        month_str = f"{y}-{m:02d}-01"
        days_in_m = calendar.monthrange(y, m)[1]
        for emp in employees:
            sal = emp["basic_salary"]
            day_rate = sal / days_in_m
            absent = random.randint(0, 2)
            deductions = round(day_rate * absent + random.uniform(0, 500), 2)
            ot_pay = round(random.uniform(0, 2000), 2)
            net = round(sal + ot_pay - deductions, 2)
            payroll_docs.append({
                "payroll_id": uid(),
                "employee_id": emp["employee_id"],
                "month": month_str,
                "basic_salary": sal,
                "overtime_pay": ot_pay,
                "gross_earnings": round(sal + ot_pay, 2),
                "total_deductions": deductions,
                "net_salary": net,
                "status": "Generated",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    if payroll_docs:
        existing_payroll = set(
            f"{r['employee_id']}_{r['month']}" async for r in db.payroll.find({}, {"employee_id": 1, "month": 1, "_id": 0})
        )
        new_payroll = [d for d in payroll_docs if f"{d['employee_id']}_{d['month']}" not in existing_payroll]
        if new_payroll:
            await db.payroll.insert_many(new_payroll)
        print(f"  {len(new_payroll)} payroll records inserted ({len(payroll_docs)-len(new_payroll)} skipped)")

    # ── MANAGER PERFORMANCE ───────────────────────────────────────────────────
    creative_leads = [emp for emp in employees if emp["department_name"] == "Creative"][:2]
    mp_docs = []
    for month_offset in range(1, 4):
        m = today_dt.month - month_offset
        y = today_dt.year
        if m <= 0:
            m += 12; y -= 1
        month_str = f"{y}-{m:02d}-01"
        for lead in creative_leads:
            cp = round(random.uniform(60, 95), 1)
            cf = round(random.uniform(65, 90), 1)
            ct = round(random.uniform(55, 85), 1)
            weighted = round(cp * 0.45 + cf * 0.35 + ct * 0.20, 2)
            mp_docs.append({
                "performance_id": uid(),
                "manager_id": lead["employee_id"],
                "month": month_str,
                "client_performance_score": cp,
                "client_feedback_score": cf,
                "creative_task_score": ct,
                "weighted_score": weighted,
                "report_link": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    if mp_docs:
        await db.manager_performance.insert_many(mp_docs)
    print(f"  {len(mp_docs)} manager performance records")

    print("\n✓ Seed complete!")

asyncio.run(seed())
