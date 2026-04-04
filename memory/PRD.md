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

### Module 2 Access Control & UI (COMPLETE - 2026-04-04)
1. Sidebar user profile: Shows employee's profile_picture, first_name+last_name, work_email from Employees table (NOT Google account data)
2. Settings nav: Only visible to employees in "Admin" department (or is_admin=true)
3. Employees section: Admin dept = full access (all employees, edit/delete, FAB). Other depts = own card only, edit only, no FAB
4. No online/offline status dots or text on employee cards
5. AuthContext now loads myEmployee centrally (no per-component re-fetching)

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
