/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { getDeptColor } from '../../config/constants';

// Helper to display departments (handles both old string and new array format)
export const getSubjectDepts = (subject) => {
  if (Array.isArray(subject.departments) && subject.departments.length > 0) return subject.departments;
  if (subject.department) return [subject.department];
  return [];
};

const SubjectTable = ({ subjectList = [], title, titleColor = 'var(--accent-primary)', onEdit, onDelete, onViewDetails, departments = [], selectedIds = [], onToggleSelect, onToggleSelectAll }) => {

  const allSelected = subjectList.length > 0 && subjectList.every(s => selectedIds.includes(s.id));
  const someSelected = subjectList.some(s => selectedIds.includes(s.id)) && !allSelected;
  const headerCheckboxRef = React.useRef(null);

  React.useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  if (!subjectList || subjectList.length === 0) return null;

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
                    <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.78rem', gap: '3px', alignItems: 'flex-start' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: 'rgba(147, 51, 234, 0.1)',
                        color: '#7e22ce',
                        border: '1px solid rgba(147, 51, 234, 0.25)'
                      }}>
                        Lec &amp; Lab
                      </span>
                      <span>Lec: {s.lectureHours || 2}h · Lab: {s.labHours || 3}h</span>
                    </div>
                  ) : (s.requiredLab || s.isFoodLab) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.78rem', gap: '3px', alignItems: 'flex-start' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: 'rgba(13, 148, 136, 0.12)',
                        color: '#0f766e',
                        border: '1px solid rgba(13, 148, 136, 0.28)'
                      }}>
                        Lab Only
                      </span>
                      <span>{s.hoursPerMeeting || 1.5} hrs/meeting</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.78rem', gap: '3px', alignItems: 'flex-start' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: 'rgba(37, 99, 235, 0.08)',
                        color: '#1d4ed8',
                        border: '1px solid rgba(37, 99, 235, 0.22)'
                      }}>
                        Single Lec
                      </span>
                      <span>{s.hoursPerMeeting || 1.5} hrs/meeting</span>
                    </div>
                  )}
                </td>
                <td data-label="Lab Required">
                  {s.requiredLab ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(16, 185, 129, 0.14)',
                      color: '#047857',
                      padding: '3px 9px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      whiteSpace: 'nowrap'
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                      Computer Lab
                    </span>
                  ) : s.isFoodLab ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(217, 119, 6, 0.14)',
                      color: '#b45309',
                      padding: '3px 9px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      border: '1px solid rgba(217, 119, 6, 0.35)',
                      whiteSpace: 'nowrap'
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" /></svg>
                      Food Lab
                    </span>
                  ) : (
                    <span style={{
                      background: 'var(--bg-main)',
                      color: 'var(--text-muted)',
                      padding: '3px 9px',
                      borderRadius: '12px',
                      fontSize: '0.74rem',
                      fontWeight: '600',
                      border: '1px solid var(--border-color)',
                      whiteSpace: 'nowrap'
                    }}>
                      Standard
                    </span>
                  )}
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
