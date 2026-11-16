import React, { useMemo, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
    FW_ISO_TIME_BLOCKS,
    getFacultyFreeTimeActivities,
    buildFacultyWorkloadScheduleGrid,
    computeTeachingAssignments
} from '../../utils/freeTimeUtils';
import '../../styles/PrintableFacultyWorkload.css';

const formatRoomAndSection = (cls) => {
    const rawRoom = cls?.room?.name
        ? cls.room.name.replace(/^Room\s+/i, 'RM ').replace(/^ROOM\s+/i, 'RM ')
        : 'TBA';
    const secName = cls?.section?.name || '';
    return secName ? `${rawRoom} - ${secName}` : rawRoom;
};

const formatCleanSubjectCode = (cls) => {
    const raw = cls?.subject?.code || '';
    return raw
        .replace(/\s*\((?:Lecture|Laboratory|Lec|Lab)\)/gi, '')
        .replace(/^Free Elective\b/i, 'Free Elect')
        .replace(/^CS Elective\b/i, 'CS Elect')
        .trim();
};

const PrintableFacultyWorkload = ({ professor, schedules = [], semesterInfo }) => {
    const LOGO_SRC = '/capsu-logo.jpg';
    const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';
    const activeSemester = semesterInfo || '1st Semester, School Year 2026-2027';
    const profName = professor?.name || '';
    const profRank = professor?.rank || '';
    const profDesignation = professor?.designation || '';

    const [freeTimeVersion, setFreeTimeVersion] = useState(0);
    useEffect(() => {
        const handleUpdate = () => setFreeTimeVersion(v => v + 1);
        window.addEventListener('smartsched_free_time_updated', handleUpdate);
        return () => window.removeEventListener('smartsched_free_time_updated', handleUpdate);
    }, []);

    const freeTimeActivities = useMemo(() => {
        void freeTimeVersion;
        return getFacultyFreeTimeActivities(professor, profName);
    }, [professor, profName, freeTimeVersion]);

    const {
        uniqueAssignments,
        totalUnits,
        totalHoursDisplay,
        totalStudents
    } = useMemo(() => computeTeachingAssignments(schedules), [schedules]);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const scheduleGrid = useMemo(() => {
        return buildFacultyWorkloadScheduleGrid(schedules, freeTimeActivities, 'standard');
    }, [schedules, freeTimeActivities]);

    // Maximize vertical space on the portrait page based on assignment count
    const schedRowHeight = useMemo(() => {
        const count = uniqueAssignments.length;
        if (count <= 4) return '54px';
        if (count <= 6) return '48px';
        if (count <= 8) return '42px';
        if (count <= 10) return '36px';
        return '30px';
    }, [uniqueAssignments.length]);

    const densityClass = useMemo(() => {
        const count = uniqueAssignments.length;
        if (count <= 8) return 'fw-density-normal';
        if (count <= 11) return 'fw-density-compact';
        if (count <= 14) return 'fw-density-dense';
        return 'fw-density-ultra';
    }, [uniqueAssignments.length]);

    const containerRef = React.useRef(null);
    const [scale, setScale] = React.useState(1);

    React.useLayoutEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.style.transform = 'none';
        
        // 10.5in printable height on Portrait Letter at 96 DPI is ~1008px
        const MAX_PAGE_HEIGHT = 1015;
        const actualHeight = containerRef.current.scrollHeight;
        
        if (actualHeight > MAX_PAGE_HEIGHT) {
            const newScale = Math.min(1, Number(((MAX_PAGE_HEIGHT / actualHeight) * 0.99).toFixed(3)));
            setScale(newScale);
        } else {
            setScale(1);
        }
    }, [uniqueAssignments, scheduleGrid, densityClass, schedRowHeight]);

    return ReactDOM.createPortal(
        <div className={`faculty-workload-iso-document ${densityClass}`}>
            <style>{`
                @media print {
                    @page {
                        size: letter portrait !important;
                        margin: 0.25in 0.35in !important;
                    }
                }
            `}</style>
            <div 
                ref={containerRef} 
                className="fw-document-inner"
                style={{ 
                    '--fw-row-height': schedRowHeight,
                    zoom: scale < 1 ? scale : undefined,
                    width: '100%' 
                }}
            >
            
            <table className="fw-header-table">
                <tbody>
                    <tr>
                        <td className="fw-header-logo" rowSpan="4">
                            <img src={LOGO_SRC} alt="Logo" onError={(e) => { if (e.currentTarget.src !== FALLBACK_LOGO) e.currentTarget.src = FALLBACK_LOGO; }} />
                        </td>
                        <td className="fw-header-middle" rowSpan="2">
                            <div className="fw-header-doc-type">Document Type: <span style={{marginLeft: '20px', fontSize: '10pt', fontWeight: 'bold'}}>FORM</span></div>
                            <div className="fw-header-iso">ISO 9001:2015</div>
                        </td>
                        <td className="fw-header-label">Document Code</td>
                        <td className="fw-header-value" style={{fontWeight: 'bold'}}>INS F22</td>
                    </tr>
                    <tr>
                        <td className="fw-header-label">Revision No.</td>
                        <td className="fw-header-value" style={{fontWeight: 'bold'}}>00</td>
                    </tr>
                    <tr>
                        <td className="fw-header-middle" rowSpan="2">
                            <div className="fw-header-doc-type">Document Type:</div>
                            <div className="fw-header-title">FACULTY WORKLOAD</div>
                        </td>
                        <td className="fw-header-label">Effective Date</td>
                        <td className="fw-header-value" style={{fontWeight: 'bold'}}>August 5, 2024</td>
                    </tr>
                    <tr>
                        <td className="fw-header-label">Page</td>
                        <td className="fw-header-value" style={{fontWeight: 'bold'}}>1 of 1</td>
                    </tr>
                </tbody>
            </table>

            <div className="fw-semester-info">
                <u>{activeSemester}</u>
            </div>

            <div className="fw-faculty-name">
                Name of Faculty: <span className="fw-faculty-name-value">{profName}</span>
            </div>

            <table className="fw-profile-table">
                <thead>
                    <tr>
                        <th colSpan="4" className="fw-profile-title">FACULTY PROFILE</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td rowSpan="3" className="fw-profile-level">BACCALAUREATE</td>
                        <td className="fw-profile-field">Degree</td>
                        <td className="fw-profile-val">{professor?.baccalaureateDegree || ''}</td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">School</td>
                        <td className="fw-profile-val">{professor?.baccalaureateSchool || ''}</td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">Major</td>
                        <td className="fw-profile-val">{professor?.baccalaureateMajor || ''}</td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    
                    <tr>
                        <td rowSpan="3" className="fw-profile-level">MASTER'S DEGREE</td>
                        <td className="fw-profile-field">Degree</td>
                        <td className="fw-profile-val">{professor?.mastersDegree || ''}</td>
                        <td className="fw-profile-extra">Rank/Position: {profRank}</td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">School</td>
                        <td className="fw-profile-val">{professor?.mastersSchool || ''}</td>
                        <td className="fw-profile-extra">Designation: {profDesignation}</td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">Major</td>
                        <td className="fw-profile-val">{professor?.mastersMajor || ''}</td>
                        <td className="fw-profile-extra"></td>
                    </tr>

                    <tr>
                        <td rowSpan="3" className="fw-profile-level">DOCTORATE</td>
                        <td className="fw-profile-field">Degree</td>
                        <td className="fw-profile-val">{professor?.doctorateDegree || ''}</td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">School</td>
                        <td className="fw-profile-val">{professor?.doctorateSchool || ''}</td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">Major</td>
                        <td className="fw-profile-val">{professor?.doctorateMajor || ''}</td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                </tbody>
            </table>

            <div className="fw-section-title">TEACHING ASSIGNMENT:</div>
            
            <table className="fw-teaching-table">
                <thead>
                    <tr>
                        <th rowSpan="2" style={{ width: '14%' }}>Course No.</th>
                        <th rowSpan="2" style={{ width: '38%' }}>Course Title</th>
                        <th rowSpan="2" style={{ width: '8%' }}>Units</th>
                        <th colSpan="1" style={{ width: '15%' }}>No. of Hours</th>
                        <th rowSpan="2" style={{ width: '15%' }}>Course and<br/>Year Level</th>
                        <th rowSpan="2" style={{ width: '10%' }}>No. of<br/>Students</th>
                    </tr>
                    <tr>
                        <th style={{borderTop: '1px solid #000'}}>Lec/Lab</th>
                    </tr>
                </thead>
                <tbody>
                    {uniqueAssignments.map(a => (
                        <tr key={a.id}>
                            <td className="fw-course-no">{a.subjectCode}</td>
                            <td className="fw-course-title">{a.subjectName}</td>
                            <td className="fw-bold">{a.unit}</td>
                            <td>{a.hoursPerWeek}</td>
                            <td>{a.sectionName}</td>
                            <td className="fw-bold">{a.studentsCount}</td>
                        </tr>
                    ))}
                    {uniqueAssignments.length === 0 && (
                        <tr><td colSpan="6" style={{ height: '32px', fontStyle: 'italic', color: '#666' }}>No teaching assignments recorded</td></tr>
                    )}
                    <tr className="fw-total-row">
                        <td colSpan="2" className="fw-total-label">TOTAL</td>
                        <td className="fw-bold">{totalUnits > 0 ? totalUnits : ''}</td>
                        <td className="fw-bold">{totalHoursDisplay}</td>
                        <td></td>
                        <td className="fw-bold">{totalStudents > 0 ? totalStudents : ''}</td>
                    </tr>
                    <tr className="fw-other-assign-header">
                        <td colSpan="6">Other Assignments:</td>
                    </tr>
                    <tr className="fw-blank-row">
                        <td>&nbsp;</td>
                        <td style={{ textAlign: 'left', paddingLeft: '6px' }}>{professor?.otherAssignments || ''}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                    <tr className="fw-blank-row">
                        <td>&nbsp;</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>

            <div className="fw-section-title">Class Schedule:</div>
            
            <table className="fw-schedule-table">
                <thead>
                    <tr>
                        <th style={{ width: '15%' }}>TIME</th>
                        {days.map(day => (
                            <th key={day} style={{ width: '17%' }}>{day.toUpperCase()}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {FW_ISO_TIME_BLOCKS.map((block, rowIdx) => {
                        if (block.isLunch) {
                            return (
                                <tr key={block.id} className="fw-lunch-row">
                                    <td className="fw-schedule-time-col">{block.label}</td>
                                    {days.map(day => (
                                        <td key={day} className="fw-schedule-lunch-cell"></td>
                                    ))}
                                </tr>
                            );
                        }

                        return (
                            <tr key={block.id} className="fw-regular-sched-row">
                                <td className="fw-schedule-time-col">
                                    {block.label}
                                </td>
                                {days.map(day => {
                                    const cell = scheduleGrid[day]?.[rowIdx];
                                    if (!cell || cell.skip) return null;

                                    const items = cell.items || [];
                                    const isSplit = items.length > 1;
                                    const tdStyle = {};
                                    if (cell.mergeBottomWithNext) tdStyle.borderBottom = 'none';
                                    if (cell.mergeTopWithPrev) tdStyle.borderTop = 'none';
                                    if (isSplit) tdStyle.padding = 0;

                                    return (
                                        <td
                                            key={day}
                                            rowSpan={cell.rowSpan || 1}
                                            className={`fw-schedule-cell ${isSplit ? 'fw-schedule-cell-split' : ''}`}
                                            style={tdStyle}
                                        >
                                            {items.length === 1 && items[0].type === 'class' && (
                                                <div className="fw-sched-class-item">
                                                    <div className="fw-sched-subj-code">{formatCleanSubjectCode(items[0].schedule)}</div>
                                                    <div className="fw-sched-room-sec">{formatRoomAndSection(items[0].schedule)}</div>
                                                </div>
                                            )}

                                            {items.length === 1 && items[0].type === 'activity' && (
                                                <div className="fw-sched-activity-text">
                                                    {items[0].text}
                                                </div>
                                            )}

                                            {isSplit && (
                                                <div className="fw-sched-split-container">
                                                    {items.map((item, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="fw-sched-subcell"
                                                            style={{
                                                                borderTop: idx > 0 ? '1px solid #000' : 'none'
                                                            }}
                                                        >
                                                            {item.type === 'class' ? (
                                                                <div className="fw-sched-class-item">
                                                                    <div className="fw-sched-subj-code">{formatCleanSubjectCode(item.schedule)}</div>
                                                                    <div className="fw-sched-room-sec">{formatRoomAndSection(item.schedule)}</div>
                                                                </div>
                                                            ) : (
                                                                <div className="fw-sched-activity-text">
                                                                    {cell.mergeTopWithPrev && idx === 0 ? '\u00A0' : item.text}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="fw-signatures-container">
                <div className="fw-sig-left">
                    <div className="fw-sig-label">Prepared by:</div>
                    <div className="fw-sig-space"></div>
                    <div className="fw-sig-name"><u>JELLY L. PAREDES, EdD</u></div>
                    <div className="fw-sig-title">Program Chairperson</div>
                    
                    <div className="fw-sig-approved-block">
                        <div className="fw-sig-label">Approved:</div>
                        <div className="fw-sig-space"></div>
                        <div className="fw-sig-name"><u>RAMY LLOYD L. LOTILLA, EdD</u></div>
                        <div className="fw-sig-title">Satellite College Director</div>
                    </div>
                </div>
                
                <div className="fw-sig-right">
                    <div className="fw-sig-label">Conforme:</div>
                    <div className="fw-sig-space"></div>
                    <div className="fw-sig-name"><u>{profName}</u></div>
                    <div className="fw-sig-title">Faculty</div>
                </div>
            </div>
            </div>
        </div>,
        document.body
    );
};

export default PrintableFacultyWorkload;
