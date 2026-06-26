import React, { useState } from 'react';
import { suggestProfessorMatches, analyzeScheduleFailures } from '../../utils/scheduleAI';
import ScheduleGAWorker from '../../utils/scheduleGA.worker.js?worker';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import { schedulesOverlap, getMeetingTimeLabel } from '../../utils/scheduleUtils';
import '../../styles/AutoScheduler.css';
import Swal from 'sweetalert2';

// 1. ADDED 'schedules', 'onLogHistory', and 'onAutoScheduleBatch' to the props list
function AutoScheduler({ validator, subjects, sections, professors, rooms, schedules, activeSemester, onAutoSchedule, onAutoScheduleBatch, onLogHistory }) {
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ gen: 0, max: 0, fitness: null });

  const [engineMode, setEngineMode] = useState('ga');
  const [targetId, setTargetId] = useState('');

  // Constraints
  const [respectLabs, setRespectLabs] = useState(true);
  const [preventDoubleBooking, setPreventDoubleBooking] = useState(true);
  const [aiAssisted, setAiAssisted] = useState(true);
  const [aiStatus, setAiStatus] = useState('');
  const [aiInsights, setAiInsights] = useState(null);

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
        if (e.detail === 'ga' || e.detail.mode === 'ga') {
          setEngineMode('ga');
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

  // ─── CLEAR ALL SCHEDULES (Independent action) ───
  const handleClearAll = async () => {
    const result = await Swal.fire({
      title: 'Clear All Schedules?',
      text: "⚠️ This will permanently delete ALL scheduled classes. Are you sure you want to proceed?",
      showCancelButton: true,
      confirmButtonText: 'Yes, Clear All',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'minimal-swal',
        title: 'minimal-title',
        htmlContainer: 'minimal-text',
        actions: 'minimal-actions',
        confirmButton: 'btn-delete',
        cancelButton: 'back-btn'
      },
      buttonsStyling: false,
      focusCancel: true
    });

    if (!result.isConfirmed) return;

    setClearing(true);
    try {
      await validator.clearAllSchedules();
      setResult(null);
      setAiInsights(null);
      setAiStatus('');
      Swal.fire({ title: 'Cleared', text: 'All schedules have been removed.', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
    } catch (e) {
      console.error('Failed to clear schedules:', e);
      Swal.fire({ title: 'Error', text: 'Failed to clear schedules.', icon: 'error', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
    }
    setClearing(false);
  };

  // Run the Targeted Heuristic Engine (Greedy)
  const runTargeted = async () => {
    setLoading(true);
    setResult(null);
    setAiInsights(null);
    setAiStatus('');
    try {
      // --- AI Pre-Processing: Smart professor-subject matching ---
      let aiProfessorMap = null;
      if (aiAssisted) {
        try {
          setAiStatus('🧠 AI analyzing professor-subject compatibility...');
          aiProfessorMap = await suggestProfessorMatches(professors, activeSemesterSubjects, sections, schedules);
          if (aiProfessorMap) {
            setAiStatus('✅ AI matching complete — starting targeted engine with optimized assignments');
          } else {
            setAiStatus('⚠️ AI matching returned no results — using default matching');
          }
        } catch (aiError) {
          console.warn('[AI] Pre-processing failed:', aiError);
          setAiStatus('⚠️ AI unavailable — using default matching');
        }
      }

      const constraints = { respectLabs, preventDoubleBooking, aiProfessorMap };
      let r = null;

      if (engineMode === 'faculty') r = await validator.autoScheduleForFaculty(targetId, constraints);
      else if (engineMode === 'room') r = await validator.autoScheduleForRoom(targetId, constraints);
      else if (engineMode === 'section') r = await validator.autoScheduleForSection(targetId, constraints);
      else throw new Error('Invalid mode selected.');

      const unscheduledResults = r.unscheduled || [];

      setResult({
        schedule: r.results || [],
        unscheduled: unscheduledResults,
        prescriptions: [],
        error: r.error || null,
        mode: engineMode
      });

      // --- AI Post-Processing: Analyze failures ---
      if (aiAssisted && unscheduledResults.length > 0) {
        try {
          setAiStatus('🔍 AI generating prescriptions for failed classes...');
          const insights = await analyzeScheduleFailures(
            unscheduledResults, professors, rooms, sections, r.results || []
          );
          if (insights) {
            setAiInsights(insights);
            setAiStatus('✅ AI prescriptions ready');
          } else {
            setAiStatus('');
          }
        } catch (aiError) {
          console.warn('[AI] Post-processing failed:', aiError);
          setAiStatus('');
        }
      } else if (aiAssisted && unscheduledResults.length === 0) {
        setAiStatus('✅ All classes scheduled successfully — no prescriptions needed');
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
            reason: u.reason || 'Insufficient slots or conflict'
          }))
        });
      }

    } catch (e) {
      setResult({ schedule: [], unscheduled: [], prescriptions: [], error: e.message, mode: engineMode });
    }
    setLoading(false);
  };

  // Run the Genetic Algorithm Engine
  const runGA = async () => {
    setLoading(true);
    setResult(null);
    setAiInsights(null);
    setAiStatus('');
    setProgress({ gen: 0, max: 100, fitness: null });

    try {
      if (!sections || sections.length === 0) {
        throw new Error("No sections defined. Please add sections in Section Management first.");
      }

      // Pre-flight feasibility check
      const missingProfsItems = [];
      const missingRoomsItems = [];
      for (const sec of sections) {
        for (const subId of (sec.subjects || [])) {
          const sub = activeSemesterSubjects.find(s => s.id === subId || s.code === subId);
          if (!sub) continue;
          
          const profs = validator._eligibleProfsFor(sub, sec);
          if (!profs || profs.length === 0) {
            missingProfsItems.push(`${sub.code || sub.name} (${sec.name})`);
          }
          
          const roomsObj = validator._eligibleRoomsFor(sub, sec, { respectLabs });
          if (!roomsObj || !roomsObj.flat || roomsObj.flat.length === 0) {
            missingRoomsItems.push(`${sub.code || sub.name} (${sec.name})`);
          }
        }
      }

      if (missingProfsItems.length > 0 || missingRoomsItems.length > 0) {
        setLoading(false);
        
        let htmlContent = '<div style="text-align: left; max-height: 250px; overflow-y: auto; font-size: 0.9rem; padding: 10px; border: 1px solid #eee; border-radius: 8px; margin-bottom: 10px; background: #fafafa;">';
        if (missingProfsItems.length > 0) {
          htmlContent += `<p style="margin-bottom: 5px; color: #b91c1c;"><strong>Missing Eligible Faculty (${missingProfsItems.length}):</strong></p>`;
          htmlContent += `<ul style="margin-top: 0; padding-left: 20px;">${missingProfsItems.map(item => `<li>${item}</li>`).join('')}</ul>`;
        }
        if (missingRoomsItems.length > 0) {
          htmlContent += `<p style="margin-bottom: 5px; color: #b91c1c;"><strong>Missing Eligible Rooms (${missingRoomsItems.length}):</strong></p>`;
          htmlContent += `<ul style="margin-top: 0; padding-left: 20px;">${missingRoomsItems.map(item => `<li>${item}</li>`).join('')}</ul>`;
        }
        htmlContent += '</div><p style="font-size: 0.95rem;">These classes will be skipped. Proceed with scheduling the rest?</p>';

        const proceed = await Swal.fire({
          title: 'Data Issues Detected',
          html: htmlContent,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Proceed Anyway',
          cancelButtonText: 'Cancel'
        });
        if (!proceed.isConfirmed) {
          return;
        }
        setLoading(true);
      }

      // 2. Pass existing schedules — always append mode
      const existingSchedules = schedules || [];

      // --- AI Pre-Processing: Smart professor-subject matching ---
      let aiProfessorMap = null;
      if (aiAssisted) {
        try {
          setAiStatus('🧠 AI analyzing professor-subject compatibility...');
          aiProfessorMap = await suggestProfessorMatches(professors, activeSemesterSubjects, sections, existingSchedules);
          if (aiProfessorMap) {
            setAiStatus('✅ AI matching complete — starting GA with optimized assignments');
          } else {
            setAiStatus('⚠️ AI matching returned no results — using default matching');
          }
        } catch (aiError) {
          console.warn('[AI] Pre-processing failed:', aiError);
          setAiStatus('⚠️ AI unavailable — using default matching');
        }
      }

      // --- Run GA in a Web Worker to keep UI responsive ---
      setAiStatus(prev => prev || '⚙️ Starting GA engine in background...');

      const gaResult = await new Promise((resolve, reject) => {
        const worker = new ScheduleGAWorker();

        worker.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === 'progress') {
            setProgress({ gen: msg.gen, max: msg.max, fitness: msg.fitness });
          } else if (msg.type === 'done') {
            worker.terminate();
            resolve(msg.result);
          } else if (msg.type === 'error') {
            worker.terminate();
            reject(new Error(msg.message));
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          reject(new Error(err.message || 'Worker crashed'));
        };

        worker.postMessage({
          type: 'start',
          payload: {
            subjects: activeSemesterSubjects, rooms, professors, sections,
            days: DAYS, timeSlots: TIME_SLOTS,
            existingSchedules,
            config: { populationSize: 60, maxGenerations: 150, mutationRate: 0.15 },
            aiProfessorMap,
          }
        });
      });

      const validResults = [];
      const unscheduledResults = [];
      const gaPrescriptions = gaResult.prescriptions || [];

      // 3. Initialize saved schedules with existing ones to accurately check overlaps
      const savedSchedules = [...existingSchedules];

      // Track which professor is assigned per section+subject to prevent mixed assignments
      const profForSecSub = {};
      for (const s of existingSchedules) {
        if (s.professor?.id && s.section?.id && s.subject?.id) {
          const key = `${s.section.id}-${s.subject.id}`;
          if (!profForSecSub[key]) profForSecSub[key] = String(s.professor.id);
        }
      }

      const toSave = [];

      // Validate the GA output before claiming success
      for (const entry of gaResult.schedule) {
        if (entry.failed) {
          unscheduledResults.push(entry); // Captures overloaded faculty errors
          continue;
        }

        if (respectLabs && entry.subject?.requiredLab && !entry.room?.hasComputers) {
          unscheduledResults.push({ ...entry, reason: 'Subject requires a computer lab.' });
          continue;
        }

        const isConflict = savedSchedules.some(s => schedulesOverlap(s, entry));

        if (preventDoubleBooking && isConflict) {
          unscheduledResults.push({ ...entry, reason: 'Overlap conflict detected by engine.' });
          continue;
        }

        // Reject if a different professor was already saved for this section+subject
        if (entry.section?.id && entry.subject?.id && entry.professor?.id) {
          const secSubKey = `${entry.section.id}-${entry.subject.id}`;
          const existingProfId = profForSecSub[secSubKey];
          if (existingProfId && existingProfId !== String(entry.professor.id)) {
            unscheduledResults.push({ ...entry, reason: `Section already has a different professor for ${entry.subject.code || entry.subject.name}.` });
            continue;
          }
        }

        // It passed local validation; queue for batch save
        toSave.push(entry);
        savedSchedules.push(entry);
        if (entry.section?.id && entry.subject?.id && entry.professor?.id) {
          const secSubKey = `${entry.section.id}-${entry.subject.id}`;
          if (!profForSecSub[secSubKey]) profForSecSub[secSubKey] = String(entry.professor.id);
        }
      }

      // Attempt to save all valid entries to database via batch
      if (toSave.length > 0) {
        if (onAutoScheduleBatch) {
          try {
            const batchResult = await onAutoScheduleBatch(toSave);
            if (batchResult && batchResult.ok === false) {
              // If batch failed entirely or partial failures happened, just push generic error to all toSave
              toSave.forEach(entry => {
                unscheduledResults.push({ ...entry, reason: batchResult.errors?.join(', ') || 'Database validation failed in batch.' });
              });
            } else {
              validResults.push(...toSave);
            }
          } catch (e) {
            toSave.forEach(entry => unscheduledResults.push({ ...entry, reason: 'Failed to save to database.' }));
          }
        } else {
          // Fallback to one-by-one if batch function isn't provided
          for (const entry of toSave) {
            try {
              const writeResult = await onAutoSchedule(entry);
              if (writeResult && writeResult.ok === false) {
                unscheduledResults.push({ ...entry, reason: writeResult.errors?.join(', ') || 'Database validation failed.' });
              } else {
                validResults.push(entry);
              }
            } catch (e) {
              unscheduledResults.push({ ...entry, reason: 'Failed to save to database.' });
            }
          }
        }
      }

      setResult({
        schedule: validResults,
        unscheduled: unscheduledResults,
        prescriptions: gaPrescriptions,
        error: null,
        mode: 'ga'
      });

      // --- AI Post-Processing: Analyze failures ---
      if (aiAssisted && unscheduledResults.length > 0) {
        try {
          setAiStatus('🔍 AI generating prescriptions for failed classes...');
          const insights = await analyzeScheduleFailures(
            unscheduledResults, professors, rooms, sections, validResults
          );
          if (insights) {
            setAiInsights(insights);
            setAiStatus('✅ AI prescriptions ready');
          } else {
            setAiStatus('');
          }
        } catch (aiError) {
          console.warn('[AI] Post-processing failed:', aiError);
          setAiStatus('');
        }
      } else if (aiAssisted && unscheduledResults.length === 0) {
        setAiStatus('✅ All classes scheduled successfully — no prescriptions needed');
      }

      if (onLogHistory) {
        onLogHistory({
          engineMode: 'ga',
          totalAttempted: validResults.length + unscheduledResults.length,
          successCount: validResults.length,
          errorCount: unscheduledResults.length,
          errors: unscheduledResults.map(u => ({
            subject: u.subject?.code || u.subject?.name || 'Unknown',
            section: u.section?.name || 'Unknown',
            reason: u.reason || 'Insufficient slots or conflict'
          }))
        });
      }

    } catch (error) {
      setResult({ schedule: [], unscheduled: [], prescriptions: [], error: error.message, mode: 'ga' });
    }
    setLoading(false);
  };

  const handleExecute = () => {
    if (engineMode === 'ga') runGA();
    else runTargeted();
  };

  const targetOptions = engineMode === 'faculty' ? professors
    : engineMode === 'room' ? rooms
      : sections;

  // Group schedules by Day for cleaner UI
  const groupedSchedule = result?.schedule?.reduce((acc, curr) => {
    if (!acc[curr.day]) acc[curr.day] = [];
    acc[curr.day].push(curr);
    return acc;
  }, {}) || {};

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s' }}>
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
            <option value="ga">Full Timetable (GA)</option>
            <option value="faculty">By Faculty</option>
            <option value="room">By Room</option>
            <option value="section">By Section</option>
          </select>
        </div>

        {engineMode !== 'ga' && (
          <div className="form-group">
            <label className="form-label">Select Target</label>
            <select
              className="form-select"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Choose...</option>
              {targetOptions && [...targetOptions].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
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
          Enforce Computer Lab Requirements
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: 'var(--accent-primary)' }}>
          <input type="checkbox" checked={aiAssisted} onChange={(e) => setAiAssisted(e.target.checked)} />
          <strong>🧠 AI-Assisted Mode</strong>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '400' }}>— Gemini optimizes professor matching & generates prescriptions</span>
        </label>
      </div>

      {/* Pre-Scheduling Summary */}
      <div style={{ marginBottom: '15px', padding: '10px 15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
        <strong>Pre-flight Summary:</strong> {sections?.reduce((sum, sec) => sum + (sec.subjects?.length || 0), 0) || 0} subjects total across all sections ready to be scheduled.
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <button id="btn-execute-autoschedule" onClick={handleExecute} disabled={loading || clearing || (engineMode !== 'ga' && !targetId)} className="btn" style={{ flex: 1, padding: '14px', fontSize: '1rem', whiteSpace: 'nowrap', minWidth: '200px' }}>
          {loading ? 'Processing Schedule...' : 'Generate Timetable'}
        </button>
        <button
          onClick={handleClearAll}
          disabled={loading || clearing}
          className="btn-danger-outline"
        >
          {clearing ? 'Clearing...' : '🗑 Clear All Schedules'}
        </button>
      </div>

      {/* AI Status */}
      {aiStatus && (
        <div className="ai-status-panel">
          {aiStatus}
        </div>
      )}

      {/* Progress Bar */}
      {loading && engineMode === 'ga' && (
        <div style={{ marginTop: '15px' }}>
          <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(progress.gen / progress.max) * 100}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.2s' }}></div>
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: '5px' }}>Generation {progress.gen} / {progress.max}</p>
        </div>
      )}

      {/* Results Section */}
      {result && !loading && (
        <div style={{ marginTop: '30px', animation: 'fadeIn 0.5s' }}>

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

          {/* Prescriptions Required (replaces "Could Not Schedule") */}
          {result.unscheduled.length > 0 && (
            <div className="result-section prescriptions-section">
              <h3>
                📋 Prescriptions Required ({result.unscheduled.length})
              </h3>
              <p className="section-description">
                These classes need manual intervention or overflow placement. Review the prescriptions below.
              </p>
              <div className="card-list">
                {result.unscheduled.map((s, idx) => {
                  // Find matching GA prescription if available
                  const gaPrescription = (result.prescriptions || []).find(
                    p => p.subject?.id === s?.subject?.id && p.section?.id === s?.section?.id
                  );

                  return (
                    <div key={idx} className="prescription-card">
                      <div className="card-title">
                        {s?.subject?.code || s?.subject?.name || 'Unknown Subject'}
                        {s?.section?.name ? ` — ${s.section.name}` : ''}
                      </div>
                      <div className="card-reason">
                        Reason: {s?.reason || 'Insufficient slots or conflict'}
                      </div>
                      
                      {/* GA Engine Suggestions */}
                      {gaPrescription && (
                        <div className="engine-prescription">
                          <div className="engine-prescription-title">
                            Engine Prescription:
                          </div>
                          {gaPrescription.suggestedRooms?.length > 0 && (
                            <div className="engine-prescription-item">
                              <strong>Rooms:</strong> {gaPrescription.suggestedRooms.map(r => `${r.name} (${r.department})`).join(', ')}
                            </div>
                          )}
                          {gaPrescription.suggestedProfessors?.length > 0 && (
                            <div className="engine-prescription-item">
                              <strong>Professors:</strong> {gaPrescription.suggestedProfessors.map(p => `${p.name} (${p.department})`).join(', ')}
                            </div>
                          )}
                          <div className="engine-prescription-action">
                            {gaPrescription.suggestedAction}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Prescriptions Panel */}
          {aiInsights && aiInsights.length > 0 && (
            <div className="result-section ai-prescriptions-section">
              <h3>
                🧠 AI Prescriptions ({aiInsights.length})
              </h3>
              <div className="card-list">
                {aiInsights.map((insight, idx) => (
                  <div key={idx} className="ai-prescription-card">
                    <div className="card-title">
                      {insight.subject}{insight.section ? ` — ${insight.section}` : ''}
                    </div>
                    <div className="card-description">
                      {insight.problem}
                    </div>
                    
                    {/* Concrete suggestion from AI */}
                    {(insight.suggestedRoom || insight.suggestedDay || insight.suggestedTime || insight.suggestedProfessor) && (
                      <div className={`ai-suggestion-box ${insight.validated ? 'validated' : 'unverified'}`}>
                        <div className="ai-suggestion-title">
                          {insight.validated ? 'Validated Placement:' : 'Suggested Placement (unverified):'}
                        </div>
                        {insight.validationWarnings?.length > 0 && (
                          <div className="ai-suggestion-warnings">
                            {insight.validationWarnings.map((w, wi) => <div key={wi}>⚠️ {w}</div>)}
                          </div>
                        )}
                        <div className="ai-suggestion-grid">
                          {insight.suggestedRoom && (
                            <div><strong>Room:</strong> <span>{insight.suggestedRoom}</span></div>
                          )}
                          {insight.suggestedDay && (
                            <div><strong>Day:</strong> <span>{insight.suggestedDay}</span></div>
                          )}
                          {insight.suggestedTime && (
                            <div><strong>Time:</strong> <span>{insight.suggestedTime}</span></div>
                          )}
                          {insight.suggestedProfessor && (
                            <div><strong>Prof:</strong> <span>{insight.suggestedProfessor}</span></div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="ai-actions">
                      <span className="ai-actions-title">Actions:</span>
                      <ul>
                        {(insight.solutions || []).map((sol, sIdx) => (
                          <li key={sIdx}>{sol}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default AutoScheduler;