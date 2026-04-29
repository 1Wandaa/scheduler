import React from 'react';
import './ProfessorWorkload.css';

function ProfessorWorkload({ professors, schedules }) {
  const getProfessorWorkload = (professor) => {
    const hours = schedules
      .filter(s => s.professor.id === professor.id)
      .length * 1.5;
    return hours;
  };

  return (
    <div className="professor-workload-container card">
      {/* ISO FORMAT HEADER */}
      <div style={{ display: 'flex', border: '2px solid #333', marginBottom: '20px', backgroundColor: '#fff', color: '#333', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ flex: '0 0 100px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '2px solid #333' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '70px', height: '70px', objectFit: 'cover' }} onError={(e) => { e.target.src="https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Capiz_State_University_logo.png/220px-Capiz_State_University_logo.png"; }} />
        </div>
        <div style={{ flex: 1, padding: '10px', textAlign: 'center', borderRight: '2px solid #333', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', fontWeight: 'bold' }}>CAPIZ STATE UNIVERSITY</h2>
          <h3 style={{ margin: 0, fontSize: '1rem', textTransform: 'uppercase' }}>FACULTY WORKLOAD REPORT</h3>
        </div>
        <div style={{ flex: '0 0 180px', padding: '10px', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '3px' }}><strong>Doc. Code:</strong> CAPSU-F-046</div>
          <div style={{ borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '3px' }}><strong>Revision No.:</strong> 01</div>
          <div><strong>Effectivity:</strong> Sept 2023</div>
        </div>
      </div>

      <div className="workload-list">
        {professors.map(professor => {
          const hours = getProfessorWorkload(professor);
          const utilization = (hours / professor.maxHours) * 100;
          const status = utilization > 100 ? 'overload' : utilization > 80 ? 'warning' : 'normal';

          return (
            <div key={professor.id} className={`workload-card ${status}`}>
              <h3>{professor.name}</h3>
              <p className="department">{professor.department}</p>
              <div className="workload-bar">
                <div className="bar-fill" style={{ width: `${Math.min(utilization, 100)}%` }}></div>
              </div>
              <p className="workload-text">
                {hours.toFixed(1)} / {professor.maxHours} hours
                <span className="percentage">({utilization.toFixed(0)}%)</span>
              </p>
              {schedules
                .filter(s => s.professor.id === professor.id)
                .slice(0, 3)
                .map((schedule, idx) => (
                  <p key={idx} className="schedule-item">
                    • {schedule.subject.code} - {schedule.day} {schedule.timeSlot.time}
                  </p>
                ))}
              {schedules.filter(s => s.professor.id === professor.id).length > 3 && (
                <p className="more-items">
                  +{schedules.filter(s => s.professor.id === professor.id).length - 3} more
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProfessorWorkload;
