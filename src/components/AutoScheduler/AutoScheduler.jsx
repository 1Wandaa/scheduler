import React, { useState } from 'react';
import { ScheduleGA } from '../../utils/ScheduleGA';
import { suggestProfessorMatches, analyzeScheduleFailures } from '../../utils/scheduleAI';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import '../../styles/AutoScheduler.css';

// 1. ADDED 'schedules' to the props list
function AutoScheduler({ validator, subjects, sections, professors, rooms, schedules, onAutoSchedule }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ gen: 0, max: 0, fitness: null });

  const [engineMode, setEngineMode] = useState('ga');
  const [targetId, setTargetId] = useState('');
  const [clearBeforeRun, setClearBeforeRun] = useState(true);

  // Constraints
  const [respectLabs, setRespectLabs] = useState(true);
  const [preventDoubleBooking, setPreventDoubleBooking] = useState(true);
  const [aiAssisted, setAiAssisted] = useState(true);
  const [aiStatus, setAiStatus] = useState('');
  const [aiInsights, setAiInsights] = useState(null);

  // Run the Targeted Heuristic Engine (Greedy)
  const runTargeted = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (clearBeforeRun) await validator.clearAllSchedules();

      const constraints = { respectLabs, preventDoubleBooking };
      let r = null;

      if (engineMode === 'faculty') r = await validator.autoScheduleForFaculty(targetId, constraints);
      else if (engineMode === 'room') r = await validator.autoScheduleForRoom(targetId, constraints);
      else if (engineMode === 'section') r = await validator.autoScheduleForSection(targetId, constraints);
      else throw new Error('Invalid mode selected.');

      setResult({
        schedule: r.results || [],
        unscheduled: r.unscheduled || [],
        error: r.error || null,
        mode: engineMode
      });
    } catch (e) {
      setResult({ schedule: [], unscheduled: [], error: e.message, mode: engineMode });
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
      if (clearBeforeRun) await validator.clearAllSchedules();

      if (!sections || sections.length === 0) {
        throw new Error("No sections defined. Please add sections in Section Management first.");
      }

      // 2. Pass existing schedules if we are not clearing them
      const existingSchedules = clearBeforeRun ? [] : (schedules || []);

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

      setResult({ schedule: validResults, unscheduled: unscheduledResults, error: null, mode: 'ga' });

      // --- AI Post-Processing: Analyze failures ---
      if (aiAssisted && unscheduledResults.length > 0) {
        try {
          setAiStatus('🔍 AI analyzing scheduling failures...');
          const insights = await analyzeScheduleFailures(
            unscheduledResults, professors, rooms, sections, validResults
          );
          if (insights) {
            setAiInsights(insights);
            setAiStatus('✅ AI analysis complete');
          } else {
            setAiStatus('');
          }
        } catch (aiError) {
          console.warn('[AI] Post-processing failed:', aiError);
          setAiStatus('');
        }
      } else if (aiAssisted && unscheduledResults.length === 0) {
        setAiStatus('✅ All classes scheduled successfully — no analysis needed');
      }

    } catch (error) {
      setResult({ schedule: [], unscheduled: [], error: error.message, mode: 'ga' });
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

      <div style={{ display: 'grid', gridTemplateColumns: engineMode === 'ga' ? '1fr' : '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
        <div className="form-group">
          <label className="form-label">Engine Mode</label>
          <select
            className="form-select"
            value={engineMode}
            onChange={(e) => { setEngineMode(e.target.value); setTargetId(''); }}
          >
            <option value="ga">Full Timetable (GA)</option>
            <option value="faculty">Targeted: Single Faculty</option>
            <option value="room">Targeted: Single Room</option>
            <option value="section">Targeted: Single Section</option>
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
              {targetOptions?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
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
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: 'var(--danger)' }}>
          <input type="checkbox" checked={clearBeforeRun} onChange={(e) => setClearBeforeRun(e.target.checked)} />
          <strong>Clear entire existing schedule before running</strong>
        </label>
        {engineMode === 'ga' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', cursor: 'pointer', color: 'var(--accent-primary)' }}>
            <input type="checkbox" checked={aiAssisted} onChange={(e) => setAiAssisted(e.target.checked)} />
            <strong>🧠 AI-Assisted Mode</strong>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '400' }}>— Gemini optimizes professor matching & analyzes failures</span>
          </label>
        )}
      </div>

      <button onClick={handleExecute} disabled={loading || (engineMode !== 'ga' && !targetId)} className="btn" style={{ width: '100%', padding: '14px', fontSize: '1rem' }}>
        {loading ? 'Processing Schedule...' : 'Generate Timetable'}
      </button>

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
                          <div key={idx} style={{ padding: '10px', background: 'var(--success-bg)', borderLeft: '4px solid var(--success)', borderRadius: '4px', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                              <span>{item.subject.code} {item.section ? `(${item.section.name})` : ''}</span>
                              <span>{item.timeSlot.label}</span>
                            </div>
                            <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                              {item.room.name} • Prof. {item.professor.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unscheduled List */}
          {result.unscheduled.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: 'var(--danger)', borderBottom: '2px solid var(--danger)', paddingBottom: '5px' }}>
                Could Not Schedule ({result.unscheduled.length})
              </h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {result.unscheduled.map((s, idx) => (
                  <div key={idx} style={{ padding: '8px', background: 'var(--danger-bg)', borderLeft: '4px solid var(--danger)', borderRadius: '4px', marginBottom: '8px', fontSize: '0.85rem' }}>
                    <strong>{s?.subject?.code || s?.subject?.name || 'Unknown Subject'}</strong>
                    {s?.section?.name ? ` — ${s.section.name}` : ''}
                    <div style={{ color: 'var(--danger)', marginTop: '4px', fontSize: '0.8rem' }}>Reason: {s?.reason || 'Insufficient slots or conflict'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Insights Panel */}
          {aiInsights && aiInsights.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: 'var(--accent-primary)', borderBottom: '2px solid var(--accent-primary)', paddingBottom: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🧠 AI Recommendations ({aiInsights.length})
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
                    <div style={{ marginTop: '4px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Suggested Actions:</span>
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