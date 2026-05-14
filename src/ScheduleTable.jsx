import React, { useState } from 'react';
import { TIME_SLOTS, DAYS } from './index';
import './ScheduleTable.css';

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 18;
const ROW_HEIGHT = 80;

const HOURS = [];
for (let i = GRID_START_HOUR; i < GRID_END_HOUR; i++) {
  HOURS.push(i);
}

const formatHour = (h) => {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hour}:00 ${ampm}`;
};

const parseTime = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(' ');
  if (parts.length < 2) return 0;
  let [h, m] = parts[0].split(':').map(Number);
  const period = parts[1].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h + (m / 60);
};

function ScheduleTable({ schedules, onRemove, onUpdateSchedule, title = "ROOM SCHEDULE GRID" }) {
  const LOGO_SRC = '/logo.jpg?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  const [draggingId, setDraggingId] = useState(null);

  const handleDragStart = (e, schedule) => {
    setDraggingId(schedule.id);
    e.dataTransfer.setData('scheduleId', schedule.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e, day) => {
    e.preventDefault();
    setDraggingId(null);

    const scheduleId = e.dataTransfer.getData('scheduleId');
    if (!scheduleId || !onUpdateSchedule) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const droppedHour = GRID_START_HOUR + (y / ROW_HEIGHT);

    const closestSlot = TIME_SLOTS.reduce((prev, curr) => {
      const prevStart = parseTime((prev.label || prev.time).split('-')[0]);
      const currStart = parseTime((curr.label || curr.time).split('-')[0]);
      return Math.abs(currStart - droppedHour) < Math.abs(prevStart - droppedHour) ? curr : prev;
    });

    const movingSchedule = schedules.find(s => s.id === scheduleId);
    if (!movingSchedule) return;
    if (movingSchedule.day === day && String(movingSchedule.timeSlot?.id) === String(closestSlot.id)) return;

    const roomConflict = schedules.find(s => s.id !== scheduleId && movingSchedule.room?.id != null && String(s.room?.id) === String(movingSchedule.room.id) && s.day === day && String(s.timeSlot?.id) === String(closestSlot.id));
    const profConflict = schedules.find(s => s.id !== scheduleId && movingSchedule.professor?.id != null && String(s.professor?.id) === String(movingSchedule.professor.id) && s.day === day && String(s.timeSlot?.id) === String(closestSlot.id));
    const sectionConflict = movingSchedule.section?.id ? schedules.find(s => s.id !== scheduleId && String(s.section?.id) === String(movingSchedule.section.id) && s.day === day && String(s.timeSlot?.id) === String(closestSlot.id)) : null;

    if (roomConflict || profConflict || sectionConflict) {
      const msgs = [];
      if (roomConflict) msgs.push(`Room "${movingSchedule.room?.name}" is already occupied`);
      if (profConflict) msgs.push(`Prof. "${movingSchedule.professor?.name}" is already teaching`);
      if (sectionConflict) msgs.push(`Section "${movingSchedule.section?.name}" already has a class`);
      alert(`Cannot move schedule:\n${msgs.join('\n')}`);
      return;
    }

    onUpdateSchedule(scheduleId, day, closestSlot.id);
  };

  return (
    <div className="schedule-table-container">
      <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '20px', backgroundColor: 'var(--card-bg)', color: 'var(--text-main)', overflow: 'hidden' }}>
        <div style={{ flex: '0 0 100px', padding: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border-color)', backgroundColor: '#F8FAFC' }}>
          <img src={LOGO_SRC} alt="Logo" style={{ width: '65px', height: '65px', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_LOGO; }} />
        </div>
        <div style={{ flex: 1, padding: '15px', textAlign: 'center', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', fontWeight: '700', color: '#2A265F', letterSpacing: '1px' }}>CAPIZ STATE UNIVERSITY</h2>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: '2px' }}>{title}</h3>
        </div>
        <div style={{ flex: '0 0 180px', padding: '15px', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#F8FAFC', color: '#64748B' }}>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '4px' }}><strong>Doc. Code:</strong> CAPSU-F-045</div>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '4px' }}><strong>Revision No.:</strong> 01</div>
          <div><strong>Effectivity:</strong> August 2026</div>
        </div>
      </div>

      <div className="table-wrapper">
        <div className="cal-header-row">
          <div className="cal-header-cell">TIME</div>
          {DAYS.map(day => <div key={day} className="cal-header-cell">{day}</div>)}
        </div>

        <div className="cal-body">
          <div className="cal-bg">
            {HOURS.map(hour => (
              <div key={hour} className="cal-bg-row">
                <div className="cal-time-label">{formatHour(hour)}</div>
                {DAYS.map(day => (
                  <div key={`${day}-${hour}`} className="cal-bg-cell"></div>
                ))}
              </div>
            ))}
          </div>

          <div className="cal-events-overlay">
            <div></div>

            {DAYS.map(day => {
              const daySchedules = schedules.filter(s => s.day === day);

              // 1. Process times and sort
              const processed = daySchedules.map(s => {
                const timeStr = s.timeSlot?.label || s.timeSlot?.time || '';
                const parts = timeStr.split(' - ');
                return {
                  ...s,
                  startH: parseTime(parts[0]),
                  endH: parseTime(parts[1])
                };
              }).sort((a, b) => a.startH - b.startH);

              // 2. Group concurrent overlaps so they sit side-by-side
              const groups = [];
              processed.forEach(event => {
                const group = groups.find(g => g.some(e => Math.max(event.startH, e.startH) < Math.min(event.endH, e.endH)));
                if (group) {
                  group.push(event);
                } else {
                  groups.push([event]);
                }
              });

              return (
                <div
                  key={`col-${day}`}
                  className="cal-day-col"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, day)}
                >
                  {groups.flatMap(group => {
                    const cols = group.length; // How many classes happen at once here?

                    return group.map((schedule, i) => {
                      const topPos = (schedule.startH - GRID_START_HOUR) * ROW_HEIGHT;
                      const eventHeight = (schedule.endH - schedule.startH) * ROW_HEIGHT;

                      // Calculate horizontal splits based on the overlap
                      const widthPct = 100 / cols;
                      const leftPct = widthPct * i;

                      return (
                        <div
                          key={schedule.id}
                          className={`cal-event ${draggingId === schedule.id ? 'dragging' : ''}`}
                          style={{
                            top: `${topPos}px`,
                            height: `${eventHeight}px`,
                            left: `calc(${leftPct}% + 4px)`,
                            width: `calc(${widthPct}% - 8px)`
                          }}
                          draggable={!!onUpdateSchedule}
                          onDragStart={(e) => handleDragStart(e, schedule)}
                          onDragEnd={() => setDraggingId(null)}
                        >
                          <div className="cal-event-content">
                            <div className="subj">{schedule.subject?.code || 'Unknown Subj'}</div>
                            <div className="prof">Prof. {schedule.professor?.name || 'TBA'}</div>
                            <div className="room">{schedule.room?.name || 'TBA'}</div>
                            {schedule.section && <div className="sec">Sec: {schedule.section.name}</div>}
                          </div>
                          {onRemove && (
                            <button className="remove-btn" onClick={() => onRemove(schedule.id)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                          )}
                        </div>
                      );
                    });
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScheduleTable;