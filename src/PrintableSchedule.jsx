import React from 'react';
import './PrintableSchedule.css';

const PrintableSchedule = ({ scheduleItems, sectionName, semesterInfo }) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Create a sorted list of unique time slots from the schedule data
    const timeSlots = Array.from(new Set(scheduleItems.map(item => item.timeSlot.label))).sort();

    // Helper to find class at a specific day/time
    const getClass = (day, timeLabel) => {
        return scheduleItems.find(s => s.day === day && s.timeSlot.label === timeLabel);
    };

    return (
        <div className="printable-iso-document">

            {/* ISO 9001:2015 Document Header */}
            <table className="iso-header-table">
                <tbody>
                    <tr>
                        <td rowSpan="3" className="center" style={{ width: '15%' }}>
                            <strong>[ LOGO ]</strong><br />
                            Capiz State University
                        </td>
                        <td className="bold" style={{ width: '20%' }}>Document Type:</td>
                        <td className="bold" style={{ width: '30%' }}>DOCUMENTED INFORMATION</td>
                        <td style={{ width: '15%' }}>Document Code</td>
                        <td style={{ width: '20%' }}>INS-CLS-08</td>
                    </tr>
                    <tr>
                        <td className="bold">ISO 9001:2015</td>
                        <td></td>
                        <td>Revision No.</td>
                        <td>00</td>
                    </tr>
                    <tr>
                        <td className="bold">Document Title:</td>
                        <td className="bold center" style={{ fontSize: '12pt' }}>CLASS SCHEDULE</td>
                        <td>Effective Date</td>
                        <td>June 25, 2018</td>
                    </tr>
                </tbody>
            </table>

            {/* Degree & Section Meta */}
            <div className="meta-info">
                DEGREE PROGRAM: Bachelor of Science in Computer Science &nbsp;&nbsp;&nbsp;
                COURSE & YEAR: {sectionName || 'N/A'} &nbsp;&nbsp;&nbsp;
                SEMESTER & AY: {semesterInfo || '1ST Sem 2025-2026'}
            </div>

            {/* Schedule Table */}
            <table className="iso-schedule-table">
                <thead>
                    <tr>
                        <th>TIME</th>
                        {days.map(day => (
                            <th key={day}>{day.toUpperCase()}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {timeSlots.map((timeLabel, index) => {

                        // Insert Lunch Break visually if time transitions past 12:00
                        const isAfterLunch = timeLabel.includes('1:00') || timeLabel.includes('1:30');
                        const prevWasMorning = index > 0 && (timeSlots[index - 1].includes('11:') || timeSlots[index - 1].includes('12:'));

                        return (
                            <React.Fragment key={timeLabel}>
                                {isAfterLunch && prevWasMorning && (
                                    <tr>
                                        <td colSpan="6" className="lunch-break">LUNCH BREAK</td>
                                    </tr>
                                )}
                                <tr>
                                    <td className="bold" style={{ whiteSpace: 'nowrap' }}>{timeLabel}</td>
                                    {days.map(day => {
                                        const cls = getClass(day, timeLabel);
                                        return (
                                            <td key={`${day}-${timeLabel}`}>
                                                {cls ? (
                                                    <div>
                                                        <div style={{ fontWeight: 'bold' }}>{cls.subject.code}</div>
                                                        <div style={{ fontSize: '9pt' }}>{cls.room.name}</div>
                                                        <div style={{ fontSize: '9pt', fontStyle: 'italic' }}>Prof. {cls.professor.name}</div>
                                                    </div>
                                                ) : null}
                                            </td>
                                        );
                                    })}
                                </tr>
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>

            {/* Footer / Signatures could go here if needed in the future */}
            <div style={{ marginTop: '40px', fontSize: '10pt', display: 'flex', justifyContent: 'space-between' }}>
                <div>Prepared by: ________________________</div>
                <div>Approved by: ________________________</div>
            </div>

        </div>
    );
};

export default PrintableSchedule;