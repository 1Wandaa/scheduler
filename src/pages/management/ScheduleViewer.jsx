import React, { useState, useEffect } from 'react';
import ScheduleTable from '../../components/ScheduleTable/ScheduleTable';
import PrintableSchedule from '../../components/PrintableSchedule/PrintableSchedule';
import { DEPARTMENTS } from '../../config/constants';
import ExportOptions from './components/ExportOptions';
import PreviewModal from './components/PreviewModal';

function ScheduleViewer({ user, schedules, rooms, professors, sections, isAdmin, onUpdateSchedule, activeSemester = '', activeSchoolYear = '', departments = [], isPublished = true }) {
    const [viewType, setViewType] = useState('department');
    const [selectedId, setSelectedId] = useState('');
    const [deptSectionId, setDeptSectionId] = useState('');
    const [selectedYearLevel, setSelectedYearLevel] = useState('');
    const [previewImage, setPreviewImage] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (viewType === 'department') {
            const allDepts = departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS;
            if (user?.department && allDepts.includes(user.department)) {
                setSelectedId(user.department);
            } else if (allDepts.length > 0) {
                setSelectedId(allDepts[0]);
            }
        }
        else if (viewType === 'room' && rooms.length > 0) setSelectedId(rooms[0].id);
        else if (viewType === 'faculty' && professors.length > 0) setSelectedId(professors[0].id);
        else setSelectedId('');

        if (viewType === 'department' && user?.yearLevel) {
            setSelectedYearLevel(user.yearLevel.toString());
        } else {
            setSelectedYearLevel('');
        }
        
        setDeptSectionId('');
    }, [viewType, rooms, professors, sections, user]);

    // Listen for custom events to change view type from mobile Speed Dial
    useEffect(() => {
        const handleViewChange = (e) => {
            if (e.detail && ['department', 'faculty', 'room', 'section'].includes(e.detail)) {
                setViewType(e.detail);
            }
        };
        window.addEventListener('change-viewer-type', handleViewChange);
        return () => window.removeEventListener('change-viewer-type', handleViewChange);
    }, []);

    // When selectedId or yearLevel changes, reset section filter and auto-select first matching section
    useEffect(() => {
        if (viewType === 'department' && selectedId) {
            let matching = sections.filter(sec => sec.name.toUpperCase().startsWith(String(selectedId).toUpperCase()));
            if (selectedYearLevel) {
                matching = matching.filter(sec => String(sec.yearLevel) === String(selectedYearLevel));
            }
            if (matching.length > 0) {
                // If user has a specific section and it's in the matching list, select it
                if (user?.section && matching.some(sec => sec.name === user.section)) {
                    const userSec = matching.find(sec => sec.name === user.section);
                    setDeptSectionId(userSec.id);
                } else {
                    setDeptSectionId(matching[0].id);
                }
            } else {
                setDeptSectionId('');
            }
        } else {
            setDeptSectionId('');
        }
    }, [viewType, selectedId, selectedYearLevel, sections, user]);

    // Compute unique year levels from sections for the selected department
    const availableYearLevels = viewType === 'department' && selectedId
        ? [...new Set(
            sections
                .filter(sec => sec.name.toUpperCase().startsWith(String(selectedId).toUpperCase()))
                .map(sec => sec.yearLevel)
                .filter(Boolean)
          )].sort((a, b) => a - b)
        : [];

    const deptSections = viewType === 'department' && selectedId
        ? sections.filter(sec => {
            const matchesDept = sec.name.toUpperCase().startsWith(String(selectedId).toUpperCase());
            if (!matchesDept) return false;
            if (selectedYearLevel) return String(sec.yearLevel) === String(selectedYearLevel);
            return true;
          })
        : [];



    const filteredSchedules = schedules.filter(s => {
        if (!selectedId) return false;

        if (viewType === 'department') {
            // Support both new `departments` array and legacy `department` string
            const subjDepts = Array.isArray(s.subject?.departments) ? s.subject.departments : (s.subject?.department ? [s.subject.department] : []);
            const sectionDept = s.section?.name?.split(/\s+/)?.[0]?.toUpperCase() || '';
            const matchesDept = subjDepts.includes(selectedId) || (s.professor?.department === selectedId) || sectionDept === selectedId;
            if (!matchesDept) return false;

            // Filter by year level if selected (match against section's yearLevel)
            if (selectedYearLevel && !deptSectionId) {
                const sectionObj = sections.find(sec => s.section && String(sec.id) === String(s.section.id));
                if (!sectionObj || String(sectionObj.yearLevel) !== String(selectedYearLevel)) return false;
            }

            if (deptSectionId) {
                return s.section != null && String(s.section.id) === String(deptSectionId);
            }
            return true;
        }
        if (viewType === 'room') return s.room != null && String(s.room.id) === String(selectedId);
        if (viewType === 'faculty') return s.professor != null && String(s.professor.id) === String(selectedId);

        return false;
    });

    let activeEntity = null;
    if (viewType === 'department') {
        if (deptSectionId) {
            const sec = sections.find(s => s.id === deptSectionId);
            activeEntity = { name: sec ? sec.name : selectedId };
        } else {
            activeEntity = { name: selectedId };
        }
    } else if (viewType === 'room') {
        activeEntity = rooms.find(r => r.id === selectedId);
    } else if (viewType === 'faculty') {
        activeEntity = professors.find(p => p.id === selectedId);
    }

    const titlePrefix = viewType === 'department' 
        ? (deptSectionId ? 'CLASS' : 'DEPARTMENT') 
        : viewType === 'room' ? 'ROOM' 
        : viewType === 'faculty' ? 'FACULTY' : '';
    const titleName = activeEntity ? activeEntity.name.toUpperCase() : 'SELECT ITEM';

    if (!isAdmin && !isPublished) {
        return (
            <div className="card" style={{ animation: 'fadeIn 0.5s', textAlign: 'center', padding: '50px 20px', minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ marginBottom: '20px', background: 'var(--bg-main)', padding: '24px', borderRadius: '50%' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                        <line x1="9" y1="16" x2="15" y2="16"></line>
                        <line x1="12" y1="13" x2="12" y2="19"></line>
                    </svg>
                </div>
                <h3 style={{ color: 'var(--text-main)', marginBottom: '10px', fontSize: '1.5rem' }}>Schedules Not Available</h3>
                <p style={{ color: 'var(--text-muted)', maxWidth: '500px', lineHeight: 1.6 }}>The schedules for {activeSemester} {activeSchoolYear} are still being finalized and have not been published yet. Please check back later.</p>
            </div>
        );
    }

    return (
        <div className="card" style={{ animation: 'fadeIn 0.5s' }}>

            {/* Header Row: Title & Print Button separated from filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '15px' }}>
                <div className="no-print">
                    <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                        Schedule Viewer
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Filter schedules by department{isAdmin ? ', faculty, or room' : ' or room'}</p>
                </div>

                <ExportOptions 
                    isGenerating={isGenerating} 
                    setIsGenerating={setIsGenerating} 
                    setPreviewImage={setPreviewImage} 
                />
            </div>

            {/* Filters Row: Dedicated block with responsive grid */}
            <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filter By</label>
                    <select
                        className="form-select"
                        value={viewType}
                        onChange={(e) => setViewType(e.target.value)}
                        style={{ width: '100%' }}
                    >
                        <option value="department">Department</option>
                        {isAdmin && <option value="faculty">Faculty</option>}
                        <option value="room">Room</option>
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target</label>
                    <select
                        className="form-select"
                        value={selectedId}
                        onChange={(e) => setSelectedId(e.target.value)}
                        style={{ width: '100%', borderColor: 'var(--accent-primary)', backgroundColor: 'var(--success-bg)' }}
                    >
                        {viewType === 'department' && (departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).sort((a, b) => a.localeCompare(b)).map(d => <option key={d} value={d}>{d}</option>)}
                        {viewType === 'room' && Object.entries(rooms.reduce((acc, r) => {
                            const b = r.building || 'Other';
                            if (!acc[b]) acc[b] = [];
                            acc[b].push(r);
                            return acc;
                        }, {}))
                        .sort(([bA], [bB]) => bA.localeCompare(bB))
                        .map(([building, bRooms]) => (
                            <optgroup key={building} label={building}>
                                {bRooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </optgroup>
                        ))}
                        {viewType === 'faculty' && [...professors].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                {viewType === 'department' && availableYearLevels.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Year</label>
                        <select
                            className="form-select"
                            value={selectedYearLevel}
                            onChange={(e) => setSelectedYearLevel(e.target.value)}
                            style={{ width: '100%', borderColor: selectedYearLevel ? 'var(--accent-primary)' : 'var(--border-color)', backgroundColor: selectedYearLevel ? '#DBEAFE' : 'white' }}
                        >
                            <option value="">All Years</option>
                            {availableYearLevels.map(yr => (
                                <option key={yr} value={yr}>{yr === 1 ? '1st' : yr === 2 ? '2nd' : yr === 3 ? '3rd' : `${yr}th`} Year</option>
                            ))}
                        </select>
                    </div>
                )}

                {viewType === 'department' && deptSections.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Section</label>
                        <select
                            className="form-select"
                            value={deptSectionId}
                            onChange={(e) => setDeptSectionId(e.target.value)}
                            style={{ width: '100%', borderColor: deptSectionId ? 'var(--accent-primary)' : 'var(--border-color)', backgroundColor: deptSectionId ? 'var(--warning-bg)' : 'white' }}
                        >
                            {[...deptSections].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            <div className="colored-schedule-wrapper">
                <ScheduleTable
                    schedules={filteredSchedules}
                    title={`${titlePrefix} SCHEDULE: ${titleName}`}
                    onUpdateSchedule={isAdmin ? onUpdateSchedule : undefined}
                />
            </div>

            <PrintableSchedule
                scheduleItems={filteredSchedules}
                sectionName={
                    viewType === 'department' && deptSectionId
                        ? (sections.find(s => s.id === deptSectionId)?.name || titleName)
                        : titleName
                }
                semesterInfo={`${activeSemester} ${activeSchoolYear}`.trim() || "2nd Sem 2025-2026"}
            />

            <PreviewModal 
                previewImage={previewImage} 
                setPreviewImage={setPreviewImage} 
                titleName={titleName} 
            />
        </div>
    );
}

export default ScheduleViewer;