import React, { useState } from 'react';
import { ScheduleGA } from '../../utils/ScheduleGA';
import { suggestProfessorMatches, analyzeScheduleFailures } from '../../utils/scheduleAI';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import '../../styles/AutoScheduler.css';

// 1. ADDED 'schedules' to the props list
function AutoScheduler({ validator, subjects, sections, professors, rooms, schedules, onAutoSchedule }) {
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

  // ─── CLEAR ALL SCHEDULES (Independent action) ───
  const handleClearAll = async () => {
    const confirmed = window.confirm(
      '⚠️ This will permanently delete ALL scheduled classes.\n\nAre you sure you want to clear the entire schedule?'
    );
    if (!confirmed) return;

    setClearing(true);
    try {
      await validator.clearAllSchedules();
      setResult(null);
      setAiInsights(null);
      setAiStatus('');
    } catch (e) {
      console.error('Failed to clear schedules:', e);
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
          aiProfessorMap = await suggestProfessorMatches(professors, subjects, sections);
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

      // 2. Pass existing schedules — always append mode
      const existingSchedules = schedules || [];

      // --- AI Pre-Processing: Smart professor-subject matching ---
      let aiProfessorMap = null;
      if (aiAssisted) {
        try {
          setAiStatus('🧠 AI analyzing professor-subject compatibility...');
          aiProfessorMap = await suggestProfessorMatches(professors, subjects, sections);
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

      const ga = new ScheduleGA(
        subjects, rooms, professors, sections, DAYS, TIME_SLOTS, existingSchedules,
        { populationSize: 80, maxGenerations: 100, mutationRate: 0.15 },
        aiProfessorMap
      );

      const gaResult = await ga.solve((gen, bestFitness, totalGens) => {
        setProgress({ gen, max: totalGens, fitness: bestFitness });
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

        const sameTimeSlot = (a, b) => a.day === b.day && String(a.timeSlot?.id) === String(b.timeSlot?.id);

        const isConflict = savedSchedules.some(s =>
          sameTimeSlot(s, entry) && (
            (s.room?.id && entry.room?.id && String(s.room.id) === String(entry.room.id)) ||
            (s.professor?.id && entry.professor?.id && String(s.professor.id) === String(entry.professor.id)) ||
            (s.section?.id && entry.section?.id && String(s.section.id) === String(entry.section.id))
          )
        );

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

        // Attempt to save to database
        try {
          const writeResult = await onAutoSchedule(entry);
          if (writeResult && writeResult.ok === false) {
            unscheduledResults.push({ ...entry, reason: writeResult.errors?.join(', ') || 'Database validation failed.' });
          } else {
            savedSchedules.push(entry);
            validResults.push(entry);
            // Track the professor for this section+subject
            if (entry.section?.id && entry.subject?.id && entry.professor?.id) {
              const secSubKey = `${entry.section.id}-${entry.subject.id}`;
              if (!profForSecSub[secSubKey]) profForSecSub[secSubKey] = String(entry.professor.id);
            }
          }
        } catch (e) {
          unscheduledResults.push({ ...entry, reason: 'Failed to save to database.' });
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

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
        <button onClick={handleExecute} disabled={loading || clearing || (engineMode !== 'ga' && !targetId)} className="btn" style={{ flex: 1, padding: '14px', fontSize: '1rem' }}>
          {loading ? 'Processing Schedule...' : 'Generate Timetable'}
        </button>
        <button
          onClick={handleClearAll}
          disabled={loading || clearing}
          style={{
            padding: '14px 20px',
            fontSize: '0.9rem',
            fontWeight: 700,
            borderRadius: '12px',
            border: '2px solid var(--danger)',
            background: 'transparent',
            color: 'var(--danger)',
            cursor: (loading || clearing) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: (loading || clearing) ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { if (!loading && !clearing) { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#fff'; } }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--danger)'; }}
        >
          {clearing ? 'Clearing...' : '🗑 Clear All Schedules'}
        </button>
      </div>

      {/* AI Status */}
      {aiStatus && (
        <div style={{ marginTop: '12px', padding: '10px 14px', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
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

          {/* Success Grouped by Day */}
          {result.schedule.length > 0 && (
            <div>
              <h3 style={{ color: 'var(--success)', borderBottom: '2px solid var(--success)', paddingBottom: '5px' }}>
                Successfully Scheduled ({result.schedule.length})
              </h3>

              <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
                {DAYS.map(day => {
                  const dayClasses = groupedSchedule[day];
                  if (!dayClasses || dayClasses.length === 0) return null;

                  return (
                    <div key={day} style={{ marginBottom: '15px' }}>
                      <h4 style={{ margin: '10px 0 5px 0', color: 'var(--accent-dark)' }}>{day}</h4>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {dayClasses.map((item, idx) => (
                          <div key={idx} style={{ padding: '10px', background: 'var(--success-bg)', borderLeft: item.prescriptionNote ? '4px solid var(--warning)' : '4px solid var(--success)', borderRadius: '4px', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                              <span>{item.subject.code} {item.section ? `(${item.section.name})` : ''}</span>
                              <span>{item.timeSlot.label}</span>
                            </div>
                            <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                              {item.room.name} • Prof. {item.professor.name}
                            </div>
                            {item.prescriptionNote && (
                              <div style={{ marginTop: '6px', padding: '6px 10px', background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--warning)' }}>
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
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: 'var(--danger)', borderBottom: '2px solid var(--danger)', paddingBottom: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📋 Prescriptions Required ({result.unscheduled.length})
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '8px 0 12px' }}>
                These classes need manual intervention or overflow placement. Review the prescriptions below.
              </p>
              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'grid', gap: '10px' }}>
                {result.unscheduled.map((s, idx) => {
                  // Find matching GA prescription if available
                  const gaPrescription = (result.prescriptions || []).find(
                    p => p.subject?.id === s?.subject?.id && p.section?.id === s?.section?.id
                  );

                  return (
                    <div key={idx} style={{
                      padding: '14px',
                      background: 'linear-gradient(135deg, rgba(239,68,68,0.04), rgba(249,115,22,0.04))',
                      border: '1px solid rgba(239,68,68,0.15)',
                      borderLeft: '4px solid var(--danger)',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                    }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>
                        {s?.subject?.code || s?.subject?.name || 'Unknown Subject'}
                        {s?.section?.name ? ` — ${s.section.name}` : ''}
                      </div>
                      <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '8px' }}>
                        Reason: {s?.reason || 'Insufficient slots or conflict'}
                      </div>
                      
                      {/* GA Engine Suggestions */}
                      {gaPrescription && (
                        <div style={{ padding: '10px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: '6px', marginTop: '6px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                            Engine Prescription:
                          </div>
                          {gaPrescription.suggestedRooms?.length > 0 && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                              <strong>Rooms:</strong> {gaPrescription.suggestedRooms.map(r => `${r.name} (${r.department})`).join(', ')}
                            </div>
                          )}
                          {gaPrescription.suggestedProfessors?.length > 0 && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                              <strong>Professors:</strong> {gaPrescription.suggestedProfessors.map(p => `${p.name} (${p.department})`).join(', ')}
                            </div>
                          )}
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
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
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: 'var(--accent-primary)', borderBottom: '2px solid var(--accent-primary)', paddingBottom: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🧠 AI Prescriptions ({aiInsights.length})
              </h3>
              <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
                {aiInsights.map((insight, idx) => (
                  <div key={idx} style={{
                    padding: '14px',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))',
                    border: '1px solid rgba(99,102,241,0.15)',
                    borderLeft: '4px solid var(--accent-primary)',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                  }}>
                    <div style={{ fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                      {insight.subject}{insight.section ? ` — ${insight.section}` : ''}
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '8px', lineHeight: '1.5' }}>
                      {insight.problem}
                    </div>
                    
                    {/* Concrete suggestion from AI */}
                    {(insight.suggestedRoom || insight.suggestedDay || insight.suggestedTime || insight.suggestedProfessor) && (
                      <div style={{ padding: '10px 12px', background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.15)', borderRadius: '6px', marginBottom: '8px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                          Suggested Placement:
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px', fontSize: '0.82rem' }}>
                          {insight.suggestedRoom && (
                            <div><strong style={{ color: 'var(--text-muted)' }}>Room:</strong> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{insight.suggestedRoom}</span></div>
                          )}
                          {insight.suggestedDay && (
                            <div><strong style={{ color: 'var(--text-muted)' }}>Day:</strong> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{insight.suggestedDay}</span></div>
                          )}
                          {insight.suggestedTime && (
                            <div><strong style={{ color: 'var(--text-muted)' }}>Time:</strong> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{insight.suggestedTime}</span></div>
                          )}
                          {insight.suggestedProfessor && (
                            <div><strong style={{ color: 'var(--text-muted)' }}>Prof:</strong> <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{insight.suggestedProfessor}</span></div>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: '4px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions:</span>
                      <ul style={{ margin: '6px 0 0', paddingLeft: '18px', lineHeight: '1.7' }}>
                        {(insight.solutions || []).map((sol, sIdx) => (
                          <li key={sIdx} style={{ color: 'var(--text-main)', fontSize: '0.83rem' }}>{sol}</li>
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