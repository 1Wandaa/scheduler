import React from 'react';

const RoomTable = ({ roomList, onEdit, onDelete }) => {
  const getRoomTypeBadge = (room) => {
    let bg = 'var(--success-bg)';
    let color = 'var(--success)';
    let icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>;

    if (room.type === 'lab') {
      bg = 'var(--warning-bg)';
      color = 'var(--warning)';
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>;
    }

    const facilities = [];
    if (room.hasComputers) facilities.push({ name: 'Computers', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg> });
    if (room.isFoodLab) facilities.push({ name: 'Food Lab', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg> });

    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: bg,
          color: color,
          padding: '4px 10px', 
          borderRadius: '16px', 
          fontSize: '0.75rem', 
          fontWeight: '700', 
          textTransform: 'capitalize',
          border: `1px solid ${color}40`,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          {icon}
          {room.type}
        </span>
        
        {facilities.length > 0 && (
          <div style={{ display: 'flex', gap: '6px' }}>
            {facilities.map(f => (
              <span key={f.name} style={{ 
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.7rem', 
                color: '#475569', 
                background: '#f8fafc',
                border: '1px solid #cbd5e1', 
                padding: '4px 10px', 
                borderRadius: '16px',
                fontWeight: '600',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}>
                <span style={{ color: '#64748b', display: 'flex' }}>{f.icon}</span>
                {f.name}
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
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '0.75rem', padding: '4px 12px', borderRadius: '16px', fontWeight: 700,
                background: (r.department && r.department !== 'SHARED')
                  ? 'linear-gradient(135deg, #EEF2FF, #E0E7FF)' : '#F1F5F9',
                color: (r.department && r.department !== 'SHARED') ? '#4338ca' : '#64748b',
                border: (r.department && r.department !== 'SHARED') ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}>
                {(r.department && r.department !== 'SHARED') ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
                )}
                {r.department || 'SHARED'}
              </span>
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontWeight: 500, fontSize: '0.85rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>
                {r.building || 'Unassigned'}
              </div>
            </td>
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
