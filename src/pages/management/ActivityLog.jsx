import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, limit, onSnapshot, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import {
  ACTION_LABELS,
  ACTION_COLORS,
  ACTION_ICONS,
  LOG_ACTIONS
} from '../../utils/activityLogger';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { toast } from 'sonner';

// Helpers

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

// Comprehensive Category Filters
const CATEGORY_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Auth', value: 'auth', actions: ['LOGIN', 'LOGOUT'] },
  { label: 'Schedule', value: 'schedule', actions: ['ADD_SCHEDULE', 'UPDATE_SCHEDULE', 'DELETE_SCHEDULE', 'BATCH_DELETE_SCHEDULES', 'CLEAR_SCHEDULES', 'AUTO_SCHEDULE'] },
  { label: 'Faculty', value: 'faculty', actions: ['ADD_FACULTY', 'UPDATE_FACULTY', 'DELETE_FACULTY'] },
  { label: 'Subjects', value: 'subjects', actions: ['ADD_SUBJECT', 'UPDATE_SUBJECT', 'DELETE_SUBJECT'] },
  { label: 'Rooms', value: 'rooms', actions: ['ADD_ROOM', 'UPDATE_ROOM', 'DELETE_ROOM'] },
  { label: 'Sections', value: 'sections', actions: ['ADD_SECTION', 'UPDATE_SECTION', 'DELETE_SECTION'] },
  { label: 'Departments', value: 'departments', actions: ['ADD_DEPARTMENT', 'UPDATE_DEPARTMENT', 'DELETE_DEPARTMENT'] },
  { label: 'Courses', value: 'courses', actions: ['ADD_COURSE', 'UPDATE_COURSE', 'DELETE_COURSE'] },
  { label: 'Terms & Settings', value: 'terms', actions: ['ADD_TERM', 'UPDATE_TERM', 'DELETE_TERM', 'PUBLISH_TERM', 'UNPUBLISH_TERM'] },
  { label: 'Users', value: 'users', actions: ['ADD_USER', 'UPDATE_USER', 'DELETE_USER'] },
  { label: 'Recycle Bin', value: 'recycle-bin', actions: ['RESTORE_DATA', 'PERMANENT_DELETE', 'EMPTY_RECYCLE_BIN'] },
  { label: 'Exports', value: 'exports', actions: ['EXPORT'] },
];

const TIME_RANGES = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Past 7 Days', value: '7d' },
  { label: 'Past 30 Days', value: '30d' },
];

const ROLE_OPTIONS = [
  { label: 'All Roles', value: 'all' },
  { label: 'Admin', value: 'admin' },
  { label: 'Department Head', value: 'department head' },
  { label: 'Faculty', value: 'faculty' },
  { label: 'Student', value: 'student' },
];

// Main Component

