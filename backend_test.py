#!/usr/bin/env python3
"""
Backend API Testing for Attendance System
Tests all attendance endpoints with proper authentication
"""

import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8001/api"
ATTENDANCE_API_KEY = "att_growitup_key_2026"

# Test credentials
ADMIN_EMAIL = "info.growitup@gmail.com"
EMPLOYEE_EMAIL = "john.doe@growitup.com"

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_pass(self, test_name, details=""):
        self.passed += 1
        self.tests.append({"name": test_name, "status": "PASS", "details": details})
        print(f"{GREEN}✓ PASS{RESET}: {test_name}")
        if details:
            print(f"  {details}")
    
    def add_fail(self, test_name, details=""):
        self.failed += 1
        self.tests.append({"name": test_name, "status": "FAIL", "details": details})
        print(f"{RED}✗ FAIL{RESET}: {test_name}")
        if details:
            print(f"  {details}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{BLUE}{'='*60}{RESET}")
        print(f"{BLUE}TEST SUMMARY{RESET}")
        print(f"{BLUE}{'='*60}{RESET}")
        print(f"Total Tests: {total}")
        print(f"{GREEN}Passed: {self.passed}{RESET}")
        print(f"{RED}Failed: {self.failed}{RESET}")
        print(f"Pass Rate: {(self.passed/total*100) if total > 0 else 0:.1f}%")
        print(f"{BLUE}{'='*60}{RESET}\n")

results = TestResults()

def create_session():
    """Create a session with cookies for authentication"""
    session = requests.Session()
    return session

def login_as_admin(session):
    """Login as admin user and set Bearer token"""
    # Using Google auth endpoint with correct credential format
    response = session.post(f"{BASE_URL}/auth/google", json={
        "credential": {
            "email": ADMIN_EMAIL,
            "name": "Admin GrowItUp",
            "picture": "https://example.com/admin.jpg",
            "sub": "admin123"
        }
    })
    if response.status_code == 200:
        # Extract session token from cookies and set as Bearer token
        session_token = response.cookies.get('session_token')
        if session_token:
            session.headers.update({"Authorization": f"Bearer {session_token}"})
            print(f"{GREEN}✓ Logged in as Admin{RESET}")
            return True
        else:
            print(f"{RED}✗ No session token in response{RESET}")
            return False
    else:
        print(f"{RED}✗ Failed to login as Admin: {response.text}{RESET}")
        return False

def login_as_employee(session):
    """Login as regular employee and set Bearer token"""
    response = session.post(f"{BASE_URL}/auth/google", json={
        "credential": {
            "email": EMPLOYEE_EMAIL,
            "name": "John Doe",
            "picture": "https://example.com/john.jpg",
            "sub": "employee123"
        }
    })
    if response.status_code == 200:
        # Extract session token from cookies and set as Bearer token
        session_token = response.cookies.get('session_token')
        if session_token:
            session.headers.update({"Authorization": f"Bearer {session_token}"})
            print(f"{GREEN}✓ Logged in as Employee{RESET}")
            return True
        else:
            print(f"{RED}✗ No session token in response{RESET}")
            return False
    else:
        print(f"{RED}✗ Failed to login as Employee: {response.text}{RESET}")
        return False

def setup_test_data():
    """Setup test data - create GM002 employee if not exists"""
    session = create_session()
    login_as_admin(session)
    
    # Check if GM002 exists
    response = session.get(f"{BASE_URL}/employees")
    if response.status_code == 200:
        employees = response.json()
        gm002_exists = any(emp.get("employee_id") == "GM002" for emp in employees)
        
        if not gm002_exists:
            print(f"{YELLOW}Creating GM002 employee...{RESET}")
            # Create GM002
            emp_data = {
                "employee_id": "GM002",
                "first_name": "Jane",
                "last_name": "Smith",
                "work_email": "jane.smith@growitup.com",
                "personal_email": "jane.smith@personal.com",
                "phone_number": "+919876543210",
                "date_of_birth": "1995-05-15",
                "gender": "Female",
                "address": "456 Test Street",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001",
                "date_of_joining": "2024-01-15",
                "department_name": "Operations",
                "job_position": "Video Editor",
                "employment_type": "Full-Time",
                "status": "Active",
                "shift_id": "shift_default"
            }
            response = session.post(f"{BASE_URL}/employees", json=emp_data)
            if response.status_code == 200:
                print(f"{GREEN}✓ Created GM002 employee{RESET}")
            else:
                print(f"{YELLOW}Note: Could not create GM002: {response.text}{RESET}")

