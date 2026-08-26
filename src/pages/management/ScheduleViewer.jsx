import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ScheduleTable from '../../components/ScheduleTable/ScheduleTable';
import PrintableSchedule from '../../components/PrintableSchedule/PrintableSchedule';
import { DEPARTMENTS } from '../../config/constants';
import ExportOptions from './components/ExportOptions';
import PreviewModal from './components/PreviewModal';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import CustomSelect from '../../components/CustomSelect/CustomSelect';

function ScheduleViewer({ user, schedules, rooms, professors, sections, isAdmin, onUpdateSchedule, onRemoveSchedule, onRemoveSchedulesBatch, activeSemester = '', activeSchoolYear = '', departments = [], isPublished = true }) {
    const { confirm } = useGlobalDialog();
    const location = useLocation();

    const [viewType, setViewType] = useState(location.state?.viewTarget?.viewType || 'department');
    const [selectedId, setSelectedId] = useState(location.state?.viewTarget?.selectedId || user?.department || '');
    const [deptSectionId, setDeptSectionId] = useState(location.state?.viewTarget?.deptSectionId || '');
    const [selectedYearLevel, setSelectedYearLevel] = useState(user?.yearLevel ? String(user.yearLevel) : '');
    const [previewImage, setPreviewImage] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isDeleteMode, setIsDeleteMode] = useState(false);

    const hasAppliedInitialTargetRef = React.useRef(!!location.state?.viewTarget);
    const initialUserAppliedRef = React.useRef(false);
    const prevSelectedIdRef = React.useRef(selectedId);
    const prevViewTypeRef = React.useRef(viewType);

    useEffect(() => {
        if (hasAppliedInitialTargetRef.current) {
            hasAppliedInitialTargetRef.current = false;
            return;
        }

        const allDepts = departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS;

        if (viewType === 'department') {
            // Find user's section object if available
            const userSectionObj = (user?.section && sections.length > 0)
                ? sections.find(s => s.id === user.section || (s.name && s.name.trim().toUpperCase() === user.section.trim().toUpperCase()))
                : null;

            // Determine target department
            let targetDept = selectedId;
            if (!targetDept || !initialUserAppliedRef.current) {
                if (user?.department && (allDepts.includes(user.department) || allDepts.length === 0)) {
                    targetDept = user.department;
                } else if (userSectionObj) {
                    const secDept = userSectionObj.name.split(/\s+/)[0]?.toUpperCase();
                    if (secDept && (allDepts.includes(secDept) || allDepts.length === 0)) {
                        targetDept = secDept;
                    }
                }
                if (!targetDept && allDepts.length > 0) {
                    targetDept = allDepts[0];
                }
                if (targetDept) {
                    setSelectedId(targetDept);
                }
            }

            // Determine target year level
            if (!initialUserAppliedRef.current) {
                if (user?.yearLevel) {
                    setSelectedYearLevel(String(user.yearLevel));
                } else if (userSectionObj?.yearLevel) {
                    setSelectedYearLevel(String(userSectionObj.yearLevel));
                }
            }

            // Determine target section ID
            if (userSectionObj && (!deptSectionId || !initialUserAppliedRef.current)) {
                setDeptSectionId(userSectionObj.id);
            }

            if (user && (user.department || user.section) && sections.length > 0) {
                initialUserAppliedRef.current = true;
            }
        } else if (viewType === 'room' && rooms.length > 0) {
            if (!selectedId || prevViewTypeRef.current !== 'room') setSelectedId(rooms[0].id);
        } else if (viewType === 'faculty' && professors.length > 0) {
            if (!selectedId || prevViewTypeRef.current !== 'faculty') setSelectedId(professors[0].id);
        }

        prevViewTypeRef.current = viewType;
    }, [viewType, rooms, professors, sections, user, departments]);

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

    // Reset stale year level when the user manually changes department
    useEffect(() => {
        if (viewType === 'department') {
            if (prevSelectedIdRef.current && prevSelectedIdRef.current !== selectedId) {
                setSelectedYearLevel('');
            }
            prevSelectedIdRef.current = selectedId;
        }
    }, [selectedId, viewType]);

    // Update section filter based on department and year level, prioritizing the user's registered section
    useEffect(() => {
        if (viewType === 'department' && selectedId) {
            let matching = sections.filter(sec => sec.name.toUpperCase().startsWith(String(selectedId).toUpperCase()));
            if (selectedYearLevel) {
                matching = matching.filter(sec => String(sec.yearLevel) === String(selectedYearLevel));
            }
            if (matching.length > 0) {
                // If user has a specific section and it's in the matching list, select it
                const userSecMatch = user?.section
                    ? matching.find(sec => sec.id === user.section || (sec.name && sec.name.trim().toUpperCase() === user.section.trim().toUpperCase()))
                    : null;

                if (userSecMatch) {
                    setDeptSectionId(userSecMatch.id);
                } else if (deptSectionId && matching.some(sec => sec.id === deptSectionId)) {
                    // Keep current section if it remains valid
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

    const detectedScheduleMode = React.useMemo(() => {
        const hasFriday = schedules.some(s => s.day === 'Friday');
        if (schedules.length > 0 && !hasFriday) return 'fourDay';
        return 'standard';
    }, [schedules]);

    const titlePrefix = viewType === 'department'
        ? (deptSectionId ? 'CLASS' : 'DEPARTMENT')
        : viewType === 'room' ? 'ROOM'
            : viewType === 'faculty' ? 'FACULTY' : '';
    const titleName = activeEntity ? activeEntity.name.toUpperCase() : 'SELECT ITEM';

    const handleDeleteSchedules = async () => {
        if (!isAdmin) return;
        if (filteredSchedules.length === 0) {
            alert('No schedules found to delete for the current view.');
            return;
        }

        const confirmMsg = `Are you sure you want to delete ${filteredSchedules.length} schedule(s) for ${titleName}? This action cannot be undone.`;
        const isConfirmed = await confirm({
            title: 'Delete Schedules',
            text: confirmMsg,
            icon: 'warning',
            isDestructive: true,
            confirmButtonText: 'Delete All'
        });

        if (isConfirmed) {
            const ids = filteredSchedules.map(s => s.id);
            if (onRemoveSchedulesBatch) {
                const res = await onRemoveSchedulesBatch(ids);
                if (res && !res.ok) {
                    alert(`Failed to delete schedules: ${res.errors?.join(', ') || 'Unknown error'}`);
                }
            }
        }
    };

    if (!isAdmin && !isPublished) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: '50px 20px', minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
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
        <div className="card" style={{ backgroundImage: 'none', backgroundColor: '#ffffff' }}>

            {/* Header & Filters */}
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '20px' }}>
                {/* Header Row: Title & Print Button separated from filters */}
                <div className="mgmt-header no-print">
                    <div className="mgmt-header-left">
                        <div className="mgmt-header-info">
                            <h3 className="card-title">
                                <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                                Schedule Viewer
                            </h3>
                            <p>Filter schedules by department{isAdmin ? ', faculty, or room' : ' or room'}</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {isAdmin && (
                            <button
                                className="btn btn-sm"
                                onClick={handleDeleteSchedules}
                                style={{
                                    backgroundColor: 'var(--danger-bg, #fee2e2)',
                                    color: 'var(--danger-text, #ef4444)',
                                    border: '1px solid currentColor',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                                title="Delete all schedules in current view"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                Delete All
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                className={`btn ${isDeleteMode ? 'btn-danger' : 'btn-outline'}`}
                                onClick={() => setIsDeleteMode(!isDeleteMode)}
                                style={{
                                    padding: '8px 14px',
                                    fontSize: '0.85rem',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    backgroundColor: isDeleteMode ? '#fee2e2' : 'white',
                                    color: isDeleteMode ? '#dc2626' : 'var(--text-main)',
                                    border: `1px solid ${isDeleteMode ? '#fca5a5' : 'var(--border-color)'}`
                                }}
                                title="Toggle edit mode to delete individual schedules"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                {isDeleteMode ? 'Done Editing' : 'Edit Schedules'}
                            </button>
                        )}
                        <ExportOptions
                            isGenerating={isGenerating}
                            setIsGenerating={setIsGenerating}
                            setPreviewImage={setPreviewImage}
                        />
                    </div>
                </div>

                {/* Filters Row: Dedicated block with responsive grid */}
                <div className="mgmt-toolbar no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>

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
                        <CustomSelect
                            name="targetId"
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                            placeholder={`Select ${viewType}...`}
                            style={{ width: '100%' }}
                            options={(() => {
                                if (viewType === 'department') {
                                    return (departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)
                                        .sort((a, b) => a.localeCompare(b))
                                        .map(d => ({ value: d, label: d }));
                                } else if (viewType === 'room') {
                                    return Object.entries(rooms.reduce((acc, r) => {
                                        const b = r.building || 'Other';
                                        if (!acc[b]) acc[b] = [];
                                        acc[b].push(r);
                                        return acc;
                                    }, {}))
                                        .sort(([bA], [bB]) => bA.localeCompare(bB))
                                        .map(([building, bRooms]) => ({
                                            label: building,
                                            options: bRooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).map(r => ({ value: r.id, label: r.name }))
                                        }));
                                } else if (viewType === 'faculty') {
                                    return [...professors].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(p => ({ value: p.id, label: p.name }));
                                }
                                return [];
                            })()}
                        />
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
            </div>

            <div className="colored-schedule-wrapper">
                <ScheduleTable
                    schedules={filteredSchedules}
                    title={`${titlePrefix} SCHEDULE: ${titleName}`}
                    onUpdateSchedule={isAdmin ? onUpdateSchedule : undefined}
                    onRemove={isAdmin ? onRemoveSchedule : undefined}
                    departments={departments}
                    scheduleMode={detectedScheduleMode}
                    isDeleteMode={isDeleteMode}
                    programName={
                        viewType === 'department' && deptSectionId
                            ? (sections.find(s => s.id === deptSectionId)?.program || '')
                            : viewType === 'section' && selectedId
                                ? (sections.find(s => s.id === selectedId)?.program || '')
                                : ''
                    }
                    semesterInfo={`${activeSemester} ${activeSchoolYear}`.trim() || "First Semester, School Year 2026 - 2027"}
                />
            </div>

            <PrintableSchedule
                scheduleItems={filteredSchedules}
                scheduleMode={detectedScheduleMode}
                department={viewType === 'department' ? selectedId : ''}
                sectionName={
                    viewType === 'department' && deptSectionId
                        ? (sections.find(s => s.id === deptSectionId)?.name || titleName)
                        : titleName
                }
                programName={
                    viewType === 'department' && deptSectionId
                        ? (sections.find(s => s.id === deptSectionId)?.program || '')
                        : viewType === 'section' && selectedId
                            ? (sections.find(s => s.id === selectedId)?.program || '')
                            : ''
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