import React from 'react';
import { Icon } from './Icon';

const KpiTile = ({ label, value, iconPath, color, onClick }) => {
  const lighten = (hex, amt) => {
    let r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, r + amt);
    g = Math.min(255, g + amt);
    b = Math.min(255, b + amt);
    return `rgb(${r},${g},${b})`;
  };
  const gradEnd = lighten(color, 60);

  return (
    <div
      className="kpi-tile"
      onClick={onClick}
      data-clickable={onClick ? 'true' : 'false'}
    >
      <div
        className="kpi-icon"
        style={{
          background: `linear-gradient(135deg, ${color}, ${gradEnd})`,
          boxShadow: `0 4px 14px ${color}40`,
        }}
      >
        <Icon d={iconPath} size={22} />
      </div>
      <div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  );
};

export default React.memo(KpiTile);
