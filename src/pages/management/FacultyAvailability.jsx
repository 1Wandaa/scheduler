import React, { useState, useMemo, useEffect } from 'react';
import { DAYS } from '../../config/constants';
import { getScheduleTimeRange } from '../../utils/scheduleUtils';

const TIMELINE_START = 420; // 7:00 AM in minutes
const TIMELINE_END = 1080; // 6:00 PM in minutes
const TIMELINE_DURATION = TIMELINE_END - TIMELINE_START;

const hours = [];
for (let i = 7; i <= 18; i++) {
  hours.push(i);
}

function FacultyAvailability({ professors, schedules, activeSemester, activeSchoolYear, onBack }) {
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [selectedDepartment, setSelectedDepartment] = useState('All');

  const departments = useMemo(() => {
    const depts = new Set(professors.map(p => p.department || 'Unassigned'));
    return ['All', ...Array.from(depts).sort()];
  }, [professors]);

  const filteredFaculty = useMemo(() => {
    let result = professors;
    if (selectedDepartment !== 'All') {
      result = result.filter(p => (p.department || 'Unassigned') === selectedDepartment);
    }
    return result.sort((a, b) => {
      const nameA = a.formattedName || a.name || '';
      const nameB = b.formattedName || b.name || '';
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [professors, selectedDepartment]);

  // Precompute schedule map for O(1) lookups during render
  const scheduleMap = useMemo(() => {
    const map = {};
    professors.forEach(p => map[p.id] = []);

    schedules.forEach(s => {
      if (s.day !== selectedDay || !s.professor?.id) return;
      if (map[s.professor.id]) {
        map[s.professor.id].push(s);
      }
    });
    return map;
  }, [schedules, selectedDay, professors]);

  const formatTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="card" style={{ backgroundImage: 'none', backgroundColor: '#ffffff' }}>
      <div className="mgmt-header">
        <div className="mgmt-header-left">
          {onBack && (
            <button className="back-btn" onClick={onBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back
            </button>
          )}
          <div className="mgmt-header-info">
            <h3 className="card-title">
              <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              Faculty Availability
            </h3>
            <p>Real-time faculty matrix for {activeSemester} {activeSchoolYear}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Day of Week</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: selectedDay === day ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-color)',
                  background: selectedDay === day ? 'var(--accent-primary)' : 'transparent',
                  color: selectedDay === day ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                }}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
        
        <div style={{ minWidth: '200px', flex: 1 }}>
          <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Filter Department</label>
          <select 
            className="form-select" 
            style={{ width: '100%' }}
            value={selectedDepartment} 
            onChange={(e) => setSelectedDepartment(e.target.value)}
          >
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }} className="custom-scrollbar">
        <div className="availability-grid-container">
          
          {/* Header */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 20 }}>
            {/* Sticky row label header */}
            <div className="availability-header-label">
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Faculty</span>
            </div>
            
            {/* Timeline headers */}
            <div style={{ flex: 1, position: 'relative', height: '44px', background: 'var(--bg-main)' }}>
              {hours.map((hour) => {
                const pct = ((hour * 60 - TIMELINE_START) / TIMELINE_DURATION) * 100;
                const displayHour = hour > 12 ? hour - 12 : hour;
                const ampm = hour >= 12 ? 'PM' : 'AM';
                return (
                  <div key={hour} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, borderLeft: '1px solid var(--border-color)' }}>
                     <div className="availability-time-header" style={{ left: hour === 7 ? '4px' : 0, transform: hour === 7 ? 'none' : 'translateX(-50%)' }}>
                       {displayHour}<span className="time-min">:00</span> <span className="time-ampm">{ampm}</span>
                     </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body rows */}
          {filteredFaculty.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No faculty found.</div>
          ) : (
            filteredFaculty.map(professor => (
              <div key={professor.id} style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
                {/* Sticky row label */}
                <div className="availability-row-label">
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{professor.formattedName || professor.name}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{professor.department || 'Unassigned'}</div>
                </div>

                {/* Timeline row */}
                <div style={{ flex: 1, position: 'relative', minHeight: '64px' }}>
                  {/* Background Grid Lines */}
                  {hours.map((hour) => {
                    const pct = ((hour * 60 - TIMELINE_START) / TIMELINE_DURATION) * 100;
                    return (
                      <React.Fragment key={hour}>
                        <div style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, borderLeft: '1px solid var(--border-color)', opacity: 0.3, pointerEvents: 'none' }} />
                        {hour < 18 && (
                          <div style={{ position: 'absolute', left: `${((hour * 60 + 30 - TIMELINE_START) / TIMELINE_DURATION) * 100}%`, top: 0, bottom: 0, borderLeft: '1px dashed var(--border-color)', opacity: 0.2, pointerEvents: 'none' }} />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Schedule Blocks */}
                  {(() => {
                    const profSchedules = scheduleMap[professor.id] || [];
                    return profSchedules.map(sched => {
                      const { start, end } = getScheduleTimeRange(sched, 'standard');
                      if (!start || !end) return null;
                      
                      const startMin = Math.max(TIMELINE_START, start);
                      const endMin = Math.min(TIMELINE_END, end);
                      if (endMin <= startMin) return null;

                      const leftPct = ((startMin - TIMELINE_START) / TIMELINE_DURATION) * 100;
                      const widthPct = ((endMin - startMin) / TIMELINE_DURATION) * 100;

                      const sectionName = (sched.section?.name || '').toUpperCase();
                      let theme = { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)', text: 'var(--danger)', subtext: 'rgba(239,68,68,0.8)' };
                      
                      if (sectionName.includes('BSCS')) {
                        theme = { bg: '#109EEF', border: '#109EEF', text: '#FFFFFF', subtext: 'rgba(255,255,255,0.85)' };
                      } else if (sectionName.includes('BSFT')) {
                        theme = { bg: '#16A34A', border: '#16A34A', text: '#FFFFFF', subtext: 'rgba(255,255,255,0.85)' };
                      } else if (sectionName.includes('BSOA')) {
                        theme = { bg: '#8B5CF6', border: '#8B5CF6', text: '#FFFFFF', subtext: 'rgba(255,255,255,0.85)' };
                      } else if (sectionName.includes('BAEL')) {
                        theme = { bg: '#EAB308', border: '#EAB308', text: '#030813', subtext: 'rgba(3,8,19,0.85)' };
                      }

                      return (
                        <div key={sched.id} style={{
                          position: 'absolute',
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          top: '6px',
                          bottom: '6px',
                          background: theme.bg,
                          border: `1px solid ${theme.border}`,
                          borderRadius: '6px',
                          padding: '4px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                          boxSizing: 'border-box',
                          zIndex: 5
                        }}>
                          <div className="availability-block-text" style={{ color: theme.text }}>
                            {sched.subject?.code}
                          </div>
                          {sched.section && (
                            <div className="availability-block-subtext" style={{ color: theme.subtext }}>
                              {sched.section.name}
                            </div>
                          )}
                          <div className="availability-block-time" style={{ color: theme.text }}>
                            {formatTime(startMin)} - {formatTime(endMin)}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default FacultyAvailability;
