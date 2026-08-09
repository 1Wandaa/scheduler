import React, { useMemo } from 'react';
import { TIME_SLOTS, FOUR_DAY_TIME_SLOTS } from '../../config/constants';
import { slotsNeededFromIndex } from '../../utils/scheduleUtils';
import '../../styles/PrintableSchedule.css';

const SLOT_TO_ROW = {
    1: 0, 2: 0,     // 7:00-8:00
    3: 1, 4: 1,     // 8:00-9:00
    5: 2, 6: 2,     // 9:00-10:00
    7: 3, 8: 3,     // 10:00-11:00
    9: 4, 10: 4,    // 11:00-12:00
    // row 5 is LUNCH
    19: 6, 11: 6,   // 12:00-1:00
    12: 7, 13: 7,   // 1:00-2:00
    14: 8, 15: 8,   // 2:00-3:00
    16: 9, 17: 9,   // 3:00-4:00
    18: 10, 20: 10, // 4:00-5:00
    21: 11, 22: 11  // 5:00-6:00
};

function getOccupiedPrintRows(schedule, isFourDay) {
    if (!schedule?.timeSlot) return [];
    
    const slotToRowMap = SLOT_TO_ROW;
    const timeSlotsArray = isFourDay ? FOUR_DAY_TIME_SLOTS : TIME_SLOTS;

    const startId = parseInt(schedule.timeSlot.id);
    const startRow = slotToRowMap[startId];
    if (startRow === undefined) return [];

    const startIdx = timeSlotsArray.findIndex(ts => ts.id === startId);
    if (startIdx < 0) return [startRow];

    const scheduleMode = isFourDay ? 'fourDay' : 'standard';
    const count = slotsNeededFromIndex(startIdx, schedule.subject?.hoursPerMeeting, scheduleMode);
    if (count <= 0) return [startRow];

    const rows = new Set();
    for (let i = 0; i < count; i++) {
        const slot = timeSlotsArray[startIdx + i];
        if (!slot) break;
        const row = slotToRowMap[slot.id];
        if (row !== undefined) rows.add(row);
    }

    return [...rows].sort((a, b) => a - b);
}

