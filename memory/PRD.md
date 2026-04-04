# GrowItUp Employee Management System - PRD

## Overview
Internal HR Employee Management System for GrowItUp company.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: Emergent-managed Google OAuth

## User Personas
- **Admin** (info.growitup@gmail.com): Full access to all features
- **Employees**: Can log in with work_email, view and manage HR data

## Core Requirements (Static)
1. Google Sign-In only authentication
2. Access restricted: only work_email in Employees table can login (admin is hardcoded exception)
3. Employee management: CRUD with auto-increment IDs (GM001, GM002...)
4. Department management: CRUD
5. Job Position management: CRUD with level support
6. Dark Notion-like UI (#191919, #2F2F2F)
7. Indian states and cities for address

## What's Been Implemented (2026-04)

### Backend (server.py)
- Google Auth via Emergent (session exchange, cookie-based sessions, /auth/me, logout)
- Employees CRUD with auto-increment employee_id (GM001, GM002...)
- Departments CRUD
- Job Positions CRUD with cascade to departments
- States/Cities lookup endpoints
- Seed endpoint (departments, job positions, states, cities, admin employee)
- Access control: admin email bypasses employee whitelist

### Frontend
- Login page with Emergent Google OAuth
- Protected routes with auth check
- Left sidebar navigation (Employees, Departments, Job Positions)
- Employee grid (4 columns) with search and status filter
- Employee cards with profile pic, initials fallback, 3-dot menu
- Add/Edit Employee modal (3 tabs: Personal Info, Work Info, Bank Info)
- Cascading dropdowns: State→City, Department→Job Position→Level
- Delete confirmation dialogs
- Departments page (table view, CRUD)
- Job Positions page (table view, level management, CRUD)
- Toast notifications (sonner)
- Dark theme throughout

## Data Models
- Users (auth sessions)
- Employees (full profile with all fields)
- Departments
- JobPositions
- States
- Cities
- UserSessions

## Prioritized Backlog
### P0 (Critical - Done)
- [x] Google Auth
- [x] Employee CRUD
- [x] Department CRUD
- [x] Job Position CRUD
- [x] Indian states/cities seed

### P1 (Important)
- [ ] Employee profile page (detailed view)
- [ ] Bulk employee import (CSV)
- [ ] Employee status toggle from card
- [ ] Export employee data

### P2 (Nice to have)
- [ ] Attendance tracking
- [ ] Leave management
- [ ] Document upload for employees
- [ ] Analytics dashboard
- [ ] Email notifications

## Test Results (2026-04-04)
- Backend: 100% (21/21 tests pass)
- Frontend: 95% (all 15 major flow tests pass)
- Fixed: SelectItem empty value bug in EmployeeModal (value="" → value="__none__")
- Fixed: FAB button blocked by Emergent badge (moved to bottom-20)
- Test employee GM002 created by testing agent (can be deleted via UI)

## Next Tasks (Post-Launch)
1. Add employee status toggle from the card directly (Active/Inactive)
2. Employee detail/profile view page
3. Bulk CSV import for employees
4. Department-wise analytics dashboard
5. Export employee data to Excel/CSV
