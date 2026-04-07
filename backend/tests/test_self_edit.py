"""Tests for PATCH /api/employees/{emp_id}/self - Self-edit endpoint"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_SESSION = "test_session_1775319753739"
GM002_SESSION = "gm002_test_session"


class TestSelfEditEndpoint:
    """Test PATCH /api/employees/{emp_id}/self"""

    def test_gm002_self_edit_success(self):
        """GM002 can edit own profile"""
        response = requests.patch(
            f"{BASE_URL}/api/employees/GM002/self",
            json={"address": "123 Test Street", "city_name": "Mumbai"},
            cookies={"session_token": GM002_SESSION}
        )
        print(f"GM002 self edit status: {response.status_code}, body: {response.text[:200]}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("address") == "123 Test Street"
        assert data.get("city_name") == "Mumbai"

    def test_gm002_self_edit_bank_info(self):
        """GM002 can update bank info"""
        response = requests.patch(
            f"{BASE_URL}/api/employees/GM002/self",
            json={"bank_name": "HDFC Bank", "account_name": "Gaurav Savaliya"},
            cookies={"session_token": GM002_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("bank_name") == "HDFC Bank"

    def test_gm002_self_edit_emergency_contact(self):
        """GM002 can update emergency contact"""
        response = requests.patch(
            f"{BASE_URL}/api/employees/GM002/self",
            json={"emergency_contact_name": "Test Contact", "emergency_contact_relation": "Brother"},
            cookies={"session_token": GM002_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("emergency_contact_name") == "Test Contact"

    def test_admin_cannot_self_edit_gm002(self):
        """Admin session should get 403 when trying to self-edit GM002 (ownership check)"""
        response = requests.patch(
            f"{BASE_URL}/api/employees/GM002/self",
            json={"address": "Should Fail"},
            cookies={"session_token": ADMIN_SESSION}
        )
        print(f"Admin editing GM002 self: {response.status_code}")
        assert response.status_code == 403

    def test_self_edit_nonexistent_employee(self):
        """Returns 404 for non-existent employee"""
        response = requests.patch(
            f"{BASE_URL}/api/employees/NONEXISTENT/self",
            json={"address": "Test"},
            cookies={"session_token": GM002_SESSION}
        )
        assert response.status_code in [403, 404]

    def test_self_edit_locked_fields_ignored(self):
        """Locked fields (first_name, email) should not be updatable via self endpoint"""
        # Get current state
        get_resp = requests.get(
            f"{BASE_URL}/api/employees/GM002",
            cookies={"session_token": GM002_SESSION}
        )
        original_first_name = get_resp.json().get("first_name") if get_resp.status_code == 200 else None

        # SelfEditBody model doesn't include first_name, so it's simply ignored
        response = requests.patch(
            f"{BASE_URL}/api/employees/GM002/self",
            json={"first_name": "HackedName", "address": "Verified Address"},
            cookies={"session_token": GM002_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        # first_name should not have changed
        if original_first_name:
            assert data.get("first_name") == original_first_name
        print(f"first_name in response: {data.get('first_name')}, original: {original_first_name}")
