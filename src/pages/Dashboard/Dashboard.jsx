// src/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SEMESTERS, SCHOOL_YEARS } from '../../config/constants';
import { useFirestoreData } from '../../hooks/useFirestoreData';
import {
  validateScheduleEntry,
  addSchedule,
  updateSchedule,
  removeSchedule,
  addSchedulesBatch,
  clearAllSchedules,
  logScheduleHistory,
} from '../../services/validationService';
import {
  autoScheduleForSection,
  autoScheduleForRoom,
  autoScheduleForFaculty,
  autoScheduleFull,
  autoScheduleLegacy,
} from '../../services/schedulingService';
import Swal from 'sweetalert2';

import UserManagement from '../management/UserManagement';
import ProfessorWorkload from '../../components/ProfessorWorkload/ProfessorWorkload';
import ScheduleTable from '../../components/ScheduleTable/ScheduleTable';
import ScheduleForm from '../../components/ScheduleForm/ScheduleForm';
import AutoScheduler from '../../components/AutoScheduler/AutoScheduler';
import RoomManagement from '../management/RoomManagement';
import FacultyManagement from '../management/FacultyManagement';
import SubjectManagement from '../management/SubjectManagement';
import TermManagement from '../management/TermManagement';
import ScheduleViewer from '../management/ScheduleViewer';
import SectionManagement from '../management/SectionManagement';
import ScheduleHistory from '../management/ScheduleHistory';
import Profile from '../../components/Profile/Profile';
import Chatbot from '../../components/Chatbot/Chatbot';
import ActivityLog from '../management/ActivityLog';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

