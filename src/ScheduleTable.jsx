import React from 'react';
import { TIME_SLOTS, DAYS } from './index';
import './ScheduleTable.css';

function ScheduleTable({ schedules, onRemove, onUpdateSchedule, title = "ROOM SCHEDULE GRID" }) {
  const getScheduleForSlot = (room, day, timeSlot) => {
    return schedules.find(
      s => s.room.id === room && s.day === day && s.timeSlot.id === timeSlot.id
    );
  };

  const handleDragStart = (e, scheduleId) => {
    e.dataTransfer.setData('scheduleId', scheduleId);
  };

  const handleDrop = (e, day, timeSlotId) => {
    e.preventDefault();
    const scheduleId = e.dataTransfer.getData('scheduleId');
    if (scheduleId && onUpdateSchedule) {
      onUpdateSchedule(scheduleId, day, timeSlotId);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="schedule-table-container">
      {/* ISO FORMAT HEADER */}
      <div style={{ display: 'flex', border: '2px solid #333', marginBottom: '20px', backgroundColor: '#fff', color: '#333', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ flex: '0 0 100px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '2px solid #333' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '70px', height: '70px', objectFit: 'cover' }} onError={(e) => { e.target.src="https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Capiz_State_University_logo.png/220px-Capiz_State_University_logo.png"; }} />
        </div>
        <div style={{ flex: 1, padding: '10px', textAlign: 'center', borderRight: '2px solid #333', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', fontWeight: 'bold' }}>CAPIZ STATE UNIVERSITY</h2>
          <h3 style={{ margin: 0, fontSize: '1rem', textTransform: 'uppercase' }}>{title}</h3>
        </div>
        <div style={{ flex: '0 0 180px', padding: '10px', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '3px' }}><strong>Doc. Code:</strong> CAPSU-F-045</div>
          <div style={{ borderBottom: '1px solid #ccc', paddingBottom: '3px', marginBottom: '3px' }}><strong>Revision No.:</strong> 01</div>
          <div><strong>Effectivity:</strong> Sept 2023</div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>Time Slot</th>
              {DAYS.map(day => (
                <th key={day}>{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map(timeSlot => (
              <tr key={timeSlot.id}>
                <td className="time-label">
                  <strong>{timeSlot.label}</strong>
                  <br />
                  <small>{timeSlot.time}</small>
                </td>
                {DAYS.map(day => (
                  <td 
                    key={`${day}-${timeSlot.id}`} 
                    className="schedule-cell"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day, timeSlot.id)}
                  >
                    {schedules
                      .filter(s => s.day === day && s.timeSlot.id === timeSlot.id)
                      .map(schedule => (
                        <div 
                          key={schedule.id} 
                          className="schedule-item"
                          draggable
                          onDragStart={(e) => handleDragStart(e, schedule.id)}
                          style={{ cursor: 'grab' }}
                        >
                          <div className="schedule-content">
                            <p className="subject">{schedule.subject.code}</p>
                            <p className="professor">{schedule.professor.name.split(' ').pop()}</p>
                            <p className="room">{schedule.room.name}</p>
                          </div>
                          <button
                            className="remove-btn"
                            onClick={() => onRemove(schedule.id)}
                            title="Remove schedule"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ScheduleTable;
