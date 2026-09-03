import React from 'react';
import { PROGRAM_DEPARTMENTS } from '../../config/constants';

const SectionTable = ({ sectionList, title, titleColor = 'var(--accent-primary)', onEdit, onDelete, subjects = [], professors = [], departments = [], courses = [] }) => {
  if (!sectionList || sectionList.length === 0) return null;

  const getSubjectName = (subId) => {
    const s = subjects.find(sub => sub.id === subId || sub.code === subId);
    return s ? `${s.code} - ${s.name}` : subId;
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
              <th style={{ textAlign: 'center' }}>Subjects</th>
              <th style={{ textAlign: 'center' }}>Instructors</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sectionList.map(sec => {
              const assignedProfs = professors.filter(p => {
                if (sec.subjectInstructors && Object.keys(sec.subjectInstructors).length > 0) {
                  return Object.values(sec.subjectInstructors).includes(p.id);
                }
                return (p.assignedSections || []).includes(sec.id) || (p.assignedSections || []).includes(sec.name);
              });

              return (
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
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '240px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {(sec.subjects || []).length === 0 ? (
                      <span style={{ fontStyle: 'italic' }}>None</span>
                    ) : (
                      <span title={(sec.subjects || []).map(getSubjectName).join(', ')}>
                        {(sec.subjects || []).slice(0, 3).map(getSubjectName).join('; ')}
                        {(sec.subjects || []).length > 3 ? ` +${(sec.subjects || []).length - 3}` : ''}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '200px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {assignedProfs.length === 0 ? (
                      <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>None</span>
                    ) : (
                      <span title={assignedProfs.map(p => p.name || `${p.lastName}, ${p.firstName}`).join(', ')}>
                        {assignedProfs.slice(0, 2).map(p => p.lastName || p.name).join(', ')}
                        {assignedProfs.length > 2 ? ` +${assignedProfs.length - 2}` : ''}
                      </span>
                    )}
                  </td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                  <button 
                    onClick={() => onEdit(sec)} 
                    style={{ background: 'rgba(86, 69, 238, 0.1)', color: 'var(--accent-primary)', border: 'none', borderRadius: '6px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                    title="Edit"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  </button>
                  <button 
                    onClick={() => onDelete(sec.id)} 
                    style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: 'none', borderRadius: '6px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
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
    </div>
  );
};

export default SectionTable;