import { Icon, NAV_ICONS } from './components/Icon';
import DraggableSpeedDial from './components/DraggableSpeedDial';
import KpiTile from './components/KpiTile';
import NavItem from './components/NavItem';
import CustomDropdown from './components/CustomDropdown';
import BottomNav from './components/BottomNav';
import SystemReminders from './components/SystemReminders';
import RecentActivity from './components/RecentActivity';
import { showAutoScheduleModal } from './utils/autoScheduleModals';

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = ({ user, onLogout }) => {
  const LOGO_SRC = '/logo.png?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  // --- ROLE IDENTIFICATION ---
  const userRole = (user?.role || '').toLowerCase().trim();
  const isAdmin = userRole === 'admin' || userRole === 'department head';
  const isStudent = !isAdmin;

  const navigate = useNavigate();
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const activeTab = pathParts[2] || (isStudent ? 'view-schedules' : 'dashboard');

  const setActiveTab = (tab) => {
    if (tab === 'dashboard') {
      navigate('/dashboard');
    } else {
      navigate(`/dashboard/${tab}`);
    }
  };

  // ─── UI state ─────────────────────────────────────────────────────
  const [isManageDataOpen, setIsManageDataOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  const [targetProfileUsername, setTargetProfileUsername] = useState(null);
  const [isFabHidden, setIsFabHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // ─── Term selection ───────────────────────────────────────────────
  const [activeSemester, setActiveSemester] = useState(SEMESTERS[1]);
  const [activeSchoolYear, setActiveSchoolYear] = useState(SCHOOL_YEARS[1]);

  // ─── Centralized data from Firestore ──────────────────────────────
  const data = useFirestoreData(activeSemester, activeSchoolYear);
  const {
    rooms, professors, subjects, sections,
    schedules, activeSchedules, enrichedSchedules, scheduleHistory,
    availableSemesters, availableSchoolYears, publishedTerms, setPublishedTerms,
  } = data;

  // ─── Responsive handler ──────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleTabClick = (tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); };

  const handleAutoScheduleAction = (mode) => {
    setIsFabHidden(true);
    showAutoScheduleModal(mode, { professors, rooms, sections }, (result) => {
      setIsFabHidden(false);
      if (result) {
        setActiveTab('schedule');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('execute-autoscheduler', { detail: result }));
        }, 100);
      }
    });
  };

  // --- Mobile Swipe Gesture for Sidebar ---
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    
    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    
    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        if (!isMobileMenuOpen && touchStartX < 60 && diffX > 40) {
          setIsMobileMenuOpen(true);
        }
        else if (isMobileMenuOpen && diffX < -40) {
          setIsMobileMenuOpen(false);
        }
        else if (!isMobileMenuOpen && touchStartX > window.innerWidth - 60 && diffX < -40) {
          setIsMobileMenuOpen(true);
        }
      }
    };
    
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobileMenuOpen]);

  // ─── CRUD wrappers (delegate to services) ─────────────────────────

  // ─── Log login ONCE per browser session ────────────────────────────
  useEffect(() => {
    const SESSION_KEY = `smartsched_login_logged_${user?.username}`;
    if (user && !sessionStorage.getItem(SESSION_KEY)) {
      // Mark immediately to prevent the Strict Mode double-invocation
      sessionStorage.setItem(SESSION_KEY, '1');
      logActivity({ user, action: LOG_ACTIONS.LOGIN, details: `${user.name || user.username} signed in as ${user.role}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddSchedule = async (newSchedule) => {
    return addSchedule(newSchedule, activeSchedules, rooms, activeSemester, activeSchoolYear, isAdmin);
  };

  const handleUpdateSchedule = async (scheduleId, newDay, newTimeSlotId) => {
    return updateSchedule(scheduleId, newDay, newTimeSlotId, schedules, activeSchedules, rooms, isAdmin);
  };

  const handleRemoveSchedule = async (id) => {
    return removeSchedule(id, isAdmin);
  };

  const handleAddSchedulesBatch = async (newSchedules) => {
    return addSchedulesBatch(newSchedules, activeSchedules, rooms, activeSemester, activeSchoolYear, isAdmin);
  };

  const handleLogHistory = async (historyData) => {
    return logScheduleHistory(historyData, isAdmin);
  };

  // ─── Validator object (passed to child components) ────────────────
  const schedulerContext = { professors, rooms, subjects, sections, activeSchedules };

  const validator = {
    validateAssignment: (room, professor, subject, section, day, timeSlot) =>
      validateScheduleEntry({ room, professor, subject, section, day, timeSlot }, activeSchedules, rooms),
    addSchedule: (room, professor, subject, section, day, timeSlot) => ({
      schedule: { room, professor, subject, section, day, timeSlot, semester: activeSemester, schoolYear: activeSchoolYear }
    }),
    clearAllSchedules: () => clearAllSchedules(activeSemester, activeSchoolYear),
    autoScheduleForSection: (sectionId, constraints, options) =>
      autoScheduleForSection(sectionId, schedulerContext, constraints, handleAddSchedule, activeSemester, options),
    autoScheduleForRoom: (roomId, constraints, options) =>
      autoScheduleForRoom(roomId, schedulerContext, constraints, handleAddSchedule, activeSemester, options),
    autoScheduleForFaculty: (professorId, constraints, options) =>
      autoScheduleForFaculty(professorId, schedulerContext, constraints, handleAddSchedule, activeSemester, options),
    autoScheduleFull: (constraints, options) =>
      autoScheduleFull(schedulerContext, constraints, handleAddSchedule, activeSemester, options),
    autoSchedule: (subjList, constraints) =>
      autoScheduleLegacy(subjList, schedulerContext, constraints, handleAddSchedule),
  };

  const firstName = user?.name?.split?.(/\s+/)?.[0] ?? 'there';

  const displaySchedules = (!isAdmin && publishedTerms[`${activeSemester}_${activeSchoolYear}`] !== true) ? [] : enrichedSchedules;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`smartsched-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>

      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}>

        {/* Logo block */}
        <div style={{ padding: '28px 20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', textAlign: 'center' }}>
          <img
            src={LOGO_SRC}
            alt="CAPSU Logo"
            className="dashboard-logo"
            onError={e => {
              if (e.currentTarget.src !== FALLBACK_LOGO) {
                e.currentTarget.src = FALLBACK_LOGO;
              }
            }}
          />
          {!isSidebarCollapsed && (
            <>
              <div style={{ 
                fontWeight: 900, 
                fontSize: '1.25rem', 
                letterSpacing: '0.12em', 
                color: '#ffffff',
                textShadow: '0 2px 12px rgba(255,255,255,0.3)'
              }}>
                SMARTSCHED
              </div>
              <span style={{
                display: 'inline-block', marginTop: 10,
                fontSize: '0.75rem', padding: '6px 18px', borderRadius: '20px',
                background: isAdmin ? '#2f2c68' : 'rgba(2,185,116,0.2)',
                color: '#fff', fontWeight: 600, letterSpacing: '0.04em',
                border: isAdmin ? 'none' : '1px solid rgba(2,185,116,0.2)',
              }}>
                {user?.role}
              </span>
            </>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          <ul style={{ margin: 0, padding: 0 }}>
            {!isStudent && (
              <NavItem label="Dashboard" iconPath={NAV_ICONS.dashboard} active={activeTab === 'dashboard'} onClick={() => handleTabClick('dashboard')} />
            )}

            {isAdmin && (
              <>
                <NavItem label={`Manage Data ${isManageDataOpen ? '▾' : '▸'}`} iconPath={NAV_ICONS.manage} onClick={() => setIsManageDataOpen(o => !o)} />
                {isManageDataOpen && (
                  <>
                    <NavItem label="Faculty Profiles" iconPath={NAV_ICONS.faculty} active={activeTab === 'faculty'} onClick={() => handleTabClick('faculty')} indent />
                    <NavItem label="Room List" iconPath={NAV_ICONS.rooms} active={activeTab === 'rooms'} onClick={() => handleTabClick('rooms')} indent />
                    <NavItem label="Subject Constraints" iconPath={NAV_ICONS.subjects} active={activeTab === 'subjects'} onClick={() => handleTabClick('subjects')} indent />
                    <NavItem label="Sections" iconPath={NAV_ICONS.sections} active={activeTab === 'sections'} onClick={() => handleTabClick('sections')} indent />
                    <NavItem label="Semesters & Years" iconPath={NAV_ICONS.calendar} active={activeTab === 'terms'} onClick={() => handleTabClick('terms')} indent />
                    <NavItem label="User Management" iconPath={NAV_ICONS.users} active={activeTab === 'users'} onClick={() => handleTabClick('users')} indent />
                  </>
                )}
                <NavItem label="Create Schedule" iconPath={NAV_ICONS.schedule} active={activeTab === 'schedule'} onClick={() => handleTabClick('schedule')} />
                <NavItem label="Scheduling History" iconPath={NAV_ICONS.history} active={activeTab === 'history'} onClick={() => handleTabClick('history')} />
                <NavItem label="Faculty Workload" iconPath={NAV_ICONS.workload} active={activeTab === 'workload'} onClick={() => handleTabClick('workload')} />
                <NavItem label="Activity Log" iconPath="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H9H8" active={activeTab === 'activity-log'} onClick={() => handleTabClick('activity-log')} />
              </>
            )}

            <NavItem label="View Schedules" iconPath={NAV_ICONS.viewSchedules} active={activeTab === 'view-schedules'} onClick={() => handleTabClick('view-schedules')} />
          </ul>

          {/* Divider + Logout */}
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', margin: '10px 0' }} />
          <ul style={{ margin: 0, padding: 0 }}>
            <NavItem label="Profile" iconPath={NAV_ICONS.users} active={activeTab === 'profile'} onClick={() => {
              setTargetProfileUsername(null);
              handleTabClick('profile');
            }} />
            <NavItem label="Log Out" iconPath={NAV_ICONS.logout} danger onClick={onLogout} />
          </ul>
        </nav>


      </aside>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <div className="main-content">

        {/* ── Top Bar ── */}
        <header style={{
          position: 'relative',
          zIndex: 100,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '16px',
          padding: '4px 0 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '28px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              className="sidebar-toggle-btn"
              onClick={() => setIsSidebarCollapsed(c => !c)}
              title={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
              style={{ flexShrink: 0 }}
            >
              <Icon d={NAV_ICONS.menu} size={20} />
            </button>
            <div>
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.5)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Capiz State University · Mambusao Satellite College
              </p>
              <h1 style={{ margin: '4px 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
                Welcome, {firstName} <span style={{ fontSize: '1.3rem' }}>👋</span>
              </h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              display: 'flex', gap: '8px', alignItems: 'center', 
              background: 'rgba(255, 255, 255, 0.08)', 
              backdropFilter: 'blur(12px)',
              padding: '8px 16px', 
              borderRadius: '10px', 
              border: '1px solid rgba(255, 255, 255, 0.12)',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            >
              <CustomDropdown 
                options={availableSemesters} 
                value={activeSemester} 
                onChange={setActiveSemester} 
                title="Select Semester"
                alignRight={false}
              />
              
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.9rem', margin: '0 2px' }}>|</span>
              
              <CustomDropdown 
                options={availableSchoolYears} 
                value={activeSchoolYear} 
                onChange={setActiveSchoolYear} 
                title="Select School Year"
                alignRight={true}
              />
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              padding: '8px 14px',
              textAlign: 'right',
              display: 'none',
            }}>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today</div>
              <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600, marginTop: 2 }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(o => !o)}>
              <Icon d={NAV_ICONS.menu} size={22} />
            </button>
          </div>
        </header>

        {/* ── Dashboard Tab ── */}
        {!isStudent && activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s' }}>

          {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <KpiTile 
                label="Faculty Members" 
                value={professors.length} 
                iconPath={NAV_ICONS.faculty} 
                color="#0288d1" 
                onClick={isAdmin ? () => handleTabClick('faculty') : undefined}
              />
              <KpiTile 
                label="Rooms" 
                value={rooms.length} 
                iconPath={NAV_ICONS.rooms} 
                color="#7c3aed" 
                onClick={isAdmin ? () => handleTabClick('rooms') : undefined}
              />
              <KpiTile 
                label="Sections" 
                value={sections.length} 
                iconPath={NAV_ICONS.sections} 
                color="#059669" 
                onClick={isAdmin ? () => handleTabClick('sections') : undefined}
              />
              <KpiTile 
                label="Scheduled Classes" 
                value={displaySchedules.length} 
                iconPath={NAV_ICONS.schedule} 
                color="#d97706" 
                onClick={() => handleTabClick('view-schedules')}
              />
            </div>

            {/* Admin preview cards */}
            {isAdmin && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '18px' }}>
                {/* Faculty preview */}
                <div className="card" style={{ padding: '22px' }}>
                  <div className="card-header" style={{ marginBottom: '14px' }}>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '8px',
                        background: 'linear-gradient(135deg, #0288d1, #4fc3f7)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', boxShadow: '0 2px 8px rgba(2,136,209,0.25)'
                      }}>
                        <Icon d={NAV_ICONS.faculty} size={14} />
                      </span>
                      Faculty Profiles
                    </h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab('faculty')} style={{ background: 'transparent', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', boxShadow: 'none', borderRadius: '8px' }}>View All</button>
                  </div>
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Department</th><th>Max Units</th></tr></thead>
                    <tbody>
                      {professors.slice(0, 3).map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td><span style={{ fontSize: '0.78rem', padding: '2px 8px', borderRadius: 6, background: '#EEF2FF', color: '#5645EE', fontWeight: 600 }}>{p.department}</span></td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.maxUnits || p.maxHours || 12}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {professors.length > 3 && (
                    <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right', fontWeight: 500 }}>
                      +{professors.length - 3} more faculty
                    </p>
                  )}
                </div>

                {/* Rooms preview */}
                <div className="card" style={{ padding: '22px' }}>
                  <div className="card-header" style={{ marginBottom: '14px' }}>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '8px',
                        background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', boxShadow: '0 2px 8px rgba(124,58,237,0.25)'
                      }}>
                        <Icon d={NAV_ICONS.rooms} size={14} />
                      </span>
                      Room List
                    </h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab('rooms')} style={{ background: 'transparent', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', boxShadow: 'none', borderRadius: '8px' }}>View All</button>
                  </div>
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Lab?</th></tr></thead>
                    <tbody>
                      {rooms.slice(0, 3).map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{r.name}</td>
                          <td><span style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>{r.type}</span></td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: '0.73rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700,
                              background: r.hasComputers ? 'linear-gradient(135deg, #E6F8F0, #D1FAE5)' : '#F1F5F9',
                              color: r.hasComputers ? '#059669' : '#94a3b8',
                            }}>
                              {r.hasComputers ? '✓ Yes' : 'No'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rooms.length > 3 && (
                    <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right', fontWeight: 500 }}>
                      +{rooms.length - 3} more rooms
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Dashboard Widgets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
              {isAdmin && <SystemReminders />}
              <RecentActivity schedules={displaySchedules} onViewAll={() => setActiveTab('view-schedules')} />
            </div>


          </div>
        )}

        {/* ── Other Tabs ── */}
        {isAdmin && activeTab === 'users' && <UserManagement onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'schedule' && (
          <div className="schedule-grid" style={{ animation: 'fadeIn 0.4s' }}>
            {!isMobile && (
              <ScheduleForm rooms={rooms} professors={professors} subjects={subjects} sections={sections} onSchedule={handleAddSchedule} validator={validator} activeSemester={activeSemester} />
            )}
            <AutoScheduler validator={validator} subjects={subjects} sections={sections} professors={professors} rooms={rooms} schedules={displaySchedules} activeSemester={activeSemester} onAutoSchedule={handleAddSchedule} onAutoScheduleBatch={handleAddSchedulesBatch} onLogHistory={handleLogHistory} />
          </div>
        )}
        {isAdmin && activeTab === 'history' && <ScheduleHistory history={scheduleHistory} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'rooms' && <RoomManagement rooms={rooms} user={user} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'faculty' && <FacultyManagement professors={professors} subjects={subjects} rooms={rooms} sections={sections} schedules={displaySchedules} activeSemester={activeSemester} user={user} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'subjects' && <SubjectManagement subjects={subjects} availableSemesters={availableSemesters} activeSemester={activeSemester} user={user} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'terms' && <TermManagement availableSemesters={availableSemesters} availableSchoolYears={availableSchoolYears} onBack={() => setActiveTab('dashboard')} publishedTerms={publishedTerms} setPublishedTerms={setPublishedTerms} />}
        {isAdmin && activeTab === 'sections' && <SectionManagement sections={sections} subjects={subjects} activeSemester={activeSemester} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'workload' && <ProfessorWorkload professors={professors} schedules={displaySchedules} />}
        {isAdmin && activeTab === 'activity-log' && (
          <ActivityLog 
            onBack={() => setActiveTab('dashboard')} 
            onViewProfile={(username) => {
              setTargetProfileUsername(username);
              setActiveTab('profile');
            }} 
          />
        )}

        {/* THIS IS THE ONLY TAB STUDENTS CAN ACCESS */}
        {activeTab === 'view-schedules' && <ScheduleViewer user={user} rooms={rooms} professors={professors} sections={sections} schedules={displaySchedules} isAdmin={isAdmin} onUpdateSchedule={handleUpdateSchedule} activeSemester={activeSemester} activeSchoolYear={activeSchoolYear} isPublished={publishedTerms[`${activeSemester}_${activeSchoolYear}`] === true} />}

        {activeTab === 'profile' && (
          <Profile 
            user={{ 
              username: targetProfileUsername || user.username, 
              role: (targetProfileUsername && targetProfileUsername !== user.username) ? '' : user.role 
            }} 
            readOnly={!!targetProfileUsername && targetProfileUsername !== user.username}
            onBack={() => {
              setTargetProfileUsername(null);
              setActiveTab(isAdmin ? 'dashboard' : 'view-schedules');
            }} 
          />
        )}

      </div>
      <Chatbot schedules={displaySchedules} professors={professors} subjects={subjects} sections={sections} rooms={rooms} />
      <BottomNav activeTab={activeTab} handleTabClick={handleTabClick} isAdmin={isAdmin} setIsMobileMenuOpen={setIsMobileMenuOpen} />

      {/* --- Mobile Floating Action Button (FAB) --- */}
      {isAdmin && isMobile && (activeTab === 'view-schedules' || activeTab === 'schedule') && (
        <DraggableSpeedDial 
          onAddSchedule={() => setIsScheduleFormOpen(true)} 
          onAutoScheduleAction={handleAutoScheduleAction}
          isHidden={isFabHidden}
        />
      )}

      {/* --- Bottom Sheet Modal for Schedule Form --- */}
      {isAdmin && isMobile && isScheduleFormOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end',
          animation: 'fadeIn 0.3s ease'
        }} onClick={() => setIsScheduleFormOpen(false)}>
          <div style={{
            background: 'var(--bg-main)',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            padding: '20px',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            position: 'relative'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '40px', height: '5px', background: 'var(--border-color)', borderRadius: '3px', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-main)' }}>Add Schedule</h2>
              <button onClick={() => setIsScheduleFormOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <ScheduleForm rooms={rooms} professors={professors} subjects={subjects} sections={sections} onSchedule={async (sched) => {
              const res = await handleAddSchedule(sched);
              if (res && res.ok) setIsScheduleFormOpen(false);
              return res;
            }} validator={validator} activeSemester={activeSemester} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;