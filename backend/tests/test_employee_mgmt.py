"""Backend tests for GrowItUp Employee Management System"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = "test_session_1775304935406"

HEADERS = {"Authorization": f"Bearer {SESSION_TOKEN}"}


# =================== HEALTH ===================
class TestHealth:
    def test_api_root(self):
        r = requests.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert "message" in r.json()


# =================== AUTH ===================
class TestAuth:
    def test_auth_me_with_valid_session(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "info.growitup@gmail.com"
        assert data["is_admin"] == True

    def test_auth_me_without_session(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_access_denied_non_employee(self):
        """Test that non-employee email gets 403 - this is tested at /api/auth/session level"""
        # We can't easily test this without a real Emergent session
        # but we verify the endpoint exists
        r = requests.post(f"{BASE_URL}/api/auth/session", json={"session_id": "fake_id"})
        assert r.status_code in [400, 500]  # Invalid session id or auth service error


# =================== DEPARTMENTS ===================
class TestDepartments:
    def test_get_departments(self):
        r = requests.get(f"{BASE_URL}/api/departments", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # seeded: Operations, Sales, Admin
        names = [d["department_name"] for d in data]
        assert "Operations" in names
        assert "Sales" in names
        assert "Admin" in names

    def test_create_department(self):
        r = requests.post(f"{BASE_URL}/api/departments",
                          json={"department_name": "TEST_Dept"},
                          headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["department_name"] == "TEST_Dept"
        assert "department_id" in data
        TestDepartments.test_dept_id = data["department_id"]

    def test_duplicate_department(self):
        r = requests.post(f"{BASE_URL}/api/departments",
                          json={"department_name": "Operations"},
                          headers=HEADERS)
        assert r.status_code == 400

    def test_update_department(self):
        if not hasattr(TestDepartments, 'test_dept_id'):
            pytest.skip("No test department created")
        r = requests.put(f"{BASE_URL}/api/departments/{TestDepartments.test_dept_id}",
                         json={"department_name": "TEST_Dept_Updated"},
                         headers=HEADERS)
        assert r.status_code == 200
        assert r.json()["department_name"] == "TEST_Dept_Updated"

    def test_delete_department(self):
        if not hasattr(TestDepartments, 'test_dept_id'):
            pytest.skip("No test department created")
        r = requests.delete(f"{BASE_URL}/api/departments/{TestDepartments.test_dept_id}",
                            headers=HEADERS)
        assert r.status_code == 200


# =================== JOB POSITIONS ===================
class TestJobPositions:
    def test_get_all_job_positions(self):
        r = requests.get(f"{BASE_URL}/api/job-positions", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 8  # seeded 8 positions

    def test_get_positions_by_department(self):
        r = requests.get(f"{BASE_URL}/api/job-positions?department_id=dept_operations",
                         headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert all(p["department_id"] == "dept_operations" for p in data)

    def test_create_job_position(self):
        r = requests.post(f"{BASE_URL}/api/job-positions",
                          json={"position_name": "TEST_Position",
                                "department_id": "dept_admin",
                                "has_levels": True,
                                "available_levels": ["L1", "L2"]},
                          headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["position_name"] == "TEST_Position"
        assert data["has_levels"] == True
        assert data["available_levels"] == ["L1", "L2"]
        TestJobPositions.test_pos_id = data["position_id"]

    def test_delete_job_position(self):
        if not hasattr(TestJobPositions, 'test_pos_id'):
            pytest.skip("No test position created")
        r = requests.delete(f"{BASE_URL}/api/job-positions/{TestJobPositions.test_pos_id}",
                            headers=HEADERS)
        assert r.status_code == 200


# =================== STATES & CITIES ===================
class TestStatesAndCities:
    def test_get_states(self):
        r = requests.get(f"{BASE_URL}/api/states", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 36

    def test_get_cities_by_state(self):
        r = requests.get(f"{BASE_URL}/api/cities?state_id=state_014", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert any(c["city_name"] == "Mumbai" for c in data)


# =================== EMPLOYEES ===================
class TestEmployees:
    def test_get_employees(self):
        r = requests.get(f"{BASE_URL}/api/employees", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # At least admin employee seeded
        assert len(data) >= 1

    def test_get_admin_employee(self):
        r = requests.get(f"{BASE_URL}/api/employees/GM001", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["employee_id"] == "GM001"
        assert data["work_email"] == "info.growitup@gmail.com"

    def test_employee_search(self):
        r = requests.get(f"{BASE_URL}/api/employees?search=Admin", headers=HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1

    def test_create_and_delete_employee(self):
        payload = {
            "first_name": "TEST",
            "last_name": "Employee",
            "personal_email": "test.employee@personal.com",
            "phone": "9876543210",
            "date_of_birth": "1995-06-15",
            "gender": "Male",
            "qualification": "Bachelor's",
            "address": "123 Test St",
            "country": "India",
            "state_id": "state_014",
            "state_name": "Maharashtra",
            "city_id": "city_mh_001",
            "city_name": "Mumbai",
            "zipcode": "400001",
            "emergency_contact_name": "Test Contact",
            "emergency_contact_number": "9876543211",
            "emergency_contact_relation": "Parent",
            "work_email": "test.employee.work@growitup.com",
            "department_id": "dept_operations",
            "department_name": "Operations",
            "job_position_id": "pos_script_writer",
            "job_position_name": "Script Writer",
            "employee_type": "Full-time",
            "joining_date": "2024-01-01",
            "basic_salary": 50000.0,
            "bank_name": "HDFC Bank",
            "account_name": "TEST Employee",
            "account_number": "12345678901",
            "ifsc_code": "HDFC0001234",
            "status": "Active"
        }
        create_r = requests.post(f"{BASE_URL}/api/employees", json=payload, headers=HEADERS)
        assert create_r.status_code == 200
        created = create_r.json()
        emp_id = created["employee_id"]
        assert created["first_name"] == "TEST"

        # Verify persistence
        get_r = requests.get(f"{BASE_URL}/api/employees/{emp_id}", headers=HEADERS)
        assert get_r.status_code == 200
        assert get_r.json()["work_email"] == "test.employee.work@growitup.com"

        # Delete
        del_r = requests.delete(f"{BASE_URL}/api/employees/{emp_id}", headers=HEADERS)
        assert del_r.status_code == 200

        # Verify deleted
        get_r2 = requests.get(f"{BASE_URL}/api/employees/{emp_id}", headers=HEADERS)
        assert get_r2.status_code == 404

    def test_employee_not_found(self):
        r = requests.get(f"{BASE_URL}/api/employees/NONEXISTENT", headers=HEADERS)
        assert r.status_code == 404

    def test_delete_dept_with_employees_fails(self):
        """Cannot delete dept_admin since GM001 belongs to it"""
        r = requests.delete(f"{BASE_URL}/api/departments/dept_admin", headers=HEADERS)
        assert r.status_code == 400
