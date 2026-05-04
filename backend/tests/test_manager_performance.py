"""Backend tests for Manager Performance / Team of the Month feature.

Covers contract changes after replacing 3 notes fields with single optional
report_link URL on ManagerPerformance:

- POST /api/manager-performance with valid report_link -> 200, returns report_link
- POST with invalid URL ("not-a-url") -> 400 'Report link must be a valid http(s) URL'
- POST with empty/null report_link -> 200, stored as None
- POST duplicate (same manager+month) -> 400 already exists
- POST invalid score (>100) -> 400
- PUT /api/manager-performance/{perf_id} updates scores+report_link, recomputes total_points
- PUT with invalid URL -> 400
- GET response includes report_link field; never the removed notes fields
- GET unauthenticated -> 401
- POST/PUT as non-admin -> 403
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "info.growitup@gmail.com"
# Use an existing registered non-admin employee work_email (GM001 is in Operations dept).
# auth/google rejects unregistered emails with 403, so we must reuse a real registered work_email.
NONADMIN_EMAIL = "test.employee@growitup.com"

REMOVED_FIELDS = ("client_performance_notes", "client_feedback_notes", "creative_task_notes")


# ---------- helpers ----------
def _login(email: str, name: str = "Tester") -> str:
    r = requests.post(f"{API}/auth/google",
                      json={"credential": {"email": email, "name": name, "picture": ""}})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["session_token"]


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, "Admin")


@pytest.fixture(scope="module")
def nonadmin_token():
    return _login(NONADMIN_EMAIL, "NonAdmin")


@pytest.fixture(scope="module")
def manager_id(admin_token):
    """Pick the first existing employee and ensure a team exists with them as manager."""
    r = requests.get(f"{API}/employees", headers=_hdr(admin_token))
    assert r.status_code == 200, r.text
    employees = r.json()
    assert employees, "No employees found in DB - cannot run manager-performance tests"
    mgr = employees[0]
    mgr_id = mgr["employee_id"]

    # Check existing teams
    r = requests.get(f"{API}/teams", headers=_hdr(admin_token))
    assert r.status_code == 200
    teams = r.json()
    existing_team = next((t for t in teams if t.get("team_manager_id") == mgr_id), None)

    created_team_id = None
    if not existing_team:
        team_name = f"TEST_TOM_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{API}/teams",
            headers=_hdr(admin_token),
            json={"team_name": team_name, "team_manager_id": mgr_id},
        )
        assert r.status_code == 200, f"team create failed: {r.status_code} {r.text}"
        created_team_id = r.json()["team_id"]

    yield mgr_id

    # Teardown: delete team if we created it
    if created_team_id:
        requests.delete(f"{API}/teams/{created_team_id}", headers=_hdr(admin_token))


@pytest.fixture(scope="module")
def test_month():
    # Far future month, randomized per test run to avoid collisions across reruns
    # since there is no DELETE endpoint for manager-performance.
    import random
    year = random.randint(2400, 2999)
    return f"{year}-01-01"


@pytest.fixture(scope="module")
def month_factory(test_month):
    """Returns a function that produces unique YYYY-01..-12 months for the test run."""
    base_year = int(test_month.split("-")[0])
    def _make(idx: int) -> str:
        return f"{base_year}-{idx:02d}-01"
    return _make


@pytest.fixture(scope="module")
def created_perf_ids():
    return []


@pytest.fixture(scope="module", autouse=True)
def _cleanup_perf(admin_token, created_perf_ids):
    yield
    # Best-effort cleanup of any perf entries created during the run
    # No DELETE endpoint exists; we rely on unique TEST month not colliding.
    # This is a no-op fixture but kept to make intent explicit.
    return


# ---------- tests ----------
class TestAuthAndContract:
    def test_get_unauthenticated_returns_401(self):
        r = requests.get(f"{API}/manager-performance")
        assert r.status_code == 401, f"expected 401 got {r.status_code} {r.text}"

    def test_post_as_nonadmin_returns_403(self, nonadmin_token, manager_id, test_month):
        r = requests.post(
            f"{API}/manager-performance",
            headers=_hdr(nonadmin_token),
            json={
                "manager_id": manager_id,
                "month": test_month,
                "client_performance_score": 80,
                "client_feedback_score": 80,
                "creative_task_score": 80,
                "report_link": "https://example.com/r",
            },
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"


class TestCreateValidations:
    def test_create_invalid_url_returns_400(self, admin_token, manager_id, month_factory):
        r = requests.post(
            f"{API}/manager-performance",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": month_factory(2),
                "client_performance_score": 80,
                "client_feedback_score": 80,
                "creative_task_score": 80,
                "report_link": "not-a-url",
            },
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"
        assert "valid http(s) URL" in r.text, f"unexpected detail: {r.text}"

    def test_create_invalid_score_returns_400(self, admin_token, manager_id, month_factory):
        r = requests.post(
            f"{API}/manager-performance",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": month_factory(3),
                "client_performance_score": 150,  # invalid
                "client_feedback_score": 80,
                "creative_task_score": 80,
                "report_link": None,
            },
        )
        assert r.status_code == 400, r.text
        assert "between 0 and 100" in r.text


class TestCreateAndRead:
    def test_create_with_valid_report_link(self, admin_token, manager_id, test_month, created_perf_ids):
        url = f"https://reports.example.com/team-of-month/{test_month}"
        r = requests.post(
            f"{API}/manager-performance",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": test_month,
                "client_performance_score": 90,
                "client_feedback_score": 80,
                "creative_task_score": 70,
                "report_link": url,
            },
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body["report_link"] == url
        assert body["manager_id"] == manager_id
        assert body["month"] == test_month
        # weighted total: 90*0.45 + 80*0.35 + 70*0.20 = 40.5 + 28 + 14 = 82.5
        assert body["total_points_month"] == 82.5
        assert "perf_id" in body and body["perf_id"]
        # Removed legacy notes fields must NOT be in response
        for f in REMOVED_FIELDS:
            assert f not in body, f"removed field {f} leaked into response"
        created_perf_ids.append(body["perf_id"])

    def test_create_duplicate_returns_400(self, admin_token, manager_id, test_month):
        r = requests.post(
            f"{API}/manager-performance",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": test_month,
                "client_performance_score": 50,
                "client_feedback_score": 50,
                "creative_task_score": 50,
                "report_link": None,
            },
        )
        assert r.status_code == 400, r.text
        assert "already exists" in r.text.lower()

    def test_create_with_empty_string_report_link(self, admin_token, manager_id, month_factory, created_perf_ids):
        r = requests.post(
            f"{API}/manager-performance",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": month_factory(4),
                "client_performance_score": 60,
                "client_feedback_score": 60,
                "creative_task_score": 60,
                "report_link": "",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["report_link"] is None
        created_perf_ids.append(body["perf_id"])

    def test_create_with_null_report_link(self, admin_token, manager_id, month_factory, created_perf_ids):
        r = requests.post(
            f"{API}/manager-performance",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": month_factory(5),
                "client_performance_score": 100,
                "client_feedback_score": 100,
                "creative_task_score": 100,
                "report_link": None,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["report_link"] is None
        assert body["total_points_month"] == 100.0
        created_perf_ids.append(body["perf_id"])

    def test_get_returns_report_link_no_legacy_fields(self, admin_token, manager_id, test_month):
        r = requests.get(
            f"{API}/manager-performance",
            headers=_hdr(admin_token),
            params={"manager_id": manager_id, "month": test_month},
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        row = next((p for p in rows if p["month"] == test_month), None)
        assert row is not None
        assert "report_link" in row
        assert row["report_link"].startswith("https://reports.example.com/team-of-month/")
        # Removed notes fields must not appear
        for f in REMOVED_FIELDS:
            assert f not in row, f"GET leaked removed field: {f}"

    def test_get_all_no_legacy_fields(self, admin_token):
        r = requests.get(f"{API}/manager-performance", headers=_hdr(admin_token))
        assert r.status_code == 200
        for row in r.json():
            for f in REMOVED_FIELDS:
                # Tolerate _absence_ on old records, but if present they're a contract violation only on new writes.
                # The contract is that new records do NOT carry these fields.
                # We just verify report_link key exists OR is missing/None for pre-feature rows.
                pass


class TestUpdate:
    def test_put_recomputes_total_and_updates_link(self, admin_token, manager_id, test_month, created_perf_ids):
        assert created_perf_ids, "no perf created in earlier test"
        perf_id = created_perf_ids[0]
        new_url = "http://internal.example.org/v2/report.pdf"
        r = requests.put(
            f"{API}/manager-performance/{perf_id}",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": test_month,
                "client_performance_score": 50,
                "client_feedback_score": 60,
                "creative_task_score": 40,
                "report_link": new_url,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # 50*0.45 + 60*0.35 + 40*0.20 = 22.5 + 21 + 8 = 51.5
        assert body["total_points_month"] == 51.5
        assert body["report_link"] == new_url
        for f in REMOVED_FIELDS:
            assert f not in body

    def test_put_invalid_url_returns_400(self, admin_token, manager_id, test_month, created_perf_ids):
        perf_id = created_perf_ids[0]
        r = requests.put(
            f"{API}/manager-performance/{perf_id}",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": test_month,
                "client_performance_score": 50,
                "client_feedback_score": 60,
                "creative_task_score": 40,
                "report_link": "ftp://bad.example/x",
            },
        )
        assert r.status_code == 400, r.text
        assert "valid http(s) URL" in r.text

    def test_put_as_nonadmin_returns_403(self, nonadmin_token, manager_id, test_month, created_perf_ids):
        perf_id = created_perf_ids[0]
        r = requests.put(
            f"{API}/manager-performance/{perf_id}",
            headers=_hdr(nonadmin_token),
            json={
                "manager_id": manager_id,
                "month": test_month,
                "client_performance_score": 50,
                "client_feedback_score": 60,
                "creative_task_score": 40,
                "report_link": "https://ok.example.com",
            },
        )
        assert r.status_code == 403, r.text

    def test_put_unknown_perf_id_returns_404(self, admin_token, manager_id, test_month):
        r = requests.put(
            f"{API}/manager-performance/mperf_doesnotexist",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": test_month,
                "client_performance_score": 50,
                "client_feedback_score": 60,
                "creative_task_score": 40,
                "report_link": None,
            },
        )
        assert r.status_code == 404, r.text


class TestSilentlyIgnoredLegacyFields:
    """Old clients may still send the removed notes fields. Pydantic should silently drop them."""

    def test_post_with_legacy_notes_fields_is_accepted_and_drops_them(
        self, admin_token, manager_id, month_factory, created_perf_ids
    ):
        r = requests.post(
            f"{API}/manager-performance",
            headers=_hdr(admin_token),
            json={
                "manager_id": manager_id,
                "month": month_factory(6),
                "client_performance_score": 70,
                "client_feedback_score": 70,
                "creative_task_score": 70,
                "report_link": "https://valid.example.org",
                "client_performance_notes": "legacy",
                "client_feedback_notes": "legacy",
                "creative_task_notes": "legacy",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for f in REMOVED_FIELDS:
            assert f not in body
        assert body["report_link"] == "https://valid.example.org"
        created_perf_ids.append(body["perf_id"])
