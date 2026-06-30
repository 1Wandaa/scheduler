import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, limit, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import {
  ACTION_LABELS,
  ACTION_COLORS,
  ACTION_ICONS,
} from '../../utils/activityLogger';
import Swal from 'sweetalert2';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatTimestamp = (ts) => {
  if (!ts) return '—';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(date)) return '—';
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatFullDate = (ts) => {
  if (!ts) return '—';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(date)) return '—';
  return date.toLocaleString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const IconSvg = ({ path, size = 16, color = 'currentColor' }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d={path} />
  </svg>
);

// ─── Category Groups ─────────────────────────────────────────────────────────

const CATEGORY_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Auth', value: 'auth', actions: ['LOGIN', 'LOGOUT'] },
  { label: 'Schedule', value: 'schedule', actions: ['ADD_SCHEDULE', 'UPDATE_SCHEDULE', 'DELETE_SCHEDULE', 'CLEAR_SCHEDULES', 'AUTO_SCHEDULE', 'PUBLISH_TERM', 'UNPUBLISH_TERM'] },
  { label: 'Faculty', value: 'faculty', actions: ['ADD_FACULTY', 'UPDATE_FACULTY', 'DELETE_FACULTY'] },
  { label: 'Subjects', value: 'subjects', actions: ['ADD_SUBJECT', 'UPDATE_SUBJECT', 'DELETE_SUBJECT'] },
  { label: 'Rooms', value: 'rooms', actions: ['ADD_ROOM', 'UPDATE_ROOM', 'DELETE_ROOM'] },
  { label: 'Sections', value: 'sections', actions: ['ADD_SECTION', 'UPDATE_SECTION', 'DELETE_SECTION'] },
  { label: 'Users', value: 'users', actions: ['ADD_USER', 'UPDATE_USER', 'DELETE_USER'] },
];

// ─── Main Component ──────────────────────────────────────────────────────────

