import React, { useMemo } from 'react';
import { TIME_SLOTS } from '../../config/constants';
import { slotsNeededFromIndex } from '../../utils/scheduleUtils';
import '../../styles/PrintableSchedule.css';

/**
 * Map each 30-min TIME_SLOTS id → printable row index in fixedTimeSlots.
 * The printable grid uses 1-hour blocks; each maps to two 30-min slot IDs.
 *
 *  fixedTimeSlots index 0 "7:30 - 8:30"  ← slot ids 2,3
 *  fixedTimeSlots index 1 "8:30 - 9:30"  ← slot ids 4,5
 *  fixedTimeSlots index 2 "9:30 - 10:30" ← slot ids 6,7
 *  fixedTimeSlots index 3 "10:30 - 11:30"← slot ids 8,9
 *  fixedTimeSlots index 4 "11:30 - 12:00"← slot id  10
 *  fixedTimeSlots index 5 "LUNCH"         (no data)
 *  fixedTimeSlots index 6 "1:00 - 2:00"  ← slot ids 11,12
 *  fixedTimeSlots index 7 "2:00 - 3:00"  ← slot ids 13,14
 *  fixedTimeSlots index 8 "3:00 - 4:00"  ← slot ids 15,16
 *  fixedTimeSlots index 9 "4:00 - 5:00"  ← slot ids 17,18
 */
const SLOT_TO_ROW = {
    2: 0, 3: 0,     // 7:30-8:30
    4: 1, 5: 1,     // 8:30-9:30
    6: 2, 7: 2,     // 9:30-10:30
    8: 3, 9: 3,     // 10:30-11:30
    10: 4,           // 11:30-12:00
    11: 6, 12: 6,   // 1:00-2:00
    13: 7, 14: 7,   // 2:00-3:00
    15: 8, 16: 8,   // 3:00-4:00
    17: 9, 18: 9,   // 4:00-5:00
};

/**
 * Given a schedule entry, return the sorted list of printable row indices it occupies.
 * Uses the real TIME_SLOTS + slotsNeededFromIndex for accurate duration calculation.
 */
function getOccupiedPrintRows(schedule) {
    if (!schedule?.timeSlot) return [];
    const startId = parseInt(schedule.timeSlot.id);
    const startRow = SLOT_TO_ROW[startId];
    if (startRow === undefined) return [];

    const startIdx = TIME_SLOTS.findIndex(ts => ts.id === startId);
    if (startIdx < 0) return [startRow];

    const count = slotsNeededFromIndex(startIdx, schedule.subject?.hoursPerMeeting);
    if (count <= 0) return [startRow];

    const rows = new Set();
    for (let i = 0; i < count; i++) {
        const slot = TIME_SLOTS[startIdx + i];
        if (!slot) break;
        const row = SLOT_TO_ROW[slot.id];
        if (row !== undefined) rows.add(row);
    }

    return [...rows].sort((a, b) => a - b);
}

const PrintableSchedule = ({ scheduleItems, sectionName, semesterInfo }) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const fixedTimeSlots = [
        "7:30 - 8:30",   // index 0
        "8:30 - 9:30",   // index 1
        "9:30 - 10:30",  // index 2
        "10:30 - 11:30", // index 3
        "11:30 - 12:00", // index 4
        "LUNCH",         // index 5
        "1:00 - 2:00",   // index 6
        "2:00 - 3:00",   // index 7
        "3:00 - 4:00",   // index 8
        "4:00 - 5:00"    // index 9
    ];

    /** Find the schedule entry whose start time falls into the given printable row */
    const getClassForRow = (day, rowIndex) => {
        return scheduleItems.find(s => {
            if (s.day !== day || !s.timeSlot) return false;
            return SLOT_TO_ROW[parseInt(s.timeSlot.id)] === rowIndex;
        });
    };

    // Pre-compute rowSpan values and which cells to skip
    const { skipCells, spanInfo } = useMemo(() => {
        const skip = new Set();
        const spans = {};

        scheduleItems.forEach(schedule => {
            if (!schedule.day || !schedule.timeSlot) return;
            const printRows = getOccupiedPrintRows(schedule);
            if (printRows.length <= 1) return;

            const startRow = printRows[0];
            const day = schedule.day;
            const cellKey = `${day}-${startRow}`;

            spans[cellKey] = printRows.length;

            // Mark all rows except the first as skipped for this day
            for (let i = 1; i < printRows.length; i++) {
                skip.add(`${day}-${printRows[i]}`);
            }
        });

        return { skipCells: skip, spanInfo: spans };
    }, [scheduleItems]);

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
                                    <td className="time-cell bold lunch-break-time">12:00 - 1:00</td>
                                    <td colSpan="5" className="lunch-break">
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