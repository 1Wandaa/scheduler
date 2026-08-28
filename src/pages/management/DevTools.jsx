/**
 * DevTools.jsx — Developer Tools page for test data management.
 *
 * Admin-only page with three actions:
 *   1. Seed Test Data — generates sample data for testing
 *   2. Start Fresh   — archives current data and clears collections
 *   3. Restore Data  — restores the previously archived snapshot
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  seedTestData,
  archiveAndReset,
  restoreArchivedData,
  hasArchivedData,
} from '../../services/testDataService';

/* ── inline styles ── */
const styles = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 28,
    flexWrap: 'wrap',
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #f59e0b, #f97316)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 22,
    boxShadow: '0 4px 14px rgba(245,158,11,0.35)',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '1.55rem',
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.82rem',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 500,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 20,
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
  },
  cardIcon: (bg) => ({
    width: 48,
    height: 48,
    borderRadius: 14,
    background: bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    boxShadow: `0 4px 16px ${bg}44`,
  }),
  cardTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#fff',
  },
  cardDesc: {
    margin: 0,
    fontSize: '0.84rem',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.55,
    flex: 1,
  },
  btn: (bg) => ({
    padding: '12px 22px',
    border: 'none',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: '0.88rem',
    cursor: 'pointer',
    background: bg,
    color: '#fff',
    transition: 'opacity 0.2s, transform 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }),
  toast: (type) => ({
    padding: '14px 20px',
    borderRadius: 12,
    fontSize: '0.85rem',
    fontWeight: 600,
    marginTop: 20,
    border: '1px solid',
    lineHeight: 1.5,
    ...(type === 'success'
      ? { background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.3)', color: '#34d399' }
      : { background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }),
  }),
  warning: {
    padding: '12px 16px',
    borderRadius: 10,
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.25)',
    color: '#fbbf24',
    fontSize: '0.8rem',
    fontWeight: 500,
    lineHeight: 1.5,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
};

const Spinner = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);

