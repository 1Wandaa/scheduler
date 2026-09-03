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

/**
 * Detects the year level of a subject based on its subject code pattern or yearLevel field.
 * (e.g. CS 101 -> 1, CS 201 -> 2, CS 301 -> 3, CS 401 -> 4)
 */
export function getSubjectYearLevel(sub) {
  if (sub.yearLevel) return Number(sub.yearLevel);
  const code = (sub.code || '').trim();
  // Standard PH academic numbering: 3-digit number where 1st digit is year (1xx=1, 2xx=2, 3xx=3, 4xx=4)
  const match = code.match(/\b[A-Za-z]+\s*([1-4])\d\d/i);
  if (match) return Number(match[1]);
  // Secondary fallback: check first single digit 1-4
  const numMatch = code.match(/(\d)/);
  if (numMatch && ['1', '2', '3', '4'].includes(numMatch[1])) {
    return Number(numMatch[1]);
  }
  return null;
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
  yearLevel = null,
  onQuickAdd = null
}) => {
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [subjectModalFilter, setSubjectModalFilter] = useState('All');
  const [showAllSemesters, setShowAllSemesters] = useState(false);
  const [showSelectedList, setShowSelectedList] = useState(true);

  const targetDept = useMemo(() => resolveDeptCode(recommendedDepartment), [recommendedDepartment]);

  // Compute subjects annotated with recommendation status and year level
  const annotatedSubjects = useMemo(() => {
    return subjects.map(sub => {
      const depts = getSubjectDepts(sub);
      const isDeptMatch = targetDept ? depts.includes(targetDept) : false;
      const isMinorMatch = sub.category === 'Minor';
      const subYear = getSubjectYearLevel(sub);
      const isYearMatch = yearLevel ? subYear === Number(yearLevel) : true;
      
      const isRecommended = Boolean(targetDept && (isDeptMatch || isMinorMatch) && (!yearLevel || isYearMatch || isMinorMatch));
      let recommendationReason = '';
      if (isDeptMatch && isYearMatch) recommendationReason = `${targetDept} Year ${yearLevel} Curriculum`;
      else if (isDeptMatch) recommendationReason = `${targetDept} Curriculum`;
      else if (isMinorMatch) recommendationReason = 'General Education';

      return {
        ...sub,
        yearLevel: subYear,
        isRecommended,
        recommendationReason
      };
    });
  }, [subjects, targetDept, yearLevel]);

  // Filter subjects based on active semester and department/year filters
  const filteredOptions = useMemo(() => {
    let filtered = annotatedSubjects;
    
    // 1. Filter by semester
    if (!showAllSemesters) {
      filtered = filtered.filter(sub => !sub.semester || sub.semester === 'Both' || sub.semester === activeSemester);
    }

    // 2. Filter by category, year level, or department
    if (subjectModalFilter === 'Recommended') {
      filtered = filtered.filter(s => s.isRecommended);
    } else if (subjectModalFilter === 'Year1') {
      filtered = filtered.filter(s => s.yearLevel === 1);
    } else if (subjectModalFilter === 'Year2') {
      filtered = filtered.filter(s => s.yearLevel === 2);
    } else if (subjectModalFilter === 'Year3') {
      filtered = filtered.filter(s => s.yearLevel === 3);
    } else if (subjectModalFilter === 'Year4') {
      filtered = filtered.filter(s => s.yearLevel === 4);
    } else if (subjectModalFilter === 'Minor') {
      filtered = filtered.filter(s => s.category === 'Minor');
    } else if (subjectModalFilter !== 'All') {
      filtered = filtered.filter(s => {
        const depts = getSubjectDepts(s);
        return depts.includes(subjectModalFilter);
      });
    }

    // 3. Filter by search text
    if (subjectSearchQuery.trim() !== '') {
      const q = subjectSearchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        (s.code || '').toLowerCase().includes(q) || 
        (s.name || '').toLowerCase().includes(q)
      );
    }

    // 4. Sort: Recommended subjects first, then by year level, then code
    return filtered.sort((a, b) => {
      if (a.isRecommended !== b.isRecommended) {
        return a.isRecommended ? -1 : 1;
      }
      if (a.yearLevel && b.yearLevel && a.yearLevel !== b.yearLevel) {
        return a.yearLevel - b.yearLevel;
      }
      const codeA = (a.code || '').replace(/\s+/g, '').toUpperCase();
      const codeB = (b.code || '').replace(/\s+/g, '').toUpperCase();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [annotatedSubjects, subjectSearchQuery, subjectModalFilter, activeSemester, showAllSemesters]);

  // Recommended subjects for this context
  const recommendedList = useMemo(() => {
    return annotatedSubjects.filter(s => s.isRecommended && (showAllSemesters || !s.semester || s.semester === 'Both' || s.semester === activeSemester));
  }, [annotatedSubjects, showAllSemesters, activeSemester]);

  // Map selected subjects to full subject objects (including unmatched/legacy IDs)
  const selectedSubjectObjects = useMemo(() => {
    return selectedSubjects.map(subRef => {
      const found = subjects.find(s => 
        String(s.id).toLowerCase() === String(subRef).toLowerCase() || 
        String(s.code).toLowerCase() === String(subRef).toLowerCase() || 
        String(s.name).toLowerCase() === String(subRef).toLowerCase()
      );
      if (found) return found;
      return {
        id: subRef,
        code: subRef,
        name: 'Legacy / Unmatched ID',
        isOrphan: true,
        credits: 3
      };
    });
  }, [subjects, selectedSubjects]);

  // Calculate total units of selected subjects
  const selectedDetails = useMemo(() => {
    const totalCredits = selectedSubjectObjects.reduce((sum, s) => sum + (Number(s.credits) || 3), 0);
    return { count: selectedSubjectObjects.length, totalCredits };
  }, [selectedSubjectObjects]);

  // Check if all recommended are selected
  const allRecommendedSelected = useMemo(() => {
    if (recommendedList.length === 0) return false;
    return recommendedList.every(s => selectedSubjects.includes(s.id) || selectedSubjects.includes(s.code));
  }, [recommendedList, selectedSubjects]);

  // Batch Select All Recommended
  const handleSelectAllRecommended = () => {
    const recIds = recommendedList.map(s => s.id);
    onToggleSubject(recIds);
  };

  // Batch Select Visible Filtered
  const handleBatchSelect = (items) => {
    const ids = items.map(s => s.id);
    onToggleSubject(ids);
  };

  // Batch Deselect Visible
  const handleBatchDeselect = (items) => {
    const idsToRemove = items.map(s => s.id);
    // Remove these IDs from selected
    const remaining = selectedSubjects.filter(id => !idsToRemove.includes(id));
    onToggleSubject(remaining);
  };

  // Clear All
  const handleClearAll = () => {
    onToggleSubject('CLEAR_ALL');
  };

  const renderChip = (sub, onRemove) => {
    const isMinor = sub.category === 'Minor';
    const depts = getSubjectDepts(sub);
    const color = isMinor ? 'var(--warning, #f59e0b)' : (depts.length > 0 ? getDeptColor(depts[0]) : 'var(--text-muted)');
    
    return (
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: '6px', 
        padding: '4px 10px', borderRadius: '16px', 
        background: `${color}15`, border: `1px solid ${color}40`,
        fontSize: '0.8rem', fontWeight: '600', color: color 
      }}>
        <span>{sub.code}</span>
        {sub.yearLevel && (
          <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Y{sub.yearLevel}</span>
        )}
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
        <span style={{ fontWeight: '700', color: 'var(--accent-dark)', minWidth: '75px', fontSize: '0.85rem' }}>{sub.code}</span>
        <span style={{ flex: 1, color: 'var(--text-main)', fontSize: '0.82rem' }}>{sub.name}</span>
        
        {sub.yearLevel && (
          <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-main)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', fontWeight: '600' }}>
            Year {sub.yearLevel}
          </span>
        )}

        {sub.isRecommended && (
          <span style={{ 
            fontSize: '0.68rem', 
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

        <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(86, 69, 238, 0.08)', color: 'var(--accent-primary)', fontWeight: '700' }}>
          {sub.credits || 3}u
        </span>
      </div>
    );
  };

  return (
    <div className="form-group" style={{ marginBottom: '22px' }}>
      {/* Header Bar with Interactive Selected Count & Quick Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
          <button
            type="button"
            onClick={() => setShowSelectedList(!showSelectedList)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.76rem',
              color: 'var(--accent-primary, #5645ee)',
              fontWeight: '700',
              background: 'rgba(86, 69, 238, 0.1)',
              border: '1px solid rgba(86, 69, 238, 0.25)',
              padding: '3px 10px',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Click to view/collapse the list of selected subjects"
          >
            <span>📋 {selectedDetails.count} selected ({selectedDetails.totalCredits} units)</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>{showSelectedList ? '▲ Hide' : '▼ View'}</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* ⚡ One-Click Select All Recommended Button */}
          {recommendedList.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAllRecommended}
              disabled={allRecommendedSelected}
              style={{
                background: allRecommendedSelected ? 'rgba(16, 185, 129, 0.15)' : 'linear-gradient(135deg, #10b981, #059669)',
                color: allRecommendedSelected ? '#059669' : '#ffffff',
                border: allRecommendedSelected ? '1px solid rgba(16, 185, 129, 0.4)' : 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.76rem',
                fontWeight: '700',
                cursor: allRecommendedSelected ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: allRecommendedSelected ? 'none' : '0 2px 6px rgba(16, 185, 129, 0.3)'
              }}
              title={allRecommendedSelected ? "All recommended subjects are enrolled" : "Enroll all recommended subjects with 1-click"}
            >
              {allRecommendedSelected ? '✓ All Recommended Enrolled' : `⚡ Select All Recommended (${recommendedList.length})`}
            </button>
          )}

          {/* Clear All Button */}
          {selectedSubjects.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#dc2626',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.74rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          )}

          {/* Quick Add Subject */}
          {onQuickAdd && (
            <button
              type="button"
              onClick={onQuickAdd}
              style={{
                background: 'rgba(86, 69, 238, 0.1)',
                border: '1px solid rgba(86, 69, 238, 0.3)',
                color: 'var(--accent-primary, #5645ee)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.74rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              + Quick Add
            </button>
          )}
        </div>
      </div>

      {/* UPPER ENROLLED SUBJECTS LIST / TRAY */}
      {showSelectedList && selectedSubjectObjects.length > 0 && (
        <div style={{
          background: 'var(--bg-main, #f8fafc)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '10px',
          padding: '12px 14px',
          marginBottom: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: '700', color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Currently Enrolled Subjects ({selectedSubjectObjects.length}):
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)' }}>
              Click <strong>×</strong> to remove any subject
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: '8px',
            maxHeight: '230px',
            overflowY: 'auto',
            paddingRight: '4px'
          }}>
            {selectedSubjectObjects.map((sub, idx) => {
              const isOrphan = Boolean(sub.isOrphan);
              return (
                <div
                  key={sub.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: isOrphan ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface, #ffffff)',
                    border: isOrphan ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border-color, #e2e8f0)',
                    gap: '8px',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <strong style={{ fontSize: '0.82rem', color: isOrphan ? '#dc2626' : 'var(--accent-dark, #0f172a)' }}>
                        {isOrphan ? `⚠️ ${sub.code}` : sub.code}
                      </strong>
                      {sub.credits && (
                        <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(86, 69, 238, 0.08)', color: 'var(--accent-primary, #5645ee)', fontWeight: '600' }}>
                          {sub.credits}u
                        </span>
                      )}
                      {sub.requiredLab && (
                        <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontWeight: '700' }}>
                          LAB
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={sub.name}>
                      {sub.name}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSubject(sub.id || sub.code);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isOrphan ? '#dc2626' : 'var(--text-muted, #94a3b8)',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                    title={`Remove ${sub.code}`}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
                    onMouseLeave={(e) => e.currentTarget.style.color = isOrphan ? '#dc2626' : 'var(--text-muted, #94a3b8)'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Smart 1-Click Year Banner for Sections */}
      {contextType === 'section' && yearLevel && targetDept && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, rgba(86, 69, 238, 0.08), rgba(59, 130, 246, 0.08))',
          border: '1px solid rgba(86, 69, 238, 0.25)',
          borderRadius: '8px',
          padding: '8px 12px',
          marginBottom: '10px',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--accent-dark)', fontWeight: '600' }}>
            💡 Standard <strong>Year {yearLevel} {targetDept}</strong> Curriculum: <strong>{recommendedList.length} subject(s)</strong> available for {activeSemester || 'this term'}.
          </span>
          {!allRecommendedSelected && (
            <button
              type="button"
              onClick={handleSelectAllRecommended}
              style={{
                background: 'var(--accent-primary, #5645ee)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              ⚡ Enroll Year {yearLevel} Curriculum
            </button>
          )}
        </div>
      )}
      
      {/* Quick Filter Pills (Year Levels, Recommended, Department) */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {targetDept && (
          <button
            onClick={() => setSubjectModalFilter('Recommended')}
            type="button"
            style={{
              padding: '3px 10px',
              borderRadius: '16px',
              border: subjectModalFilter === 'Recommended' ? '1.5px solid #10b981' : '1px solid rgba(16, 185, 129, 0.3)',
              background: subjectModalFilter === 'Recommended' ? '#10b981' : 'rgba(16, 185, 129, 0.08)',
              color: subjectModalFilter === 'Recommended' ? '#fff' : '#059669',
              cursor: 'pointer',
              fontSize: '0.74rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            ✨ Recommended ({recommendedList.length})
          </button>
        )}

        <button
          onClick={() => setSubjectModalFilter('All')}
          type="button"
          style={{
            padding: '3px 10px',
            borderRadius: '16px',
            border: subjectModalFilter === 'All' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-color)',
            background: subjectModalFilter === 'All' ? 'var(--accent-primary)' : 'transparent',
            color: subjectModalFilter === 'All' ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.74rem',
            fontWeight: '600',
          }}
        >
          All
        </button>

        {/* Year Level Pills */}
        {[1, 2, 3, 4].map(yr => {
          const key = `Year${yr}`;
          const isSelected = subjectModalFilter === key;
          const yrCount = annotatedSubjects.filter(s => s.yearLevel === yr && (showAllSemesters || !s.semester || s.semester === 'Both' || s.semester === activeSemester)).length;

          return (
            <button
              key={key}
              onClick={() => setSubjectModalFilter(key)}
              type="button"
              style={{
                padding: '3px 10px',
                borderRadius: '16px',
                border: isSelected ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-color)',
                background: isSelected ? 'rgba(86, 69, 238, 0.15)' : 'transparent',
                color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.74rem',
                fontWeight: isSelected ? '700' : '600',
              }}
            >
              {yr}{yr === 1 ? 'st' : yr === 2 ? 'nd' : yr === 3 ? 'rd' : 'th'} Year ({yrCount})
            </button>
          );
        })}

        <button
          onClick={() => setSubjectModalFilter('Minor')}
          type="button"
          style={{
            padding: '3px 10px',
            borderRadius: '16px',
            border: subjectModalFilter === 'Minor' ? '1.5px solid #f59e0b' : '1px solid var(--border-color)',
            background: subjectModalFilter === 'Minor' ? '#f59e0b' : 'transparent',
            color: subjectModalFilter === 'Minor' ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.74rem',
            fontWeight: '600',
          }}
        >
          Gen Ed / Minor
        </button>
      </div>
      
      {/* Toggles */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '500', userSelect: 'none' }}>
          <input 
            type="checkbox" 
            checked={showAllSemesters}
            onChange={(e) => setShowAllSemesters(e.target.checked)}
            style={{ accentColor: 'var(--accent-primary)', width: '14px', height: '14px', margin: 0 }}
          />
          Show Off-Semester Subjects
        </label>
      </div>

      <AutocompleteMultiSelect
        inputId="subject-autocomplete"
        allOptions={annotatedSubjects}
        options={filteredOptions}
        selectedIds={selectedSubjects}
        onToggle={(sub) => onToggleSubject(typeof sub === 'object' && sub !== null ? (sub.id || sub.code) : sub)}
        onBatchSelect={handleBatchSelect}
        onBatchDeselect={handleBatchDeselect}
        placeholder="Search subject code or title... (Use ↑↓ arrows and Enter)"
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
    </div>
  );
};

export default SubjectSelector;
