import React, { useState, useEffect } from 'react';
import { initialRooms, initialProfessors, initialSubjects, initialSections } from './initial';
import { TIME_SLOTS, DAYS } from './index';
import { db } from './firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';

// --- COMPONENTS ---
import UserManagement from './UserManagement';
import ProfessorWorkload from './ProfessorWorkload';
import ScheduleTable from './ScheduleTable';
import ScheduleForm from './ScheduleForm';
import AutoScheduler from './AutoScheduler';
import RoomManagement from './RoomManagement';
import FacultyManagement from './FacultyManagement';
import SubjectManagement from './SubjectManagement';
import ScheduleViewer from './ScheduleViewer';
import SectionManagement from './SectionManagement';

const Dashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isManageDataOpen, setIsManageDataOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Determine if the current logged-in user is an admin or Department Head
  const isAdmin = user?.role === 'Admin' || user?.role === 'Department Head';

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  // --- STATE ---
  const [rooms, setRooms] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [schedules, setSchedules] = useState([]);

  const findScheduleConflicts = ({ roomId, professorId, day, timeSlotId, excludeScheduleId = null }) => {
    const conflicts = {
      room: null,
      professor: null,
    };

    for (const s of schedules) {
      if (excludeScheduleId && s.id === excludeScheduleId) continue;
      if (s.day !== day) continue;
      if (s.timeSlot?.id !== timeSlotId) continue;

      if (!conflicts.room && s.room?.id === roomId) conflicts.room = s;
      if (!conflicts.professor && s.professor?.id === professorId) conflicts.professor = s;
      if (conflicts.room && conflicts.professor) break;
    }

    return conflicts;
  };

  useEffect(() => {
    const initializeData = async () => {
      const roomsSnapshot = await getDocs(collection(db, 'rooms'));
      if (roomsSnapshot.empty) {
        const batch = writeBatch(db);
        initialRooms.forEach(r => batch.set(doc(db, 'rooms', r.id.toString()), r));
        initialProfessors.forEach(p => batch.set(doc(db, 'professors', p.id.toString()), p));
        initialSubjects.forEach(s => batch.set(doc(db, 'subjects', s.id.toString()), s));
        initialSections.forEach(sec => batch.set(doc(db, 'sections', sec.id.toString()), sec));
        await batch.commit();
      }
    };
    initializeData();

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => setRooms(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubProfs = onSnapshot(collection(db, 'professors'), (snap) => setProfessors(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSubj = onSnapshot(collection(db, 'subjects'), (snap) => setSubjects(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSec = onSnapshot(collection(db, 'sections'), (snap) => setSections(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSched = onSnapshot(collection(db, 'schedules'), (snap) => setSchedules(snap.docs.map(d => ({ ...d.data(), id: d.id }))));

    return () => { unsubRooms(); unsubProfs(); unsubSubj(); unsubSec(); unsubSched(); };
  }, []);

  // --- VALIDATOR ENGINE ---
  const validator = {
    validateAssignment: (room, professor, subject, day, timeSlot) => {
      const errors = []; const warnings = [];
      const conflicts = findScheduleConflicts({
        roomId: room?.id,
        professorId: professor?.id,
        day,
        timeSlotId: timeSlot?.id,
      });
      if (conflicts.room) errors.push(`Room "${room?.name}" is already scheduled for ${day} (${timeSlot?.label}).`);
      if (conflicts.professor) errors.push(`Faculty "${professor?.name}" is already scheduled for ${day} (${timeSlot?.label}).`);
      if (subject.requiredLab && !room.hasComputers) errors.push(`Requires Lab.`);
      if (room.capacity < subject.capacity) warnings.push(`Capacity warning.`);
      return { valid: errors.length === 0, errors, warnings };
    },
    addSchedule: (room, professor, subject, day, timeSlot) => ({ schedule: { room, professor, subject, day, timeSlot } }),
    clearAllSchedules: async () => {
      // Batch delete to ensure "clear" completes before auto-scheduling writes.
      if (!schedules || schedules.length === 0) return;
      const batch = writeBatch(db);
      schedules.forEach(s => batch.delete(doc(db, 'schedules', s.id.toString())));
      await batch.commit();
    },
    autoSchedule: (subjList, constraints) => {
      const results = [];
      const unscheduled = [];
      const tempSchedules = [...schedules];

      for (const subject of subjList) {
        let scheduled = false;
        const prof = professors.find(p => p.department === subject.department);
        if (!prof) {
          unscheduled.push(subject);
          continue;
        }

        searchLoop:
        for (const day of DAYS) {
          for (const timeSlot of TIME_SLOTS) {
            for (const room of rooms) {
              if (constraints.respectLabs && subject.requiredLab && !room.hasComputers) {
                continue;
              }

              const isRoomBusy = constraints.preventDoubleBooking
                ? tempSchedules.some(s => s.room.id === room.id && s.day === day && s.timeSlot.id === timeSlot.id)
                : false;
              const isProfBusy = constraints.preventDoubleBooking
                ? tempSchedules.some(s => s.professor.id === prof.id && s.day === day && s.timeSlot.id === timeSlot.id)
                : false;

              if (!isRoomBusy && !isProfBusy) {
                const newSchedule = { room, professor: prof, subject, day, timeSlot };
                tempSchedules.push(newSchedule);
                results.push(newSchedule);
                handleAddSchedule(newSchedule);
                scheduled = true;
                break searchLoop;
              }
            }
          }
        }

        if (!scheduled) {
          unscheduled.push(subject);
        }
      }
      return { results, unscheduled, error: null };
    }
  };

  const handleUpdateSchedule = async (scheduleId, newDay, newTimeSlotId) => {
    if (!isAdmin) return;
    const newTimeSlot = TIME_SLOTS.find(ts => ts.id === newTimeSlotId);

    const existing = schedules.find(s => s.id === scheduleId);
    if (!existing) return;

    const conflicts = findScheduleConflicts({
      roomId: existing.room?.id,
      professorId: existing.professor?.id,
      day: newDay,
      timeSlotId: newTimeSlotId,
      excludeScheduleId: scheduleId,
    });

    if (conflicts.room || conflicts.professor) {
      const msgs = [];
      if (conflicts.room) msgs.push(`Room "${existing.room?.name}" is already occupied.`);
      if (conflicts.professor) msgs.push(`Faculty "${existing.professor?.name}" is already busy.`);
      alert(`Cannot move schedule:\n${msgs.join('\n')}`);
      return;
    }

    await updateDoc(doc(db, 'schedules', scheduleId.toString()), {
      day: newDay,
      timeSlot: newTimeSlot
    });
  };

  const handleAddSchedule = async (newSchedule) => {
    if (!isAdmin) return;
    const conflicts = findScheduleConflicts({
      roomId: newSchedule?.room?.id,
      professorId: newSchedule?.professor?.id,
      day: newSchedule?.day,
      timeSlotId: newSchedule?.timeSlot?.id,
    });
    if (conflicts.room || conflicts.professor) {
      const msgs = [];
      if (conflicts.room) msgs.push(`Room "${newSchedule?.room?.name}" is already occupied for ${newSchedule?.day} (${newSchedule?.timeSlot?.label}).`);
      if (conflicts.professor) msgs.push(`Faculty "${newSchedule?.professor?.name}" is already teaching for ${newSchedule?.day} (${newSchedule?.timeSlot?.label}).`);
      return { ok: false, errors: msgs };
    }
    await addDoc(collection(db, 'schedules'), newSchedule);
    return { ok: true };
  };

  const handleRemoveSchedule = async (id) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, 'schedules', id.toString()));
  };

  return (
    <div className={`smartsched-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* ================= SIDEBAR ================= */}
      <div className={`sidebar ${isMobileMenuOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div>
          <div className="logo-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
            <img src="/logo.jpg" alt="CAPSU Logo" onError={(e) => { e.target.src = "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Capiz_State_University_logo.png/220px-Capiz_State_University_logo.png"; }} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #0288d1' }} />
            <h3>SMARTSCHED</h3>
            <span style={{ fontSize: '0.75rem', marginTop: '5px', padding: '3px 8px', borderRadius: '12px', backgroundColor: isAdmin ? 'var(--accent-primary)' : 'var(--success)', color: 'white', fontWeight: 'bold' }}>
              Logged in as: {user?.role}
            </span>
          </div>

          <ul className="nav-menu">
            <li className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleTabClick('dashboard')}>Dashboard</li>

            {/* ONLY ADMINS SEE MANAGE DATA */}
            {isAdmin && (
              <>
                <li className="nav-item" onClick={() => setIsManageDataOpen(!isManageDataOpen)}>Manage Data {isManageDataOpen ? '▼' : '▶'}</li>
                {isManageDataOpen && (
                  <>
                    <li className="nav-sub-item" style={{ color: activeTab === 'faculty' ? 'var(--accent-primary)' : '' }} onClick={() => handleTabClick('faculty')}>Faculty Profiles</li>
                    <li className="nav-sub-item" style={{ color: activeTab === 'rooms' ? 'var(--accent-primary)' : '' }} onClick={() => handleTabClick('rooms')}>Room List</li>
                    <li className="nav-sub-item" style={{ color: activeTab === 'subjects' ? 'var(--accent-primary)' : '' }} onClick={() => handleTabClick('subjects')}>Subject Constraints</li>
                    <li className="nav-sub-item" style={{ color: activeTab === 'sections' ? 'var(--accent-primary)' : '' }} onClick={() => handleTabClick('sections')}>Section Management</li>
                    <li className="nav-sub-item" style={{ color: activeTab === 'users' ? 'var(--accent-primary)' : '' }} onClick={() => handleTabClick('users')}>User Management</li>
                  </>
                )}
                <li className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => handleTabClick('schedule')}>Create Schedule</li>
              </>
            )}

            {isAdmin && (
              <li className={`nav-item ${activeTab === 'workload' ? 'active' : ''}`} onClick={() => handleTabClick('workload')}>Faculty Workload</li>
            )}
            <li className={`nav-item ${activeTab === 'room-utilization' ? 'active' : ''}`} onClick={() => handleTabClick('room-utilization')}>View Schedules</li>
            <li className="nav-item" onClick={onLogout} style={{ marginTop: '10px', color: 'var(--danger)' }}>Log Out</li>
          </ul>
        </div>

        <div className="sidebar-stats-box">
          <div className="stat-row"><span>Faculty</span> <strong>{professors.length}</strong></div>
          <div className="stat-row"><span>Rooms</span> <strong>{rooms.length}</strong></div>
          <div className="stat-row"><span>Sections</span> <strong>{sections.length}</strong></div>
          <div className="stat-row"><span>Classes</span> <strong>{schedules.length}</strong></div>
        </div>
      </div>

      {/* ================= MAIN CONTENT ================= */}
      <div className="main-content">
        <div className="header-title" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="sidebar-toggle-btn"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>Capiz State University | Mambusao Satellite College</p>
              <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold' }}>
                Welcome, {user?.name.split(' ')[0]}
              </h1>
            </div>
          </div>
          <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>☰</button>
        </div>

        {activeTab === 'dashboard' && (
          <div className="dashboard-master-grid" style={{ animation: 'fadeIn 0.5s' }}>
            {isAdmin && (
              <div className="grid-top-row">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Managed Data - Faculty Profiles</h3>
                    <button className="btn" onClick={() => setActiveTab('faculty')}>Manage Faculty</button>
                  </div>
                  <table className="data-table">
                    <thead><tr><th>ID</th><th>Full Name</th><th>Department</th><th>Max Units</th></tr></thead>
                    <tbody>{professors.slice(0, 2).map(p => <tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.department}</td><td>{p.maxUnits || p.maxHours || 12}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Managed Data - Room List</h3>
                    <button className="btn" onClick={() => setActiveTab('rooms')}>Manage Rooms</button>
                  </div>
                  <table className="data-table">
                    <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Capacity</th></tr></thead>
                    <tbody>{rooms.slice(0, 2).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td style={{ textTransform: 'uppercase' }}>{r.type}</td><td>{r.capacity}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Schedule Table - Full Width */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
              <div className="card-header" style={{ padding: '20px 20px 0 20px', border: 'none' }}>
                <h3 className="card-title">Weekly Room & Faculty Schedule</h3>
                <div>
                  {isAdmin && <button className="btn" onClick={() => setActiveTab('schedule')} style={{ marginRight: '10px' }}>Go to Scheduler</button>}
                  <button className="btn" onClick={() => window.print()} style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>Print</button>
                </div>
              </div>
              <div style={{ padding: '10px', overflowX: 'auto' }}>
                <ScheduleTable
                  schedules={schedules}
                  onRemove={isAdmin ? handleRemoveSchedule : null}
                  onUpdateSchedule={isAdmin ? handleUpdateSchedule : null}
                />
              </div>
            </div>

            {/* System Alerts */}
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '15px' }}>System Alerts</h3>
              <div className="alert-item alert-info"><strong>Ready:</strong> Schedule data is up to date.</div>
              {!isAdmin && <div className="alert-item alert-warning"><strong>Notice:</strong> You are in View-Only mode. Contact an Admin for schedule changes.</div>}
            </div>
          </div>
        )}

        {/* --- ALL OTHER TABS --- */}
        {isAdmin && activeTab === 'users' && <UserManagement />}
        {isAdmin && activeTab === 'schedule' && (
          <div className="schedule-grid" style={{ animation: 'fadeIn 0.5s' }}>
            <ScheduleForm rooms={rooms} professors={professors} subjects={subjects} onSchedule={handleAddSchedule} validator={validator} />
            <AutoScheduler validator={validator} subjects={subjects} sections={sections} professors={professors} rooms={rooms} onAutoSchedule={handleAddSchedule} />
          </div>
        )}
        {isAdmin && activeTab === 'rooms' && <RoomManagement rooms={rooms} />}
        {isAdmin && activeTab === 'faculty' && <FacultyManagement professors={professors} subjects={subjects} />}
        {isAdmin && activeTab === 'subjects' && <SubjectManagement subjects={subjects} />}
        {isAdmin && activeTab === 'sections' && <SectionManagement sections={sections} subjects={subjects} />}
        {isAdmin && activeTab === 'workload' && <ProfessorWorkload professors={professors} schedules={schedules} />}
        {activeTab === 'room-utilization' && <ScheduleViewer rooms={rooms} professors={professors} sections={sections} schedules={schedules} />}

      </div>
    </div>
  );
};

export default Dashboard;