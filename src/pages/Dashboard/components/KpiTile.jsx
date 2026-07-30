import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';

const KpiTile = ({ label, value, iconPath, color, onClick }) => {
  const lighten = (hex, amt) => {
    let r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
    r = Math.min(255, r + amt); g = Math.min(255, g + amt); b = Math.min(255, b + amt);
    return `rgb(${r},${g},${b})`;
  };
  const gradEnd = lighten(color, 60);

  // Animated count-up
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const target = typeof value === 'number' ? value : parseInt(value, 10);
    if (isNaN(target)) { setDisplayValue(value); return; }

    const start = prevValue.current;
    const diff = target - start;
    if (diff === 0) return;

    const duration = 600;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
      else prevValue.current = target;
    };

    requestAnimationFrame(animate);
    prevValue.current = target;
  }, [value]);

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
        <div className="kpi-value">{displayValue}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  );
};

export default KpiTile;
