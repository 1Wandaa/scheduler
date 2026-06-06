import React from 'react';
import '../../styles/PrintableSchedule.css';

const PrintableSchedule = ({ scheduleItems, sectionName, semesterInfo }) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Using the exact time slots and order requested
    const fixedTimeSlots = [
        "7:30 - 8:30",
        "8:30 - 9:30",
        "9:30 - 10:30",
        "10:30 - 11:30",
        "11:30 - 12:00",
        "LUNCH", // Special row marker
        "1:00 - 2:00",
        "2:00 - 3:00",
        "3:00 - 4:00",
        "4:00 - 5:00"
    ];

    const getSlotId = (timeLabel) => {
        switch (timeLabel) {
            case "7:30 - 8:30": return 1;
            case "8:30 - 9:30": return 2;
            case "9:30 - 10:30": return 3;
            case "10:30 - 11:30": return 4;
            case "11:30 - 12:00": return 5;
            // id 6 is Lunch (12:00 - 1:00)
            case "1:00 - 2:00": return 7;
            case "2:00 - 3:00": return 8;
            case "3:00 - 4:00": return 9;
            case "4:00 - 5:00": return 10;
            default: return null;
        }
    };

    const getClass = (day, timeLabel) => {
        const slotId = getSlotId(timeLabel);
        return scheduleItems.find(s => s.day === day && s.timeSlot && parseInt(s.timeSlot.id) === slotId);
    };

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
                        {/* DOCUMENTED INFORMATION spans here */}
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
                        {/* CLASS SCHEDULE spans here */}
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
                                    <td colSpan="6" className="lunch-break center">
                                        LUNCH BREAK
                                    </td>
                                </tr>
                            );
                        }

                        return (
                            <tr key={timeLabel}>
                                <td className="bold" style={{ whiteSpace: 'nowrap' }}>{timeLabel}</td>
                                {days.map(day => {
                                    const cellKey = `${day}-${timeLabel}`;
                                    if (window[`print_skip_${cellKey}`]) {
                                        delete window[`print_skip_${cellKey}`];
                                        return null;
                                    }

                                    const cls = getClass(day, timeLabel);
                                    let rowSpan = 1;
                                    if (cls && cls.subject?.hoursPerMeeting === 2) {
                                        let nextIndex = index + 1;
                                        if (fixedTimeSlots[nextIndex] === "LUNCH") nextIndex++; // Skip the lunch row for spanning
                                        if (nextIndex < fixedTimeSlots.length) {
                                            rowSpan = 2;
                                            window[`print_skip_${day}-${fixedTimeSlots[nextIndex]}`] = true;
                                        }
                                    }

                                    return (
                                        <td key={cellKey} rowSpan={rowSpan}>
                                            {cls ? (
                                                <div>
                                                    <div style={{ fontWeight: 'bold' }}>{cls.subject?.code || 'N/A'}</div>
                                                    <div style={{ fontSize: '9pt' }}>{cls.professor?.name || 'TBA'}</div>
                                                    <div style={{ fontSize: '9pt' }}>{cls.room?.name || 'TBA'}</div>
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