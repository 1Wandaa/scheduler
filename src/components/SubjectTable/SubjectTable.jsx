/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { getDeptColor } from '../../config/constants';

// Helper to display departments (handles both old string and new array format)
export const getSubjectDepts = (subject) => {
  if (Array.isArray(subject.departments) && subject.departments.length > 0) return subject.departments;
  if (subject.department) return [subject.department];
  return [];
};

const SubjectTable = ({ subjectList, title, titleColor = 'var(--accent-primary)', onEdit, onDelete, departments = [] }) => {
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
      <table className="data-table">
        <thead>
          <tr>
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
          {subjectList.map(s => (
            <tr key={s.id}>
              <td><strong style={{ color: titleColor }}>{s.code}</strong></td>
              <td style={{ fontWeight: '500' }}>{s.name}</td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                {s.semester && s.semester !== 'Both' ? s.semester.replace(' Semester', ' Sem') : 'Both'}
              </td>
              <td>
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
              <td style={{ fontWeight: '500', textAlign: 'center' }}>{s.credits || 3}</td>
              <td style={{ fontWeight: '500', color: 'var(--text-muted)' }}>{s.hoursPerMeeting || 1.5} hrs</td>
              <td>
                <span style={{
                  background: s.requiredLab ? 'var(--danger-bg)' : 'var(--success-bg)',
                  color: s.requiredLab ? 'var(--danger)' : 'var(--success)',
                  padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600'
                }}>
                  {s.requiredLab ? 'Yes' : 'No'}
                </span>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn-edit" onClick={() => onEdit(s)}>Edit</button>
                <button className="btn-delete" onClick={() => onDelete(s.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SubjectTable;
