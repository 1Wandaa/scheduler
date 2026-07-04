import React, { useState } from 'react';
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
      iconPath: NAV_ICONS.rooms, // using rooms icon as fallback if specific dept icon is missing
      isComplete: departments && departments.length > 0,
      action: 'departments'
    },
    {
      id: 'courses',
      title: 'Add Courses / Programs',
      description: 'List the academic programs offered.',
      iconPath: NAV_ICONS.subjects, // using subjects icon as fallback
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
  return (
    <div className="card" style={{ padding: '22px', animation: 'fadeIn 0.5s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: isCollapsed ? '0' : '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <span style={{
              width: 28, height: 28, borderRadius: '8px',
              background: 'linear-gradient(135deg, #10B981, #34D399)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: '0 2px 8px rgba(16,185,129,0.25)'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </span>
            Quick Start Guide
          </h3>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{ 
              background: 'rgba(16, 185, 129, 0.1)', 
              color: '#10B981', 
              border: 'none', 
              borderRadius: '20px', 
              padding: '4px 12px', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
          >
            {isCollapsed ? 'Show' : 'Hide'}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            {progressPercentage}% Complete
          </span>
          <div style={{ width: '100px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${progressPercentage}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>
      
      {!isCollapsed && (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
            Welcome to Smartsched! Follow these steps in order to set up your system data so you can begin scheduling.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {steps.map((step, index) => (
          <div 
            key={step.id}
            onClick={() => onNavigate(step.action)}
            style={{
              padding: '12px 16px', 
              borderRadius: '12px',
              background: step.isComplete ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-main)',
              border: step.isComplete ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border-color)',
              display: 'flex', gap: '14px', alignItems: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              opacity: (index > 0 && !steps[index - 1].isComplete && !step.isComplete) ? 0.6 : 1,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = step.isComplete ? 'rgba(16, 185, 129, 0.2)' : 'var(--border-color)';
            }}
          >
            <span style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: step.isComplete ? '#10B981' : 'var(--bg-card)',
              border: step.isComplete ? 'none' : '2px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: step.isComplete ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.3s ease',
            }}>
              {step.isComplete ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              ) : (
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{index + 1}</span>
              )}
            </span>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', fontSize: '0.9rem', color: step.isComplete ? 'var(--text-main)' : 'var(--text-main)', textDecoration: step.isComplete ? 'line-through' : 'none', opacity: step.isComplete ? 0.6 : 1 }}>
                {step.title}
              </strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{step.description}</span>
            </div>
            <div style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
};

export default QuickStartGuide;
