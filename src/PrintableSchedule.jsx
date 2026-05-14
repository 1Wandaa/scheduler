import React from 'react';
import './PrintableSchedule.css';

const PrintableSchedule = ({ scheduleItems, sectionName, semesterInfo }) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // FIX: Extract unique time slots and sort them chronologically by their ID
    const uniqueSlotsMap = new Map();
    scheduleItems.forEach(item => {
        if (item.timeSlot && item.timeSlot.label) {
            uniqueSlotsMap.set(item.timeSlot.label, item.timeSlot.id);
        }
    });

    // Parse time strings (e.g. "7:30 AM") into minutes for chronological sorting
    const parseTime = (timeStr) => {
        const parts = timeStr.trim().split(' ');
        if (parts.length < 2) return 0;
        let [h, m] = parts[0].split(':').map(Number);
        if (parts[1].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (parts[1].toUpperCase() === 'AM' && h === 12) h = 0;
        return h * 60 + m;
    };

    // Sort chronologically based on the actual start time
    const timeSlots = Array.from(uniqueSlotsMap.keys())
        .sort((a, b) => {
            const startA = parseTime(a.split('-')[0]);
            const startB = parseTime(b.split('-')[0]);
            return startA - startB;
        });

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

                        return (
                            <React.Fragment key={timeLabel}>
                                <tr>
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
                                            if (index < timeSlots.length - 1) {
                                                rowSpan = 2;
                                                window[`print_skip_${day}-${timeSlots[index + 1]}`] = true;
                                            }
                                        }

                                        return (
                                            {/* In PrintableSchedule.jsx, scroll down to the table cell rendering */ }

                                            < td key = { cellKey } rowSpan = { rowSpan } >
                                            {
                                                cls?(
        <div>
                                                {/* Added ?. to safely handle missing data without crashing */ }
                                                < div style = {{ fontWeight: 'bold' }
                                    }> { cls.subject?.code || 'N/A' }</div>
                                <div style={{ fontSize: '9pt' }}>{cls.room?.name || 'TBA'}</div>
                                <div style={{ fontSize: '9pt', fontStyle: 'italic' }}>Prof. {cls.professor?.name || 'TBA'}</div>
                            </div>
                        ) : null}
                </td>
                );
                                    })}
            </tr>
        </React.Fragment>
    );
})}
                </tbody >
            </table >

    {/* Footer / Signatures could go here if needed in the future */ }
    < div style = {{ marginTop: '40px', fontSize: '10pt', display: 'flex', justifyContent: 'space-between' }}>
                <div>Prepared by: ________________________</div>
                <div>Approved by: ________________________</div>
            </div >

        </div >
    );
};

export default PrintableSchedule;