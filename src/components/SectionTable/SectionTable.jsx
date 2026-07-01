import React from 'react';
import { PROGRAM_DEPARTMENTS } from '../../config/constants';

const SectionTable = ({ sectionList, title, titleColor = 'var(--accent-primary)', onEdit, onDelete, subjects = [], departments = [], courses = [] }) => {
  if (!sectionList || sectionList.length === 0) return null;

  const getSubjectName = (subId) => {
    const s = subjects.find(sub => sub.id === subId || sub.code === subId);
    return s ? `${s.code} - ${s.name}` : subId;
  };

  return (
    <div style={{ marginBottom: '30px' }}>
      <h4 style={{
        color: titleColor,
        marginBottom: '12px',
        borderBottom: `2px solid ${titleColor}`,
        paddingBottom: '5px',
        display: 'inline-block',
        marginTop: '10px'
      }}>
        {title}
      </h4>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>Section Name</th>
            <th style={{ textAlign: 'center' }}>Program</th>
            <th style={{ textAlign: 'center' }}>Year</th>
            <th style={{ textAlign: 'center' }}>Subjects</th>
            <th style={{ textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sectionList.map(sec => (
            <tr key={sec.id}>
              <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                <strong style={{ color: 'var(--accent-primary)' }}>{sec.name}</strong>
              </td>
              <td style={{ fontWeight: '500', textAlign: 'center', verticalAlign: 'middle' }}>
                {(() => {
                  const course = courses.find(c => c.code === sec.program || c.id === sec.program);
                  if (course) return `${course.code}`;
                  const dept = departments.find(d => d.id === sec.program);
                  if (dept) return dept.name;
                  return PROGRAM_DEPARTMENTS[sec.program] || sec.program;
                })()}
              </td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'center', verticalAlign: 'middle' }}>
                <span style={{
                  background: '#EEF2FF', color: '#5645EE',
                  padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600',
                  display: 'inline-block', whiteSpace: 'nowrap'
                }}>
                  Year {sec.yearLevel}
                </span>
              </td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '280px', textAlign: 'center', verticalAlign: 'middle' }}>
                {(sec.subjects || []).length === 0 ? (
                  <span style={{ fontStyle: 'italic' }}>None</span>
                ) : (
                  <span title={(sec.subjects || []).map(getSubjectName).join(', ')}>
                    {(sec.subjects || []).slice(0, 3).map(getSubjectName).join('; ')}
                    {(sec.subjects || []).length > 3 ? ` +${(sec.subjects || []).length - 3}` : ''}
                  </span>
                )}
              </td>
              <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                <button className="btn-edit" onClick={() => onEdit(sec)}>Edit</button>
                <button className="btn-delete" onClick={() => onDelete(sec.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SectionTable;
