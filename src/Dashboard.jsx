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

/** Mirrors Schedule GA / greedy picker: only enforce specialization when at least one faculty matches this subject. */
function professorMatchesSubject(professor, subject) {
  if (!professor || !subject) return false;
  const specs = professor.specialization || [];
  return specs.includes(subject.id) ||
    specs.includes(subject.code) ||
    specs.some(s => typeof s === 'string' && subject.name?.toLowerCase().includes(s.toLowerCase()));
}

const Dashboard = ({ user, onLogout }) => {
  const LOGO_SRC = '/logo.jpg?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

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

  const findScheduleConflicts = ({ roomId, professorId, sectionId, day, timeSlotId, excludeScheduleId = null }) => {
    const conflicts = {
      room: null,
      professor: null,
      section: null,
    };

    for (const s of schedules) {
      if (excludeScheduleId && s.id === excludeScheduleId) continue;
      if (s.day !== day) continue;
      if (String(s.timeSlot?.id) !== String(timeSlotId)) continue;

      if (!conflicts.room && String(s.room?.id) === String(roomId)) conflicts.room = s;
      if (!conflicts.professor && String(s.professor?.id) === String(professorId)) conflicts.professor = s;
      if (!conflicts.section && sectionId && String(s.section?.id) === String(sectionId)) conflicts.section = s;
      if (conflicts.room && conflicts.professor && (!sectionId || conflicts.section)) break;
    }

    return conflicts;
  };

  const validateScheduleEntry = ({ room, professor, subject, section, day, timeSlot, excludeScheduleId = null }) => {
    const errors = [];
    const warnings = [];

    if (!room?.id) errors.push('Room is required.');
    if (!professor?.id) errors.push('Faculty is required.');
    if (!subject?.id) errors.push('Subject is required.');
    if (!day) errors.push('Day is required.');
    if (!timeSlot?.id) errors.push('Time slot is required.');

    // --- 1. STRICT FACULTY CONSTRAINT ---
    // Blocks assignment if the subject is not explicitly in the professor's specialization array
    if (professor && subject) {
      if (!professorMatchesSubject(professor, subject)) {
        errors.push(`Faculty "${professor.name}" is not authorized to teach "${subject.code}".`);
      }
    }

    // --- 2. STRICT SECTION CONSTRAINT ---
    // Blocks assignment if the subject is not listed in the section's enrolled subjects
    if (section && subject) {
      const sectionSubjects = section.subjects || [];
      if (!sectionSubjects.includes(subject.id) && !sectionSubjects.includes(subject.code)) {
        errors.push(`Section "${section.name}" is not enrolled in subject "${subject.code}".`);
      }
    }

    if (errors.length > 0) return { valid: false, errors, warnings };

    const conflicts = findScheduleConflicts({
      roomId: room.id,
      professorId: professor.id,
      sectionId: section?.id || null,
      day,
      timeSlotId: timeSlot.id,
      excludeScheduleId,
    });

    if (conflicts.room) errors.push(`Room "${room?.name}" is already scheduled for ${day} (${timeSlot?.label}).`);
    if (conflicts.professor) errors.push(`Faculty "${professor?.name}" is already scheduled for ${day} (${timeSlot?.label}).`);
    if (section?.id && conflicts.section) errors.push(`Section "${section?.name}" already has a class for ${day} (${timeSlot?.label}).`);

    if (subject?.requiredLab && !room?.hasComputers) errors.push('Requires Lab.');

    return { valid: errors.length === 0, errors, warnings };
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
      return validateScheduleEntry({ room, professor, subject, section: null, day, timeSlot });
    },
    addSchedule: (room, professor, subject, day, timeSlot) => ({ schedule: { room, professor, subject, day, timeSlot } }),
    clearAllSchedules: async () => {
      // Delete every schedule doc from Firestore (do not rely on possibly stale React state).
      const snap = await getDocs(collection(db, 'schedules'));
      if (snap.empty) {
        setSchedules([]);
        return;
      }
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setSchedules([]);
    },
    /**
     * Greedy "small population" auto-scheduling helpers.
     * These are intended for quick targeted runs (faculty OR room OR section).
     *
     * Returns:
     * - results: schedules successfully placed
     * - unscheduled: array of { subject, section, reason }
     */
    autoScheduleForSection: async (sectionId, constraints = { respectLabs: true, preventDoubleBooking: true }) => {
      const section = sections.find(s => s.id === sectionId);
      if (!section) return { results: [], unscheduled: [], error: `Section "${sectionId}" not found.` };

      const subjectObjs = (section.subjects || [])
        .map(subId => subjects.find(su => su.id === subId || su.code === subId))
        .filter(Boolean);

      const assignments = [];
      for (const subject of subjectObjs) {
        const credits = Number(subject.credits) || 3;
        const meetings = Math.max(1, Math.ceil(credits / 1.5));
        for (let i = 0; i < meetings; i++) {
          assignments.push({ subject, section, meetingIndex: i + 1 });
        }
      }

      return validator._autoScheduleAssignments(assignments, { ...constraints });
    },
    autoScheduleForRoom: async (roomId, constraints = { respectLabs: true, preventDoubleBooking: true }) => {
      const room = rooms.find(r => r.id === roomId);
      if (!room) return { results: [], unscheduled: [], error: `Room "${roomId}" not found.` };

      const assignments = [];
      for (const section of sections) {
        for (const subId of (section.subjects || [])) {
          const subject = subjects.find(su => su.id === subId || su.code === subId);
          if (subject) {
            const credits = Number(subject.credits) || 3;
            const meetings = Math.max(1, Math.ceil(credits / 1.5));
            for (let i = 0; i < meetings; i++) {
              assignments.push({ subject, section, meetingIndex: i + 1 });
            }
          }
        }
      }

      return validator._autoScheduleAssignments(assignments, { ...constraints, fixedRoom: room });
    },
    autoScheduleForFaculty: async (professorId, constraints = { respectLabs: true, preventDoubleBooking: true }) => {
      const professor = professors.find(p => p.id === professorId);
      if (!professor) return { results: [], unscheduled: [], error: `Faculty "${professorId}" not found.` };

      const assignments = [];
      for (const section of sections) {
        for (const subId of (section.subjects || [])) {
          const subject = subjects.find(su => su.id === subId || su.code === subId);
          if (subject) {
            const credits = Number(subject.credits) || 3;
            const meetings = Math.max(1, Math.ceil(credits / 1.5));
            for (let i = 0; i < meetings; i++) {
              assignments.push({ subject, section, meetingIndex: i + 1 });
            }
          }
        }
      }

      return validator._autoScheduleAssignments(assignments, { ...constraints, fixedProfessor: professor });
    },
    _eligibleRoomsFor: (subject, section, constraints) => {
      let pool = rooms;
      if (constraints?.respectLabs && subject?.requiredLab) {
        const labs = rooms.filter(r => r.hasComputers);
        if (labs.length > 0) pool = labs;
      }
      return pool;
    },
    _eligibleProfsFor: (subject) => {
      if (!subject) return [];
      const validProfs = professors.filter(p => professorMatchesSubject(p, subject));
      return validProfs;
    },
    _autoScheduleAssignments: async (assignments, constraints) => {
      const results = [];
      const unscheduled = [];

      const fixedRoom = constraints?.fixedRoom || null;
      const fixedProfessor = constraints?.fixedProfessor || null;
      const temp = [...schedules];

      const ordered = [...assignments].sort((a, b) => {
        const aHard = (a.subject?.requiredLab ? 1 : 0);
        const bHard = (b.subject?.requiredLab ? 1 : 0);
        return bHard - aHard;
      });

      for (const a of ordered) {
        const subject = a.subject;
        const section = a.section || null;

        const roomPool = fixedRoom ? [fixedRoom] : validator._eligibleRoomsFor(subject, section, constraints);
        const profPool = fixedProfessor ? [fixedProfessor] : validator._eligibleProfsFor(subject);

        let placed = false;

        for (const day of DAYS) {
          for (const timeSlot of TIME_SLOTS) {
            for (const room of roomPool) {
              for (const professor of profPool) {
                // STRICT WORKLOAD CHECK FOR TARGETED ENGINE
                const profCurrentLoad = temp.filter(s => String(s.professor?.id) === String(professor.id)).reduce((sum, s) => sum + 1.5, 0);
                const profMax = professor.maxUnits || professor.maxHours || 12;
                if (profCurrentLoad + 1.5 > profMax) continue; // Skip to next professor if adding 1.5 exceeds max

                if (constraints?.preventDoubleBooking) {
                  // ... (keep the rest of your preventDoubleBooking logic below this line)
                  const roomBusy = temp.some(s =>
                    String(s.room?.id) === String(room.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
                  const profBusy = temp.some(s =>
                    String(s.professor?.id) === String(professor.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
                  const secBusy = section?.id ? temp.some(s =>
                    String(s.section?.id) === String(section.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id)) : false;

                  // NEW: Prevent scheduling the same subject for the same section on the SAME DAY twice
                  const sameDaySubjectBusy = section?.id ? temp.some(s =>
                    String(s.section?.id) === String(section.id) && String(s.subject?.id) === String(subject.id) && s.day === day
                  ) : false;

                  if (roomBusy || profBusy || secBusy || sameDaySubjectBusy) continue;
                }

                const check = validateScheduleEntry({ room, professor, subject, section, day, timeSlot });
                if (!check.valid) continue;

                const newSchedule = { room, professor, subject, section, day, timeSlot };

                const writeResult = await handleAddSchedule(newSchedule);
                if (writeResult && writeResult.ok === false) continue;

                temp.push(newSchedule);
                results.push(newSchedule);
                placed = true;
                break;
              }
              if (placed) break;
            }
            if (placed) break;
          }
          if (placed) break;
        }

        if (!placed) {
          let reason = 'Insufficient valid slots or missing qualified faculty';
          if (constraints?.respectLabs && subject?.requiredLab && fixedRoom && !fixedRoom.hasComputers) {
            reason = 'Requires computer lab (selected room is not a lab)';
          }
          unscheduled.push({ subject, section, reason });
        }
      }

      return { results, unscheduled, error: null };
    },
    autoSchedule: async (subjList, constraints) => {
      const results = [];
      const unscheduled = [];
      const tempSchedules = [...schedules];

      for (const subject of subjList) {
        let scheduled = false;

        // Find ALL authorized professors instead of picking the first one in the department
        const validProfs = professors.filter(p => professorMatchesSubject(p, subject));

        // Strict constraint: Do NOT fallback to all 'professors'
        const profPool = validProfs;

        searchLoop:
        for (const prof of profPool) {
          for (const day of DAYS) {
            for (const timeSlot of TIME_SLOTS) {
              for (const room of rooms) {
                if (constraints.respectLabs && subject.requiredLab && !room.hasComputers) {
                  continue;
                }

                const isRoomBusy = constraints.preventDoubleBooking
                  ? tempSchedules.some(s =>
                    String(s.room?.id) === String(room.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id))
                  : false;
                const isProfBusy = constraints.preventDoubleBooking
                  ? tempSchedules.some(s =>
                    String(s.professor?.id) === String(prof.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id))
                  : false;

                if (!isRoomBusy && !isProfBusy) {
                  const newSchedule = { room, professor: prof, subject, day, timeSlot };
                  tempSchedules.push(newSchedule);
                  // Await persistence so returned results reflect actual DB state.
                  const writeResult = await handleAddSchedule(newSchedule);
                  if (writeResult && writeResult.ok === false) {
                    continue;
                  }

                  results.push(newSchedule);
                  scheduled = true;
                  break searchLoop;
                }
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
    if (!isAdmin) return { ok: false, errors: ['Not authorized.'] };
    const newTimeSlot = TIME_SLOTS.find(ts => ts.id === newTimeSlotId);

    const existing = schedules.find(s => s.id === scheduleId);
    if (!existing) return { ok: false, errors: ['Schedule not found.'] };

    const check = validateScheduleEntry({
      room: existing.room,
      professor: existing.professor,
      subject: existing.subject,
      section: existing.section || null,
      day: newDay,
      timeSlot: newTimeSlot,
      excludeScheduleId: scheduleId,
    });

    if (!check.valid) {
      alert(`Cannot move schedule:\n${check.errors.join('\n')}`);
      return { ok: false, errors: check.errors };
    }

    await updateDoc(doc(db, 'schedules', scheduleId.toString()), {
      day: newDay,
      timeSlot: newTimeSlot
    });
    return { ok: true };
  };

  const handleAddSchedule = async (newSchedule) => {
    if (!isAdmin) return { ok: false, errors: ['Not authorized.'] };
    const check = validateScheduleEntry({
      room: newSchedule?.room,
      professor: newSchedule?.professor,
      subject: newSchedule?.subject,
      section: newSchedule?.section || null,
      day: newSchedule?.day,
      timeSlot: newSchedule?.timeSlot,
      excludeScheduleId: null,
    });
    if (!check.valid) return { ok: false, errors: check.errors };
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
            <img
              src={LOGO_SRC}
              alt="CAPSU Logo"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = FALLBACK_LOGO;
              }}
              style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #0288d1' }}
            />
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
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>Capiz State University | Mambusao Satellite College</p>
              <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold' }}>
                Welcome, {user?.name?.split?.(/\s+/)?.[0] ?? 'there'}
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
                    <thead><tr><th>ID</th><th>Name</th><th>Type</th></tr></thead>
                    <tbody>{rooms.slice(0, 2).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td style={{ textTransform: 'uppercase' }}>{r.type}</td></tr>)}</tbody>
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