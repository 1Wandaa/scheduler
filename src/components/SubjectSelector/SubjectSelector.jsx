import React, { useState, useMemo } from 'react';
import { DEPARTMENTS, getDeptColor } from '../../config/constants';
import { getSubjectDepts } from '../SubjectTable/SubjectTable';
import AutocompleteMultiSelect from '../AutocompleteMultiSelect/AutocompleteMultiSelect';

const SubjectSelector = ({ subjects, activeSemester, selectedSubjects = [], departments = [], onToggleSubject }) => {
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [subjectModalFilter, setSubjectModalFilter] = useState('All');
  const [showAllSemesters, setShowAllSemesters] = useState(false);

  // Filter subjects based on active semester and department filters
  const filteredOptions = useMemo(() => {
    let filtered = subjects;
    
    // 1. Filter by semester
    if (!showAllSemesters) {
      filtered = filtered.filter(sub => !sub.semester || sub.semester === 'Both' || sub.semester === activeSemester);
    }

    // 2. Filter by search query (already handled by our custom logic, but we must pre-filter by department filter!)
    if (subjectModalFilter !== 'All') {
      if (subjectModalFilter === 'Minor') {
        filtered = filtered.filter(s => s.category === 'Minor');
      } else {
        filtered = filtered.filter(s => {
          const depts = getSubjectDepts(s);
          return depts.includes(subjectModalFilter);
        });
      }
    }

    // 3. Filter by search text
    if (subjectSearchQuery.trim() !== '') {
      const q = subjectSearchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        (s.code || '').toLowerCase().includes(q) || 
        (s.name || '').toLowerCase().includes(q)
      );
    }

    // 4. Sort
    return filtered.sort((a, b) => 
      ((a.code || '').replace(/\s+/g, '').toUpperCase()).localeCompare(((b.code || '').replace(/\s+/g, '').toUpperCase()), undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [subjects, subjectSearchQuery, subjectModalFilter, activeSemester, showAllSemesters]);

  const renderChip = (sub, onRemove) => {
    const isMinor = sub.category === 'Minor';
    const depts = getSubjectDepts(sub);
    const color = isMinor ? 'var(--warning)' : (depts.length > 0 ? getDeptColor(depts[0]) : 'var(--text-muted)');
    
    return (
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: '6px', 
        padding: '4px 10px', borderRadius: '16px', 
        background: `${color}15`, border: `1px solid ${color}40`,
        fontSize: '0.8rem', fontWeight: '600', color: color 
      }}>
        {sub.code}
        <button 
          type="button" 
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7, marginLeft: '2px' }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    );
  };

  const renderOption = (sub) => {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
        <span style={{ fontWeight: '600', color: 'var(--accent-dark)', minWidth: '80px' }}>{sub.code}</span>
        <span style={{ flex: 1, color: 'var(--text-main)' }}>{sub.name}</span>
        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'var(--bg-main)', color: 'var(--text-muted)', fontWeight: '600', border: '1px solid var(--border-color)' }}>
          {sub.semester && sub.semester !== 'Both' ? sub.semester.replace(' Semester', ' Sem') : 'Both Sem'}
        </span>
      </div>
    );
  };

  return (
    <div className="form-group" style={{ marginBottom: '25px' }}>
      <label className="form-label">Enrolled Subjects</label>
      
      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '15px' }}>
        {['All', 'Minor', ...(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)].map(dept => {
          const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
          return (
          <button
            key={dept}
            onClick={() => {
              setSubjectModalFilter(dept);
              setTimeout(() => document.getElementById('subject-autocomplete')?.focus(), 0);
            }}
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
      
      {/* Toggles */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '10px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: '500', userSelect: 'none' }}>
          <input 
            type="checkbox" 
            checked={showAllSemesters}
            onChange={(e) => setShowAllSemesters(e.target.checked)}
            style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px', margin: 0 }}
          />
          Show Off-Semester Subjects
        </label>
      </div>

      <AutocompleteMultiSelect
        inputId="subject-autocomplete"
        allOptions={subjects}
        options={filteredOptions}
        selectedIds={selectedSubjects}
        onToggle={(sub) => onToggleSubject(sub.id)}
        placeholder="Search subject code or name..."
        searchQuery={subjectSearchQuery}
        setSearchQuery={setSubjectSearchQuery}
        renderChip={renderChip}
        renderOption={renderOption}
        noOptionsMessage={
          subjects.length === 0 
            ? "No subjects available. Add subjects first." 
            : "No subjects match your search."
        }
      />
      
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '500' }}>
        Selected: {selectedSubjects.length} subject(s)
      </p>
    </div>
  );
};

export default SubjectSelector;
