import React from 'react';
import { Icon, NAV_ICONS } from './Icon';

const SystemReminders = () => {
  return (
    <div className="card" style={{ padding: '22px' }}>
      <h3 className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 28, height: 28, borderRadius: '8px',
          background: 'linear-gradient(135deg, #5645EE, #8B5CF6)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', boxShadow: '0 2px 8px rgba(86,69,238,0.25)'
        }}>
          <Icon d={NAV_ICONS.manage} size={14} />
        </span>
        System Reminders
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{
          padding: '14px 16px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)',
          border: '1px solid rgba(86,69,238,0.1)',
          display: 'flex', gap: '12px', alignItems: 'flex-start',
          transition: 'transform 0.2s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <span style={{
            width: 32, height: 32, borderRadius: '8px', flexShrink: 0,
            background: 'rgba(86,69,238,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#5645EE',
          }}>
            <Icon d={NAV_ICONS.subjects} size={16} />
          </span>
          <div>
            <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.88rem', color: '#312e81' }}>Pre-Scheduling Checklist</strong>
            <span style={{ fontSize: '0.8rem', color: '#6366f1', lineHeight: 1.5 }}>Ensure all faculty specializations and lab requirements are accurate before running the algorithm.</span>
          </div>
        </div>

        <div style={{
          padding: '14px 16px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #FEF6E9, #FFF7ED)',
          border: '1px solid rgba(245,166,35,0.15)',
          display: 'flex', gap: '12px', alignItems: 'flex-start',
          transition: 'transform 0.2s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <span style={{
            width: 32, height: 32, borderRadius: '8px', flexShrink: 0,
            background: 'rgba(245,166,35,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#d97706',
          }}>
            <Icon d={NAV_ICONS.workload} size={16} />
          </span>
          <div>
            <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.88rem', color: '#92400e' }}>Monitor Workloads</strong>
            <span style={{ fontSize: '0.8rem', color: '#b45309', lineHeight: 1.5 }}>Regularly check the Workload Report. Assignments exceeding max units will be flagged.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemReminders;
