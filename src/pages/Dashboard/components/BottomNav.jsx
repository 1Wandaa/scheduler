import React from 'react';
import { Icon, NAV_ICONS } from './Icon';

const BottomNav = ({ activeTab, handleTabClick, isAdmin, setIsMobileMenuOpen }) => (
  <div className="bottom-nav">
    {isAdmin && (
      <button className={`bottom-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleTabClick('dashboard')}>
        <Icon d={NAV_ICONS.dashboard} size={20} />
        <span>Home</span>
      </button>
    )}
    <button className={`bottom-nav-btn ${activeTab === 'view-schedules' ? 'active' : ''}`} onClick={() => handleTabClick('view-schedules')}>
      <Icon d={NAV_ICONS.viewSchedules} size={20} />
      <span>Schedules</span>
    </button>
    {isAdmin && (
      <button className={`bottom-nav-btn ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => handleTabClick('schedule')}>
        <Icon d={NAV_ICONS.schedule} size={20} />
        <span>Create</span>
      </button>
    )}
    <button className="bottom-nav-btn" onClick={() => setIsMobileMenuOpen(true)}>
      <Icon d={NAV_ICONS.menu} size={20} />
      <span>Menu</span>
    </button>
  </div>
);

export default BottomNav;
