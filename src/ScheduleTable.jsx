import React, { useState, useEffect } from 'react';
import ScheduleTable from './ScheduleTable';
import { DEPARTMENTS } from './index';

function ScheduleViewer({ schedules, rooms, professors, sections }) {
  const [viewType, setViewType] = useState('department');
  const [selectedId, setSelectedId] = useState('');
  const [deptSectionId, setDeptSectionId] = useState('');

  useEffect(() => {
    if (viewType === 'department' && DEPARTMENTS.length > 0) setSelectedId(DEPARTMENTS[0]);
    else if (viewType === 'room' && rooms.length > 0) setSelectedId(rooms[0].id);
    else if (viewType === 'faculty' && professors.length > 0) setSelectedId(professors[0].id);
    else if (viewType === 'section' && sections.length > 0) setSelectedId(sections[0].id);
    else setSelectedId('');

    setDeptSectionId('');
  }, [viewType, rooms, professors, sections]);

  useEffect(() => {
    setDeptSectionId('');
  }, [selectedId]);

  const deptSections = viewType === 'department' && selectedId
    ? sections.filter(sec => sec.name.toUpperCase().startsWith(String(selectedId).toUpperCase()))
    : [];

  const filteredSchedules = schedules.filter(s => {
    if (!selectedId) return false;

    if (viewType === 'department') {
      const matchesDept = (s.subject?.department === selectedId) || (s.professor?.department === selectedId);
      if (!matchesDept) return false;

      if (deptSectionId) {
        return s.section != null && String(s.section.id) === String(deptSectionId);
      }
      return true;
    }
    if (viewType === 'room') return s.room != null && String(s.room.id) === String(selectedId);
    if (viewType === 'faculty') return s.professor != null && String(s.professor.id) === String(selectedId);
    if (viewType === 'section') return s.section != null && String(s.section.id) === String(selectedId);

    return false;
  });

  let activeEntity = null;
  if (viewType === 'department') {
    if (deptSectionId) {
      const sec = sections.find(s => s.id === deptSectionId);
      activeEntity = { name: `${selectedId} — ${sec ? sec.name : ''}` };
    } else {
      activeEntity = { name: `${selectedId} (ALL SECTIONS)` };
    }
  } else if (viewType === 'room') {
    activeEntity = rooms.find(r => r.id === selectedId);
  } else if (viewType === 'faculty') {
    activeEntity = professors.find(p => p.id === selectedId);
  } else if (viewType === 'section') {
    activeEntity = sections.find(s => s.id === selectedId);
  }

  const titlePrefix = viewType === 'department' ? 'DEPARTMENT' : viewType === 'room' ? 'ROOM' : viewType === 'faculty' ? 'FACULTY' : 'SECTION';
  const titleName = activeEntity ? activeEntity.name.toUpperCase() : 'SELECT ITEM';

  // --- NEW: CSV DOWNLOAD FUNCTION ---
  const handleDownloadCSV = () => {
    if (filteredSchedules.length === 0) {
      alert("No schedules available to download for this selection.");
      return;
    }

    // Sort schedules chronologically for the CSV
    const DAYS_ORDER = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5 };
    const sortedSchedules = [...filteredSchedules].sort((a, b) => {
      if (DAYS_ORDER[a.day] !== DAYS_ORDER[b.day]) return DAYS_ORDER[a.day] - DAYS_ORDER[b.day];
      return (a.timeSlot?.id || 0) - (b.timeSlot?.id || 0);
    });

    // Create CSV structure
    const headers = ['Day', 'Time', 'Subject', 'Section', 'Professor', 'Room'];
    const rows = sortedSchedules.map(s => [
      s.day || '',
      s.timeSlot?.label || '',
      s.subject?.code || '',
      s.section?.name || 'N/A',
      s.professor?.name || '',
      s.room?.name || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${titleName.replace(/[^a-zA-Z0-9]/g, '_')}_Schedule.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s' }}>

      {/* Header Row: Title & Download Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
            Schedule Viewer
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Filter schedules by department, room, faculty, or section</p>
        </div>

        <div>
          {/* Replaced Print Button with Download Button */}
          <button className="btn" onClick={handleDownloadCSV} style={{ background: 'var(--success)', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download Schedule
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', marginBottom: '20px', padding: '12px 15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>

        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-muted)', alignSelf: 'center' }}>Filter By:</label>
          <select
            value={viewType}
            onChange={(e) => setViewType(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none', cursor: 'pointer', minWidth: '140px' }}
          >
            <option value="department">Department</option>
            <option value="section">Section</option>
            <option value="faculty">Faculty</option>
            <option value="room">Room</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-muted)', alignSelf: 'center' }}>Target:</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--accent-primary)', backgroundColor: 'var(--success-bg)', color: 'var(--accent-dark)', fontWeight: 'bold', outline: 'none', cursor: 'pointer', minWidth: '200px' }}
          >
            {viewType === 'department' && DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            {viewType === 'room' && rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            {viewType === 'faculty' && professors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            {viewType === 'section' && sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {viewType === 'department' && deptSections.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', paddingLeft: '15px', borderLeft: '2px solid var(--border-color)' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-muted)', alignSelf: 'center' }}>Section:</label>
            <select
              value={deptSectionId}
              onChange={(e) => setDeptSectionId(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--accent-primary)', backgroundColor: deptSectionId ? 'var(--warning-bg)' : 'white', color: 'var(--accent-dark)', fontWeight: deptSectionId ? 'bold' : 'normal', outline: 'none', cursor: 'pointer', minWidth: '200px' }}
            >
              <option value="">All {selectedId} Sections</option>
              {deptSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div>
        <ScheduleTable
          schedules={filteredSchedules}
          title={`${titlePrefix} SCHEDULE: ${titleName}`}
        />
      </div>
    </div>
  );
}

export default ScheduleViewer;