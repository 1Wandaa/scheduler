import React from 'react';
import { Icon, NAV_ICONS } from './Icon';

const RecentActivity = ({ schedules = [], onViewAll }) => {
  const colors = ['#5645EE', '#059669', '#d97706', '#0288d1'];

  const formatTime = (timeSlot) => {
    if (!timeSlot) return '';
    const label = typeof timeSlot === 'string' ? timeSlot : (timeSlot.label || timeSlot.time || '');
    const start = label.split('-')[0].trim();
    // Return clean time like "2:00" or "8:30"
    return start.replace(/^0/, '').replace(/\s*(AM|PM)/i, '');
  };

  const formatDay = (day) => {
    if (!day) return '';
    if (Array.isArray(day)) return day[0]?.slice(0, 3).toUpperCase() || '';
    return String(day).slice(0, 3).toUpperCase();
  };

  const recentList = (schedules || []).slice(-4).reverse();

  return (
    <div className="card" style={{ padding: '22px' }}>
      <div className="widget-card-header" style={{ marginBottom: '14px' }}>
        <h3 className="widget-card-title">
          <Icon d={NAV_ICONS.schedule} size={16} /> Recently Scheduled
        </h3>
        <button className="widget-view-all-btn" onClick={onViewAll}>
          View All
        </button>
      </div>

      <div className="activity-list">
        {recentList.map((s, i) => {
          const accentColor = colors[i % colors.length];
          const subjectCode = s.subject?.code || s.subjectCode || 'Class';
          const sectionName = s.section?.name || s.sectionName || (typeof s.section === 'string' ? s.section : '');
          const professorName = s.professor?.name || s.professorName || (typeof s.professor === 'string' ? s.professor : 'TBA');
          const roomName = s.room?.name || s.roomName || (typeof s.room === 'string' ? s.room : 'TBA');
          const dayShort = formatDay(s.day);
          const timeShort = formatTime(s.timeSlot);

          return (
            <div
              key={s.id || i}
              className="activity-item"
              style={{ borderLeft: `3px solid ${accentColor}` }}
            >
              <div className="activity-item-content">
                <div className="activity-item-title">
                  {subjectCode} {sectionName && <span>({sectionName})</span>}
                </div>
                <div className="activity-item-meta">
                  {professorName} • {roomName}
                </div>
              </div>

              {(dayShort || timeShort) && (
                <div
                  className="activity-time-badge"
                  style={{
                    background: `linear-gradient(135deg, ${accentColor}12, ${accentColor}08)`,
                    border: `1px solid ${accentColor}20`,
                  }}
                >
                  <div className="activity-time-day" style={{ color: accentColor }}>
                    {dayShort}
                  </div>
                  <div className="activity-time-slot">
                    {timeShort}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {recentList.length === 0 && (
          <div className="activity-empty">
            <Icon d={NAV_ICONS.schedule} size={28} />
            <p>No classes scheduled yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentActivity;