def test_biometric_entry():
    """Test 1: POST /api/attendance/entry - Biometric endpoint"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 1: POST /api/attendance/entry - Biometric Entry{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    # Test 1.1: Valid entry with API key
    headers = {"X-API-Key": ATTENDANCE_API_KEY}
    data = {"employee_id": "GM001", "timestamp": "2026-07-04T09:15:30"}
    response = requests.post(f"{BASE_URL}/attendance/entry", json=data, headers=headers)
    
    if response.status_code == 200 and response.json().get("success"):
        results.add_pass("1.1: Biometric entry with valid API key", 
                        f"Response: {response.json()}")
    else:
        results.add_fail("1.1: Biometric entry with valid API key", 
                        f"Status: {response.status_code}, Response: {response.text}")
    
    # Test 1.2: Without API key (should fail with 401)
    response = requests.post(f"{BASE_URL}/attendance/entry", json=data)
    
    if response.status_code == 401:
        results.add_pass("1.2: Biometric entry without API key returns 401")
    else:
        results.add_fail("1.2: Biometric entry without API key returns 401", 
                        f"Expected 401, got {response.status_code}")
    
    # Test 1.3: Invalid employee_id (should fail with 400)
    data_invalid = {"employee_id": "INVALID999", "timestamp": "2026-07-04T09:15:30"}
    response = requests.post(f"{BASE_URL}/attendance/entry", json=data_invalid, headers=headers)
    
    if response.status_code == 400:
        results.add_pass("1.3: Biometric entry with invalid employee_id returns 400")
    else:
        results.add_fail("1.3: Biometric entry with invalid employee_id returns 400", 
                        f"Expected 400, got {response.status_code}")
    
    # Test 1.4: Second punch same day (check-out)
    data_checkout = {"employee_id": "GM001", "timestamp": "2026-07-04T18:05:00"}
    response = requests.post(f"{BASE_URL}/attendance/entry", json=data_checkout, headers=headers)
    
    if response.status_code == 200 and response.json().get("success"):
        results.add_pass("1.4: Second punch same day (check-out)", 
                        f"Response: {response.json()}")
    else:
        results.add_fail("1.4: Second punch same day (check-out)", 
                        f"Status: {response.status_code}, Response: {response.text}")

def test_process_attendance():
    """Test 2: POST /api/attendance/process - Re-process attendance"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 2: POST /api/attendance/process - Re-process Attendance{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    session = create_session()
    login_as_admin(session)
    
    # Test 2.1: Process GM001 for 2026-07-04
    data = {"employee_id": "GM001", "date": "2026-07-04"}
    response = session.post(f"{BASE_URL}/attendance/process", json=data)
    
    if response.status_code == 200:
        result = response.json()
        # Verify fields
        checks = []
        checks.append(("check_in exists", result.get("check_in") is not None))
        checks.append(("check_out exists", result.get("check_out") is not None))
        checks.append(("status exists", result.get("status") is not None))
        checks.append(("is_late exists", result.get("is_late") is not None))
        checks.append(("total_hours exists", result.get("total_hours") is not None))
        
        # Verify values
        # NOTE: July 4, 2026 is 1st Saturday, so shift is 08:00-13:00 (Saturday half-day)
        checks.append(("check_in is 09:15", result.get("check_in") == "09:15"))
        checks.append(("check_out is 18:05", result.get("check_out") == "18:05"))
        checks.append(("status is Present", result.get("status") == "Present"))
        checks.append(("is_late is True", result.get("is_late") == True))
        # late_minutes = 09:15 - 08:00 = 75 minutes (Saturday start time is 08:00)
        checks.append(("late_minutes is 75", result.get("late_minutes") == 75))
        
        # Calculate expected total hours: 18:05 - 09:15 = 8h50m, no break for Saturday = 8.83h
        expected_hours = 8.83
        actual_hours = result.get("total_hours", 0)
        checks.append(("total_hours is ~8.83", abs(actual_hours - expected_hours) < 0.1))
        
        all_passed = all(check[1] for check in checks)
        details = "\n  ".join([f"{check[0]}: {'✓' if check[1] else '✗'}" for check in checks])
        details += f"\n  Full response: {json.dumps(result, indent=2)}"
        
        if all_passed:
            results.add_pass("2.1: Process attendance for GM001 on 2026-07-04", details)
        else:
            results.add_fail("2.1: Process attendance for GM001 on 2026-07-04", details)
    else:
        results.add_fail("2.1: Process attendance for GM001 on 2026-07-04", 
                        f"Status: {response.status_code}, Response: {response.text}")

