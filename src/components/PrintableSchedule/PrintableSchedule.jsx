import React, { useMemo } from 'react';
import { TIME_SLOTS, FOUR_DAY_TIME_SLOTS, DAYS, FOUR_DAY_DAYS, getScheduleConfig, getProgramChairInfo } from '../../config/constants';
import { slotsNeededFromIndex, getScheduleTimeRange, normalizeDay } from '../../utils/scheduleUtils';
import '../../styles/PrintableSchedule.css';

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

const PrintableSchedule = ({ scheduleItems = [], sectionName, programName, department, semesterInfo, scheduleMode = 'standard' }) => {
    const config = useMemo(() => getScheduleConfig(scheduleMode), [scheduleMode]);
    const activeTimeSlots = config.timeSlots || (scheduleMode === 'fourDay' ? FOUR_DAY_TIME_SLOTS : TIME_SLOTS);
    const days = config.days || (scheduleMode === 'fourDay' ? FOUR_DAY_DAYS : DAYS);

    const chairInfo = useMemo(() => {
        return getProgramChairInfo({
            department,
            programName,
            sectionName,
            scheduleItems
        });
    }, [department, programName, sectionName, scheduleItems]);

    // O(1) cell lookup map directly matching the main timetable (ScheduleTable)
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
            days.forEach(day => {
                const cellKey = `${day}-${timeSlot.id}`;
                if (skipped.has(cellKey)) return;

                const cellSchedules = scheduleGridMap.get(cellKey) || [];
                let rowSpan = 1;
                for (const s of cellSchedules) {
                    const range = getScheduleTimeRange(s, scheduleMode);
                    if (range && range.start > 0 && range.end > 0) {
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
    }, [activeTimeSlots, days, scheduleGridMap, scheduleMode]);

    return (
        <div className="printable-iso-document">
            {/* ISO 9001:2015 Document Header */}
            <table className="iso-header-table">
                <tbody>
                    <tr>
                        <td rowSpan="4" className="center" style={{ width: '12%', verticalAlign: 'middle', padding: '6px' }}>
                            <img src="/download.jpg" alt="Logo" style={{ width: '100%', maxWidth: '65px', height: 'auto', display: 'block', margin: '0 auto' }} />
                        </td>
                        <td style={{ width: '15%', verticalAlign: 'top', borderRight: 'none', paddingLeft: '8px' }}>Document Type:</td>
                        <td rowSpan="2" className="center" style={{ width: '43%', verticalAlign: 'middle' }}>
                            <div className="bold" style={{ fontSize: '11pt', marginBottom: '2px' }}>DOCUMENTED INFORMATION</div>
                            <div className="bold" style={{ fontSize: '8.5pt' }}>ISO 9001:2015</div>
                        </td>
                        <td style={{ width: '15%', textAlign: 'right', paddingRight: '8px', borderRight: 'none' }}>Document Code</td>
                        <td className="bold center" style={{ width: '15%' }}>INS-CLS-08</td>
                    </tr>
                    <tr>
                        <td style={{ borderTop: 'none', borderRight: 'none' }}></td>
                        <td style={{ textAlign: 'right', paddingRight: '8px', borderRight: 'none' }}>Revision No.</td>
                        <td className="bold center">00</td>
                    </tr>
                    <tr>
                        <td rowSpan="2" style={{ verticalAlign: 'top', borderRight: 'none', paddingLeft: '8px' }}>Document Title:</td>
                        <td rowSpan="2" className="bold center" style={{ fontSize: '12pt', verticalAlign: 'middle', letterSpacing: '1px' }}>CLASS SCHEDULE</td>
                        <td style={{ textAlign: 'right', paddingRight: '8px', borderRight: 'none' }}>Effective Date</td>
                        <td className="bold center">June 25, 2018</td>
                    </tr>
                    <tr>
                        <td style={{ textAlign: 'right', paddingRight: '8px', borderRight: 'none' }}>Page</td>
                        <td className="bold center">1 of 1</td>
                    </tr>
                </tbody>
            </table>

            {/* Meta Info */}
            <div className="meta-info">
                <span>DEGREE PROGRAM: <span className="meta-value underline bold">{chairInfo.programName}</span></span>
                <span>COURSE &amp; YEAR: <span className="meta-value underline bold">{sectionName || 'BSCS 4C'}</span></span>
                <span>SEMESTER &amp; AY: <span className="meta-value underline bold">{semesterInfo || '1st Sem 2026-2027'}</span></span>
            </div>

            {/* Schedule Table: Built directly on main timetable grid */}
            <table className="iso-schedule-table">
                <thead>
                    <tr>
                        <th className="time-header" style={{ width: '12%' }}>TIME</th>
                        {days.map(day => (
                            <th key={day} style={{ width: `${88 / days.length}%` }}>{day.toUpperCase()}</th>
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
                                    <td className="time-cell" rowSpan={timeRowSpan}>
                                        {hourLabel}
                                    </td>
                                )}
                                {days.map(day => {
                                    const cellKey = `${day}-${timeSlot.id}`;
                                    if (skippedCellsSet.has(cellKey)) {
                                        return null;
                                    }

                                    const cellSchedules = scheduleGridMap.get(cellKey) || [];
                                    const rowSpan = cellSpanMap.get(cellKey) || 1;
                                    const isScheduled = cellSchedules.length > 0;

                                    return (
                                        <td 
                                            key={cellKey} 
                                            className={`schedule-cell ${isScheduled ? 'scheduled-cell' : ''}`} 
                                            rowSpan={rowSpan}
                                        >
                                            {cellSchedules.map((cls, idx) => {
                                                const profFormatted = formatProfessorName(cls.professor?.name);

                                                return (
                                                    <div 
                                                        key={cls.id || idx} 
                                                        className="cell-content" 
                                                        style={idx > 0 ? { marginTop: '2px', borderTop: '1px solid #000', paddingTop: '2px' } : {}}
                                                    >
                                                        <div className="cell-subject">{cls.subject?.code || '—'}{cls.component ? ` (${cls.component})` : ''}</div>
                                                        <div className="cell-professor">{profFormatted}</div>
                                                        <div className="cell-room">{cls.room?.name || 'TBA'}</div>
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

            {/* Signatures */}
            <div className="signatures-section">
                <div className="signature-block">
                    <div className="sig-label">Prepared by:</div>
                    <div className="sig-name underline bold">{chairInfo.chairName}</div>
                    <div className="sig-title">{chairInfo.title}</div>
                </div>
                <div className="signature-block right-aligned">
                    <div className="sig-label">Approved:</div>
                    <div className="sig-name underline bold">RAMY LLOYD L. LOTILLA, EdD</div>
                    <div className="sig-title">Satellite College Director</div>
                </div>
            </div>
        </div>
    );
};

export default PrintableSchedule;