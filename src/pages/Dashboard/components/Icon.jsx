import React from 'react';

export const Icon = ({ d, size = 18 }) => {
  // Support rich icon definitions with multiple element types
  if (typeof d === 'object' && !Array.isArray(d) && d.elements) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }}>
        {d.elements.map((el, i) => {
          if (el.type === 'circle') return <circle key={i} cx={el.cx} cy={el.cy} r={el.r} fill={el.fill || 'none'} />;
          if (el.type === 'rect') return <rect key={i} x={el.x} y={el.y} width={el.width} height={el.height} rx={el.rx || 0} ry={el.ry || 0} />;
          if (el.type === 'polyline') return <polyline key={i} points={el.points} />;
          if (el.type === 'line') return <line key={i} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} />;
          if (el.type === 'polygon') return <polygon key={i} points={el.points} />;
          return <path key={i} d={el.d || el} />;
        })}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
};

export const NAV_ICONS = {
  // Dashboard — 4-square grid (LayoutDashboard style)
  dashboard: { elements: [
    { d: "M3 3h7v7H3z" },
    { d: "M14 3h7v7h-7z" },
    { d: "M3 14h7v7H3z" },
    { d: "M14 14h7v7h-7z" },
  ]},
  // Faculty — graduation cap
  faculty: { elements: [
    { d: "M22 10L12 5 2 10l10 5 10-5z" },
    { d: "M6 12v5c0 2 3 4 6 4s6-2 6-4v-5" },
    { type: 'line', x1: 22, y1: 10, x2: 22, y2: 16 },
  ]},
  // Rooms — building with columns
  rooms: { elements: [
    { d: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" },
    { type: 'line', x1: 2, y1: 22, x2: 22, y2: 22 },
    { d: "M10 6h4" },
    { d: "M10 10h4" },
    { d: "M10 14h4" },
    { d: "M10 18h4" },
  ]},
  // Subjects — open book
  subjects: { elements: [
    { d: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" },
    { d: "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" },
  ]},
  // Sections — users with layered badge
  sections: { elements: [
    { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" },
    { type: 'circle', cx: 9, cy: 7, r: 4 },
    { d: "M22 21v-2a4 4 0 0 0-3-3.87" },
    { d: "M16 3.13a4 4 0 0 1 0 7.75" },
  ]},
  // Users — person with shield
  users: { elements: [
    { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
    { type: 'circle', cx: 12, cy: 10, r: 2.5 },
    { d: "M9.5 16c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5" },
  ]},
  // Schedule — calendar with plus
  schedule: { elements: [
    { d: "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" },
    { type: 'line', x1: 16, y1: 2, x2: 16, y2: 6 },
    { type: 'line', x1: 8, y1: 2, x2: 8, y2: 6 },
    { type: 'line', x1: 3, y1: 10, x2: 21, y2: 10 },
    { type: 'line', x1: 12, y1: 14, x2: 12, y2: 18 },
    { type: 'line', x1: 10, y1: 16, x2: 14, y2: 16 },
  ]},
  // Workload — pie chart
  workload: { elements: [
    { d: "M21.21 15.89A10 10 0 1 1 8 2.83" },
    { d: "M22 12A10 10 0 0 0 12 2v10z" },
  ]},
  // View Schedules — search / magnifying glass with table
  viewSchedules: { elements: [
    { type: 'circle', cx: 11, cy: 11, r: 8 },
    { type: 'line', x1: 21, y1: 21, x2: 16.65, y2: 16.65 },
    { type: 'line', x1: 8, y1: 8, x2: 14, y2: 8 },
    { type: 'line', x1: 8, y1: 11, x2: 14, y2: 11 },
    { type: 'line', x1: 8, y1: 14, x2: 12, y2: 14 },
  ]},
  // Logout — power icon
  logout: { elements: [
    { d: "M18.36 6.64a9 9 0 1 1-12.73 0" },
    { type: 'line', x1: 12, y1: 2, x2: 12, y2: 12 },
  ]},
  // Manage data — settings cog
  manage: { elements: [
    { type: 'circle', cx: 12, cy: 12, r: 3 },
    { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" },
  ]},
  // Simple arrows/chevrons/menu stay as plain paths
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  menu: { elements: [
    { type: 'line', x1: 3, y1: 6, x2: 21, y2: 6 },
    { type: 'line', x1: 3, y1: 12, x2: 21, y2: 12 },
    { type: 'line', x1: 3, y1: 18, x2: 21, y2: 18 },
  ]},
  print: { elements: [
    { type: 'polyline', points: "6 9 6 2 18 2 18 9" },
    { d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" },
    { d: "M6 14h12v8H6z" },
  ]},
  // Calendar — semester/term icon
  calendar: { elements: [
    { type: 'rect', x: 3, y: 4, width: 18, height: 18, rx: 2, ry: 2 },
    { type: 'line', x1: 16, y1: 2, x2: 16, y2: 6 },
    { type: 'line', x1: 8, y1: 2, x2: 8, y2: 6 },
    { type: 'line', x1: 3, y1: 10, x2: 21, y2: 10 },
    { type: 'line', x1: 8, y1: 14, x2: 8, y2: 14 },
    { type: 'line', x1: 12, y1: 14, x2: 12, y2: 14 },
    { type: 'line', x1: 16, y1: 14, x2: 16, y2: 14 },
    { type: 'line', x1: 8, y1: 18, x2: 8, y2: 18 },
    { type: 'line', x1: 12, y1: 18, x2: 12, y2: 18 },
  ]},
  history: { elements: [
    { type: 'circle', cx: 12, cy: 12, r: 10 },
    { type: 'polyline', points: "12 6 12 12 16 14" },
  ]},
};