def test_get_daily_attendance():
    """Test 3: GET /api/attendance/daily - Get daily records"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 3: GET /api/attendance/daily - Get Daily Records{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    session = create_session()
    login_as_admin(session)
    
    # Test 3.1: Get records for GM001 in July 2026
    params = {"employee_id": "GM001", "month": "2026-07-01"}
    response = session.get(f"{BASE_URL}/attendance/daily", params=params)
    
    if response.status_code == 200:
        records = response.json()
        # Find record for 2026-07-04
        july4_record = next((r for r in records if r.get("date") == "2026-07-04"), None)
        
        if july4_record:
            checks = []
            checks.append(("Record exists for 2026-07-04", True))
            checks.append(("check_in is 09:15", july4_record.get("check_in") == "09:15"))
            checks.append(("check_out is 18:05", july4_record.get("check_out") == "18:05"))
            checks.append(("status is Present", july4_record.get("status") == "Present"))
            checks.append(("is_late is True", july4_record.get("is_late") == True))
            checks.append(("shift info enriched", july4_record.get("shift") is not None))
            
            all_passed = all(check[1] for check in checks)
            details = "\n  ".join([f"{check[0]}: {'✓' if check[1] else '✗'}" for check in checks])
            
            if all_passed:
                results.add_pass("3.1: Get daily attendance for GM001 in July 2026", details)
            else:
                results.add_fail("3.1: Get daily attendance for GM001 in July 2026", details)
        else:
            results.add_fail("3.1: Get daily attendance for GM001 in July 2026", 
                            "Record for 2026-07-04 not found")
    else:
        results.add_fail("3.1: Get daily attendance for GM001 in July 2026", 
                        f"Status: {response.status_code}, Response: {response.text}")
    
    # Test 3.2: Get records without employee_id (should require employee_id for admin)
    response = session.get(f"{BASE_URL}/attendance/daily", params={"month": "2026-07-01"})
    
    # Admin without employee record should get 400 requiring employee_id
    if response.status_code == 400:
        results.add_pass("3.2: Admin without employee record requires employee_id (400)")
    else:
        results.add_fail("3.2: Admin without employee record requires employee_id (400)", 
                        f"Expected 400, got {response.status_code}")

def test_get_summary():
    """Test 4: GET /api/attendance/summary - Monthly summary"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 4: GET /api/attendance/summary - Monthly Summary{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    session = create_session()
    login_as_admin(session)
    
    # Test 4.1: Get summary for GM001 in July 2026
    params = {"employee_id": "GM001", "month": "2026-07-01"}
    response = session.get(f"{BASE_URL}/attendance/summary", params=params)
    
    if response.status_code == 200:
        data = response.json()
        summary = data.get("summary", {})
        late_tracking = data.get("late_tracking")
        
        checks = []
        checks.append(("summary exists", summary is not None))
        checks.append(("summary has present count", "present" in summary))
        checks.append(("summary has absent count", "absent" in summary))
        checks.append(("summary has late_count", "late_count" in summary))
        checks.append(("summary has total_hours", "total_hours" in summary))
        checks.append(("late_count >= 1", summary.get("late_count", 0) >= 1))
        checks.append(("late_tracking exists", late_tracking is not None))
        
        all_passed = all(check[1] for check in checks)
        details = "\n  ".join([f"{check[0]}: {'✓' if check[1] else '✗'}" for check in checks])
        details += f"\n  Summary: {json.dumps(summary, indent=2)}"
        
        if all_passed:
            results.add_pass("4.1: Get attendance summary for GM001 in July 2026", details)
        else:
            results.add_fail("4.1: Get attendance summary for GM001 in July 2026", details)
    else:
        results.add_fail("4.1: Get attendance summary for GM001 in July 2026", 
                        f"Status: {response.status_code}, Response: {response.text}")

