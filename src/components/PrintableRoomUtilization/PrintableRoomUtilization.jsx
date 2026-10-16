import React, { useMemo } from 'react';
import { TIME_SLOTS, FOUR_DAY_TIME_SLOTS, DAYS, getScheduleConfig, getProgramChairInfo } from '../../config/constants';
import { slotsNeededFromIndex, getMeetingTimeLabel, getScheduleTimeRange, normalizeDay } from '../../utils/scheduleUtils';

// Helper: Format professor name compactly to match ScheduleTable
function formatProfessorName(name) {
    if (!name) return '—';
    const clean = name.trim();
    if (clean.includes(',')) {
        const [surname, firstNames] = clean.split(',').map(s => s.trim());
        const initial = firstNames ? firstNames[0].toUpperCase() : '';
        return initial ? `${initial}. ${surname}` : surname;
    }
    const parts = clean.split(/\s+/);
    if (parts.length === 1) return parts[0];
    const initial = parts[0][0].toUpperCase();
    const surname = parts.slice(1).join(' ');
    return `${initial}. ${surname}`;
}

const PrintableRoomUtilization = ({ 
    scheduleItems = [], 
    roomName = '', 
    semesterInfo = '', 
    scheduleMode = 'standard',
    departments = [],
    targetDepartment = '',
    programName = ''
}) => {
    const config = useMemo(() => getScheduleConfig(scheduleMode), [scheduleMode]);
    const activeTimeSlots = config.timeSlots || (scheduleMode === 'fourDay' ? FOUR_DAY_TIME_SLOTS : TIME_SLOTS);
    const displayDays = DAYS;

    // Chair info resolution matching ScheduleTable and PrintableSchedule
    const chairInfo = useMemo(() => {
        return getProgramChairInfo({
            department: targetDepartment,
            programName,
            scheduleItems
        });
    }, [targetDepartment, programName, scheduleItems]);

    // Full department title resolution matching ScheduleTable
    const fullDepartmentName = useMemo(() => {
        const deptCounts = {};
        for (const s of scheduleItems) {
            let code = null;
            if (s.section?.name) {
                const name = s.section.name.toUpperCase();
                if (name.includes('BSCS')) code = 'BSCS';
                else if (name.includes('BAEL')) code = 'BAEL';
                else if (name.includes('BSOA')) code = 'BSOA';
                else if (name.includes('BSFT')) code = 'BSFT';
            }
            if (!code && s.subject) {
                const subDepts = Array.isArray(s.subject.departments) ? s.subject.departments : (s.subject.department ? [s.subject.department] : []);
                if (subDepts.includes('BSCS')) code = 'BSCS';
                else if (subDepts.includes('BAEL')) code = 'BAEL';
                else if (subDepts.includes('BSOA')) code = 'BSOA';
                else if (subDepts.includes('BSFT')) code = 'BSFT';
            }
            if (code) {
                deptCounts[code] = (deptCounts[code] || 0) + 1;
            }
        }

        let majorityDept = null;
        let maxCount = 0;
        for (const [d, count] of Object.entries(deptCounts)) {
            if (count > maxCount) {
                maxCount = count;
                majorityDept = d;
            }
        }

        if (majorityDept === 'BSCS') return 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT';
        if (majorityDept === 'BAEL') return 'BACHELOR OF ARTS IN ENGLISH LANGUAGE DEPARTMENT';
        if (majorityDept === 'BSOA') return 'BACHELOR OF SCIENCE IN OFFICE ADMINISTRATION DEPARTMENT';
        if (majorityDept === 'BSFT') return 'BACHELOR OF SCIENCE IN FOOD TECHNOLOGY DEPARTMENT';

        return chairInfo?.programName ? `${chairInfo.programName.toUpperCase()} DEPARTMENT` : 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT';
    }, [scheduleItems, chairInfo]);

    // Summary unique subjects map matching ScheduleTable
    const { uniqueSubjectsList, totalUnits } = useMemo(() => {
        const uniqueSubjectsMap = {};
        let units = 0;

        scheduleItems.forEach(current => {
            const subjCode = current.subject?.code || 'Unknown';
            const comp = current.component || '';
            const prof = current.professor?.name || '';
            const subjKey = `${current.subject?.id || subjCode}_${comp}_${prof}`;

            if (!uniqueSubjectsMap[subjKey]) {
                uniqueSubjectsMap[subjKey] = {
                    ...current,
                    code: subjCode + (comp ? ` (${comp})` : ''),
                    description: current.subject?.title || current.subject?.description || current.subject?.name || 'N/A',
                    unit: current.subject?.credits || current.subject?.units || current.subject?.totalUnits || 3,
                    faculty: current.professor?.name || 'TBA',
                    sections: new Set([current.section?.name].filter(Boolean))
                };
            } else {
                if (current.section?.name) {
                    uniqueSubjectsMap[subjKey].sections.add(current.section.name);
                }
            }

            const range = getScheduleTimeRange(current, scheduleMode);
            if (range && range.start > 0 && range.end > 0) {
                units += (range.end - range.start) / 60;
            } else {
                units += (Number(current.hours) || Number(current.subject?.hoursPerMeeting) || 1.5);
            }
        });

        const list = Object.values(uniqueSubjectsMap).map(item => ({
            ...item,
            sections: Array.from(item.sections).sort().join(', ') || 'N/A'
        })).sort((a, b) => {
            const codeA = (a.code || '').toString();
            const codeB = (b.code || '').toString();
            return codeA.localeCompare(codeB);
        });

        return { uniqueSubjectsList: list, totalUnits: units };
    }, [scheduleItems, scheduleMode]);

    // O(1) cell lookup map matching ScheduleTable
    const scheduleGridMap = useMemo(() => {
        const map = new Map();
        for (const s of scheduleItems) {
            const dayName = normalizeDay(s.day) || s.day;
            if (!dayName) continue;
            let slotId = s.timeSlot?.id;
            if (slotId == null && s.timeSlot) {
                const matched = activeTimeSlots.find(ts => 
                    String(ts.id) === String(s.timeSlot) || 
                    ts.label === s.timeSlot || 
                    ts.time === s.timeSlot?.time ||
                    ts.label === s.timeSlot?.label
                );
                if (matched) slotId = matched.id;
            }
            if (slotId == null) continue;
            const key = `${dayName}-${slotId}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(s);
        }
        return map;
    }, [scheduleItems, activeTimeSlots]);

    // Pre-calculate cell span mapping & skipped multi-slot cells EXACTLY like ScheduleTable
    const { cellSpanMap, skippedCellsSet } = useMemo(() => {
        const spanMap = new Map();
        const skipped = new Set();

        activeTimeSlots.forEach((timeSlot, tIdx) => {
            displayDays.forEach(day => {
                const cellKey = `${day}-${timeSlot.id}`;
                if (skipped.has(cellKey)) return;

                const cellSchedules = scheduleGridMap.get(cellKey) || [];
                let rowSpan = 1;
                for (const s of cellSchedules) {
                    const range = getScheduleTimeRange(s, scheduleMode);
                    if (range.start > 0 && range.end > 0) {
                        const durationMins = range.end - range.start;
                        let needed = Math.ceil(durationMins / 30);
                        if (needed < 1) needed = 1;
                        if (needed > rowSpan) rowSpan = needed;
                    } else {
                        const needed = slotsNeededFromIndex(tIdx, s.subject?.hoursPerMeeting || s.hours, scheduleMode);
                        if (needed > rowSpan) rowSpan = needed;
                    }
                }
                spanMap.set(cellKey, rowSpan);

                if (rowSpan > 1) {
                    for (let skip = 1; skip < rowSpan; skip++) {
                        const skipSlot = activeTimeSlots[tIdx + skip];
                        if (skipSlot) skipped.add(`${day}-${skipSlot.id}`);
                    }
                }
            });
        });

        return { cellSpanMap: spanMap, skippedCellsSet: skipped };
    }, [activeTimeSlots, displayDays, scheduleGridMap, scheduleMode]);

    return (
        <div className="printable-room-utilization-wrapper" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div className="printable-room-utilization" style={{ 
                fontFamily: '"Times New Roman", Times, serif', 
                color: '#000', 
                background: '#fff', 
                width: '100%', 
                maxWidth: '8.5in', 
                margin: '0 auto', 
                padding: '20px 40px', 
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100%'
            }}>
            <style>{`
                .printable-room-utilization-wrapper {
                    width: 100%;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .room-util-timetable-wrapper {
                    width: 100%;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .room-util-timetable {
                    width: 100%;
                    min-width: 680px;
                    border-collapse: collapse;
                    font-family: Arial, sans-serif;
                    font-size: 8pt;
                    table-layout: fixed;
                }
                .room-util-timetable th, .room-util-timetable td {
                    border: 1px solid #000;
                }
                .room-util-timetable tr.hour-row td:not(.time-cell) {
                    border-bottom: none;
                }
                .room-util-timetable tr.half-hour-row td:not(.time-cell) {
                    border-top: none;
                }
                .room-util-timetable td.scheduled-cell {
                    border: 1px solid #000 !important;
                }
                .room-util-timetable td {
                    height: 32px;
                }
                .room-util-timetable .time-cell,
                .room-util-timetable th.time-header {
                    position: sticky;
                    left: 0;
                    background-color: #fff;
                    z-index: 2;
                    width: 13%;
                    min-width: 90px;
                }
                .room-util-timetable th.time-header {
                    z-index: 3;
                }
                @media (max-width: 768px) {
                    .printable-room-utilization {
                        padding: 12px 14px !important;
                        max-width: 100% !important;
                    }
                    .room-util-header {
                        padding-bottom: 8px !important;
                        margin-bottom: 10px !important;
                    }
                    .room-util-header img {
                        height: 50px !important;
                        margin-right: 10px !important;
                    }
                    .room-util-header .univ {
                        font-size: 12pt !important;
                    }
                    .room-util-titles h2 {
                        font-size: 9.5pt !important;
                    }
                    .room-util-titles h3 {
                        font-size: 10pt !important;
                    }
                    .room-util-titles p {
                        font-size: 8.5pt !important;
                    }
                    .room-util-room-name {
                        font-size: 10pt !important;
                        margin-left: 0 !important;
                    }
                    .room-util-signatures {
                        flex-direction: column !important;
                        gap: 16px !important;
                        padding: 0 !important;
                        margin-top: 15px !important;
                    }
                }
                @media print {
                    @page {
                        size: letter portrait;
                        margin: 0.2in;
                    }
                    .printable-room-utilization-wrapper {
                        overflow: visible !important;
                    }
                    .printable-room-utilization {
                        padding: 0 !important;
                        max-width: 100% !important;
                        width: 100% !important;
                    }
                    .room-util-timetable {
                        min-width: unset !important;
                        width: 100% !important;
                    }
                    .room-util-timetable .time-cell,
                    .room-util-timetable th.time-header {
                        position: static !important;
                    }
                }
            `}</style>

            {/* Header matching PDF and ExportOptions */}
            <div className="room-util-header" style={{ display: 'flex', alignItems: 'center', borderBottom: '3px solid #f2a900', paddingBottom: '10px', marginBottom: '15px' }}>
                <img src="/download.jpg" alt="University Logo" style={{ height: '70px', marginRight: '15px', objectFit: 'contain' }} />
                <div className="room-util-header-text" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span className="republic" style={{ fontSize: '9pt', fontFamily: 'Arial, sans-serif' }}>Republic of the Philippines</span>
                    <span className="univ" style={{ fontSize: '15pt', fontWeight: 'bold', color: '#002060', fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }}>CAPIZ STATE UNIVERSITY</span>
                    <span className="campus" style={{ fontSize: '10pt', fontWeight: 'bold', color: '#002060', fontFamily: 'Arial, sans-serif' }}>MAMBUSAO SATELLITE COLLEGE</span>
                </div>
            </div>

            {/* Titles dynamically resolved */}
            <div className="room-util-titles" style={{ textAlign: 'center', marginBottom: '15px' }}>
                <h2 style={{ fontFamily: 'Arial, sans-serif', color: '#2e5296', fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '0 0 5px 0' }}>{fullDepartmentName}</h2>
                <h3 style={{ fontSize: '12pt', fontWeight: 'bold', margin: '0 0 5px 0' }}>Room Utilization</h3>
                <p style={{ fontSize: '10pt', margin: '0' }}>{semesterInfo || "First Semester, School Year 2026-2027"}</p>
            </div>

            {/* Room Name */}
            <div className="room-util-room-name-wrapper" style={{ marginBottom: '10px', paddingLeft: '5px' }}>
                <span className="room-util-room-name" style={{ fontSize: '11pt', fontWeight: 'bold', backgroundColor: '#ffff00', padding: '3px 8px', display: 'inline-block', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', border: '1px solid #000' }}>Room: {roomName || 'N/A'}</span>
            </div>

            {/* Subjects Table */}
            <div className="room-util-subjects-wrapper" style={{ width: '100%', overflowX: 'auto', marginBottom: '15px' }}>
                <table className="room-util-subjects" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '15%', border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>Subject</th>
                            <th style={{ width: '35%', border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>Description</th>
                            <th style={{ width: '10%', border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>Unit</th>
                            <th style={{ width: '20%', border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>Faculty</th>
                            <th style={{ width: '20%', border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>Course/Section</th>
                        </tr>
                    </thead>
                    <tbody>
                        {uniqueSubjectsList.length > 0 ? (
                            uniqueSubjectsList.map((subj, i) => (
                                <tr key={i}>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{subj.code}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{subj.description}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{subj.unit}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{subj.faculty}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{subj.sections}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="5" style={{ border: '1px solid #000', padding: '10px', textAlign: 'center' }}>No subjects assigned</td>
                            </tr>
                        )}
                        {uniqueSubjectsList.length > 0 && (
                            <tr>
                                <td colSpan="2" style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>Total</td>
                                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{totalUnits}</td>
                                <td colSpan="2" style={{ border: '1px solid #000', padding: '6px' }}></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Timetable Grid with responsive horizontal scroll and sticky time header */}
            <div className="room-util-timetable-wrapper">
                <table className="room-util-timetable" style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '8pt', tableLayout: 'fixed', flex: 1 }}>
                    <thead>
                        <tr>
                            <th className="time-header" style={{ border: '1px solid #000', padding: '6px', width: '13%', fontWeight: 'bold' }}>Time</th>
                            {displayDays.map(day => (
                                <th key={day} style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>{day}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {activeTimeSlots.map((timeSlot, tIdx) => {
                            const isHourGroupHead = tIdx % 2 === 0;
                            const nextSlot = activeTimeSlots[tIdx + 1];
                            const timeRowSpan = isHourGroupHead ? (nextSlot ? 2 : 1) : 0;
                            const hourLabel = isHourGroupHead
                                ? (nextSlot ? `${timeSlot.label.split(' - ')[0]} - ${nextSlot.label.split(' - ')[1]}` : timeSlot.label)
                                : '';

                            return (
                                <tr key={timeSlot.id} className={isHourGroupHead ? 'hour-row' : 'half-hour-row'}>
                                    {isHourGroupHead && (
                                        <td className="time-cell time-col" rowSpan={timeRowSpan} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                                            {hourLabel}
                                        </td>
                                    )}
                                    {displayDays.map(day => {
                                        const cellKey = `${day}-${timeSlot.id}`;
                                        if (skippedCellsSet.has(cellKey)) return null;

                                        const cellSchedules = scheduleGridMap.get(cellKey) || [];
                                        const rowSpan = cellSpanMap.get(cellKey) || 1;
                                        const isScheduled = cellSchedules.length > 0;

                                        return (
                                            <td 
                                                key={cellKey} 
                                                rowSpan={rowSpan} 
                                                className={isScheduled ? 'scheduled-cell cell-scheduled' : ''} 
                                                style={{ 
                                                    padding: isScheduled ? '2px' : '4px', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    backgroundColor: isScheduled ? '#00b0f0' : 'transparent',
                                                    WebkitPrintColorAdjust: 'exact',
                                                    printColorAdjust: 'exact',
                                                    fontWeight: isScheduled ? 'bold' : 'normal',
                                                    color: '#000'
                                                }}
                                            >
                                                {cellSchedules.map((cls, idx) => {
                                                    const profFormatted = formatProfessorName(cls.professor?.name);

                                                    return (
                                                        <div 
                                                            key={cls.id || idx} 
                                                            className="cell-content"
                                                            style={{ 
                                                                display: 'flex', 
                                                                flexDirection: 'column', 
                                                                justifyContent: 'center', 
                                                                alignItems: 'center', 
                                                                lineHeight: '1.2',
                                                                padding: '2px',
                                                                marginTop: idx > 0 ? '4px' : '0',
                                                                borderTop: idx > 0 ? '1px dashed rgba(0,0,0,0.3)' : 'none',
                                                                color: '#000'
                                                            }}
                                                        >
                                                            <div className="cell-line" style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                                {cls.subject?.code || '—'}
                                                                {cls.component && <span style={{ fontSize: '0.75em', display: 'block', fontWeight: 'normal', opacity: 0.9 }}>{cls.component}</span>}
                                                            </div>
                                                            <div className="cell-line" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontWeight: '600' }}>
                                                                {profFormatted}
                                                            </div>
                                                            <div className="cell-line" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                                {cls.room?.name || roomName || '—'}
                                                            </div>
                                                            {cls.section?.name && (
                                                                <div className="cell-line" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontWeight: '600' }}>
                                                                    {cls.section.name}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Signatures */}
            <div className="room-util-signatures" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', marginTop: '20px', fontSize: '9pt' }}>
                <div className="sig-block" style={{ textAlign: 'left' }}>
                    <div className="sig-label" style={{ marginBottom: '20px' }}>Prepared by:</div>
                    <div className="sig-name" style={{ fontWeight: 'bold' }}>CHERILYN G. VILLASIS</div>
                    <div className="sig-title">Department Secretary</div>
                </div>
                <div className="sig-block" style={{ textAlign: 'left' }}>
                    <div className="sig-label" style={{ marginBottom: '20px' }}>Noted:</div>
                    <div className="sig-name" style={{ fontWeight: 'bold' }}>{chairInfo.chairName}</div>
                    <div className="sig-title">{chairInfo.title || 'Program Coordinator'}</div>
                </div>
                <div className="sig-block" style={{ textAlign: 'left' }}>
                    <div className="sig-label" style={{ marginBottom: '20px' }}>Approved:</div>
                    <div className="sig-name" style={{ fontWeight: 'bold' }}>RAMY LLOYD L. LOTILLA, EdD</div>
                    <div className="sig-title">Satellite College Director</div>
                </div>
            </div>
            
            <div style={{ marginTop: '30px' }}></div>
        </div>
        </div>
    );
};

export default PrintableRoomUtilization;

