import React from 'react';
import './ProfessorWorkload.css';

function ProfessorWorkload({ professors, schedules }) {
  const getProfessorWorkload = (professor) => {
    // Assuming each scheduled slot is 1.5 hours
    const hours = schedules.filter(s => s.professor.id === professor.id).length * 1.5;
    return hours;
  };

  return (
    <div className="professor-workload-container card" style={{ animation: 'fadeIn 0.5s' }}>

      {/* MODERNIZED ISO FORMAT HEADER */}
      <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '25px', backgroundColor: 'var(--card-bg)', color: 'var(--text-main)', overflow: 'hidden' }}>
        <div style={{ flex: '0 0 100px', padding: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--table-header)' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '65px', height: '65px', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { e.target.src = "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Capiz_State_University_logo.png/220px-Capiz_State_University_logo.png"; }} />
        </div>
        <div style={{ flex: 1, padding: '15px', textAlign: 'center', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', fontWeight: '700', color: 'var(--accent-dark)', letterSpacing: '1px' }}>CAPIZ STATE UNIVERSITY</h2>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '2px' }}>FACULTY WORKLOAD REPORT</h3>
        </div>
        <div style={{ flex: '0 0 180px', padding: '15px', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: 'var(--table-header)', color: 'var(--text-muted)' }}>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '4px' }}><strong>Doc. Code:</strong> CAPSU-F-046</div>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '4px' }}><strong>Revision No.:</strong> 01</div>
          <div><strong>Effectivity:</strong> Sept 2023</div>
        </div>
      </div>

      <div className="workload-list">
        {professors.map(professor => {
          const hours = getProfessorWorkload(professor);
          const utilization = (hours / professor.maxHours) * 100;

          let statusClass = 'normal';
          let statusColor = 'var(--success)';
          if (utilization > 100) { statusClass = 'overload'; statusColor = 'var(--danger)'; }
          else if (utilization > 80) { statusClass = 'warning'; statusColor = 'var(--warning)'; }

          return (
            <div key={professor.id} className={`workload-card ${statusClass}`} style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', backgroundColor: statusColor }}></div>

              <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {professor.name}
                <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '12px', backgroundColor: 'var(--bg-main)', color: statusColor, border: `1px solid ${statusColor}` }}>
                  {utilization.toFixed(0)}%
                </span>
              </h3>
              <p className="department">{professor.department}</p>

              <div className="workload-bar">
                <div className="bar-fill" style={{ width: `${Math.min(utilization, 100)}%`, backgroundColor: statusColor }}></div>
              </div>

              <p className="workload-text" style={{ color: 'var(--text-main)' }}>
                <strong>{hours.toFixed(1)}</strong> / {professor.maxHours} hours assigned
              </p>

              <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Recent Assignments</p>
                {schedules.filter(s => s.professor.id === professor.id).slice(0, 3).map((schedule, idx) => (
                  <div key={idx} className="schedule-item" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: '500' }}>{schedule.subject.code}</span>
                    <span>{schedule.day.slice(0, 3)} • {schedule.timeSlot.time.split('-')[0]}</span>
                  </div>
                ))}
                {schedules.filter(s => s.professor.id === professor.id).length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No classes assigned yet.</p>
                )}
                {schedules.filter(s => s.professor.id === professor.id).length > 3 && (
                  <p className="more-items">+{schedules.filter(s => s.professor.id === professor.id).length - 3} more classes</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProfessorWorkload;