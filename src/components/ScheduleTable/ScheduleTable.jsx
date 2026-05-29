import React, { useState, useEffect } from 'react';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import '../../styles/ScheduleTable.css';

function ScheduleTable({ schedules, onRemove, onUpdateSchedule, title = "ROOM SCHEDULE GRID" }) {
  const LOGO_SRC = '/logo.jpg?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  const [dragOverCell, setDragOverCell] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'cards'
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // Auto-switch to cards on mobile if still in grid
      if (mobile && viewMode === 'grid') setViewMode('cards');
      if (!mobile && viewMode === 'cards') setViewMode('grid');
    };
    window.addEventListener('resize', onResize);
    // Init
    if (window.innerWidth <= 768) setViewMode('cards');
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fullscreen: lock body scroll when fullscreen
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

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
    if (dragOverCell !== cellKey) setDragOverCell(cellKey);
  };

  const handleDragLeave = () => setDragOverCell(null);

  const handleDrop = (e, day, timeSlotId) => {
    e.preventDefault();
    setDragOverCell(null);
    setDraggingId(null);
    const scheduleId = e.dataTransfer.getData('scheduleId');
    if (!scheduleId || !onUpdateSchedule) return;
    const movingSchedule = schedules.find(s => s.id === scheduleId);
    if (!movingSchedule) return;
    if (movingSchedule.day === day && String(movingSchedule.timeSlot?.id) === String(timeSlotId)) return;
    const roomConflict = schedules.find(s => s.id !== scheduleId && movingSchedule.room?.id != null && String(s.room?.id) === String(movingSchedule.room.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlotId));
    const profConflict = schedules.find(s => s.id !== scheduleId && movingSchedule.professor?.id != null && String(s.professor?.id) === String(movingSchedule.professor.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlotId));
    const sectionConflict = movingSchedule.section?.id ? schedules.find(s => s.id !== scheduleId && String(s.section?.id) === String(movingSchedule.section.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlotId)) : null;
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

  // Group schedules by day for card view
  const schedulesByDay = DAYS.reduce((acc, day) => {
    acc[day] = schedules.filter(s => s.day === day).sort((a, b) => (a.timeSlot?.id ?? 0) - (b.timeSlot?.id ?? 0));
    return acc;
  }, {});

  const DAY_COLORS = {
    Monday: '#5645EE',
    Tuesday: '#02B974',
    Wednesday: '#F5A623',
    Thursday: '#EF2A66',
    Friday: '#0288d1',
  };

  // Department color mapping
  const DEPT_COLORS = {
    BSCS: { bg: '#109EEF', text: '#030813' },  // Blue (original)
    BSFT: { bg: '#16A34A', text: '#030813' },  // Green
    BSOA: { bg: '#8B5CF6', text: '#FFFFFF' },  // Purple
    BAEL: { bg: '#EAB308', text: '#030813' },  // Yellow
  };
  const DEFAULT_DEPT_COLOR = { bg: '#109EEF', text: '#030813' };

  const getDeptColor = (schedule) => {
    // 1. Try to find a known department in the section name (e.g. "BSCS 1A", "BSOA-1B")
    const sectionName = (schedule?.section?.name || '').toUpperCase();
    for (const dept of Object.keys(DEPT_COLORS)) {
      if (sectionName.includes(dept)) {
        return DEPT_COLORS[dept];
      }
    }

    // 2. Fallback: check subject.departments array or legacy subject.department string
    const subj = schedule?.subject;
    if (subj) {
      const depts = Array.isArray(subj.departments) ? subj.departments : (subj.department ? [subj.department] : []);
      for (const d of depts) {
        const upperD = String(d).toUpperCase();
        for (const dept of Object.keys(DEPT_COLORS)) {
          if (upperD.includes(dept)) {
            return DEPT_COLORS[dept];
          }
        }
      }
    }
    return DEFAULT_DEPT_COLOR;
  };

  const GridView = () => (
    <div className="table-wrapper">
      <table className="schedule-table">
        <thead>
          <tr>
            <th>Time Slot</th>
            {DAYS.map(day => <th key={day}>{day}</th>)}
          </tr>
        </thead>
        <tbody>
          {TIME_SLOTS.map((timeSlot, tIdx) => (
            <tr key={timeSlot.id}>
              <td className="time-label">
                <strong>{timeSlot.label}</strong>
              </td>
              {DAYS.map(day => {
                const cellKey = `${day}-${timeSlot.id}`;
                if (window[`skip_cell_${cellKey}`]) {
                  delete window[`skip_cell_${cellKey}`];
                  return null;
                }
                const isDropTarget = dragOverCell === cellKey;
                const cellSchedules = schedules.filter(s => s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
                let rowSpan = 1;
                const has2HrClass = cellSchedules.some(s => s.subject?.hoursPerMeeting === 2);
                if (has2HrClass && tIdx < TIME_SLOTS.length - 1) {
                  rowSpan = 2;
                  window[`skip_cell_${day}-${TIME_SLOTS[tIdx + 1].id}`] = true;
                }
                return (
                  <td
                    key={cellKey}
                    rowSpan={rowSpan}
                    className={`schedule-cell ${isDropTarget ? 'drag-over' : ''} ${cellSchedules.length > 0 ? 'has-schedule' : ''}`}
                    onDragOver={(e) => handleDragOver(e, day, timeSlot.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, day, timeSlot.id)}
                    style={cellSchedules.length > 0 ? { backgroundColor: getDeptColor(cellSchedules[0]).bg, padding: 0 } : {}}
                  >
                    {cellSchedules.map(schedule => {
                      const deptColor = getDeptColor(schedule);
                      return (
                        <div
                          key={schedule.id}
                          className={`schedule-item ${draggingId === schedule.id ? 'dragging' : ''}`}
                          draggable={!!onUpdateSchedule}
                          onDragStart={(e) => handleDragStart(e, schedule)}
                          onDragEnd={handleDragEnd}
                          style={{ cursor: onUpdateSchedule ? 'grab' : 'default' }}
                        >
                          <div className="schedule-content">
                            <p className="subject" style={{ color: deptColor.text }}>
                              {schedule.subject?.code ?? '—'}
                              {schedule.section && <span style={{ fontWeight: '500', fontSize: '0.75rem', color: deptColor.text }}> — {schedule.section.name}</span>}
                            </p>
                            <p className="professor" style={{ color: deptColor.text }}>{schedule.professor?.name ?? '—'}</p>
                            <p className="room" style={{ color: deptColor.text }}>{schedule.room?.name ?? '—'}</p>
                          </div>
                          {onRemove && (
                            <button className="remove-btn" onClick={() => onRemove(schedule.id)} title="Remove schedule">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const CardView = () => (
    <div className="schedule-card-view">
      {DAYS.map(day => {
        const daySched = schedulesByDay[day];
        return (
          <div key={day} className="schedule-day-group">
            <div className="schedule-day-header" style={{ borderLeftColor: DAY_COLORS[day] }}>
              <span style={{ color: DAY_COLORS[day] }}>{day}</span>
              <span className="schedule-day-count">{daySched.length} class{daySched.length !== 1 ? 'es' : ''}</span>
            </div>
            {daySched.length === 0 ? (
              <div className="schedule-day-empty">No classes</div>
            ) : (
              daySched.map(schedule => {
                const deptColor = getDeptColor(schedule);
                return (
                  <div key={schedule.id} className="schedule-card-item" style={{ borderLeftColor: deptColor.bg, backgroundColor: `${deptColor.bg}12` }}>
                    <div className="schedule-card-time">
                      {schedule.timeSlot?.label ?? '—'}
                    </div>
                    <div className="schedule-card-body">
                      <div className="schedule-card-subject">
                        {schedule.subject?.code ?? '—'}
                        {schedule.section && (
                          <span className="schedule-card-section"> · {schedule.section.name}</span>
                        )}
                      </div>
                      <div className="schedule-card-meta">
                        <span>👤 {schedule.professor?.name ?? '—'}</span>
                        <span>🏫 {schedule.room?.name ?? '—'}</span>
                      </div>
                    </div>
                    {onRemove && (
                      <button className="remove-btn" onClick={() => onRemove(schedule.id)} title="Remove schedule">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={`schedule-table-container ${isFullscreen ? 'schedule-fullscreen' : ''}`}>

      {/* Toolbar row */}
      <div className="schedule-toolbar">
        {/* View toggle */}
        <div className="schedule-view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <span>Grid</span>
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Card view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            <span>Cards</span>
          </button>
        </div>

        {/* Fullscreen toggle (grid view only) */}
        {viewMode === 'grid' && (
          <button
            className="fullscreen-btn"
            onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            )}
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
        )}
      </div>

      {/* Header */}
      <div className="schedule-doc-header">
        <div className="schedule-doc-logo">
          <img
            src={LOGO_SRC}
            alt="Logo"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_LOGO; }}
          />
        </div>
        <div className="schedule-doc-title">
          <h2>CAPIZ STATE UNIVERSITY</h2>
          <h3>{title}</h3>
        </div>
        <div className="schedule-doc-meta">
          <div><strong>Doc. Code:</strong> CAPSU-F-045</div>
          <div><strong>Revision No.:</strong> 01</div>
          <div><strong>Effectivity:</strong> August 2026</div>
        </div>
      </div>

      {/* Department Color Legend */}
      <div className="dept-legend">
        {Object.entries(DEPT_COLORS).map(([dept, color]) => (
          <div key={dept} className="dept-legend-item">
            <span className="dept-legend-swatch" style={{ backgroundColor: color.bg }}></span>
            <span className="dept-legend-label">{dept}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      {viewMode === 'grid' ? <GridView /> : <CardView />}

      {/* Fullscreen close hint */}
      {isFullscreen && (
        <div className="fullscreen-hint" onClick={() => setIsFullscreen(false)}>
          Press ESC or click here to exit fullscreen
        </div>
      )}
    </div>
  );
}

export default ScheduleTable;