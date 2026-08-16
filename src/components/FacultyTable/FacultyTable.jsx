import React from 'react';
import { getDeptColor } from '../../config/constants';

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
    <div className="table-responsive">
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
            // Calculate units based on actual scheduled subject sections
            const professorIdOf = (s) => s?.professor?.id ?? s?.professorId ?? null;
            const matchesProfessor = (s, professor) => professorIdOf(s) != null && String(professorIdOf(s)) === String(professor?.id);
            const profSchedules = (schedules || []).filter(s => matchesProfessor(s, p));
            
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
            
            // For displaying assigned subjects count
            const assignedSubjectIds = p.specialization || [];
            const currentSubjects = subjects.filter(sub => assignedSubjectIds.includes(sub.id) || assignedSubjectIds.includes(sub.code) || assignedSubjectIds.includes(sub.name));
            
            const maxUnits = p.maxUnits || p.maxHours || 12;
            const utilization = maxUnits > 0 ? (currentUnits / maxUnits) * 100 : 0;
            
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
                        borderRadius: '3px'
                      }}></div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {currentSubjects.length} subject{currentSubjects.length !== 1 ? 's' : ''}
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {(p.assignedSections || []).length} section{(p.assignedSections || []).length !== 1 ? 's' : ''}
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {(p.preferredRooms || []).length} room{(p.preferredRooms || []).length !== 1 ? 's' : ''}
                </td>
                <td className="table-actions">
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button 
                    className="btn-edit"
                    onClick={() => onEdit(p)} 
                    title="Edit"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  </button>
                  <button 
                    className="btn-delete"
                    onClick={() => onDelete(p.id)} 
                    title="Delete"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                </div>
              </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default FacultyTable;
