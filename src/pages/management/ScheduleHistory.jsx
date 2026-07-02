import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { writeBatch, getDocs, collection } from 'firebase/firestore';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';

const ScheduleHistory = ({ history, onBack }) => {
  const { confirm } = useGlobalDialog();
  const [expandedId, setExpandedId] = useState(null);

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

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown Date';
    const date = new Date(timestamp.toMillis ? timestamp.toMillis() : Date.now());
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.4s', display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 'calc(100vh - 120px)' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
          <button className="btn btn-sm" onClick={onBack} style={{ padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>Scheduling History</span>
        </h2>
        <button 
          onClick={handleClearHistory} 
          disabled={!history || history.length === 0}
          style={{
            background: (!history || history.length === 0) ? 'var(--bg-main)' : 'rgba(239, 68, 68, 0.1)',
            color: (!history || history.length === 0) ? 'var(--text-muted)' : '#ef4444',
            border: (!history || history.length === 0) ? '1px solid var(--border-color)' : '1px solid rgba(239, 68, 68, 0.2)',
            padding: '8px 16px',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: (!history || history.length === 0) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            opacity: (!history || history.length === 0) ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (history && history.length > 0) {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (history && history.length > 0) {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Clear History
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingRight: '12px', marginRight: '4px' }} className="custom-scrollbar">
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
            {history.map((record) => {
              const isExpanded = expandedId === record.id;
              const hasErrors = record.errorCount > 0;
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
                    onClick={() => toggleExpand(record.id)}
                    style={{
                      padding: '20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderBottom: isExpanded ? '1px solid var(--border-color)' : '1px solid transparent',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = 'rgba(0,0,0,0.015)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '12px',
                        background: hasErrors ? 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(217,119,6,0.1))' : 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.1))',
                        color: hasErrors ? '#d97706' : '#10b981',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${hasErrors ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}`
                      }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {hasErrors ? (
                            <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></>
                          ) : (
                            <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></>
                          )}
                        </svg>
                      </div>
                      <div>
                        <strong style={{ fontSize: '1.05rem', color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>
                          {formatDate(record.timestamp)}
                        </strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                          <span style={{ 
                            background: 'var(--bg-main)', border: '1px solid var(--border-color)', 
                            padding: '2px 8px', borderRadius: '6px', color: 'var(--text-muted)', 
                            textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', fontSize: '0.75rem' 
                          }}>
                            {record.engineMode} Mode
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Attempted: <strong style={{ color: 'var(--text-main)' }}>{record.totalAttempted}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', minWidth: '60px' }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{record.successCount}</div>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginTop: '4px', letterSpacing: '0.02em' }}>Success</div>
                      </div>
                      <div style={{ width: '1px', height: '30px', background: 'var(--border-color)' }}></div>
                      <div style={{ textAlign: 'center', minWidth: '60px' }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: hasErrors ? '#ef4444' : 'var(--text-muted)', lineHeight: 1 }}>{record.errorCount}</div>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginTop: '4px', letterSpacing: '0.02em' }}>Failed</div>
                      </div>
                      <div style={{ 
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

                  <div style={{ 
                    maxHeight: isExpanded ? '1000px' : '0px', 
                    opacity: isExpanded ? 1 : 0, 
                    overflow: 'hidden', 
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
                  }}>
                    <div style={{ padding: '20px', background: 'var(--card-bg)' }}>
                      {!hasErrors ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'rgba(16,185,129,0.08)', borderRadius: '12px', border: '1px dashed rgba(16,185,129,0.3)' }}>
                          <div style={{ width: '32px', height: '32px', background: '#10b981', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          </div>
                          <div>
                            <div style={{ color: '#059669', fontWeight: 700, fontSize: '0.95rem' }}>Perfect Generation!</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>All requested classes were scheduled successfully without conflicts.</div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <h4 style={{ color: '#ef4444', margin: '0 0 16px', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            Unscheduled / Conflicts
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                            {(record.errors || []).map((err, idx) => (
                              <div key={idx} style={{
                                padding: '16px',
                                background: 'var(--bg-main)',
                                border: '1px solid var(--border-color)',
                                borderLeft: '4px solid #ef4444',
                                borderRadius: '10px',
                                fontSize: '0.9rem',
                                transition: 'transform 0.2s',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                              >
                                <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                                  {err.subject} 
                                  {err.section && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>— {err.section}</span>}
                                </div>
                                <div style={{ color: '#dc2626', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                  <span style={{ marginTop: '2px', opacity: 0.7 }}>↳</span>
                                  <span style={{ lineHeight: 1.4 }}>{err.reason}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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
      `}</style>
    </div>
  );
};

export default ScheduleHistory;
