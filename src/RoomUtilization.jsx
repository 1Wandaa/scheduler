import React, { useState } from 'react';
import ScheduleTable from './ScheduleTable';

function RoomUtilization({ rooms, schedules }) {
    const [selectedRoomId, setSelectedRoomId] = useState(rooms.length > 0 ? rooms[0].id : '');

    // Filter schedules to ONLY show classes assigned to the selected room
    const filteredSchedules = schedules.filter(s => s.room.id === selectedRoomId);
    const activeRoom = rooms.find(r => r.id === selectedRoomId);

    return (
        <div className="card" style={{ animation: 'fadeIn 0.5s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                    <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                        Room Utilization Analyzer
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Select a room to view its dedicated occupancy schedule</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-muted)' }}>Target Room:</label>
                    <select
                        value={selectedRoomId}
                        onChange={(e) => setSelectedRoomId(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--accent-primary)', backgroundColor: 'var(--success-bg)', color: 'var(--accent-dark)', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}
                    >
                        {rooms.map(room => (
                            <option key={room.id} value={room.id}>
                                {room.id} - {room.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Render the Master Schedule but pass the FILTERED schedules and a dynamic title */}
            <ScheduleTable
                schedules={filteredSchedules}
                title={`UTILIZATION REPORT: ${activeRoom ? activeRoom.name.toUpperCase() : 'SELECT ROOM'}`}
            />
        </div>
    );
}

export default RoomUtilization;