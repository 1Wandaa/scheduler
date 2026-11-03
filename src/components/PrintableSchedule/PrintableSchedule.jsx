import React, { useMemo } from 'react';
import { DAYS, getProgramChairInfo, isLunchSlot, overlapsLunchBreak } from '../../config/constants';
import { getScheduleTimeRange, normalizeDay } from '../../utils/scheduleUtils';
import '../../styles/PrintableSchedule.css';

// Helper: Format professor name compactly (e.g. "C. Bernabe")
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

const ISO_TIME_BLOCKS = [
    { id: 'b1', label: '7:00   –   8:30', start: 420, end: 510 },
    { id: 'b2', label: '8:30   –   10:00', start: 510, end: 600 },
    { id: 'b3', label: '10:00  –   11:30', start: 600, end: 690 },
    { id: 'lunch', label: '11:30  –  12:30', start: 690, end: 750, isLunch: true },
    { id: 'b4', label: '12:30  –   2:00', start: 750, end: 840 },
    { id: 'b5', label: '2:00   –   3:30', start: 840, end: 930 },
    { id: 'b6', label: '3:30   –   5:00', start: 930, end: 1020 },
    { id: 'b7', label: '5:00   –   6:00', start: 1020, end: 1080 }
];

const PrintableSchedule = ({ scheduleItems = [], sectionName, programName, department, semesterInfo, scheduleMode = 'standard' }) => {
    const days = DAYS; // Always 5 days (Mon - Fri) to match the official INS-CLS-08 table

    const chairInfo = useMemo(() => {
        return getProgramChairInfo({
            department,
            programName,
            sectionName,
            scheduleItems
        });
    }, [department, programName, sectionName, scheduleItems]);

    // Map schedule items to the 8 ISO time blocks (strictly uniform 1x1 schedule boxes)
    const blockGridMap = useMemo(() => {
        const gridMap = new Map();
        const nonLunchBlocks = ISO_TIME_BLOCKS.filter(b => !b.isLunch);

        // Map items to block keys: `${day}-${block.id}`
        scheduleItems.forEach(s => {
            const dayName = normalizeDay(s.day) || s.day;
            if (!dayName) return;

            const slotId = Number(s.timeSlot?.id || s.timeSlot);
            // Prevent placing any schedule that is explicitly in lunch break slots (10 or 19)
            if (isLunchSlot(slotId)) return;

            let range = getScheduleTimeRange(s, scheduleMode);
            if (!range || (range.start === 0 && range.end === 0)) {
                if (slotId >= 1 && slotId <= 3) range = { start: 420, end: 510 };
                else if (slotId >= 4 && slotId <= 6) range = { start: 510, end: 600 };
                else if (slotId >= 7 && slotId <= 9) range = { start: 600, end: 690 };
                else if (slotId === 10 || slotId === 19) return; // Prevent lunchbreak schedule
                else if (slotId >= 11 && slotId <= 13) range = { start: 750, end: 840 };
                else if (slotId >= 14 && slotId <= 16) range = { start: 840, end: 930 };
                else if (slotId >= 17 && slotId <= 18) range = { start: 930, end: 1020 };
                else if (slotId === 20) range = { start: 990, end: 1080 }; // 4:30 PM - 6:00 PM
                else if (slotId >= 21 && slotId <= 22) range = { start: 1020, end: 1080 };
                else range = { start: 420, end: 510 };
            }

            // Strictly prevent placing any schedule whose time falls within or primarily during lunch break (11:30 AM - 12:30 PM, 690 - 750)
            if (range.start >= 690 && range.start < 750) return;
            if (range.start >= 690 && range.end <= 750) return;
            const lunchOverlap = Math.max(0, Math.min(range.end, 750) - Math.max(range.start, 690));
            const duration = Math.max(1, range.end - range.start);
            if (lunchOverlap >= 30 && lunchOverlap >= duration * 0.5) return;

            let effectiveHours = Number(s.hours) || (s.subject?.hasLecLab
                ? (s.component === 'Lecture' ? ((Number(s.subject.lectureHours) || 2) / 2) : ((Number(s.subject.labHours) || 3) / 2))
                : (Number(s.subject?.hoursPerMeeting) || 1.5));

            // Normalize CS 123 or non-lab standard lecture courses to 1.5 hrs per meeting
            if (s.subject?.code === 'CS 123' && effectiveHours > 1.5 && !s.subject?.hasLecLab) {
                effectiveHours = 1.5;
            }

            if (range.end <= range.start) {
                range.end = range.start + effectiveHours * 60;
            }

            // If CS 123 range is artificially elongated beyond 90 mins, bound it to standard 90 mins
            if (s.subject?.code === 'CS 123' && (range.end - range.start) > 90 && !s.subject?.hasLecLab) {
                range = { start: range.start, end: range.start + 90 };
            }

            // Match to best fitting ISO block:
            // Select the block with the MAXIMUM time overlap among non-lunch blocks.
            let matchedBlock = null;
            let maxOverlap = 0;
            nonLunchBlocks.forEach(b => {
                const overlap = Math.max(0, Math.min(range.end, b.end) - Math.max(range.start, b.start));
                if (overlap > maxOverlap) {
                    maxOverlap = overlap;
                    matchedBlock = b;
                }
            });

            // Fallback: match block containing start time or closest block start, but NEVER if start was in lunch break
            if (!matchedBlock || maxOverlap === 0) {
                if (range.start < 690 || range.start >= 750) {
                    matchedBlock = nonLunchBlocks.find(b => range.start >= b.start - 25 && range.start < b.end - 15);
                }
            }

            // Do not place in any block if there is no genuine overlap or if start is within lunch
            if (!matchedBlock || (maxOverlap === 0 && (range.start >= 690 && range.start < 750))) {
                return;
            }

            const key = `${dayName}-${matchedBlock.id}`;
            if (!gridMap.has(key)) gridMap.set(key, []);
            gridMap.get(key).push({ ...s, _range: range });
        });

        return gridMap;
    }, [scheduleItems, scheduleMode]);

    return (
        <div className="printable-iso-document">
            {/* ISO 9001:2015 Document Header */}
            <table className="iso-header-table">
                <tbody>
                    <tr>
                        <td rowSpan="4" className="center logo-cell" style={{ width: '12%', verticalAlign: 'middle', padding: '4px' }}>
                            <img src="/download.jpg" alt="Logo" style={{ width: '100%', maxWidth: '55px', maxHeight: '52px', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
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
                <span>COURSE &amp; YEAR: <span className="meta-value underline bold">{sectionName || 'BSCS 1A'}</span></span>
                <span>SEMESTER &amp; AY: <span className="meta-value underline bold">{semesterInfo || '1st Sem 2026-2027'}</span></span>
            </div>

            {/* Schedule Table: Built on 8 ISO time blocks in landscape */}
            <table className="iso-schedule-table">
                <thead>
                    <tr>
                        <th className="time-header" style={{ width: '15%' }}>TIME</th>
                        {days.map(day => (
                            <th key={day} style={{ width: `${85 / days.length}%` }}>{day.toUpperCase()}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {ISO_TIME_BLOCKS.map(block => {
                        if (block.isLunch) {
                            return (
                                <tr key={block.id} className="lunch-row">
                                    <td className="time-cell">{block.label}</td>
                                    <td colSpan={days.length} className="lunch-break-cell">
                                        LUNCH BREAK
                                    </td>
                                </tr>
                            );
                        }

                        return (
                            <tr key={block.id}>
                                <td className="time-cell">{block.label}</td>
                                {days.map(day => {
                                    const cellKey = `${day}-${block.id}`;
                                    const cellSchedules = blockGridMap.get(cellKey) || [];
                                    const isScheduled = cellSchedules.length > 0;
                                    const isMulti = cellSchedules.length > 1;

                                    return (
                                        <td
                                            key={cellKey}
                                            className={`schedule-cell ${isScheduled ? 'scheduled-cell' : ''}`}
                                        >
                                            {cellSchedules.map((cls, idx) => {
                                                const profFormatted = formatProfessorName(cls.professor?.name);

                                                return (
                                                    <div
                                                        key={cls.id || idx}
                                                        className={`cell-content ${isMulti ? 'compact' : ''}`}
                                                        style={idx > 0 ? { marginTop: '1px', borderTop: '1px solid #000', paddingTop: '1px' } : {}}
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