def test_manual_attendance():
    """Test 5: POST /api/attendance/manual - Admin creates manual record"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 5: POST /api/attendance/manual - Manual Attendance{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    session = create_session()
    login_as_admin(session)
    
    # Test 5.1: Create manual leave record
    data = {
        "employee_id": "GM001",
        "date": "2026-07-05",
        "status": "Leave",
        "notes": "Annual leave"
    }
    response = session.post(f"{BASE_URL}/attendance/manual", json=data)
    
    if response.status_code == 200:
        result = response.json()
        checks = []
        checks.append(("Record created", result is not None))
        checks.append(("status is Leave", result.get("status") == "Leave"))
        checks.append(("notes saved", result.get("notes") == "Annual leave"))
        
        all_passed = all(check[1] for check in checks)
        details = "\n  ".join([f"{check[0]}: {'✓' if check[1] else '✗'}" for check in checks])
        
        if all_passed:
            results.add_pass("5.1: Create manual leave record", details)
        else:
            results.add_fail("5.1: Create manual leave record", details)
    else:
        results.add_fail("5.1: Create manual leave record", 
                        f"Status: {response.status_code}, Response: {response.text}")
    
    # Test 5.2: Invalid status (should fail with 400)
    data_invalid = {
        "employee_id": "GM001",
        "date": "2026-07-06",
        "status": "InvalidStatus",
        "notes": "Test"
    }
    response = session.post(f"{BASE_URL}/attendance/manual", json=data_invalid)
    
    if response.status_code == 400:
        results.add_pass("5.2: Manual attendance with invalid status returns 400")
    else:
        results.add_fail("5.2: Manual attendance with invalid status returns 400", 
                        f"Expected 400, got {response.status_code}")

def test_update_attendance():
    """Test 6: PUT /api/attendance/{attendance_id} - Admin override"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 6: PUT /api/attendance/{{attendance_id}} - Admin Override{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    session = create_session()
    login_as_admin(session)
    
    # First, get an attendance_id from previous records
    params = {"employee_id": "GM001", "month": "2026-07-01"}
    response = session.get(f"{BASE_URL}/attendance/daily", params=params)
    
    if response.status_code == 200:
        records = response.json()
        if records:
            attendance_id = records[0].get("attendance_id")
            
            # Test 6.1: Update status to WFH
            data = {
                "status": "WFH",
                "notes": "Working from home"
            }
            response = session.put(f"{BASE_URL}/attendance/{attendance_id}", json=data)
            
            if response.status_code == 200:
                result = response.json()
                checks = []
                checks.append(("Status updated to WFH", result.get("status") == "WFH"))
                checks.append(("Notes updated", result.get("notes") == "Working from home"))
                
                all_passed = all(check[1] for check in checks)
                details = "\n  ".join([f"{check[0]}: {'✓' if check[1] else '✗'}" for check in checks])
                
                if all_passed:
                    results.add_pass("6.1: Admin override attendance status", details)
                else:
                    results.add_fail("6.1: Admin override attendance status", details)
            else:
                results.add_fail("6.1: Admin override attendance status", 
                                f"Status: {response.status_code}, Response: {response.text}")
            
            # Test 6.2: Non-admin should get 403
            emp_session = create_session()
            login_as_employee(emp_session)
            
            response = emp_session.put(f"{BASE_URL}/attendance/{attendance_id}", json=data)
            
            if response.status_code == 403:
                results.add_pass("6.2: Non-admin cannot override attendance (403)")
            else:
                results.add_fail("6.2: Non-admin cannot override attendance (403)", 
                                f"Expected 403, got {response.status_code}")
        else:
            results.add_fail("6.1-6.2: Admin override tests", "No attendance records found")
    else:
        results.add_fail("6.1-6.2: Admin override tests", 
                        f"Failed to get attendance records: {response.status_code}")

