import React from 'react';
import { PROGRAM_DEPARTMENTS } from '../../config/constants';

const SectionTable = ({ sectionList, title, titleColor = 'var(--accent-primary)', onEdit, onDelete, subjects = [], professors = [], departments = [], courses = [] }) => {
  if (!sectionList || sectionList.length === 0) return null;

  const getSubjectName = (subId) => {
    const s = subjects.find(sub => sub.id === subId || sub.code === subId);
    return s ? `${s.code} - ${s.name}` : subId;
  };

  const getAdviserName = (adviserId) => {
    if (!adviserId) return null;
    const prof = professors.find(p => p.id === adviserId);
    if (!prof) return null;
    return prof.name || `${prof.lastName || ''}, ${prof.firstName || ''}`;
  };

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
              <th style={{ textAlign: 'center' }}>Section Name</th>
              <th style={{ textAlign: 'center' }}>Program</th>
              <th style={{ textAlign: 'center' }}>Year</th>
              <th style={{ textAlign: 'center' }}>Adviser</th>
              <th style={{ textAlign: 'center' }}>Subjects</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sectionList.map(sec => (
              <tr key={sec.id}>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{sec.name}</strong>
                </td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '0.75rem', padding: '4px 12px', borderRadius: '16px', fontWeight: 700,
                    background: titleColor.startsWith('#') ? `${titleColor}15` : 'rgba(0,0,0,0.05)',
                    color: titleColor,
                    border: `1px solid ${titleColor.startsWith('#') ? titleColor + '40' : 'rgba(0,0,0,0.1)'}`,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}>
                  {(() => {
                    const course = courses.find(c => c.code === sec.program || c.id === sec.program);
                    if (course) return `${course.code}`;
                    const dept = departments.find(d => d.id === sec.program);
                    if (dept) return dept.name;
                    return PROGRAM_DEPARTMENTS[sec.program] || sec.program;
                  })()}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'center', verticalAlign: 'middle' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '0.75rem', padding: '4px 12px', borderRadius: '16px', fontWeight: 700,
                    background: 'var(--bg-main)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}>
                    Year {sec.yearLevel}
                  </span>
                </td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: '0.85rem' }}>
                  {(() => {
                    const adviserName = getAdviserName(sec.adviser);
                    return adviserName ? (
                      <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{adviserName}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                    );
                  })()}
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
    </div>
  );
};

export default SectionTable;
