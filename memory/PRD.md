# GrowItUp Employee Management System - PRD

## Overview
Internal HR Employee Management + Performance Management System for GrowItUp company.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: Emergent-managed Google OAuth

## User Personas
- **Admin** (info.growitup@gmail.com): Full access to all features, all teams
- **Managers**: Can see their own team's employee performance data
- **Employees**: Can log in with work_email, see only their own performance data

## Core Requirements

### Module 1: Employee Management (COMPLETE)
1. Google Sign-In only authentication
2. Access restricted: only work_email in Employees table can login (admin is hardcoded exception)
3. Employee management: CRUD with auto-increment IDs (GM001, GM002...)
4. Department management: CRUD
5. Job Position management: CRUD with level support
6. Dark Notion-like UI (#191919, #2F2F2F)
7. Indian states and cities for address

### Module 2: Performance Management (COMPLETE - 2026-04-04)
1. Teams: Create/manage teams with single manager per team
2. is_system flag: Operations, Sales, Admin, Human Resource departments are system-protected (cannot delete or rename)
3. Employee → Teams: Multi-select team assignment in employee modal
4. Notion Integration: Store database configs (API token, DB ID, type, team mapping)
5. Webhook receiver: POST /api/webhooks/notion/{notion_database_id} — parses page data, extracts star ratings, calculates performance scores
6. Performance score calculation:
   - Video Editing (max 10): Quality pts (intro+overall 0-4) + Deadline pts (0-3) + Changes pts (0-3)
   - Thumbnail (max 10): Quality pts (5★=6, 4★=4, 3★=3, 2★=1, 1★=0) + Deadline pts (0-4: On Time=4, <30min=3, 30-60=2, 60-120=1, >120=0)
   - Script (max 10): Same formula as Thumbnail
7. Performance UI: 3-level drill-down based on role (Admin→Team→Employee→Table, Manager→Employee→Table, Employee→Direct Table)
8. Settings page: 4 tabs — Departments, Job Positions, Teams, Notion Integration

### Employee Self-Edit (COMPLETE - 2026-04-07)
1. Non-admin clicking own card shows SelfProfileModal with "Edit Profile" button
2. Edit mode: editable fields (address, zipcode, state, city, emergency contact, bank info, profile picture) shown as inputs; locked fields (name, email, phone, DOB, dept, salary, etc.) grayed out with opacity-50
3. Work Info tab always read-only with note "Work information can only be updated by HR Admin"
4. PATCH /api/employees/{emp_id}/self — ownership check (work_email = session email), 403 if not owner
5. After save: myEmployee in AuthContext updated (sidebar refreshes), employee list refreshes

### Employee List Access Control Update (COMPLETE - 2026-04-07)
1. All users now see all employee cards (removed non-admin filter)
2. Search bar visible to all users
3. Card click behavior: Admin → opens edit modal; Non-admin own card → ReadOnlyProfileModal; Non-admin other card → permission toast
4. ReadOnlyProfileModal: 3 tabs (Personal Info, Work Info, Bank Info), bank account masked, read-only, no edit inputs
5. 3-dot menu (Edit/Delete) + FAB remain admin-only
1. Fill-once fields: due_date, moved_to_review, deadline_status, all rating fields — never overwrite once set
2. title, page_url, task_type — INSERT only, never overwrite
3. performance_score — always recalculates from effective values
4. Quality Score: Video Editing = avg(intro+overall)/n displayed as X/10; Thumbnail = avg(thumbnail)/n as X/5; Script = avg(script)/n as X/5
5. Video Editing metrics row2: Total Videos + Total Length + Avg Changes (new)
6. Period selector: Current Month | Last Month | Last 90 Days | All Time | Custom (date range pickers)
1. Sidebar user profile: Shows employee's profile_picture, first_name+last_name, work_email from Employees table (NOT Google account data)
2. Settings nav: Only visible to employees in "Admin" department (or is_admin=true)
3. Employees section: Admin dept = full access (all employees, edit/delete, FAB). Other depts = own card only, read-only (no menu)
4. No online/offline status dots or text on employee cards
5. AuthContext now loads myEmployee centrally (no per-component re-fetching)
6. Work email change: auto-invalidates old login sessions + updates user record email (2026-04-04)
7. Webhook assignee matching: uses first_name+last_name match (NOT email), stores employee_id — immune to email changes

## What's Been Implemented

### Backend (server.py)
- Google Auth via Emergent (session exchange, cookie-based sessions, /auth/me, logout)
- Employees CRUD with auto-increment employee_id (GM001, GM002...) + teams array field
- Departments CRUD + is_system protection
- Job Positions CRUD + is_system protection
- States/Cities lookup endpoints
- Teams CRUD (GET/POST/PUT/DELETE /api/teams)
- Notion Databases CRUD (GET/POST/PUT/DELETE /api/notion-databases)
- Webhook endpoint: POST /api/webhooks/notion/{notion_database_id}
- Performance data endpoint: GET /api/performance
- Me/Employee endpoint: GET /api/me/employee
- seed endpoint (departments, job positions, states, cities, admin employee)
- seed-v2 endpoint (idempotent: adds is_system flags + Human Resource dept)
- Access control: admin email bypasses employee whitelist

### Frontend
- Login page with Emergent Google OAuth
- Protected routes with auth check
- Left sidebar navigation (Employees, Performance, Settings)
- Employee grid (4 columns) with search and status filter
- Employee cards with profile pic, initials fallback, 3-dot menu
- Add/Edit Employee modal (3 tabs: Personal Info, Work Info, Bank Info)
  - Work Info includes Teams multi-select toggle
- Cascading dropdowns: State→City, Department→Job Position→Level
- Delete confirmation dialogs
- Settings page (4 tabs: Departments, Job Positions, Teams, Notion Integration)
  - System departments/positions show Lock badge, no delete button, no rename
  - Teams CRUD with manager assignment
  - Notion Integration CRUD with webhook URL display + copy
- Performance page with role-based 3-level drill-down
  - Admin: Team Selection → Employee Selection → Performance Table
  - Manager: Employee Selection (their team) → Performance Table
  - Employee: Direct Performance Table
- Toast notifications (sonner)
- Dark theme throughout

## Data Models
- Users (auth sessions)
- Employees (full profile, teams array)
- Departments (is_system flag)
- JobPositions (is_system flag)
- States / Cities
- UserSessions
- Teams (team_name, team_manager_id, team_manager_name)
- NotionDatabases (database_name, notion_api_token, notion_database_id, database_type, team_id, is_active)
- PerformanceData (page_id, title, page_url, assignee_name, employee_id, team_id, database_type, deadline_status, performance_score, intro_rating, overall_rating, thumbnail_rating, script_rating, changes_count)

## Prioritized Backlog

### P0 (Critical - Done)
- [x] Google Auth
- [x] Employee CRUD
- [x] Department CRUD + is_system
- [x] Job Position CRUD + is_system
- [x] Indian states/cities seed
- [x] Teams CRUD
- [x] Notion Databases CRUD
- [x] Notion Webhook receiver + scoring
- [x] Performance UI (3-level drill-down)
- [x] Settings page (4 tabs)
- [x] EmployeeModal Teams multi-select

### P1 (Important - Next Sprint)
- [ ] Employee profile page (detailed view)
- [ ] Bulk employee import (CSV)
- [ ] Employee status toggle from card
- [ ] Export employee data
- [ ] Manager with multiple teams support on Performance page
- [ ] Manual performance rating override via UI (for managers)

### P2 (Nice to have)
- [ ] Attendance tracking
- [ ] Leave management
- [ ] Document upload for employees
- [ ] Analytics dashboard
- [ ] Email notifications
- [ ] Performance trends chart (monthly avg score per employee)
- [ ] Team performance comparison view

## Test Results
- Module 1 (2026-04-04): Backend 100% (21/21), Frontend 95% (all major flows pass)
- Module 2 (2026-04-04): Backend 100% (10/10), Frontend 100% (all features pass)


### Auth: Custom Google OAuth (COMPLETE - 2026-04-07)
- Replaced Emergent-managed auth with user's own Google OAuth
- Frontend: @react-oauth/google (useGoogleLogin implicit flow) → fetches userinfo from Google → POST /api/auth/google
- Backend: accepts userinfo dict, validates email against Employees table, creates session
- Credentials: GOOGLE_CLIENT_ID + REACT_APP_GOOGLE_CLIENT_ID in .env

### White-Labeling (COMPLETE - 2026-04-07)
- Removed `emergent-main.js` badge-injecting script from index.html
- Updated favicon to GrowItUp logo (growitup-logo.png → favicon.ico)
- Fixed broken logo URL (typo `pngi`) in Layout.jsx and LoginPage.jsx → now uses local `/growitup-logo.png`
- Updated meta description to "GrowItUp Employee Management System"
- Tab title: "GrowItUp"

### Upgrade Your Level (COMPLETE - 2026-04-27)
- New "Upgrade Your Level" modal (UpgradeLevelModal.jsx) launched from Performance screen
- Backend proxy `POST /api/upgrade-level-request` forwards to Slack webhook (SLACK_WEBHOOK_URL in backend/.env) — bypasses CORS, hides webhook
- Exam Month dropdown locks invalid months based on selected exam level
- Modal sources viewed-employee data (not logged-in user) for accuracy

### Mobile Responsiveness & Theme Consistency Pass (COMPLETE - 2026-05-02)
- **Layout.jsx**: Sidebar collapses to left-slide drawer (<lg), mobile topbar with hamburger, backdrop overlay, body-scroll lock when drawer open
- **All pages**: `p-4 md:p-8` consistent padding, headings `text-xl md:text-2xl`
- **EmployeesPage**: Already 1/2/3/4-col grid; FAB compact (icon-only) on mobile
- **PerformancePage**: Tabs horizontally scrollable on mobile (`overflow-x-auto no-scrollbar`); header wraps; metric/period cards stack
- **Team of the Month leaderboard**: Desktop table preserved; new mobile **card view** (rank, team, scores stacked) shown <md
- **Reward banner**: Trophy icon scales (72/96px), padding scales
- **Modals (full-screen on mobile)**: EmployeeModal, UpgradeLevelModal, AddDetails (CreativeTeamOfMonth), SelfProfileModal — `h-[100dvh] sm:h-auto`, `sm:rounded-lg rounded-none`, sticky header/footer, scrollable body, button stack on mobile
- **DeleteConfirm**: `w-[calc(100%-2rem)]` mobile-safe, button stack, min-h 44px
- **Settings page**: Tabs horizontally scrollable; modals mobile-safe; tables min-width with horizontal scroll wrapper; touch-target min-h 44px on action buttons
- **CSS utility**: `.no-scrollbar` added in `index.css` for clean horizontal scroll
- Pushed to GitHub repo `growitup-erp` (main, commit `04ea098`) on 2026-05-02

### Attendance System (COMPLETE - 2026-07-xx)
- **Collections**: attendance_entries (raw biometric punches), daily_attendance (processed records), monthly_late_tracking (penalties)
- **Biometric API**: POST /api/attendance/entry (X-API-Key: att_growitup_key_2026) — stores punch, triggers real-time processing
- **Processing Logic**: First/last punch = check_in/out, total_hours = (co-ci)-break, 10min grace, Present>=8h50m, HalfDay>=3h50m, Saturday half-day (08:00-13:00, 4h50m threshold for 1st & 3rd Saturday)
- **Late Penalties**: 4th late = 1 paid leave OR 1 day salary; 5th+ = 1.67% salary; stored in monthly_late_tracking
- **API Endpoints**: GET /api/attendance/daily, /summary, /all-employees-summary; PUT /api/attendance/{id}; POST /api/attendance/manual, /process, /late-tracking
- **Frontend**: AttendancePage.jsx — Calendar view (color-coded, late dot), Table view (filter/paginate), All Employees bulk view (admin), Summary cards, Admin edit modals, Late penalty alert banner
- **Access**: Admin dept → all employees + edit; Others → own only; Attendance link in sidebar for all users

### Shift Management System (COMPLETE - 2026-07-xx)
- **Shifts DB**: shifts, employee_shifts, shift_change_requests collections
- **Default Shift**: "Regular 9-6" (09:00-18:00, 60min break, 9h) — system default, cannot delete/rename
- **Admin Shifts CRUD** (Settings → Shifts tab): Create/Edit/Delete shifts with time pickers, break dropdown, calculated total_hours
- **Employee Shift Assignment** in EmployeeModal Work Info tab — dropdown with all shifts, defaults to Regular 9-6
- **Employee Shift Assignment API**: POST /api/employee-shifts (admin only), GET /api/employee-shifts/{id}
- **My Shifts Page** (/shifts) for non-admin employees: current shift card, request shift change form, request history with cancel
- **Shift Change Requests**: POST /api/shift-change-requests — validates past dates, overlapping requests, max 500 chars reason
- **Admin Approval Workflow** (Settings → Shift Requests tab): filter by Pending/Approved/Rejected/All, Approve/Reject with optional rejection notes
- **Access Control**: Admin dept → Settings Shifts+ShiftRequests tabs; Non-admin → My Shifts page in sidebar; Admin blocked from submitting shift requests
- **Saturday Half-Day Logic**: Business logic function documented for getActiveShift + getShiftTimings (not yet in UI but APIs support it)
- New leaderboard component (CreativeTeamOfMonth.jsx) tracking monthly manager performance
- ManagerPerformance model + API: GET/POST/PUT /api/manager-performance, GET /api/managers-with-teams
- Scores: Client Performance, Client Feedback, Creative Task — each with optional tooltip notes; total auto-calculated
- "Add Details" admin modal (single-screen, no scroll), dark-theme leaderboard table with emoji ranks
- Performance screen tabs: shadcn pill style; tab order standardized — **Team Performance / My Performance is FIRST tab; Creative Team of the Month is SECOND tab** for all roles (Admin, Manager, Employee)
- Default landing tab: Manager → My Team Performance; Employee → My Performance; Admin (no teams) → Creative Team of the Month (since clicking Team Performance auto-navigates)
- Pushed to GitHub repo `growitup-erp` (main) on 2026-04-27

### Leave Management System (COMPLETE - 2026-05-04)
- **Collections**: `leave_balance` (employee_id, paid_leave_balance, paid_leave_eligible, last_credited_month), `leave_requests` (request_id, employee_id, from_date, to_date, leave_type, half_day_type, total_days, paid_days, regular_days, reason, status, reviewed_by, reviewed_at, admin_notes, cancelled_at), `leave_transactions` (audit trail of Credit/Debit/Reset)
- **Business Rules**: Working days = Mon–Sat (Sundays excluded). Full Day = calc working days between; Half Day = 0.5. Paid leave auto-credits 1/month for `paid_leave_eligible=true` employees (idempotent via `last_credited_month`). On submission, system pre-splits into `paid_days` + `regular_days` based on current balance. On approve, paid_days are debited + daily_attendance "Leave" rows created + Debit txn. On cancel (Pending OR future-dated Approved), paid balance restored + Credit txn + Leave attendance rows removed. Rejected = no balance impact.
- **API Endpoints (all `/api/leave/*`)**:
  - `GET /balance` — employee_id optional (defaults to self); auto-triggers monthly credit if eligible & not yet credited
  - `GET /working-days?from_date&to_date`
  - `GET /requests?status&employee_id&month` — admin sees all; employee sees own; each request includes embedded `employee`, `employee_balance`, `reviewer_name`
  - `POST /requests` — validates past date, overlapping, Sunday start, half_day_type required when Half Day, reason <= 1000 chars
  - `PUT /requests/{id}/review` — admin only; Approved/Rejected + optional `admin_notes`
  - `PUT /requests/{id}/cancel` — owner or admin; blocks started-Approved cancellation
  - `GET /transactions?employee_id` — audit trail
  - `POST /credit-monthly` — admin manual trigger (idempotent)
  - `POST /reset-yearly` — admin annual reset
- **Frontend**:
  - `/leave` — employee self-service (balance card, Apply Leave modal with live deduction preview, My Requests list with Pending/Approved/Rejected/Cancelled filter + cancel action)
  - `/leave-requests` — **admin-only** review console (status tabs with counters, search by name/ID/dept, inline Approve/Reject with optional/required notes, rejection-reason enforced)
  - **EmployeeModal** → Work Info tab → new "Eligible for Paid Leave" checkbox (persists to `leave_balance.paid_leave_eligible` via PUT /employees)
  - Sidebar nav: "Leave" for all users, "Leave Requests" for Admin dept only
- **Access Control**: Admin dept reviews. Non-admin can only cancel own requests, view own balance/txns. Admin is blocked from submitting for self by design (has no employee record).
- **Tests**: 32/32 pytest cases pass (`/app/backend/tests/test_leave_mgmt.py`) — covers validations, eligibility toggle, approve/cancel round-trip, idempotent monthly credit, access control, attendance integration.

### Leave Automation — Scheduled Jobs (COMPLETE - 2026-05-04)
- **APScheduler** (in-process `AsyncIOScheduler`, timezone `Asia/Kolkata`) wired into FastAPI startup/shutdown events
- **Monthly paid-leave credit**: runs day=1 at 00:05 IST → calls `auto_credit_monthly_leave()`; idempotent via `last_credited_month`
- **Yearly reset**: runs Jan 1 at 00:00 IST → calls `auto_reset_yearly_leave()`; now clears `last_credited_month` for **all** balances (not just non-zero) so Jan credit fires for every eligible employee
- Existing manual admin triggers `POST /api/leave/credit-monthly` and `POST /api/leave/reset-yearly` still work as before
- Scheduler logs visible in `/var/log/supervisor/backend.err.log` on startup
- Added `APScheduler==3.11.2` to `requirements.txt`

### Leave Attendance Integration — Visual Regression (VERIFIED - 2026-05-04)
- Approved leave requests correctly render as "L" badges on employee Attendance calendar
- Summary "Leave" counter increments per approved leave day
- Legend "L Leave" displayed at bottom of calendar

### Leave Sidebar Merge (COMPLETE - 2026-05-04)
- Removed separate "Leave Requests" sidebar item for admin
- Single `Leave` nav item now routes to the correct view based on role via `LeaveIndexPage`:
  - **Admin dept** → Leave Requests approval console
  - **Everyone else** → Personal Leave (balance + my requests)
- Legacy `/leave-requests` URL preserved as alias for backward compatibility
- `notify_leave_submitted()` helper posts to existing `SLACK_WEBHOOK_URL` when a new leave request is created
- Payload includes: employee name + ID + dept, dates, total days, paid/regular split, leave type, reason (truncated to 200 chars)
- Fire-and-forget: wrapped in try/except, 5s timeout; silently no-ops if webhook unset or unreachable — never blocks or fails the leave submission
- No notification on approve/reject (per user preference)

### Admin Leave UI Polish + Settings Dedupe (COMPLETE - 2026-02-04)
- `LeaveIndexPage.jsx` admin tabs restyled to match Settings/Attendance/Performance (same pill: `bg-[#191919]` border, `data-[state=active]:bg-[#2F2F2F]`, lucide icons `CalendarCheck` + `Inbox`, proper `px-4 md:px-8 pt-4 md:pt-8` padding). No more unaligned centered tabs at the page top.
- Removed **Shift Requests** tab from Settings page (already available inside Attendance → Shift Requests). `ShiftRequestsTab` still exported and reused by `AttendanceIndexPage`.

### Team of the Month — Report Link + Edit (COMPLETE - 2026-02-04)
- **Backend** (`server.py`): `ManagerPerformanceCreate` model — removed `client_performance_notes`, `client_feedback_notes`, `creative_task_notes`; added optional `report_link: Optional[str]`. New `_validate_report_link()` helper rejects any non-http(s) URL with 400. Unknown legacy notes fields are silently dropped (Pydantic default). POST and PUT persist `report_link` and recalculate `total_points_month` on every update.
- **Frontend** (`CreativeTeamOfMonth.jsx`) — fully rewritten:
  - Add/Edit modal (`ManagerPerfModal`) replaces the old AddDetailsModal. Three compact score inputs + one optional URL field for Report Link (with inline validation). Manager + Month are disabled in edit mode (`opacity-60 cursor-not-allowed`).
  - Desktop leaderboard table: removed all tooltip/Info-icon markup; clean numeric score columns. New columns: **Report** ("View Report" with external-link icon, opens in new tab; `-` if empty) and admin-only **Actions** (Pencil icon → opens Edit modal).
  - Mobile card view: same changes — tooltip removed, Report row added, admin Edit icon in card header.
- testids: `mgr-perf-add-btn`, `mgr-perf-edit-btn`, `mgr-perf-edit-btn-mobile`, `mgr-perf-modal`, `mgr-perf-manager-select`, `mgr-perf-month-select`, `mgr-perf-cp-input`, `mgr-perf-cf-input`, `mgr-perf-ct-input`, `mgr-perf-report-link-input`, `mgr-perf-total`, `mgr-perf-save-btn`, `mgr-perf-report-link`, `mgr-perf-table`, `mgr-perf-row`
- Tests: 15/15 backend pytest cases pass (`/app/backend/tests/test_manager_performance.py`) — POST/PUT happy paths, URL validation, score validation, auth (401/403), duplicate-month (400), 404 on unknown perf_id, total recalculation, empty/null report_link normalization, legacy notes fields never leak into responses

### Attendance Page Tabs (COMPLETE - 2026-02-04)
- New `AttendanceIndexPage.jsx` consolidates all attendance-related modules under one tabbed view
- **Admin tabs**: Attendance · Shift Requests · WFH Requests · Overtime Requests
- **Non-admin tabs**: Attendance · Request Shift Change · Request WFH · Log Overtime
- Tab styling matches Settings/Performance pages (`bg-[#191919]` border, `data-[state=active]:bg-[#2F2F2F]`, lucide icons, horizontally scrollable on mobile)
- Default landing tab: Attendance (calendar/table view)
- `App.js`: route `/attendance` now points to `AttendanceIndexPage` (was `AttendancePage`)
- `SettingsPage.ShiftRequestsTab` exported as a named export so it can be reused inside the admin "Shift Requests" tab without duplication
- testids: `attendance-tabs-nav`, `attendance-tab-{val}` (e.g. `attendance-tab-attendance`, `attendance-tab-wfh-requests`)

### Sidebar Declutter (COMPLETE - 2026-02-04)
- Removed top-level sidebar items: **WFH**, **Overtime**, **My Shifts** (now reachable via Attendance page tabs)
- Final sidebar nav: Employees · Performance · Attendance · Leave · Payroll · (Settings — admin only)
- Underlying routes `/wfh`, `/overtime`, `/shifts` kept active for backward compatibility (direct URLs still work, and admin Settings still has Shifts tab)
- Cleaned up unused lucide imports (`Clock`, `Laptop`, `Timer`) from `Layout.jsx`

### Attendance Integration Tab (COMPLETE - 2026-02-04)
- New admin-only "Attendance Integration" tab in Settings (between Holidays and Data Import)
- Documents the public biometric ingestion endpoint `POST /api/attendance/entry`
- Sections: Endpoint (with Copy URL), Authentication (X-API-Key with Show/Hide + Copy), Request Format (headers + JSON body with Copy JSON), Parameters (employee_id, timestamp), Response (200 / 400 / 401 examples), and ready-to-paste cURL snippet
- New backend endpoint `GET /api/attendance/integration-info` (admin-only) returns the API key for the doc tab
- testids: `attendance-integration-tab`, `att-int-endpoint`, `att-int-auth`, `att-int-request`, `att-int-params`, `att-int-response`, `att-int-curl`, `copy-att-endpoint-btn`, `copy-att-key-btn`, `toggle-att-key-btn`, `copy-att-body-btn`
- Backend smoke test: 401 without auth, 401 without X-API-Key, 400 for unknown employee — all green