def test_all_employees_summary():
    """Test 7: GET /api/attendance/all-employees-summary - Admin bulk view"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 7: GET /api/attendance/all-employees-summary - Admin Bulk View{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    # Test 7.1: Admin can access
    admin_session = create_session()
    login_as_admin(admin_session)
    
    params = {"month": "2026-07-01"}
    response = admin_session.get(f"{BASE_URL}/attendance/all-employees-summary", params=params)
    
    if response.status_code == 200:
        data = response.json()
        checks = []
        checks.append(("Returns list", isinstance(data, list)))
        if data:
            checks.append(("Has employee_id", "employee_id" in data[0]))
            checks.append(("Has first_name", "first_name" in data[0]))
            checks.append(("Has present count", "present" in data[0]))
            checks.append(("Has late_count", "late_count" in data[0]))
        
        all_passed = all(check[1] for check in checks)
        details = "\n  ".join([f"{check[0]}: {'✓' if check[1] else '✗'}" for check in checks])
        
        if all_passed:
            results.add_pass("7.1: Admin can access all employees summary", details)
        else:
            results.add_fail("7.1: Admin can access all employees summary", details)
    else:
        results.add_fail("7.1: Admin can access all employees summary", 
                        f"Status: {response.status_code}, Response: {response.text}")
    
    # Test 7.2: Non-admin should get 403
    emp_session = create_session()
    login_as_employee(emp_session)
    
    response = emp_session.get(f"{BASE_URL}/attendance/all-employees-summary", params=params)
    
    if response.status_code == 403:
        results.add_pass("7.2: Non-admin cannot access all employees summary (403)")
    else:
        results.add_fail("7.2: Non-admin cannot access all employees summary (403)", 
                        f"Expected 403, got {response.status_code}")

def test_saturday_half_day():
    """Test 8: Saturday half-day logic"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 8: Saturday Half-Day Logic (1st Saturday){RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    # Create punches for GM002 on Saturday (July 4, 2026 - 1st Saturday)
    headers = {"X-API-Key": ATTENDANCE_API_KEY}
    
    # Check-in at 08:15
    data_in = {"employee_id": "GM002", "timestamp": "2026-07-04T08:15:00"}
    response = requests.post(f"{BASE_URL}/attendance/entry", json=data_in, headers=headers)
    
    if response.status_code == 200:
        results.add_pass("8.1: Saturday check-in punch recorded")
    else:
        results.add_fail("8.1: Saturday check-in punch recorded", 
                        f"Status: {response.status_code}, Response: {response.text}")
    
    # Check-out at 13:10
    data_out = {"employee_id": "GM002", "timestamp": "2026-07-04T13:10:00"}
    response = requests.post(f"{BASE_URL}/attendance/entry", json=data_out, headers=headers)
    
    if response.status_code == 200:
        results.add_pass("8.2: Saturday check-out punch recorded")
    else:
        results.add_fail("8.2: Saturday check-out punch recorded", 
                        f"Status: {response.status_code}, Response: {response.text}")
    
    # Process and verify
    session = create_session()
    login_as_admin(session)
    
    data = {"employee_id": "GM002", "date": "2026-07-04"}
    response = session.post(f"{BASE_URL}/attendance/process", json=data)
    
    if response.status_code == 200:
        result = response.json()
        checks = []
        checks.append(("check_in is 08:15", result.get("check_in") == "08:15"))
        checks.append(("check_out is 13:10", result.get("check_out") == "13:10"))
        # For Saturday half-day: 13:10 - 08:15 = 4h55m, no break, threshold is 4h50m
        checks.append(("status is Present", result.get("status") == "Present"))
        # is_late check: Saturday start is 08:00, grace is 08:10, actual is 08:15
        checks.append(("is_late is True", result.get("is_late") == True))
        checks.append(("late_minutes is 15", result.get("late_minutes") == 15))
        
        all_passed = all(check[1] for check in checks)
        details = "\n  ".join([f"{check[0]}: {'✓' if check[1] else '✗'}" for check in checks])
        details += f"\n  Full response: {json.dumps(result, indent=2)}"
        
        if all_passed:
            results.add_pass("8.3: Saturday half-day logic verified", details)
        else:
            results.add_fail("8.3: Saturday half-day logic verified", details)
    else:
        results.add_fail("8.3: Saturday half-day logic verified", 
                        f"Status: {response.status_code}, Response: {response.text}")

