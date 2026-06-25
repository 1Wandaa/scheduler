import React from 'react';
import { Icon } from './Icon';

const NavItem = ({ label, iconPath, active, onClick, danger, indent }) => (
  <li
    className={`nav-item${active ? ' active' : ''}${indent ? ' nav-sub-item' : ''}${danger ? ' nav-danger' : ''}`}
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: indent ? '8px 12px 8px 36px' : '10px 12px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: active ? 600 : 400,
      fontSize: indent ? '0.85rem' : '0.9rem',
      color: danger ? 'var(--danger)' : active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text-muted)',
      background: active ? 'rgba(86, 69, 238, 0.2)' : 'transparent',
      userSelect: 'none',
      listStyle: 'none',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    {iconPath && <Icon d={iconPath} size={indent ? 15 : 17} />}
    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
  </li>
);

export default NavItem;