const PrintableSchedule = ({ scheduleItems, sectionName, semesterInfo, scheduleMode }) => {
    const isFourDay = scheduleMode === 'fourDay';
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const fixedTimeSlots = [
        "7:00 - 8:00",   // index 0
        "8:00 - 9:00",   // index 1
        "9:00 - 10:00",  // index 2
        "10:00 - 11:00", // index 3
        "11:00 - 12:00", // index 4
        "LUNCH",         // index 5
        "12:00 - 1:00",  // index 6
        "1:00 - 2:00",   // index 7
        "2:00 - 3:00",   // index 8
        "3:00 - 4:00",   // index 9
        "4:00 - 5:00",   // index 10
        "5:00 - 6:00"    // index 11
    ];

    const slotToRowMap = SLOT_TO_ROW;

    const getClassForRow = (day, rowIndex) => {
        return scheduleItems.find(s => {
            if (s.day !== day || !s.timeSlot) return false;
            return slotToRowMap[parseInt(s.timeSlot.id)] === rowIndex;
        });
    };

    const { skipCells, spanInfo } = useMemo(() => {
        const skip = new Set();
        const spans = {};

        scheduleItems.forEach(schedule => {
            if (!schedule.day || !schedule.timeSlot) return;
            const printRows = getOccupiedPrintRows(schedule, isFourDay);
            if (printRows.length <= 1) return;

            const startRow = printRows[0];
            const day = schedule.day;
            const cellKey = `${day}-${startRow}`;

            spans[cellKey] = printRows.length;

            for (let i = 1; i < printRows.length; i++) {
                skip.add(`${day}-${printRows[i]}`);
            }
        });

        return { skipCells: skip, spanInfo: spans };
    }, [scheduleItems, isFourDay]);

    return (
        <div className="printable-iso-document">
            {/* ISO 9001:2015 Document Header */}
            <table className="iso-header-table">
                <tbody>
                    <tr>
                        <td rowSpan="4" className="center" style={{ width: '15%', verticalAlign: 'middle', padding: '10px' }}>
                            <img src="/download.jpg" alt="Logo" style={{ width: '100%', maxWidth: '90px', height: 'auto', display: 'block', margin: '0 auto' }} />
                        </td>
                        <td className="bold" style={{ width: '15%' }}>Document Type:</td>
                        <td rowSpan="2" className="bold center" style={{ width: '35%', fontSize: '13pt' }}>DOCUMENTED INFORMATION</td>
                        <td className="bold" style={{ width: '15%' }}>Document Code</td>
                        <td style={{ width: '20%' }}>INS-CLS-08</td>
                    </tr>
                    <tr>
                        <td className="bold" style={{ fontSize: '10pt' }}>ISO 9001:2015</td>
                        <td className="bold">Revision No.</td>
                        <td>00</td>
                    </tr>
                    <tr>
                        <td rowSpan="2" className="bold">Document Title:</td>
                        <td rowSpan="2" className="bold center" style={{ fontSize: '15pt' }}>CLASS SCHEDULE</td>
                        <td className="bold">Effective Date</td>
                        <td>June 25, 2018</td>
                    </tr>
                    <tr>
                        <td className="bold">Page</td>
                        <td>1 of 1</td>
                    </tr>
                </tbody>
            </table>

            {/* Meta Info */}
            <div className="meta-info">
                <div>DEGREE PROGRAM: <span className="meta-value">Bachelor of Science in Computer Science</span></div>
                <div>COURSE &amp; YEAR: <span className="meta-value">{sectionName || 'BSCS 4C'}</span></div>
                <div>SEMESTER &amp; AY: <span className="meta-value">{semesterInfo || '1ST Sem 2025-2026'}</span></div>
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
                        if (timeLabel === "LUNCH") {
                            return (
                                <tr key="lunch">
                                    <td className="time-cell bold lunch-break-time">{isFourDay ? "11:30 - 12:30" : "12:00 - 1:00"}</td>
                                    <td colSpan={days.length} className="lunch-break">
                                        LUNCH BREAK
                                    </td>
                                </tr>
                            );
                        }

                        return (
                            <tr key={timeLabel}>
                                <td className="time-cell bold">{timeLabel}</td>
                                {days.map(day => {
                                    const cellKey = `${day}-${index}`;

                                    // This cell is covered by a rowSpan from above
                                    if (skipCells.has(cellKey)) {
                                        return null;
                                    }

                                    const cls = getClassForRow(day, index);
                                    const rowSpan = spanInfo[cellKey] || 1;

                                    return (
                                        <td key={cellKey} className="schedule-cell" rowSpan={rowSpan}>
                                            {cls ? (
                                                <div className="cell-content">
                                                    <div className="cell-subject">{cls.subject?.code || 'N/A'}</div>
                                                    <div className="cell-professor">{cls.professor?.name || 'TBA'}</div>
                                                    <div className="cell-room">{cls.room?.name || 'TBA'}</div>
                                                </div>
                                            ) : null}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* Signatures */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', padding: '0 40px', fontSize: '10pt', fontFamily: '"Times New Roman", Times, serif', color: '#000' }}>
                <div style={{ textAlign: 'left' }}>
                    <div style={{ marginBottom: '25px' }}>Prepared by:</div>
                    <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>JELLY L. PAREDES, EdD</div>
                    <div>Program Chairman, BSCS</div>
                </div>
                <div style={{ textAlign: 'left', paddingRight: '40px' }}>
                    <div style={{ marginBottom: '30px' }}>Approved:</div>
                    <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>RAMY LLOYD LOTILLA, EdD</div>
                    <div>Campus Administrator</div>
                </div>
            </div>
        </div>
    );
};

export default PrintableSchedule;