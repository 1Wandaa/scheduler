import React, { useState, useEffect } from 'react';
import { initialRooms, initialProfessors, initialSubjects } from './initial';
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
import RoomUtilization from './RoomUtilization';

const Dashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isManageDataOpen, setIsManageDataOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    const initializeData = async () => {
      const roomsSnapshot = await getDocs(collection(db, 'rooms'));
      if (roomsSnapshot.empty) {
        const batch = writeBatch(db);
        initialRooms.forEach(r => batch.set(doc(db, 'rooms', r.id.toString()), r));
        initialProfessors.forEach(p => batch.set(doc(db, 'professors', p.id.toString()), p));
        initialSubjects.forEach(s => batch.set(doc(db, 'subjects', s.id.toString()), s));
        await batch.commit();
      }
    };
    initializeData();

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => setRooms(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubProfs = onSnapshot(collection(db, 'professors'), (snap) => setProfessors(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSubj = onSnapshot(collection(db, 'subjects'), (snap) => setSubjects(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSched = onSnapshot(collection(db, 'schedules'), (snap) => setSchedules(snap.docs.map(d => ({ ...d.data(), id: d.id }))));

    return () => { unsubRooms(); unsubProfs(); unsubSubj(); unsubSched(); };
  }, []);

  // --- VALIDATOR ENGINE ---
  const validator = {
    validateAssignment: (room, professor, subject, day, timeSlot) => {
      const errors = []; const warnings = [];
      if (schedules.find(s => s.room.id === room.id && s.day === day && s.timeSlot.id === timeSlot.id)) errors.push(`Room occupied.`);
      if (schedules.find(s => s.professor.id === professor.id && s.day === day && s.timeSlot.id === timeSlot.id)) errors.push(`Professor busy.`);
      if (subject.requiredLab && !room.hasComputers) errors.push(`Requires Lab.`);
      if (room.capacity < subject.capacity) warnings.push(`Capacity warning.`);
      return { valid: errors.length === 0, errors, warnings };
    },
    addSchedule: (room, professor, subject, day, timeSlot) => ({ schedule: { room, professor, subject, day, timeSlot } }),
    clearAllSchedules: () => {
      schedules.forEach(s => deleteDoc(doc(db, 'schedules', s.id)));
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

              const isRoomBusy = tempSchedules.some(s => s.room.id === room.id && s.day === day && s.timeSlot.id === timeSlot.id);
              const isProfBusy = tempSchedules.some(s => s.professor.id === prof.id && s.day === day && s.timeSlot.id === timeSlot.id);

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
    await updateDoc(doc(db, 'schedules', scheduleId.toString()), {
      day: newDay,
      timeSlot: newTimeSlot
    });
  };

  const handleAddSchedule = async (newSchedule) => {
    if (!isAdmin) return;
    await addDoc(collection(db, 'schedules'), newSchedule);
  };

  const handleRemoveSchedule = async (id) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, 'schedules', id.toString()));
  };

  return (
    <div className="smartsched-container">
      {/* ================= SIDEBAR ================= */}
      <div className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
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
                    <li className="nav-sub-item" style={{ color: activeTab === 'users' ? 'var(--accent-primary)' : '' }} onClick={() => handleTabClick('users')}>User Management</li>
                  </>
                )}
                <li className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => handleTabClick('schedule')}>Create Schedule</li>
              </>
            )}

            <li className={`nav-item ${activeTab === 'workload' ? 'active' : ''}`} onClick={() => handleTabClick('workload')}>Faculty Workload</li>
            <li className={`nav-item ${activeTab === 'room-utilization' ? 'active' : ''}`} onClick={() => handleTabClick('room-utilization')}>Room Utilization</li>
            <li className="nav-item" onClick={onLogout} style={{ marginTop: '10px', color: 'var(--danger)' }}>Log Out</li>
          </ul>
        </div>

        <div className="sidebar-stats-box">
          <div className="stat-row"><span>Faculty</span> <strong>{professors.length}</strong></div>
          <div className="stat-row"><span>Rooms</span> <strong>{rooms.length}</strong></div>
          <div className="stat-row"><span>Classes</span> <strong>{schedules.length}</strong></div>
        </div>
      </div>

      {/* ================= MAIN CONTENT ================= */}
      <div className="main-content">
        <div className="header-title" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Capiz State University | Mambusao Satellite College</p>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold' }}>
              Welcome, {user?.name.split(' ')[0]}
            </h1>
          </div>
          <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>☰</button>
        </div>

        {activeTab === 'dashboard' && (
          <div className="dashboard-master-grid" style={{ animation: 'fadeIn 0.5s' }}>
            <div className="grid-top-row">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Managed Data - Faculty Profiles</h3>
                  {isAdmin && <button className="btn" onClick={() => setActiveTab('faculty')}>Manage Faculty</button>}
                </div>
                <table className="data-table">
                  <thead><tr><th>ID</th><th>Full Name</th><th>Department</th><th>Max Hours</th></tr></thead>
                  <tbody>{professors.slice(0, 2).map(p => <tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.department}</td><td>{p.maxHours}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Managed Data - Room List</h3>
                  {isAdmin && <button className="btn" onClick={() => setActiveTab('rooms')}>Manage Rooms</button>}
                </div>
                <table className="data-table">
                  <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Capacity</th></tr></thead>
                  <tbody>{rooms.slice(0, 2).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td style={{ textTransform: 'uppercase' }}>{r.type}</td><td>{r.capacity}</td></tr>)}</tbody>
                </table>
              </div>
            </div>

            <div className="grid-bottom-row">
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div className="card-header" style={{ padding: '20px 20px 0 20px', border: 'none' }}>
                  <h3 className="card-title">Weekly Room & Faculty Schedule</h3>
                  <div>
                    {isAdmin && <button className="btn" onClick={() => setActiveTab('schedule')} style={{ marginRight: '10px' }}>Go to Scheduler</button>}
                    <button className="btn" onClick={() => window.print()} style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>Print</button>
                  </div>
                </div>
                <div style={{ padding: '10px', transform: 'scale(0.95)', transformOrigin: 'top left' }}>
                  <ScheduleTable
                    schedules={schedules}
                    onRemove={isAdmin ? handleRemoveSchedule : null}
                    onUpdateSchedule={isAdmin ? handleUpdateSchedule : null}
                  />
                </div>
              </div>

              <div className="right-column-stack">
                <div className="card">
                  <h3 className="card-title" style={{ marginBottom: '15px' }}>System Alerts</h3>
                  <div className="alert-item alert-info"><strong>Ready:</strong> Schedule data is up to date.</div>
                  {!isAdmin && <div className="alert-item alert-warning"><strong>Notice:</strong> You are in View-Only mode. Contact an Admin for schedule changes.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- ALL OTHER TABS --- */}
        {isAdmin && activeTab === 'users' && <UserManagement />}
        {isAdmin && activeTab === 'schedule' && (
          <div className="schedule-grid" style={{ animation: 'fadeIn 0.5s' }}>
            <ScheduleForm rooms={rooms} professors={professors} subjects={subjects} onSchedule={handleAddSchedule} validator={validator} />
            <AutoScheduler validator={validator} subjects={subjects} onAutoSchedule={() => { }} />
          </div>
        )}
        {isAdmin && activeTab === 'rooms' && <RoomManagement rooms={rooms} />}
        {isAdmin && activeTab === 'faculty' && <FacultyManagement professors={professors} />}
        {isAdmin && activeTab === 'subjects' && <SubjectManagement subjects={subjects} />}
        {activeTab === 'workload' && <ProfessorWorkload professors={professors} schedules={schedules} />}
        {activeTab === 'room-utilization' && <RoomUtilization rooms={rooms} schedules={schedules} />}

      </div>
    </div>
  );
};

export default Dashboard;