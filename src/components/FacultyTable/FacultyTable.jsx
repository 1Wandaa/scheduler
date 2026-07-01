import React from 'react';
import { getDeptColor } from '../../config/constants';

const professorIdOf = (s) => s?.professor?.id ?? s?.professorId ?? null;
const matchesProfessor = (s, professor) => professorIdOf(s) != null && String(professorIdOf(s)) === String(professor?.id);

const FacultyTable = ({ facultyList, subjects = [], schedules = [], departments = [], onEdit, onDelete }) => {
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
          <th>Units</th>
          <th>Subjects</th>
          <th>Sections</th>
          <th>Rooms</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {facultyList.map(p => {
          // Calculate units based on assigned subjects (specialization)
          const assignedSubjectIds = p.specialization || [];
          const currentUnits = subjects
            .filter(sub => assignedSubjectIds.includes(sub.id) || assignedSubjectIds.includes(sub.code) || assignedSubjectIds.includes(sub.name))
            .reduce((sum, sub) => sum + (Number(sub.credits) || 3), 0);
          
          const maxUnits = p.maxUnits || p.maxHours || 12;
          const utilization = (currentUnits / maxUnits) * 100;
          
          let statusColor = 'var(--success)';
          let statusBg = 'var(--success-bg)';
          if (utilization > 100) { 
            statusColor = 'var(--danger)'; 
            statusBg = 'var(--danger-bg)';
          } else if (utilization >= 80) { 
            statusColor = 'var(--warning)';
            statusBg = 'var(--warning-bg)';
          }

          return (
            <tr key={p.id}>
              <td><strong style={{ color: 'var(--text-main)' }}>{p.formattedName}</strong></td>
              <td>
                {(() => {
                  const color = departments?.find(d => d.id === p.department)?.color || getDeptColor(p.department);
                  const isVar = color && color.startsWith('var');
                  return (
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: color,
                      backgroundColor: isVar ? 'transparent' : `${color}26`,
                      border: isVar ? `1px solid ${color}` : `1px solid ${color}66`
                    }}>
                      {p.department}
                    </span>
                  );
                })()}
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '120px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{currentUnits} <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>/ {maxUnits}</span></span>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      padding: '2px 6px', 
                      borderRadius: '10px', 
                      background: statusBg, 
                      color: statusColor,
                      fontWeight: '700'
                    }}>
                      {Math.round(utilization)}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${Math.min(utilization, 100)}%`, 
                      height: '100%', 
                      background: statusColor,
                      borderRadius: '3px',
                      transition: 'width 0.3s ease'
                    }}></div>
                  </div>
                </div>
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
          );
        })}
      </tbody>
    </table>
  );
};

export default FacultyTable;
