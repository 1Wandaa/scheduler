import React, { useState } from 'react';
import ScheduleTable from './ScheduleTable';
import PrintableSchedule from './PrintableSchedule';
import { DEPARTMENTS } from './index';

function ScheduleViewer({ schedules, rooms, professors, sections }) {
    // Set 'department' as the default view for a better user experience
    const [viewType, setViewType] = useState('department');
    const [selectedId, setSelectedId] = useState('');

    // Ensure selectedId is valid when switching view types
    React.useEffect(() => {
        if (viewType === 'department' && DEPARTMENTS.length > 0) setSelectedId(DEPARTMENTS[0]);
        else if (viewType === 'room' && rooms.length > 0) setSelectedId(rooms[0].id);
        else if (viewType === 'faculty' && professors.length > 0) setSelectedId(professors[0].id);
        else if (viewType === 'section' && sections.length > 0) setSelectedId(sections[0].id);
        else setSelectedId('');
    }, [viewType, rooms, professors, sections]);

    // Filter schedules based on the selected view type
    const filteredSchedules = schedules.filter(s => {
        if (!selectedId) return false;

        if (viewType === 'department') {
            // Match if either the subject or the professor belongs to the selected department
            return (s.subject?.department === selectedId) || (s.professor?.department === selectedId);
        }
        if (viewType === 'room') return s.room != null && String(s.room.id) === String(selectedId);
        if (viewType === 'faculty') return s.professor != null && String(s.professor.id) === String(selectedId);
        if (viewType === 'section') return s.section != null && String(s.section.id) === String(selectedId);

        return false;
    });

    // Determine the active entity for the title
    let activeEntity = null;
    if (viewType === 'department') activeEntity = { name: selectedId };
    if (viewType === 'room') activeEntity = rooms.find(r => r.id === selectedId);
    if (viewType === 'faculty') activeEntity = professors.find(p => p.id === selectedId);
    if (viewType === 'section') activeEntity = sections.find(s => s.id === selectedId);

    const titlePrefix = viewType === 'department' ? 'DEPARTMENT' : viewType === 'room' ? 'ROOM' : viewType === 'faculty' ? 'FACULTY' : 'SECTION';
    const titleName = activeEntity ? activeEntity.name.toUpperCase() : 'SELECT ITEM';

    return (
        <div className="card" style={{ animation: 'fadeIn 0.5s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid var(--border-color)' }}>
                <div className="no-print">
                    <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                        Schedule Viewer
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Filter schedules by department, room, faculty, or section</p>
                </div>

                <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-muted)', alignSelf: 'center' }}>Filter By:</label>
                        <select
                            value={viewType}
                            onChange={(e) => setViewType(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none', cursor: 'pointer' }}
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
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--accent-primary)', backgroundColor: 'var(--success-bg)', color: 'var(--accent-dark)', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}
                        >
                            {viewType === 'department' && DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                            {viewType === 'room' && rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            {viewType === 'faculty' && professors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            {viewType === 'section' && sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    <button className="btn" onClick={() => window.print()} style={{ background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Print ISO Schedule
                    </button>
                </div>
            </div>

            {/* This standard view hides when printing */}
            <div className="no-print">
                <ScheduleTable
                    schedules={filteredSchedules}
                    title={`${titlePrefix} SCHEDULE: ${titleName}`}
                />
            </div>

            {/* This ISO view is hidden on screen, but shows when printing */}
            <PrintableSchedule
                scheduleItems={filteredSchedules}
                sectionName={titleName}
                semesterInfo="2nd Sem 2025-2026"
            />
        </div>
    );
}

export default ScheduleViewer;