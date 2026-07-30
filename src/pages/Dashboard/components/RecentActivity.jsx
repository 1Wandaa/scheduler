import React from 'react';
import { Icon, NAV_ICONS } from './Icon';

const RecentActivity = ({ schedules, onViewAll }) => {
  const colors = ['#5645EE', '#059669', '#d97706', '#0288d1'];

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="widget-card-header">
        <h3 className="widget-card-title">
          <Icon d={NAV_ICONS.schedule} size={16} /> Recently Scheduled
        </h3>
        <button className="widget-view-all-btn" onClick={onViewAll}>
          View All
        </button>
      </div>
      <div className="activity-list">
        {schedules.slice(-4).reverse().map((s, i) => {
          const accentColor = colors[i % colors.length];
          return (
            <div
              key={s.id || i}
              className="activity-item"
              style={{ borderLeft: `3px solid ${accentColor}` }}
            >
              <div className="activity-item-content">
                <div className="activity-item-title">
                  {s.subject?.code} {s.section && <span>({s.section?.name})</span>}
                </div>
                <div className="activity-item-meta">
                  {s.professor?.name} • {s.room?.name}
                </div>
              </div>
              <div
                className="activity-time-badge"
                style={{
                  background: `linear-gradient(135deg, ${accentColor}12, ${accentColor}08)`,
                  border: `1px solid ${accentColor}20`,
                }}
              >
                <div className="activity-time-day" style={{ color: accentColor }}>
                  {typeof s.day === 'string' ? s.day.slice(0, 3) : s.day}
                </div>
                <div className="activity-time-slot">
                  {s.timeSlot?.label?.split(' - ')[0]}
                </div>
              </div>
            </div>
          );
        })}
        {schedules.length === 0 && (
          <div className="activity-empty">
            <Icon d={NAV_ICONS.schedule} size={32} />
            <p>No classes scheduled yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentActivity;
