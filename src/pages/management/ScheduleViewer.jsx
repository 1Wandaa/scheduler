import React, { useState, useEffect } from 'react';
import ScheduleTable from '../../components/ScheduleTable/ScheduleTable';
import PrintableSchedule from '../../components/PrintableSchedule/PrintableSchedule';
import { DEPARTMENTS } from '../../config/constants';

function ScheduleViewer({ schedules, rooms, professors, sections, isAdmin, onUpdateSchedule }) {
    const [viewType, setViewType] = useState('department');
    const [selectedId, setSelectedId] = useState('');
    const [deptSectionId, setDeptSectionId] = useState('');
    const [selectedYearLevel, setSelectedYearLevel] = useState('');
    const [previewImage, setPreviewImage] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (viewType === 'department' && DEPARTMENTS.length > 0) setSelectedId(DEPARTMENTS[0]);
        else if (viewType === 'room' && rooms.length > 0) setSelectedId(rooms[0].id);
        else if (viewType === 'faculty' && professors.length > 0) setSelectedId(professors[0].id);
        else setSelectedId('');

        setDeptSectionId('');
        setSelectedYearLevel('');
    }, [viewType, rooms, professors, sections]);

    // When selectedId or yearLevel changes, reset section filter and auto-select first matching section
    useEffect(() => {
        if (viewType === 'department' && selectedId) {
            let matching = sections.filter(sec => sec.name.toUpperCase().startsWith(String(selectedId).toUpperCase()));
            if (selectedYearLevel) {
                matching = matching.filter(sec => String(sec.yearLevel) === String(selectedYearLevel));
            }
            if (matching.length > 0) {
                setDeptSectionId(matching[0].id);
            } else {
                setDeptSectionId('');
            }
        } else {
            setDeptSectionId('');
        }
    }, [viewType, selectedId, selectedYearLevel, sections]);

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

                <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', marginRight: '4px' }}>ISO Format:</span>
                    <button className="btn btn-sm" onClick={async () => {
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
                        // INJECTED CSS FOR EXACT ISO LAYOUT ON EXPORT
                        tempContainer.innerHTML = `
                            <style>
                                .iso-header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9pt; font-family: "Times New Roman", Times, serif; color: #000; }
                                .iso-header-table td, .iso-header-table th { border: 1px solid #000; padding: 4px; text-align: left; }
                                .iso-header-table .bold { font-weight: bold; }
                                .iso-header-table .center { text-align: center; }
                                .meta-info { display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; font-family: "Times New Roman", Times, serif; color: #000; }
                                .meta-value { font-weight: normal; text-decoration: underline; }
                                .iso-schedule-table { width: 100%; border-collapse: collapse; font-size: 9pt; font-family: "Times New Roman", Times, serif; color: #000; }
                                .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 4px; text-align: center; vertical-align: middle; }
                                .iso-schedule-table th { background-color: #f0f0f0 !important; }
                                .lunch-break { background-color: #e0e0e0 !important; font-weight: bold; letter-spacing: 5px; padding: 4px; }
                            </style>
                            <div style="padding: 40px;">
                                ${printContent.innerHTML}
                            </div>
                        `;
                        document.body.appendChild(tempContainer);
                        
                        try {
                            const html2canvas = (await import('html2canvas')).default;
                            const canvas = await html2canvas(tempContainer, { scale: 2, useCORS: true });
                            setPreviewImage(canvas.toDataURL('image/png'));
                        } catch (error) {
                            console.error('Failed to save image:', error);
                            alert('Failed to generate preview. Please try again.');
                        } finally {
                            document.body.removeChild(tempContainer);
                            setIsGenerating(false);
                        }
                    }} style={{ background: 'transparent', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '5px' }} disabled={isGenerating}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                        {isGenerating ? 'Generating...' : 'Save Image'}
                    </button>

                    <button className="btn btn-sm" onClick={() => {
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
                        // INJECTED CSS FOR EXACT ISO LAYOUT ON PRINT PDF
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
                                    .iso-schedule-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
                                    .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 4px; text-align: center; vertical-align: middle; }
                                    .iso-schedule-table th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                                    .lunch-break { background-color: #e0e0e0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; letter-spacing: 5px; padding: 4px; }
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
                    }} style={{ background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Print
                    </button>
                </div>
            </div>

            {/* Filters Row: Dedicated block with responsive grid */}
            <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>

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
                        {viewType === 'department' && DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
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
                        {viewType === 'faculty' && professors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                            {deptSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                semesterInfo="2nd Sem 2025-2026"
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