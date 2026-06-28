import React, { useState, useMemo } from 'react';
import '../../styles/ProfessorWorkload.css';

function ProfessorWorkload({ professors, schedules }) {
  const LOGO_SRC = '/logo.png?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [sortBy, setSortBy] = useState('name'); // 'name' or 'utilization'

  const professorIdOf = (s) => s?.professor?.id ?? s?.professorId ?? null;
  const matchesProfessor = (s, professor) => professorIdOf(s) != null && String(professorIdOf(s)) === String(professor?.id);

  const getDeptColor = (dept) => {
    if (!dept) return '#64748b'; // default slate
    const d = dept.toUpperCase();
    if (d.includes('BSCS')) return '#10b981'; // green
    if (d.includes('BSFT')) return '#f59e0b'; // amber
    if (d.includes('BSOA')) return '#8b5cf6'; // purple
    if (d.includes('BAEL')) return '#ec4899'; // pink
    if (d.includes('CRIM')) return '#ef4444'; // red
    if (d.includes('AGRI')) return '#84cc16'; // lime
    return '#3b82f6'; // blue
  };

  const processedProfessors = useMemo(() => {
    return professors.map(professor => {
      const profSchedules = schedules.filter(s => matchesProfessor(s, professor));
      
      const uniqueSubjectSections = new Map();
      for (const s of profSchedules) {
        const subjectId = s.subject?.id || s.subject?.code || 'unknown';
        const sectionId = s.section?.id || 'no-section';
        const key = `${subjectId}__${sectionId}`;
        if (!uniqueSubjectSections.has(key)) {
          uniqueSubjectSections.set(key, Number(s.subject?.credits) || 3);
        }
      }
      
      const units = Array.from(uniqueSubjectSections.values()).reduce((sum, c) => sum + c, 0);
      const cap = Math.max(1, Number(professor.maxUnits || professor.maxHours || 12));
      const utilization = (units / cap) * 100;

      let statusColor = '#10b981'; // Green
      let statusBg = 'rgba(16,185,129,0.15)';
      if (utilization > 100) {
        statusColor = '#ef4444'; // Red
        statusBg = 'rgba(239,68,68,0.15)';
      } else if (utilization >= 80) {
        statusColor = '#f59e0b'; // Yellow
        statusBg = 'rgba(245,158,11,0.15)';
      }

      return {
        ...professor,
        profSchedules,
        units,
        cap,
        utilization,
        statusColor,
        statusBg
      };
    });
  }, [professors, schedules]);

  const filteredAndSortedProfessors = useMemo(() => {
    let result = processedProfessors;

    // Filter by Search
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => (p.name || '').toLowerCase().includes(q));
    }

    // Filter by Department
    if (departmentFilter !== 'All') {
      result = result.filter(p => p.department === departmentFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'utilization') {
        return b.utilization - a.utilization; // Descending
      } else {
        return (a.name || '').localeCompare(b.name || '');
      }
    });

    return result;
  }, [processedProfessors, searchQuery, departmentFilter, sortBy]);

  const uniqueDepartments = useMemo(() => {
    const depts = new Set(professors.map(p => p.department).filter(Boolean));
    return ['All', ...Array.from(depts).sort()];
  }, [professors]);

  return (
    <div className="professor-workload-container pw-animate">

      {/* --- Premium Header --- */}
      <div className="pw-header">
        <div className="pw-header-logo">
          <img
            src={LOGO_SRC}
            alt="Logo"
            onError={(e) => {
              if (e.currentTarget.src !== FALLBACK_LOGO) {
                e.currentTarget.src = FALLBACK_LOGO;
              }
            }}
          />
        </div>
        <div className="pw-header-content">
          <h2 className="pw-header-title">CAPIZ STATE UNIVERSITY</h2>
          <h3 className="pw-header-subtitle">Faculty Workload Report</h3>
        </div>
        <div className="pw-header-meta">
          <div><strong>Doc. Code:</strong> CAPSU-F-046</div>
          <div><strong>Revision No.:</strong> 01</div>
          <div><strong>Effectivity:</strong> Sept 2023</div>
        </div>
      </div>

      {/* --- Controls --- */}
      <div className="pw-controls">
        <div className="pw-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input 
            type="text" 
            placeholder="Search faculty..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select 
          className="pw-select" 
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
        >
          {uniqueDepartments.map(dept => (
            <option key={dept} value={dept}>{dept === 'All' ? 'All Departments' : dept}</option>
          ))}
        </select>
        <select 
          className="pw-select" 
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="name">Sort by Name</option>
          <option value="utilization">Sort by Highest Workload</option>
        </select>
      </div>

      {/* --- Cards Grid --- */}
      {filteredAndSortedProfessors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px', opacity: 0.5 }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-main)' }}>No faculty found</h3>
          <p style={{ margin: 0 }}>Try adjusting your search or filter criteria.</p>
        </div>
      ) : (
        <div className="workload-list">
          {filteredAndSortedProfessors.map((prof) => (
            <div 
              key={prof.id} 
              className="pw-card"
              style={{ '--status-color': prof.statusColor, '--status-bg': prof.statusBg }}
            >
              
              <div className="pw-card-header">
                <div>
                  <h3 className="pw-card-name">{prof.name}</h3>
                  <p className="pw-card-dept" style={{ color: getDeptColor(prof.department) }}>
                    {prof.department}
                  </p>
                </div>
                <div className="pw-badge">
                  {prof.utilization.toFixed(0)}%
                </div>
              </div>

              <div className="pw-progress-container">
                <div className="pw-progress-bg">
                  <div className="pw-progress-fill" style={{ width: `${Math.min(prof.utilization, 100)}%` }}></div>
                </div>
              </div>

              <div className="pw-progress-text">
                {prof.units} <span>/ {prof.cap} units assigned</span>
              </div>

              <div className="pw-assignments">
                <h4 className="pw-assignments-title">Recent Assignments</h4>
                {prof.profSchedules.slice(0, 3).map((schedule, idx) => {
                  const dayShort = typeof schedule.day === 'string' ? schedule.day.slice(0, 3) : '—';
                  const timeStr = schedule.timeSlot?.time ?? schedule.timeSlot?.label ?? '';
                  const timeStart = typeof timeStr === 'string' && timeStr.includes(' - ')
                    ? timeStr.split(' - ')[0]
                    : timeStr || '—';
                  return (
                    <div key={schedule.id ?? idx} className="pw-assignment-item">
                      <span className="pw-assignment-subj">{schedule.subject?.code ?? '—'}</span>
                      <span className="pw-assignment-time">{dayShort} • {timeStart}</span>
                    </div>
                  );
                })}
                
                {prof.profSchedules.length === 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0, padding: '8px 0' }}>
                    No classes assigned yet.
                  </p>
                )}
                
                {prof.profSchedules.length > 3 && (
                  <button className="pw-more-btn">
                    +{prof.profSchedules.length - 3} more classes
                  </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProfessorWorkload;