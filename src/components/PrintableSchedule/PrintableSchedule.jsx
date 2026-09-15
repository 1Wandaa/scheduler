import React, { useMemo } from 'react';
import { TIME_SLOTS, FOUR_DAY_TIME_SLOTS, getProgramChairInfo } from '../../config/constants';
import { getMeetingTimeLabel, parseTimeToMinutes } from '../../utils/scheduleUtils';
import '../../styles/PrintableSchedule.css';

const getRowIndexForTime = (mins) => {
    if (mins === null || isNaN(mins)) return -1;
    if (mins < 510) return 0;       // 7:00 - 8:30
    if (mins < 600) return 1;       // 8:30 - 10:00
    if (mins < 750) return 2;       // 10:00 - 12:30 (groups anything before 12:30 into row 2)
    if (mins < 840) return 4;       // 12:30 - 2:00
    if (mins < 930) return 5;       // 2:00 - 3:30
    if (mins < 1020) return 6;      // 3:30 - 5:00
    return 7;                       // 5:00 - 6:00
};

function getSchedulePrintSpan(schedule, scheduleMode) {
    const timeStr = getMeetingTimeLabel(schedule.timeSlot, schedule.subject?.hoursPerMeeting, scheduleMode);
    if (!timeStr) return { startRow: -1, span: 1 };
    
    const parts = timeStr.split('-');
    let startMins = parseTimeToMinutes(parts[0]);
    let endMins = parts.length > 1 ? parseTimeToMinutes(parts[1]) : startMins + (schedule.subject?.hoursPerMeeting || 1.5) * 60;
    
    if (startMins === null) return { startRow: -1, span: 1 };
    
    const startRow = getRowIndexForTime(startMins);
    let endRow = startRow;
    
    if (endMins !== null && endMins > startMins) {
        endRow = getRowIndexForTime(endMins - 1);
    }
    
    let span = endRow - startRow + 1;
    if (span < 1) span = 1;
    
    // Prevent spanning across the lunch break row (index 3)
    if (startRow <= 2 && endRow >= 4) {
        span = 2 - startRow + 1;
    }
    
    return { startRow, span };
}

const PrintableSchedule = ({ scheduleItems = [], sectionName, programName, department, semesterInfo, scheduleMode }) => {
    const isFourDay = scheduleMode === 'fourDay';
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const chairInfo = useMemo(() => {
        return getProgramChairInfo({
            department,
            programName,
            sectionName,
            scheduleItems
        });
    }, [department, programName, sectionName, scheduleItems]);

    const fixedTimeSlots = [
        "7:00 \u2013 8:30",
        "8:30 \u2013 10:00",
        "10:00 \u2013 11:30",
        "11:30 \u2013 12:30",
        "12:30 \u2013 2:00",
        "2:00 \u2013 3:30",
        "3:30 \u2013 5:00",
        "5:00 \u2013 6:00"
    ];

    const scheduleRowMap = useMemo(() => {
        const map = new Map();
        scheduleItems.forEach(s => {
            if (!s.day || !s.timeSlot) return;
            const { startRow } = getSchedulePrintSpan(s, scheduleMode);
            if (startRow >= 0) {
                const key = `${s.day}-${startRow}`;
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(s);
            }
        });
        return map;
    }, [scheduleItems, scheduleMode]);

    const getClassForRow = (day, rowIndex) => scheduleRowMap.get(`${day}-${rowIndex}`);

    const { skipCells, spanInfo } = useMemo(() => {
        const skip = new Set();
        const spans = {};

        scheduleItems.forEach(schedule => {
            if (!schedule.day || !schedule.timeSlot) return;
            const { startRow, span } = getSchedulePrintSpan(schedule, scheduleMode);
            
            if (startRow >= 0 && span > 1) {
                const cellKey = `${schedule.day}-${startRow}`;
                spans[cellKey] = Math.max(spans[cellKey] || 1, span);

                for (let i = 1; i < span; i++) {
                    const skipRow = startRow + i;
                    // Never skip the lunch break index 3
                    if (skipRow !== 3) {
                        skip.add(`${schedule.day}-${skipRow}`);
                    }
                }
            }
        });

        return { skipCells: skip, spanInfo: spans };
    }, [scheduleItems, scheduleMode]);

    return (
        <div className="printable-iso-document">
            {/* ISO 9001:2015 Document Header */}
            <table className="iso-header-table">
                <tbody>
                    <tr>
                        <td rowSpan="4" className="center" style={{ width: '15%', verticalAlign: 'middle', padding: '10px' }}>
                            <img src="/download.jpg" alt="Logo" style={{ width: '100%', maxWidth: '90px', height: 'auto', display: 'block', margin: '0 auto' }} />
                        </td>
                        <td style={{ width: '15%', verticalAlign: 'top', borderRight: 'none', paddingLeft: '8px' }}>Document Type:</td>
                        <td rowSpan="2" className="center" style={{ width: '40%', verticalAlign: 'middle' }}>
                            <div className="bold" style={{ fontSize: '12pt', marginBottom: '4px' }}>DOCUMENTED INFORMATION</div>
                            <div className="bold" style={{ fontSize: '9pt' }}>ISO 9001:2015</div>
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
                        <td rowSpan="2" className="bold center" style={{ fontSize: '13pt', verticalAlign: 'middle', letterSpacing: '1px' }}>CLASS SCHEDULE</td>
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

            {/* Schedule Table */}
            <table className="iso-schedule-table">
                <thead>
                    <tr>
                        <th style={{ width: '12%' }}>TIME</th>
                        {days.map(day => (
                            <th key={day} style={{ width: '17.6%' }}>{day.toUpperCase()}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {fixedTimeSlots.map((timeLabel, index) => {
                        if (index === 3) {
                            return (
                                <tr key={timeLabel}>
                                    <td className="time-cell">{timeLabel}</td>
                                    <td colSpan="5" className="lunch-break center bold">LUNCH BREAK</td>
                                </tr>
                            );
                        }

                        return (
                            <tr key={timeLabel}>
                                <td className="time-cell">{timeLabel}</td>
                                {days.map(day => {
                                    const cellKey = `${day}-${index}`;

                                    // This cell is covered by a rowSpan from above
                                    if (skipCells.has(cellKey)) {
                                        return null;
                                    }

                                    const clsArray = getClassForRow(day, index);
                                    const rowSpan = spanInfo[cellKey] || 1;

                                    return (
                                        <td key={cellKey} className="schedule-cell" rowSpan={rowSpan}>
                                            {clsArray && clsArray.length > 0 ? clsArray.map((cls, idx) => (
                                                <div key={idx} className="cell-content" style={idx > 0 ? { marginTop: '8px', borderTop: '1px dashed #ccc', paddingTop: '8px' } : {}}>
                                                    <div className="cell-subject">{cls.subject?.code || 'N/A'}</div>
                                                    <div className="cell-professor">{cls.professor?.name || 'TBA'}</div>
                                                    <div className="cell-room">{cls.room?.name || 'TBA'}</div>
                                                </div>
                                            )) : null}
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