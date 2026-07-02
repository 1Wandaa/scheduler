import React, { useState, useMemo } from 'react';
import { DAYS, TIME_SLOTS } from '../../config/constants';
import { getOccupiedSlots } from '../../utils/scheduleUtils';

function RoomAvailability({ rooms, schedules, activeSemester, activeSchoolYear, onBack }) {
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [selectedBuilding, setSelectedBuilding] = useState('All');

  const buildings = useMemo(() => {
    const bldgs = new Set(rooms.map(r => r.building || 'Unassigned'));
    return ['All', ...Array.from(bldgs).sort()];
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    let result = rooms;
    if (selectedBuilding !== 'All') {
      result = result.filter(r => (r.building || 'Unassigned') === selectedBuilding);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [rooms, selectedBuilding]);

  // Precompute occupation map for O(1) lookups during render
  const occupationMap = useMemo(() => {
    const map = {};
    rooms.forEach(r => map[r.id] = {});

    schedules.forEach(s => {
      if (s.day !== selectedDay || !s.room?.id) return;
      const slots = getOccupiedSlots(s);
      slots.forEach(slot => {
        if (slot.day === selectedDay && map[s.room.id]) {
          map[s.room.id][slot.timeSlotId] = s;
        }
      });
    });
    return map;
  }, [schedules, selectedDay, rooms]);

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {onBack && (
            <button className="back-btn" onClick={onBack} style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back
            </button>
          )}
          <div>
            <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              Room Availability
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>
              Real-time room matrix for {activeSemester} {activeSchoolYear}
            </p>
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
        
        <div style={{ minWidth: '200px' }}>
          <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Filter Building</label>
          <select 
            className="form-select" 
            value={selectedBuilding} 
            onChange={(e) => setSelectedBuilding(e.target.value)}
          >
            {buildings.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }} className="custom-scrollbar">
        <table className="data-table" style={{ width: '100%', minWidth: '1400px', borderCollapse: 'collapse', margin: 0 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-card)', borderRight: '2px solid var(--border-color)', minWidth: '140px', boxShadow: '2px 0 5px rgba(0,0,0,0.05)' }}>
                Room
              </th>
              {TIME_SLOTS.map(t => (
                <th key={t.id} style={{ minWidth: '70px', fontSize: '0.7rem', textAlign: 'center', padding: '8px 4px', background: 'var(--bg-main)' }}>
                  {t.label.split(' - ')[0]}<br/>-<br/>{t.label.split(' - ')[1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRooms.length === 0 ? (
              <tr>
                <td colSpan={TIME_SLOTS.length + 1} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  No rooms found.
                </td>
              </tr>
            ) : (
              filteredRooms.map(room => (
                <tr key={room.id}>
                  <td style={{ 
                    position: 'sticky', 
                    left: 0, 
                    zIndex: 5, 
                    background: 'var(--bg-card)', 
                    borderRight: '2px solid var(--border-color)', 
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    boxShadow: '2px 0 5px rgba(0,0,0,0.05)'
                  }}>
                    {room.name}
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'normal', marginTop: '2px' }}>
                      {room.building || 'Unassigned'}
                    </div>
                  </td>
                  
                  {(() => {
                    const cells = [];
                    for (let idx = 0; idx < TIME_SLOTS.length; idx++) {
                      const t = TIME_SLOTS[idx];
                      const sched = occupationMap[room.id]?.[t.id];

                      if (sched) {
                        let colSpan = 1;
                        for (let i = idx + 1; i < TIME_SLOTS.length; i++) {
                          const nextSlot = TIME_SLOTS[i];
                          if (occupationMap[room.id]?.[nextSlot.id]?.id === sched.id) {
                            colSpan++;
                          } else {
                            break;
                          }
                        }

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

                        cells.push(
                          <td key={t.id} colSpan={colSpan} style={{ 
                            background: theme.bg, 
                            border: '3px solid #ffffff', 
                            padding: '4px', 
                            textAlign: 'center',
                            verticalAlign: 'middle'
                          }}>
                            <div style={{ 
                              fontSize: '0.7rem', 
                              fontWeight: '700', 
                              color: theme.text,
                              lineHeight: 1.2
                            }}>
                              {sched.subject?.code}
                            </div>
                            {sched.section && (
                              <div style={{ fontSize: '0.6rem', color: theme.subtext, marginTop: '2px' }}>
                                {sched.section.name}
                              </div>
                            )}
                          </td>
                        );

                        idx += (colSpan - 1);
                      } else {
                        // Do not show the green AVAILABLE indicator for the 7:00 - 7:30 slot
                        if (idx === 0) {
                          cells.push(
                            <td key={t.id} style={{ 
                              background: 'transparent', 
                              borderTop: '1px solid var(--border-color)', 
                              borderBottom: '1px solid var(--border-color)', 
                              padding: '4px'
                            }}>
                            </td>
                          );
                          continue;
                        }

                        let emptySpan = 1;
                        for (let i = idx + 1; i < TIME_SLOTS.length; i++) {
                          if (emptySpan >= 3) break; // Limit to 1.5 hours max
                          
                          if (!occupationMap[room.id]?.[TIME_SLOTS[i].id]) {
                            emptySpan++;
                          } else {
                            break;
                          }
                        }
                        
                        const isAvailableBlock = emptySpan >= 2;
                        
                        cells.push(
                          <td key={t.id} colSpan={emptySpan} style={{ 
                            background: isAvailableBlock ? 'rgba(34, 197, 94, 0.05)' : 'transparent', 
                            borderTop: '1px solid var(--border-color)', 
                            borderBottom: '1px solid var(--border-color)', 
                            padding: '4px',
                            textAlign: 'center',
                            verticalAlign: 'middle'
                          }}>
                            {isAvailableBlock && (
                              <div style={{
                                color: 'var(--success)',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                letterSpacing: '1px'
                              }}>
                                AVAILABLE
                              </div>
                            )}
                          </td>
                        );
                        
                        idx += (emptySpan - 1);
                      }
                    }
                    return cells;
                  })()}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RoomAvailability;
