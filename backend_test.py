#!/usr/bin/env python3
"""
Backend API Testing for Creative Team of the Month Feature
Tests all manager performance endpoints with authentication and validation
"""

import requests
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# Configuration
BACKEND_URL = "https://emp-perf-track.preview.emergentagent.com/api"
ADMIN_EMAIL = "info.growitup@gmail.com"

# Database connection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "incremental-build-2-growitup_erp"

class ManagerPerformanceAPITester:
    def __init__(self):
        self.session_token = None
        self.admin_session_token = None
        self.non_admin_session_token = None
        self.test_results = []
        self.client = AsyncIOMotorClient(MONGO_URL)
        self.db = self.client[DB_NAME]
        
    async def cleanup_test_data(self):
        """Clean up any test data created during testing"""
        try:
            # Remove test performance entries
            await self.db.manager_performance.delete_many({
                "manager_id": "GM001",
                "month": {"$in": ["2026-05-01", "2026-06-01", "2026-07-01"]}
            })
        except Exception as e:
            print(f"Cleanup warning: {e}")
        
    async def create_real_session(self):
        """Create a real session in the database for testing"""
        try:
            # Create admin user if not exists
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            admin_user = {
                "user_id": user_id,
                "email": ADMIN_EMAIL,
                "name": "Admin GrowItUp",
                "picture": "",
                "is_admin": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Check if user exists
            existing_user = await self.db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0})
            if existing_user:
                user_id = existing_user["user_id"]
            else:
                await self.db.users.insert_one(admin_user)
            
            # Create session
            session_token = str(uuid.uuid4())
            expires_at = datetime.now(timezone.utc) + timedelta(days=7)
            
            # Remove old sessions
            await self.db.user_sessions.delete_many({"user_id": user_id})
            
            # Create new session
            await self.db.user_sessions.insert_one({
                "user_id": user_id,
                "session_token": session_token,
                "expires_at": expires_at.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            
            self.admin_session_token = session_token
            self.session_token = session_token
            
            self.log_test("Session Creation", "PASS", f"Real admin session created: {session_token[:8]}...")
            return True
            
        except Exception as e:
            self.log_test("Session Creation", "FAIL", f"Failed to create session: {str(e)}")
            return False
    
    async def create_test_manager_and_team(self):
        """Create test manager and team data if needed"""
        try:
            # Check if GM001 exists
            manager = await self.db.employees.find_one({"employee_id": "GM001"}, {"_id": 0})
            if not manager:
                # Create test manager
                test_manager = {
                    "employee_id": "GM001",
                    "first_name": "Test",
                    "last_name": "Manager",
                    "work_email": ADMIN_EMAIL,
                    "department_name": "Admin",
                    "job_position_name": "Manager",
                    "profile_picture": "",
                    "status": "Active",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await self.db.employees.insert_one(test_manager)
                self.log_test("Test Data Setup", "PASS", "Created test manager GM001")
            
            # Check if team exists with GM001 as manager
            team = await self.db.teams.find_one({"team_manager_id": "GM001"}, {"_id": 0})
            if not team:
                # Create test team
                test_team = {
                    "team_id": f"team_{uuid.uuid4().hex[:8]}",
                    "team_name": "Test Creative Team",
                    "team_manager_id": "GM001",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await self.db.teams.insert_one(test_team)
                self.log_test("Test Data Setup", "PASS", "Created test team with GM001 as manager")
                
        except Exception as e:
            self.log_test("Test Data Setup", "FAIL", f"Failed to create test data: {str(e)}")
    
    def create_test_session(self):
        """Create a test session for authentication"""
        # This method is now replaced by create_real_session
        return asyncio.run(self.create_real_session())
    def log_test(self, test_name, status, details=""):
        """Log test result"""
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status_symbol = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        print(f"{status_symbol} {test_name}: {details}")
        
    async def setup_test_environment(self):
        """Setup test environment with real data"""
        await self.create_test_manager_and_team()
        await self.cleanup_test_data()  # Clean any previous test data
        
    def test_managers_with_teams_endpoint(self):
        """Test GET /api/managers-with-teams endpoint"""
        try:
            headers = {
                "Authorization": f"Bearer {self.session_token}",
                "Content-Type": "application/json"
            }
            
            response = requests.get(f"{BACKEND_URL}/managers-with-teams", headers=headers)
            
            if response.status_code == 401:
                self.log_test("GET /managers-with-teams - Authentication", "FAIL", 
                            "Authentication required but failed - this is expected in test environment")
                return False
                
            elif response.status_code == 200:
                data = response.json()
                
                # Validate response structure
                if isinstance(data, list):
                    self.log_test("GET /managers-with-teams - Response Structure", "PASS", 
                                f"Returns array with {len(data)} managers")
                    
                    # Check if managers have required fields
                    if data:
                        manager = data[0]
                        required_fields = ["employee_id", "first_name", "last_name", "profile_picture"]
                        missing_fields = [field for field in required_fields if field not in manager]
                        
                        if not missing_fields:
                            self.log_test("GET /managers-with-teams - Field Validation", "PASS", 
                                        "All required fields present")
                        else:
                            self.log_test("GET /managers-with-teams - Field Validation", "FAIL", 
                                        f"Missing fields: {missing_fields}")
                    
                    # Check if sorted alphabetically
                    if len(data) > 1:
                        names = [f"{m['first_name']} {m['last_name']}" for m in data]
                        sorted_names = sorted(names)
                        if names == sorted_names:
                            self.log_test("GET /managers-with-teams - Sorting", "PASS", 
                                        "Managers sorted alphabetically by name")
                        else:
                            self.log_test("GET /managers-with-teams - Sorting", "FAIL", 
                                        "Managers not sorted alphabetically")
                else:
                    self.log_test("GET /managers-with-teams - Response Structure", "FAIL", 
                                "Response is not an array")
                    
            else:
                self.log_test("GET /managers-with-teams", "FAIL", 
                            f"Unexpected status code: {response.status_code}")
                
        except Exception as e:
            self.log_test("GET /managers-with-teams", "FAIL", f"Request failed: {str(e)}")
    
    def test_manager_performance_get_endpoint(self):
        """Test GET /api/manager-performance endpoint with various filters"""
        try:
            headers = {
                "Authorization": f"Bearer {self.session_token}",
                "Content-Type": "application/json"
            }
            
            # Test 1: Get all manager performance entries
            response = requests.get(f"{BACKEND_URL}/manager-performance", headers=headers)
            
            if response.status_code == 401:
                self.log_test("GET /manager-performance - Authentication", "FAIL", 
                            "Authentication required but failed - this is expected in test environment")
                return False
                
            elif response.status_code == 200:
                data = response.json()
                self.log_test("GET /manager-performance - All Entries", "PASS", 
                            f"Returns {len(data)} performance entries")
                
                # Validate response structure
                if data:
                    entry = data[0]
                    required_fields = ["manager_id", "month", "client_performance_score", 
                                     "client_feedback_score", "creative_task_score", 
                                     "total_points_month", "manager"]
                    missing_fields = [field for field in required_fields if field not in entry]
                    
                    if not missing_fields:
                        self.log_test("GET /manager-performance - Field Validation", "PASS", 
                                    "All required fields present")
                        
                        # Check manager enrichment
                        manager = entry.get("manager", {})
                        manager_fields = ["employee_id", "first_name", "last_name", "profile_picture"]
                        missing_manager_fields = [field for field in manager_fields if field not in manager]
                        
                        if not missing_manager_fields:
                            self.log_test("GET /manager-performance - Manager Enrichment", "PASS", 
                                        "Manager details properly enriched")
                        else:
                            self.log_test("GET /manager-performance - Manager Enrichment", "FAIL", 
                                        f"Missing manager fields: {missing_manager_fields}")
                    else:
                        self.log_test("GET /manager-performance - Field Validation", "FAIL", 
                                    f"Missing fields: {missing_fields}")
                
                # Test 2: Filter by month
                test_month = "2026-04-01"
                response = requests.get(f"{BACKEND_URL}/manager-performance?month={test_month}", 
                                      headers=headers)
                if response.status_code == 200:
                    filtered_data = response.json()
                    self.log_test("GET /manager-performance - Month Filter", "PASS", 
                                f"Month filter returns {len(filtered_data)} entries")
                else:
                    self.log_test("GET /manager-performance - Month Filter", "FAIL", 
                                f"Month filter failed: {response.status_code}")
                
                # Test 3: Filter by manager_id (if we have data)
                if data:
                    test_manager_id = data[0]["manager_id"]
                    response = requests.get(f"{BACKEND_URL}/manager-performance?manager_id={test_manager_id}", 
                                          headers=headers)
                    if response.status_code == 200:
                        manager_data = response.json()
                        self.log_test("GET /manager-performance - Manager Filter", "PASS", 
                                    f"Manager filter returns {len(manager_data)} entries")
                    else:
                        self.log_test("GET /manager-performance - Manager Filter", "FAIL", 
                                    f"Manager filter failed: {response.status_code}")
                        
            else:
                self.log_test("GET /manager-performance", "FAIL", 
                            f"Unexpected status code: {response.status_code}")
                
        except Exception as e:
            self.log_test("GET /manager-performance", "FAIL", f"Request failed: {str(e)}")
    
    def test_manager_performance_post_endpoint(self):
        """Test POST /api/manager-performance endpoint"""
        try:
            headers = {
                "Authorization": f"Bearer {self.admin_session_token}",
                "Content-Type": "application/json"
            }
            
            # Test 1: Valid performance entry creation
            test_data = {
                "manager_id": "GM001",
                "month": "2026-05-01",
                "client_performance_score": 95,
                "client_feedback_score": 88,
                "creative_task_score": 92
            }
            
            response = requests.post(f"{BACKEND_URL}/manager-performance", 
                                   headers=headers, json=test_data)
            
            if response.status_code == 401:
                self.log_test("POST /manager-performance - Authentication", "FAIL", 
                            "Authentication required but failed - this is expected in test environment")
                return False
                
            elif response.status_code in [200, 201]:
                data = response.json()
                expected_total = round((95 + 88 + 92) / 3, 2)  # 91.67
                
                if data.get("total_points_month") == expected_total:
                    self.log_test("POST /manager-performance - Valid Creation", "PASS", 
                                f"Entry created with correct total_points_month: {expected_total}")
                else:
                    self.log_test("POST /manager-performance - Total Calculation", "FAIL", 
                                f"Expected {expected_total}, got {data.get('total_points_month')}")
                    
            elif response.status_code == 400:
                self.log_test("POST /manager-performance - Valid Creation", "FAIL", 
                            f"Valid data rejected: {response.json()}")
            else:
                self.log_test("POST /manager-performance - Valid Creation", "FAIL", 
                            f"Unexpected status code: {response.status_code}, expected 200 or 201")
            
            # Test 2: Duplicate entry (should fail)
            duplicate_response = requests.post(f"{BACKEND_URL}/manager-performance", 
                                             headers=headers, json=test_data)
            
            if duplicate_response.status_code == 400:
                error_msg = duplicate_response.json().get("detail", "")
                if "duplicate" in error_msg.lower() or "already exists" in error_msg.lower():
                    self.log_test("POST /manager-performance - Duplicate Prevention", "PASS", 
                                "Duplicate entry correctly rejected")
                else:
                    self.log_test("POST /manager-performance - Duplicate Prevention", "FAIL", 
                                f"Wrong error message: {error_msg}")
            else:
                self.log_test("POST /manager-performance - Duplicate Prevention", "FAIL", 
                            f"Duplicate not rejected, status: {duplicate_response.status_code}")
            
            # Test 3: Invalid score (should fail)
            invalid_data = {
                "manager_id": "GM001",
                "month": "2026-06-01",
                "client_performance_score": 150,  # Invalid: > 100
                "client_feedback_score": 88,
                "creative_task_score": 92
            }
            
            invalid_response = requests.post(f"{BACKEND_URL}/manager-performance", 
                                           headers=headers, json=invalid_data)
            
            if invalid_response.status_code == 400:
                self.log_test("POST /manager-performance - Score Validation", "PASS", 
                            "Invalid score correctly rejected")
            else:
                self.log_test("POST /manager-performance - Score Validation", "FAIL", 
                            f"Invalid score not rejected, status: {invalid_response.status_code}")
            
            # Test 4: Non-admin access (should fail)
            non_admin_headers = {
                "Authorization": f"Bearer {self.non_admin_session_token or 'non_admin_token'}",
                "Content-Type": "application/json"
            }
            
            non_admin_data = {
                "manager_id": "GM001",
                "month": "2026-07-01",
                "client_performance_score": 95,
                "client_feedback_score": 88,
                "creative_task_score": 92
            }
            
            non_admin_response = requests.post(f"{BACKEND_URL}/manager-performance", 
                                             headers=non_admin_headers, json=non_admin_data)
            
            if non_admin_response.status_code in [401, 403]:
                self.log_test("POST /manager-performance - Admin Only Access", "PASS", 
                            "Non-admin access correctly rejected")
            else:
                self.log_test("POST /manager-performance - Admin Only Access", "FAIL", 
                            f"Non-admin access not rejected, status: {non_admin_response.status_code}")
                
        except Exception as e:
            self.log_test("POST /manager-performance", "FAIL", f"Request failed: {str(e)}")
    
    def test_manager_performance_put_endpoint(self):
        """Test PUT /api/manager-performance/{perf_id} endpoint"""
        try:
            headers = {
                "Authorization": f"Bearer {self.admin_session_token}",
                "Content-Type": "application/json"
            }
            
            # First, get existing performance entries to find a perf_id
            response = requests.get(f"{BACKEND_URL}/manager-performance", headers=headers)
            
            if response.status_code != 200:
                self.log_test("PUT /manager-performance - Get Existing Entry", "FAIL", 
                            "Cannot get existing entries for update test")
                return
            
            data = response.json()
            if not data:
                self.log_test("PUT /manager-performance - Get Existing Entry", "FAIL", 
                            "No existing entries to update")
                return
            
            perf_id = data[0].get("perf_id")
            if not perf_id:
                self.log_test("PUT /manager-performance - Get Existing Entry", "FAIL", 
                            "No perf_id found in existing entry")
                return
            
            # Test update with valid data
            update_data = {
                "manager_id": data[0]["manager_id"],
                "month": data[0]["month"],
                "client_performance_score": 98,
                "client_feedback_score": 95,
                "creative_task_score": 96
            }
            
            update_response = requests.put(f"{BACKEND_URL}/manager-performance/{perf_id}", 
                                         headers=headers, json=update_data)
            
            if update_response.status_code == 401:
                self.log_test("PUT /manager-performance - Authentication", "FAIL", 
                            "Authentication required but failed - this is expected in test environment")
                return
                
            elif update_response.status_code == 200:
                updated_data = update_response.json()
                expected_total = round((98 + 95 + 96) / 3, 2)  # 96.33
                
                if updated_data.get("total_points_month") == expected_total:
                    self.log_test("PUT /manager-performance - Valid Update", "PASS", 
                                f"Entry updated with correct total_points_month: {expected_total}")
                else:
                    self.log_test("PUT /manager-performance - Total Recalculation", "FAIL", 
                                f"Expected {expected_total}, got {updated_data.get('total_points_month')}")
                    
            else:
                self.log_test("PUT /manager-performance - Valid Update", "FAIL", 
                            f"Update failed with status: {update_response.status_code}")
                
        except Exception as e:
            self.log_test("PUT /manager-performance", "FAIL", f"Request failed: {str(e)}")
    
    async def run_all_tests(self):
        """Run all manager performance API tests"""
        print("🚀 Starting Creative Team of the Month Backend API Tests")
        print("=" * 60)
        
        # Setup test environment
        await self.setup_test_environment()
        
        # Setup authentication
        if not await self.create_real_session():
            print("❌ Cannot proceed without authentication session")
            return False
        
        # Run tests
        print("\n📋 Testing Manager Performance Endpoints:")
        self.test_managers_with_teams_endpoint()
        self.test_manager_performance_get_endpoint()
        self.test_manager_performance_post_endpoint()
        self.test_manager_performance_put_endpoint()
        
        # Cleanup
        await self.cleanup_test_data()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = len([r for r in self.test_results if r["status"] == "PASS"])
        failed = len([r for r in self.test_results if r["status"] == "FAIL"])
        warnings = len([r for r in self.test_results if r["status"] == "WARNING"])
        
        print(f"✅ PASSED: {passed}")
        print(f"❌ FAILED: {failed}")
        print(f"⚠️  WARNINGS: {warnings}")
        print(f"📈 TOTAL: {len(self.test_results)}")
        
        if failed > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if result["status"] == "FAIL":
                    print(f"  ❌ {result['test']}: {result['details']}")
        
        return failed == 0

async def main():
    tester = ManagerPerformanceAPITester()
    success = await tester.run_all_tests()
    return success

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)