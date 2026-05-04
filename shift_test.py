#!/usr/bin/env python3
"""
Backend API Testing for Shift Management System
Tests all shift-related endpoints with proper authentication
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8001/api"

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_test(test_name, passed, message=""):
    """Log test result"""
    if passed:
        test_results["passed"].append(f"✅ {test_name}")
        print(f"✅ PASS: {test_name}")
    else:
        test_results["failed"].append(f"❌ {test_name}: {message}")
        print(f"❌ FAIL: {test_name}")
        if message:
            print(f"   Error: {message}")

def log_warning(message):
    """Log warning"""
    test_results["warnings"].append(f"⚠️  {message}")
    print(f"⚠️  WARNING: {message}")

def create_admin_session():
    """Create admin session and return session token"""
    print("\n=== Creating Admin Session ===")
    response = requests.post(
        f"{BASE_URL}/auth/google",
        json={
            "credential": {
                "email": "info.growitup@gmail.com",
                "name": "Admin GrowItUp",
                "picture": "https://example.com/admin.jpg",
                "sub": "admin123"
            }
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        session_token = data.get("session_token")
        print(f"✅ Admin session created: {session_token[:20]}...")
        return session_token
    else:
        print(f"❌ Failed to create admin session: {response.status_code}")
        print(f"   Response: {response.text}")
        return None

def create_employee_session():
    """Create a non-admin employee for testing"""
    print("\n=== Creating Non-Admin Employee ===")
    
    # First, create admin session to create employee
    admin_token = create_admin_session()
    if not admin_token:
        return None, None
    
    # Create employee via API with all required fields
    employee_data = {
        "first_name": "John",
        "last_name": "Doe",
        "personal_email": "john.personal@gmail.com",
        "phone": "9876543210",
        "date_of_birth": "1990-01-15",
        "gender": "Male",
        "qualification": "Bachelor's Degree",
        "address": "123 Test Street, Mumbai",
        "country": "India",
        "state_id": "state_014",
        "state_name": "Maharashtra",
        "city_id": "city_mh_001",
        "city_name": "Mumbai",
        "zipcode": "400001",
        "emergency_contact_name": "Jane Doe",
        "emergency_contact_number": "9876543211",
        "emergency_contact_relation": "Spouse",
        "work_email": "john.doe@growitup.com",
        "department_id": "dept_operations",
        "department_name": "Operations",
        "job_position_id": "pos_video_editor",
        "job_position_name": "Video Editor",
        "level": "Intermediate",
        "reporting_manager_id": None,
        "reporting_manager_name": None,
        "employee_type": "Full-time",
        "joining_date": "2024-01-01",
        "basic_salary": 50000,
        "bank_name": "Test Bank",
        "account_name": "John Doe",
        "account_number": "1234567890",
        "ifsc_code": "TEST0001234",
        "profile_picture": None,
        "status": "Active",
        "teams": []
    }
    
    response = requests.post(
        f"{BASE_URL}/employees",
        json=employee_data,
        cookies={"session_token": admin_token}
    )
    
    employee_id = None
    if response.status_code in [200, 201]:
        data = response.json()
        employee_id = data.get("employee_id")
        print(f"✅ Employee {employee_id} created")
    elif response.status_code == 400 and "already exists" in response.text.lower():
        print(f"ℹ️  Employee with this email already exists, will try to use it")
        # Try to get the employee ID from the error or use a known ID
        employee_id = "GM002"  # Fallback to a likely ID
    else:
        print(f"⚠️  Employee creation response: {response.status_code}")
        print(f"   Response: {response.text}")
        return None, None
    
    # Now create session for the employee
    response = requests.post(
        f"{BASE_URL}/auth/google",
        json={
            "credential": {
                "email": "john.doe@growitup.com",
                "name": "John Doe",
                "picture": "https://example.com/john.jpg",
                "sub": "john123"
            }
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        session_token = data.get("session_token")
        print(f"✅ Employee session created: {session_token[:20]}...")
        return session_token, employee_id
    else:
        print(f"❌ Failed to create employee session: {response.status_code}")
        print(f"   Response: {response.text}")
        return None, None

def test_get_shifts(session_token):
    """Test GET /api/shifts - Should return list including Regular 9-6"""
    print("\n=== Test 1: GET /api/shifts ===")
    
    response = requests.get(
        f"{BASE_URL}/shifts",
        cookies={"session_token": session_token}
    )
    
    if response.status_code != 200:
        log_test("GET /api/shifts", False, f"Status {response.status_code}: {response.text}")
        return None
    
    shifts = response.json()
    
    # Check if it's a list
    if not isinstance(shifts, list):
        log_test("GET /api/shifts returns list", False, f"Expected list, got {type(shifts)}")
        return None
    
    log_test("GET /api/shifts returns list", True)
    
    # Find Regular 9-6 shift
    default_shift = None
    for shift in shifts:
        if shift.get("shift_name") == "Regular 9-6":
            default_shift = shift
            break
    
    if not default_shift:
        log_test("Regular 9-6 shift exists", False, "Default shift not found in response")
        return None
    
    log_test("Regular 9-6 shift exists", True)
    
    # Validate default shift properties
    validations = [
        (default_shift.get("is_system_default") == True, "is_system_default=true"),
        (default_shift.get("start_time") == "09:00", "start_time=09:00"),
        (default_shift.get("end_time") == "18:00", "end_time=18:00"),
        (default_shift.get("break_duration") == 60, "break_duration=60"),
        (default_shift.get("total_hours") == 9, "total_hours=9"),
        ("shift_id" in default_shift, "has shift_id"),
        ("employee_count" in default_shift, "has employee_count")
    ]
    
    for condition, description in validations:
        log_test(f"Regular 9-6 {description}", condition, 
                f"Expected {description}, got {default_shift.get(description.split('=')[0])}")
    
    print(f"\nDefault shift details: {json.dumps(default_shift, indent=2)}")
    return default_shift

def test_create_shift(session_token):
    """Test POST /api/shifts - Create new shift (admin only)"""
    print("\n=== Test 2: POST /api/shifts ===")
    
    shift_data = {
        "shift_name": "Early 8-5",
        "start_time": "08:00",
        "end_time": "17:00",
        "break_duration": 60,
        "is_system_default": False
    }
    
    response = requests.post(
        f"{BASE_URL}/shifts",
        json=shift_data,
        cookies={"session_token": session_token}
    )
    
    if response.status_code not in [200, 201]:
        log_test("POST /api/shifts (create)", False, f"Status {response.status_code}: {response.text}")
        return None
    
    shift = response.json()
    log_test("POST /api/shifts (create)", True)
    
    # Validate response
    validations = [
        (shift.get("shift_name") == "Early 8-5", "shift_name correct"),
        (shift.get("start_time") == "08:00", "start_time correct"),
        (shift.get("end_time") == "17:00", "end_time correct"),
        (shift.get("break_duration") == 60, "break_duration correct"),
        (shift.get("total_hours") == 9, "total_hours=9 (calculated)"),
        ("shift_id" in shift, "has shift_id")
    ]
    
    for condition, description in validations:
        log_test(f"Created shift {description}", condition)
    
    print(f"\nCreated shift: {json.dumps(shift, indent=2)}")
    return shift

def test_update_shift(session_token, shift_id):
    """Test PUT /api/shifts/{shift_id} - Update shift"""
    print(f"\n=== Test 3: PUT /api/shifts/{shift_id} ===")
    
    update_data = {
        "shift_name": "Early 8-5 Updated",
        "start_time": "08:00",
        "end_time": "17:00",
        "break_duration": 30,
        "is_system_default": False
    }
    
    response = requests.put(
        f"{BASE_URL}/shifts/{shift_id}",
        json=update_data,
        cookies={"session_token": session_token}
    )
    
    if response.status_code != 200:
        log_test("PUT /api/shifts/{shift_id}", False, f"Status {response.status_code}: {response.text}")
        return False
    
    shift = response.json()
    log_test("PUT /api/shifts/{shift_id}", True)
    
    # Validate updates
    validations = [
        (shift.get("shift_name") == "Early 8-5 Updated", "shift_name updated"),
        (shift.get("break_duration") == 30, "break_duration updated to 30"),
        (shift.get("total_hours") == 9, "total_hours recalculated")
    ]
    
    for condition, description in validations:
        log_test(f"Updated shift {description}", condition)
    
    return True

def test_update_system_default_shift(session_token, default_shift_id):
    """Test that system default shift name cannot be changed"""
    print(f"\n=== Test 4: PUT /api/shifts/{default_shift_id} (system default) ===")
    
    update_data = {
        "shift_name": "Modified Regular 9-6",
        "start_time": "09:00",
        "end_time": "18:00",
        "break_duration": 60,
        "is_system_default": True
    }
    
    response = requests.put(
        f"{BASE_URL}/shifts/{default_shift_id}",
        json=update_data,
        cookies={"session_token": session_token}
    )
    
    # Should fail with 400
    if response.status_code == 400 and "cannot rename" in response.text.lower():
        log_test("Cannot rename system default shift", True)
        return True
    else:
        log_test("Cannot rename system default shift", False, 
                f"Expected 400 with 'cannot rename', got {response.status_code}: {response.text}")
        return False

def test_delete_system_default_shift(session_token, default_shift_id):
    """Test that system default shift cannot be deleted"""
    print(f"\n=== Test 5: DELETE /api/shifts/{default_shift_id} (system default) ===")
    
    response = requests.delete(
        f"{BASE_URL}/shifts/{default_shift_id}",
        cookies={"session_token": session_token}
    )
    
    # Should fail with 400
    if response.status_code == 400 and "cannot delete" in response.text.lower():
        log_test("Cannot delete system default shift", True)
        return True
    else:
        log_test("Cannot delete system default shift", False,
                f"Expected 400 with 'cannot delete', got {response.status_code}: {response.text}")
        return False

def test_delete_shift(session_token, shift_id):
    """Test DELETE /api/shifts/{shift_id} - Delete non-system shift"""
    print(f"\n=== Test 6: DELETE /api/shifts/{shift_id} ===")
    
    response = requests.delete(
        f"{BASE_URL}/shifts/{shift_id}",
        cookies={"session_token": session_token}
    )
    
    if response.status_code != 200:
        log_test("DELETE /api/shifts/{shift_id}", False, f"Status {response.status_code}: {response.text}")
        return False
    
    data = response.json()
    log_test("DELETE /api/shifts/{shift_id}", True)
    
    if "reassigned" in data.get("message", "").lower():
        log_test("Delete message mentions reassignment", True)
    
    return True

def test_get_employee_shift(session_token, employee_id):
    """Test GET /api/employee-shifts/{employee_id}"""
    print(f"\n=== Test 7: GET /api/employee-shifts/{employee_id} ===")
    
    response = requests.get(
        f"{BASE_URL}/employee-shifts/{employee_id}",
        cookies={"session_token": session_token}
    )
    
    if response.status_code != 200:
        log_test("GET /api/employee-shifts/{employee_id}", False, 
                f"Status {response.status_code}: {response.text}")
        return None
    
    data = response.json()
    log_test("GET /api/employee-shifts/{employee_id}", True)
    
    # Should have shift information
    validations = [
        ("shift" in data, "has shift object"),
        ("shift_id" in data, "has shift_id"),
        (data.get("employee_id") == employee_id, "employee_id matches")
    ]
    
    for condition, description in validations:
        log_test(f"Employee shift {description}", condition)
    
    print(f"\nEmployee shift: {json.dumps(data, indent=2)}")
    return data

def test_assign_employee_shift(session_token, employee_id, shift_id):
    """Test POST /api/employee-shifts - Assign shift to employee"""
    print(f"\n=== Test 8: POST /api/employee-shifts ===")
    
    assign_data = {
        "employee_id": employee_id,
        "shift_id": shift_id
    }
    
    response = requests.post(
        f"{BASE_URL}/employee-shifts",
        json=assign_data,
        cookies={"session_token": session_token}
    )
    
    if response.status_code not in [200, 201]:
        log_test("POST /api/employee-shifts", False, f"Status {response.status_code}: {response.text}")
        return False
    
    data = response.json()
    log_test("POST /api/employee-shifts", True)
    
    # Validate assignment
    validations = [
        (data.get("employee_id") == employee_id, "employee_id correct"),
        (data.get("shift_id") == shift_id, "shift_id correct"),
        ("shift" in data, "includes shift details")
    ]
    
    for condition, description in validations:
        log_test(f"Shift assignment {description}", condition)
    
    return True

def test_create_shift_change_request_admin_blocked(admin_token):
    """Test that admin dept users cannot create shift change requests"""
    print("\n=== Test 9: POST /api/shift-change-requests (admin blocked) ===")
    
    # Get a shift to request
    shifts_response = requests.get(f"{BASE_URL}/shifts", cookies={"session_token": admin_token})
    if shifts_response.status_code != 200:
        log_warning("Could not get shifts for admin block test")
        return False
    
    shifts = shifts_response.json()
    if not shifts:
        log_warning("No shifts available for admin block test")
        return False
    
    shift_id = shifts[0]["shift_id"]
    
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    next_week = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    
    request_data = {
        "requested_shift_id": shift_id,
        "from_date": tomorrow,
        "to_date": next_week,
        "reason": "Testing admin block"
    }
    
    response = requests.post(
        f"{BASE_URL}/shift-change-requests",
        json=request_data,
        cookies={"session_token": admin_token}
    )
    
    # Should fail with 403
    if response.status_code == 403 and "admin" in response.text.lower():
        log_test("Admin dept users cannot create shift change requests", True)
        return True
    else:
        log_test("Admin dept users cannot create shift change requests", False,
                f"Expected 403 with 'admin', got {response.status_code}: {response.text}")
        return False

def test_create_shift_change_request_past_date(employee_token):
    """Test that past dates are rejected"""
    print("\n=== Test 10: POST /api/shift-change-requests (past date) ===")
    
    # Get a shift to request
    shifts_response = requests.get(f"{BASE_URL}/shifts", cookies={"session_token": employee_token})
    if shifts_response.status_code != 200:
        log_warning("Could not get shifts for past date test")
        return False
    
    shifts = shifts_response.json()
    if not shifts:
        log_warning("No shifts available for past date test")
        return False
    
    shift_id = shifts[0]["shift_id"]
    
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    today = datetime.now().strftime("%Y-%m-%d")
    
    request_data = {
        "requested_shift_id": shift_id,
        "from_date": yesterday,
        "to_date": today,
        "reason": "Testing past date rejection"
    }
    
    response = requests.post(
        f"{BASE_URL}/shift-change-requests",
        json=request_data,
        cookies={"session_token": employee_token}
    )
    
    # Should fail with 400
    if response.status_code == 400 and "past" in response.text.lower():
        log_test("Past dates rejected", True)
        return True
    else:
        log_test("Past dates rejected", False,
                f"Expected 400 with 'past', got {response.status_code}: {response.text}")
        return False

def test_create_shift_change_request_valid(employee_token, shift_id):
    """Test creating a valid shift change request"""
    print("\n=== Test 11: POST /api/shift-change-requests (valid) ===")
    
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    next_week = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    
    request_data = {
        "requested_shift_id": shift_id,
        "from_date": tomorrow,
        "to_date": next_week,
        "reason": "Need to adjust schedule for personal commitments"
    }
    
    response = requests.post(
        f"{BASE_URL}/shift-change-requests",
        json=request_data,
        cookies={"session_token": employee_token}
    )
    
    if response.status_code not in [200, 201]:
        log_test("POST /api/shift-change-requests (valid)", False,
                f"Status {response.status_code}: {response.text}")
        return None
    
    data = response.json()
    log_test("POST /api/shift-change-requests (valid)", True)
    
    # Validate request
    validations = [
        (data.get("status") == "Pending", "status is Pending"),
        (data.get("requested_shift_id") == shift_id, "shift_id correct"),
        (data.get("from_date") == tomorrow, "from_date correct"),
        (data.get("to_date") == next_week, "to_date correct"),
        ("request_id" in data, "has request_id"),
        ("employee_id" in data, "has employee_id")
    ]
    
    for condition, description in validations:
        log_test(f"Shift change request {description}", condition)
    
    print(f"\nCreated request: {json.dumps(data, indent=2)}")
    return data

def test_create_overlapping_request(employee_token, shift_id):
    """Test that overlapping requests are rejected"""
    print("\n=== Test 12: POST /api/shift-change-requests (overlapping) ===")
    
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    next_week = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    
    request_data = {
        "requested_shift_id": shift_id,
        "from_date": tomorrow,
        "to_date": next_week,
        "reason": "Testing overlapping rejection"
    }
    
    response = requests.post(
        f"{BASE_URL}/shift-change-requests",
        json=request_data,
        cookies={"session_token": employee_token}
    )
    
    # Should fail with 400
    if response.status_code == 400 and ("overlap" in response.text.lower() or "already have" in response.text.lower()):
        log_test("Overlapping requests rejected", True)
        return True
    else:
        log_test("Overlapping requests rejected", False,
                f"Expected 400 with 'overlap', got {response.status_code}: {response.text}")
        return False

def test_review_shift_change_request_approve(admin_token, request_id):
    """Test admin approving a shift change request"""
    print(f"\n=== Test 13: PUT /api/shift-change-requests/{request_id}/review (approve) ===")
    
    review_data = {
        "status": "Approved",
        "admin_notes": "Approved for valid reason"
    }
    
    response = requests.put(
        f"{BASE_URL}/shift-change-requests/{request_id}/review",
        json=review_data,
        cookies={"session_token": admin_token}
    )
    
    if response.status_code != 200:
        log_test("PUT /api/shift-change-requests/{id}/review (approve)", False,
                f"Status {response.status_code}: {response.text}")
        return False
    
    data = response.json()
    log_test("PUT /api/shift-change-requests/{id}/review (approve)", True)
    
    # Validate review
    validations = [
        (data.get("status") == "Approved", "status is Approved"),
        (data.get("admin_notes") == "Approved for valid reason", "admin_notes saved"),
        ("reviewed_by" in data, "has reviewed_by"),
        ("reviewed_at" in data, "has reviewed_at")
    ]
    
    for condition, description in validations:
        log_test(f"Approved request {description}", condition)
    
    return True

def test_create_and_reject_request(employee_token, admin_token, shift_id):
    """Test creating and rejecting a shift change request"""
    print("\n=== Test 14: Create and Reject Shift Change Request ===")
    
    # Create another request
    two_weeks = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
    three_weeks = (datetime.now() + timedelta(days=21)).strftime("%Y-%m-%d")
    
    request_data = {
        "requested_shift_id": shift_id,
        "from_date": two_weeks,
        "to_date": three_weeks,
        "reason": "Testing rejection flow"
    }
    
    response = requests.post(
        f"{BASE_URL}/shift-change-requests",
        json=request_data,
        cookies={"session_token": employee_token}
    )
    
    if response.status_code not in [200, 201]:
        log_test("Create request for rejection test", False,
                f"Status {response.status_code}: {response.text}")
        return None
    
    request_id = response.json().get("request_id")
    log_test("Create request for rejection test", True)
    
    # Reject it
    review_data = {
        "status": "Rejected",
        "admin_notes": "Not possible at this time"
    }
    
    response = requests.put(
        f"{BASE_URL}/shift-change-requests/{request_id}/review",
        json=review_data,
        cookies={"session_token": admin_token}
    )
    
    if response.status_code != 200:
        log_test("PUT /api/shift-change-requests/{id}/review (reject)", False,
                f"Status {response.status_code}: {response.text}")
        return None
    
    data = response.json()
    log_test("PUT /api/shift-change-requests/{id}/review (reject)", True)
    
    # Validate rejection
    validations = [
        (data.get("status") == "Rejected", "status is Rejected"),
        (data.get("admin_notes") == "Not possible at this time", "admin_notes saved")
    ]
    
    for condition, description in validations:
        log_test(f"Rejected request {description}", condition)
    
    return request_id

def test_cancel_own_pending_request(employee_token, shift_id):
    """Test employee canceling their own pending request"""
    print("\n=== Test 15: DELETE /api/shift-change-requests/{id} (cancel own) ===")
    
    # Create a new pending request
    four_weeks = (datetime.now() + timedelta(days=28)).strftime("%Y-%m-%d")
    five_weeks = (datetime.now() + timedelta(days=35)).strftime("%Y-%m-%d")
    
    request_data = {
        "requested_shift_id": shift_id,
        "from_date": four_weeks,
        "to_date": five_weeks,
        "reason": "Testing cancellation"
    }
    
    response = requests.post(
        f"{BASE_URL}/shift-change-requests",
        json=request_data,
        cookies={"session_token": employee_token}
    )
    
    if response.status_code not in [200, 201]:
        log_test("Create request for cancellation test", False,
                f"Status {response.status_code}: {response.text}")
        return False
    
    request_id = response.json().get("request_id")
    log_test("Create request for cancellation test", True)
    
    # Cancel it
    response = requests.delete(
        f"{BASE_URL}/shift-change-requests/{request_id}",
        cookies={"session_token": employee_token}
    )
    
    if response.status_code != 200:
        log_test("DELETE /api/shift-change-requests/{id} (cancel)", False,
                f"Status {response.status_code}: {response.text}")
        return False
    
    log_test("DELETE /api/shift-change-requests/{id} (cancel)", True)
    return True

def test_cannot_cancel_approved_request(employee_token, approved_request_id):
    """Test that approved requests cannot be cancelled"""
    print(f"\n=== Test 16: DELETE /api/shift-change-requests/{approved_request_id} (approved) ===")
    
    response = requests.delete(
        f"{BASE_URL}/shift-change-requests/{approved_request_id}",
        cookies={"session_token": employee_token}
    )
    
    # Should fail with 400
    if response.status_code == 400 and "pending" in response.text.lower():
        log_test("Cannot cancel approved request", True)
        return True
    else:
        log_test("Cannot cancel approved request", False,
                f"Expected 400 with 'pending', got {response.status_code}: {response.text}")
        return False

def test_non_admin_cannot_review(employee_token, request_id):
    """Test that non-admin cannot review requests"""
    print(f"\n=== Test 17: PUT /api/shift-change-requests/{request_id}/review (non-admin) ===")
    
    review_data = {
        "status": "Approved"
    }
    
    response = requests.put(
        f"{BASE_URL}/shift-change-requests/{request_id}/review",
        json=review_data,
        cookies={"session_token": employee_token}
    )
    
    # Should fail with 403
    if response.status_code == 403:
        log_test("Non-admin cannot review requests", True)
        return True
    else:
        log_test("Non-admin cannot review requests", False,
                f"Expected 403, got {response.status_code}: {response.text}")
        return False

def print_summary():
    """Print test summary"""
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    
    print(f"\n✅ PASSED: {len(test_results['passed'])}")
    for test in test_results['passed']:
        print(f"  {test}")
    
    if test_results['failed']:
        print(f"\n❌ FAILED: {len(test_results['failed'])}")
        for test in test_results['failed']:
            print(f"  {test}")
    
    if test_results['warnings']:
        print(f"\n⚠️  WARNINGS: {len(test_results['warnings'])}")
        for warning in test_results['warnings']:
            print(f"  {warning}")
    
    total = len(test_results['passed']) + len(test_results['failed'])
    pass_rate = (len(test_results['passed']) / total * 100) if total > 0 else 0
    
    print(f"\nTotal Tests: {total}")
    print(f"Pass Rate: {pass_rate:.1f}%")
    print("="*70)

def main():
    """Run all tests"""
    print("="*70)
    print("SHIFT MANAGEMENT SYSTEM - BACKEND API TESTS")
    print("="*70)
    
    # Create sessions
    admin_token = create_admin_session()
    if not admin_token:
        print("❌ Cannot proceed without admin session")
        return
    
    employee_token, employee_id = create_employee_session()
    if not employee_token:
        print("❌ Cannot proceed without employee session")
        return
    
    # Test 1: Get shifts and validate default shift
    default_shift = test_get_shifts(admin_token)
    if not default_shift:
        print("❌ Cannot proceed without default shift")
        return
    
    default_shift_id = default_shift.get("shift_id")
    
    # Test 2: Create a new shift
    created_shift = test_create_shift(admin_token)
    if not created_shift:
        print("⚠️  Skipping tests that depend on created shift")
        created_shift_id = default_shift_id
    else:
        created_shift_id = created_shift.get("shift_id")
        
        # Test 3: Update the created shift
        test_update_shift(admin_token, created_shift_id)
    
    # Test 4: Try to rename system default shift (should fail)
    test_update_system_default_shift(admin_token, default_shift_id)
    
    # Test 5: Try to delete system default shift (should fail)
    test_delete_system_default_shift(admin_token, default_shift_id)
    
    # Test 6: Delete the created shift (if we created one)
    if created_shift and created_shift_id != default_shift_id:
        test_delete_shift(admin_token, created_shift_id)
    
    # Test 7: Get employee shift (use GM001 which exists from seed)
    test_get_employee_shift(admin_token, "GM001")
    
    # Test 8: Assign shift to employee (use GM001)
    test_assign_employee_shift(admin_token, "GM001", default_shift_id)
    
    # Test 9: Admin cannot create shift change requests
    test_create_shift_change_request_admin_blocked(admin_token)
    
    # Test 10: Past dates rejected
    test_create_shift_change_request_past_date(employee_token)
    
    # Test 11: Create valid shift change request
    created_request = test_create_shift_change_request_valid(employee_token, default_shift_id)
    if not created_request:
        print("⚠️  Skipping tests that depend on created request")
        return
    
    request_id = created_request.get("request_id")
    
    # Test 12: Overlapping requests rejected
    test_create_overlapping_request(employee_token, default_shift_id)
    
    # Test 13: Admin approves request
    test_review_shift_change_request_approve(admin_token, request_id)
    
    # Test 14: Create and reject another request
    rejected_request_id = test_create_and_reject_request(employee_token, admin_token, default_shift_id)
    
    # Test 15: Cancel own pending request
    test_cancel_own_pending_request(employee_token, default_shift_id)
    
    # Test 16: Cannot cancel approved request
    test_cannot_cancel_approved_request(employee_token, request_id)
    
    # Test 17: Non-admin cannot review
    if rejected_request_id:
        test_non_admin_cannot_review(employee_token, rejected_request_id)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
