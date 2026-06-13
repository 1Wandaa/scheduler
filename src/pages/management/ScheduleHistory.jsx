import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { db } from '../../config/firebase';
import { writeBatch, getDocs, collection } from 'firebase/firestore';

const ScheduleHistory = ({ history, onBack }) => {
  const [expandedId, setExpandedId] = useState(null);

  const handleClearHistory = async () => {
    const result = await Swal.fire({
      title: 'Clear History?',
      text: "This will permanently delete all scheduling history records.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        const snap = await getDocs(collection(db, 'scheduleHistory'));
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        Swal.fire('Deleted!', 'Schedule history has been cleared.', 'success');
      } catch (error) {
        console.error("Error clearing history:", error);
        Swal.fire('Error', 'Failed to clear history.', 'error');
      }
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.4s' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-sm" onClick={onBack} style={{ padding: '4px 8px', marginRight: '8px' }}>←</button>
          Scheduling History
        </h2>
        <button className="btn btn-danger btn-sm" onClick={handleClearHistory} disabled={!history || history.length === 0}>
          Clear History
        </button>
      </div>

      <div style={{ marginTop: '20px' }}>
        {(!history || history.length === 0) ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No scheduling history found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.map((record) => (
              <div key={record.id} style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                background: 'var(--bg-main)',
                overflow: 'hidden'
              }}>
                <div 
                  onClick={() => toggleExpand(record.id)}
                  style={{
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: expandedId === record.id ? 'rgba(0,0,0,0.02)' : 'transparent',
                    borderBottom: expandedId === record.id ? '1px solid var(--border-color)' : 'none'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                      {new Date(record.timestamp?.toMillis ? record.timestamp.toMillis() : Date.now()).toLocaleString()}
                    </strong>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Mode: <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{record.engineMode}</span> | 
                      Total Attempted: {record.totalAttempted}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--success)' }}>{record.successCount}</div>
                      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Success</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: record.errorCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{record.errorCount}</div>
                      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Failed</div>
                    </div>
                    <div style={{ color: 'var(--text-muted)', transform: expandedId === record.id ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                      ▼
                    </div>
                  </div>
                </div>

                {expandedId === record.id && (
                  <div style={{ padding: '16px', background: 'var(--card-bg)' }}>
                    {record.errorCount === 0 ? (
                      <div style={{ color: 'var(--success)', fontWeight: 500 }}>All classes were scheduled successfully!</div>
                    ) : (
                      <div>
                        <h4 style={{ color: 'var(--danger)', marginBottom: '10px' }}>Unscheduled / Conflicts</h4>
                        <div style={{ display: 'grid', gap: '10px' }}>
                          {(record.errors || []).map((err, idx) => (
                            <div key={idx} style={{
                              padding: '12px',
                              background: 'linear-gradient(135deg, rgba(239,68,68,0.04), rgba(249,115,22,0.04))',
                              borderLeft: '4px solid var(--danger)',
                              borderRadius: '6px',
                              fontSize: '0.85rem'
                            }}>
                              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{err.subject} {err.section ? `— ${err.section}` : ''}</div>
                              <div style={{ color: 'var(--danger)' }}>Reason: {err.reason}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleHistory;
