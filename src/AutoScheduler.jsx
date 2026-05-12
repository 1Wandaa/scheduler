import React, { useState } from 'react';
import { ScheduleGA } from './ScheduleGA';
import { TIME_SLOTS, DAYS } from './index';
import './AutoScheduler.css';

function AutoScheduler({ validator, subjects, sections, professors, rooms, onAutoSchedule }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ gen: 0, max: 0, fitness: null });

  const [engineMode, setEngineMode] = useState('ga');
  const [targetId, setTargetId] = useState('');
  const [clearBeforeRun, setClearBeforeRun] = useState(true);

  // Constraints
  const [respectLabs, setRespectLabs] = useState(true);
  const [preventDoubleBooking, setPreventDoubleBooking] = useState(true);

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
    setProgress({ gen: 0, max: 100, fitness: null });

    try {
      if (clearBeforeRun) await validator.clearAllSchedules();

      if (!sections || sections.length === 0) {
        throw new Error("No sections defined. Please add sections in Section Management first.");
      }

      const ga = new ScheduleGA(
        subjects, rooms, professors, sections, DAYS, TIME_SLOTS,
        { populationSize: 80, maxGenerations: 100, mutationRate: 0.15 }
      );

      const gaResult = await ga.solve((gen, bestFitness, totalGens) => {
        setProgress({ gen, max: totalGens, fitness: bestFitness });
      });

      const validResults = [];
      const unscheduledResults = [];
      const savedSchedules = [];

      // Validate the GA output before claiming success
      for (const entry of gaResult.schedule) {
        if (respectLabs && entry.subject?.requiredLab && !entry.room?.hasComputers) {
          unscheduledResults.push({ ...entry, reason: 'Subject requires a computer lab.' });
          continue;
        }

        const sameTimeSlot = (a, b) => a.day === b.day && String(a.timeSlot?.id) === String(b.timeSlot?.id);

        const isConflict = savedSchedules.some(s =>
          sameTimeSlot(s, entry) && (
            String(s.room?.id) === String(entry.room?.id) ||
            String(s.professor?.id) === String(entry.professor?.id) ||
            String(s.section?.id) === String(entry.section?.id)
          )
        );

        if (preventDoubleBooking && isConflict) {
          unscheduledResults.push({ ...entry, reason: 'Overlap conflict detected by engine.' });
          continue;
        }

        // Attempt to save to database
        try {
          const writeResult = await onAutoSchedule(entry);
          if (writeResult && writeResult.ok === false) {
            unscheduledResults.push({ ...entry, reason: writeResult.errors?.join(', ') || 'Database validation failed.' });
          } else {
            savedSchedules.push(entry);
            validResults.push(entry);
          }
        } catch (e) {
          unscheduledResults.push({ ...entry, reason: 'Failed to save to database.' });
        }
      }

      setResult({ schedule: validResults, unscheduled: unscheduledResults, error: null, mode: 'ga' });

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
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '5px' }}>Engine Mode</label>
          <select value={engineMode} onChange={(e) => { setEngineMode(e.target.value); setTargetId(''); }} className="input-group select" style={{ width: '100%', padding: '10px', borderRadius: '6px' }}>
            <option value="ga">Full Timetable (Genetic Algorithm)</option>
            <option value="faculty">Targeted: Single Faculty</option>
            <option value="room">Targeted: Single Room</option>
            <option value="section">Targeted: Single Section</option>
          </select>
        </div>

        {engineMode !== 'ga' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '5px' }}>Select Target</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px' }}>
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
      </div>

      <button onClick={handleExecute} disabled={loading || (engineMode !== 'ga' && !targetId)} className="btn" style={{ width: '100%', padding: '14px', fontSize: '1rem' }}>
        {loading ? 'Processing Schedule...' : 'Generate Timetable'}
      </button>

      {/* Progress Bar */}
      {loading && engineMode === 'ga' && (
        <div style={{ marginTop: '15px' }}>
          <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(progress.gen / progress.max) * 100}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.2s' }}></div>
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: '5px' }}>Generation {progress.gen} / {progress.max}</p>
        </div>
      )}

      {/* REBUILT RESULTS SECTION */}
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

        </div>
      )}
    </div>
  );
}

export default AutoScheduler;