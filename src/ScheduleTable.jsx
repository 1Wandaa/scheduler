import React from 'react';
import { TIME_SLOTS, DAYS } from './index';
import './ScheduleTable.css';

function ScheduleTable({ schedules, onRemove }) {
  const getScheduleForSlot = (room, day, timeSlot) => {
    return schedules.find(
      s => s.room.id === room && s.day === day && s.timeSlot.id === timeSlot.id
    );
  };

  return (
    <div className="schedule-table-container">
      <h2>Room Schedule Grid</h2>
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
                  <td key={`${day}-${timeSlot.id}`} className="schedule-cell">
                    {schedules
                      .filter(s => s.day === day && s.timeSlot.id === timeSlot.id)
                      .map(schedule => (
                        <div key={schedule.id} className="schedule-item">
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
