import React, { useMemo } from 'react';
import { DAYS, getProgramChairInfo, isLunchSlot } from '../../config/constants';
import { getScheduleTimeRange, normalizeDay, isStandardOneAndHalfHourClass } from '../../utils/scheduleUtils';
import { SLOT_WINDOWS } from '../../utils/freeTimeUtils';
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
    { id: 'b1', label: '7:00   –   8:30', start: 420, end: 510, slotIds: [1, 2, 3] },
    { id: 'b2', label: '8:30   –   10:00', start: 510, end: 600, slotIds: [4, 5, 6] },
    { id: 'b3', label: '10:00  –   11:30', start: 600, end: 690, slotIds: [7, 8, 9] },
    { id: 'lunch', label: '11:30  –  12:30', start: 690, end: 750, slotIds: [10, 19], isLunch: true },
    { id: 'b4', label: '12:30  –   2:00', start: 750, end: 840, slotIds: [11, 12, 13] },
    { id: 'b5', label: '2:00   –   3:30', start: 840, end: 930, slotIds: [14, 15, 16] },
    { id: 'b6', label: '3:30   –   5:00', start: 930, end: 1020, slotIds: [17, 18, 20] },
    { id: 'b7', label: '5:00   –   6:00', start: 1020, end: 1080, slotIds: [21, 22] }
];

const MORNING_BLOCKS = ISO_TIME_BLOCKS.slice(0, 3);
const LUNCH_BLOCK = ISO_TIME_BLOCKS[3];
const AFTERNOON_BLOCKS = ISO_TIME_BLOCKS.slice(4);
const MORNING_SLOT_IDS = MORNING_BLOCKS.flatMap(b => b.slotIds);
const AFTERNOON_SLOT_IDS = AFTERNOON_BLOCKS.flatMap(b => b.slotIds);

function getDurationClass(durationMins) {
    if (durationMins <= 30) return 'iso-dur-30';
    if (durationMins <= 60) return 'iso-dur-60';
    if (durationMins <= 90) return 'iso-dur-90';
    return 'iso-dur-long';
}

/**
 * Snap a schedule's minute range onto the 30-minute slots of the half-day pool
 * (morning or afternoon), preserving exact lengths (0.5h, 1h, 1.5h, 2h, etc.).
 */
function snapRangeToPool(range, poolSlotIds) {
    const matched = [];
    poolSlotIds.forEach((sid, idx) => {
        const sw = SLOT_WINDOWS[sid];
        if (!sw) return;
        const mid = (sw.start + sw.end) / 2;
        if (mid >= range.start && mid < range.end) {
            matched.push(idx);
        }
    });

    if (matched.length > 0) {
        const firstSw = SLOT_WINDOWS[poolSlotIds[matched[0]]];
        const lastSw = SLOT_WINDOWS[poolSlotIds[matched[matched.length - 1]]];
        return { start: firstSw.start, end: lastSw.end };
    }

    let bestIdx = -1;
    let maxOverlap = 0;
    poolSlotIds.forEach((sid, idx) => {
        const sw = SLOT_WINDOWS[sid];
        if (!sw) return;
        const overlap = Math.min(range.end, sw.end) - Math.max(range.start, sw.start);
        if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestIdx = idx;
        }
    });

    if (bestIdx >= 0 && maxOverlap > 0) {
        const sw = SLOT_WINDOWS[poolSlotIds[bestIdx]];
        return { start: sw.start, end: sw.end };
    }

    return null;
}

/**
 * Build variable-height sub-rows for a half-day (morning or afternoon) so 1-hour
 * and 30-min classes occupy their exact proportional length and leave real gaps.
 */
