import React from 'react';
import { Icon, NAV_ICONS } from './Icon';

const RecentActivity = ({ schedules, onViewAll }) => {
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="card-header" style={{ marginBottom: '14px', borderBottom: 'none', paddingBottom: 0 }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon d={NAV_ICONS.schedule} size={16} /> Recently Scheduled
        </h3>
        <button className="btn btn-sm" onClick={onViewAll} style={{ background: 'transparent', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', boxShadow: 'none' }}>
          View All
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {schedules.slice(-4).reverse().map((s, i) => {
          const colors = ['#5645EE', '#059669', '#d97706', '#0288d1'];
          const accentColor = colors[i % colors.length];
          return (
            <div key={s.id || i} style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-main)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderLeft: `3px solid ${accentColor}`,
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                  {s.subject?.code} {s.section && <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>({s.section?.name})</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px', fontWeight: 500 }}>
                  {s.professor?.name} • {s.room?.name}
                </div>
              </div>
              <div style={{
                textAlign: 'center',
                background: `linear-gradient(135deg, ${accentColor}12, ${accentColor}08)`,
                padding: '8px 14px',
                borderRadius: '10px',
                border: `1px solid ${accentColor}20`,
                minWidth: '52px',
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {typeof s.day === 'string' ? s.day.slice(0, 3) : s.day}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>
                  {s.timeSlot?.label?.split(' - ')[0]}
                </div>
              </div>
            </div>
          );
        })}
        {schedules.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'var(--bg-main)' }}>
            <Icon d={NAV_ICONS.schedule} size={32} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '10px 0 0' }}>No classes scheduled yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentActivity;