const DevTools = ({ activeSemester, activeSchoolYear, onBack }) => {
  const [loading, setLoading]   = useState(null);   // 'seed' | 'archive' | 'restore'
  const [toast, setToast]       = useState(null);    // { type, message }
  const [archiveExists, setArchiveExists] = useState(false);

  const checkArchive = useCallback(async () => {
    try { setArchiveExists(await hasArchivedData()); } catch { /* ignore */ }
  }, []);

  useEffect(() => { checkArchive(); }, [checkArchive]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 6000);
  };

  // ── Seed ──
  const handleSeed = async () => {
    if (!window.confirm('This will add sample test data (rooms, faculty, subjects, sections, schedules) to the current term. Continue?')) return;
    setLoading('seed');
    try {
      const result = await seedTestData(activeSemester, activeSchoolYear);
      showToast('success',
        `✅ Test data seeded!\n${result.rooms} rooms · ${result.professors} faculty · ${result.subjects} subjects · ${result.sections} sections · ${result.schedules} schedules`
      );
    } catch (err) {
      showToast('error', `❌ Seeding failed: ${err.message}`);
    } finally {
      setLoading(null);
    }
  };

  // ── Archive & Reset ──
  const handleArchive = async () => {
    if (!window.confirm(
      '⚠️ This will ARCHIVE all current data (rooms, faculty, subjects, sections, schedules) and clear the system.\n\nYour data is NOT deleted — it is stored in a snapshot and can be restored.\n\nContinue?'
    )) return;
    setLoading('archive');
    try {
      const result = await archiveAndReset();
      showToast('success', `✅ Archived ${result.totalArchived} records. System is now clean.`);
      await checkArchive();
    } catch (err) {
      showToast('error', `❌ Archive failed: ${err.message}`);
    } finally {
      setLoading(null);
    }
  };

  // ── Restore ──
  const handleRestore = async () => {
    if (!window.confirm(
      'This will RESTORE your previously archived data. Any current data will be replaced.\n\nContinue?'
    )) return;
    setLoading('restore');
    try {
      const result = await restoreArchivedData();
      showToast('success', `✅ Restored ${result.totalRestored} records successfully!`);
      await checkArchive();
    } catch (err) {
      showToast('error', `❌ Restore failed: ${err.message}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={styles.page}>
      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={styles.header}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
        )}
        <div style={styles.headerIcon}>🛠️</div>
        <div>
          <h2 style={styles.title}>Developer Tools</h2>
          <p style={styles.subtitle}>Seed test data, archive & reset, or restore — without losing anything</p>
        </div>
      </div>

      {/* Action Cards */}
      <div style={styles.grid}>

        {/* Seed Test Data */}
        <div style={styles.card}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(99,102,241,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={styles.cardIcon('linear-gradient(135deg, #6366f1, #8b5cf6)')}>🧪</div>
          <h3 style={styles.cardTitle}>Seed Test Data</h3>
          <p style={styles.cardDesc}>
            Generate sample rooms, faculty, subjects, sections, and schedules for <strong style={{ color: '#a5b4fc' }}>{activeSemester} ({activeSchoolYear})</strong>.
            Adds data without removing anything existing.
          </p>
          <div style={styles.warning}>
            <span>⚡</span>
            <span>Creates 5 rooms, 6 faculty, 8 subjects, 4 sections, and 4 schedules with <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4, fontSize: '0.78rem' }}>TEST_</code> prefixed IDs.</span>
          </div>
          <button
            style={styles.btn('linear-gradient(135deg, #6366f1, #8b5cf6)')}
            onClick={handleSeed}
            disabled={!!loading}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {loading === 'seed' ? <><Spinner /> Seeding...</> : '🧪  Seed Test Data'}
          </button>
        </div>

        {/* Start Fresh */}
        <div style={styles.card}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(245,158,11,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={styles.cardIcon('linear-gradient(135deg, #f59e0b, #f97316)')}>🧹</div>
          <h3 style={styles.cardTitle}>Start Fresh</h3>
          <p style={styles.cardDesc}>
            Archives ALL current data (rooms, faculty, subjects, sections, schedules) into a safe snapshot, then clears the system so it appears empty.
          </p>
          <div style={styles.warning}>
            <span>🔒</span>
            <span>Your data is <strong>NOT deleted</strong> — it's stored in a recoverable snapshot. Use "Restore" to bring it back anytime.</span>
          </div>
          <button
            style={styles.btn('linear-gradient(135deg, #f59e0b, #f97316)')}
            onClick={handleArchive}
            disabled={!!loading}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {loading === 'archive' ? <><Spinner /> Archiving...</> : '🧹  Start Fresh (Archive & Reset)'}
          </button>
        </div>

        {/* Restore Archived Data */}
        <div style={{
          ...styles.card,
          opacity: archiveExists ? 1 : 0.4,
          pointerEvents: archiveExists ? 'auto' : 'none',
        }}
          onMouseEnter={(e) => { if (archiveExists) { e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(16,185,129,0.1)'; } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div style={styles.cardIcon('linear-gradient(135deg, #10b981, #059669)')}>♻️</div>
          <h3 style={styles.cardTitle}>Restore Archived Data</h3>
          <p style={styles.cardDesc}>
            {archiveExists
              ? 'A data snapshot was found! Click below to restore all your archived rooms, faculty, subjects, sections, and schedules.'
              : 'No archived data found. Use "Start Fresh" first to create a snapshot, then you can restore it here.'}
          </p>
          {archiveExists && (
            <div style={{ ...styles.warning, borderColor: 'rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.1)', color: '#6ee7b7' }}>
              <span>💾</span>
              <span>Current data will be replaced by the archived snapshot. This cannot be undone.</span>
            </div>
          )}
          <button
            style={styles.btn(archiveExists ? 'linear-gradient(135deg, #10b981, #059669)' : '#374151')}
            onClick={handleRestore}
            disabled={!!loading || !archiveExists}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {loading === 'restore' ? <><Spinner /> Restoring...</> : '♻️  Restore Archived Data'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={styles.toast(toast.type)}>
          {toast.message.split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DevTools;
