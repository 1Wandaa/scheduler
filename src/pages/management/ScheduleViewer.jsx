import React, { useState, useEffect } from 'react';
import ScheduleTable from '../../components/ScheduleTable/ScheduleTable';
import PrintableSchedule from '../../components/PrintableSchedule/PrintableSchedule';
import { DEPARTMENTS } from '../../config/constants';

function ScheduleViewer({ user, schedules, rooms, professors, sections, isAdmin, onUpdateSchedule, activeSemester = '', activeSchoolYear = '', isPublished = true }) {
    const [viewType, setViewType] = useState('department');
    const [selectedId, setSelectedId] = useState('');
    const [deptSectionId, setDeptSectionId] = useState('');
    const [selectedYearLevel, setSelectedYearLevel] = useState('');
    const [previewImage, setPreviewImage] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);

    // Close export dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (isExportOpen && e.target.closest && !e.target.closest('.export-dropdown-container')) {
                setIsExportOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside); // Added for better mobile support
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isExportOpen]);

    useEffect(() => {
        if (viewType === 'department') {
            if (user?.department && DEPARTMENTS.includes(user.department)) {
                setSelectedId(user.department);
            } else if (DEPARTMENTS.length > 0) {
                setSelectedId(DEPARTMENTS[0]);
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

                <div className="no-print export-dropdown-container" style={{ position: 'relative', marginLeft: 'auto' }}>
                    <button className="btn btn-sm" onClick={() => setIsExportOpen(!isExportOpen)} style={{ background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        {isGenerating ? 'Generating...' : 'Export Options'}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    {isExportOpen && (
                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: '200px', overflow: 'hidden' }}>
                            <div style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border-color)' }}>ISO FORMAT</div>
                            <button onClick={async () => {
                                setIsExportOpen(false);
                                setIsGenerating(true);
                                const printContent = document.querySelector('.printable-iso-document');
                                if (!printContent) {
                                    setIsGenerating(false);
                                    return;
                                }
                                const tempContainer = document.createElement('div');
                                tempContainer.style.position = 'absolute';
                                tempContainer.style.top = '-10000px';
                                tempContainer.style.left = '-10000px';
                                tempContainer.style.width = '1100px'; 
                                tempContainer.style.backgroundColor = 'white';
                                tempContainer.innerHTML = `
                                    <style>
                                        .iso-header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9pt; font-family: "Times New Roman", Times, serif; color: #000; }
                                        .iso-header-table td, .iso-header-table th { border: 1px solid #000; padding: 4px; text-align: left; }
                                        .iso-header-table .bold { font-weight: bold; }
                                        .iso-header-table .center { text-align: center; }
                                        .meta-info { display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; font-family: "Times New Roman", Times, serif; color: #000; }
                                        .meta-value { font-weight: normal; text-decoration: underline; }
                                        .iso-schedule-table { width: 100%; border-collapse: collapse; font-size: 9pt; font-family: "Times New Roman", Times, serif; color: #000; table-layout: fixed; }
                                        .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 0; text-align: center; vertical-align: middle; height: 52px; overflow: hidden; box-sizing: border-box; }
                                        .iso-schedule-table th { background-color: #f0f0f0 !important; padding: 6px 4px; height: 32px; font-size: 9pt; }
                                        .iso-schedule-table .time-cell { white-space: nowrap; font-weight: bold; font-size: 8pt; padding: 2px 4px; }
                                        .iso-schedule-table .schedule-cell { padding: 0; height: 52px; overflow: hidden; }
                                        .cell-content { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px 3px; height: 100%; overflow: hidden; box-sizing: border-box; }
                                        .cell-subject { font-weight: bold; font-size: 9pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
                                        .cell-professor { font-size: 8pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                        .cell-room { font-size: 8pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                        .lunch-break { background-color: #e0e0e0 !important; font-weight: bold; letter-spacing: 5px; padding: 4px; height: 30px; overflow: hidden; font-size: 9pt; }
                                        .lunch-break-time { background-color: #e0e0e0 !important; height: 30px; font-size: 8pt; }
                                    </style>
                                    <div style="padding: 40px;">
                                        ${printContent.innerHTML}
                                    </div>
                                `;
                                document.body.appendChild(tempContainer);
                                
                                try {
                                    const html2canvas = (await import('html2canvas')).default;
                                    const canvas = await html2canvas(tempContainer, { 
                                        scale: 2, 
                                        useCORS: true,
                                        width: 1100,
                                        windowWidth: 1100
                                    });
                                    setPreviewImage(canvas.toDataURL('image/png'));
                                } catch (error) {
                                    console.error('Failed to save image:', error);
                                    alert('Failed to generate preview. Please try again.');
                                } finally {
                                    document.body.removeChild(tempContainer);
                                    setIsGenerating(false);
                                }
                            }} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                Save Image
                            </button>
                            <button onClick={() => {
                                setIsExportOpen(false);
                                const printContent = document.querySelector('.printable-iso-document');
                                if (!printContent) return;
                                const iframe = document.createElement('iframe');
                                iframe.style.position = 'fixed';
                                iframe.style.top = '-10000px';
                                iframe.style.left = '-10000px';
                                iframe.style.width = '0';
                                iframe.style.height = '0';
                                document.body.appendChild(iframe);
                                const doc = iframe.contentDocument || iframe.contentWindow.document;
                                doc.open();
                                doc.write(`
                                    <html>
                                    <head>
                                        <style>
                                            @page { size: letter landscape; margin: 0; }
                                            body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; padding: 0.5in; }
                                            .iso-header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9pt; }
                                            .iso-header-table td, .iso-header-table th { border: 1px solid #000; padding: 4px; text-align: left; }
                                            .iso-header-table .bold { font-weight: bold; }
                                            .iso-header-table .center { text-align: center; }
                                            .meta-info { display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; }
                                            .meta-value { font-weight: normal; text-decoration: underline; }
                                            .iso-schedule-table { width: 100%; border-collapse: collapse; font-size: 9pt; table-layout: fixed; }
                                            .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 0; text-align: center; vertical-align: middle; height: 52px; overflow: hidden; box-sizing: border-box; }
                                            .iso-schedule-table th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 6px 4px; height: 32px; font-size: 9pt; }
                                            .iso-schedule-table .time-cell { white-space: nowrap; font-weight: bold; font-size: 8pt; padding: 2px 4px; }
                                            .iso-schedule-table .schedule-cell { padding: 0; height: 52px; overflow: hidden; }
                                            .cell-content { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px 3px; height: 100%; overflow: hidden; box-sizing: border-box; }
                                            .cell-subject { font-weight: bold; font-size: 9pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
                                            .cell-professor { font-size: 8pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                            .cell-room { font-size: 8pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                            .lunch-break { background-color: #e0e0e0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; letter-spacing: 5px; padding: 4px; height: 30px; overflow: hidden; font-size: 9pt; }
                                            .lunch-break-time { background-color: #e0e0e0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; height: 30px; font-size: 8pt; }
                                        </style>
                                    </head>
                                    <body>${printContent.innerHTML}</body>
                                    </html>
                                `);
                                doc.close();
                                iframe.contentWindow.focus();
                                setTimeout(() => {
                                    iframe.contentWindow.print();
                                    setTimeout(() => document.body.removeChild(iframe), 1000);
                                }, 250);
                            }} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                Print Document
                            </button>
                            <div style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border-color)' }}>ORDINARY GRID</div>
                            <button onClick={() => {
                                setIsExportOpen(false);
                                window.dispatchEvent(new Event('export-ordinary-image'));
                            }} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                Save Image
                            </button>
                            <button onClick={() => {
                                setIsExportOpen(false);
                                window.dispatchEvent(new Event('export-ordinary-print'));
                            }} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                Print Document
                            </button>
                        </div>
                    )}
                </div>
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
                        {viewType === 'department' && [...DEPARTMENTS].sort((a, b) => a.localeCompare(b)).map(d => <option key={d} value={d}>{d}</option>)}
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

            {/* Preview Modal */}
            {previewImage && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '900px', width: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0 }}>Schedule Preview</h3>
                            <button onClick={() => setPreviewImage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '20px', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'center' }}>
                            <img src={previewImage} alt="Schedule Preview" style={{ maxWidth: '100%', height: 'auto' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn" style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)' }} onClick={() => setPreviewImage(null)}>
                                Cancel
                            </button>
                            <button className="btn" onClick={() => {
                                const link = document.createElement('a');
                                link.download = `${titleName}-Schedule.png`;
                                link.href = previewImage;
                                link.click();
                                setPreviewImage(null);
                            }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                Download Image
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ScheduleViewer;