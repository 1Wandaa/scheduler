import React from 'react';
import { Icon, NAV_ICONS } from './Icon';

const BottomNav = ({ activeTab, handleTabClick, isAdmin, setIsMobileMenuOpen }) => (
  <div className="bottom-nav" style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
    {isAdmin && (
      <button className={`bottom-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleTabClick('dashboard')}>
        <Icon d={NAV_ICONS.dashboard} size={22} />
        <span>Home</span>
      </button>
    )}
    <button className={`bottom-nav-btn ${activeTab === 'view-schedules' ? 'active' : ''}`} onClick={() => handleTabClick('view-schedules')}>
      <Icon d={NAV_ICONS.viewSchedules} size={22} />
      <span>Schedules</span>
    </button>
    {isAdmin && (
      <button className={`bottom-nav-btn ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => handleTabClick('schedule')}>
        <Icon d={NAV_ICONS.schedule} size={22} />
        <span>Create</span>
      </button>
    )}
    <button className="bottom-nav-btn" onClick={() => setIsMobileMenuOpen(true)}>
      <Icon d={NAV_ICONS.menu} size={22} />
      <span>Menu</span>
    </button>
  </div>
);

export default BottomNav;
