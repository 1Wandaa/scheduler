import React, { useState, useMemo } from 'react';
import { DEPARTMENTS, getDeptColor } from '../../config/constants';
import { getSubjectDepts } from '../SubjectTable/SubjectTable';

const SubjectSelector = ({ subjects, activeSemester, selectedSubjects = [], onToggleSubject }) => {
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [subjectModalFilter, setSubjectModalFilter] = useState('All');

  // Memoize the filtering logic to prevent lag on every keystroke
  const { minorSubjects, majorSubjects } = useMemo(() => {
    const filtered = subjects.filter(sub => 
      (!sub.semester || sub.semester === 'Both' || sub.semester === activeSemester) &&
      ((sub.code || '').toLowerCase().includes(subjectSearchQuery.toLowerCase()) || 
      (sub.name || '').toLowerCase().includes(subjectSearchQuery.toLowerCase()))
    ).sort((a, b) => 
      ((a.code || '').replace(/\s+/g, '').toUpperCase()).localeCompare(((b.code || '').replace(/\s+/g, '').toUpperCase()), undefined, { numeric: true, sensitivity: 'base' })
    );

    return {
      minorSubjects: filtered.filter(s => s.category === 'Minor'),
      majorSubjects: filtered.filter(s => s.category !== 'Minor')
    };
  }, [subjects, subjectSearchQuery, activeSemester]);

  const renderSubjectGroup = (title, subjectList, color) => {
    if (subjectList.length === 0) return null;
    return (
      <div key={title} style={{ marginBottom: '15px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: color, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${color}`, paddingBottom: '4px' }}>
          {title}
        </div>
        {subjectList.map(sub => (
          <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-main)' }}>
            <input
              type="checkbox"
              checked={selectedSubjects.includes(sub.id) || selectedSubjects.includes(sub.code) || selectedSubjects.includes(sub.name)}
              onChange={() => onToggleSubject(sub.id)}
              style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
            />
            <span style={{ fontWeight: '600', color: 'var(--accent-dark)' }}>{sub.code}</span>
            <span>{sub.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'var(--border-color)', color: 'var(--text-muted)', fontWeight: '600' }}>
              {sub.semester && sub.semester !== 'Both' ? sub.semester.replace(' Semester', ' Sem') : 'Both Sem'}
            </span>
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className="form-group" style={{ marginBottom: '25px' }}>
      <label className="form-label">Enrolled Subjects</label>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {['All', 'Minor', ...DEPARTMENTS].map(dept => (
          <button
            key={dept}
            onClick={() => setSubjectModalFilter(dept)}
            type="button"
            style={{
              padding: '4px 12px',
              borderRadius: '16px',
              border: subjectModalFilter === dept ? `1.5px solid ${getDeptColor(dept)}` : '1px solid var(--border-color)',
              background: subjectModalFilter === dept ? getDeptColor(dept) : 'transparent',
              color: subjectModalFilter === dept ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '600',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => { if (subjectModalFilter !== dept) { e.target.style.borderColor = getDeptColor(dept); e.target.style.color = getDeptColor(dept); } }}
            onMouseLeave={(e) => { if (subjectModalFilter !== dept) { e.target.style.borderColor = 'var(--border-color)'; e.target.style.color = 'var(--text-muted)'; } }}
          >
            {dept === 'All' ? 'All Subjects' : dept === 'Minor' ? 'Minor Subjects' : dept}
          </button>
        ))}
      </div>
      <input 
        type="text" 
        className="form-input" 
        placeholder="Search subject code or name..." 
        value={subjectSearchQuery} 
        onChange={(e) => setSubjectSearchQuery(e.target.value)}
        style={{ marginBottom: '10px', marginTop: '5px' }}
      />
      <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: 'var(--bg-main)' }}>
        {subjects.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No subjects available. Add subjects first.</p>}
        
        {(subjectModalFilter === 'All' || subjectModalFilter === 'Minor') && renderSubjectGroup("Minor Subjects", minorSubjects, "var(--warning)")}
        
        {DEPARTMENTS.map(dept => {
          if (subjectModalFilter !== 'All' && subjectModalFilter !== dept) return null;
          const deptMajors = majorSubjects.filter(s => getSubjectDepts(s).includes(dept));
          return renderSubjectGroup(`${dept} Major Subjects`, deptMajors, getDeptColor(dept));
        })}

        {subjectModalFilter === 'All' && renderSubjectGroup(
          "Unassigned Major Subjects",
          majorSubjects.filter(s => getSubjectDepts(s).length === 0),
          "var(--text-muted)"
        )}
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '500' }}>
        Selected: {selectedSubjects.length} subject(s)
      </p>
    </div>
  );
};

export default SubjectSelector;