function buildHalfDayGrid(halfBlocks, dayItemsMap, days, isFaculty, freeTimeActivities) {
    const classGroupsByDay = {};
    const freeSegmentsByDay = {};
    const cutSet = new Set();

    halfBlocks.forEach(b => {
        cutSet.add(b.start);
        cutSet.add(b.end);
    });

    days.forEach(day => {
        const sorted = [...(dayItemsMap[day] || [])].sort(
            (a, b) => (a._start - b._start) || (a._end - b._end)
        );
        const classGroups = [];
        for (const item of sorted) {
            const last = classGroups[classGroups.length - 1];
            if (last && item._start < last.end) {
                last.end = Math.max(last.end, item._end);
                last.items.push(item);
            } else {
                classGroups.push({
                    type: 'class',
                    start: item._start,
                    end: item._end,
                    items: [item]
                });
            }
        }
        classGroups.forEach(g => {
            g.items.sort((a, b) => (a._range?.start || a._start) - (b._range?.start || b._start));
            cutSet.add(g.start);
            cutSet.add(g.end);
        });
        classGroupsByDay[day] = classGroups;

        const freeSegments = [];
        if (isFaculty && freeTimeActivities) {
            halfBlocks.forEach(block => {
                let runText = null;
                let runStart = 0;
                let runEnd = 0;

                const flushRun = () => {
                    if (runText && runEnd > runStart) {
                        freeSegments.push({
                            type: 'free',
                            start: runStart,
                            end: runEnd,
                            text: runText
                        });
                        cutSet.add(runStart);
                        cutSet.add(runEnd);
                    }
                    runText = null;
                    runStart = 0;
                    runEnd = 0;
                };

                block.slotIds.forEach(sid => {
                    const sw = SLOT_WINDOWS[sid];
                    if (!sw) return;
                    const occupied = classGroups.some(g => g.start < sw.end && g.end > sw.start);
                    const rawTxt = occupied ? '' : (freeTimeActivities[`${day}-${sid}`] || '').trim();
                    if (rawTxt) {
                        if (runText && runText.toLowerCase() === rawTxt.toLowerCase()) {
                            runEnd = sw.end;
                        } else {
                            flushRun();
                            runText = rawTxt;
                            runStart = sw.start;
                            runEnd = sw.end;
                        }
                    } else {
                        flushRun();
                    }
                });
                flushRun();
            });
        }
        freeSegmentsByDay[day] = freeSegments;
    });

    const cuts = Array.from(cutSet).sort((a, b) => a - b);
    const subRows = [];
    for (let i = 0; i < cuts.length - 1; i++) {
        const start = cuts[i];
        const end = cuts[i + 1];
        const block = halfBlocks.find(b => start >= b.start && end <= b.end);
        if (!block) continue;
        subRows.push({
            start,
            end,
            duration: end - start,
            block,
            isBlockStart: start === block.start,
            blockRowSpan: 0
        });
    }

    for (let i = 0; i < subRows.length; i++) {
        if (!subRows[i].isBlockStart) continue;
        const bId = subRows[i].block.id;
        let span = 0;
        while (i + span < subRows.length && subRows[i + span].block.id === bId) {
            span++;
        }
        subRows[i].blockRowSpan = span;
    }

    const dayCells = {};
    days.forEach(day => {
        const cells = new Array(subRows.length).fill(null);
        const occupied = [
            ...classGroupsByDay[day],
            ...freeSegmentsByDay[day]
        ].sort((a, b) => a.start - b.start);

        let occIdx = 0;
        let r = 0;
        while (r < subRows.length) {
            const row = subRows[r];
            while (occIdx < occupied.length && occupied[occIdx].end <= row.start) {
                occIdx++;
            }
            const item = occIdx < occupied.length ? occupied[occIdx] : null;
            if (item && item.start === row.start) {
                let rEnd = r;
                while (rEnd + 1 < subRows.length && subRows[rEnd].end < item.end) {
                    rEnd++;
                }
                const rowSpan = rEnd - r + 1;
                cells[r] = {
                    ...item,
                    rowSpan,
                    duration: subRows[rEnd].end - row.start
                };
                occIdx++;
                r = rEnd + 1;
            } else {
                const nextStart = item ? item.start : Infinity;
                const gapLimit = Math.min(row.block.end, nextStart);
                let rEnd = r;
                while (rEnd + 1 < subRows.length && subRows[rEnd + 1].end <= gapLimit) {
                    rEnd++;
                }
                const rowSpan = rEnd - r + 1;
                cells[r] = {
                    type: 'empty',
                    start: row.start,
                    end: subRows[rEnd].end,
                    rowSpan,
                    duration: subRows[rEnd].end - row.start
                };
                r = rEnd + 1;
            }
        }
        dayCells[day] = cells;
    });

    return { subRows, dayCells };
}

