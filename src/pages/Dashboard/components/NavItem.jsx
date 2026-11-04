import React from 'react';
import { Icon } from './Icon';

const NavItem = ({ label, iconPath, active, onClick, danger, indent }) => (
  <li
    className={`nav-item${active ? ' active' : ''}${indent ? ' nav-sub-item' : ''}${danger ? ' nav-danger' : ''}`}
    onClick={onClick}
  >
    {iconPath && <Icon d={iconPath} size={indent ? 15 : 18} />}
    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
  </li>
);

export default NavItem;
