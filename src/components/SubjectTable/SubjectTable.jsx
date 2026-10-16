/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { getDeptColor } from '../../config/constants';

// Helper to display departments (handles both old string and new array format)
export const getSubjectDepts = (subject) => {
  if (Array.isArray(subject.departments) && subject.departments.length > 0) return subject.departments;
  if (subject.department) return [subject.department];
  return [];
};

const SubjectTable = ({ subjectList, title, titleColor = 'var(--accent-primary)', onEdit, onDelete, onViewDetails, departments = [], selectedIds = [], onToggleSelect, onToggleSelectAll }) => {
  if (!subjectList || subjectList.length === 0) return null;

  const allSelected = subjectList.length > 0 && subjectList.every(s => selectedIds.includes(s.id));
  const someSelected = subjectList.some(s => selectedIds.includes(s.id)) && !allSelected;
  const headerCheckboxRef = React.useRef(null);

  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <div style={{ marginBottom: '30px' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: '20px',
        marginTop: '15px'
      }}>
        <h4 style={{
          color: titleColor,
          margin: 0,
          padding: '10px 30px',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          fontWeight: '700',
          fontSize: '1.15rem',
          border: `2px solid ${titleColor}`,
          borderRadius: '30px',
          backgroundColor: 'transparent'
        }}>
          {title}
        </h4>
      </div>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              {onToggleSelect && (
                <th className="table-checkbox-col">
                  <input
                    type="checkbox"
                    ref={headerCheckboxRef}
                    className="data-checkbox"
                    checked={allSelected}
                    onChange={() => onToggleSelectAll && onToggleSelectAll(subjectList.map(s => s.id))}
                    title={allSelected ? "Deselect all in group" : "Select all in group"}
                  />
                </th>
              )}
              <th>Code</th>
              <th>Name</th>
              <th>Semester</th>
              <th>Department(s)</th>
              <th>Units</th>
              <th>Meeting Time</th>
              <th>Lab Required</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subjectList.map(s => {
              const isSelected = selectedIds.includes(s.id);
              return (
                <tr key={s.id} className={isSelected ? 'table-row-selected' : ''}>
                  {onToggleSelect && (
                    <td className="table-checkbox-col" data-label="Select">
                      <input
                        type="checkbox"
                        className="data-checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(s.id)}
                        aria-label={`Select ${s.code}`}
                      />
                    </td>
                  )}
                <td data-label="Code"><strong style={{ color: titleColor }}>{s.code}</strong></td>
                <td style={{ fontWeight: '500' }} data-label="Name">{s.name}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }} data-label="Semester">
                  {s.semester && s.semester !== 'Both' ? s.semester.replace(' Semester', ' Sem') : 'Both'}
                </td>
                <td data-label="Department(s)">
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {getSubjectDepts(s).length > 0 ? getSubjectDepts(s).map(dept => {
                      const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
                      return (
                        <span key={dept} style={{ 
                          background: deptColor.startsWith('#') ? `${deptColor}15` : 'var(--bg-main)', 
                          padding: '3px 8px', 
                          borderRadius: '12px', 
                          fontSize: '0.75rem', 
                          fontWeight: '600', 
                          color: deptColor 
                        }}>
                          {dept}
                        </span>
                      );
                    }) : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>None</span>}
                  </div>
                </td>
                <td style={{ fontWeight: '500', textAlign: 'center' }} data-label="Units">{s.credits || 3}</td>
                <td style={{ fontWeight: '500', color: 'var(--text-muted)' }} data-label="Meeting Time">
                  {s.hasLecLab ? (
                    <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', gap: '2px' }}>
                      <span>Lec: {s.lectureHours || 0} hrs</span>
                      <span>Lab: {s.labHours || 0} hrs</span>
                    </div>
                  ) : (
                    <span>{s.hoursPerMeeting || 1.5} hrs</span>
                  )}
                </td>
                <td data-label="Lab Required">
                  <span style={{
                    background: s.requiredLab ? 'var(--danger-bg)' : s.isFoodLab ? '#fff3cd' : 'var(--success-bg)',
                    color: s.requiredLab ? 'var(--danger)' : s.isFoodLab ? '#856404' : 'var(--success)',
                    padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600',
                    border: s.isFoodLab ? '1px solid #ffeeba' : 'none'
                  }}>
                    {s.requiredLab ? 'Computer' : s.isFoodLab ? 'Food' : 'No'}
                  </span>
                </td>
                <td className="table-actions" style={{ whiteSpace: 'nowrap' }} data-label="Actions">
                  <div className="subject-actions-wrapper">
                    <button 
                      type="button"
                      className="btn-details" 
                      onClick={() => onViewDetails && onViewDetails(s)} 
                      title="Details"
                    >
                      <svg className="mobile-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                      <span className="desktop-action-text">Details</span>
                    </button>
                    <button 
                      type="button"
                      className="btn-edit" 
                      onClick={() => onEdit(s)} 
                      title="Edit"
                    >
                      <svg className="mobile-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                      <span className="desktop-action-text">Edit</span>
                    </button>
                    <button 
                      type="button"
                      className="btn-delete" 
                      onClick={() => onDelete(s.id)} 
                      title="Delete"
                    >
                      <svg className="mobile-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                      <span className="desktop-action-text">Delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </div>
  );
};

export default SubjectTable;
