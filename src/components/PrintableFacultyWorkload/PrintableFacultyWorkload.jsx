import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import { getMeetingTimeLabel, parseTimeToMinutes } from '../../utils/scheduleUtils';
import '../../styles/PrintableFacultyWorkload.css';

const PrintableFacultyWorkload = ({ professor, schedules = [], semesterInfo }) => {
    const LOGO_SRC = '/capsu-logo.jpg';
    const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';
    const activeSemester = semesterInfo || '1st Semester, School Year 2026-2027';
    const profName = professor?.name || '';
    const profRank = professor?.rank || '';

    const uniqueAssignments = useMemo(() => {
        const assignmentsMap = new Map();
        schedules.forEach(s => {
            if (!s.subject || !s.section) return;
            const key = `${s.subject.id}-${s.section.id}`;
            if (!assignmentsMap.has(key)) {
                assignmentsMap.set(key, {
                    id: key,
                    subjectCode: s.subject.code || 'N/A',
                    subjectName: s.subject.name || 'N/A',
                    unit: s.subject.units ?? 3,
                    hoursPerWeek: s.subject.hoursPerMeeting ?? 3,
                    sectionName: s.section.name || 'N/A',
                    studentsCount: s.section.studentsCount || ''
                });
            }
        });
        return Array.from(assignmentsMap.values());
    }, [schedules]);

    const totalUnits = uniqueAssignments.reduce((sum, a) => sum + Number(a.unit), 0);
    const totalHours = uniqueAssignments.reduce((sum, a) => sum + Number(a.hoursPerWeek), 0);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const uniqueTimeBlocks = useMemo(() => {
        const rawUniqueTimes = new Set();
        schedules.forEach(schedule => {
            if (!schedule.day || !schedule.timeSlot) return;
            const label = getMeetingTimeLabel(schedule.timeSlot, schedule.subject?.hoursPerMeeting, 'standard');
            if (label) rawUniqueTimes.add(label);
        });
        return Array.from(rawUniqueTimes).map(label => {
            const parts = label.split('-');
            const startStr = parts[0]?.trim() || '';
            const startMinutes = parseTimeToMinutes(startStr) || 0;
            return { label, startMinutes };
        }).sort((a, b) => a.startMinutes - b.startMinutes);
    }, [schedules]);

    const rowsCount = uniqueAssignments.length + uniqueTimeBlocks.length;
    const densityClass = useMemo(() => {
        if (rowsCount <= 10) return 'fw-density-normal';
        if (rowsCount <= 15) return 'fw-density-compact';
        if (rowsCount <= 20) return 'fw-density-dense';
        return 'fw-density-ultra';
    }, [rowsCount]);

    const containerRef = React.useRef(null);
    const [scale, setScale] = React.useState(1);

    React.useLayoutEffect(() => {
        if (!containerRef.current) return;
        // Reset scale first to get accurate unscaled height
        containerRef.current.style.transform = 'none';
        
        const MAX_PAGE_HEIGHT = 1000; // Roughly 10.5 inches at 96 DPI
        const actualHeight = containerRef.current.scrollHeight;
        
        if (actualHeight > MAX_PAGE_HEIGHT) {
            // Give a tiny bit of buffer
            const newScale = (MAX_PAGE_HEIGHT / actualHeight) * 0.96;
            setScale(newScale);
        } else {
            setScale(1);
        }
    }, [uniqueAssignments, uniqueTimeBlocks]);

    return ReactDOM.createPortal(
        <div className={`faculty-workload-iso-document ${densityClass}`}>
            <div 
                ref={containerRef} 
                style={{ 
                    zoom: scale < 1 ? scale : 1,
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
                        <td className="fw-profile-val"></td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">School</td>
                        <td className="fw-profile-val"></td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">Major</td>
                        <td className="fw-profile-val"></td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    
                    <tr>
                        <td rowSpan="3" className="fw-profile-level">MASTER'S DEGREE</td>
                        <td className="fw-profile-field">Degree</td>
                        <td className="fw-profile-val"></td>
                        <td className="fw-profile-extra">Rank/Position: {profRank}</td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">School</td>
                        <td className="fw-profile-val"></td>
                        <td className="fw-profile-extra">Designation:</td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">Major</td>
                        <td className="fw-profile-val"></td>
                        <td className="fw-profile-extra"></td>
                    </tr>

                    <tr>
                        <td rowSpan="3" className="fw-profile-level">DOCTORATE</td>
                        <td className="fw-profile-field">Degree</td>
                        <td className="fw-profile-val"></td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">School</td>
                        <td className="fw-profile-val"></td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                    <tr>
                        <td className="fw-profile-field">Major</td>
                        <td className="fw-profile-val"></td>
                        <td className="fw-profile-empty"></td>
                    </tr>
                </tbody>
            </table>

            <div className="fw-section-title">TEACHING ASSIGNMENT:</div>
            
            <table className="fw-teaching-table">
                <thead>
                    <tr>
                        <th rowSpan="2" style={{ width: '12%' }}>Course No.</th>
                        <th rowSpan="2" style={{ width: '40%' }}>Course Title</th>
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
                            <td>{a.subjectCode}</td>
                            <td style={{textAlign: 'left', paddingLeft: '5px'}}>{a.subjectName}</td>
                            <td style={{fontWeight: 'bold'}}>{a.unit}</td>
                            <td>{a.hoursPerWeek}</td>
                            <td>{a.sectionName}</td>
                            <td style={{fontWeight: 'bold'}}>{a.studentsCount}</td>
                        </tr>
                    ))}
                    {uniqueAssignments.length === 0 && (
                        <tr><td colSpan="6" style={{ height: '30px' }}></td></tr>
                    )}
                    <tr>
                        <td colSpan="2" style={{ fontWeight: 'bold', textAlign: 'left', paddingLeft: '5px' }}>TOTAL</td>
                        <td style={{ fontWeight: 'bold' }}>{totalUnits > 0 ? totalUnits : ''}</td>
                        <td style={{ fontWeight: 'bold' }}>{totalHours > 0 ? totalHours : ''}</td>
                        <td colSpan="2"></td>
                    </tr>
                    <tr>
                        <td colSpan="6" style={{ fontWeight: 'bold', textAlign: 'left', paddingLeft: '5px', backgroundColor: '#f9f9f9' }}>Other Assignments:</td>
                    </tr>
                    <tr>
                        <td><br/></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                    <tr>
                        <td><br/></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>

            <div className="fw-section-title" style={{marginTop: '10px'}}>Class Schedule:</div>
            
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
                    {uniqueTimeBlocks.map((block, rowIdx) => (
                        <tr key={rowIdx}>
                            <td style={{ textAlign: 'center' }}>
                                {block.label.replace('-', '–')}
                            </td>
                            {days.map(day => {
                                const classes = schedules.filter(s => {
                                    if (s.day !== day) return false;
                                    const label = getMeetingTimeLabel(s.timeSlot, s.subject?.hoursPerMeeting, 'standard');
                                    return label === block.label;
                                });
                                
                                return (
                                    <td key={day} style={{ textAlign: 'center', verticalAlign: 'middle', height: '30px' }}>
                                        {classes.map((cls, idx) => (
                                            <div key={idx} style={{ marginBottom: idx < classes.length - 1 ? '4px' : '0' }}>
                                                <div style={{ fontWeight: 'bold' }}>{cls.subject?.code}</div>
                                                <div>
                                                    {cls.room?.name ? cls.room.name.replace('Room', 'RM').replace('ROOM', 'RM') : 'TBA'}
                                                    {cls.section?.name ? ` - ${cls.section.name}` : ''}
                                                </div>
                                            </div>
                                        ))}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    {uniqueTimeBlocks.length === 0 && (
                        <tr><td colSpan="6" style={{ height: '50px' }}></td></tr>
                    )}
                </tbody>
            </table>

            <div className="fw-signatures-container">
                <div className="fw-sig-left">
                    <div className="fw-sig-label">Prepared by:</div>
                    <div className="fw-sig-name"><u>JELLY L. PAREDES, EdD</u></div>
                    <div className="fw-sig-title">Program Chairperson</div>
                    
                    <div className="fw-sig-label" style={{ marginTop: '10px' }}>Approved:</div>
                    <div className="fw-sig-name"><u>RAMY LLOYD L. LOTILLA, EdD</u></div>
                    <div className="fw-sig-title">Satellite College Director</div>
                </div>
                
                <div className="fw-sig-right">
                    <div className="fw-sig-label">Conforme:</div>
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
