"""Module 2 Backend Tests: Teams, Notion Databases, Performance, Webhooks, seed-v2"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://team-admin-25.preview.emergentagent.com').rstrip('/')
SESSION_TOKEN = "test_session_mod2_1775313680171"

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {SESSION_TOKEN}"
}

# ---- Departments ----

def test_get_departments_with_is_system():
    r = requests.get(f"{BASE_URL}/api/departments", headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # Check is_system field present
    system_depts = [d for d in data if d.get("is_system")]
    assert len(system_depts) > 0, "Should have at least some system departments"
    print(f"PASS: {len(data)} departments, {len(system_depts)} system")


def test_delete_system_department_blocked():
    r = requests.get(f"{BASE_URL}/api/departments", headers=HEADERS)
    depts = r.json()
    system_dept = next((d for d in depts if d.get("is_system")), None)
    assert system_dept, "No system department found"
    dept_id = system_dept["department_id"]
    del_r = requests.delete(f"{BASE_URL}/api/departments/{dept_id}", headers=HEADERS)
    assert del_r.status_code == 400, f"Expected 400 but got {del_r.status_code}: {del_r.text}"
    print(f"PASS: Delete system department blocked with 400")


# ---- Teams ----

def test_get_teams():
    r = requests.get(f"{BASE_URL}/api/teams", headers=HEADERS)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    print(f"PASS: GET /api/teams returns {len(r.json())} teams")


def test_create_update_delete_team():
    # Create
    r = requests.post(f"{BASE_URL}/api/teams", headers=HEADERS, json={"team_name": "TEST_Team_ModuleTwo", "team_manager_id": None})
    assert r.status_code == 200
    team = r.json()
    assert team["team_name"] == "TEST_Team_ModuleTwo"
    team_id = team["team_id"]
    print(f"PASS: Team created: {team_id}")

    # Update
    r2 = requests.put(f"{BASE_URL}/api/teams/{team_id}", headers=HEADERS, json={"team_name": "TEST_Team_Updated", "team_manager_id": None})
    assert r2.status_code == 200
    assert r2.json()["team_name"] == "TEST_Team_Updated"
    print("PASS: Team updated")

    # Delete
    r3 = requests.delete(f"{BASE_URL}/api/teams/{team_id}", headers=HEADERS)
    assert r3.status_code == 200
    print("PASS: Team deleted")

    # Verify deleted
    r4 = requests.get(f"{BASE_URL}/api/teams", headers=HEADERS)
    teams = r4.json()
    assert not any(t["team_id"] == team_id for t in teams)
    print("PASS: Team no longer in list after delete")


# ---- Notion Databases ----

def test_get_notion_databases():
    r = requests.get(f"{BASE_URL}/api/notion-databases", headers=HEADERS)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    print(f"PASS: GET /api/notion-databases returns {len(r.json())} entries")


def test_create_delete_notion_database():
    # Need a team first
    r_team = requests.post(f"{BASE_URL}/api/teams", headers=HEADERS, json={"team_name": "TEST_NotionTeam", "team_manager_id": None})
    assert r_team.status_code == 200
    team_id = r_team.json()["team_id"]

    payload = {
        "database_name": "TEST_NotionDB",
        "notion_api_token": "secret_test123",
        "notion_database_id": "test_db_id_123",
        "database_type": "Video Editing",
        "team_id": team_id,
        "is_active": True
    }
    r = requests.post(f"{BASE_URL}/api/notion-databases", headers=HEADERS, json=payload)
    assert r.status_code == 200
    ndb = r.json()
    db_id = ndb["db_id"]
    assert ndb["database_name"] == "TEST_NotionDB"
    print(f"PASS: Notion database created: {db_id}")

    # Delete
    r2 = requests.delete(f"{BASE_URL}/api/notion-databases/{db_id}", headers=HEADERS)
    assert r2.status_code == 200
    print("PASS: Notion database deleted")

    # Cleanup team
    requests.delete(f"{BASE_URL}/api/teams/{team_id}", headers=HEADERS)


# ---- Performance ----

def test_get_performance():
    r = requests.get(f"{BASE_URL}/api/performance", headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    print(f"PASS: GET /api/performance returns {len(data)} records")


# ---- Me/Employee ----

def test_get_me_employee():
    r = requests.get(f"{BASE_URL}/api/me/employee", headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    print(f"PASS: GET /api/me/employee returns: {data.get('employee_id', 'no employee found')}")


# ---- Webhook ----

def test_webhook_accepts_data():
    payload = {"message": "test", "object": "not_a_page"}
    r = requests.post(f"{BASE_URL}/api/webhooks/notion/test_db_id_123", json=payload)
    assert r.status_code == 200
    print(f"PASS: Webhook accepted data: {r.json()}")


# ---- seed-v2 ----

def test_seed_v2():
    r = requests.post(f"{BASE_URL}/api/seed-v2", headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert "message" in data or "status" in data or "success" in data or isinstance(data, dict)
    print(f"PASS: seed-v2 returned: {data}")
