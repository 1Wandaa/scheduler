import React, { useState, useRef } from 'react';
import { suggestProfessorMatches } from '../../utils/scheduleAI';
import { TIME_SLOTS, DAYS, SCHEDULE_MODES, getScheduleConfig } from '../../config/constants';
import { getMeetingTimeLabel } from '../../utils/scheduleUtils';
import '../../styles/AutoScheduler.css';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import CustomSelect from '../CustomSelect/CustomSelect';

// 1. ADDED 'schedules', 'onLogHistory', and 'onAutoScheduleBatch' to the props list
function AutoScheduler({ validator, subjects, sections, professors, rooms, schedules, activeSemester, onLogHistory }) {
  const { confirm } = useGlobalDialog();
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, placed: 0, total: 0, pass: 0 });
  const abortRef = useRef(null);

  const [engineMode, setEngineMode] = useState('full');
  const [targetId, setTargetId] = useState('');
  const [scheduleMode, setScheduleMode] = useState(SCHEDULE_MODES.STANDARD);

  // Constraints
  const [respectLabs, setRespectLabs] = useState(true);
  const [preventDoubleBooking, setPreventDoubleBooking] = useState(true);
  const [aiAssisted, setAiAssisted] = useState(true);
  const [aiStatus, setAiStatus] = useState('');
  const [, setAiInsights] = useState(null);

  // Listen for custom events to change engine mode from mobile Speed Dial
  React.useEffect(() => {
    const handleModeChange = (e) => {
      if (e.detail) {
        setEngineMode(e.detail);
        setTargetId('');
      }
    };
    const handleExecuteEvent = (e) => {
      if (e.detail) {
        if (e.detail === 'ga' || e.detail.mode === 'ga' || e.detail === 'full' || e.detail.mode === 'full') {
          setEngineMode('full');
          setTargetId('');
        } else {
          setEngineMode(e.detail.mode);
          setTargetId(e.detail.targetId);
        }
        setTimeout(() => document.getElementById('btn-execute-autoschedule')?.click(), 100);
      }
    };
    window.addEventListener('change-autoscheduler-mode', handleModeChange);
    window.addEventListener('execute-autoscheduler', handleExecuteEvent);
    return () => {
      window.removeEventListener('change-autoscheduler-mode', handleModeChange);
      window.removeEventListener('execute-autoscheduler', handleExecuteEvent);
    };
  }, []);

  // Only consider subjects that match the currently selected active semester
  const activeSemesterSubjects = subjects.filter(sub => !sub.semester || sub.semester === 'Both' || sub.semester === activeSemester);

  // CLEAR ALL SCHEDULES (Independent action)
  const handleClearAll = async () => {
    const isConfirmed = await confirm({
      title: 'Clear All Schedules?',
      text: "⚠️ This will permanently delete ALL scheduled classes. Are you sure you want to proceed?",
      icon: 'warning',
      confirmButtonText: 'Yes, Clear All',
      isDestructive: true
    });

    if (!isConfirmed) return;

    setClearing(true);
    try {
      await validator.clearAllSchedules();
      setResult(null);
      setAiInsights(null);
      setAiStatus('');
      toast.success('All schedules have been removed.');
    } catch (e) {
      console.error('Failed to clear schedules:', e);
      toast.error('Failed to clear schedules.');
    }
    setClearing(false);
  };

  // Cancel handler
  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  // Run the Targeted Heuristic Engine (Greedy)
  const runTargeted = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setResult(null);
    setProgress({ percent: 0, placed: 0, total: 0, pass: 0 });
    setAiInsights(null);
    setAiStatus('');
    try {
      // AI pre-processing: build professor-subject match map
      let aiProfessorMap = null;
      if (aiAssisted) {
        try {
          setAiStatus('🧠 AI analyzing professor-subject compatibility...');
          aiProfessorMap = await suggestProfessorMatches(professors, activeSemesterSubjects, sections, schedules);
          // Check if cancelled during AI call
          if (controller.signal.aborted) {
            setResult({ schedule: [], unscheduled: [], prescriptions: [], error: 'Cancelled by user.', mode: engineMode });
            abortRef.current = null;
            setLoading(false);
            return;
          }
          if (aiProfessorMap) {
            setAiStatus('✅ AI matching complete — starting targeted engine with optimized assignments');
          } else {
            setAiStatus('⚠️ AI matching returned no results — using default matching');
          }
        } catch (aiError) {
          if (controller.signal.aborted) {
            setResult({ schedule: [], unscheduled: [], prescriptions: [], error: 'Cancelled by user.', mode: engineMode });
            abortRef.current = null;
            setLoading(false);
            return;
          }
          console.warn('[AI] Pre-processing failed:', aiError);
          setAiStatus('⚠️ AI unavailable — using default matching');
        }
      }

      // Check again before starting scheduler
      if (controller.signal.aborted) {
        setResult({ schedule: [], unscheduled: [], prescriptions: [], error: 'Cancelled by user.', mode: engineMode });
        abortRef.current = null;
        setLoading(false);
        return;
      }

      const constraints = { respectLabs, preventDoubleBooking, aiProfessorMap, scheduleMode };
      const schedulerOptions = {
        onProgress: (p) => setProgress(p),
        signal: controller.signal,
      };
      let r = null;

      if (engineMode === 'full') r = await validator.autoScheduleFull(constraints, schedulerOptions);
      else if (engineMode === 'faculty') r = await validator.autoScheduleForFaculty(targetId, constraints, schedulerOptions);
      else if (engineMode === 'room') r = await validator.autoScheduleForRoom(targetId, constraints, schedulerOptions);
      else if (engineMode === 'section') r = await validator.autoScheduleForSection(targetId, constraints, schedulerOptions);
      else throw new Error('Invalid mode selected.');

      const unscheduledResults = r.unscheduled || [];

      setResult({
        schedule: r.results || [],
        unscheduled: unscheduledResults,
        prescriptions: [],
        error: r.error || null,
        mode: engineMode
      });

      if (r.results && r.results.length > 0) {
        setAiStatus('💾 Saving schedules to database...');
        const batchResult = await validator.addSchedulesBatch(r.results, scheduleMode);
        if (!batchResult.ok) {
          toast.error('Failed to save some schedules to the database.');
          console.error('Batch save error:', batchResult.errors);
        } else {
          toast.success(`Successfully saved ${batchResult.writtenCount} schedules.`, {
            action: {
              label: 'View Schedules',
              onClick: () => window.location.href = '/dashboard/view-schedules'
            }
          });
        }
      }

      if (aiAssisted && unscheduledResults.length === 0) {
        setAiStatus('✅ All classes scheduled successfully');
      } else if (aiAssisted) {
        setAiStatus('⚠️ Auto-scheduler completed with some conflicts. Review the results below.');
      }

      if (onLogHistory) {
        onLogHistory({
          engineMode,
          totalAttempted: (r.results || []).length + unscheduledResults.length,
          successCount: (r.results || []).length,
          errorCount: unscheduledResults.length,
          errors: unscheduledResults.map(u => ({
            subject: u.subject?.code || u.subject?.name || 'Unknown',
            section: u.section?.name || 'Unknown',
            reason: u.reason || 'Insufficient slots or conflict',
            details: u.details || null
          }))
        });
      }

    } catch (e) {
      setResult({ schedule: [], unscheduled: [], prescriptions: [], error: e.message, mode: engineMode });
    }
    abortRef.current = null;
    setLoading(false);
  };



  const handleExecute = () => {
    runTargeted();
  };

  const targetOptions = React.useMemo(() => {
    if (engineMode === 'faculty') {
      return (professors || [])
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(p => ({
          value: p.id,
          label: p.department ? `${p.name} (${p.department})` : p.name
        }));
    }
    if (engineMode === 'room') {
      return Object.entries(
        (rooms || []).reduce((acc, r) => {
          const b = r.building || 'Other';
          if (!acc[b]) acc[b] = [];
          acc[b].push(r);
          return acc;
        }, {})
      )
        .sort(([bA], [bB]) => bA.localeCompare(bB))
        .map(([building, bRooms]) => ({
          label: building,
          options: bRooms
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
            .map(r => ({
              value: r.id,
              label: r.name + (r.type && r.type !== 'Lecture' ? ` [${r.type}]` : '')
            }))
        }));
    }
    if (engineMode === 'section') {
      return (sections || [])
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
        .map(s => ({
          value: s.id,
          label: s.department ? `${s.name} (${s.department})` : s.name
        }));
    }
    return [];
  }, [engineMode, professors, rooms, sections]);

  const targetPlaceholder =
    engineMode === 'faculty' ? 'Search or select faculty...' :
    engineMode === 'room' ? 'Search or select room...' :
    engineMode === 'section' ? 'Search or select section...' :
    'Choose...';

  // Group schedules by Day for cleaner UI
  const groupedSchedule = result?.schedule?.reduce((acc, curr) => {
    if (!acc[curr.day]) acc[curr.day] = [];
    acc[curr.day].push(curr);
    return acc;
  }, {}) || {};

  return (
    <div className="card" style={{ overflow: 'visible' }}>
      <div style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
        <h2 style={{ margin: '0 0 5px 0', color: 'var(--accent-dark)' }}>Smart Auto-Scheduler</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Generate conflict-free timetables automatically.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
        <div className="form-group">
          <label className="form-label">Engine Mode</label>
          <select
            className="form-select"
            value={engineMode}
            onChange={(e) => { setEngineMode(e.target.value); setTargetId(''); }}
          >
            <option value="full">Full Timetable</option>
            <option value="faculty">By Faculty</option>
            <option value="room">By Room</option>
            <option value="section">By Section</option>
          </select>
        </div>

        {engineMode !== 'full' && (
          <div className="form-group">
            <label className="form-label">Select Target</label>
            <CustomSelect
              name="targetId"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={targetPlaceholder}
              options={targetOptions}
            />
          </div>
        )}
      </div>

      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'var(--table-header)', borderRadius: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={preventDoubleBooking} onChange={(e) => setPreventDoubleBooking(e.target.checked)} />
          Strict Non-Overlap (Faculty, Room, Section)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={respectLabs} onChange={(e) => setRespectLabs(e.target.checked)} />
          Enforce Lab Requirements (Computer & Food)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: 'var(--accent-primary)' }}>
          <input type="checkbox" checked={aiAssisted} onChange={(e) => setAiAssisted(e.target.checked)} />
          <strong>🧠 AI-Assisted Mode</strong>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '400' }}>— Gemini optimizes professor matching & generates prescriptions</span>
        </label>
      </div>

      {/* Schedule Mode Selector */}
      <div style={{ marginBottom: '32px' }}>
        <label className="form-label" style={{ marginBottom: '12px', display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Class Schedule Type</label>
        
        {/* Ultra-Minimalist Segmented Control (Themed) */}
        <div style={{ 
          display: 'inline-flex', 
          backgroundColor: 'var(--bg-main)', 
          borderRadius: '8px', 
          padding: '4px', 
          gap: '2px',
          border: '1px solid var(--border-color)'
        }}>
          <button
            type="button"
            onClick={() => setScheduleMode(SCHEDULE_MODES.STANDARD)}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
              letterSpacing: '0.3px',
              background: scheduleMode === SCHEDULE_MODES.STANDARD ? 'var(--accent-primary)' : 'transparent',
              color: scheduleMode === SCHEDULE_MODES.STANDARD ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.2s ease',
              outline: 'none',
            }}
          >
            5-Day Standard
          </button>

          <button
            type="button"
            onClick={() => setScheduleMode(SCHEDULE_MODES.FOUR_DAY)}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
              letterSpacing: '0.3px',
              background: scheduleMode === SCHEDULE_MODES.FOUR_DAY ? 'var(--accent-primary)' : 'transparent',
              color: scheduleMode === SCHEDULE_MODES.FOUR_DAY ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.2s ease',
              outline: 'none',
            }}
          >
            4-Day Accelerated
          </button>
        </div>

        {/* Minimalist Info Callouts (Themed) */}
        <div style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6', maxWidth: '600px' }}>
          {scheduleMode === SCHEDULE_MODES.FOUR_DAY ? (
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>Monday–Thursday</strong> only.<br/>
              Morning: 7:00 AM – 11:30 AM <span style={{ opacity: 0.5 }}>|</span> Lunch: 11:30 AM – 12:30 PM <span style={{ opacity: 0.5 }}>|</span> Afternoon: 12:30 PM – 6:00 PM
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>Monday–Friday</strong>.<br/>
              Morning: 7:30 AM – 12:00 PM <span style={{ opacity: 0.5 }}>|</span> Lunch: 12:00 PM – 1:00 PM <span style={{ opacity: 0.5 }}>|</span> Afternoon: 1:00 PM – 5:00 PM
            </p>
          )}
        </div>
      </div>

      {/* Pre-Scheduling Summary */}
      <div style={{ marginBottom: '15px', padding: '10px 15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
        <strong>Pre-flight Summary:</strong> {sections?.reduce((sum, sec) => sum + (sec.subjects?.length || 0), 0) || 0} subjects total across all sections ready to be scheduled.
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {!loading ? (
          <>
            <button id="btn-execute-autoschedule" onClick={handleExecute} disabled={clearing || (engineMode !== 'full' && !targetId)} className="btn" style={{ flex: 1, padding: '14px', fontSize: '1rem', whiteSpace: 'nowrap', minWidth: '200px' }}>
              Generate Timetable
            </button>
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="btn-danger-outline"
            >
              {clearing ? 'Clearing...' : '🗑 Clear All Schedules'}
            </button>
          </>
        ) : (
          <button
            onClick={handleCancel}
            className="btn-danger-outline"
            style={{ flex: 1, padding: '14px', fontSize: '1rem', minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Cancel Scheduling
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {loading && (
        <div style={{ marginTop: '12px',  }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
              {progress.pass > 0
                ? `Pass ${progress.pass}/${aiAssisted ? '4' : '3'} — ${progress.percent}%`
                : 'Preparing...'}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {progress.placed > 0 ? `${progress.placed} placed of ${progress.total} groups` : ''}
            </span>
          </div>
          <div style={{ height: '10px', background: 'var(--border-color)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              width: `${progress.percent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--accent-primary), #7c3aed)',
              borderRadius: '5px',
              transition: 'width 0.3s ease',
              boxShadow: progress.percent > 0 ? '0 0 8px rgba(99,102,241,0.4)' : 'none',
            }} />
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.78rem', marginTop: '6px', color: 'var(--text-muted)' }}>
            {progress.pass === 1 && (scheduleMode === SCHEDULE_MODES.FOUR_DAY
              ? 'Scheduling with 4-day rooms & preferred day pairs (Mon–Thu)...'
              : 'Scheduling with department rooms & preferred day pairs...')}
            {progress.pass === 2 && 'Trying shared rooms with flexible days...'}
            {progress.pass === 3 && 'Attempting overflow placement with all rooms...'}
            {progress.pass === 4 && 'AI resolving remaining conflicts...'}
            {progress.pass === 0 && 'Initializing scheduler...'}
          </p>
        </div>
      )}

      {/* AI Status */}
      {aiStatus && (
        <div className="ai-status-panel">
          {aiStatus}
        </div>
      )}



      {/* Results Section */}
      {result && !loading && (
        <div style={{ marginTop: '30px',  }}>

          {/* Error Message */}
          {result.error && (
            <div className="alert-danger" style={{ padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <strong>Engine Error:</strong> {result.error}
            </div>
          )}

          {/* Data Issues (Pre-flight infeasible items) */}
          {result.prescriptions?.some(p => p.isDataIssue) && (
            <div className="result-section data-issues-section">
              <h3>
                ⚠️ Data Issues ({result.prescriptions.filter(p => p.isDataIssue).length})
              </h3>
              <p className="section-description">
                These subjects cannot be scheduled due to missing data (e.g., no eligible professors or rooms). Please fix these in Management before running again.
              </p>
              <div className="card-list">
                {result.prescriptions.filter(p => p.isDataIssue).map((p, idx) => (
                  <div key={idx} className="data-issue-card">
                    <div className="card-title">
                      {p.subject?.code || p.subject?.name} {p.section?.name ? `— ${p.section.name}` : ''}
                    </div>
                    <div className="card-reason">
                      {p.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Grouped by Day */}
          {result.schedule.length > 0 && (
            <div className="result-section success-section">
              <h3>
                Successfully Scheduled ({result.schedule.length})
              </h3>

              <div className="schedule-list">
                {DAYS.map(day => {
                  const dayClasses = groupedSchedule[day];
                  if (!dayClasses || dayClasses.length === 0) return null;

                  return (
                    <div key={day} className="day-group">
                      <h4>{day}</h4>
                      <div className="card-list">
                        {dayClasses.map((item, idx) => (
                          <div key={idx} className={`schedule-card ${item.prescriptionNote ? 'warning-border' : 'success-border'}`}>
                            <div className="schedule-card-header">
                              <span>{item.subject.code} {item.section ? `(${item.section.name})` : ''}</span>
                              <span>{getMeetingTimeLabel(item.timeSlot, item.subject?.hoursPerMeeting) || item.timeSlot.label}</span>
                            </div>
                            <div className="schedule-card-body">
                              {item.room.name} • Prof. {item.professor.name}
                            </div>
                            {item.prescriptionNote && (
                              <div className="schedule-card-warning">
                                ⚠️ {item.prescriptionNote}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unscheduled Results */}
          {result.unscheduled.length > 0 && (
            <div className="result-section prescriptions-section">
              <h3>
                ⚠️ Could Not Schedule ({result.unscheduled.length})
              </h3>
              <p className="section-description">
                The following classes could not be scheduled due to specific resource constraints, room occupancies, or faculty workload limits.
              </p>
              <div className="card-list">
                {result.unscheduled.map((s, idx) => {
                  const subjectCredits = s?.subject?.credits || 3;
                  const hoursPerMeeting = s?.subject?.hoursPerMeeting || 1.5;
                  const labLabel = s?.subject?.isFoodLab ? 'Food Lab' : s?.subject?.requiredLab ? 'Computer Lab' : null;
                  const details = s?.details;

                  return (
                    <div key={idx} className="prescription-card">
                      <div className="prescription-card-header">
                        <div className="prescription-card-title">
                          <span>{s?.subject?.code || s?.subject?.name || 'Unknown Subject'}</span>
                          {s?.section?.name && (
                            <span className="prescription-card-section">— {s.section.name}</span>
                          )}
                        </div>
                        <div className="prescription-meta-badges">
                          <span className="meta-pill">{subjectCredits} Units</span>
                          <span className="meta-pill">{hoursPerMeeting}h / meeting</span>
                          {labLabel && <span className="meta-pill lab-pill">🔬 {labLabel}</span>}
                        </div>
                      </div>

                      <div className="prescription-reason-banner">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <div>
                          <strong>Reason: </strong>
                          <span>{s?.reason || 'Insufficient slots or conflict'}</span>
                        </div>
                      </div>

                      {details && (
                        <div className="conflict-breakdown">
                          {/* Faculty Evaluated */}
                          {details.professors && details.professors.length > 0 && (
                            <div>
                              <div className="conflict-group-title">
                                👨‍🏫 Evaluated Faculty ({details.professors.length})
                              </div>
                              <div className="conflict-chips-container">
                                {details.professors.map((p, pIdx) => {
                                  const isMax = p.status === 'MAX_UNITS';
                                  return (
                                    <div key={pIdx} className="conflict-card-box">
                                      <div className="conflict-card-header">
                                        <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem' }}>{p.name}</span>
                                        <span className={`meta-pill ${isMax ? 'lab-pill' : ''}`} style={isMax ? { background: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' } : {}}>
                                          {p.currentUnits !== undefined && p.maxUnits !== undefined ? `Load: ${p.currentUnits}/${p.maxUnits} units` : (p.status || 'Assigned')}
                                        </span>
                                      </div>
                                      {isMax ? (
                                        <div className="conflict-limit-warning">
                                          ⚠️ Teaching load reached maximum ({p.currentUnits}/${p.maxUnits} units) — this class requires +{p.neededUnits || 3} units.
                                        </div>
                                      ) : p.conflicts && p.conflicts.length > 0 ? (
                                        <div className="conflict-schedule-breakdown">
                                          <div className="conflict-sub-label">Existing class commitments:</div>
                                          <div className="conflict-timeline-list">
                                            {p.conflicts.map((c, cIdx) => {
                                              if (typeof c === 'object') {
                                                return (
                                                  <div key={cIdx} className="conflict-timeline-item">
                                                    <span className="conflict-day-pill">{c.day}</span>
                                                    <span className="conflict-time-badge">{c.time}</span>
                                                    <span className="conflict-sub-name">{c.subjectCode}</span>
                                                    {c.sectionName && <span className="conflict-section-badge">👥 {c.sectionName}</span>}
                                                    {c.roomName && <span className="conflict-room-pill">📍 {c.roomName}</span>}
                                                  </div>
                                                );
                                              }
                                              return (
                                                <div key={cIdx} className="conflict-timeline-item">
                                                  <span>{c}</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="conflict-chip-status available">
                                          ✓ Faculty has available hours, but room/section was occupied
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Rooms Checked */}
                          {details.rooms && details.rooms.length > 0 && (
                            <div>
                              <div className="conflict-group-title">
                                🚪 Rooms Evaluated ({details.rooms.length})
                              </div>
                              <div className="conflict-chips-container">
                                {details.rooms.map((r, rIdx) => {
                                  const hasRestrictions = r.restrictedProfs?.length > 0;
                                  const hasBusy = r.busySummary && r.busySummary.length > 0;
                                  return (
                                    <div key={rIdx} className="conflict-card-box">
                                      <div className="conflict-card-header">
                                        <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem' }}>{r.name}</span>
                                        <span className="meta-pill">{r.type || 'Room'}</span>
                                      </div>
                                      {hasRestrictions ? (
                                        <div className="conflict-limit-warning">
                                          🚫 Room restricted for: {r.restrictedProfs.join(', ')}
                                        </div>
                                      ) : hasBusy ? (
                                        <div className="conflict-schedule-breakdown">
                                          <div className="conflict-sub-label">Room occupied during:</div>
                                          <div className="conflict-timeline-list">
                                            {r.busySummary.map((b, bIdx) => {
                                              if (typeof b === 'object') {
                                                return (
                                                  <div key={bIdx} className="conflict-timeline-item">
                                                    <span className="conflict-day-pill">{b.day}</span>
                                                    <span className="conflict-time-badge">{b.time}</span>
                                                    <span className="conflict-sub-name">{b.subjectCode}</span>
                                                    {b.sectionName && <span className="conflict-section-badge">👥 {b.sectionName}</span>}
                                                    {b.profName && <span className="conflict-prof-pill">👤 {b.profName}</span>}
                                                  </div>
                                                );
                                              }
                                              return (
                                                <div key={bIdx} className="conflict-timeline-item">
                                                  <span>{b}</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="conflict-chip-status available">
                                          ✓ Room is available during other hours
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Specific Collisions */}
                          {details.specificCollisions && details.specificCollisions.length > 0 && (
                            <div className="conflict-collisions-list">
                              <strong>⏱️ Specific Slot Collisions Detected:</strong>
                              <ul>
                                {details.specificCollisions.slice(0, 4).map((col, cIdx) => (
                                  <li key={cIdx}>{col}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Section Schedule Overlaps */}
                          {details.sectionConflicts && details.sectionConflicts.length > 0 && (
                            <div>
                              <div className="conflict-group-title">
                                👥 Section {s?.section?.name || ''} Schedule Overlaps ({details.sectionConflicts.length})
                              </div>
                              <div className="conflict-timeline-list" style={{ marginTop: '6px' }}>
                                {details.sectionConflicts.slice(0, 4).map((sc, scIdx) => {
                                  if (typeof sc === 'object') {
                                    return (
                                      <div key={scIdx} className="conflict-timeline-item">
                                        <span className="conflict-day-pill">{sc.day}</span>
                                        <span className="conflict-time-badge">{sc.time}</span>
                                        <span className="conflict-sub-name">{sc.subjectCode}</span>
                                        {sc.roomName && <span className="conflict-room-pill">📍 {sc.roomName}</span>}
                                        {sc.profName && <span className="conflict-prof-pill">👤 {sc.profName}</span>}
                                      </div>
                                    );
                                  }
                                  return (
                                    <div key={scIdx} className="conflict-timeline-item">
                                      <span>{sc}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Actionable Suggestion */}
                          {details.suggestion && (
                            <div className="conflict-suggestion-alert">
                              <span style={{ fontSize: '1.2rem' }}>💡</span>
                              <div>
                                <strong style={{ display: 'block', marginBottom: '2px' }}>How to resolve this:</strong>
                                <span>{details.suggestion}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default AutoScheduler;