const PrintableSchedule = ({ 
    scheduleItems = [], 
    sectionName = '', 
    programName = '', 
    department = '', 
    semesterInfo = '', 
    scheduleMode = 'standard',
    viewType = 'department',
    facultyName = '',
    freeTimeActivities = {}
}) => {
    const days = DAYS; // Always 5 days (Mon - Fri) to match the official INS-CLS-08 table
    const isFaculty = viewType === 'faculty' || (!sectionName && !!facultyName);

    const chairInfo = useMemo(() => {
        return getProgramChairInfo({
            department,
            programName,
            sectionName: isFaculty ? (facultyName || sectionName) : sectionName,
            scheduleItems
        });
    }, [department, programName, sectionName, scheduleItems, isFaculty, facultyName]);

    // Build exact proportional ISO schedule rows (splitting blocks only when 1h / 30m / straddling classes require it)
    const scheduleGridRows = useMemo(() => {
        const morningItemsByDay = {};
        const afternoonItemsByDay = {};
        days.forEach(d => {
            morningItemsByDay[d] = [];
            afternoonItemsByDay[d] = [];
        });

        scheduleItems.forEach(s => {
            const dayName = normalizeDay(s.day) || s.day;
            if (!dayName || !morningItemsByDay[dayName]) return;

            const slotId = Number(s.timeSlot?.id || s.timeSlot);
            // Prevent placing any schedule that is explicitly in lunch break slots (10 or 19)
            if (isLunchSlot(slotId)) return;

            const isOneAndHalf = isStandardOneAndHalfHourClass(s);
            const effectiveHours = isOneAndHalf
                ? 1.5
                : (Number(s.hours) || (s.subject?.hasLecLab
                    ? (s.component === 'Lecture' ? ((Number(s.subject.lectureHours) || 2) / 2) : ((Number(s.subject.labHours) || 3) / 2))
                    : (Number(s.subject?.hoursPerMeeting) || 1.5)));

            let range = getScheduleTimeRange(s, scheduleMode);
            if (!range || (range.start === 0 && range.end === 0)) {
                const sw = SLOT_WINDOWS[slotId];
                if (sw) {
                    range = { start: sw.start, end: sw.start + effectiveHours * 60 };
                } else {
                    range = { start: 420, end: 420 + effectiveHours * 60 };
                }
            }

            if (range.end <= range.start) {
                range = { start: range.start, end: range.start + effectiveHours * 60 };
            }

            // If 1.5h class range is artificially elongated beyond 90 mins, bound it to standard 90 mins
            if (isOneAndHalf && (range.end - range.start) > 90) {
                range = { start: range.start, end: range.start + 90 };
            }

            // Strictly prevent placing any schedule whose time falls within or primarily during lunch break (11:30 AM - 12:30 PM, 690 - 750)
            if (range.start >= 690 && range.start < 750) return;
            if (range.start >= 690 && range.end <= 750) return;
            const lunchOverlap = Math.max(0, Math.min(range.end, 750) - Math.max(range.start, 690));
            const duration = Math.max(1, range.end - range.start);
            if (lunchOverlap >= 30 && lunchOverlap >= duration * 0.5) return;

            const morningOverlap = Math.max(0, Math.min(range.end, 690) - Math.max(range.start, 420));
            const afternoonOverlap = Math.max(0, Math.min(range.end, 1080) - Math.max(range.start, 750));
            if (morningOverlap === 0 && afternoonOverlap === 0) return;

            const isMorning = morningOverlap >= afternoonOverlap;
            const pool = isMorning ? MORNING_SLOT_IDS : AFTERNOON_SLOT_IDS;
            const snapped = snapRangeToPool(range, pool);
            if (!snapped) return;

            const targetMap = isMorning ? morningItemsByDay : afternoonItemsByDay;
            targetMap[dayName].push({
                ...s,
                _range: range,
                _start: snapped.start,
                _end: snapped.end
            });
        });

        const morningGrid = buildHalfDayGrid(
            MORNING_BLOCKS,
            morningItemsByDay,
            days,
            isFaculty,
            freeTimeActivities
        );
        const afternoonGrid = buildHalfDayGrid(
            AFTERNOON_BLOCKS,
            afternoonItemsByDay,
            days,
            isFaculty,
            freeTimeActivities
        );

        const rows = [];
        morningGrid.subRows.forEach((row, rIdx) => {
            rows.push({
                key: `m-${row.start}`,
                isLunch: false,
                row,
                getCell: (day) => morningGrid.dayCells[day]?.[rIdx] || null
            });
        });
        rows.push({
            key: LUNCH_BLOCK.id,
            isLunch: true,
            block: LUNCH_BLOCK
        });
        afternoonGrid.subRows.forEach((row, rIdx) => {
            rows.push({
                key: `a-${row.start}`,
                isLunch: false,
                row,
                getCell: (day) => afternoonGrid.dayCells[day]?.[rIdx] || null
            });
        });

        return rows;
    }, [scheduleItems, scheduleMode, days, isFaculty, freeTimeActivities]);

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
                {isFaculty ? (
                    <span>FACULTY: <span className="meta-value underline bold">{facultyName || sectionName}</span></span>
                ) : (
                    <span>COURSE &amp; YEAR: <span className="meta-value underline bold">{sectionName || 'BSCS 1A'}</span></span>
                )}
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
                    {scheduleGridRows.map(entry => {
                        if (entry.isLunch) {
                            return (
                                <tr key={entry.key} className="lunch-row">
                                    <td className="time-cell">{entry.block.label}</td>
                                    <td colSpan={days.length} className="lunch-break-cell">
                                        LUNCH BREAK
                                    </td>
                                </tr>
                            );
                        }

                        const { row, getCell } = entry;
                        const blockDuration = row.block.end - row.block.start;

                        return (
                            <tr
                                key={entry.key}
                                className={`iso-slot-row iso-row-${row.duration}`}
                                data-duration={row.duration}
                            >
                                {row.isBlockStart && (
                                    <td
                                        className={`time-cell ${getDurationClass(blockDuration)}`}
                                        rowSpan={row.blockRowSpan > 1 ? row.blockRowSpan : undefined}
                                        data-duration={blockDuration}
                                    >
                                        {row.block.label}
                                    </td>
                                )}
                                {days.map(day => {
                                    const cell = getCell(day);
                                    if (!cell) return null;

                                    const dur = cell.duration || (cell.end - cell.start) || 90;
                                    const durClass = getDurationClass(dur);

                                    if (cell.type === 'empty') {
                                        return (
                                            <td
                                                key={`${day}-${row.start}`}
                                                rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                                                data-duration={dur}
                                                className={`schedule-cell iso-empty-cell ${durClass}`}
                                            >
                                                <div className="iso-empty-spacer">&nbsp;</div>
                                            </td>
                                        );
                                    }

                                    if (cell.type === 'free') {
                                        return (
                                            <td
                                                key={`${day}-${row.start}`}
                                                rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                                                data-duration={dur}
                                                className={`schedule-cell scheduled-cell iso-free-cell ${durClass}`}
                                            >
                                                <div className="cell-wrapper">
                                                    <div className="cell-free-activity">
                                                        {cell.text}
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    }

                                    const cellSchedules = cell.items || [];
                                    const isMulti = cellSchedules.length > 1;
                                    const isCompact = isMulti || dur <= 60;

                                    return (
                                        <td
                                            key={`${day}-${row.start}`}
                                            rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                                            data-duration={dur}
                                            className={`schedule-cell scheduled-cell ${durClass}`}
                                        >
                                            <div className={`cell-wrapper ${isMulti ? 'cell-multi' : ''}`}>
                                                {cellSchedules.map((cls, idx) => {
                                                    const profFormatted = formatProfessorName(cls.professor?.name);
                                                    const rawCode = cls.subject?.code || cls.subjectCode || '—';
                                                    const subjCode = rawCode.replace(/\s*\((?:Lecture|Laboratory|Lec|Lab)\)/i, '').trim();
                                                    const roomName = cls.room?.name || 'TBA';
                                                    const sectionLabel = cls.section?.name || '';

                                                    return (
                                                        <div
                                                            key={cls.id || idx}
                                                            className={`cell-content ${isCompact ? 'compact' : ''}`}
                                                            style={idx > 0 && isMulti ? { borderLeft: '1px solid #000' } : undefined}
                                                        >
                                                            <div className="cell-subject">{subjCode}</div>
                                                            {isFaculty ? (
                                                                <>
                                                                    {sectionLabel && <div className="cell-section">{sectionLabel}</div>}
                                                                    <div className="cell-room">{roomName}</div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <div className="cell-professor">{profFormatted}</div>
                                                                    <div className="cell-room">{roomName}</div>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
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