const ActivityLog = ({ onBack, onViewProfile }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [logLimit, setLogLimit] = useState(100);
  const [expandedId, setExpandedId] = useState(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // ─── Fetch user profile by username ────────────────────────────────
  const handleUsernameClick = useCallback((e, username) => {
    e.stopPropagation(); // prevent row expand toggle
    if (!username || username === '—') return;
    if (onViewProfile) onViewProfile(username);
  }, [onViewProfile]);

  // ─── Real-time listener ─────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'activityLogs'),
      orderBy('timestamp', 'desc'),
      limit(logLimit)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setLogs(fetched);
      setLoading(false);
    }, (err) => {
      console.error('ActivityLog listener error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [logLimit]);

  // ─── Filtered list ──────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    let result = logs;

    if (categoryFilter !== 'all') {
      const cat = CATEGORY_FILTERS.find(c => c.value === categoryFilter);
      if (cat?.actions) {
        result = result.filter(l => cat.actions.includes(l.action));
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        (l.username || '').toLowerCase().includes(q) ||
        (ACTION_LABELS[l.action] || l.action || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [logs, categoryFilter, searchQuery]);

  // ─── Handlers ───────────────────────────────────────────────────────
  const handleDeleteEntry = async (logId) => {
    const result = await Swal.fire({
      title: 'Delete this log entry?',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      customClass: { popup: 'minimal-swal', title: 'minimal-title', actions: 'minimal-actions', confirmButton: 'btn-delete', cancelButton: 'back-btn' },
      buttonsStyling: false,
    });
    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'activityLogs', logId));
      } catch (err) {
        console.error('Failed to delete log entry:', err);
      }
    }
  };

  const handleClearAll = async () => {
    const result = await Swal.fire({
      title: 'Clear All Logs?',
      text: 'This will permanently delete all visible activity log entries.',
      showCancelButton: true,
      confirmButtonText: 'Clear All',
      cancelButtonText: 'Cancel',
      customClass: { popup: 'minimal-swal', title: 'minimal-title', actions: 'minimal-actions', confirmButton: 'btn-delete', cancelButton: 'back-btn' },
      buttonsStyling: false,
    });
    if (!result.isConfirmed) return;
    setIsDeletingAll(true);
    try {
      await Promise.all(filteredLogs.map(l => deleteDoc(doc(db, 'activityLogs', l.id))));
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
    setIsDeletingAll(false);
  };

  // ─── Stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayLogs = logs.filter(l => {
      const d = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.clientTimestamp);
      return d >= today;
    });
    const uniqueUsers = new Set(logs.map(l => l.username)).size;
    const actionCounts = logs.reduce((acc, l) => {
      acc[l.action] = (acc[l.action] || 0) + 1;
      return acc;
    }, {});
    const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];

    return { todayCount: todayLogs.length, uniqueUsers, topAction };
  }, [logs]);

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{ animation: 'fadeIn 0.4s' }}>

      {/* ── Header ── */}
      <div className="card" style={{ marginBottom: '20px', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                Back
              </button>
            )}
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.35)', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </span>
                Activity Log
              </h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Real-time audit trail of all user actions in the system
              </p>
            </div>
          </div>
          <button
            onClick={handleClearAll}
            disabled={isDeletingAll || filteredLogs.length === 0}
            style={{
              padding: '8px 16px', borderRadius: 8,
              background: 'transparent',
              border: '1.5px solid var(--danger)',
              color: 'var(--danger)',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: isDeletingAll || filteredLogs.length === 0 ? 0.5 : 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            {isDeletingAll ? 'Clearing…' : 'Clear Logs'}
          </button>
        </div>

        {/* ── Stats row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 20 }}>
          {[
            { label: "Today's Actions", value: stats.todayCount, color: '#6366f1', icon: 'M12 2v10l4 2' },
            { label: 'Total Logs Loaded', value: logs.length, color: '#10b981', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
            { label: 'Active Users', value: stats.uniqueUsers, color: '#f59e0b', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
            { label: 'Most Common', value: stats.topAction ? (ACTION_LABELS[stats.topAction[0]] || stats.topAction[0]) : '—', color: '#8b5cf6', icon: 'M18 20V10M12 20V4M6 20v-6' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconSvg path={s.icon} color={s.color} size={16} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', marginTop: 1, lineHeight: 1.2 }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="card" style={{ marginBottom: '16px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORY_FILTERS.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(cat.value)}
                style={{
                  padding: '5px 13px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: categoryFilter === cat.value ? 'var(--accent-primary)' : 'transparent',
                  color: categoryFilter === cat.value ? '#fff' : 'var(--text-muted)',
                  border: categoryFilter === cat.value ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-color)',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                placeholder="Search logs…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ padding: '7px 12px 7px 30px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem', width: 200 }}
              />
            </div>
            <select
              value={logLimit}
              onChange={e => setLogLimit(Number(e.target.value))}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.82rem', cursor: 'pointer' }}
            >
              <option value={50}>Last 50</option>
              <option value={100}>Last 100</option>
              <option value={250}>Last 250</option>
              <option value={500}>Last 500</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Log List ── */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border-color)', borderTop: '3px solid var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 14px' }} />
            Loading activity logs…
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>No logs found</p>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>Try adjusting your filters or performing some actions.</p>
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 3fr 1.2fr 40px', gap: 0, padding: '10px 20px', background: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)' }}>
              {['Action', 'User', 'Details', 'Time', ''].map((h, i) => (
                <div key={i} style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            <div style={{ maxHeight: '62vh', overflowY: 'auto' }}>
              {filteredLogs.map((log, idx) => {
                const color = ACTION_COLORS[log.action] || '#64748b';
                const label = ACTION_LABELS[log.action] || log.action;
                const iconPath = ACTION_ICONS[log.action] || 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z';
                const isExpanded = expandedId === log.id;

                return (
                  <div
                    key={log.id}
                    style={{
                      borderBottom: idx < filteredLogs.length - 1 ? '1px solid var(--border-color)' : 'none',
                      transition: 'background 0.15s',
                      background: isExpanded ? 'rgba(99,102,241,0.04)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--bg-main)'; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div
                      style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 3fr 1.2fr 40px', gap: 0, padding: '13px 20px', cursor: 'pointer', alignItems: 'center' }}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      {/* Action badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d={iconPath} />
                          </svg>
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color, background: `${color}18`, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                          {label}
                        </span>
                      </div>

                      {/* User — clickable to show profile */}
                      <div>
                        <button
                          onClick={(e) => handleUsernameClick(e, log.username)}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                            {log.username || '—'}
                          </div>
                        </button>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 1 }}>{log.userRole || ''}</div>
                      </div>

                      {/* Details */}
                      <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                        {log.details || <em style={{ opacity: 0.5 }}>No details</em>}
                      </div>

                      {/* Time */}
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {formatTimestamp(log.timestamp)}
                      </div>

                      {/* Expand arrow */}
                      <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div style={{ padding: '0 20px 16px 20px', borderTop: '1px solid var(--border-color)', animation: 'fadeIn 0.2s' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
                          <DetailBox label="Full Timestamp" value={formatFullDate(log.timestamp)} />
                          <DetailBox label="Username" value={log.username} />
                          <DetailBox label="Role" value={log.userRole} />
                          <DetailBox label="Action Code" value={log.action} mono />
                        </div>
                        {log.details && (
                          <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-main)', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Details</span>
                            {log.details}
                          </div>
                        )}
                        {log.meta && Object.keys(log.meta).length > 0 && (
                          <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--bg-main)', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--text-muted)', overflowX: 'auto' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Metadata</span>
                            {JSON.stringify(log.meta, null, 2)}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteEntry(log.id); }}
                            style={{ padding: '5px 12px', borderRadius: 6, background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', gap: 5, alignItems: 'center' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            Delete Entry
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Showing <strong>{filteredLogs.length}</strong> of <strong>{logs.length}</strong> logs
              </span>
              {logs.length >= logLimit && (
                <button
                  onClick={() => setLogLimit(l => l + 100)}
                  style={{ fontSize: '0.78rem', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 8px' }}
                >
                  Load more ↓
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const DetailBox = ({ label, value, mono }) => (
  <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 12px' }}>
    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: mono ? '0.78rem' : '0.85rem', color: 'var(--text-main)', fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit' }}>{value || '—'}</div>
  </div>
);

export default ActivityLog;
