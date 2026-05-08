import React, { useState } from 'react';
import { TIME_SLOTS, DAYS } from './index';
import './ScheduleTable.css';

function ScheduleTable({ schedules, onRemove, onUpdateSchedule, title = "ROOM SCHEDULE GRID" }) {
  const [dragOverCell, setDragOverCell] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const handleDragStart = (e, schedule) => {
    setDraggingId(schedule.id);
    e.dataTransfer.setData('scheduleId', schedule.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverCell(null);
  };

  const handleDragOver = (e, day, timeSlotId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cellKey = `${day}-${timeSlotId}`;
    if (dragOverCell !== cellKey) {
      setDragOverCell(cellKey);
    }
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = (e, day, timeSlotId) => {
    e.preventDefault();
    setDragOverCell(null);
    setDraggingId(null);

    const scheduleId = e.dataTransfer.getData('scheduleId');
    if (!scheduleId || !onUpdateSchedule) return;

    // Find the schedule being moved
    const movingSchedule = schedules.find(s => s.id === scheduleId);
    if (!movingSchedule) return;

    // Skip if dropping on the same slot
    if (movingSchedule.day === day && movingSchedule.timeSlot.id === timeSlotId) return;

    // Check for conflicts: is the room already occupied in that slot?
    const roomConflict = schedules.find(
      s => s.id !== scheduleId &&
           s.room.id === movingSchedule.room.id &&
           s.day === day &&
           s.timeSlot.id === timeSlotId
    );

    // Check for conflicts: is the professor already busy in that slot?
    const profConflict = schedules.find(
      s => s.id !== scheduleId &&
           s.professor.id === movingSchedule.professor.id &&
           s.day === day &&
           s.timeSlot.id === timeSlotId
    );

    if (roomConflict || profConflict) {
      const msgs = [];
      if (roomConflict) msgs.push(`Room "${movingSchedule.room.name}" is already occupied`);
      if (profConflict) msgs.push(`Prof. "${movingSchedule.professor.name}" is already teaching`);
      alert(`Cannot move schedule:\n${msgs.join('\n')}`);
      return;
    }

    onUpdateSchedule(scheduleId, day, timeSlotId);
  };

  return (
    <div className="schedule-table-container">
      {/* Header */}
      <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '20px', backgroundColor: 'var(--card-bg)', color: 'var(--text-main)', overflow: 'hidden' }}>
        <div style={{ flex: '0 0 100px', padding: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--table-header)' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '65px', height: '65px', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { e.target.src = "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Capiz_State_University_logo.png/220px-Capiz_State_University_logo.png"; }} />
        </div>
        <div style={{ flex: 1, padding: '15px', textAlign: 'center', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', fontWeight: '700', color: 'var(--accent-dark)', letterSpacing: '1px' }}>CAPIZ STATE UNIVERSITY</h2>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '2px' }}>{title}</h3>
        </div>
        <div style={{ flex: '0 0 180px', padding: '15px', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: 'var(--table-header)', color: 'var(--text-muted)' }}>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '4px' }}><strong>Doc. Code:</strong> CAPSU-F-045</div>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '4px' }}><strong>Revision No.:</strong> 01</div>
          <div><strong>Effectivity:</strong> Sept 2023</div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>Time Slot</th>
              {DAYS.map(day => <th key={day}>{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map(timeSlot => (
              <tr key={timeSlot.id}>
                <td className="time-label">
                  <strong>{timeSlot.label}</strong>
                </td>
                {DAYS.map(day => {
                  const cellKey = `${day}-${timeSlot.id}`;
                  const isDropTarget = dragOverCell === cellKey;
                  const cellSchedules = schedules.filter(
                    s => s.day === day && s.timeSlot.id === timeSlot.id
                  );

                  return (
                    <td
                      key={cellKey}
                      className={`schedule-cell ${isDropTarget ? 'drag-over' : ''}`}
                      onDragOver={(e) => handleDragOver(e, day, timeSlot.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, day, timeSlot.id)}
                    >
                      {cellSchedules.map(schedule => (
                        <div
                          key={schedule.id}
                          className={`schedule-item ${draggingId === schedule.id ? 'dragging' : ''}`}
                          draggable={!!onUpdateSchedule}
                          onDragStart={(e) => handleDragStart(e, schedule)}
                          onDragEnd={handleDragEnd}
                          style={{ cursor: onUpdateSchedule ? 'grab' : 'default' }}
                        >
                          <div className="schedule-content">
                            <p className="subject">
                              {schedule.subject.code}
                              {schedule.section && <span style={{ fontWeight: '400', fontSize: '0.75rem', color: '#4a5568' }}> — {schedule.section.name}</span>}
                            </p>
                            <p className="professor">{schedule.professor.name}</p>
                            <p className="room">{schedule.room.name}</p>
                          </div>
                          {onRemove && (
                            <button className="remove-btn" onClick={() => onRemove(schedule.id)} title="Remove schedule">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ScheduleTable;