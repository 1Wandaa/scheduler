import React from 'react';

const FacultyTable = ({ facultyList, onEdit, onDelete }) => {
  if (!facultyList || facultyList.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-main)' }}>
        <p style={{ fontSize: '1.1rem', marginBottom: '5px' }}>No faculty match your filters</p>
        <p style={{ fontSize: '0.85rem' }}>Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Department</th>
          <th>Max Load</th>
          <th>Subjects</th>
          <th>Sections</th>
          <th>Rooms</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {facultyList.map(p => (
          <tr key={p.id}>
            <td><strong style={{ color: 'var(--text-main)' }}>{p.formattedName}</strong></td>
            <td>{p.department}</td>
            <td>
              <span style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '600' }}>
                {p.maxUnits || p.maxHours || 12} units
              </span>
            </td>
            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {(p.specialization || []).length} subject{(p.specialization || []).length !== 1 ? 's' : ''}
            </td>
            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {(p.assignedSections || []).length} section{(p.assignedSections || []).length !== 1 ? 's' : ''}
            </td>
            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {(p.preferredRooms || []).length} room{(p.preferredRooms || []).length !== 1 ? 's' : ''}
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn-edit" onClick={() => onEdit(p)}>Edit</button>
              <button className="btn-delete" onClick={() => onDelete(p.id)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default FacultyTable;
