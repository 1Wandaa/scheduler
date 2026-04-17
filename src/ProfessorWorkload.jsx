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
    <div className="professor-workload-container">
      <h2>Professor Workload</h2>
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
