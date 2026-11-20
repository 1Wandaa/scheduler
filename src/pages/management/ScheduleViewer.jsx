import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ScheduleTable from '../../components/ScheduleTable/ScheduleTable';
import PrintableSchedule from '../../components/PrintableSchedule/PrintableSchedule';
import PrintableRoomUtilization from '../../components/PrintableRoomUtilization/PrintableRoomUtilization';
import { DEPARTMENTS } from '../../config/constants';
import ExportOptions from './components/ExportOptions';
import PreviewModal from './components/PreviewModal';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import CustomSelect from '../../components/CustomSelect/CustomSelect';
import { getFacultyFreeTimeActivities, saveFacultyFreeTimeActivities, getFreeTimeTermKey } from '../../utils/freeTimeUtils';

function ScheduleViewer({ user, schedules, rooms, professors, sections, isAdmin, isFaculty = false, onUpdateSchedule, onRemoveSchedule, onRemoveSchedulesBatch, activeSemester = '', activeSchoolYear = '', departments = [], isPublished = true, onBack }) {
    const { confirm } = useGlobalDialog();
    const location = useLocation();

    const [viewType, setViewType] = useState(location.state?.viewTarget?.viewType || 'department');
    const [selectedId, setSelectedId] = useState(location.state?.viewTarget?.selectedId || user?.department || '');
    const [facultyDepartment, setFacultyDepartment] = useState(location.state?.viewTarget?.facultyDepartment || '');
    const [deptSectionId, setDeptSectionId] = useState(location.state?.viewTarget?.deptSectionId || '');
    const [selectedYearLevel, setSelectedYearLevel] = useState(
        location.state?.viewTarget
            ? (location.state.viewTarget.selectedYearLevel ? String(location.state.viewTarget.selectedYearLevel) : '')
            : (user?.yearLevel ? String(user.yearLevel) : '')
    );
    const [previewImage, setPreviewImage] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isDeleteMode, setIsDeleteMode] = useState(false);
    const [isFreeTimeMode, setIsFreeTimeMode] = useState(Boolean(location.state?.viewTarget?.openFreeTime));
    const [freeTimeState, setFreeTimeState] = useState({ key: '', data: {} });

    const hasAppliedInitialTargetRef = React.useRef(!!location.state?.viewTarget);
    const initialUserAppliedRef = React.useRef(!!location.state?.viewTarget);
    const prevSelectedIdRef = React.useRef(selectedId);
    const prevViewTypeRef = React.useRef(viewType);

    useEffect(() => {
        const vt = location.state?.viewTarget;
        if (!vt) return;
        hasAppliedInitialTargetRef.current = true;
        initialUserAppliedRef.current = true;
        const timer = setTimeout(() => {
            if (vt.viewType) setViewType(vt.viewType);
            if (vt.selectedId !== undefined) {
                prevSelectedIdRef.current = vt.selectedId;
                setSelectedId(vt.selectedId);
            }
            setSelectedYearLevel(vt.selectedYearLevel ? String(vt.selectedYearLevel) : '');
            if (vt.deptSectionId !== undefined) {
                setDeptSectionId(vt.deptSectionId);
            }
            if (vt.facultyDepartment !== undefined) {
                setFacultyDepartment(vt.facultyDepartment);
            } else if (vt.viewType === 'faculty' || vt.selectedId !== undefined) {
                setFacultyDepartment('');
            }
            if (vt.openFreeTime !== undefined) {
                setIsFreeTimeMode(Boolean(vt.openFreeTime));
            } else if (vt.viewType && vt.viewType !== 'faculty') {
                setIsFreeTimeMode(false);
            }
        }, 0);
        return () => clearTimeout(timer);
    }, [location.state?.viewTarget]);

    useEffect(() => {
        const timer = setTimeout(() => {
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
                setSelectedId(prev => {
                    let targetDept = prev;
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
                    }
                    return targetDept || prev;
                });

                // Determine target year level
                if (!initialUserAppliedRef.current) {
                    if (user?.yearLevel) {
                        setSelectedYearLevel(String(user.yearLevel));
                    } else if (userSectionObj?.yearLevel) {
                        setSelectedYearLevel(String(userSectionObj.yearLevel));
                    }
                }

                // Determine target section ID
                if (userSectionObj) {
                    setDeptSectionId(prevSecId => (!prevSecId || !initialUserAppliedRef.current) ? userSectionObj.id : prevSecId);
                }

                if (user && (user.department || user.section) && sections.length > 0) {
                    initialUserAppliedRef.current = true;
                }
            } else if (viewType === 'room' && rooms.length > 0) {
                setSelectedId(prev => (!prev || prevViewTypeRef.current !== 'room') ? rooms[0].id : prev);
            } else if (viewType === 'faculty' && professors.length > 0) {
                setSelectedId(prev => {
                    if (!prev || prevViewTypeRef.current !== 'faculty') {
                        const targetDept = facultyDepartment.trim().toUpperCase();
                        const pool = (targetDept
                            ? professors.filter(p => (p.department || '').trim().toUpperCase() === targetDept)
                            : professors
                        ).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                        if (pool.length === 0) return '';
                        const myProf = isFaculty && user ? pool.find(p => p.name === user.name || String(p.id) === String(user.id)) : null;
                        return myProf ? myProf.id : pool[0].id;
                    }
                    return prev;
                });
            }

            prevViewTypeRef.current = viewType;
        }, 0);

        return () => clearTimeout(timer);
    }, [viewType, rooms, professors, sections, user, departments, isFaculty, facultyDepartment]);

    // Listen for custom events to change view type from mobile Speed Dial
    useEffect(() => {
        const handleViewChange = (e) => {
            if (e.detail && ['department', 'faculty', 'room', 'section'].includes(e.detail)) {
                setViewType(e.detail);
                if (e.detail !== 'faculty') {
                    setIsFreeTimeMode(false);
                    setFacultyDepartment('');
                }
            }
        };
        window.addEventListener('change-viewer-type', handleViewChange);
        return () => window.removeEventListener('change-viewer-type', handleViewChange);
    }, []);

    // Reset stale year level when the user manually changes department
    useEffect(() => {
        if (viewType === 'department') {
            if (prevSelectedIdRef.current && prevSelectedIdRef.current !== selectedId) {
                const timer = setTimeout(() => setSelectedYearLevel(''), 0);
                return () => clearTimeout(timer);
            }
            prevSelectedIdRef.current = selectedId;
        }
    }, [selectedId, viewType]);

    // Update section filter based on department and year level, prioritizing an already-selected valid section or the user's registered section
    useEffect(() => {
        if (sections.length === 0) return;
        if (viewType === 'department' && selectedId) {
            const targetDept = String(selectedId).trim().toUpperCase();
            let matching = sections.filter(sec => {
                const secDept = (sec.program || sec.department || '').trim().toUpperCase();
                const secName = (sec.name || '').trim().toUpperCase();
                return secDept === targetDept || secName.startsWith(targetDept);
            });
            if (selectedYearLevel) {
                matching = matching.filter(sec => String(sec.yearLevel) === String(selectedYearLevel));
            }
            matching.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));

            if (matching.length > 0) {
                if (deptSectionId && matching.some(sec => String(sec.id) === String(deptSectionId))) {
                    return;
                }

                // If user has a specific section and it's in the matching list, select it
                const userSecMatch = user?.section
                    ? matching.find(sec => String(sec.id) === String(user.section) || (sec.name && sec.name.trim().toUpperCase() === user.section.trim().toUpperCase()))
                    : null;

                const nextId = userSecMatch ? userSecMatch.id : matching[0].id;

                if (nextId !== deptSectionId) {
                    const timer = setTimeout(() => setDeptSectionId(nextId), 0);
                    return () => clearTimeout(timer);
                }
            } else if (deptSectionId) {
                const timer = setTimeout(() => setDeptSectionId(''), 0);
                return () => clearTimeout(timer);
            }
        } else if (deptSectionId) {
            const timer = setTimeout(() => setDeptSectionId(''), 0);
            return () => clearTimeout(timer);
        }
    }, [viewType, selectedId, selectedYearLevel, sections, user, deptSectionId]);

    // Compute unique year levels from sections for the selected department
    const availableYearLevels = React.useMemo(() => {
        if (viewType !== 'department' || !selectedId) return [];
        const targetDept = String(selectedId).trim().toUpperCase();
        return [...new Set(
            sections
                .filter(sec => {
                    const secDept = (sec.program || sec.department || '').trim().toUpperCase();
                    const secName = (sec.name || '').trim().toUpperCase();
                    return secDept === targetDept || secName.startsWith(targetDept);
                })
                .map(sec => sec.yearLevel)
                .filter(Boolean)
        )].sort((a, b) => a - b);
    }, [viewType, selectedId, sections]);

    const deptSections = React.useMemo(() => {
        if (viewType !== 'department' || !selectedId) return [];
        const targetDept = String(selectedId).trim().toUpperCase();
        return sections
            .filter(sec => {
                const secDept = (sec.program || sec.department || '').trim().toUpperCase();
                const secName = (sec.name || '').trim().toUpperCase();
                const matchesDept = secDept === targetDept || secName.startsWith(targetDept);
                if (!matchesDept) return false;
                if (selectedYearLevel) return String(sec.yearLevel) === String(selectedYearLevel);
                return true;
            })
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
    }, [viewType, selectedId, sections, selectedYearLevel]);

    const filteredSchedules = React.useMemo(() => {
        if (!selectedId) return [];

        return schedules.filter(s => {
            if (viewType === 'department') {
                const targetDept = String(selectedId).trim().toUpperCase();
                const sectionObj = sections.find(sec => s.section && String(sec.id) === String(s.section.id)) || s.section;
                const secDept = (sectionObj?.program || sectionObj?.department || '').trim().toUpperCase();
                const secName = (sectionObj?.name || '').trim().toUpperCase();
                const subjCode = (s.subject?.code || '').trim().toUpperCase();

                // A class on the department schedule belongs to this department's sections
                // Check if the target department string is anywhere in the program, department, section name, or subject code
                const isDeptSection = secDept === targetDept ||
                    secName.includes(targetDept) ||
                    secDept.includes(targetDept) ||
                    subjCode.includes(targetDept);

                if (!isDeptSection) return false;

                if (selectedYearLevel && !deptSectionId) {
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
    }, [schedules, selectedId, viewType, selectedYearLevel, deptSectionId, sections]);

    React.useEffect(() => {
        console.log('[ScheduleViewer] Raw schedules:', schedules.length, 'Filtered:', filteredSchedules.length, 'Target:', selectedId, 'ViewType:', viewType);
    }, [schedules, filteredSchedules, selectedId, viewType]);

    const activeEntity = React.useMemo(() => {
        if (viewType === 'department') {
            if (deptSectionId) {
                const sec = sections.find(s => String(s.id) === String(deptSectionId));
                return { name: sec ? sec.name : selectedId };
            }
            return { name: selectedId };
        } else if (viewType === 'room') {
            return rooms.find(r => String(r.id) === String(selectedId));
        } else if (viewType === 'faculty') {
            return professors.find(p => String(p.id) === String(selectedId));
        }
        return null;
    }, [viewType, deptSectionId, selectedId, sections, rooms, professors]);

    const activeTerm = React.useMemo(
        () => ({ semester: activeSemester, schoolYear: activeSchoolYear }),
        [activeSemester, activeSchoolYear]
    );
    const activeTermKey = React.useMemo(
        () => getFreeTimeTermKey(activeSemester, activeSchoolYear),
        [activeSemester, activeSchoolYear]
    );

    const activeFacultyId = viewType === 'faculty' ? String(activeEntity?.id || selectedId || '') : '';
    const freeTimeContextKey = viewType === 'faculty' && activeFacultyId
        ? `${activeFacultyId}::${activeTermKey}`
        : '';

    const freeTimeActivities = React.useMemo(() => {
        if (!freeTimeContextKey) return {};
        if (freeTimeState.key === freeTimeContextKey) {
            return freeTimeState.data;
        }
        return getFacultyFreeTimeActivities(
            activeEntity || activeFacultyId,
            activeEntity?.name || '',
            activeTerm
        );
    }, [freeTimeContextKey, freeTimeState, activeEntity, activeFacultyId, activeTerm]);

    const freeTimeRef = React.useRef({ key: '', data: {} });
    useEffect(() => {
        freeTimeRef.current = { key: freeTimeContextKey, data: freeTimeActivities };
    }, [freeTimeContextKey, freeTimeActivities]);

    const effectiveFreeTimeMode = viewType === 'faculty' && isFreeTimeMode;

    const handleUpdateFreeTimeSegment = React.useCallback((day, slotIds, text) => {
        const targetProfId = activeEntity?.id || selectedId;
        if (viewType !== 'faculty' || !targetProfId || !freeTimeContextKey) return;
        const current = freeTimeRef.current.key === freeTimeContextKey
            ? freeTimeRef.current.data
            : freeTimeActivities;
        const next = { ...current };
        (slotIds || []).forEach(sid => {
            const key = `${day}-${sid}`;
            if (typeof text === 'string' && text.trim() !== '') {
                next[key] = text;
            } else {
                delete next[key];
            }
        });
        freeTimeRef.current = { key: freeTimeContextKey, data: next };
        setFreeTimeState({ key: freeTimeContextKey, data: next });
        saveFacultyFreeTimeActivities(targetProfId, next, activeEntity?.name || '', activeTerm);
    }, [viewType, activeEntity, selectedId, freeTimeContextKey, freeTimeActivities, activeTerm]);

    const handleClearAllFreeTime = React.useCallback(async () => {
        const targetProfId = activeEntity?.id || selectedId;
        const targetProfName = activeEntity?.name || '';
        const targetContextKey = freeTimeContextKey;
        const targetTerm = activeTerm;
        const termLabel = [activeSemester, activeSchoolYear].filter(Boolean).join(' ');
        if (viewType !== 'faculty' || !targetProfId || !targetContextKey) return;
        const isConfirmed = await confirm({
            title: 'Clear Free Time Activities',
            text: `Are you sure you want to clear all free-time activity text for ${targetProfName || 'this faculty'}${termLabel ? ` (${termLabel})` : ''}?`,
            icon: 'warning',
            isDestructive: true,
            confirmButtonText: 'Clear All'
        });
        if (isConfirmed) {
            freeTimeRef.current = { key: targetContextKey, data: {} };
            setFreeTimeState({ key: targetContextKey, data: {} });
            saveFacultyFreeTimeActivities(targetProfId, {}, targetProfName, targetTerm);
        }
    }, [viewType, activeEntity, selectedId, freeTimeContextKey, activeTerm, activeSemester, activeSchoolYear, confirm]);

    // Compute unique departments for filtering faculty
    const availableFacultyDepartments = React.useMemo(() => {
        if (viewType !== 'faculty') return [];
        const deptMap = new Map();
        const baseDepts = departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS;
        baseDepts.forEach(d => {
            const raw = String(d || '').trim();
            if (!raw) return;
            const key = raw.toUpperCase();
            if (!deptMap.has(key)) deptMap.set(key, raw);
        });
        professors.forEach(p => {
            const raw = String(p.department || '').trim();
            if (!raw) return;
            const key = raw.toUpperCase();
            if (!deptMap.has(key)) deptMap.set(key, raw);
        });
        return Array.from(deptMap.values()).sort((a, b) => a.localeCompare(b));
    }, [viewType, departments, professors]);

    const filteredFacultyProfessors = React.useMemo(() => {
        if (viewType !== 'faculty') return [];
        const targetDept = facultyDepartment.trim().toUpperCase();
        const list = targetDept
            ? professors.filter(p => (p.department || '').trim().toUpperCase() === targetDept)
            : professors;
        return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [viewType, professors, facultyDepartment]);

    const handleFacultyDepartmentChange = React.useCallback((nextDept) => {
        setFacultyDepartment(nextDept);
        if (viewType !== 'faculty') return;
        const normDept = nextDept.trim().toUpperCase();
        const matching = (normDept
            ? professors.filter(p => (p.department || '').trim().toUpperCase() === normDept)
            : professors
        ).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        if (matching.length === 0) {
            setSelectedId('');
            return;
        }
        if (selectedId && matching.some(p => String(p.id) === String(selectedId))) {
            return;
        }
        const myProf = isFaculty && user
            ? matching.find(p => p.name === user.name || String(p.id) === String(user.id))
            : null;
        setSelectedId(myProf ? myProf.id : matching[0].id);
    }, [viewType, professors, selectedId, isFaculty, user]);

    // Keep selected faculty valid if the filtered faculty list updates (e.g. faculty edited/removed)
    useEffect(() => {
        if (viewType !== 'faculty' || !facultyDepartment || !selectedId || professors.length === 0) return;
        if (!filteredFacultyProfessors.some(p => String(p.id) === String(selectedId))) {
            const nextId = filteredFacultyProfessors.length > 0 ? filteredFacultyProfessors[0].id : '';
            const timer = setTimeout(() => setSelectedId(nextId), 0);
            return () => clearTimeout(timer);
        }
    }, [viewType, facultyDepartment, selectedId, professors.length, filteredFacultyProfessors]);

    const targetOptions = React.useMemo(() => {
        if (viewType === 'department') {
            return (departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)
                .sort((a, b) => a.localeCompare(b))
                .map(d => ({ value: d, label: d }));
        } else if (viewType === 'room') {
            const buildingMap = {};
            rooms.forEach(r => {
                const b = r.building || 'Other';
                if (!buildingMap[b]) buildingMap[b] = [];
                buildingMap[b].push(r);
            });
            return Object.entries(buildingMap)
                .sort(([bA], [bB]) => bA.localeCompare(bB))
                .map(([building, bRooms]) => ({
                    label: building,
                    options: bRooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).map(r => ({ value: r.id, label: r.name }))
                }));
        } else if (viewType === 'faculty') {
            if (facultyDepartment) {
                return filteredFacultyProfessors.map(p => ({ value: p.id, label: p.name }));
            }
            const deptMap = {};
            filteredFacultyProfessors.forEach(p => {
                const d = (p.department || '').trim() || 'Other';
                if (!deptMap[d]) deptMap[d] = [];
                deptMap[d].push(p);
            });
            return Object.entries(deptMap)
                .sort(([dA], [dB]) => {
                    if (dA === 'Other') return 1;
                    if (dB === 'Other') return -1;
                    return dA.localeCompare(dB);
                })
                .map(([dept, deptProfs]) => ({
                    label: dept,
                    options: deptProfs.map(p => ({ value: p.id, label: p.name }))
                }));
        }
        return [];
    }, [viewType, departments, rooms, facultyDepartment, filteredFacultyProfessors]);

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
                {onBack && (
                    <button className="back-btn" onClick={onBack} style={{ marginTop: '20px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        Back
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="card" style={{ backgroundColor: '#ffffff' }}>

            {/* Header & Filters */}
            <div className="sticky-mgmt-header no-print">
                {/* Header Row: Title & Print Button separated from filters */}
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
                                <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                                Schedule Viewer
                            </h3>
                            <p>Filter schedules by department{isAdmin ? ', faculty, or room' : ' or room'}</p>
                        </div>
                    </div>
                    <div className="schedule-viewer-header-actions">
                        <ExportOptions
                            user={user}
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
                            onChange={(e) => {
                                const nextView = e.target.value;
                                setViewType(nextView);
                                if (nextView !== 'faculty') {
                                    setIsFreeTimeMode(false);
                                    setFacultyDepartment('');
                                }
                            }}
                            style={{ width: '100%' }}
                        >
                            <option value="department">Department</option>
                            {(isAdmin || isFaculty) && <option value="faculty">Faculty</option>}
                            <option value="room">Room</option>
                        </select>
                    </div>

                    {viewType === 'faculty' && availableFacultyDepartments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</label>
                            <select
                                className="form-select"
                                value={facultyDepartment}
                                onChange={(e) => handleFacultyDepartmentChange(e.target.value)}
                                style={{ width: '100%', borderColor: facultyDepartment ? 'var(--accent-primary)' : 'var(--border-color)', backgroundColor: facultyDepartment ? '#DBEAFE' : 'white' }}
                            >
                                <option value="">All Departments</option>
                                {availableFacultyDepartments.map(dept => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {viewType === 'faculty' ? 'Faculty' : 'Target'}
                        </label>
                        <CustomSelect
                            name="targetId"
                            value={selectedId}
                            onChange={(e) => setSelectedId(e.target.value)}
                            placeholder={viewType === 'faculty' && facultyDepartment ? `Select ${facultyDepartment} faculty...` : `Select ${viewType}...`}
                            style={{ width: '100%' }}
                            options={targetOptions}
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

                    {viewType === 'faculty' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label className="form-label" style={{ marginBottom: 0, fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Free Time Activity</label>
                            <button
                                type="button"
                                className="form-select"
                                onClick={() => setIsFreeTimeMode(prev => !prev)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    borderColor: effectiveFreeTimeMode ? '#2563eb' : 'var(--border-color)',
                                    backgroundColor: effectiveFreeTimeMode ? '#2563eb' : '#f8fafc',
                                    color: effectiveFreeTimeMode ? '#ffffff' : 'var(--text-main)',
                                    backgroundImage: 'none',
                                    paddingRight: '12px'
                                }}
                                title="Trigger text input for free time activities of this faculty"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                {effectiveFreeTimeMode ? 'Done Free Time Text' : 'Edit Free Time Text'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="colored-schedule-wrapper" style={{ maxWidth: '1200px', margin: '0 auto', overscrollBehaviorY: 'auto' }}>
                <ScheduleTable
                    schedules={filteredSchedules}
                    activeSchedules={schedules}
                    title={`${titlePrefix} SCHEDULE: ${titleName}`}
                    targetDepartment={viewType === 'department' ? selectedId : (viewType === 'faculty' ? (activeEntity?.department || facultyDepartment) : '')}
                    onUpdateSchedule={isAdmin ? onUpdateSchedule : undefined}
                    onRemove={isAdmin ? onRemoveSchedule : undefined}
                    departments={departments}
                    scheduleMode={detectedScheduleMode}
                    isDeleteMode={isDeleteMode}
                    programName={
                        viewType === 'department' && deptSectionId
                            ? (sections.find(s => s.id === deptSectionId)?.program || selectedId)
                            : viewType === 'department'
                                ? selectedId
                                : viewType === 'section' && selectedId
                                    ? (sections.find(s => s.id === selectedId)?.program || '')
                                    : ''
                    }
                    semesterInfo={`${activeSemester} ${activeSchoolYear}`.trim() || "First Semester, School Year 2026 - 2027"}
                    user={user}
                    isAdmin={isAdmin}
                    onDeleteAll={handleDeleteSchedules}
                    onToggleDeleteMode={() => setIsDeleteMode(!isDeleteMode)}
                    viewType={viewType}
                    freeTimeActivities={freeTimeActivities}
                    isFreeTimeMode={effectiveFreeTimeMode}
                    onToggleFreeTimeMode={() => setIsFreeTimeMode(prev => !prev)}
                    onUpdateFreeTimeSegment={handleUpdateFreeTimeSegment}
                    onClearAllFreeTime={handleClearAllFreeTime}
                />
            </div>

            {viewType === 'room' ? (
                <PrintableRoomUtilization
                    scheduleItems={filteredSchedules}
                    roomName={titleName}
                    semesterInfo={`${activeSemester} ${activeSchoolYear}`.trim() || "First Semester, School Year 2026-2027"}
                    scheduleMode={detectedScheduleMode}
                    departments={departments}
                    targetDepartment={viewType === 'department' ? selectedId : ''}
                />
            ) : (
                <PrintableSchedule
                    scheduleItems={filteredSchedules}
                    scheduleMode={detectedScheduleMode}
                    department={viewType === 'department' ? selectedId : (activeEntity?.department || '')}
                    viewType={viewType}
                    facultyName={viewType === 'faculty' ? titleName : ''}
                    sectionName={
                        viewType === 'department' && deptSectionId
                            ? (sections.find(s => s.id === deptSectionId)?.name || titleName)
                            : titleName
                    }
                    programName={
                        viewType === 'department' && deptSectionId
                            ? (sections.find(s => s.id === deptSectionId)?.program || selectedId)
                            : viewType === 'department'
                                ? selectedId
                                : viewType === 'section' && selectedId
                                    ? (sections.find(s => s.id === selectedId)?.program || '')
                                    : (activeEntity?.department || '')
                    }
                    semesterInfo={`${activeSemester} ${activeSchoolYear}`.trim() || "2nd Sem 2025-2026"}
                />
            )}

            <PreviewModal
                previewImage={previewImage}
                setPreviewImage={setPreviewImage}
                titleName={titleName}
            />
        </div>
    );
}

export default ScheduleViewer;