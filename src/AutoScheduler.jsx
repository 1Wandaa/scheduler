import React, { useState } from 'react';
import { ScheduleGA } from './ScheduleGA';
import { TIME_SLOTS, DAYS } from './index';
import './AutoScheduler.css';

function AutoScheduler({ validator, subjects, sections, professors, rooms, onAutoSchedule }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ gen: 0, max: 0, fitness: null });

  // Mode selection
  const [engineMode, setEngineMode] = useState('ga'); // 'ga' | 'faculty' | 'room' | 'section'
  const [targetId, setTargetId] = useState('');
  const [clearBeforeRun, setClearBeforeRun] = useState(true);

  // GA Configuration
  const [populationSize, setPopulationSize] = useState(80);
  const [maxGenerations, setMaxGenerations] = useState(300);
  const [mutationRate, setMutationRate] = useState(0.15);

  // Constraint toggles
  const [respectLabs, setRespectLabs] = useState(true);
  const [preventDoubleBooking, setPreventDoubleBooking] = useState(true);

  const runTargeted = async () => {
    setLoading(true);
    setResult(null);
    setProgress({ gen: 0, max: 0, fitness: null });

    await new Promise(r => setTimeout(r, 50));

    try {
      if (clearBeforeRun) await validator.clearAllSchedules();

      const constraints = { respectLabs, preventDoubleBooking };
      let r = null;

      if (engineMode === 'faculty') {
        r = await validator.autoScheduleForFaculty(targetId, constraints);
      } else if (engineMode === 'room') {
        r = await validator.autoScheduleForRoom(targetId, constraints);
      } else if (engineMode === 'section') {
        r = await validator.autoScheduleForSection(targetId, constraints);
      } else {
        r = { results: [], unscheduled: [], error: 'Invalid mode.' };
      }

      setResult({
        schedule: r.results || [],
        fitness: { score: 0, hardViolations: 0, softScore: 0 },
        stats: { generations: 0, totalAssignments: (r.results || []).length, hardViolations: 0 },
        unscheduled: r.unscheduled || [],
        error: r.error || null,
        usedLegacy: true,
        targetedMode: engineMode,
      });
    } catch (e) {
      setResult({
        schedule: [],
        fitness: { score: 0, hardViolations: 0, softScore: 0 },
        stats: { generations: 0, totalAssignments: 0, hardViolations: 0 },
        unscheduled: [],
        error: e?.message || 'Targeted autoschedule failed.',
        usedLegacy: true,
        targetedMode: engineMode,
      });
    }

    setLoading(false);
  };

  const handleAutoSchedule = async () => {
    if (engineMode !== 'ga') {
      await runTargeted();
      return;
    }

    setLoading(true);
    setResult(null);
    setProgress({ gen: 0, max: maxGenerations, fitness: null });

    // Small delay so UI can render loading state
    await new Promise(r => setTimeout(r, 100));

    try {
      // Clear existing schedules
      if (clearBeforeRun) await validator.clearAllSchedules();

      if (!sections || sections.length === 0) {
        // Fallback: if no sections exist, run legacy greedy for backwards compat
        const autoResult = validator.autoSchedule(subjects, { respectLabs, preventDoubleBooking });
        setResult({
          schedule: autoResult.results,
          fitness: { score: 0, hardViolations: 0, softScore: 0 },
          stats: { generations: 0, totalAssignments: autoResult.results.length, hardViolations: 0 },
          unscheduled: autoResult.unscheduled,
          usedLegacy: true
        });
        setLoading(false);
        return;
      }

      // Run Genetic Algorithm
      const ga = new ScheduleGA(
        subjects,
        rooms,
        professors,
        sections,
        DAYS,
        TIME_SLOTS,
        { populationSize, maxGenerations, mutationRate }
      );

      const gaResult = await ga.solve((gen, bestFitness, totalGens) => {
        setProgress({ gen, max: totalGens, fitness: bestFitness });
      });

      const savedSchedules = [];
      const validResults = [];
      const unscheduledResults = [];

      // Save each schedule entry to Firestore ONLY if it does not conflict
      for (const entry of gaResult.schedule) {
        // Respect lab constraint
        if (respectLabs && entry?.subject?.requiredLab && !entry?.room?.hasComputers) {
          unscheduledResults.push(entry.subject);
          continue;
        }

        // Strict conflict checks (room + faculty + section)
        const shouldCheckConflicts = !!preventDoubleBooking;
        const isRoomBusy = shouldCheckConflicts
          ? savedSchedules.some(s => s.room.id === entry.room.id && s.day === entry.day && s.timeSlot.id === entry.timeSlot.id)
          : false;
        const isProfBusy = shouldCheckConflicts
          ? savedSchedules.some(s => s.professor.id === entry.professor.id && s.day === entry.day && s.timeSlot.id === entry.timeSlot.id)
          : false;
        const isSectionBusy = shouldCheckConflicts && entry?.section?.id
          ? savedSchedules.some(s => s.section?.id === entry.section.id && s.day === entry.day && s.timeSlot.id === entry.timeSlot.id)
          : false;

        if (!isRoomBusy && !isProfBusy && !isSectionBusy) {
          savedSchedules.push(entry);
          validResults.push(entry);
          try {
            const writeResult = await onAutoSchedule(entry);
            if (writeResult && writeResult.ok === false) {
              // Firestore write rejected by conflict validator (or other hard checks)
              validResults.pop();
              savedSchedules.pop();
              unscheduledResults.push(entry.subject);
            }
          } catch (e) {
            // Firestore error: keep the run alive and mark entry unscheduled
            validResults.pop();
            savedSchedules.pop();
            unscheduledResults.push(entry.subject);
          }
        } else {
          // Double booked! Move to unscheduled
          unscheduledResults.push(entry.subject);
        }
      }

      setResult({
        ...gaResult,
        schedule: validResults,
        unscheduled: unscheduledResults,
        usedLegacy: false
      });

    } catch (error) {
      console.error("GA Engine Error:", error);
      setResult({
        schedule: [],
        fitness: { score: 0, hardViolations: 0, softScore: 0 },
        stats: { generations: 0, totalAssignments: 0, hardViolations: 0 },
        unscheduled: [],
        error: error.message
      });
    }

    setLoading(false);
  };

  const progressPct = progress.max > 0 ? Math.round((progress.gen / progress.max) * 100) : 0;

  const targetOptions = engineMode === 'faculty'
    ? (professors || []).map(p => ({ id: p.id, label: p.name }))
    : engineMode === 'room'
      ? (rooms || []).map(r => ({ id: r.id, label: `${r.name} (Cap: ${r.capacity})${r.hasComputers ? ' Lab' : ''}` }))
      : (sections || []).map(s => ({ id: s.id, label: s.name }));

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
        <h2 style={{ margin: '0 0 5px 0', color: 'var(--accent-dark)' }}>Auto-Schedule Engine</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Genetic Algorithm (full) or Targeted (faculty/room/section) for small runs
        </p>
      </div>

      {/* Algorithm Info */}
      <div style={{ backgroundColor: 'var(--table-header)', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '5px' }}>Mode</label>
          <select
            value={engineMode}
            onChange={(e) => { setEngineMode(e.target.value); setTargetId(''); }}
            disabled={loading}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: '#fff', boxSizing: 'border-box' }}
          >
            <option value="ga">Full timetable (Genetic Algorithm)</option>
            <option value="faculty">Targeted: One faculty</option>
            <option value="room">Targeted: One room</option>
            <option value="section">Targeted: One section (student group)</option>
          </select>
        </div>

        {/* GA Parameters */}
        {engineMode === 'ga' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Population Size</label>
            <input type="number" min="20" max="200" value={populationSize} onChange={e => setPopulationSize(parseInt(e.target.value) || 80)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Max Generations</label>
            <input type="number" min="50" max="1000" value={maxGenerations} onChange={e => setMaxGenerations(parseInt(e.target.value) || 300)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Mutation Rate</label>
            <input type="number" min="0.01" max="0.5" step="0.01" value={mutationRate} onChange={e => setMutationRate(parseFloat(e.target.value) || 0.15)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }} />
          </div>
          </div>
        )}

        {engineMode !== 'ga' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Select {engineMode}
              </label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: '#fff', boxSizing: 'border-box' }}
              >
                <option value="">Choose...</option>
                {targetOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Constraints */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>Active Constraints</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={preventDoubleBooking} onChange={(e) => setPreventDoubleBooking(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
            Strict Faculty, Room & Section Non-Overlap
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={respectLabs} onChange={(e) => setRespectLabs(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
            Enforce Computer Laboratory Requirements
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={clearBeforeRun} onChange={(e) => setClearBeforeRun(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
            Clear existing schedules before run
          </label>
        </div>
      </div>

      {/* Data Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Sections', value: (sections || []).length, color: '#1565c0' },
          { label: 'Subjects', value: subjects.length, color: '#6a1b9a' },
          { label: 'Faculty', value: (professors || []).length, color: '#2e7d32' },
          { label: 'Rooms', value: (rooms || []).length, color: '#e65100' },
        ].map((item, i) => (
          <div key={i} style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-main)', borderRadius: '8px', borderLeft: `3px solid ${item.color}` }}>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: item.color }}>{item.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* No sections warning */}
      {(!sections || sections.length === 0) && (
        <div style={{ padding: '12px', marginBottom: '15px', background: '#fff3e0', border: '1px solid #ffe0b2', borderRadius: '8px', fontSize: '0.85rem', color: '#e65100' }}>
          ⚠️ <strong>No sections defined.</strong> Add sections via "Section Management" to unlock the Genetic Algorithm. The legacy greedy algorithm will be used as fallback.
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleAutoSchedule}
        disabled={loading || (engineMode !== 'ga' && !targetId)}
        className="btn"
        style={{ width: '100%', padding: '14px', fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
      >
        {loading
          ? (engineMode === 'ga' ? '🧬 Evolving Schedule...' : '⚡ Scheduling...')
          : (engineMode === 'ga' ? '🧬 Generate Timetable with GA' : '⚡ Run Targeted Auto-Schedule')
        }
      </button>

      {/* Progress Bar */}
      {loading && (
        <div className="ga-progress-container" style={{ marginTop: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
            <span>Generation {progress.gen} / {progress.max}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="ga-progress-bar-bg">
            <div className="ga-progress-bar-fill" style={{ width: `${progressPct}%` }}></div>
          </div>
          {progress.fitness && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              <span>Score: <strong style={{ color: progress.fitness.hardViolations === 0 ? 'var(--success)' : 'var(--danger)' }}>{progress.fitness.score}</strong></span>
              <span>Violations: <strong style={{ color: progress.fitness.hardViolations === 0 ? 'var(--success)' : 'var(--danger)' }}>{progress.fitness.hardViolations}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="result-container" style={{ marginTop: '20px' }}>
          {/* Fitness Summary */}
          {!result.usedLegacy && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '15px' }}>
              <div style={{ textAlign: 'center', padding: '12px', background: result.stats.hardViolations === 0 ? 'var(--success-bg)' : 'var(--danger-bg)', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: result.stats.hardViolations === 0 ? 'var(--success)' : 'var(--danger)' }}>{result.stats.hardViolations}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Violations</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-main)', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--accent-primary)' }}>{result.fitness.score}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fitness Score</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-main)', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-main)' }}>{result.stats.generations}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Generations</div>
              </div>
            </div>
          )}

          {result.usedLegacy && (
            <div style={{ padding: '10px', background: '#fff3e0', borderRadius: '8px', fontSize: '0.82rem', color: '#e65100', marginBottom: '10px' }}>
              ⚠️ Used legacy greedy algorithm (no sections defined). Add sections to use the Genetic Algorithm.
            </div>
          )}

          {/* Success list */}
          <div className={`result-section ${result.schedule.length > 0 ? 'success' : ''}`}>
            <h3 style={{ fontSize: '1rem', marginBottom: '10px' }}>Successfully Scheduled ({result.schedule.length})</h3>
            <div className="result-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {result.schedule.map((item, idx) => (
                <div key={idx} className="result-item" style={{ padding: '10px', borderLeft: '3px solid var(--success)', marginBottom: '8px', backgroundColor: 'var(--bg-main)', borderRadius: '4px' }}>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: 'var(--text-main)' }}>
                    {item.subject.code} {item.section ? `— ${item.section.name}` : ''}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {item.day} | {item.timeSlot.label} | {item.room.name} | {item.professor.name}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Error */}
          {result.error && (
            <div className="result-section error" style={{ marginTop: '15px' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: '10px' }}>Engine Error</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--danger)' }}>{result.error}</p>
            </div>
          )}

          {result.unscheduled && result.unscheduled.length > 0 && (
            <div className="result-section error" style={{ marginTop: '15px' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: '10px' }}>Unscheduled ({result.unscheduled.length})</h3>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--danger)' }}>
                {result.unscheduled.map((s, idx) => (
                  <li key={idx}>
                    {(s?.subject?.code || s?.subject?.name || s?.code || s?.name || 'Unknown')}
                    {s?.section?.name ? ` — ${s.section.name}` : ''}
                    {' — '}
                    {s?.reason || 'Insufficient valid slots'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AutoScheduler;