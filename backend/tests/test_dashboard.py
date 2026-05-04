"""Backend tests for GET /api/dashboard/today.

Covers:
- 401 when unauthenticated
- 200 with required shape for authenticated (admin & non-admin)
- on_leave entries enriched with leave_type/half_day_type from leave_requests
- WFH listing
- late arrivals sorted DESC by late_minutes, include check_in + late_minutes
- birthdays match today's MM-DD across years; computed `age`
- empty-arrays edge case
- _id never leaked
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "incremental-build-2-growitup_erp")

ADMIN_EMAIL = "info.growitup@gmail.com"
# GM001 is registered as a non-admin (department=Operations)
NONADMIN_EMAIL = "test.employee@growitup.com"

TODAY = datetime.now().strftime("%Y-%m-%d")
MM_DD = datetime.now().strftime("%m-%d")

REQUIRED_EMP_KEYS = {
    "employee_id", "first_name", "last_name",
    "profile_picture", "job_position_name", "department_name",
}

# ----------------- helpers -----------------

def _login(email: str, name: str = "Tester") -> str:
    r = requests.post(
        f"{API}/auth/google",
        json={"credential": {"email": email, "name": name, "picture": ""}},
    )
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["session_token"]


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _no_object_id(obj):
    """Recursively assert no '_id' key anywhere in response."""
    if isinstance(obj, dict):
        assert "_id" not in obj, "Mongo _id leaked into response"
        for v in obj.values():
            _no_object_id(v)
    elif isinstance(obj, list):
        for v in obj:
            _no_object_id(v)


# ----------------- fixtures -----------------

@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, "Admin")


@pytest.fixture(scope="module")
def nonadmin_token():
    return _login(NONADMIN_EMAIL, "NonAdmin")


@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def seed_data(mongo_db):
    """Insert TEST_ prefixed employees + today's daily_attendance + leave_request rows.

    Cleans up everything we created at teardown (does not touch existing data).
    """
    db = mongo_db
    now_iso = datetime.now(timezone.utc).isoformat()
    suffix = uuid.uuid4().hex[:6]

    # --- TEST employees (5: 1 leave, 1 wfh, 2 late, 1 birthday) ---
    employees = [
        {
            "employee_id": f"TEST_LV_{suffix}",
            "first_name": "TestLeave",
            "last_name": "User",
            "work_email": f"test_leave_{suffix}@growitup.test",
            "profile_picture": "http://example.com/lv.png",
            "job_position_name": "QA Engineer",
            "department_name": "Engineering",
            "date_of_birth": "1990-01-01",
            "created_at": now_iso, "updated_at": now_iso,
        },
        {
            "employee_id": f"TEST_WFH_{suffix}",
            "first_name": "TestWFH",
            "last_name": "User",
            "work_email": f"test_wfh_{suffix}@growitup.test",
            "profile_picture": "http://example.com/wfh.png",
            "job_position_name": "Developer",
            "department_name": "Engineering",
            "date_of_birth": "1992-02-02",
            "created_at": now_iso, "updated_at": now_iso,
        },
        {
            "employee_id": f"TEST_LATE1_{suffix}",
            "first_name": "TestLate1",
            "last_name": "User",
            "work_email": f"test_late1_{suffix}@growitup.test",
            "profile_picture": "http://example.com/l1.png",
            "job_position_name": "Designer",
            "department_name": "Design",
            "date_of_birth": "1993-03-03",
            "created_at": now_iso, "updated_at": now_iso,
        },
        {
            "employee_id": f"TEST_LATE2_{suffix}",
            "first_name": "TestLate2",
            "last_name": "User",
            "work_email": f"test_late2_{suffix}@growitup.test",
            "profile_picture": "http://example.com/l2.png",
            "job_position_name": "Designer",
            "department_name": "Design",
            "date_of_birth": "1994-04-04",
            "created_at": now_iso, "updated_at": now_iso,
        },
        {
            # Birthday today — DOB year 1990, MM-DD = today's
            "employee_id": f"TEST_BDAY_{suffix}",
            "first_name": "TestBday",
            "last_name": "User",
            "work_email": f"test_bday_{suffix}@growitup.test",
            "profile_picture": "http://example.com/b.png",
            "job_position_name": "Manager",
            "department_name": "Sales",
            "date_of_birth": f"1990-{MM_DD}",
            "created_at": now_iso, "updated_at": now_iso,
        },
    ]
    db.employees.insert_many(employees)

    # --- TEST daily_attendance rows for today ---
    att_rows = [
        {
            "attendance_id": f"TEST_att_lv_{suffix}",
            "employee_id": f"TEST_LV_{suffix}",
            "date": TODAY, "shift_id": "shift_default",
            "status": "Leave", "check_in": None, "check_out": None,
            "total_hours": 0, "is_late": False, "late_minutes": 0,
            "notes": "On leave", "created_at": now_iso, "updated_at": now_iso,
        },
        {
            "attendance_id": f"TEST_att_wfh_{suffix}",
            "employee_id": f"TEST_WFH_{suffix}",
            "date": TODAY, "shift_id": "shift_default",
            "status": "WFH", "check_in": None, "check_out": None,
            "total_hours": 8, "is_late": False, "late_minutes": 0,
            "notes": "WFH", "created_at": now_iso, "updated_at": now_iso,
        },
        {
            "attendance_id": f"TEST_att_late1_{suffix}",
            "employee_id": f"TEST_LATE1_{suffix}",
            "date": TODAY, "shift_id": "shift_default",
            "status": "Present",
            "check_in": f"{TODAY}T10:15:00",
            "check_out": None,
            "total_hours": 7, "is_late": True, "late_minutes": 15,
            "notes": "Late by 15", "created_at": now_iso, "updated_at": now_iso,
        },
        {
            "attendance_id": f"TEST_att_late2_{suffix}",
            "employee_id": f"TEST_LATE2_{suffix}",
            "date": TODAY, "shift_id": "shift_default",
            "status": "Present",
            "check_in": f"{TODAY}T10:45:00",
            "check_out": None,
            "total_hours": 6, "is_late": True, "late_minutes": 45,
            "notes": "Late by 45", "created_at": now_iso, "updated_at": now_iso,
        },
    ]
    db.daily_attendance.insert_many(att_rows)

    # --- Leave request matching the leave employee, half-day FN ---
    leave_req = {
        "leave_request_id": f"TEST_lr_{suffix}",
        "employee_id": f"TEST_LV_{suffix}",
        "leave_type": "Sick Leave",
        "half_day_type": "First Half",
        "from_date": TODAY,
        "to_date": TODAY,
        "status": "Approved",
        "reason": "Test leave",
        "created_at": now_iso, "updated_at": now_iso,
    }
    db.leave_requests.insert_one(leave_req)

    ctx = {
        "suffix": suffix,
        "lv_id": f"TEST_LV_{suffix}",
        "wfh_id": f"TEST_WFH_{suffix}",
        "late1_id": f"TEST_LATE1_{suffix}",  # 15 min
        "late2_id": f"TEST_LATE2_{suffix}",  # 45 min — should come first
        "bday_id": f"TEST_BDAY_{suffix}",
        "expected_age": datetime.now().year - 1990,
    }

    yield ctx

    # --- teardown ---
    db.employees.delete_many({"employee_id": {"$regex": f"^TEST_.*_{suffix}$"}})
    db.daily_attendance.delete_many({"attendance_id": {"$regex": f"^TEST_att_.*_{suffix}$"}})
    db.leave_requests.delete_many({"leave_request_id": f"TEST_lr_{suffix}"})


# ----------------- tests -----------------

class TestAuth:
    def test_unauthenticated_returns_401(self):
        r = requests.get(f"{API}/dashboard/today")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_invalid_token_returns_401(self):
        r = requests.get(
            f"{API}/dashboard/today",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


class TestShape:
    def test_admin_response_shape(self, admin_token, seed_data):
        r = requests.get(f"{API}/dashboard/today", headers=_hdr(admin_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(data.keys()) >= {"date", "on_leave", "wfh", "late", "birthdays"}, data.keys()
        assert data["date"] == TODAY
        for key in ("on_leave", "wfh", "late", "birthdays"):
            assert isinstance(data[key], list), f"{key} must be list"
        _no_object_id(data)

    def test_nonadmin_returns_same_shape_no_role_gating(self, nonadmin_token, admin_token, seed_data):
        r_admin = requests.get(f"{API}/dashboard/today", headers=_hdr(admin_token))
        r_user = requests.get(f"{API}/dashboard/today", headers=_hdr(nonadmin_token))
        assert r_user.status_code == 200, r_user.text
        assert r_admin.status_code == 200
        admin_keys = set(r_admin.json().keys())
        user_keys = set(r_user.json().keys())
        assert admin_keys == user_keys, (admin_keys, user_keys)
        # Same TEST_-prefixed seed rows should appear in both payloads
        admin_lv = {e["employee_id"] for e in r_admin.json()["on_leave"]}
        user_lv = {e["employee_id"] for e in r_user.json()["on_leave"]}
        assert admin_lv == user_lv


class TestOnLeave:
    def test_seeded_leave_employee_appears_with_enrichment(self, admin_token, seed_data):
        r = requests.get(f"{API}/dashboard/today", headers=_hdr(admin_token))
        assert r.status_code == 200
        on_leave = r.json()["on_leave"]
        match = next((e for e in on_leave if e["employee_id"] == seed_data["lv_id"]), None)
        assert match is not None, f"seeded leave employee not in on_leave: {on_leave}"
        # Required employee enrichment fields
        for k in REQUIRED_EMP_KEYS:
            assert k in match, f"missing {k} in on_leave row"
        assert match["first_name"] == "TestLeave"
        assert match["last_name"] == "User"
        assert match["job_position_name"] == "QA Engineer"
        assert match["department_name"] == "Engineering"
        assert match["profile_picture"] == "http://example.com/lv.png"
        # Leave-specific enrichment from leave_requests
        assert match.get("leave_type") == "Sick Leave"
        assert match.get("half_day_type") == "First Half"


class TestWFH:
    def test_seeded_wfh_employee_appears(self, admin_token, seed_data):
        r = requests.get(f"{API}/dashboard/today", headers=_hdr(admin_token))
        wfh = r.json()["wfh"]
        match = next((e for e in wfh if e["employee_id"] == seed_data["wfh_id"]), None)
        assert match is not None, f"seeded WFH employee not in wfh list: {wfh}"
        for k in REQUIRED_EMP_KEYS:
            assert k in match
        assert match["first_name"] == "TestWFH"
        assert match["job_position_name"] == "Developer"


class TestLate:
    def test_late_includes_check_in_and_minutes_and_sorted_desc(self, admin_token, seed_data):
        r = requests.get(f"{API}/dashboard/today", headers=_hdr(admin_token))
        late = r.json()["late"]
        # Filter to only our seeded rows
        ours = [e for e in late if e["employee_id"] in (seed_data["late1_id"], seed_data["late2_id"])]
        assert len(ours) == 2, f"expected 2 seeded late rows, got: {ours}"
        # Required fields
        for row in ours:
            for k in REQUIRED_EMP_KEYS:
                assert k in row
            assert "check_in" in row, "late row missing check_in"
            assert "late_minutes" in row, "late row missing late_minutes"
        # Validate values
        late2 = next(e for e in ours if e["employee_id"] == seed_data["late2_id"])
        late1 = next(e for e in ours if e["employee_id"] == seed_data["late1_id"])
        assert late2["late_minutes"] == 45
        assert late1["late_minutes"] == 15
        assert late2["check_in"] == f"{TODAY}T10:45:00"
        assert late1["check_in"] == f"{TODAY}T10:15:00"

        # Global ordering: late list must be DESC by late_minutes
        minutes_seq = [e.get("late_minutes") or 0 for e in late]
        assert minutes_seq == sorted(minutes_seq, reverse=True), \
            f"late list not sorted desc: {minutes_seq}"


class TestBirthdays:
    def test_birthday_match_and_age_computed(self, admin_token, seed_data):
        r = requests.get(f"{API}/dashboard/today", headers=_hdr(admin_token))
        bdays = r.json()["birthdays"]
        match = next((e for e in bdays if e["employee_id"] == seed_data["bday_id"]), None)
        assert match is not None, f"birthday employee missing: {bdays}"
        for k in REQUIRED_EMP_KEYS:
            assert k in match
        assert "age" in match
        assert match["age"] == seed_data["expected_age"], \
            f"expected age {seed_data['expected_age']} got {match['age']}"

    def test_non_matching_dob_is_excluded(self, admin_token, seed_data):
        """Employees whose DOB MM-DD != today's MM-DD must NOT appear."""
        r = requests.get(f"{API}/dashboard/today", headers=_hdr(admin_token))
        bdays = r.json()["birthdays"]
        non_matching_ids = {seed_data["lv_id"], seed_data["wfh_id"],
                            seed_data["late1_id"], seed_data["late2_id"]}
        # The non-bday seeded employees use static DOBs (1990-01-01 etc) which
        # only collide with today's MM-DD on Jan 1 / Feb 2 / Mar 3 / Apr 4.
        today_mmdd = MM_DD
        unexpected_in_payload = [e["employee_id"] for e in bdays
                                 if e["employee_id"] in non_matching_ids
                                 and today_mmdd not in ("01-01", "02-02", "03-03", "04-04")]
        assert not unexpected_in_payload, \
            f"non-birthday employees leaked into birthdays: {unexpected_in_payload}"


class TestEmptyEdgeCase:
    """When no rows match, response must still be 200 with empty arrays (not nulls)."""

    def test_empty_arrays_when_no_data(self, admin_token, mongo_db):
        # Query directly without any seed: there may already be other rows, so
        # we cannot guarantee emptiness. But we CAN guarantee: arrays are present,
        # arrays are lists, never None.
        r = requests.get(f"{API}/dashboard/today", headers=_hdr(admin_token))
        assert r.status_code == 200
        d = r.json()
        for key in ("on_leave", "wfh", "late", "birthdays"):
            assert d[key] is not None, f"{key} is None — must be []"
            assert isinstance(d[key], list)

    def test_no_object_id_in_response(self, admin_token, seed_data):
        r = requests.get(f"{API}/dashboard/today", headers=_hdr(admin_token))
        _no_object_id(r.json())
