import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import { TIME_SLOTS } from '../../config/constants';
import { slotsNeededFromIndex } from '../../utils/scheduleUtils';
import '../../styles/PrintableFacultyWorkload.css';

// Department color palette (matches ScheduleTable)
const DEPT_COLORS = {
    BSCS: { bg: '#109EEF', text: '#000000' },
    BSFT: { bg: '#16A34A', text: '#000000' },
    BSOA: { bg: '#8B5CF6', text: '#000000' },
    BAEL: { bg: '#EAB308', text: '#000000' },
};
const DEFAULT_DEPT_COLOR = { bg: '#109EEF', text: '#000000' };

function computeDeptColor(schedule, departments = []) {
    const sectionName = (schedule?.section?.name || '').toUpperCase();
    if (departments && departments.length > 0) {
        for (const d of departments) {
            if (sectionName.includes((d.id || '').toUpperCase())) {
                return { bg: d.color, text: '#000000' };
            }
        }
    }
    for (const dept of Object.keys(DEPT_COLORS)) {
        if (sectionName.includes(dept)) return { bg: DEPT_COLORS[dept].bg, text: '#000000' };
    }
    const subj = schedule?.subject;
    if (subj) {
        const depts = Array.isArray(subj.departments) ? subj.departments : (subj.department ? [subj.department] : []);
        for (const d of depts) {
            const upperD = String(d).toUpperCase();
            if (departments && departments.length > 0) {
                for (const dynDept of departments) {
                    if (upperD.includes((dynDept.id || '').toUpperCase())) {
                        return { bg: dynDept.color, text: '#000000' };
                    }
                }
            }
            for (const dept of Object.keys(DEPT_COLORS)) {
                if (upperD.includes(dept)) return { bg: DEPT_COLORS[dept].bg, text: '#000000' };
            }
        }
    }
    return DEFAULT_DEPT_COLOR;
}

