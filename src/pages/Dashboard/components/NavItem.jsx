import React from 'react';
import { Icon } from './Icon';

const NavItem = ({ label, iconPath, active, onClick, danger, indent }) => (
  <li
    className={`nav-item${active ? ' active' : ''}${indent ? ' nav-sub-item' : ''}${danger ? ' nav-danger' : ''}`}
    onClick={onClick}
    style={{
      color: danger ? '#f87171' : active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text-muted)',
      background: active ? 'rgba(86, 69, 238, 0.2)' : 'transparent',
      fontWeight: active ? 600 : 500,
      cursor: 'pointer',
      userSelect: 'none',
      listStyle: 'none',
    }}
  >
    {iconPath && <Icon d={iconPath} size={indent ? 14 : 16} />}
    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
  </li>
);

export default NavItem;
