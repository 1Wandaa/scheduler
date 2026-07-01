import React, { useState, useMemo } from 'react';
import { DEPARTMENTS, getDeptColor } from '../../config/constants';
import { getSubjectDepts } from '../SubjectTable/SubjectTable';

const SubjectSelector = ({ subjects, activeSemester, selectedSubjects = [], departments = [], onToggleSubject }) => {
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

  const selectedSubjectObjects = useMemo(() => {
    return subjects.filter(sub => selectedSubjects.includes(sub.id) || selectedSubjects.includes(sub.code) || selectedSubjects.includes(sub.name));
  }, [subjects, selectedSubjects]);

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
      
      {/* Selected Subjects Chips */}
      {selectedSubjectObjects.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '15px', padding: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
          {selectedSubjectObjects.map(sub => {
            const isMinor = sub.category === 'Minor';
            const depts = getSubjectDepts(sub);
            const color = isMinor ? 'var(--warning)' : (depts.length > 0 ? getDeptColor(depts[0]) : 'var(--text-muted)');
            return (
              <div key={sub.id} style={{ 
                display: 'flex', alignItems: 'center', gap: '6px', 
                padding: '4px 10px', borderRadius: '16px', 
                background: `${color}15`, border: `1px solid ${color}40`,
                fontSize: '0.8rem', fontWeight: '600', color: color 
              }}>
                {sub.code}
                <button 
                  type="button" 
                  onClick={() => onToggleSubject(sub.id)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7, marginLeft: '2px' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {['All', 'Minor', ...(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)].map(dept => {
          const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
          return (
          <button
            key={dept}
            onClick={() => setSubjectModalFilter(dept)}
            type="button"
            style={{
              padding: '4px 12px',
              borderRadius: '16px',
              border: subjectModalFilter === dept ? `1.5px solid ${deptColor}` : '1px solid var(--border-color)',
              background: subjectModalFilter === dept ? deptColor : 'transparent',
              color: subjectModalFilter === dept ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '600',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => { if (subjectModalFilter !== dept) { e.target.style.borderColor = deptColor; e.target.style.color = deptColor; } }}
            onMouseLeave={(e) => { if (subjectModalFilter !== dept) { e.target.style.borderColor = 'var(--border-color)'; e.target.style.color = 'var(--text-muted)'; } }}
          >
            {dept === 'All' ? 'All Subjects' : dept === 'Minor' ? 'Minor Subjects' : dept}
          </button>
        )})}
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
        
        {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => {
          if (subjectModalFilter !== 'All' && subjectModalFilter !== dept) return null;
          const deptMajors = majorSubjects.filter(s => getSubjectDepts(s).includes(dept));
          const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
          return renderSubjectGroup(`${dept} Major Subjects`, deptMajors, deptColor);
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