const ActivityLog = ({ onBack, onViewProfile }) => {
  const { confirm } = useGlobalDialog();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [logLimit, setLogLimit] = useState(250);
  const [expandedId, setExpandedId] = useState(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Fetch user profile by username
  const handleUsernameClick = useCallback((e, username) => {
    e.stopPropagation();
    if (!username || username === '—') return;
    if (onViewProfile) onViewProfile(username);
  }, [onViewProfile]);

  // Real-time listener
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

  // Filtered list
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Category filter
    if (categoryFilter !== 'all') {
      const cat = CATEGORY_FILTERS.find(c => c.value === categoryFilter);
      if (cat?.actions) {
        result = result.filter(l => cat.actions.includes(l.action));
      }
    }

    // Role filter
    if (roleFilter !== 'all') {
      result = result.filter(l => (l.userRole || '').toLowerCase() === roleFilter.toLowerCase());
    }

    // Time range filter
    if (timeRange !== 'all') {
      const now = new Date();
      let thresholdDate = new Date();
      if (timeRange === 'today') {
        thresholdDate.setHours(0, 0, 0, 0);
      } else if (timeRange === '7d') {
        thresholdDate.setDate(now.getDate() - 7);
      } else if (timeRange === '30d') {
        thresholdDate.setDate(now.getDate() - 30);
      }

      result = result.filter(l => {
        const d = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.clientTimestamp || l.timestamp);
        return !isNaN(d) && d >= thresholdDate;
      });
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        (l.username || '').toLowerCase().includes(q) ||
        (l.userRole || '').toLowerCase().includes(q) ||
        (ACTION_LABELS[l.action] || l.action || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q) ||
        (l.meta && JSON.stringify(l.meta).toLowerCase().includes(q))
      );
    }

    return result;
  }, [logs, categoryFilter, roleFilter, timeRange, searchQuery]);

  // Category Counts
  const categoryCounts = useMemo(() => {
    const counts = { all: logs.length };
    CATEGORY_FILTERS.forEach(cat => {
      if (cat.value !== 'all') {
        counts[cat.value] = logs.filter(l => cat.actions.includes(l.action)).length;
      }
    });
    return counts;
  }, [logs]);

  // Handlers
  const handleDeleteEntry = async (logId) => {
    const isConfirmed = await confirm({
      title: 'Delete Log Entry?',
      text: 'Are you sure you want to delete this specific audit log entry?',
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });
    if (isConfirmed) {
      try {
        await deleteDoc(doc(db, 'activityLogs', logId));
        toast.success('Log entry deleted');
      } catch (err) {
        console.error('Failed to delete log entry:', err);
        toast.error('Failed to delete log entry');
      }
    }
  };

  const handleClearAll = async () => {
    const isConfirmed = await confirm({
      title: `Clear ${filteredLogs.length} Filtered Logs?`,
      text: 'This will permanently delete the currently visible activity log entries from the database.',
      icon: 'warning',
      confirmButtonText: 'Clear All',
      isDestructive: true
    });
    if (!isConfirmed) return;
    setIsDeletingAll(true);
    const toastId = toast.loading('Clearing activity logs...');
    try {
      // Chunk delete in batches of 400 to respect Firestore batch limits
      const chunkSize = 400;
      for (let i = 0; i < filteredLogs.length; i += chunkSize) {
        const chunk = filteredLogs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach(l => batch.delete(doc(db, 'activityLogs', l.id)));
        await batch.commit();
      }
      toast.success('Activity logs cleared successfully', { id: toastId });
    } catch (err) {
      console.error('Failed to clear logs:', err);
      toast.error('Failed to clear logs: ' + err.message, { id: toastId });
    } finally {
      setIsDeletingAll(false);
    }
  };


  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayLogs = logs.filter(l => {
      const d = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.clientTimestamp || l.timestamp);
      return !isNaN(d) && d >= today;
    });
    const uniqueUsers = new Set(logs.map(l => l.username).filter(Boolean)).size;
    const actionCounts = logs.reduce((acc, l) => {
      acc[l.action] = (acc[l.action] || 0) + 1;
      return acc;
    }, {});
    const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];

    return { todayCount: todayLogs.length, uniqueUsers, topAction };
  }, [logs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header & Stats Card */}
      <div className="card" style={{ padding: '24px 28px' }}>
        <div className="mgmt-header" style={{ marginBottom: '16px' }}>
          <div className="mgmt-header-left">
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                Back
              </button>
            )}
            <div className="mgmt-header-info">
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.35)', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </span>
                Activity Log & Audit Trail
              </h2>
              <p>
                Comprehensive, real-time audit record of all system modifications, logins, scheduling actions, and admin operations.
              </p>
            </div>
          </div>

          {/* Action Buttons: Clear */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm"
              onClick={handleClearAll}
              disabled={isDeletingAll || filteredLogs.length === 0}
              style={{
                background: isDeletingAll || filteredLogs.length === 0 ? 'var(--bg-main)' : 'rgba(239, 68, 68, 0.1)',
                color: isDeletingAll || filteredLogs.length === 0 ? 'var(--text-muted)' : 'var(--danger)',
                border: isDeletingAll || filteredLogs.length === 0 ? '1px solid var(--border-color)' : '1px solid rgba(239, 68, 68, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              {isDeletingAll ? 'Clearing…' : 'Clear Logs'}
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { label: "Today's Actions", value: stats.todayCount, color: '#6366f1', icon: 'M12 2v10l4 2', filter: () => { setTimeRange('today'); setCategoryFilter('all'); } },
            { label: 'Total Logs Loaded', value: logs.length, color: '#10b981', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', filter: () => { setTimeRange('all'); setCategoryFilter('all'); setSearchQuery(''); } },
            { label: 'Active Users', value: stats.uniqueUsers, color: '#f59e0b', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
            { label: 'Most Common', value: stats.topAction ? (ACTION_LABELS[stats.topAction[0]] || stats.topAction[0]) : '—', color: '#8b5cf6', icon: 'M18 20V10M12 20V4M6 20v-6', filter: () => { if (stats.topAction) setSearchQuery(ACTION_LABELS[stats.topAction[0]] || stats.topAction[0]); } },
          ].map((s, i) => (
            <div 
              key={i} 
              style={{ 
                background: 'var(--bg-main)', border: '1px solid var(--border-color)', 
                borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 12, 
                alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s ease' 
              }}
              onMouseEnter={e => { 
                e.currentTarget.style.transform = 'translateY(-2px)'; 
                e.currentTarget.style.boxShadow = `0 6px 16px ${s.color}20`; 
                e.currentTarget.style.borderColor = `${s.color}60`; 
              }}
              onMouseLeave={e => { 
                e.currentTarget.style.transform = 'none'; 
                e.currentTarget.style.boxShadow = 'none'; 
                e.currentTarget.style.borderColor = 'var(--border-color)'; 
              }}
              onClick={s.filter}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconSvg path={s.icon} color={s.color} size={18} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginTop: 2, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Tabs & Toolbar */}
      <div className="card" style={{ padding: '16px 20px' }}>
        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {CATEGORY_FILTERS.map(cat => {
            const count = categoryCounts[cat.value] || 0;
            const isSelected = categoryFilter === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(cat.value)}
                style={{
                  padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s ease', display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: isSelected ? 'var(--accent-primary)' : 'var(--bg-main)',
                  color: isSelected ? '#fff' : 'var(--text-muted)',
                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                  boxShadow: isSelected ? '0 4px 12px rgba(86, 69, 238, 0.25)' : 'none'
                }}
              >
                <span>{cat.label}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: '0.7rem',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--border-color)',
                    color: isSelected ? '#fff' : 'var(--text-main)'
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search, Time Range, Role Filter & Limit */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input
              type="text"
              className="form-input"
              placeholder="Search by action, user, details..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '36px', borderRadius: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Time Range Filter */}
          <select
            className="form-select"
            value={timeRange}
            onChange={e => setTimeRange(e.target.value)}
            style={{ borderRadius: '10px', padding: '8px 12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            {TIME_RANGES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            className="form-select"
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            style={{ borderRadius: '10px', padding: '8px 12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            {ROLE_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {/* Fetch Limit Selector */}
          <select
            className="form-select"
            value={logLimit}
            onChange={e => setLogLimit(Number(e.target.value))}
            style={{ borderRadius: '10px', padding: '8px 12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            <option value={50}>Fetch 50 entries</option>
            <option value={100}>Fetch 100 entries</option>
            <option value={250}>Fetch 250 entries</option>
            <option value={500}>Fetch 500 entries</option>
            <option value={1000}>Fetch 1000 entries</option>
          </select>
        </div>
      </div>

      {/* Log Entries Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border-color)', borderTop: '3px solid var(--accent-primary)', borderRadius: '50%', margin: '0 auto 14px' }} />
            Loading activity audit records…
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35, display: 'block', margin: '0 auto 12px' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)' }}>No activity logs found</p>
            <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>Try clearing your search query or selecting a broader category filter.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <div style={{ minWidth: '850px' }}>
              {/* Table Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 3.5fr 1.3fr 40px', gap: 0, padding: '12px 20px', background: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)' }}>
                {['Action / Event', 'User & Role', 'Details', 'Time', ''].map((h, i) => (
                  <div key={i} style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                ))}
              </div>

              {/* Rows */}
              <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {filteredLogs.map((log, idx) => {
                  const color = ACTION_COLORS[log.action] || '#64748b';
                  const label = ACTION_LABELS[log.action] || log.action;
                  const iconPath = ACTION_ICONS[log.action] || 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z';
                  const isExpanded = expandedId === log.id;
                  const fullDateStr = formatFullDate(log.timestamp || log.clientTimestamp);

                  return (
                    <div
                      key={log.id}
                      style={{
                        borderBottom: idx < filteredLogs.length - 1 ? '1px solid var(--border-color)' : 'none',
                        transition: 'background 0.15s ease',
                        background: isExpanded ? 'rgba(99,102,241,0.04)' : 'transparent',
                      }}
                    >
                      <div
                        style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 3.5fr 1.3fr 40px', gap: 0, padding: '13px 20px', cursor: 'pointer', alignItems: 'center' }}
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      >
                        {/* Action badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d={iconPath} />
                            </svg>
                          </div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color, background: `${color}18`, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                            {label}
                          </span>
                        </div>

                        {/* User - clickable to show profile */}
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
                        <div style={{ fontSize: '0.83rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                          {log.details || <em style={{ color: 'var(--text-muted)', opacity: 0.6 }}>No details recorded</em>}
                        </div>

                        {/* Time */}
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }} title={fullDateStr}>
                          {formatTimestamp(log.timestamp || log.clientTimestamp)}
                        </div>

                        {/* Expand arrow */}
                        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div style={{ padding: '0 20px 16px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
                            <DetailBox label="Full Timestamp" value={fullDateStr} />
                            <DetailBox label="Username" value={log.username} />
                            <DetailBox label="Role" value={log.userRole} />
                            <DetailBox label="Action Code" value={log.action} mono />
                          </div>
                          {log.details && (
                            <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-card, #fff)', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Details Description</span>
                              {log.details}
                            </div>
                          )}
                          {log.meta && Object.keys(log.meta).length > 0 && (
                            <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--bg-card, #fff)', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--text-muted)', overflowX: 'auto' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Attached Metadata</span>
                              {JSON.stringify(log.meta, null, 2)}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              Doc ID: {log.id}
                            </span>
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
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Showing <strong>{filteredLogs.length}</strong> of <strong>{logs.length}</strong> loaded logs
              </span>
              {logs.length >= logLimit && (
                <button
                  onClick={() => setLogLimit(l => l + 250)}
                  style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 8px' }}
                >
                  Load more logs ({logLimit + 250}) ↓
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
  <div style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 12px' }}>
    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: mono ? '0.78rem' : '0.85rem', color: 'var(--text-main)', fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit' }}>{value || '—'}</div>
  </div>
);

export default ActivityLog;
