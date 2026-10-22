import React, { useMemo } from 'react';
import { DAYS, getProgramChairInfo } from '../../config/constants';
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

export const ISO_TIME_BLOCKS = [
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

    // Map schedule items to the 8 ISO time blocks
    const { blockGridMap, cellSpanMap, skippedCellsSet } = useMemo(() => {
        const gridMap = new Map();
        const spanMap = new Map();
        const skipped = new Set();

        const nonLunchBlocks = ISO_TIME_BLOCKS.filter(b => !b.isLunch);

        // Map items to block keys: `${day}-${block.id}`
        scheduleItems.forEach(s => {
            const dayName = normalizeDay(s.day) || s.day;
            if (!dayName) return;

            let range = getScheduleTimeRange(s, scheduleMode);
            if (!range || (range.start === 0 && range.end === 0)) {
                const slotId = Number(s.timeSlot?.id || s.timeSlot);
                if (slotId >= 1 && slotId <= 3) range = { start: 420, end: 510 };
                else if (slotId >= 4 && slotId <= 6) range = { start: 510, end: 600 };
                else if (slotId >= 7 && slotId <= 9) range = { start: 600, end: 690 };
                else if (slotId === 10 || slotId === 19) range = { start: 690, end: 750 };
                else if (slotId >= 11 && slotId <= 13) range = { start: 750, end: 840 };
                else if (slotId >= 14 && slotId <= 16) range = { start: 840, end: 930 };
                else if (slotId >= 17 && slotId <= 20) range = { start: 930, end: 1020 };
                else if (slotId >= 21 && slotId <= 22) range = { start: 1020, end: 1080 };
                else range = { start: 420, end: 510 };
            }

            const effectiveHours = Number(s.hours) || (s.subject?.hasLecLab
                ? (s.component === 'Lecture' ? ((Number(s.subject.lectureHours) || 2) / 2) : ((Number(s.subject.labHours) || 3) / 2))
                : (Number(s.subject?.hoursPerMeeting) || 1.5));

            if (range.end <= range.start) {
                range.end = range.start + effectiveHours * 60;
            }

            // Find matching start block
            let matchedBlock = nonLunchBlocks.find(b => range.start >= b.start - 15 && range.start < b.end - 15);
            if (!matchedBlock) {
                let minDiff = Infinity;
                nonLunchBlocks.forEach(b => {
                    const diff = Math.abs(range.start - b.start);
                    if (diff < minDiff) {
                        minDiff = diff;
                        matchedBlock = b;
                    }
                });
            }

            if (!matchedBlock) return;

            const key = `${dayName}-${matchedBlock.id}`;
            if (!gridMap.has(key)) gridMap.set(key, []);
            gridMap.get(key).push({ ...s, _range: range });
        });

        // Calculate spans and skips across ISO_TIME_BLOCKS
        ISO_TIME_BLOCKS.forEach((block, bIdx) => {
            if (block.isLunch) return;

            days.forEach(day => {
                const cellKey = `${day}-${block.id}`;
                if (skipped.has(cellKey)) return;

                const items = gridMap.get(cellKey) || [];
                let rowSpan = 1;

                items.forEach(item => {
                    const range = item._range;
                    if (range && range.end > block.end + 15) {
                        let spanCount = 1;
                        for (let nextIdx = bIdx + 1; nextIdx < ISO_TIME_BLOCKS.length; nextIdx++) {
                            const nextBlock = ISO_TIME_BLOCKS[nextIdx];
                            if (nextBlock.isLunch) break;
                            if (range.end > nextBlock.start + 15) {
                                spanCount++;
                            } else {
                                break;
                            }
                        }
                        if (spanCount > rowSpan) rowSpan = spanCount;
                    }
                });

                spanMap.set(cellKey, rowSpan);

                if (rowSpan > 1) {
                    let skippedCount = 0;
                    for (let nextIdx = bIdx + 1; nextIdx < ISO_TIME_BLOCKS.length && skippedCount < rowSpan - 1; nextIdx++) {
                        const nextBlock = ISO_TIME_BLOCKS[nextIdx];
                        if (!nextBlock.isLunch) {
                            skipped.add(`${day}-${nextBlock.id}`);
                            skippedCount++;
                        }
                    }
                }
            });
        });

        return { blockGridMap: gridMap, cellSpanMap: spanMap, skippedCellsSet: skipped };
    }, [scheduleItems, days, scheduleMode]);

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
                                    if (skippedCellsSet.has(cellKey)) {
                                        return null;
                                    }

                                    const cellSchedules = blockGridMap.get(cellKey) || [];
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