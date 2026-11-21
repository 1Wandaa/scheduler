import React, { useMemo, useState } from 'react';
import { TIME_SLOTS, FOUR_DAY_TIME_SLOTS, DAYS, getScheduleConfig, getProgramChairInfo } from '../../config/constants';
import { slotsNeededFromIndex, getScheduleTimeRange, normalizeDay } from '../../utils/scheduleUtils';
import '../../styles/PrintableRoomUtilization.css';

const CAPSU_HEADER_SRC = '/capsu-header.png';
const CAPSU_FOOTER_SRC = '/capsu-footer.png';

// Helper: Format professor name compactly to match ScheduleTable & reference ROOM UTILIZATION.docx
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

// Department color palette matching ScheduleTable & constants
const DEPT_COLORS = {
    BSCS: '#109EEF',
    BAEL: '#EAB308',
    BSOA: '#8B5CF6',
    BSFT: '#16A34A',
};
const DEFAULT_DEPT_COLOR = '#109EEF';

function resolveDeptCodeFromText(text, departments = []) {
    if (!text) return null;
    const upper = String(text).toUpperCase().trim();
    if (!upper) return null;

    if (Array.isArray(departments) && departments.length > 0) {
        for (const d of departments) {
            const dId = (d.id || d.code || '').toUpperCase().trim();
            if (dId && (upper === dId || upper.includes(dId))) {
                return dId;
            }
        }
    }

    if (upper.includes('BSCS') || upper.includes('COMPUTER SCIENCE')) return 'BSCS';
    if (upper.includes('BAEL') || upper.includes('ENGLISH LANGUAGE')) return 'BAEL';
    if (upper.includes('BSOA') || upper.includes('OFFICE ADMINISTRATION')) return 'BSOA';
    if (upper.includes('BSFT') || upper.includes('FOOD TECHNOLOGY')) return 'BSFT';
    return null;
}

function getDeptBgColor(deptCode, departments = []) {
    if (!deptCode) return DEFAULT_DEPT_COLOR;
    const upper = String(deptCode).toUpperCase().trim();
    if (Array.isArray(departments) && departments.length > 0) {
        const found = departments.find(d => (d.id || d.code || '').toUpperCase().trim() === upper);
        if (found?.color) return found.color;
    }
    return DEPT_COLORS[upper] || DEFAULT_DEPT_COLOR;
}

