import React, { useState } from 'react';
import './AutoScheduler.css';

function AutoScheduler({ validator, subjects, onAutoSchedule }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [algorithm] = useState('Deterministic Greedy Algorithm');
  const [respectLabs, setRespectLabs] = useState(true);
  const [preventDoubleBooking, setPreventDoubleBooking] = useState(true);

  const handleAutoSchedule = async () => {
    setLoading(true);
    setResult(null);

    setTimeout(() => {
      try {
        validator.clearAllSchedules();

        const autoResult = validator.autoSchedule(subjects, {
          respectLabs,
          preventDoubleBooking
        });

        setResult(autoResult);
        onAutoSchedule();
      } catch (error) {
        console.error("AutoSchedule Engine Error:", error);
        setResult({
          results: [],
          unscheduled: subjects, // FIX: Passing the full objects now!
          error: error.message
        });
      }
      setLoading(false);
    }, 1200);
  };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s' }}>
      <div style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
        <h2 style={{ margin: '0 0 5px 0', color: 'var(--accent-dark)' }}>Auto-Schedule Engine</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Configure parameters for the timetable generation</p>
      </div>

      <div style={{ backgroundColor: 'var(--table-header)', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '5px' }}>Algorithm Method</label>
          <input
            type="text"
            value={algorithm}
            disabled
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: '#fff', color: 'var(--accent-primary)', fontWeight: 'bold' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>Active Constraints</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={preventDoubleBooking} onChange={(e) => setPreventDoubleBooking(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
            Strict Faculty & Room Non-Overlap
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={respectLabs} onChange={(e) => setRespectLabs(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
            Enforce Computer Laboratory Requirements
          </label>
        </div>
      </div>

      <button
        onClick={handleAutoSchedule}
        disabled={loading}
        className="btn"
        style={{ width: '100%', padding: '12px', fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
      >
        {loading ? 'Executing Algorithm...' : 'Generate Timetable'}
      </button>

      {result && (
        <div className="result-container" style={{ marginTop: '20px' }}>
          <div className={`result-section ${result.results.length > 0 ? 'success' : ''}`}>
            <h3 style={{ fontSize: '1rem', marginBottom: '10px' }}>Successfully Scheduled ({result.results.length})</h3>
            <div className="result-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {result.results.map((item, idx) => (
                <div key={idx} className="result-item" style={{ padding: '10px', borderLeft: '3px solid var(--success)', marginBottom: '8px', backgroundColor: 'var(--bg-main)', borderRadius: '4px' }}>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: 'var(--text-main)' }}>{item.subject.code}</p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.day} | {item.timeSlot.label} | {item.room.name}</p>
                </div>
              ))}
            </div>
          </div>

          {result.unscheduled.length > 0 && (
            <div className="result-section error" style={{ marginTop: '15px' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: '10px' }}>Conflict Errors ({result.unscheduled.length})</h3>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--danger)' }}>
                {result.unscheduled.map((subject, idx) => (
                  <li key={idx}>{subject.code ? subject.code : subject.name} - Insufficient valid slots</li>
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