// src/ScheduleTable.jsx
import React, { useState } from 'react';
import { TIME_SLOTS, DAYS } from './index';
import './ScheduleTable.css';

// Configurable grid constants
const START_HOUR = 7; // 7:00 AM
const END_HOUR = 19;  // 7:00 PM (19:00)
const MINUTE_HEIGHT = 1.3; // 1.3 pixels per minute = 78px per hour
const HOUR_HEIGHT = 60 * MINUTE_HEIGHT;

// Convert "HH:MM AM/PM" to total minutes since midnight
const parseTime = (timeStr) => {
  const parts = timeStr.trim().split(' ');
  if (parts.length < 2) return 0;
  let [h, m] = parts[0].split(':').map(Number);
  if (parts[1].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (parts[1].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + m;
};

// Format 24hr integer back to 12hr AM/PM string
const formatHour = (h) => {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hr}:00 ${ampm}`;
};

function ScheduleTable({ schedules, onRemove, onUpdateSchedule, title = "ROOM SCHEDULE GRID" }) {
  const LOGO_SRC = '/logo.jpg?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  const [dragOverCell, setDragOverCell] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const hoursArray = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

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

    const movingSchedule = schedules.find(s => s.id === scheduleId);
    if (!movingSchedule) return;

    if (movingSchedule.day === day && String(movingSchedule.timeSlot?.id) === String(timeSlotId)) return;

    const roomConflict = schedules.find(
      s => s.id !== scheduleId &&
        movingSchedule.room?.id != null &&
        String(s.room?.id) === String(movingSchedule.room.id) &&
        s.day === day &&
        String(s.timeSlot?.id) === String(timeSlotId)
    );

    const profConflict = schedules.find(
      s => s.id !== scheduleId &&
        movingSchedule.professor?.id != null &&
        String(s.professor?.id) === String(movingSchedule.professor.id) &&
        s.day === day &&
        String(s.timeSlot?.id) === String(timeSlotId)
    );

    const sectionConflict = movingSchedule.section?.id
      ? schedules.find(
        s => s.id !== scheduleId &&
          String(s.section?.id) === String(movingSchedule.section.id) &&
          s.day === day &&
          String(s.timeSlot?.id) === String(timeSlotId)
      )
      : null;

    if (roomConflict || profConflict || sectionConflict) {
      const msgs = [];
      if (roomConflict) msgs.push(`Room "${movingSchedule.room?.name ?? 'Unknown'}" is already occupied`);
      if (profConflict) msgs.push(`Prof. "${movingSchedule.professor?.name ?? 'Unknown'}" is already teaching`);
      if (sectionConflict) msgs.push(`Section "${movingSchedule.section?.name || 'Unknown'}" already has a class`);
      alert(`Cannot move schedule:\n${msgs.join('\n')}`);
      return;
    }

    onUpdateSchedule(scheduleId, day, timeSlotId);
  };

  return (
    <div className="schedule-table-container" style={{ animation: 'fadeIn 0.4s' }}>
      {/* Header Panel */}
      <div className="iso-header-panel">
        <div className="iso-logo-container">
          <img
            src={LOGO_SRC}
            alt="Logo"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = FALLBACK_LOGO;
            }}
          />
        </div>
        <div className="iso-title-container">
          <h2>CAPIZ STATE UNIVERSITY</h2>
          <h3>{title}</h3>
        </div>
        <div className="iso-meta-container">
          <div><strong>Doc. Code:</strong> CAPSU-F-045</div>
          <div><strong>Revision No.:</strong> 01</div>
          <div><strong>Effectivity:</strong> August 2026</div>
        </div>
      </div>

      {/* Main Timetable */}
      <div className="table-wrapper">
        <div className="timetable-modern">
          {/* Grid Header (Days) */}
          <div className="timetable-header">
            <div className="time-header-cell">Time</div>
            {DAYS.map(day => (
              <div key={day} className="day-header-cell">{day}</div>
            ))}
          </div>

          {/* Grid Body */}
          <div className="timetable-body" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>

            {/* Background Grid Lines & Y-Axis Labels */}
            <div className="timetable-bg">
              {hoursArray.slice(0, -1).map(h => (
                <div key={h} className="timetable-row" style={{ height: HOUR_HEIGHT }}>
                  <div className="time-label">{formatHour(h)}</div>
                  <div className="row-line"></div>
                </div>
              ))}
              {/* Final boundary line */}
              <div className="timetable-row" style={{ height: 0 }}>
                <div className="time-label">{formatHour(END_HOUR)}</div>
                <div className="row-line"></div>
              </div>
            </div>

            {/* Foreground Overlay columns (Days) */}
            <div className="timetable-columns">
              {DAYS.map(day => {
                const daySchedules = schedules.filter(s => s.day === day);

                return (
                  <div key={day} className="timetable-column">

                    {/* Invisible Drop Zones for Drag-and-Drop */}
                    {TIME_SLOTS.map(ts => {
                      const timeLabel = ts.time || ts.label || "";
                      const [startStr, endStr] = timeLabel.split(' - ');
                      if (!startStr || !endStr) return null;

                      const startMin = parseTime(startStr);
                      const endMin = parseTime(endStr);

                      const top = (startMin - START_HOUR * 60) * MINUTE_HEIGHT;
                      const height = (endMin - startMin) * MINUTE_HEIGHT;
                      const cellKey = `${day}-${ts.id}`;
                      const isDropTarget = dragOverCell === cellKey;

                      return (
                        <div
                          key={`drop-${ts.id}`}
                          className={`drop-zone ${isDropTarget ? 'active' : ''}`}
                          style={{ top, height }}
                          onDragOver={(e) => handleDragOver(e, day, ts.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, day, ts.id)}
                        ></div>
                      );
                    })}

                    {/* Deterministically Overlaid Cards */}
                    {daySchedules.map(schedule => {
                      const timeLabel = schedule.timeSlot?.time || schedule.timeSlot?.label || "";
                      const [startStr, endStr] = timeLabel.split(' - ');
                      if (!startStr || !endStr) return null;

                      const startMin = parseTime(startStr);
                      const endMin = parseTime(endStr);

                      const top = (startMin - START_HOUR * 60) * MINUTE_HEIGHT;
                      const height = (endMin - startMin) * MINUTE_HEIGHT;

                      return (
                        <div
                          key={schedule.id}
                          className={`schedule-card ${draggingId === schedule.id ? 'dragging' : ''}`}
                          style={{ top, height }}
                          draggable={!!onUpdateSchedule}
                          onDragStart={(e) => handleDragStart(e, schedule)}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="card-indicator"></div>
                          <div className="card-content">
                            <div className="card-title" title={`${schedule.subject?.code ?? '—'} ${schedule.section ? `— ${schedule.section.name}` : ''}`}>
                              {schedule.subject?.code ?? '—'}
                              {schedule.section && <span> — {schedule.section.name}</span>}
                            </div>
                            <div className="card-subtitle" title={schedule.professor?.name}>{schedule.professor?.name ?? '—'}</div>
                            <div className="card-location" title={schedule.room?.name}>{schedule.room?.name ?? '—'}</div>
                          </div>
                          {onRemove && (
                            <button className="remove-btn" onClick={() => onRemove(schedule.id)} title="Remove schedule">
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default ScheduleTable;