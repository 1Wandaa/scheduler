import React, { useMemo } from 'react';
import { TIME_SLOTS, FOUR_DAY_TIME_SLOTS } from '../../config/constants';
import { slotsNeededFromIndex, getMeetingTimeLabel } from '../../utils/scheduleUtils';

const PrintableRoomUtilization = ({ scheduleItems = [], roomName = '', semesterInfo = '', scheduleMode = 'standard' }) => {
    const isFourDay = scheduleMode === 'fourDay';
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const activeTimeSlots = isFourDay ? FOUR_DAY_TIME_SLOTS : TIME_SLOTS;

    // Compute unique subjects assigned to this room
    const uniqueSubjectsMap = useMemo(() => {
        const map = new Map();
        scheduleItems.forEach(s => {
            if (!s.subject) return;
            const code = s.subject.code || 'Unknown';
            if (!map.has(code)) {
                map.set(code, {
                    code: code,
                    description: s.subject.description || s.subject.name || 'N/A',
                    unit: s.subject.units || s.subject.totalUnits || 3,
                    faculty: s.professor?.name || 'TBA',
                    sections: new Set()
                });
            }
            if (s.section?.name) {
                map.get(code).sections.add(s.section.name);
            }
        });
        
        return Array.from(map.values()).map(item => ({
            ...item,
            sections: Array.from(item.sections).sort().join(', ') || 'N/A'
        }));
    }, [scheduleItems]);

    // O(1) cell lookup map
    const scheduleGridMap = useMemo(() => {
        const map = new Map();
        scheduleItems.forEach(s => {
            if (!s.day || !s.timeSlot?.id) return;
            const key = `${s.day}-${s.timeSlot.id}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(s);
        });
        return map;
    }, [scheduleItems]);

    // Pre-calculate cell span mapping & skipped multi-slot cells
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
                    const needed = slotsNeededFromIndex(tIdx, s.subject?.hoursPerMeeting, scheduleMode);
                    if (needed > rowSpan) rowSpan = needed;
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
            `}</style>

            {/* Header matching PDF precisely */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '3px solid #f2a900', paddingBottom: '10px', marginBottom: '15px' }}>
                <img src="/download.jpg" alt="University Logo" style={{ height: '75px', marginRight: '15px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: '9pt', fontFamily: 'Arial, sans-serif' }}>Republic of the Philippines</span>
                    <span style={{ fontSize: '15pt', fontWeight: 'bold', color: '#002060', fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }}>CAPIZ STATE UNIVERSITY</span>
                    <span style={{ fontSize: '10pt', fontWeight: 'bold', color: '#002060', fontFamily: 'Arial, sans-serif' }}>MAMBUSAO SATELLITE COLLEGE</span>
                </div>
            </div>

            {/* Titles */}
            <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                <h2 style={{ fontFamily: 'Arial, sans-serif', color: '#2e5296', fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '0 0 5px 0' }}>BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT</h2>
                <h3 style={{ fontSize: '12pt', fontWeight: 'bold', margin: '0 0 5px 0' }}>Room Utilization</h3>
                <p style={{ fontSize: '10pt', margin: '0' }}>{semesterInfo || "2nd Semester 2025-2026"}</p>
            </div>

            {/* Room Name */}
            <div style={{ marginBottom: '10px', paddingLeft: '5px' }}>
                <span style={{ fontSize: '11pt', fontWeight: 'bold', backgroundColor: '#ffff00', padding: '3px 8px', display: 'inline-block', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', border: '1px solid #000' }}>Room: {roomName || 'N/A'}</span>
            </div>

            {/* Subjects Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: '15px' }}>
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
                    {uniqueSubjectsMap.length > 0 ? (
                        uniqueSubjectsMap.map((subj, i) => (
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
                </tbody>
            </table>

            {/* Timetable Grid */}
            <table className="room-util-timetable" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '8pt', tableLayout: 'fixed', flex: 1 }}>
                <thead>
                    <tr>
                        <th style={{ border: '1px solid #000', padding: '6px', width: '12%', fontWeight: 'bold' }}>Time</th>
                        {days.map(day => (
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
                                    <td className="time-cell" rowSpan={timeRowSpan} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                                        {hourLabel}
                                    </td>
                                )}
                                {days.map(day => {
                                    const cellKey = `${day}-${timeSlot.id}`;
                                    if (skippedCellsSet.has(cellKey)) return null;

                                    const cellSchedules = scheduleGridMap.get(cellKey) || [];
                                    const rowSpan = cellSpanMap.get(cellKey) || 1;
                                    const cls = cellSchedules.length > 0 ? cellSchedules[0] : null;
                                    const isScheduled = !!cls;

                                    return (
                                        <td key={cellKey} rowSpan={rowSpan} className={isScheduled ? 'scheduled-cell' : ''} style={{ 
                                            padding: '4px', 
                                            textAlign: 'center', 
                                            verticalAlign: 'middle',
                                            backgroundColor: isScheduled ? '#00b0f0' : 'transparent',
                                            WebkitPrintColorAdjust: 'exact',
                                            printColorAdjust: 'exact',
                                            fontWeight: isScheduled ? 'bold' : 'normal'
                                        }}>
                                            {cls ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', lineHeight: '1.2' }}>
                                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{cls.subject?.code || 'N/A'}</div>
                                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{cls.professor?.name?.split(' ')?.map(n=>n[0])?.join('') + '.' + cls.professor?.name?.split(' ')?.pop() || 'TBA'}</div>
                                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{roomName || cls.room?.name || 'TBA'}</div>
                                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{cls.section?.name || 'N/A'}</div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', marginTop: '20px', fontSize: '9pt' }}>
                <div style={{ textAlign: 'left' }}>
                    <div style={{ marginBottom: '20px' }}>Prepared by:</div>
                    <div style={{ fontWeight: 'bold' }}>CHERILYN G. VILLASIS</div>
                    <div>Department Secretary</div>
                </div>
                <div style={{ textAlign: 'left' }}>
                    <div style={{ marginBottom: '20px' }}>Noted:</div>
                    <div style={{ fontWeight: 'bold' }}>JELLY L. PAREDES, EdD</div>
                    <div>Program Coordinator, BSCS</div>
                </div>
                <div style={{ textAlign: 'left' }}>
                    <div style={{ marginBottom: '20px' }}>Approved:</div>
                    <div style={{ fontWeight: 'bold' }}>RAMY LLOYD L. LOTILLA, EdD</div>
                    <div>Satellite College Director</div>
                </div>
            </div>
            
            <div style={{ marginTop: '30px' }}></div>
        </div>
    );
};

export default PrintableRoomUtilization;
