import React, { useState, useMemo, useCallback } from 'react';
import { db } from '../../config/firebase';
import { writeBatch, getDocs, collection } from 'firebase/firestore';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { getMeetingTimeLabel } from '../../utils/scheduleUtils';

const getTimestampMs = (timestamp) => {
  if (!timestamp) return NaN;
  return timestamp.toMillis
    ? timestamp.toMillis()
    : (timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime());
};

const ScheduleHistory = ({ history, subjects = [], schedules = [], onBack }) => {
  const { confirm } = useGlobalDialog();
  const [expandedId, setExpandedId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'succeeded' | 'conflicts'
  const [searchQuery, setSearchQuery] = useState('');

  // Index subjects by code (exact & compact) and ID so legacy history entries that only stored
  // a subject code still display the full subject name.
  const subjectLookup = useMemo(() => {
    const map = new Map();
    (subjects || []).forEach((s) => {
      if (!s) return;
      const code = (s.code || '').trim();
      const id = (s.id != null ? String(s.id) : '').trim();
      if (code) {
        const upper = code.toUpperCase();
        const compact = upper.replace(/\s+/g, '');
        if (!map.has(upper)) map.set(upper, s);
        if (!map.has(compact)) map.set(compact, s);
      }
      if (id) {
        const upperId = id.toUpperCase();
        if (!map.has(upperId)) map.set(upperId, s);
      }
    });
    return map;
  }, [subjects]);

  const resolveSubjectDisplay = useCallback((item) => {
    if (!item) return { code: 'Unknown Subject', name: '', component: '' };

    let code = (item.subjectCode || '').trim();
    let name = (item.subjectName || '').trim();
    let component = (item.component || '').trim();
    let rawSubject = '';

    if (typeof item.subject === 'string') {
      rawSubject = item.subject.trim();
    } else if (item.subject && typeof item.subject === 'object') {
      if (!code && item.subject.code) code = String(item.subject.code).trim();
      if (!name && (item.subject.name || item.subject.title)) {
        name = String(item.subject.name || item.subject.title).trim();
      }
    }

    if (rawSubject) {
      let working = rawSubject;
      const compMatch = working.match(/\s*\((Lecture|Laboratory|Lec|Lab)\)\s*$/i);
      if (compMatch) {
        if (!component) {
          const normalized = compMatch[1].toLowerCase();
          component = (normalized === 'lec' || normalized === 'lecture') ? 'Lecture' : 'Laboratory';
        }
        working = working.slice(0, compMatch.index).trim();
      }

      if (!code || !name) {
        const dashSplit = working.split(/\s+[—–]\s+/);
        if (dashSplit.length >= 2) {
          if (!code) code = dashSplit[0].trim();
          if (!name) name = dashSplit.slice(1).join(' — ').trim();
        } else if (!code) {
          code = working;
        }
      }
    }

    if (code && !name) {
      const strippedCode = code.replace(/\s*\((Lecture|Laboratory|Lec|Lab)\)\s*$/i, '').trim();
      const exactKey = strippedCode.toUpperCase();
      const compactKey = exactKey.replace(/\s+/g, '');
      const matched = subjectLookup.get(exactKey) || subjectLookup.get(compactKey);
      if (matched) {
        code = (matched.code || strippedCode).trim();
        name = (matched.name || matched.title || '').trim();
      }
    }

    if (code && name && code.toLowerCase() === name.toLowerCase()) {
      name = '';
    }

    return {
      code: code || name || 'Unknown Subject',
      name: code ? name : '',
      component
    };
  }, [subjectLookup]);

  const getSucceededSchedulesForRecord = useCallback((record, recordIndex) => {
    if (Array.isArray(record.createdSchedules) && record.createdSchedules.length > 0) {
      return { items: record.createdSchedules, isInferred: false };
    }

    // Legacy fallback: older auto-schedule history records did not persist createdSchedules,
    // so match active schedules created immediately prior to this history record's timestamp.
    if (record.successCount > 0 && Array.isArray(schedules) && schedules.length > 0) {
      const recordMs = getTimestampMs(record.timestamp);
      if (!isNaN(recordMs)) {
        const prevRecord = history?.[recordIndex + 1];
        const prevRecordMs = prevRecord ? getTimestampMs(prevRecord.timestamp) : NaN;
        const windowStart = !isNaN(prevRecordMs)
          ? Math.max(recordMs - 60000, prevRecordMs + 1)
          : recordMs - 60000;
        const windowEnd = recordMs + 5000;

        const matched = schedules
          .filter((s) => {
            const createdMs = typeof s.createdAt === 'number'
              ? s.createdAt
              : getTimestampMs(s.createdAt);
            if (isNaN(createdMs) || createdMs < windowStart || createdMs > windowEnd) return false;
            if (record.semester && s.semester && record.semester !== s.semester) return false;
            if (record.schoolYear && s.schoolYear && record.schoolYear !== s.schoolYear) return false;
            return true;
          })
          .map((s) => ({
            subjectCode: s.subject?.code || '',
            subjectName: s.subject?.name || s.subject?.title || '',
            subject: s.subject?.code || s.subject?.name || 'Unknown',
            component: s.component || '',
            section: s.section?.name || '',
            professor: s.professor?.name || '',
            room: s.room?.name || '',
            day: s.day || '',
            timeSlot: getMeetingTimeLabel(s.timeSlot, s.hours || s.subject?.hoursPerMeeting)
              || s.timeSlot?.customLabel
              || s.timeSlot?.label
              || s.timeSlot?.time
              || ''
          }));

        if (matched.length > 0) {
          return { items: matched, isInferred: true };
        }
      }
    }

    return { items: [], isInferred: false };
  }, [schedules, history]);

  const handleClearHistory = async () => {
    const isConfirmed = await confirm({
      title: 'Clear History?',
      text: 'This will permanently delete all scheduling history records. This action cannot be undone.',
      icon: 'warning',
      confirmButtonText: 'Yes, delete it!',
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading('Clearing history...');
      try {
        const snap = await getDocs(collection(db, 'scheduleHistory'));
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        toast.success('Schedule history has been successfully cleared.', { id: toastId });
      } catch (error) {
        console.error("Error clearing history:", error);
        toast.error('Failed to clear history. Please try again later.', { id: toastId });
      }
    }
  };

  const toggleExpand = (id, initialFilter = 'all') => {
    if (expandedId === id) {
      if (initialFilter !== 'all' && activeFilter !== initialFilter) {
        setActiveFilter(initialFilter);
      } else {
        setExpandedId(null);
        setActiveFilter('all');
        setSearchQuery('');
      }
    } else {
      setExpandedId(id);
      setActiveFilter(initialFilter);
      setSearchQuery('');
    }
  };

  const formatDate = (timestamp) => {
    const ms = getTimestampMs(timestamp);
    if (isNaN(ms)) return 'Unknown Date';
    const date = new Date(ms);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  const matchesSearch = (query, fields) => {
    if (!query) return true;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return fields.some((f) => f && String(f).toLowerCase().includes(q));
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 'calc(100vh - 120px)' }}>
      <div className="mgmt-header" style={{ flexShrink: 0, paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
        <div className="mgmt-header-left" style={{ flex: 1 }}>
          <button className="back-btn" onClick={onBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Back
          </button>
          <div className="mgmt-header-info">
            <h3 className="card-title">Scheduling History</h3>
          </div>
        </div>
        <button
          className="btn"
          onClick={handleClearHistory}
          disabled={!history || history.length === 0}
          style={{
            background: (!history || history.length === 0) ? 'var(--bg-main)' : 'var(--danger-bg)',
            color: (!history || history.length === 0) ? 'var(--text-muted)' : 'var(--danger)',
            border: (!history || history.length === 0) ? '1px solid var(--border-color)' : '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Clear History
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overscrollBehaviorY: 'auto', padding: '20px', paddingRight: '12px', marginRight: '4px' }} className="custom-scrollbar">
        {(!history || history.length === 0) ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: 'var(--text-muted)' }}>
            <div style={{ width: '80px', height: '80px', background: 'var(--bg-main)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>No History Found</h3>
            <p style={{ margin: 0, fontSize: '0.95rem' }}>Your scheduling generations will appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {history.map((record, recordIndex) => {
              const isExpanded = expandedId === record.id;
              const hasErrors = record.errorCount > 0 || (record.errors && record.errors.length > 0);
              const hasSuccesses = record.successCount > 0 || (record.createdSchedules && record.createdSchedules.length > 0);
              const { items: succeededSchedules, isInferred: isInferredSuccess } = isExpanded
                ? getSucceededSchedulesForRecord(record, recordIndex)
                : { items: [], isInferred: false };
              const errorItems = record.errors || [];
              const termLabel = [record.semester, record.schoolYear].filter(Boolean).join(' · ');

              const filteredSucceeded = isExpanded
                ? succeededSchedules.filter((sc) => {
                    const subj = resolveSubjectDisplay(sc);
                    return matchesSearch(searchQuery, [
                      subj.code,
                      subj.name,
                      subj.component,
                      sc.section,
                      sc.professor,
                      sc.room,
                      sc.day,
                      sc.timeSlot
                    ]);
                  })
                : [];

              const filteredErrors = isExpanded
                ? errorItems.filter((err) => {
                    const subj = resolveSubjectDisplay(err);
                    return matchesSearch(searchQuery, [
                      subj.code,
                      subj.name,
                      subj.component,
                      err.section,
                      err.reason,
                      err.details?.suggestion
                    ]);
                  })
                : [];

              const showSucceededSection = (activeFilter === 'all' || activeFilter === 'succeeded') && hasSuccesses;
              const showErrorsSection = (activeFilter === 'all' || activeFilter === 'conflicts') && hasErrors;
              const totalDetailedCount = succeededSchedules.length + errorItems.length;

              return (
                <div key={record.id} style={{
                  border: `1px solid ${isExpanded ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  borderRadius: '16px',
                  background: isExpanded ? 'var(--card-bg)' : 'var(--bg-main)',
                  boxShadow: isExpanded ? '0 8px 24px rgba(0,0,0,0.06)' : '0 2px 8px rgba(0,0,0,0.02)',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                  <div
                    onClick={() => toggleExpand(record.id, 'all')}
                    className="history-card-header"
                    style={{
                      padding: '20px',
                      display: 'flex',
                      gap: '16px',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderBottom: isExpanded ? '1px solid var(--border-color)' : '1px solid transparent',
                      transition: 'all 0.3s ease',
                      position: 'relative'
                    }}
                  >
                    <div className="history-card-info" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '12px',
                        background: hasErrors ? 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(217,119,6,0.1))' : 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.1))',
                        color: hasErrors ? '#d97706' : '#10b981',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${hasErrors ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}`,
                        flexShrink: 0
                      }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {hasErrors ? (
                            <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></>
                          ) : (
                            <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></>
                          )}
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: '1.05rem', color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                          {formatDate(record.timestamp)}
                        </strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                          <span style={{
                            background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                            padding: '2px 8px', borderRadius: '6px', color: 'var(--text-muted)',
                            textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', fontSize: '0.75rem'
                          }}>
                            {record.engineMode} Mode
                          </span>
                          {termLabel && (
                            <span style={{
                              background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)',
                              padding: '2px 8px', borderRadius: '6px', color: 'var(--accent-primary)',
                              fontWeight: 600, fontSize: '0.75rem'
                            }}>
                              {termLabel}
                            </span>
                          )}
                          <span style={{ color: 'var(--text-muted)' }}>
                            Attempted: <strong style={{ color: 'var(--text-main)' }}>{record.totalAttempted}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="history-card-stats" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(record.id, 'succeeded');
                        }}
                        title="View succeeded schedules"
                        style={{
                          textAlign: 'center',
                          minWidth: '64px',
                          background: (isExpanded && activeFilter === 'succeeded') ? 'rgba(16,185,129,0.12)' : 'transparent',
                          border: (isExpanded && activeFilter === 'succeeded') ? '1px solid rgba(16,185,129,0.35)' : '1px solid transparent',
                          borderRadius: '10px',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{record.successCount}</div>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginTop: '4px', letterSpacing: '0.02em' }}>Success</div>
                      </button>
                      <div className="history-card-stats-divider" style={{ width: '1px', height: '30px', background: 'var(--border-color)' }}></div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(record.id, hasErrors ? 'conflicts' : 'all');
                        }}
                        title={hasErrors ? 'View conflicts / unscheduled classes' : 'No conflicts'}
                        style={{
                          textAlign: 'center',
                          minWidth: '64px',
                          background: (isExpanded && activeFilter === 'conflicts') ? 'rgba(239,68,68,0.12)' : 'transparent',
                          border: (isExpanded && activeFilter === 'conflicts') ? '1px solid rgba(239,68,68,0.35)' : '1px solid transparent',
                          borderRadius: '10px',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: hasErrors ? '#ef4444' : 'var(--text-muted)', lineHeight: 1 }}>{record.errorCount}</div>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginTop: '4px', letterSpacing: '0.02em' }}>Failed</div>
                      </button>
                      <div className="history-card-chevron" style={{
                        color: isExpanded ? 'var(--accent-primary)' : 'var(--text-muted)',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isExpanded ? 'rgba(86, 69, 238, 0.1)' : 'transparent', borderRadius: '50%'
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '20px', background: 'var(--card-bg)' }}>
                      {/* Success / Status Banner */}
                      {!hasErrors && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'rgba(16,185,129,0.08)', borderRadius: '12px', border: '1px dashed rgba(16,185,129,0.3)', marginBottom: '16px' }}>
                          <div style={{ width: '32px', height: '32px', background: '#10b981', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          </div>
                          <div>
                            <div style={{ color: '#059669', fontWeight: 700, fontSize: '0.95rem' }}>
                              {record.engineMode === 'manual' ? 'Manual Schedule Created Successfully!' : 'Perfect Generation!'}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
                              {record.engineMode === 'manual'
                                ? 'The manual schedule entry was validated and saved to timetable.'
                                : 'All requested classes were scheduled successfully without conflicts.'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* View Filter Pills & Search Toolbar */}
                      {(hasSuccesses || hasErrors) && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '10px',
                          marginBottom: '16px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => setActiveFilter('all')}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                border: activeFilter === 'all' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                background: activeFilter === 'all' ? 'var(--accent-primary)' : 'var(--bg-main)',
                                color: activeFilter === 'all' ? '#ffffff' : 'var(--text-main)'
                              }}
                            >
                              All ({(succeededSchedules.length || record.successCount || 0) + (errorItems.length || record.errorCount || 0)})
                            </button>
                            {hasSuccesses && (
                              <button
                                type="button"
                                onClick={() => setActiveFilter('succeeded')}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  border: activeFilter === 'succeeded' ? '1px solid #10b981' : '1px solid rgba(16,185,129,0.3)',
                                  background: activeFilter === 'succeeded' ? '#10b981' : 'rgba(16,185,129,0.08)',
                                  color: activeFilter === 'succeeded' ? '#ffffff' : '#059669'
                                }}
                              >
                                Succeeded ({succeededSchedules.length || record.successCount})
                              </button>
                            )}
                            {hasErrors && (
                              <button
                                type="button"
                                onClick={() => setActiveFilter('conflicts')}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  border: activeFilter === 'conflicts' ? '1px solid #ef4444' : '1px solid rgba(239,68,68,0.3)',
                                  background: activeFilter === 'conflicts' ? '#ef4444' : 'rgba(239,68,68,0.08)',
                                  color: activeFilter === 'conflicts' ? '#ffffff' : '#dc2626'
                                }}
                              >
                                Conflicts ({errorItems.length || record.errorCount})
                              </button>
                            )}
                          </div>

                          {totalDetailedCount > 4 && (
                            <div style={{ position: 'relative', minWidth: '220px', flex: '0 1 280px' }}>
                              <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search subject, section, faculty, room..."
                                style={{
                                  width: '100%',
                                  padding: '6px 28px 6px 10px',
                                  fontSize: '0.82rem',
                                  borderRadius: '8px',
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--bg-main)',
                                  color: 'var(--text-main)',
                                  boxSizing: 'border-box',
                                  outline: 'none'
                                }}
                              />
                              {searchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setSearchQuery('')}
                                  title="Clear search"
                                  style={{
                                    position: 'absolute',
                                    right: '6px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    lineHeight: 1,
                                    padding: '2px 4px'
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Scheduled Classes Display (for both auto-scheduled & manual successful items) */}
                      {showSucceededSection && (
                        <div style={{ marginBottom: showErrorsSection ? '20px' : '0' }}>
                          <h4 style={{ color: '#059669', margin: '0 0 12px', fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            <span>
                              Scheduled Classes ({searchQuery ? `${filteredSucceeded.length} of ${succeededSchedules.length}` : (succeededSchedules.length || record.successCount)})
                            </span>
                            {isInferredSuccess && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)', background: 'var(--bg-main)', border: '1px solid var(--border-color)', padding: '2px 7px', borderRadius: '999px' }}>
                                Matched from current timetable
                              </span>
                            )}
                          </h4>

                          {succeededSchedules.length > 0 ? (
                            filteredSucceeded.length > 0 ? (
                              <div
                                className="custom-scrollbar"
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                                  gap: '10px',
                                  maxHeight: '460px',
                                  overflowY: 'auto',
                                  paddingRight: '4px'
                                }}
                              >
                                {filteredSucceeded.map((sc, i) => {
                                  const subj = resolveSubjectDisplay(sc);
                                  return (
                                    <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderLeft: '4px solid #10b981', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                          <span>{subj.code}</span>
                                          {subj.component && (
                                            <span style={{
                                              fontSize: '0.68rem',
                                              fontWeight: 600,
                                              padding: '1px 6px',
                                              borderRadius: '4px',
                                              background: 'rgba(16,185,129,0.12)',
                                              color: '#059669'
                                            }}>
                                              {subj.component}
                                            </span>
                                          )}
                                        </div>
                                        {sc.section && (
                                          <span style={{
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            color: 'var(--text-muted)',
                                            background: 'var(--card-bg)',
                                            border: '1px solid var(--border-color)',
                                            padding: '1px 7px',
                                            borderRadius: '6px',
                                            whiteSpace: 'nowrap'
                                          }}>
                                            {sc.section}
                                          </span>
                                        )}
                                      </div>
                                      {subj.name && (
                                        <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-main)', opacity: 0.9, lineHeight: 1.3 }}>
                                          {subj.name}
                                        </div>
                                      )}
                                      <div style={{ color: 'var(--text-muted)', fontSize: '0.79rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                                        <span>📅 {sc.day || 'TBA'}{sc.timeSlot ? ` (${sc.timeSlot})` : ''}</span>
                                        {sc.room && (
                                          <>
                                            <span>·</span>
                                            <span>🚪 {sc.room}</span>
                                          </>
                                        )}
                                      </div>
                                      {sc.professor && (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                          👨‍🏫 {sc.professor}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div style={{ padding: '14px', background: 'var(--bg-main)', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.84rem', textAlign: 'center' }}>
                                No scheduled classes match &ldquo;{searchQuery}&rdquo;.
                              </div>
                            )
                          ) : (
                            <div style={{ padding: '14px 16px', background: 'var(--bg-main)', border: '1px dashed rgba(16,185,129,0.35)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.45 }}>
                              <strong style={{ color: '#059669' }}>{record.successCount}</strong> class{record.successCount === 1 ? '' : 'es'} succeeded in this older run. Detailed class snapshots are automatically saved for all newly generated schedules.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Unscheduled / Conflicts Display */}
                      {showErrorsSection && (
                        <div>
                          <h4 style={{ color: '#ef4444', margin: '0 0 12px', fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            Unscheduled / Conflicts ({searchQuery ? `${filteredErrors.length} of ${errorItems.length}` : (errorItems.length || record.errorCount)})
                          </h4>
                          {filteredErrors.length > 0 ? (
                            <div
                              className="custom-scrollbar"
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                                gap: '12px',
                                maxHeight: '460px',
                                overflowY: 'auto',
                                paddingRight: '4px'
                              }}
                            >
                              {filteredErrors.map((err, idx) => {
                                const subj = resolveSubjectDisplay(err);
                                return (
                                  <div key={idx} style={{
                                    padding: '14px 16px',
                                    background: 'var(--bg-main)',
                                    border: '1px solid var(--border-color)',
                                    borderLeft: '4px solid #ef4444',
                                    borderRadius: '10px',
                                    fontSize: '0.88rem',
                                    transition: 'transform 0.2s',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                      <div style={{ fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                                        <span>{subj.code}</span>
                                        {subj.component && (
                                          <span style={{
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            background: 'rgba(239,68,68,0.12)',
                                            color: '#dc2626'
                                          }}>
                                            {subj.component}
                                          </span>
                                        )}
                                      </div>
                                      {err.section && (
                                        <span style={{
                                          fontSize: '0.72rem',
                                          fontWeight: 600,
                                          color: 'var(--text-muted)',
                                          background: 'var(--card-bg)',
                                          border: '1px solid var(--border-color)',
                                          padding: '1px 7px',
                                          borderRadius: '6px',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {err.section}
                                        </span>
                                      )}
                                    </div>
                                    {subj.name && (
                                      <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-main)', opacity: 0.9, lineHeight: 1.3 }}>
                                        {subj.name}
                                      </div>
                                    )}
                                    <div style={{ color: '#dc2626', fontSize: '0.84rem', display: 'flex', alignItems: 'flex-start', gap: '6px', lineHeight: 1.4, marginTop: '2px' }}>
                                      <span style={{ opacity: 0.7 }}>↳</span>
                                      <span>{err.reason}</span>
                                    </div>
                                    {err.details?.suggestion && (
                                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'rgba(99,102,241,0.05)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.1)' }}>
                                        💡 <strong>Tip:</strong> {err.details.suggestion}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ padding: '14px', background: 'var(--bg-main)', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.84rem', textAlign: 'center' }}>
                              No conflicts match &ldquo;{searchQuery}&rdquo;.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inject custom scrollbar CSS for the history list */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(0,0,0,0.1);
          border-radius: 10px;
          border: 2px solid var(--card-bg);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0,0,0,0.2);
        }
        [data-theme='dark'] .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(255,255,255,0.1);
          border: 2px solid var(--card-bg);
        }
        [data-theme='dark'] .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(255,255,255,0.2);
        }

        /* Mobile specific styling for ScheduleHistory */
        @media (max-width: 768px) {
          .mgmt-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .mgmt-header > button {
            width: 100%;
          }
          .history-card-header {
            flex-direction: column;
            align-items: flex-start !important;
            padding: 16px !important;
            position: relative;
          }
          .history-card-info {
            width: 100%;
            box-sizing: border-box;
            padding-right: 48px;
            margin-bottom: 12px;
          }
          .history-card-info strong {
            font-size: 0.95rem !important;
            line-height: 1.3;
          }
          .history-card-stats {
            width: 100%;
            justify-content: space-around;
            padding-top: 12px;
            border-top: 1px dashed var(--border-color);
          }
          .history-card-chevron {
            position: absolute;
            top: 24px;
            right: 14px;
          }
        }
      `}</style>
    </div>
  );
};

export default ScheduleHistory;
