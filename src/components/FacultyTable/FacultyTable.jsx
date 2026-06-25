import React from 'react';

const professorIdOf = (s) => s?.professor?.id ?? s?.professorId ?? null;
const matchesProfessor = (s, professor) => professorIdOf(s) != null && String(professorIdOf(s)) === String(professor?.id);

const FacultyTable = ({ facultyList, schedules = [], onEdit, onDelete }) => {
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
          <th>Workload</th>
          <th>Subjects</th>
          <th>Sections</th>
          <th>Rooms</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {facultyList.map(p => {
          // Calculate workload based on passed schedules
          const profSchedules = schedules.filter(s => matchesProfessor(s, p));
          const uniqueSubjectSections = new Map();
          for (const s of profSchedules) {
            const subjectId = s.subject?.id || s.subject?.code || 'unknown';
            const sectionId = s.section?.id || 'no-section';
            const key = `${subjectId}__${sectionId}`;
            if (!uniqueSubjectSections.has(key)) {
              uniqueSubjectSections.set(key, Number(s.subject?.credits) || 3);
            }
          }
          const currentUnits = Array.from(uniqueSubjectSections.values()).reduce((sum, c) => sum + c, 0);
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
              <td>{p.department}</td>
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
