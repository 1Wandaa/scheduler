import React from 'react';
import { Icon, NAV_ICONS } from './Icon';

const SystemReminders = () => {
  return (
    <div className="card" style={{ padding: '22px' }}>
      <h3 className="widget-card-title" style={{ marginBottom: '16px' }}>
        <span className="widget-icon-badge" style={{ background: 'linear-gradient(135deg, #5645EE, #8B5CF6)', boxShadow: '0 2px 8px rgba(86,69,238,0.25)' }}>
          <Icon d={NAV_ICONS.manage} size={14} />
        </span>
        System Reminders
      </h3>
      <div className="reminder-list">
        <div className="reminder-item reminder-item-accent">
          <span className="reminder-icon reminder-icon-accent">
            <Icon d={NAV_ICONS.subjects} size={16} />
          </span>
          <div>
            <strong className="reminder-title reminder-title-accent">Pre-Scheduling Checklist</strong>
            <span className="reminder-text reminder-text-accent">Ensure all faculty specializations and lab requirements are accurate before running the algorithm.</span>
          </div>
        </div>

        <div className="reminder-item reminder-item-warning">
          <span className="reminder-icon reminder-icon-warning">
            <Icon d={NAV_ICONS.workload} size={16} />
          </span>
          <div>
            <strong className="reminder-title reminder-title-warning">Monitor Workloads</strong>
            <span className="reminder-text reminder-text-warning">Regularly check the Workload Report. Assignments exceeding max units will be flagged.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemReminders;