def test_late_tracking():
    """Test 9: Late tracking validation"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 9: Late Tracking Validation{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    session = create_session()
    login_as_admin(session)
    
    # Get late tracking for GM001 in July 2026
    params = {"employee_id": "GM001", "month": "2026-07-01"}
    response = session.get(f"{BASE_URL}/attendance/late-tracking", params=params)
    
    if response.status_code == 200:
        tracking_list = response.json()
        checks = []
        checks.append(("Returns list", isinstance(tracking_list, list)))
        checks.append(("Has at least one record", len(tracking_list) > 0))
        
        if tracking_list:
            tracking = tracking_list[0]  # Get first record
            checks.append(("Has late_count", "late_count" in tracking))
            checks.append(("late_count >= 1", tracking.get("late_count", 0) >= 1))
            checks.append(("Has penalties_applied", "penalties_applied" in tracking))
            # No penalties yet (penalty starts at 4th late)
            checks.append(("No penalties yet", len(tracking.get("penalties_applied", [])) == 0))
        
        all_passed = all(check[1] for check in checks)
        details = "\n  ".join([f"{check[0]}: {'✓' if check[1] else '✗'}" for check in checks])
        if tracking_list:
            details += f"\n  Tracking: {json.dumps(tracking_list[0], indent=2)}"
        
        if all_passed:
            results.add_pass("9.1: Late tracking validation", details)
        else:
            results.add_fail("9.1: Late tracking validation", details)
    else:
        results.add_fail("9.1: Late tracking validation", 
                        f"Status: {response.status_code}, Response: {response.text}")

def test_sunday_holiday():
    """Test 10: Business logic - Holiday on Sunday"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST 10: Sunday Holiday Logic{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    # July 12, 2026 is a Sunday
    headers = {"X-API-Key": ATTENDANCE_API_KEY}
    data = {"employee_id": "GM001", "timestamp": "2026-07-12T09:00:00"}
    response = requests.post(f"{BASE_URL}/attendance/entry", json=data, headers=headers)
    
    if response.status_code == 200:
        results.add_pass("10.1: Sunday punch recorded")
    else:
        results.add_fail("10.1: Sunday punch recorded", 
                        f"Status: {response.status_code}, Response: {response.text}")
    
    # Process and verify status is Holiday
    session = create_session()
    login_as_admin(session)
    
    data = {"employee_id": "GM001", "date": "2026-07-12"}
    response = session.post(f"{BASE_URL}/attendance/process", json=data)
    
    if response.status_code == 200:
        result = response.json()
        if result.get("status") == "Holiday":
            results.add_pass("10.2: Sunday status is Holiday", 
                            f"Status: {result.get('status')}, Notes: {result.get('notes')}")
        else:
            results.add_fail("10.2: Sunday status is Holiday", 
                            f"Expected Holiday, got {result.get('status')}")
    else:
        results.add_fail("10.2: Sunday status is Holiday", 
                        f"Status: {response.status_code}, Response: {response.text}")

def main():
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}ATTENDANCE SYSTEM BACKEND API TESTING{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")
    
    # Setup
    print(f"{YELLOW}Setting up test data...{RESET}")
    setup_test_data()
    
    # Run all tests
    test_biometric_entry()
    test_process_attendance()
    test_get_daily_attendance()
    test_get_summary()
    test_manual_attendance()
    test_update_attendance()
    test_all_employees_summary()
    test_saturday_half_day()
    test_late_tracking()
    test_sunday_holiday()
    
    # Summary
    results.summary()
    
    # Return exit code based on results
    return 0 if results.failed == 0 else 1

if __name__ == "__main__":
    exit(main())
