import React from 'react';
import { Icon } from './Icon';

const KpiTile = ({ label, value, iconPath, color, onClick }) => {
  const lighten = (hex, amt) => {
    let r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
    r = Math.min(255, r + amt); g = Math.min(255, g + amt); b = Math.min(255, b + amt);
    return `rgb(${r},${g},${b})`;
  };
  const gradEnd = lighten(color, 60);
  return (
    <div className="kpi-tile" onClick={onClick} style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border-color)',
      borderRadius: '16px',
      padding: '22px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: '18px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s ease',
      cursor: onClick ? 'pointer' : 'default',
      animation: 'floatUp 0.5s ease-out backwards',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div className="kpi-icon" style={{
        width: 48, height: 48,
        borderRadius: '14px',
        background: `linear-gradient(135deg, ${color}, ${gradEnd})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
        flexShrink: 0,
        boxShadow: `0 4px 14px ${color}40`,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease',
      }}>
        <Icon d={iconPath} size={22} />
      </div>
      <div>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>{value}</div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  );
};

export default KpiTile;
