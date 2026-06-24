import React from 'react';

const RoomTable = ({ roomList, onEdit, onDelete }) => {
  const getRoomTypeBadge = (room) => {
    let bg = 'var(--success-bg)';
    let color = 'var(--success)';

    if (room.type === 'lab') {
      bg = 'var(--warning-bg)';
      color = 'var(--warning)';
    }

    const facilities = [];
    if (room.hasComputers) facilities.push('Computers');

    return (
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span style={{
          background: bg,
          color: color,
          padding: '3px 8px', 
          borderRadius: '4px', 
          fontSize: '0.75rem', 
          fontWeight: '600', 
          textTransform: 'capitalize'
        }}>
          {room.type}
        </span>
        
        {facilities.length > 0 && (
          <div style={{ display: 'flex', gap: '6px' }}>
            {facilities.map(f => (
              <span key={f} style={{ 
                fontSize: '0.7rem', 
                color: 'var(--text-muted)', 
                border: '1px solid var(--border-color)', 
                padding: '2px 6px', 
                borderRadius: '4px' 
              }}>
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!roomList || roomList.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-main)' }}>
        <p style={{ fontSize: '1.1rem', marginBottom: '5px' }}>No rooms match your filters</p>
        <p style={{ fontSize: '0.85rem' }}>Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Dept Owner</th>
          <th>Building</th>
          <th>Type & Facilities</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {roomList.map(r => (
          <tr key={r.id}>
            <td><strong style={{ color: 'var(--text-main)' }}>{r.name}</strong></td>
            <td>
              <span style={{
                fontSize: '0.75rem', padding: '3px 10px', borderRadius: 6, fontWeight: 700,
                background: (r.department && r.department !== 'SHARED')
                  ? 'linear-gradient(135deg, #EEF2FF, #E0E7FF)' : '#F1F5F9',
                color: (r.department && r.department !== 'SHARED') ? '#4338ca' : '#64748b',
              }}>
                {r.department || 'SHARED'}
              </span>
            </td>
            <td>{r.building || 'Unassigned'}</td>
            <td>{getRoomTypeBadge(r)}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn-edit" onClick={() => onEdit(r)}>Edit</button>
              <button className="btn-delete" onClick={() => onDelete(r.id)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default RoomTable;
