import React, { useState, useEffect } from 'react';
import { Icon, NAV_ICONS } from './Icon';

const QuickStartGuide = ({ 
  availableSemesters, 
  departments, 
  courses, 
  rooms, 
  professors, 
  subjects, 
  sections, 
  schedules, 
  onNavigate 
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const steps = [
    {
      id: 'terms',
      title: 'Set up Semesters & Years',
      description: 'Define the academic terms for scheduling.',
      iconPath: NAV_ICONS.calendar,
      isComplete: availableSemesters && availableSemesters.length > 0,
      action: 'terms'
    },
    {
      id: 'departments',
      title: 'Add Departments',
      description: 'Create the departments for your institution.',
      iconPath: NAV_ICONS.rooms,
      isComplete: departments && departments.length > 0,
      action: 'departments'
    },
    {
      id: 'courses',
      title: 'Add Courses / Programs',
      description: 'List the academic programs offered.',
      iconPath: NAV_ICONS.subjects,
      isComplete: courses && courses.length > 0,
      action: 'courses'
    },
    {
      id: 'rooms',
      title: 'Add Rooms',
      description: 'Input the available rooms and laboratories.',
      iconPath: NAV_ICONS.rooms,
      isComplete: rooms && rooms.length > 0,
      action: 'rooms'
    },
    {
      id: 'faculty',
      title: 'Add Faculty Profiles',
      description: 'Register professors and set their max units.',
      iconPath: NAV_ICONS.faculty,
      isComplete: professors && professors.length > 0,
      action: 'faculty'
    },
    {
      id: 'subjects',
      title: 'Add Subjects',
      description: 'Create subjects and set lab/hour requirements.',
      iconPath: NAV_ICONS.subjects,
      isComplete: subjects && subjects.length > 0,
      action: 'subjects'
    },
    {
      id: 'sections',
      title: 'Add Sections',
      description: 'Create student sections linked to courses.',
      iconPath: NAV_ICONS.sections,
      isComplete: sections && sections.length > 0,
      action: 'sections'
    },
    {
      id: 'schedule',
      title: 'Create Schedules',
      description: 'Start assigning schedules manually or via AutoScheduler.',
      iconPath: NAV_ICONS.schedule,
      isComplete: schedules && schedules.length > 0,
      action: 'schedule'
    }
  ];

  const completedStepsCount = steps.filter(step => step.isComplete).length;
  const progressPercentage = Math.round((completedStepsCount / steps.length) * 100);
  const isDone = completedStepsCount === steps.length;

  // SVG progress ring math
  const ringRadius = 14;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (progressPercentage / 100) * ringCircumference;

  useEffect(() => {
    if (isDone) {
      setIsCollapsed(true);
    }
  }, [isDone]);

  return (
    <div className="quickstart-container">
      <div className="quickstart-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 className="quickstart-title">
            <span className="widget-icon-badge" style={{ background: 'linear-gradient(135deg, #10B981, #34D399)', boxShadow: '0 2px 8px rgba(16,185,129,0.25)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </span>
            Quick Start Guide
          </h3>
        </div>

        <div className="quickstart-progress">
          <span className="quickstart-progress-text">
            {progressPercentage}%
          </span>
          <svg className="quickstart-progress-ring" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r={ringRadius} fill="none" stroke="var(--border-color)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r={ringRadius} fill="none"
              stroke="var(--accent-primary)" strokeWidth="3"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }}
            />
            <text x="18" y="18" textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="700" fill="var(--text-main)">
              {completedStepsCount}/{steps.length}
            </text>
          </svg>
          <svg
            className={`quickstart-collapse-icon ${!isCollapsed ? 'open' : ''}`}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </div>
      </div>
      
      {!isCollapsed && (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px', marginTop: 0, lineHeight: 1.5 }}>
            Welcome to Smartsched! Follow these steps in order to set up your system data so you can begin scheduling.
          </p>

          <div className="quickstart-steps">
            {steps.map((step, index) => {
              const isLocked = index > 0 && !steps[index - 1].isComplete && !step.isComplete;
              return (
                <div 
                  key={step.id}
                  className={`quickstart-step ${step.isComplete ? 'complete' : 'pending'}`}
                  onClick={() => onNavigate(step.action)}
                  style={{ opacity: isLocked ? 0.6 : 1 }}
                >
                  <span className="quickstart-step-icon">
                    {step.isComplete ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    ) : (
                      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{index + 1}</span>
                    )}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="quickstart-step-title">{step.title}</div>
                    <div className="quickstart-step-desc">{step.description}</div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default QuickStartGuide;
