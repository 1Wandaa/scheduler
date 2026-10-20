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
                    unit: current.subject?.hasLecLab ? (comp === 'Lecture' ? (Number(current.subject.lectureHours) || 2) : (Number(current.subject.labHours) || 3)) : (current.subject?.credits || current.subject?.units || current.subject?.totalUnits || 3),
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
                        const sHours = Number(s.hours) || (s.subject?.hasLecLab ? (s.component === 'Lecture' ? ((Number(s.subject.lectureHours) || 2) / 2) : ((Number(s.subject.labHours) || 3) / 2)) : (Number(s.subject?.hoursPerMeeting) || 1.5));
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

    return (
        <div className="printable-room-utilization-wrapper" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginTop: '24px' }}>
            <div className="printable-room-utilization" style={{ 
                fontFamily: '"Times New Roman", Times, serif', 
                color: '#000', 
                background: '#fff', 
                width: '100%', 
                maxWidth: '8.5in', 
                margin: '0 auto', 
                padding: '24px 36px', 
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100%',
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
                border: '1px solid #e2e8f0',
                borderRadius: '6px'
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
                    height: 25px; /* Minimum height for a 30-min block */
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
                    .printable-room-utilization-wrapper {
                        zoom: 0.5;
                        margin-top: 16px !important;
                    }
                    .printable-room-utilization {
                        min-width: 680px !important;
                        padding: 12px 16px !important;
                        box-shadow: none !important;
                        border: 1px solid #e2e8f0 !important;
                    }
                }
                @media print {
                    @page {
                        size: letter portrait;
                        margin: 0.2in 0.25in;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        box-sizing: border-box !important;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #fff !important;
                        color: #000 !important;
                        height: auto !important;
                        min-height: 0 !important;
                        overflow: hidden !important;
                    }
                    body * {
                        visibility: hidden;
                    }
                    .printable-room-utilization-wrapper,
                    .printable-room-utilization,
                    .printable-room-utilization * {
                        visibility: visible;
                    }
                    .printable-room-utilization-wrapper {
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        display: block !important;
                        zoom: 1 !important;
                    }
                    .printable-room-utilization {
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        display: block !important;
                        box-shadow: none !important;
                        border: none !important;
                        border-radius: 0 !important;
                        page-break-inside: avoid !important;
                        page-break-after: avoid !important;
                        break-inside: avoid !important;
                        break-after: avoid !important;
                    }
                    .room-util-header {
                        display: flex !important;
                        justify-content: flex-start !important;
                        align-items: center !important;
                        padding-bottom: 4px !important;
                        margin-bottom: 8px !important;
                        border-bottom: 2.5px solid #f2a900 !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .room-util-header img {
                        height: 50px !important;
                        object-fit: contain !important;
                        margin-right: 12px !important;
                    }
                    .room-util-header-text .republic {
                        font-size: 8pt !important;
                        line-height: 1.15 !important;
                    }
                    .room-util-header-text .univ {
                        font-size: 13.5pt !important;
                        font-weight: bold !important;
                        color: #002060 !important;
                        letter-spacing: 0.5px !important;
                        line-height: 1.15 !important;
                    }
                    .room-util-header-text .campus {
                        font-size: 9pt !important;
                        color: #002060 !important;
                        font-weight: bold !important;
                        line-height: 1.15 !important;
                    }
                    .room-util-titles {
                        text-align: center !important;
                        margin-bottom: 6px !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .room-util-titles h2 {
                        font-size: 10.5pt !important;
                        font-weight: bold !important;
                        color: #2e5296 !important;
                        text-transform: uppercase !important;
                        margin: 0 0 2px 0 !important;
                        line-height: 1.15 !important;
                    }
                    .room-util-titles h3 {
                        font-size: 10.5pt !important;
                        font-weight: bold !important;
                        margin: 0 0 2px 0 !important;
                        line-height: 1.15 !important;
                    }
                    .room-util-titles p {
                        font-size: 8.5pt !important;
                        margin: 0 !important;
                        line-height: 1.15 !important;
                    }
                    .room-util-room-name-wrapper {
                        margin-bottom: 6px !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .room-util-room-name {
                        font-size: 9.5pt !important;
                        font-weight: bold !important;
                        padding: 2px 8px !important;
                        background-color: #ffff00 !important;
                        border: 1px solid #000 !important;
                        display: inline-block !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .room-util-subjects-wrapper {
                        margin-bottom: 8px !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .room-util-subjects {
                        width: 100% !important;
                        font-size: 7.5pt !important;
                        border-collapse: collapse !important;
                        border: 1px solid #000 !important;
                        table-layout: fixed !important;
                    }
                    .room-util-subjects th,
                    .room-util-subjects td {
                        border: 1px solid #000 !important;
                        padding: 2.5px 4px !important;
                        line-height: 1.15 !important;
                        box-sizing: border-box !important;
                        text-align: center !important;
                    }
                    .room-util-subjects th {
                        font-weight: bold !important;
                        background-color: #f2f2f2 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .room-util-timetable-wrapper {
                        margin-bottom: 8px !important;
                        overflow: visible !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .room-util-timetable {
                        min-width: unset !important;
                        width: 100% !important;
                        font-size: 7.5pt !important;
                        border-collapse: collapse !important;
                        table-layout: fixed !important;
                        border: 1px solid #000 !important;
                        flex: none !important;
                    }
                    .room-util-timetable th,
                    .room-util-timetable td {
                        border: 1px solid #000 !important;
                        padding: 0 !important;
                        text-align: center !important;
                        vertical-align: middle !important;
                        box-sizing: border-box !important;
                    }
                    .room-util-timetable th {
                        font-size: 7.5pt !important;
                        font-weight: bold !important;
                        padding: 2px 2px !important;
                        background-color: #f2f2f2 !important;
                        height: 19px !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .room-util-timetable td {
                        height: 19px !important;
                        max-height: 19px !important;
                        line-height: 1.1 !important;
                    }
                    .room-util-timetable .time-col,
                    .room-util-timetable .time-cell {
                        position: static !important;
                        font-size: 7.5pt !important;
                        font-weight: bold !important;
                        padding: 1px 2px !important;
                        background-color: #f8fafc !important;
                        width: 13% !important;
                        min-width: 80px !important;
                        border: 1px solid #000 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .room-util-timetable th.time-header {
                        position: static !important;
                    }
                    .room-util-timetable tr.hour-row td:not(.time-cell):not(.scheduled-cell) {
                        border-bottom: none !important;
                    }
                    .room-util-timetable tr.half-hour-row td:not(.time-cell):not(.scheduled-cell) {
                        border-top: none !important;
                    }
                    .room-util-timetable td.scheduled-cell,
                    .room-util-timetable td.cell-scheduled {
                        background-color: #00b0f0 !important;
                        border: 1px solid #000 !important;
                        color: #000 !important;
                        font-weight: bold !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .room-util-timetable .cell-content {
                        display: flex !important;
                        flex-direction: column !important;
                        justify-content: center !important;
                        align-items: center !important;
                        width: 100% !important;
                        height: 100% !important;
                        padding: 1px 2px !important;
                        box-sizing: border-box !important;
                        overflow: hidden !important;
                    }
                    .room-util-timetable .cell-line {
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        max-width: 100% !important;
                        text-align: center !important;
                    }
                    .room-util-timetable .cell-line-subj {
                        font-size: 7.5pt !important;
                        font-weight: bold !important;
                        line-height: 1.1 !important;
                    }
                    .room-util-timetable .cell-line-comp {
                        font-size: 6.5pt !important;
                        line-height: 1.0 !important;
                        font-weight: normal !important;
                        color: #111 !important;
                    }
                    .room-util-timetable .cell-line-prof {
                        font-size: 7pt !important;
                        font-weight: 600 !important;
                        line-height: 1.1 !important;
                    }
                    .room-util-timetable .cell-line-room,
                    .room-util-timetable .cell-line-sec,
                    .room-util-timetable .cell-line-room-sec {
                        font-size: 6.5pt !important;
                        line-height: 1.05 !important;
                    }
                    .room-util-signatures {
                        display: flex !important;
                        justify-content: space-between !important;
                        margin-top: 10px !important;
                        padding: 0 10px !important;
                        font-family: Arial, "Times New Roman", Times, serif !important;
                        font-size: 8.5pt !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                        page-break-inside: avoid !important;
                        page-break-after: avoid !important;
                        break-inside: avoid !important;
                    }
                    .sig-block {
                        text-align: left !important;
                        flex: 1 !important;
                        max-width: 32% !important;
                    }
                    .sig-label {
                        margin-bottom: 14px !important;
                        font-size: 8.5pt !important;
                    }
                    .sig-name {
                        font-weight: bold !important;
                        text-decoration: underline !important;
                        display: inline-block !important;
                        font-size: 9.5pt !important;
                    }
                    .sig-title {
                        font-size: 8pt !important;
                        margin-top: 1px !important;
                    }
                }
            `}</style>

            {/* Header matching PDF and ExportOptions */}
            <div className="room-util-header" style={{ display: 'flex', alignItems: 'center', borderBottom: '2.5px solid #f2a900', paddingBottom: '4px', marginBottom: '8px' }}>
                <img src="/download.jpg" alt="University Logo" style={{ height: '50px', marginRight: '12px', objectFit: 'contain' }} />
                <div className="room-util-header-text" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span className="republic" style={{ fontSize: '8pt', fontFamily: 'Arial, sans-serif', lineHeight: 1.15 }}>Republic of the Philippines</span>
                    <span className="univ" style={{ fontSize: '13.5pt', fontWeight: 'bold', color: '#002060', fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px', lineHeight: 1.15 }}>CAPIZ STATE UNIVERSITY</span>
                    <span className="campus" style={{ fontSize: '9pt', fontWeight: 'bold', color: '#002060', fontFamily: 'Arial, sans-serif', lineHeight: 1.15 }}>MAMBUSAO SATELLITE COLLEGE</span>
                </div>
            </div>

            {/* Titles dynamically resolved */}
            <div className="room-util-titles" style={{ textAlign: 'center', marginBottom: '6px' }}>
                <h2 style={{ fontFamily: 'Arial, sans-serif', color: '#2e5296', fontSize: '10.5pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '0 0 2px 0', lineHeight: 1.15 }}>{fullDepartmentName}</h2>
                <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', margin: '0 0 2px 0', lineHeight: 1.15 }}>Room Utilization</h3>
                <p style={{ fontSize: '8.5pt', margin: '0', lineHeight: 1.15 }}>{semesterInfo || "First Semester, School Year 2026-2027"}</p>
            </div>

            {/* Room Name */}
            <div className="room-util-room-name-wrapper" style={{ marginBottom: '6px', paddingLeft: '5px' }}>
                <span className="room-util-room-name" style={{ fontSize: '9.5pt', fontWeight: 'bold', backgroundColor: '#ffff00', padding: '2px 8px', display: 'inline-block', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', border: '1px solid #000' }}>Room: {roomName || 'N/A'}</span>
            </div>

            {/* Subjects Table */}
            <div className="room-util-subjects-wrapper" style={{ width: '100%', overflowX: 'auto', marginBottom: '8px' }}>
                <table className="room-util-subjects" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '15%', border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center', fontWeight: 'bold' }}>Subject</th>
                            <th style={{ width: '35%', border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center', fontWeight: 'bold' }}>Description</th>
                            <th style={{ width: '10%', border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center', fontWeight: 'bold' }}>Unit</th>
                            <th style={{ width: '20%', border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center', fontWeight: 'bold' }}>Faculty</th>
                            <th style={{ width: '20%', border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center', fontWeight: 'bold' }}>Course/Section</th>
                        </tr>
                    </thead>
                    <tbody>
                        {uniqueSubjectsList.length > 0 ? (
                            uniqueSubjectsList.map((subj, i) => (
                                <tr key={i}>
                                    <td style={{ border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center' }}>{subj.code}</td>
                                    <td style={{ border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center' }}>{subj.description}</td>
                                    <td style={{ border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center' }}>{subj.unit}</td>
                                    <td style={{ border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center' }}>{subj.faculty}</td>
                                    <td style={{ border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center' }}>{subj.sections}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="5" style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>No subjects assigned</td>
                            </tr>
                        )}
                        {uniqueSubjectsList.length > 0 && (
                            <tr>
                                <td colSpan="2" style={{ border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center', fontWeight: 'bold' }}>Total</td>
                                <td style={{ border: '1px solid #000', padding: '2.5px 4px', textAlign: 'center', fontWeight: 'bold' }}>{totalUnits}</td>
                                <td colSpan="2" style={{ border: '1px solid #000', padding: '2.5px 4px' }}></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Timetable Grid with responsive horizontal scroll and sticky time header */}
            <div className="room-util-timetable-wrapper" style={{ width: '100%', marginBottom: '8px' }}>
                <table className="room-util-timetable" style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '7.5pt', tableLayout: 'fixed', flex: 'none' }}>
                    <thead>
                        <tr>
                            <th className="time-header" style={{ border: '1px solid #000', padding: '2px 2px', width: '13%', fontWeight: 'bold', height: '19px', fontSize: '7.5pt' }}>Time</th>
                            {displayDays.map(day => (
                                <th key={day} style={{ border: '1px solid #000', padding: '2px 2px', fontWeight: 'bold', height: '19px', fontSize: '7.5pt' }}>{day}</th>
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
                                        <td className="time-cell time-col" rowSpan={timeRowSpan} style={{ border: '1px solid #000', padding: '1px 2px', textAlign: 'center', fontWeight: 'bold', fontSize: '7.5pt' }}>
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
                                                    padding: '1px 2px', 
                                                    textAlign: 'center', 
                                                    verticalAlign: 'middle',
                                                    height: '19px',
                                                    backgroundColor: isScheduled ? '#00b0f0' : 'transparent',
                                                    WebkitPrintColorAdjust: 'exact',
                                                    printColorAdjust: 'exact',
                                                    fontWeight: isScheduled ? 'bold' : 'normal',
                                                    color: '#000'
                                                }}
                                            >
                                                {cellSchedules.map((cls, idx) => {
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
                                                            style={{ 
                                                                display: 'flex', 
                                                                flexDirection: 'column', 
                                                                justifyContent: 'center', 
                                                                alignItems: 'center', 
                                                                lineHeight: 1.1,
                                                                padding: '1px 2px',
                                                                marginTop: idx > 0 ? '1px' : '0',
                                                                borderTop: idx > 0 ? '1px solid #000' : 'none',
                                                                color: '#000',
                                                                boxSizing: 'border-box',
                                                                overflow: 'hidden'
                                                            }}
                                                        >
                                                            {effectiveSpan === 1 ? (
                                                                <>
                                                                    <div className="cell-line cell-line-subj" style={{ fontWeight: 'bold', fontSize: '7.5pt', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                                        {displaySubj}{displayComp ? ` (${displayComp})` : ''}
                                                                    </div>
                                                                    {profFormatted && (
                                                                        <div className="cell-line cell-line-prof" style={{ fontSize: '6.5pt', fontWeight: '600', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                                            {profFormatted}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : effectiveSpan === 2 ? (
                                                                <>
                                                                    <div className="cell-line cell-line-subj" style={{ fontWeight: 'bold', fontSize: '7.5pt', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                                        {displaySubj}{displayComp ? ` (${displayComp})` : ''}
                                                                    </div>
                                                                    {profFormatted && (
                                                                        <div className="cell-line cell-line-prof" style={{ fontSize: '7pt', fontWeight: '600', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                                            {profFormatted}
                                                                        </div>
                                                                    )}
                                                                    <div className="cell-line cell-line-room-sec" style={{ fontSize: '6.5pt', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                                        {secDisplay || roomDisplay}
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <div className="cell-line cell-line-subj" style={{ fontWeight: 'bold', fontSize: '8pt', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                                        {displaySubj}
                                                                    </div>
                                                                    {displayComp && (
                                                                        <div className="cell-line cell-line-comp" style={{ fontSize: '7pt', lineHeight: 1.05, fontWeight: 'normal', color: '#111' }}>
                                                                            ({displayComp})
                                                                        </div>
                                                                    )}
                                                                    {profFormatted && (
                                                                        <div className="cell-line cell-line-prof" style={{ fontSize: '7.5pt', fontWeight: '600', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', marginTop: '1px' }}>
                                                                            {profFormatted}
                                                                        </div>
                                                                    )}
                                                                    <div className="cell-line cell-line-room" style={{ fontSize: '7pt', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', marginTop: '1px' }}>
                                                                        {roomDisplay}
                                                                    </div>
                                                                    {secDisplay && (
                                                                        <div className="cell-line cell-line-sec" style={{ fontSize: '7pt', fontWeight: '600', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', marginTop: '1px' }}>
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

            {/* Signatures */}
            <div className="room-util-signatures" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px', marginTop: '10px', fontSize: '8.5pt', width: '100%', boxSizing: 'border-box' }}>
                <div className="sig-block" style={{ textAlign: 'left', flex: 1, maxWidth: '32%' }}>
                    <div className="sig-label" style={{ marginBottom: '14px' }}>Prepared by:</div>
                    <div className="sig-name" style={{ fontWeight: 'bold', textDecoration: 'underline', display: 'inline-block', fontSize: '9.5pt' }}>CHERILYN G. VILLASIS</div>
                    <div className="sig-title" style={{ fontSize: '8pt', marginTop: '1px' }}>Department Secretary</div>
                </div>
                <div className="sig-block" style={{ textAlign: 'left', flex: 1, maxWidth: '32%' }}>
                    <div className="sig-label" style={{ marginBottom: '14px' }}>Noted:</div>
                    <div className="sig-name" style={{ fontWeight: 'bold', textDecoration: 'underline', display: 'inline-block', fontSize: '9.5pt' }}>{chairInfo.chairName}</div>
                    <div className="sig-title" style={{ fontSize: '8pt', marginTop: '1px' }}>{chairInfo.title || 'Program Coordinator'}</div>
                </div>
                <div className="sig-block" style={{ textAlign: 'left', flex: 1, maxWidth: '32%' }}>
                    <div className="sig-label" style={{ marginBottom: '14px' }}>Approved:</div>
                    <div className="sig-name" style={{ fontWeight: 'bold', textDecoration: 'underline', display: 'inline-block', fontSize: '9.5pt' }}>RAMY LLOYD L. LOTILLA, EdD</div>
                    <div className="sig-title" style={{ fontSize: '8pt', marginTop: '1px' }}>Satellite College Director</div>
                </div>
            </div>
        </div>
        </div>
    );
};

export default PrintableRoomUtilization;

