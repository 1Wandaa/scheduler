import React, { useState, useMemo } from 'react';
import { DEPARTMENTS, getDeptColor, PROGRAM_DEPARTMENTS } from '../../config/constants';
import { getSubjectDepts } from '../SubjectTable/SubjectTable';
import AutocompleteMultiSelect from '../AutocompleteMultiSelect/AutocompleteMultiSelect';

/**
 * Normalizes program name or department code to standard department code.
 */
function resolveDeptCode(val) {
  if (!val) return null;
  const trimmed = String(val).trim();
  if (PROGRAM_DEPARTMENTS[trimmed]) return PROGRAM_DEPARTMENTS[trimmed];
  const upper = trimmed.toUpperCase();
  if (Object.values(PROGRAM_DEPARTMENTS).includes(upper)) return upper;
  if (DEPARTMENTS.includes(upper)) return upper;
  if (upper.includes('COMPUTER') || upper.includes('BSCS')) return 'BSCS';
  if (upper.includes('FOOD') || upper.includes('BSFT')) return 'BSFT';
  if (upper.includes('OFFICE') || upper.includes('BSOA')) return 'BSOA';
  if (upper.includes('ENGLISH') || upper.includes('BAEL')) return 'BAEL';
  return upper;
}

const SubjectSelector = ({ 
  subjects, 
  activeSemester, 
  selectedSubjects = [], 
  departments = [], 
  onToggleSubject, 
  label = "Enrolled Subjects",
  recommendedDepartment = null,
  contextType = 'section',
  yearLevel = null
}) => {
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [subjectModalFilter, setSubjectModalFilter] = useState('All');
  const [showAllSemesters, setShowAllSemesters] = useState(false);

  const targetDept = useMemo(() => resolveDeptCode(recommendedDepartment), [recommendedDepartment]);

  // Compute subjects annotated with recommendation status
  const annotatedSubjects = useMemo(() => {
    return subjects.map(sub => {
      const depts = getSubjectDepts(sub);
      const isDeptMatch = targetDept ? depts.includes(targetDept) : false;
      const isMinorMatch = sub.category === 'Minor';
      
      const isRecommended = Boolean(targetDept && (isDeptMatch || isMinorMatch));
      let recommendationReason = '';
      if (isDeptMatch) recommendationReason = `${targetDept} Curriculum`;
      else if (isMinorMatch) recommendationReason = 'General Education';

      return {
        ...sub,
        isRecommended,
        recommendationReason
      };
    });
  }, [subjects, targetDept]);

  // Filter subjects based on active semester and department filters
  const filteredOptions = useMemo(() => {
    let filtered = annotatedSubjects;
    
    // 1. Filter by semester
    if (!showAllSemesters) {
      filtered = filtered.filter(sub => !sub.semester || sub.semester === 'Both' || sub.semester === activeSemester);
    }

    // 2. Filter by department or recommended tab
    if (subjectModalFilter === 'Recommended') {
      filtered = filtered.filter(s => s.isRecommended);
    } else if (subjectModalFilter !== 'All') {
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

    // 4. Sort: Recommended subjects first, then alphabetically by code
    return filtered.sort((a, b) => {
      if (a.isRecommended !== b.isRecommended) {
        return a.isRecommended ? -1 : 1;
      }
      const codeA = (a.code || '').replace(/\s+/g, '').toUpperCase();
      const codeB = (b.code || '').replace(/\s+/g, '').toUpperCase();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [annotatedSubjects, subjectSearchQuery, subjectModalFilter, activeSemester, showAllSemesters]);

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
        
        {sub.isRecommended && (
          <span style={{ 
            fontSize: '0.7rem', 
            padding: '2px 8px', 
            borderRadius: '10px', 
            background: 'rgba(16, 185, 129, 0.15)', 
            color: '#059669', 
            fontWeight: '700', 
            border: '1px solid rgba(16, 185, 129, 0.35)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px'
          }}>
            ✨ Recommended
          </span>
        )}

        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'var(--bg-main)', color: 'var(--text-muted)', fontWeight: '600', border: '1px solid var(--border-color)' }}>
          {sub.semester && sub.semester !== 'Both' ? sub.semester.replace(' Semester', ' Sem') : 'Both Sem'}
        </span>
      </div>
    );
  };

  return (
    <div className="form-group" style={{ marginBottom: '25px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
        {targetDept && (
          <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '600', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '8px' }}>
            ✨ Recommended for {targetDept}
          </span>
        )}
      </div>
      
      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '15px' }}>
        {targetDept && (
          <button
            onClick={() => {
              setSubjectModalFilter('Recommended');
              setTimeout(() => document.getElementById('subject-autocomplete')?.focus(), 0);
            }}
            type="button"
            style={{
              padding: '4px 12px',
              borderRadius: '16px',
              border: subjectModalFilter === 'Recommended' ? '1.5px solid #10b981' : '1px solid rgba(16, 185, 129, 0.3)',
              background: subjectModalFilter === 'Recommended' ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(16, 185, 129, 0.1)',
              color: subjectModalFilter === 'Recommended' ? '#fff' : '#059669',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '700',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            ✨ Recommended ({annotatedSubjects.filter(s => s.isRecommended && (showAllSemesters || !s.semester || s.semester === 'Both' || s.semester === activeSemester)).length})
          </button>
        )}

        {['All', 'Minor', ...(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)].map(dept => {
          const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
          const isSelected = subjectModalFilter === dept;
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
                border: isSelected ? `1.5px solid ${deptColor}` : '1px solid var(--border-color)',
                background: isSelected ? deptColor : 'transparent',
                color: isSelected ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: '600',
                transition: 'all 0.2s ease',
              }}
            >
              {dept === 'All' ? 'All Subjects' : dept === 'Minor' ? 'Minor Subjects' : dept}
            </button>
          );
        })}
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
        allOptions={annotatedSubjects}
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
