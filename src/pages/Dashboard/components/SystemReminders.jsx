import React, { useMemo } from 'react';
import { Icon, NAV_ICONS } from './Icon';

const SystemReminders = ({
  subjects = [],
  professors = [],
  schedules = [],
  sections = [],
  publishedTerms = {},
  activeSemester = '',
  activeSchoolYear = '',
  onNavigate
}) => {
  const reminders = useMemo(() => {
    const list = [];
    const termKey = `${activeSemester}_${activeSchoolYear}`;
    const isPublished = publishedTerms[termKey] === true;

    // 1. Check term publish status
    if (schedules.length > 0 && !isPublished) {
      list.push({
        type: 'warning',
        icon: NAV_ICONS.calendar,
        title: 'Unpublished Schedule',
        text: `Schedules for ${activeSemester || 'current term'} are currently hidden from students.`,
        actionTab: 'terms',
        actionLabel: 'Manage Terms'
      });
    }

    // 2. Check for active semester subjects with no qualified faculty
    const activeSubjs = subjects.filter(
      s => !s.semester || s.semester === 'Both' || s.semester === activeSemester
    );
    const unassignedCount = activeSubjs.filter(sub => {
      const hasProf = professors.some(p => {
        const specs = p.specialization || [];
        return specs.includes(sub.id) || (sub.code && specs.includes(sub.code)) || (sub.name && specs.includes(sub.name));
      });
      return !hasProf;
    }).length;

    if (unassignedCount > 0) {
      list.push({
        type: 'warning',
        icon: NAV_ICONS.subjects,
        title: 'Unassigned Subjects',
        text: `${unassignedCount} active subject${unassignedCount > 1 ? 's have' : ' has'} no qualified faculty assigned.`,
        actionTab: 'assignments',
        actionLabel: 'Teaching Load Management'
      });
    }

    // 3. Check for overloaded faculty
    const overloadedCount = professors.filter(p => {
      const profScheds = schedules.filter(s => s.professor?.id && String(s.professor.id) === String(p.id));
      const counted = new Set();
      let units = 0;
      profScheds.forEach(s => {
        if (!s.subject || !s.section) return;
        const key = `${s.subject.id}-${s.section.id}`;
        if (!counted.has(key)) {
          counted.add(key);
          units += Number(s.subject.credits || s.subject.units || 3);
        }
      });
      const cap = Number(p.maxUnits || p.maxHours || 12);
      return units > cap;
    }).length;

    if (overloadedCount > 0) {
      list.push({
        type: 'warning',
        icon: NAV_ICONS.workload,
        title: 'Faculty Overload',
        text: `${overloadedCount} faculty member${overloadedCount > 1 ? 's exceed' : ' exceeds'} their max unit capacity.`,
        actionTab: 'workload',
        actionLabel: 'View Workload'
      });
    }

    // 4. Check for sections with zero scheduled classes
    if (sections.length > 0 && schedules.length > 0) {
      const unscheduledSecs = sections.filter(sec => {
        const secScheds = schedules.filter(s => s.section?.id && String(s.section.id) === String(sec.id));
        return secScheds.length === 0;
      }).length;

      if (unscheduledSecs > 0) {
        list.push({
          type: 'accent',
          icon: NAV_ICONS.sections,
          title: 'Unscheduled Sections',
          text: `${unscheduledSecs} section${unscheduledSecs > 1 ? 's have' : ' has'} no classes scheduled yet.`,
          actionTab: 'schedule',
          actionLabel: 'Create Schedule'
        });
      }
    }

    // 5. Default healthy state checklist if nothing is flagged
    if (list.length === 0) {
      list.push({
        type: 'accent',
        icon: NAV_ICONS.manage,
        title: 'System Ready',
        text: 'All subjects have assigned faculty, and scheduling constraints are within normal thresholds.',
        actionTab: 'schedule',
        actionLabel: 'Schedule'
      });
    }

    return list.slice(0, 3);
  }, [subjects, professors, schedules, sections, publishedTerms, activeSemester, activeSchoolYear]);

  return (
    <div className="card" style={{ padding: '22px' }}>
      <div className="widget-card-header" style={{ marginBottom: '16px' }}>
        <h3 className="widget-card-title">
          <span
            className="widget-icon-badge"
            style={{
              background: 'linear-gradient(135deg, #5645EE, #8B5CF6)',
              boxShadow: '0 2px 8px rgba(86,69,238,0.25)',
            }}
          >
            <Icon d={NAV_ICONS.manage} size={14} />
          </span>
          System Reminders
        </h3>
      </div>

      <div className="reminder-list">
        {reminders.map((item, idx) => {
          const isWarn = item.type === 'warning';
          return (
            <div
              key={idx}
              className={`reminder-item ${isWarn ? 'reminder-item-warning' : 'reminder-item-accent'}`}
              style={{ cursor: onNavigate && item.actionTab ? 'pointer' : 'default' }}
              onClick={() => onNavigate && item.actionTab && onNavigate(item.actionTab)}
            >
              <span className={`reminder-icon ${isWarn ? 'reminder-icon-warning' : 'reminder-icon-accent'}`}>
                <Icon d={item.icon} size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong className={`reminder-title ${isWarn ? 'reminder-title-warning' : 'reminder-title-accent'}`}>
                    {item.title}
                  </strong>
                  {item.actionLabel && onNavigate && (
                    <span style={{ fontSize: '0.72rem', color: isWarn ? '#b45309' : '#5645ee', fontWeight: 600 }}>
                      {item.actionLabel} &rarr;
                    </span>
                  )}
                </div>
                <span className={`reminder-text ${isWarn ? 'reminder-text-warning' : 'reminder-text-accent'}`}>
                  {item.text}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SystemReminders;
