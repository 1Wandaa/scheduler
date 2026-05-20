import React, { useState, useEffect } from 'react';
import ScheduleTable from './ScheduleTable';
import PrintableSchedule from './PrintableSchedule';
import { DEPARTMENTS } from './index';

function ScheduleViewer({ schedules, rooms, professors, sections, isAdmin }) {
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

    // When selectedId changes, reset section filter and auto-select first matching section
    useEffect(() => {
        if (viewType === 'department' && selectedId) {
            const matching = sections.filter(sec => sec.name.toUpperCase().startsWith(String(selectedId).toUpperCase()));
            if (matching.length > 0) {
                setDeptSectionId(matching[0].id);
            } else {
                setDeptSectionId('');
            }
        } else {
            setDeptSectionId('');
        }
    }, [viewType, selectedId, sections]);

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
            activeEntity = { name: selectedId };
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

    return (
        <div className="card" style={{ animation: 'fadeIn 0.5s' }}>

            {/* Header Row: Title & Print Button separated from filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '15px' }}>
                <div className="no-print">
                    <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                        Schedule Viewer
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Filter schedules by department, section{isAdmin ? ', faculty, or room' : ', or room'}</p>
                </div>

                <div className="no-print">
                    <button className="btn" onClick={() => window.print()} style={{ background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Print ISO Schedule
                    </button>
                </div>
            </div>

            {/* Filters Row: Dedicated block with minWidth to stop element shifting */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', marginBottom: '20px', padding: '12px 15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-muted)', alignSelf: 'center' }}>Filter By:</label>
                    <select
                        value={viewType}
                        onChange={(e) => setViewType(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none', cursor: 'pointer', minWidth: '140px' }}
                    >
                        <option value="department">Department</option>
                        <option value="section">Section</option>
                        {isAdmin && <option value="faculty">Faculty</option>}
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
                            {deptSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            <div className="no-print">
                <ScheduleTable
                    schedules={filteredSchedules}
                    title={`${titlePrefix} SCHEDULE: ${titleName}`}
                />
            </div>

            <PrintableSchedule
                scheduleItems={filteredSchedules}
                sectionName={titleName}
                semesterInfo="2nd Sem 2025-2026"
            />
        </div>
    );
}

export default ScheduleViewer;