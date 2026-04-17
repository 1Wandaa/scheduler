import React, { useState } from 'react';
import './AutoScheduler.css';

function AutoScheduler({ validator, subjects, onAutoSchedule }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleAutoSchedule = async () => {
    setLoading(true);
    try {
      // Clear previous schedules for fresh start
      validator.clearAllSchedules();
      
      const autoResult = validator.autoSchedule(subjects);
      setResult(autoResult);
      onAutoSchedule();
    } catch (error) {
      setResult({
        results: [],
        unscheduled: subjects.map(s => s.name),
        error: error.message
      });
    }
    setLoading(false);
  };

  return (
    <div className="auto-scheduler-container">
      <h2>Auto-Scheduler</h2>
      <button 
        onClick={handleAutoSchedule} 
        disabled={loading}
        className="auto-schedule-btn"
      >
        {loading ? 'Scheduling...' : 'Auto-Schedule All'}
      </button>

      {result && (
        <div className="result-container">
          <div className={`result-section ${result.results.length > 0 ? 'success' : ''}`}>
            <h3>✓ Successfully Scheduled ({result.results.length})</h3>
            <div className="result-list">
              {result.results.map((item, idx) => (
                <div key={idx} className="result-item">
                  <p><strong>{item.subject}</strong></p>
                  <p>Prof: {item.professor}</p>
                  <p>Room: {item.room}</p>
                  <p>{item.day} {item.time}</p>
                  {item.warnings.length > 0 && (
                    <p className="warnings">⚠️ {item.warnings[0]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {result.unscheduled.length > 0 && (
            <div className="result-section error">
              <h3>✗ Could Not Schedule ({result.unscheduled.length})</h3>
              <ul>
                {result.unscheduled.map((subject, idx) => (
                  <li key={idx}>{subject}</li>
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
