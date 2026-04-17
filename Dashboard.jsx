import React, { useState } from 'react';
import { initialRooms, initialProfessors, initialSubjects } from './initial';
import { TIME_SLOTS, DAYS } from './index';

// --- COMPONENTS ---
import UserManagement from './UserManagement';
import ProfessorWorkload from './ProfessorWorkload';
import ScheduleTable from './ScheduleTable';
import ScheduleForm from './ScheduleForm';
import AutoScheduler from './AutoScheduler';

const Dashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isManageDataOpen, setIsManageDataOpen] = useState(true);

  // --- STATE ---
  const [rooms] = useState(initialRooms);
  const [professors] = useState(initialProfessors);
  const [subjects] = useState(initialSubjects);
  const [schedules, setSchedules] = useState([]);

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
    addSchedule: (room, professor, subject, day, timeSlot) => ({ schedule: { id: Date.now().toString(), room, professor, subject, day, timeSlot } }),
    clearAllSchedules: () => setSchedules([]),
    autoSchedule: (subjList) => {
      return { results: [], unscheduled: [], error: null };
    }
  };

  return (
    <div className="smartsched-container">
      {/* ================= SIDEBAR ================= */}
      <div className="sidebar" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div className="logo-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
            <img src="/logo.jpg" alt="CAPSU Logo" onError={(e) => { e.target.src="https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Capiz_State_University_logo.png/220px-Capiz_State_University_logo.png"; }} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #0288d1' }} />
          </div>
          
          <ul className="nav-menu">
            <li className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</li>
            
            <li className="nav-item" onClick={() => setIsManageDataOpen(!isManageDataOpen)}>👥 Manage Data {isManageDataOpen ? '▴' : '▾'}</li>
            
            {isManageDataOpen && (
              <>
                <li className="nav-sub-item" style={{ color: activeTab === 'faculty' ? '#0288d1' : '' }} onClick={() => setActiveTab('faculty')}>Faculty Profiles</li>
                <li className="nav-sub-item" style={{ color: activeTab === 'rooms' ? '#0288d1' : '' }} onClick={() => setActiveTab('rooms')}>Room List</li>
                {/* FIXED CLICKS HERE */}
                <li className="nav-sub-item" style={{ color: activeTab === 'subjects' ? '#0288d1' : '' }} onClick={() => setActiveTab('subjects')}>Subject Management</li>
                <li className="nav-sub-item" style={{ color: activeTab === 'users' ? '#0288d1' : '' }} onClick={() => setActiveTab('users')}>User Management</li>
              </>
            )}
            <li className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>📅 Schedule</li>
            
            {/* FIXED CLICKS HERE */}
            <li className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>📈 Analytics</li>
            <li className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => alert("Settings page coming soon!")}>⚙️ Settings</li>
            
            <li className="nav-item" onClick={onLogout} style={{marginTop: '10px'}}>🚪 Log Out</li>
          </ul>
        </div>

        {/* Sidebar Bottom Stats Box */}
        <div className="sidebar-stats-box">
          <div className="stat-row"><span>👥 Faculty</span> <strong>{professors.length}</strong></div>
          <div className="stat-row"><span>🚪 Rooms</span> <strong>{rooms.length}</strong></div>
          <div className="stat-row"><span>📅 Classes</span> <strong>{schedules.length}</strong></div>
          <div className="stat-row" style={{color: '#d32f2f'}}><span>⚠️ Conflicts</span> <strong>0</strong></div>
        </div>
      </div>

      {/* ================= MAIN CONTENT ================= */}
      <div className="main-content">
        <div className="header-title" style={{ marginBottom: '15px' }}>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Capiz State University | Mambusao Satellite College</p>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold' }}>SMARTSCHED</h1>
        </div>

        {/* --- THE MASTER DASHBOARD VIEW --- */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-master-grid" style={{ animation: 'fadeIn 0.5s' }}>
            
            {/* Top Row: Faculty & Rooms previews */}
            <div className="grid-top-row">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Managed Data - Faculty Profiles</h3>
                  {/* FIXED CLICK HERE */}
                  <button className="btn" onClick={() => setActiveTab('faculty')}>Manage Faculty</button>
                </div>
                <table className="data-table">
                  <thead><tr><th>Faculty ID</th><th>Full Name</th><th>Department</th><th>Max Hours</th></tr></thead>
                  <tbody>{professors.slice(0,2).map(p => <tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.department}</td><td>{p.maxHours}</td></tr>)}</tbody>
                </table>
              </div>
              
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Managed Data - Room List</h3>
                  {/* FIXED CLICK HERE */}
                  <button className="btn" onClick={() => setActiveTab('rooms')}>Manage Rooms</button>
                </div>
                <table className="data-table">
                  <thead><tr><th>Room ID</th><th>Name</th><th>Type</th><th>Capacity</th></tr></thead>
                  <tbody>{rooms.slice(0,2).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.type}</td><td>{r.capacity}</td></tr>)}</tbody>
                </table>
              </div>
            </div>

            {/* Bottom Row: Schedule Grid vs Alerts/Analytics */}
            <div className="grid-bottom-row">
              
              {/* Left Side: Weekly Timetable Component */}
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div className="card-header" style={{ padding: '20px 20px 0 20px', border: 'none' }}>
                  <h3 className="card-title">Weekly Room & Faculty Schedule</h3>
                  {/* FIXED CLICKS HERE */}
                  <div>
                    <button className="btn" onClick={() => setActiveTab('schedule')} style={{marginRight: '10px'}}>Go to Scheduler</button>
                    <button className="btn" onClick={() => window.print()} style={{background: '#eee', color: '#333'}}>🖨️ Print</button>
                  </div>
                </div>
                <div style={{ padding: '10px', transform: 'scale(0.95)', transformOrigin: 'top left' }}>
                  <ScheduleTable schedules={schedules} onRemove={(id) => setSchedules(schedules.filter(s => s.id !== id))} />
                </div>
              </div>

              {/* Right Side Stack: Alerts & Analytics */}
              <div className="right-column-stack">
                <div className="card">
                  <h3 className="card-title" style={{marginBottom: '15px'}}>Conflict Alerts & Updates</h3>
                  <div className="alert-item alert-danger"><strong>Conflict:</strong> Section BSCS 3A simultaneous classes.</div>
                  <div className="alert-item alert-warning"><strong>Warning:</strong> Room NB04 over-assigned.</div>
                  <div className="alert-item alert-info"><strong>Info:</strong> All faculty course specializations updated.</div>
                </div>

                <div className="analytics-row">
                  <div className="card">
                    <h3 className="card-title" style={{fontSize: '0.9rem', textAlign: 'center'}}>Faculty Workload</h3>
                    <div className="chart-container">
                      <div className="bar" style={{height: '80%'}}></div><div className="bar" style={{height: '50%'}}></div><div className="bar" style={{height: '90%'}}></div>
                    </div>
                  </div>
                  <div className="card">
                    <h3 className="card-title" style={{fontSize: '0.9rem', textAlign: 'center'}}>Room Efficiency</h3>
                    <div style={{paddingTop: '20px', display: 'flex', justifyContent: 'center'}}>
                      <div className="pie-chart">85%</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* --- ALL OTHER TABS --- */}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'analytics' && <ProfessorWorkload professors={professors} schedules={schedules} />}
        
        {activeTab === 'schedule' && (
           <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', animation: 'fadeIn 0.5s' }}>
             <ScheduleForm rooms={rooms} professors={professors} subjects={subjects} onSchedule={(s) => setSchedules([...schedules, s])} validator={validator} />
             <AutoScheduler validator={validator} subjects={subjects} onAutoSchedule={() => {}} />
           </div>
        )}

        {activeTab === 'rooms' && (
          <div className="card">
            <h3 className="card-title" style={{marginBottom: '15px'}}>System Rooms</h3>
            <table className="data-table">
              <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Capacity</th></tr></thead>
              <tbody>{rooms.map(r => <tr key={r.id}><td>{r.id}</td><td><strong>{r.name}</strong></td><td>{r.type.toUpperCase()} {r.hasComputers && '💻'}</td><td>{r.capacity} pax</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {activeTab === 'faculty' && (
          <div className="card">
            <h3 className="card-title" style={{marginBottom: '15px'}}>Faculty Database</h3>
            <table className="data-table">
              <thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Max Load</th></tr></thead>
              <tbody>{professors.map(p => <tr key={p.id}><td>{p.id}</td><td><strong>{p.name}</strong></td><td>{p.department}</td><td>{p.maxHours} hrs</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {activeTab === 'subjects' && (
          <div className="card">
            <h3 className="card-title" style={{marginBottom: '15px'}}>Subject Constraints</h3>
            <table className="data-table">
              <thead><tr><th>Code</th><th>Name</th><th>Lab Required</th><th>Capacity</th></tr></thead>
              <tbody>{subjects.map(s => <tr key={s.id}><td><strong>{s.code}</strong></td><td>{s.name}</td><td>{s.requiredLab ? 'Yes 💻' : 'No'}</td><td>{s.capacity} pax</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;