function computeScheduleDeptColor(schedule, departments = []) {
    if (!schedule) return DEFAULT_DEPT_COLOR;

    const sec = schedule.section;
    if (sec) {
        const fromSecName = resolveDeptCodeFromText(typeof sec === 'string' ? sec : sec.name, departments);
        if (fromSecName) return getDeptBgColor(fromSecName, departments);

        const fromSecProg = resolveDeptCodeFromText(sec.program || sec.department, departments);
        if (fromSecProg) return getDeptBgColor(fromSecProg, departments);
    }

    const subj = schedule.subject;
    if (subj) {
        const subDepts = Array.isArray(subj.departments)
            ? subj.departments
            : (subj.department ? [subj.department] : []);
        for (const d of subDepts) {
            const code = resolveDeptCodeFromText(d, departments);
            if (code) return getDeptBgColor(code, departments);
        }
    }

    if (schedule.professor?.department) {
        const fromProf = resolveDeptCodeFromText(schedule.professor.department, departments);
        if (fromProf) return getDeptBgColor(fromProf, departments);
    }

    return DEFAULT_DEPT_COLOR;
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
    const [headerImgFailed, setHeaderImgFailed] = useState(false);
    const [footerImgFailed, setFooterImgFailed] = useState(false);

    const config = useMemo(() => getScheduleConfig(scheduleMode), [scheduleMode]);
    const activeTimeSlots = config.timeSlots || (scheduleMode === 'fourDay' ? FOUR_DAY_TIME_SLOTS : TIME_SLOTS);
    const displayDays = DAYS;

    // Determine majority department among scheduled classes in this room
    const majorityDept = useMemo(() => {
        const deptCounts = {};
        for (const s of scheduleItems) {
            let code = null;
            if (s.section) {
                code = resolveDeptCodeFromText(s.section.name, departments) ||
                    resolveDeptCodeFromText(s.section.program || s.section.department, departments);
            }
            if (!code && s.subject) {
                const subDepts = Array.isArray(s.subject.departments)
                    ? s.subject.departments
                    : (s.subject.department ? [s.subject.department] : []);
                for (const d of subDepts) {
                    const matched = resolveDeptCodeFromText(d, departments);
                    if (matched) {
                        code = matched;
                        break;
                    }
                }
            }
            if (code) {
                deptCounts[code] = (deptCounts[code] || 0) + 1;
            }
        }

        let topDept = null;
        let maxCount = 0;
        for (const [d, count] of Object.entries(deptCounts)) {
            if (count > maxCount) {
                maxCount = count;
                topDept = d;
            }
        }
        return topDept;
    }, [scheduleItems, departments]);

    // Chair info resolution matching ScheduleTable and PrintableSchedule
    const chairInfo = useMemo(() => {
        return getProgramChairInfo({
            department: targetDepartment || majorityDept,
            programName,
            scheduleItems
        });
    }, [targetDepartment, majorityDept, programName, scheduleItems]);

    // Full department title resolution matching ROOM UTILIZATION.docx
    const fullDepartmentName = useMemo(() => {
        const activeDept = (targetDepartment || majorityDept || '').toUpperCase();
        if (activeDept === 'BSCS') return 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT';
        if (activeDept === 'BAEL') return 'BACHELOR OF ARTS IN ENGLISH LANGUAGE DEPARTMENT';
        if (activeDept === 'BSOA') return 'BACHELOR OF SCIENCE IN OFFICE ADMINISTRATION DEPARTMENT';
        if (activeDept === 'BSFT') return 'BACHELOR OF SCIENCE IN FOOD TECHNOLOGY DEPARTMENT';

        return chairInfo?.programName
            ? `${chairInfo.programName.toUpperCase()} DEPARTMENT`
            : 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT';
    }, [targetDepartment, majorityDept, chairInfo]);

    // Summary unique subjects list matching ROOM UTILIZATION.docx
    const uniqueSubjectsList = useMemo(() => {
        const uniqueSubjectsMap = {};

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
                    unit: current.subject?.hasLecLab
                        ? (comp === 'Lecture' ? (Number(current.subject.lectureHours) || 2) : (Number(current.subject.labHours) || 3))
                        : (current.subject?.credits || current.subject?.units || current.subject?.totalUnits || 3),
                    faculty: current.professor?.name || 'TBA',
                    sections: new Set([current.section?.name].filter(Boolean))
                };
            } else if (current.section?.name) {
                uniqueSubjectsMap[subjKey].sections.add(current.section.name);
            }
        });

        return Object.values(uniqueSubjectsMap)
            .map(item => ({
                ...item,
                sections: Array.from(item.sections)
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
                    .join(', ') || 'N/A'
            }))
            .sort((a, b) => (a.code || '').toString().localeCompare((b.code || '').toString(), undefined, { numeric: true, sensitivity: 'base' }));
    }, [scheduleItems]);

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

    // Pre-calculate cell span mapping & skipped multi-slot cells
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
                        const sHours = Number(s.hours) || (s.subject?.hasLecLab
                            ? (s.component === 'Lecture' ? ((Number(s.subject.lectureHours) || 2) / 2) : ((Number(s.subject.labHours) || 3) / 2))
                            : (Number(s.subject?.hoursPerMeeting) || 1.5));
                        const needed = slotsNeededFromIndex(tIdx, sHours, scheduleMode);
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

    // Dynamically calibrate vertical budget for 1-page US Letter Portrait (1054px)
    // accounting for CAPSU Header (~132px), CAPSU Footer (~121px), Titles + Room + Signatures (~155px)
    const subjectCount = uniqueSubjectsList.length;
    const subjRowCount = Math.max(1, subjectCount) + 1; // thead + data rows
    const subjFontSize = subjectCount > 13 ? '6.8pt' : (subjectCount > 9 ? '7.2pt' : (subjectCount > 6 ? '7.5pt' : '8pt'));
    const subjCellPad = subjectCount > 13 ? '1.5px 3px' : (subjectCount > 9 ? '1.5px 4px' : (subjectCount > 6 ? '2px 4px' : '2.5px 5px'));
    const estimatedSubjRowHeight = subjectCount > 13 ? 13 : (subjectCount > 9 ? 14 : (subjectCount > 6 ? 16 : 18));

    const headerAndFooterHeight = 253; // CAPSU full-bleed header (132px) + footer (121px) at 8.5in width
    const bodyFixedHeight = 160;       // Titles + Room badge + Signatures + vertical margins
    const estimatedSubjTableHeight = Math.ceil(subjRowCount * estimatedSubjRowHeight * 1.12) + 4;
    const targetPageHeight = 1044;     // Safe 1-page US Letter Portrait envelope (1056px @ 96dpi)
    const availableTimetableHeight = targetPageHeight - headerAndFooterHeight - bodyFixedHeight - estimatedSubjTableHeight;
    const printThHeight = 20;
    const printSlotHeight = Math.max(
        15,
        Math.min(22, Math.floor((availableTimetableHeight - printThHeight) / Math.max(1, activeTimeSlots.length)))
    );

    return (
        <div className="printable-room-utilization-wrapper">
            {/* Scoped @page directive active only while PrintableRoomUtilization is mounted */}
            <style>{`
                @media print {
                    @page {
                        size: letter portrait;
                        margin: 0;
                    }
                }
            `}</style>

            <div className="printable-room-utilization">
                {/* Official CAPSU Full-Bleed Header */}
                <header className="room-util-header">
                    {!headerImgFailed ? (
                        <img
                            src={CAPSU_HEADER_SRC}
                            alt="Republic of the Philippines — Capiz State University, Mambusao Satellite College"
                            className="room-util-header-img"
                            onError={() => setHeaderImgFailed(true)}
                        />
                    ) : (
                        <div className="room-util-header-fallback">
                            <img src="/capsu-logo.jpg" alt="CapSU Logo" />
                            <div className="room-util-header-text">
                                <span className="republic">Republic of the Philippines</span>
                                <span className="univ">CAPIZ STATE UNIVERSITY</span>
                                <span className="campus">MAMBUSAO SATELLITE COLLEGE</span>
                            </div>
                        </div>
                    )}
                </header>

                {/* Document Body */}
                <div className="room-util-body">
                    {/* Titles matching ROOM UTILIZATION.docx */}
                    <div className="room-util-titles">
                        <h2>{fullDepartmentName}</h2>
                        <h3>Room Utilization</h3>
                        <p>{semesterInfo || 'First Semester, School Year 2026-2027'}</p>
                    </div>

                    {/* Yellow Room Badge */}
                    <div className="room-util-room-name-wrapper">
                        <span className="room-util-room-name">Room: {roomName || 'N/A'}</span>
                    </div>

                    {/* Subjects Summary Table */}
                    <div className="room-util-subjects-wrapper">
                        <table
                            className="room-util-subjects"
                            style={{ '--room-subj-font': subjFontSize, '--room-subj-pad': subjCellPad }}
                        >
                            <thead>
                                <tr>
                                    <th style={{ width: '13%' }}>Subject</th>
                                    <th style={{ width: '36%' }}>Description</th>
                                    <th style={{ width: '8%' }}>Unit</th>
                                    <th style={{ width: '23%' }}>Faculty</th>
                                    <th style={{ width: '20%' }}>Course/Section</th>
                                </tr>
                            </thead>
                            <tbody>
                                {uniqueSubjectsList.length > 0 ? (
                                    uniqueSubjectsList.map((subj, i) => (
                                        <tr key={i}>
                                            <td className="subj-code-cell">{subj.code}</td>
                                            <td className="subj-desc-cell">{subj.description}</td>
                                            <td className="subj-unit-cell">{subj.unit}</td>
                                            <td className="subj-faculty-cell">{subj.faculty}</td>
                                            <td className="subj-sec-cell">{subj.sections}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '6px' }}>
                                            No subjects assigned
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Weekly Timetable Grid */}
                    <div className="room-util-timetable-wrapper">
                        <table
                            className="room-util-timetable"
                            style={{
                                '--room-slot-height': `${printSlotHeight}px`,
                                '--room-th-height': `${printThHeight}px`
                            }}
                        >
                            <thead>
                                <tr>
                                    <th className="time-header" style={{ width: '13%' }}>Time</th>
                                    {displayDays.map(day => (
                                        <th key={day}>{day}</th>
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
                                                <td className="time-cell time-col" rowSpan={timeRowSpan}>
                                                    {hourLabel}
                                                </td>
                                            )}
                                            {displayDays.map(day => {
                                                const cellKey = `${day}-${timeSlot.id}`;
                                                if (skippedCellsSet.has(cellKey)) return null;

                                                const cellSchedules = scheduleGridMap.get(cellKey) || [];
                                                const rowSpan = cellSpanMap.get(cellKey) || 1;
                                                const isScheduled = cellSchedules.length > 0;
                                                const primaryBgColor = isScheduled
                                                    ? computeScheduleDeptColor(cellSchedules[0], departments)
                                                    : 'transparent';

                                                return (
                                                    <td
                                                        key={cellKey}
                                                        rowSpan={rowSpan}
                                                        className={isScheduled ? 'scheduled-cell cell-scheduled' : ''}
                                                        data-bg-color={isScheduled ? primaryBgColor : undefined}
                                                        style={{
                                                            height: `${printSlotHeight}px`,
                                                            backgroundColor: primaryBgColor,
                                                            '--cell-bg': primaryBgColor
                                                        }}
                                                    >
                                                        {cellSchedules.map((cls, idx) => {
                                                            const clsBgColor = computeScheduleDeptColor(cls, departments);
                                                            const profFormatted = formatProfessorName(cls.professor?.name);
                                                            const rawSubj = cls.subject?.code || cls.subjectCode || '—';
                                                            let displaySubj = rawSubj;
                                                            let displayComp = (cls.component || '').replace(/^\(|\)$/g, '').trim();

                                                            if (!displayComp) {
                                                                const m = displaySubj.match(/\((Lecture|Laboratory|Lec|Lab)\)/i);
                                                                if (m) {
                                                                    displayComp = m[1];
                                                                    displaySubj = displaySubj.replace(m[0], '').trim();
                                                                }
                                                            } else {
                                                                displaySubj = displaySubj.replace(new RegExp(`\\s*\\(${displayComp}\\)`, 'i'), '').trim();
                                                            }

                                                            const roomDisplay = cls.room?.name || roomName || '—';
                                                            const secDisplay = cls.section?.name || '';
                                                            const effectiveSpan = Math.max(1, Math.floor(rowSpan / cellSchedules.length));

                                                            return (
                                                                <div
                                                                    key={cls.id || idx}
                                                                    className="cell-content"
                                                                    data-bg-color={clsBgColor}
                                                                    style={{
                                                                        marginTop: idx > 0 ? '1px' : '0',
                                                                        borderTop: idx > 0 ? '1px solid #000' : 'none',
                                                                        backgroundColor: cellSchedules.length > 1 ? clsBgColor : 'transparent'
                                                                    }}
                                                                >
                                                                    {effectiveSpan === 1 ? (
                                                                        <>
                                                                            <div className="cell-line cell-line-subj" style={{ fontSize: '7.2pt' }}>
                                                                                {displaySubj}{displayComp ? ` (${displayComp})` : ''}
                                                                            </div>
                                                                            {profFormatted && (
                                                                                <div className="cell-line cell-line-prof" style={{ fontSize: '6.4pt' }}>
                                                                                    {profFormatted}
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    ) : effectiveSpan === 2 ? (
                                                                        <>
                                                                            <div className="cell-line cell-line-subj" style={{ fontSize: '7.4pt' }}>
                                                                                {displaySubj}{displayComp ? ` (${displayComp})` : ''}
                                                                            </div>
                                                                            {profFormatted && (
                                                                                <div className="cell-line cell-line-prof" style={{ fontSize: '6.8pt' }}>
                                                                                    {profFormatted}
                                                                                </div>
                                                                            )}
                                                                            <div className="cell-line cell-line-room-sec" style={{ fontSize: '6.5pt' }}>
                                                                                {secDisplay || roomDisplay}
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <div className="cell-line cell-line-subj">
                                                                                {displaySubj}
                                                                            </div>
                                                                            {displayComp && (
                                                                                <div className="cell-line cell-line-comp">
                                                                                    ({displayComp})
                                                                                </div>
                                                                            )}
                                                                            {profFormatted && (
                                                                                <div className="cell-line cell-line-prof">
                                                                                    {profFormatted}
                                                                                </div>
                                                                            )}
                                                                            <div className="cell-line cell-line-room">
                                                                                {roomDisplay}
                                                                            </div>
                                                                            {secDisplay && (
                                                                                <div className="cell-line cell-line-sec" style={{ fontWeight: '600' }}>
                                                                                    {secDisplay}
                                                                                </div>
                                                                            )}
                                                                        </>
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

                    {/* Official 3-Column Signatories */}
                    <div className="room-util-signatures">
                        <div className="sig-block">
                            <div className="sig-label">Prepared by:</div>
                            <div className="sig-name">CHERILYN G. VILLASIS</div>
                            <div className="sig-title">Department Secretary</div>
                        </div>
                        <div className="sig-block">
                            <div className="sig-label">Noted:</div>
                            <div className="sig-name">{chairInfo.chairName}</div>
                            <div className="sig-title">{chairInfo.title || 'Program Coordinator'}</div>
                        </div>
                        <div className="sig-block">
                            <div className="sig-label">Approved:</div>
                            <div className="sig-name">RAMY LLOYD L. LOTILLA, EdD</div>
                            <div className="sig-title">Satellite College Director</div>
                        </div>
                    </div>
                </div>

                {/* Official CAPSU Full-Bleed Footer */}
                <footer className="room-util-footer">
                    {!footerImgFailed ? (
                        <img
                            src={CAPSU_FOOTER_SRC}
                            alt="NQA ISO 9001 UKAS — Poblacion Proper, Mambusao, Capiz 5807 — RISE CAPSU, RISE CAPIZ"
                            className="room-util-footer-img"
                            onError={() => setFooterImgFailed(true)}
                        />
                    ) : (
                        <div className="room-util-footer-fallback">
                            <div>
                                <div>Poblacion Proper, Mambusao, Capiz 5807</div>
                                <div>(036) 633-0403 &nbsp;|&nbsp; www.capsu.edu.ph &nbsp;|&nbsp; mambusao@capsu.edu.ph</div>
                            </div>
                            <div className="footer-slogan">RISE CAPSU, RISE CAPIZ</div>
                        </div>
                    )}
                </footer>
            </div>
        </div>
    );
};

export default PrintableRoomUtilization;