function formatProfessorShort(name) {
    if (!name) return '';
    const clean = name.trim().replace(/^(Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s+/i, '');
    if (clean.includes(',')) {
        const [surname, firstNames] = clean.split(',').map(s => s.trim());
        const initial = firstNames ? firstNames[0].toUpperCase() : '';
        return initial ? `${initial}.${surname}` : surname;
    }
    const parts = clean.split(/\s+/);
    if (parts.length === 1) return parts[0];
    const initial = parts[0][0].toUpperCase();
    const surname = parts.slice(1).join(' ');
    return `${initial}.${surname}`;
}

// Each half-hour slot maps 1:1 to a row (0-21) for precise placement
const SLOT_ID_TO_ROW = {
    1: 0, 2: 1,       // 7:00-7:30, 7:30-8:00
    3: 2, 4: 3,       // 8:00-8:30, 8:30-9:00
    5: 4, 6: 5,       // 9:00-9:30, 9:30-10:00
    7: 6, 8: 7,       // 10:00-10:30, 10:30-11:00
    9: 8, 10: 9,      // 11:00-11:30, 11:30-12:00
    19: 10, 11: 11,   // 12:00-12:30, 12:30-1:00
    12: 12, 13: 13,   // 1:00-1:30, 1:30-2:00
    14: 14, 15: 15,   // 2:00-2:30, 2:30-3:00
    16: 16, 17: 17,   // 3:00-3:30, 3:30-4:00
    18: 18, 20: 19,   // 4:00-4:30, 4:30-5:00
    21: 20, 22: 21    // 5:00-5:30, 5:30-6:00
};

// Hourly labels — each spans 2 half-hour rows in the Time column
const HOUR_LABELS = [
    "7:00 - 8:00", "8:00 - 9:00", "9:00 - 10:00", "10:00 - 11:00",
    "11:00 - 12:00", "12:00 - 1:00", "1:00 - 2:00", "2:00 - 3:00",
    "3:00 - 4:00", "4:00 - 5:00", "5:00 - 6:00"
];

function getOccupiedPrintRows(schedule) {
    if (!schedule?.timeSlot) return [];
    const timeSlotsArray = TIME_SLOTS;
    const startId = parseInt(schedule.timeSlot.id);
    const startRow = SLOT_ID_TO_ROW[startId];
    if (startRow === undefined) return [];
    const startIdx = timeSlotsArray.findIndex(ts => ts.id === startId);
    if (startIdx < 0) return [startRow];
    const count = slotsNeededFromIndex(startIdx, schedule.subject?.hoursPerMeeting, 'standard');
    if (count <= 0) return [startRow];
    const rows = [];
    for (let i = 0; i < count; i++) {
        const slot = timeSlotsArray[startIdx + i];
        if (!slot) break;
        const row = SLOT_ID_TO_ROW[slot.id];
        if (row !== undefined) rows.push(row);
    }
    return rows.sort((a, b) => a - b);
}

const PrintableFacultyWorkload = ({ professor, schedules = [], semesterInfo, departments = [] }) => {
    const LOGO_SRC = '/capsu-logo.jpg';
    const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';
    const activeSemester = semesterInfo || 'First Semester, School Year 2026 – 2027';

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
                    studentsCount: ''
                });
            }
        });
        return Array.from(assignmentsMap.values());
    }, [schedules]);

    const totalUnits = uniqueAssignments.reduce((sum, a) => sum + Number(a.unit), 0);
    const totalHours = uniqueAssignments.reduce((sum, a) => sum + Number(a.hoursPerWeek), 0);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const { skipCells, spanInfo, cellSchedules } = useMemo(() => {
        const skip = new Set();
        const spans = {};
        const cellScheds = {};

        schedules.forEach(schedule => {
            if (!schedule.day || !schedule.timeSlot) return;
            const printRows = getOccupiedPrintRows(schedule);
            if (printRows.length === 0) return;

            const startRow = printRows[0];
            const day = schedule.day;
            const cellKey = `${day}-${startRow}`;

            if (!cellScheds[cellKey]) cellScheds[cellKey] = [];
            cellScheds[cellKey].push(schedule);

            if (printRows.length > 1) {
                spans[cellKey] = Math.max(spans[cellKey] || 1, printRows.length);
                for (let i = 1; i < printRows.length; i++) {
                    skip.add(`${day}-${printRows[i]}`);
                }
            }
        });

        return { skipCells: skip, spanInfo: spans, cellSchedules: cellScheds };
    }, [schedules]);

    const profName = professor?.name || 'UNKNOWN PROFESSOR';

    // Build 22 half-hour rows, but the Time column uses rowSpan=2 for hourly labels
    const totalRows = 22; // 11 hours × 2 half-hours

    return ReactDOM.createPortal(
        <div className="faculty-workload-iso-document">
            
            <table className="fw-header-table">
                <tbody>
                    <tr>
                        <td className="fw-header-logo" rowSpan="2">
                            <img src={LOGO_SRC} alt="Logo" onError={(e) => { if (e.currentTarget.src !== FALLBACK_LOGO) e.currentTarget.src = FALLBACK_LOGO; }} />
                        </td>
                        <td className="fw-header-text" rowSpan="2">
                            <h1>Capiz State University</h1>
                            <h2>MAMBUSAO SATELLITE COLLEGE</h2>
                            <h3>FACULTY WORKLOAD</h3>
                            <p>{activeSemester}</p>
                        </td>
                        <td className="fw-header-meta" style={{ borderBottom: 'none' }}><strong>IForm 04</strong></td>
                    </tr>
                    <tr>
                        <td className="fw-header-meta" style={{ borderTop: 'none' }}></td>
                    </tr>
                </tbody>
            </table>

            <div className="fw-faculty-info">
                <div className="fw-info-row">
                    <div className="fw-info-label">Name of Faculty:</div>
                    <div className="fw-info-value">{profName}</div>
                </div>
                <div className="fw-info-row">
                    <div className="fw-info-label">Academic Rank:</div>
                    <div className="fw-info-value">{professor?.rank || ''}</div>
                </div>
                <div className="fw-info-row">
                    <div className="fw-info-label">Educational Qualification:</div>
                    <div className="fw-info-value"></div>
                </div>
            </div>

            <div className="fw-table-title">Teaching Assignment:</div>
            <table className="fw-table fw-teaching-table">
                <thead>
                    <tr>
                        <th style={{ width: '15%' }}>Subject</th>
                        <th style={{ width: '40%' }}>Descriptions</th>
                        <th style={{ width: '10%' }}>Unit</th>
                        <th style={{ width: '15%' }}>Hours per Week<br/><span style={{fontSize: '7pt', fontWeight: 'normal'}}>(Lec/Lab)</span></th>
                        <th style={{ width: '10%' }}>Section</th>
                        <th style={{ width: '10%' }}>No. of Students</th>
                    </tr>
                </thead>
                <tbody>
                    {uniqueAssignments.map(a => (
                        <tr key={a.id}>
                            <td>{a.subjectCode}</td>
                            <td>{a.subjectName}</td>
                            <td>{a.unit}</td>
                            <td>{a.hoursPerWeek}</td>
                            <td>{a.sectionName}</td>
                            <td>{a.studentsCount}</td>
                        </tr>
                    ))}
                    {uniqueAssignments.length === 0 && (
                        <tr><td colSpan="6" style={{ fontStyle: 'italic', color: '#666' }}>No teaching assignments</td></tr>
                    )}
                    <tr>
                        <td colSpan="2" className="fw-teaching-total" style={{ textAlign: 'right', paddingRight: '10px' }}>Total</td>
                        <td className="fw-teaching-total">{totalUnits > 0 ? totalUnits : ''}</td>
                        <td className="fw-teaching-total">{totalHours > 0 ? totalHours : ''}</td>
                        <td></td>
                        <td></td>
                    </tr>
                </tbody>
            </table>

            <div className="fw-info-row" style={{ marginBottom: '4px' }}>
                <div className="fw-info-label" style={{ width: '150px' }}>Other Assignments:</div>
                <div className="fw-info-value" style={{ borderBottom: '1px solid #000' }}></div>
            </div>

            <div className="fw-table-title fw-schedule-title">Class Schedule</div>
            <table className="fw-table fw-schedule-table">
                <thead>
                    <tr>
                        <th style={{ width: '12%' }}>Time</th>
                        {days.map(day => (
                            <th key={day} style={{ width: '17.6%' }}>{day}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: totalRows }, (_, rowIdx) => {
                        const isFirstHalf = rowIdx % 2 === 0; // even = top of hour, odd = bottom of hour
                        const hourIndex = Math.floor(rowIdx / 2);

                        return (
                            <tr key={rowIdx}>
                                {/* Time column: only render on the first half-hour of each hour, spanning 2 rows */}
                                {isFirstHalf && (
                                    <td rowSpan={2} style={{ fontWeight: 'bold', fontSize: '7pt' }}>
                                        {HOUR_LABELS[hourIndex]}
                                    </td>
                                )}

                                {/* Day columns: each is a half-hour cell */}
                                {days.map(day => {
                                    const cellKey = `${day}-${rowIdx}`;
                                    if (skipCells.has(cellKey)) return null;

                                    const classes = cellSchedules[cellKey];
                                    const rowSpan = spanInfo[cellKey] || 1;

                                    if (!classes || classes.length === 0) {
                                        return <td key={cellKey} rowSpan={rowSpan}></td>;
                                    }

                                    const deptColor = computeDeptColor(classes[0], departments);

                                    return (
                                        <td 
                                            key={cellKey} 
                                            rowSpan={rowSpan} 
                                            className="fw-schedule-cell"
                                            style={{
                                                backgroundColor: deptColor.bg,
                                                color: deptColor.text,
                                                WebkitPrintColorAdjust: 'exact',
                                                printColorAdjust: 'exact',
                                            }}
                                        >
                                            {classes.map((cls, idx) => (
                                                <div key={idx} className="fw-schedule-cell-item">
                                                    <strong>{cls.subject?.code || 'N/A'}</strong>
                                                    <span>{formatProfessorShort(professor?.name || cls.professor?.name)}</span>
                                                    <span>{cls.room?.name || 'TBA'}</span>
                                                    <span>{cls.section?.name || 'TBA'}</span>
                                                </div>
                                            ))}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="fw-signatures">
                <div className="fw-signature-block">
                    <div>Conforme:</div>
                    <div className="fw-signature-name">{profName}</div>
                    <div className="fw-signature-title">Name/Signature of Faculty</div>
                </div>
                <div className="fw-signature-block"></div>
            </div>

        </div>,
        document.body
    );
};

export default PrintableFacultyWorkload;
