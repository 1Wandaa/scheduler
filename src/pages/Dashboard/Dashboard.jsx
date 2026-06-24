// src/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { initialRooms, initialProfessors, initialSubjects, initialSections, SEED_VERSION } from '../../config/initialData';
import { TIME_SLOTS, DAYS, SEMESTERS, SCHOOL_YEARS } from '../../config/constants';
import { db } from '../../config/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import Swal from 'sweetalert2';

import UserManagement from '../management/UserManagement';
import ProfessorWorkload from '../../components/ProfessorWorkload/ProfessorWorkload';
import ScheduleTable from '../../components/ScheduleTable/ScheduleTable';
import ScheduleForm from '../../components/ScheduleForm/ScheduleForm';
import AutoScheduler from '../../components/AutoScheduler/AutoScheduler';
import RoomManagement from '../management/RoomManagement';
import FacultyManagement from '../management/FacultyManagement';
import SubjectManagement from '../management/SubjectManagement';
import TermManagement from '../management/TermManagement';
import ScheduleViewer from '../management/ScheduleViewer';
import SectionManagement from '../management/SectionManagement';
import ScheduleHistory from '../management/ScheduleHistory';
import Profile from '../../components/Profile/Profile';
import Chatbot from '../../components/Chatbot/Chatbot';
import {
  professorMatchesSubject,
  findScheduleConflicts,
  getEligibleProfessors,
  applyAIRanking,
  creditPerMeeting,
  slotsNeededFromIndex,
  getTimeSlotIndex,
  schedulesOverlap,
} from '../../utils/scheduleUtils';

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18 }) => {
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

const NAV_ICONS = {
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

const DraggableSpeedDial = ({ onAddSchedule, onAutoScheduleAction, isHidden }) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 76, y: window.innerHeight - 136 });
  const [isOpen, setIsOpen] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0, dragged: false, isDragging: false });

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 56),
        y: Math.min(prev.y, window.innerHeight - 56)
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use passive touch listeners on the document to avoid React's synthetic event issues
  const handleStart = (clientX, clientY) => {
    dragRef.current.startX = clientX;
    dragRef.current.startY = clientY;
    dragRef.current.initialX = position.x;
    dragRef.current.initialY = position.y;
    dragRef.current.dragged = false;
    dragRef.current.isDragging = true;
  };

  const handleMove = (clientX, clientY) => {
    if (!dragRef.current.isDragging) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      dragRef.current.dragged = true;
      setPosition({
        x: Math.max(0, Math.min(dragRef.current.initialX + dx, window.innerWidth - 56)),
        y: Math.max(0, Math.min(dragRef.current.initialY + dy, window.innerHeight - 56))
      });
    }
  };

  const handleEnd = (e) => {
    if (e && e.cancelable) e.preventDefault(); // Prevent ghost mouse events on mobile
    if (!dragRef.current.isDragging) return;
    dragRef.current.isDragging = false;
    if (!dragRef.current.dragged) {
      setIsOpen(prev => !prev);
    }
  };

  return (
    <>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setIsOpen(false)} />
      )}
      <div 
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: '56px',
          height: '56px',
          zIndex: 9999,
          touchAction: 'none',
          display: isHidden ? 'none' : 'block'
        }}
      >
        {/* Speed Dial Menu Items */}
        <div style={{ 
          position: 'absolute',
          bottom: '68px',
          right: '0px',
          display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end',
          opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none',
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
          transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Full Timetable (GA)</span>
            <button onClick={() => { setIsOpen(false); onAutoScheduleAction('ga'); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: '#6366f1', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Gen. by Faculty</span>
            <button onClick={() => { setIsOpen(false); onAutoScheduleAction('faculty'); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: '#10b981', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Gen. by Room</span>
            <button onClick={() => { setIsOpen(false); onAutoScheduleAction('room'); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: '#f59e0b', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Gen. by Section</span>
            <button onClick={() => { setIsOpen(false); onAutoScheduleAction('section'); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: '#8b5cf6', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Manual Schedule</span>
            <button onClick={() => { setIsOpen(false); onAddSchedule(); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: 'var(--accent-primary)', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
        </div>

        {/* Main FAB */}
        <button
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleEnd}
          style={{
            width: '100%', height: '100%', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-primary), #7c3aed)',
            color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(86,69,238,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab',
            transform: isOpen ? 'rotate(45deg)' : 'none',
            transition: 'transform 0.2s ease',
            touchAction: 'none',
            position: 'absolute', top: 0, left: 0
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </>
  );
};

// ─── KPI Tile ───────────────────────────────────────────────────────────────────────
const KpiTile = ({ label, value, iconPath, color }) => {
  const lighten = (hex, amt) => {
    let r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
    r = Math.min(255, r + amt); g = Math.min(255, g + amt); b = Math.min(255, b + amt);
    return `rgb(${r},${g},${b})`;
  };
  const gradEnd = lighten(color, 60);
  return (
    <div className="kpi-tile" style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border-color)',
      borderRadius: '16px',
      padding: '22px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: '18px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s ease',
      cursor: 'default',
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

// ─── NavItem ──────────────────────────────────────────────────────────────────
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

// ─── CustomDropdown ─────────────────────────────────────────────────────────
const CustomDropdown = ({ options, value, onChange, title, alignRight = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }} title={title}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          cursor: 'pointer', color: '#ffffff', fontSize: '0.88rem', fontWeight: 600, letterSpacing: '0.01em',
          padding: '4px 6px', borderRadius: '6px',
          background: isOpen ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
          transition: 'all 0.2s ease',
          userSelect: 'none',
          whiteSpace: 'nowrap'
        }}
      >
        <span>{value}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      
      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', 
          left: alignRight ? 'auto' : 0,
          right: alignRight ? 0 : 'auto',
          background: 'rgba(15, 20, 35, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          padding: '6px',
          minWidth: '200px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          zIndex: 9999,
          animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex', flexDirection: 'column', gap: '2px'
        }} className="custom-dropdown-menu">
          {options.map(opt => (
            <div 
              key={opt}
              onClick={() => { onChange(opt); setIsOpen(false); }}
              onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = opt === value ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.8)';
              }}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.86rem',
                color: opt === value ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.8)',
                fontWeight: opt === value ? 600 : 500,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {opt}
              {opt === value && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Bottom Navigation (Mobile Only) ──────────────────────────────────────
const BottomNav = ({ activeTab, handleTabClick, isAdmin, setIsMobileMenuOpen }) => (
  <div className="bottom-nav" style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
    {isAdmin && (
      <button className={`bottom-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleTabClick('dashboard')}>
        <Icon d={NAV_ICONS.dashboard} size={22} />
        <span>Home</span>
      </button>
    )}
    <button className={`bottom-nav-btn ${activeTab === 'room-utilization' ? 'active' : ''}`} onClick={() => handleTabClick('room-utilization')}>
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

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = ({ user, onLogout }) => {
  const LOGO_SRC = '/logo.png?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  // --- ROLE IDENTIFICATION ---
  const userRole = (user?.role || '').toLowerCase().trim();
  const isAdmin = userRole === 'admin' || userRole === 'department head';
  const isStudent = !isAdmin;

  const navigate = useNavigate();
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const activeTab = pathParts[2] || (isStudent ? 'room-utilization' : 'dashboard');

  const setActiveTab = (tab) => {
    if (tab === 'dashboard') {
      navigate('/dashboard');
    } else {
      navigate(`/dashboard/${tab}`);
    }
  };

  const [isManageDataOpen, setIsManageDataOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  const [isFabHidden, setIsFabHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleTabClick = (tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); };

  const handleAutoScheduleAction = (mode) => {
    // --- Modernized Swal Styling Configuration ---
    if (!document.getElementById('modern-swal-styles')) {
      const style = document.createElement('style');
      style.id = 'modern-swal-styles';
      style.innerHTML = `
        .modern-glass-popup {
          border-radius: 24px !important;
          border: 1px solid var(--border-color) !important;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.2) inset !important;
          padding: 32px 24px 24px !important;
          background: var(--card-bg) !important;
          color: var(--text-main) !important;
          backdrop-filter: blur(20px) !important;
          font-family: inherit !important;
        }
        .modern-swal-confirm-btn {
          background: linear-gradient(135deg, var(--accent-primary, #6366f1), #8b5cf6) !important;
          color: white !important;
          border: none !important;
          border-radius: 14px !important;
          padding: 14px 28px !important;
          font-weight: 700 !important;
          font-size: 0.95rem !important;
          cursor: pointer !important;
          box-shadow: 0 6px 16px rgba(99, 102, 241, 0.25) !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          margin: 0 8px !important;
          letter-spacing: 0.02em !important;
        }
        .modern-swal-confirm-btn:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35) !important;
        }
        .modern-swal-cancel-btn {
          background: transparent !important;
          color: var(--text-muted) !important;
          border: 2px solid var(--border-color) !important;
          border-radius: 14px !important;
          padding: 12px 28px !important;
          font-weight: 700 !important;
          font-size: 0.95rem !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          margin: 0 8px !important;
        }
        .modern-swal-cancel-btn:hover {
          background: rgba(0, 0, 0, 0.03) !important;
          color: var(--text-main) !important;
          border-color: rgba(0,0,0,0.15) !important;
        }
        .modern-swal-input {
          border-radius: 12px !important;
          border: 2px solid var(--border-color) !important;
          padding: 14px 18px !important;
          font-size: 0.95rem !important;
          background: var(--bg-main) !important;
          color: var(--text-main) !important;
          margin-top: 24px !important;
          width: 100% !important;
          box-sizing: border-box !important;
          font-weight: 500 !important;
          box-shadow: inset 0 2px 6px rgba(0,0,0,0.02) !important;
          transition: all 0.2s ease !important;
          appearance: none !important;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") !important;
          background-repeat: no-repeat !important;
          background-position: right 16px center !important;
        }
        .modern-swal-input:focus {
          border-color: var(--accent-primary, #6366f1) !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15) !important;
          outline: none !important;
        }
      `;
      document.head.appendChild(style);
    }

    const swalConfig = {
      background: 'transparent',
      backdrop: 'rgba(15, 20, 35, 0.5)',
      customClass: {
        popup: 'modern-glass-popup',
        confirmButton: 'modern-swal-confirm-btn',
        cancelButton: 'modern-swal-cancel-btn',
        input: 'modern-swal-input'
      },
      buttonsStyling: false,
      showClass: { popup: 'animate__animated animate__zoomIn animate__faster' },
      hideClass: { popup: 'animate__animated animate__zoomOut animate__faster' }
    };

    if (mode === 'ga') {
      setIsFabHidden(true);
      Swal.fire({
        ...swalConfig,
        html: `
          <div style="text-align: center;">
            <div style="width: 72px; height: 72px; background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12)); border-radius: 22px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; border: 1px solid rgba(99,102,241,0.25); box-shadow: 0 8px 20px rgba(99,102,241,0.15);">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </div>
            <h2 style="margin: 0 0 12px; font-size: 1.5rem; font-weight: 800; color: var(--text-main); letter-spacing: -0.03em;">Generate Full Timetable?</h2>
            <p style="margin: 0; font-size: 0.95rem; color: var(--text-muted); line-height: 1.6;">This will use the powerful Genetic Algorithm engine to automatically generate conflict-free schedules for all sections.</p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Generate Now',
        cancelButtonText: 'Cancel'
      }).then((result) => {
        setIsFabHidden(false);
        if (result.isConfirmed) {
          setActiveTab('schedule');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('execute-autoscheduler', { detail: 'ga' }));
          }, 100);
        }
      });
    } else {
      let options = {};
      let title = '';
      let color = '';
      let icon = '';
      if (mode === 'faculty') {
        title = 'Faculty';
        color = '#10b981';
        icon = '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>';
        professors.forEach(p => { options[p.id] = p.name; });
      } else if (mode === 'room') {
        title = 'Room';
        color = '#f59e0b';
        icon = '<path d="M3 9l9-7 9 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>';
        rooms.forEach(r => { options[r.id] = r.name; });
      } else if (mode === 'section') {
        title = 'Section';
        color = '#8b5cf6';
        icon = '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>';
        sections.forEach(s => { options[s.id] = s.name; });
      }

      setIsFabHidden(true);
      Swal.fire({
        ...swalConfig,
        html: `
          <div style="text-align: center; margin-bottom: 8px;">
            <div style="width: 72px; height: 72px; background: linear-gradient(135deg, ${color}1A, ${color}0D); border-radius: 22px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; border: 1px solid ${color}33; box-shadow: 0 8px 20px ${color}20;">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
            </div>
            <h2 style="margin: 0 0 12px; font-size: 1.5rem; font-weight: 800; color: var(--text-main); letter-spacing: -0.03em;">Generate by ${title}</h2>
            <p style="margin: 0; font-size: 0.95rem; color: var(--text-muted); line-height: 1.6;">Please select a specific ${title.toLowerCase()} to generate an optimized schedule for.</p>
          </div>
        `,
        input: 'select',
        inputOptions: options,
        inputPlaceholder: `Choose a ${title.toLowerCase()}...`,
        showCancelButton: true,
        confirmButtonText: 'Generate Now',
        cancelButtonText: 'Cancel',
        inputValidator: (value) => {
          return new Promise((resolve) => {
            if (value) resolve();
            else resolve(`You need to select a ${title.toLowerCase()}`);
          });
        }
      }).then((result) => {
        setIsFabHidden(false);
        if (result.isConfirmed) {
          setActiveTab('schedule');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('execute-autoscheduler', { detail: { mode: mode, targetId: result.value } }));
          }, 100);
        }
      });
    }
  };

  // --- Mobile Swipe Gesture for Sidebar ---
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    
    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    
    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      
      // OPTIMIZATION: Only trigger if the swipe is predominantly horizontal.
      // This prevents accidental sidebar triggers when the user is scrolling vertically.
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        
        // If sidebar is closed: swipe right from the left edge (or close to it) to open
        if (!isMobileMenuOpen && touchStartX < 60 && diffX > 40) {
          setIsMobileMenuOpen(true);
        }
        // If sidebar is open: swipe left anywhere to close
        else if (isMobileMenuOpen && diffX < -40) {
          setIsMobileMenuOpen(false);
        }
        // If sidebar is closed: swipe left from the right edge to open
        else if (!isMobileMenuOpen && touchStartX > window.innerWidth - 60 && diffX < -40) {
          setIsMobileMenuOpen(true);
        }
      }
    };
    
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobileMenuOpen]);

  const [rooms, setRooms] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [scheduleHistory, setScheduleHistory] = useState([]);

  const [activeSemester, setActiveSemester] = useState(SEMESTERS[1]);
  const [activeSchoolYear, setActiveSchoolYear] = useState(SCHOOL_YEARS[1]);

  const [availableSemesters, setAvailableSemesters] = useState(SEMESTERS);
  const [availableSchoolYears, setAvailableSchoolYears] = useState(SCHOOL_YEARS);
  const [publishedTerms, setPublishedTerms] = useState({});

  const activeSchedules = schedules.filter(s => 
    s.semester === activeSemester && 
    s.schoolYear === activeSchoolYear
  );

  const validateScheduleEntry = ({ room, professor, subject, section, day, timeSlot, excludeScheduleId = null }) => {
    const errors = []; const warnings = [];
    if (!room?.id) errors.push('Room is required.');
    if (!professor?.id) errors.push('Faculty is required.');
    if (!subject?.id) errors.push('Subject is required.');
    if (!day) errors.push('Day is required.');
    if (!timeSlot?.id) errors.push('Time slot is required.');
    if (professor && subject && !professorMatchesSubject(professor, subject))
      errors.push(`Faculty "${professor.name}" is not authorized to teach "${subject.code}".`);
    if (section && subject) {
      const sectionSubjects = section.subjects || [];
      if (!sectionSubjects.includes(subject.id) && !sectionSubjects.includes(subject.code))
        errors.push(`Section "${section.name}" is not enrolled in subject "${subject.code}".`);
    }

    const roomName = (room?.name || '').toUpperCase().replace(/\s+/g, '');
    const isBscsExclusive = roomName === 'NB04' || roomName === 'NB05' || roomName === 'NB06' || roomName === 'ROOM203' || roomName === '203';
    
    let sectionDept = null;
    if (section) {
      const program = (section.program || '').toUpperCase();
      for (const d of ['BSCS', 'BAEL', 'BSOA', 'BSFT']) { if (program.includes(d)) { sectionDept = d; break; } }
      if (!sectionDept) {
        const name = (section.name || '').toUpperCase();
        for (const d of ['BSCS', 'BAEL', 'BSOA', 'BSFT']) { if (name.startsWith(d)) { sectionDept = d; break; } }
      }
    }

    const isSpeechLab = roomName.includes('SPEECH');
    if (isSpeechLab) {
      if (section && sectionDept !== 'BAEL') {
        errors.push(`Room "${room?.name}" is reserved exclusively for BAEL sections.`);
      }
      const profDept = professor?.department ? professor.department.toUpperCase() : null;
      if (profDept !== 'BAEL') {
        errors.push(`Room "${room?.name}" can only be used by BAEL faculty.`);
      }
      if (subject) {
        const code = (subject.code || '').toUpperCase();
        if (code.startsWith('GE') || code.startsWith('PE') || code.startsWith('NSTP')) {
          errors.push(`Room "${room?.name}" can only be used for BAEL major subjects (no GE, PE, or NSTP).`);
        }
      }
    }

    if (isBscsExclusive) {
      if (section && sectionDept !== 'BSCS') {
        errors.push(`Room "${room?.name}" is reserved for BSCS students and faculty only.`);
      }
      if (professor && professor.department && professor.department.toUpperCase() !== 'BSCS') {
        errors.push(`Room "${room?.name}" cannot be used by non-BSCS faculty (${professor.name}).`);
      }
    }

    const isRoom204 = roomName === 'ROOM204' || roomName === '204';
    if (isRoom204) {
      const isBSCS = (!sectionDept || sectionDept === 'BSCS') && (!professor || !professor.department || professor.department.toUpperCase() === 'BSCS');
      const isBSOALab = sectionDept === 'BSOA' && subject?.requiredLab && (!professor || !professor.department || professor.department.toUpperCase() === 'BSOA');
      
      if (!isBSCS && !isBSOALab) {
        if (sectionDept === 'BSOA' && !subject?.requiredLab) {
          errors.push(`Room "${room?.name}" can only be used by BSOA for Laboratory subjects.`);
        } else {
          errors.push(`Room "${room?.name}" is reserved for BSCS (and BSOA Labs only).`);
        }
      }
    }

    if (errors.length > 0) return { valid: false, errors, warnings };

    const startIdx = getTimeSlotIndex(timeSlot);
    const needed = slotsNeededFromIndex(startIdx, subject?.hoursPerMeeting);
    if (startIdx < 0 || needed === 0) {
      errors.push(`Time slot does not fit the ${subject?.hoursPerMeeting || 1.5}hr meeting duration.`);
      return { valid: false, errors, warnings };
    }

    const conflicts = findScheduleConflicts(
      { room, professor, subject, section, day, timeSlot },
      activeSchedules,
      { excludeScheduleId }
    );
    if (conflicts.room) errors.push(`Room "${room?.name}" is already scheduled for ${day} (${timeSlot?.label}).`);
    if (conflicts.professor) errors.push(`Faculty "${professor?.name}" is already scheduled for ${day} (${timeSlot?.label}).`);
    if (section?.id && conflicts.section) errors.push(`Section "${section?.name}" already has a class for ${day} (${timeSlot?.label}).`);
    if (subject?.requiredLab && !room?.hasComputers) errors.push('Requires Lab.');
    return { valid: errors.length === 0, errors, warnings };
  };

  useEffect(() => {
    const initializeData = async () => {
      const versionDoc = await getDoc(doc(db, 'meta', 'seedVersion'));
      const storedVersion = versionDoc.exists() ? versionDoc.data().version : null;
      if (storedVersion !== SEED_VERSION) {
        const collectionsToWipe = ['rooms', 'professors', 'subjects', 'sections', 'schedules'];
        for (const colName of collectionsToWipe) {
          const snap = await getDocs(collection(db, colName));
          if (!snap.empty) { const batch = writeBatch(db); snap.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); }
        }
        const seedBatch = writeBatch(db);
        initialRooms.forEach(r => seedBatch.set(doc(db, 'rooms', r.id.toString()), r));
        initialProfessors.forEach(p => seedBatch.set(doc(db, 'professors', p.id.toString()), p));
        initialSubjects.forEach(s => seedBatch.set(doc(db, 'subjects', s.id.toString()), s));
        initialSections.forEach(sec => seedBatch.set(doc(db, 'sections', sec.id.toString()), sec));
        await seedBatch.commit();
        await setDoc(doc(db, 'meta', 'seedVersion'), { version: SEED_VERSION });
      }

      // One-time migration for old schedules missing the semester/year tags
      const schedSnap = await getDocs(collection(db, 'schedules'));
      const migrateBatch = writeBatch(db);
      let migrationCount = 0;
      schedSnap.docs.forEach(d => {
        const data = d.data();
        if (!data.semester || !data.schoolYear) {
          migrateBatch.update(d.ref, { semester: '2nd Semester', schoolYear: '2025-2026' });
          migrationCount++;
        }
      });
      if (migrationCount > 0) {
        await migrateBatch.commit();
        console.log(`Migrated ${migrationCount} legacy schedules to 2nd Semester 2025-2026.`);
      }

      // Ensure meta/settings exists with default terms
      const settingsDoc = await getDoc(doc(db, 'meta', 'settings'));
      if (!settingsDoc.exists()) {
        await setDoc(doc(db, 'meta', 'settings'), { semesters: SEMESTERS, schoolYears: SCHOOL_YEARS });
      }
    };
    initializeData();
    const unsubRooms = onSnapshot(collection(db, 'rooms'), snap => setRooms(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubProfs = onSnapshot(collection(db, 'professors'), snap => setProfessors(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSubj = onSnapshot(collection(db, 'subjects'), snap => setSubjects(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSec = onSnapshot(collection(db, 'sections'), snap => setSections(snap.docs.map(d => {
      const data = d.data();
      // Normalize program name for getSectionDepartment
      let prog = data.program || '';
      const pUp = prog.toUpperCase();
      if (pUp.includes('COMPUTER SCIENCE')) prog = 'BSCS';
      else if (pUp.includes('ENGLISH LANGUAGE')) prog = 'BAEL';
      else if (pUp.includes('OFFICE ADMINISTRATION')) prog = 'BSOA';
      else if (pUp.includes('FOOD TECHNOLOGY')) prog = 'BSFT';
      return { ...data, program: prog, id: d.id };
    })));
    const unsubSched = onSnapshot(collection(db, 'schedules'), snap => setSchedules(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubHist = onSnapshot(collection(db, 'scheduleHistory'), snap => setScheduleHistory(snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.timestamp - a.timestamp)));
    const unsubMeta = onSnapshot(doc(db, 'meta', 'settings'), snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.semesters) setAvailableSemesters(data.semesters);
        if (data.schoolYears) setAvailableSchoolYears(data.schoolYears);
        if (data.publishedTerms) setPublishedTerms(data.publishedTerms);
      }
    });
    return () => { unsubRooms(); unsubProfs(); unsubSubj(); unsubSec(); unsubSched(); unsubHist(); unsubMeta(); };
  }, []);

  const handleLogHistory = async (historyData) => {
    if (!isAdmin) return;
    try {
      await addDoc(collection(db, 'scheduleHistory'), {
        ...historyData,
        timestamp: new Date()
      });
    } catch (e) {
      console.error("Failed to log schedule history:", e);
    }
  };

  const validator = {
    validateAssignment: (room, professor, subject, section, day, timeSlot) =>
      validateScheduleEntry({ room, professor, subject, section, day, timeSlot }),
    addSchedule: (room, professor, subject, section, day, timeSlot) => ({ schedule: { room, professor, subject, section, day, timeSlot, semester: activeSemester, schoolYear: activeSchoolYear } }),
    clearAllSchedules: async () => {
      // Only clear schedules for the currently selected semester!
      const snap = await getDocs(collection(db, 'schedules'));
      if (snap.empty) return;
      const batch = writeBatch(db); 
      snap.docs.forEach(d => {
        const data = d.data();
        if ((data.semester === activeSemester || !data.semester) && (data.schoolYear === activeSchoolYear || !data.schoolYear)) {
          batch.delete(d.ref);
        }
      }); 
      await batch.commit(); 
    },
    autoScheduleForSection: async (sectionId, constraints = { respectLabs: true, preventDoubleBooking: true }) => {
      const section = sections.find(s => s.id === sectionId);
      if (!section) return { results: [], unscheduled: [], error: `Section "${sectionId}" not found.` };
      const subjectObjs = (section.subjects || []).map(subId => subjects.find(su => su.id === subId || su.code === subId))
        .filter(Boolean)
        .filter(su => !su.semester || su.semester === 'Both' || su.semester === activeSemester);
      const assignments = [];
      for (const subject of subjectObjs) {
        const credits = Number(subject.credits) || 3;
        const targetDuration = Number(subject.hoursPerMeeting) || 1.5;
        const meetings = Math.max(1, Math.ceil(credits / targetDuration));
        for (let i = 0; i < meetings; i++) assignments.push({ subject, section, meetingIndex: i + 1, targetDuration });
      }
      return validator._autoScheduleAssignments(assignments, { ...constraints });
    },
    autoScheduleForRoom: async (roomId, constraints = { respectLabs: true, preventDoubleBooking: true }) => {
      const room = rooms.find(r => r.id === roomId);
      if (!room) return { results: [], unscheduled: [], error: `Room "${roomId}" not found.` };
      const assignments = [];
      for (const section of sections) {
        for (const subId of (section.subjects || [])) {
          const subject = subjects.find(su => su.id === subId || su.code === subId);
          if (subject && (!subject.semester || subject.semester === 'Both' || subject.semester === activeSemester)) {
            const credits = Number(subject.credits) || 3;
            const targetDuration = Number(subject.hoursPerMeeting) || 1.5;
            const meetings = Math.max(1, Math.ceil(credits / targetDuration));
            for (let i = 0; i < meetings; i++) assignments.push({ subject, section, meetingIndex: i + 1, targetDuration });
          }
        }
      }
      return validator._autoScheduleAssignments(assignments, { ...constraints, fixedRoom: room });
    },
    autoScheduleForFaculty: async (professorId, constraints = { respectLabs: true, preventDoubleBooking: true }) => {
      const professor = professors.find(p => p.id === professorId);
      if (!professor) return { results: [], unscheduled: [], error: `Faculty "${professorId}" not found.` };

      const assignments = [];
      for (const section of sections) {
        for (const subId of (section.subjects || [])) {
          const subject = subjects.find(su => su.id === subId || su.code === subId);

          // FIX: Only add to assignments if the professor actually teaches this subject, and it matches the active semester
          if (subject && professorMatchesSubject(professor, subject) && (!subject.semester || subject.semester === 'Both' || subject.semester === activeSemester)) {
            const credits = Number(subject.credits) || 3;
            const targetDuration = Number(subject.hoursPerMeeting) || 1.5;
            const meetings = Math.max(1, Math.ceil(credits / targetDuration));
            for (let i = 0; i < meetings; i++) assignments.push({ subject, section, meetingIndex: i + 1, targetDuration });
          }
        }
      }
      return validator._autoScheduleAssignments(assignments, { ...constraints, fixedProfessor: professor });
    },
    _eligibleRoomsFor: (subject, section, constraints) => {
      let pool = rooms;
      
      const isPE = subject && (subject.code || '').toUpperCase().startsWith('PE');
      const isGymOrStage = (r) => {
        const name = (r.name || '').toLowerCase();
        return name.includes('gym') || name.includes('stage');
      };

      if (isPE) {
        const gyms = rooms.filter(isGymOrStage);
        if (gyms.length > 0) return { tier1: gyms, tier2: [], tier3: [], flat: gyms };
      }

      if (constraints?.respectLabs && subject?.requiredLab) { 
        const labs = rooms.filter(r => r.hasComputers); 
        if (labs.length > 0) pool = labs; 
      }

      // Tier rooms by department ownership
      const sectionDept = (() => {
        if (!section) return null;
        const program = (section.program || '').toUpperCase();
        for (const d of ['BSCS', 'BAEL', 'BSOA', 'BSFT']) { if (program.includes(d)) return d; }
        const name = (section.name || '').toUpperCase();
        for (const d of ['BSCS', 'BAEL', 'BSOA', 'BSFT']) { if (name.startsWith(d)) return d; }
        return null;
      })();

      const tier1 = []; // Dept-owned rooms
      const tier2 = []; // SHARED rooms
      const tier3 = []; // Other dept rooms (overflow)
      
      const profDept = constraints?.fixedProfessor?.department?.toUpperCase();

      for (const r of pool) {
        const roomName = (r.name || '').toUpperCase().replace(/\s+/g, '');
        const isBscsExclusive = roomName === 'NB04' || roomName === 'NB05' || roomName === 'NB06' || roomName === 'ROOM203' || roomName === '203';

        const isSpeechLab = roomName.includes('SPEECH');
        if (isSpeechLab) {
          if (sectionDept && sectionDept !== 'BAEL') continue;
          if (profDept !== 'BAEL') continue;
          if (subject) {
            const code = (subject.code || '').toUpperCase();
            if (code.startsWith('GE') || code.startsWith('PE') || code.startsWith('NSTP')) continue;
          }
        }

        if (isBscsExclusive) {
          if (sectionDept && sectionDept !== 'BSCS') continue;
          if (profDept && profDept !== 'BSCS') continue;
        }

        const isRoom204 = roomName === 'ROOM204' || roomName === '204';
        if (isRoom204) {
          const isBSCS = (!sectionDept || sectionDept === 'BSCS') && (!profDept || profDept === 'BSCS');
          const isBSOALab = sectionDept === 'BSOA' && subject?.requiredLab && (!profDept || profDept === 'BSOA');
          if (!isBSCS && !isBSOALab) continue;
        }

        const roomDept = (r.department || 'SHARED').toUpperCase();
        const roomBldg = (r.building || 'Unassigned').toUpperCase();
        if (roomDept === 'SHARED' || roomBldg === 'UNASSIGNED' || roomBldg === 'GENERAL BUILDING' || roomBldg === 'GYMNASIUM') {
          tier2.push(r);
        } else if (sectionDept && roomDept === sectionDept) {
          tier1.push(r);
        } else {
          tier3.push(r);
        }
      }
      return { tier1, tier2, tier3, flat: [...tier1, ...tier2, ...tier3] };
    },
    _eligibleProfsFor: (subject, section, constraints) => {
      if (!subject) return [];
      const basePool = getEligibleProfessors(professors, subject, section);
      if (constraints?.aiProfessorMap?.[subject.id]) {
        return applyAIRanking(basePool, constraints.aiProfessorMap[subject.id]);
      }
      return basePool;
    },
    _autoScheduleAssignments: async (assignments, constraints) => {
      const results = [];
      const unscheduled = [];
      const fixedRoom = constraints?.fixedRoom || null;
      const fixedProfessor = constraints?.fixedProfessor || null;
      const temp = [...activeSchedules];

      // 1. GROUP ASSIGNMENTS: Group by Section + Subject
      const groupsMap = new Map();
      for (const a of assignments) {
        const key = `${a.section?.id || 'none'}_${a.subject?.id}`;
        if (!groupsMap.has(key)) {
          groupsMap.set(key, { subject: a.subject, section: a.section, count: 0 });
        }
        groupsMap.get(key).count++;
      }

      // REDUCE counts by what is already scheduled to prevent duplicates
      for (const s of temp) {
        const key = `${s.section?.id || 'none'}_${s.subject?.id}`;
        if (groupsMap.has(key)) {
          groupsMap.get(key).count--;
        }
      }

      // Sort remaining groups: PE subjects first, then Lab subjects
      const allGroups = Array.from(groupsMap.values())
        .filter(g => g.count > 0)
        .sort((a, b) => {
          const aPE = (a.subject?.code || '').toUpperCase().startsWith('PE') ? 1 : 0;
          const bPE = (b.subject?.code || '').toUpperCase().startsWith('PE') ? 1 : 0;
          if (aPE !== bPE) return bPE - aPE; // PE first

          const aLab = a.subject?.requiredLab ? 1 : 0;
          const bLab = b.subject?.requiredLab ? 1 : 0;
          return bLab - aLab; // Lab second
        });

      const PREFERRED_PAIRS = [['Monday', 'Thursday'], ['Tuesday', 'Friday']];
      const placedKeys = new Set(); // Track which groups have been placed

      // Helper: attempt to place a single group with a given room pool and day strategy
      const tryPlaceGroup = async (group, roomPool, usePairsOnly) => {
        const { subject, section, count } = group;
        const profPool = fixedProfessor ? [fixedProfessor] : validator._eligibleProfsFor(subject, section, constraints);
        const hasStage = rooms.some(r => (r.name || '').toLowerCase().includes('stage'));

        for (const professor of profPool) {
          const isJanice = professor.id === 'P04' || (professor.name || '').toLowerCase().includes('ballera');
          const profSchedules = temp.filter(s => String(s.professor?.id) === String(professor.id));
          const uniqueLoad = new Map();
          for (const s of profSchedules) {
            const k = `${s.subject?.id || 'x'}__${s.section?.id || 'x'}`;
            if (!uniqueLoad.has(k)) uniqueLoad.set(k, creditPerMeeting(s.subject));
          }
          const profCurrentLoad = Array.from(uniqueLoad.values()).reduce((s, c) => s + c, 0);
          const perMeeting = creditPerMeeting(subject);

          if (profCurrentLoad + perMeeting > (Number(professor.maxUnits) || Number(professor.maxHours) || 12) + 0.01) {
            continue;
          }

          const prefRoomIds = professor.preferredRooms || [];
          let sortedRoomPool = roomPool;
          if (prefRoomIds.length > 0) {
            const validPrefRooms = roomPool.filter(r => prefRoomIds.includes(r.id));
            const nonPrefRooms = roomPool.filter(r => !prefRoomIds.includes(r.id));
            sortedRoomPool = [...validPrefRooms, ...nonPrefRooms];
          }

          for (const room of sortedRoomPool) {
            if (hasStage) {
              const isStage = (room.name || '').toLowerCase().includes('stage');
              if (isJanice && !isStage) continue;
              if (!isJanice && isStage) continue;
            }

            for (const timeSlot of TIME_SLOTS) {
              const startIdx = getTimeSlotIndex(timeSlot);
              if (startIdx < 0 || slotsNeededFromIndex(startIdx, subject?.hoursPerMeeting) === 0) continue;

              const isFree = (d) => {
                const candidate = { room, professor, subject, section, day: d, timeSlot };
                // ALWAYS check temp for overlaps — temp contains classes placed
                // during this auto-schedule batch that Firestore hasn't synced yet
                if (temp.some(s => schedulesOverlap(candidate, s))) return false;
                const chk = validateScheduleEntry({ room, professor, subject, section, day: d, timeSlot });
                return chk.valid;
              };

              // Try preferred pairs (Mon/Thu, Tue/Fri) — ALWAYS enforced for 2-meeting classes
              if (count === 2) {
                for (const pair of PREFERRED_PAIRS) {
                  if (isFree(pair[0]) && isFree(pair[1])) {
                    const s1 = { room, professor, subject, section, day: pair[0], timeSlot };
                    const s2 = { room, professor, subject, section, day: pair[1], timeSlot };
                    const w1 = await handleAddSchedule(s1);
                    const w2 = await handleAddSchedule(s2);

                    if (w1?.ok !== false && w2?.ok !== false) {
                      temp.push(s1, s2);
                      results.push(s1, s2);
                      return true;
                    }
                  }
                }
                // For 2-meeting classes, NEVER fall back to random days — 
                // only Mon/Thu or Tue/Fri pairs are allowed
              }

              // Any-day fallback — ONLY for classes that need 1 or 3+ meetings per week
              if (!usePairsOnly && count !== 2) {
                const validDays = [];
                for (const day of DAYS) {
                  if (isFree(day)) validDays.push(day);
                  if (validDays.length === count) break;
                }

                if (validDays.length === count) {
                  let allOk = true;
                  const writes = [];
                  for (const d of validDays) {
                    const sc = { room, professor, subject, section, day: d, timeSlot };
                    const w = await handleAddSchedule(sc);
                    if (w?.ok === false) { allOk = false; break; }
                    writes.push(sc);
                  }
                  if (allOk) {
                    temp.push(...writes);
                    results.push(...writes);
                    return true;
                  }
                }
              }
            }
          }
        }
        return false;
      };

      // ══════════════════════════════════════════════════════════
      //  3-PASS SCHEDULING ALGORITHM
      // ══════════════════════════════════════════════════════════

      // PASS 1 — STRICT: Department rooms only, preferred day pairs enforced
      console.log(`[AutoScheduler] Pass 1 (Strict): ${allGroups.length} groups to schedule`);
      for (const group of allGroups) {
        const groupKey = `${group.section?.id || 'none'}_${group.subject?.id}`;
        const tiers = fixedRoom ? { tier1: [fixedRoom], tier2: [], tier3: [] } : validator._eligibleRoomsFor(group.subject, group.section, constraints);
        if (tiers.tier1.length > 0) {
          const placed = await tryPlaceGroup(group, tiers.tier1, group.count === 2);
          if (placed) placedKeys.add(groupKey);
        }
      }

      // PASS 2 — SHARED: Department + Shared rooms, any day combos allowed
      const remainingAfterPass1 = allGroups.filter(g => !placedKeys.has(`${g.section?.id || 'none'}_${g.subject?.id}`));
      console.log(`[AutoScheduler] Pass 2 (Shared): ${remainingAfterPass1.length} groups remaining`);
      for (const group of remainingAfterPass1) {
        const groupKey = `${group.section?.id || 'none'}_${group.subject?.id}`;
        const tiers = fixedRoom ? { tier1: [fixedRoom], tier2: [], tier3: [] } : validator._eligibleRoomsFor(group.subject, group.section, constraints);
        const pool = [...tiers.tier1, ...tiers.tier2];
        if (pool.length > 0) {
          const placed = await tryPlaceGroup(group, pool, false);
          if (placed) placedKeys.add(groupKey);
        }
      }

      // PASS 3 — FALLBACK: ALL rooms (including other departments), any day combos
      const remainingAfterPass2 = allGroups.filter(g => !placedKeys.has(`${g.section?.id || 'none'}_${g.subject?.id}`));
      console.log(`[AutoScheduler] Pass 3 (Fallback): ${remainingAfterPass2.length} groups remaining`);
      for (const group of remainingAfterPass2) {
        const groupKey = `${group.section?.id || 'none'}_${group.subject?.id}`;
        const tiers = fixedRoom ? { tier1: [fixedRoom], tier2: [], tier3: [] } : validator._eligibleRoomsFor(group.subject, group.section, constraints);
        const pool = [...tiers.tier1, ...tiers.tier2, ...tiers.tier3];
        const placed = await tryPlaceGroup(group, pool, false);
        if (placed) {
          placedKeys.add(groupKey);
        } else {
          let reason = 'Insufficient slots available or missing qualified faculty.';
          if (constraints?.respectLabs && group.subject?.requiredLab && fixedRoom && !fixedRoom.hasComputers) {
            reason = 'Requires computer lab.';
          }
          unscheduled.push({ subject: group.subject, section: group.section, reason });
        }
      }

      console.log(`[AutoScheduler] Done: ${results.length} placed, ${unscheduled.length} unscheduled`);
      return { results, unscheduled, error: null };
    },
    autoSchedule: async (subjList, constraints) => {
      const results = []; const unscheduled = []; const tempSchedules = [...activeSchedules];
      for (const subject of subjList) {
        let scheduled = false;
        const profPool = professors.filter(p => professorMatchesSubject(p, subject));
        searchLoop: for (const prof of profPool) {
          for (const day of DAYS) {
            for (const timeSlot of TIME_SLOTS) {
              for (const room of rooms) {
                if (constraints.respectLabs && subject.requiredLab && !room.hasComputers) continue;
                // ALWAYS check tempSchedules for overlaps to prevent time conflicts
                const isRoomBusy = tempSchedules.some(s => String(s.room?.id) === String(room.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
                const isProfBusy = tempSchedules.some(s => String(s.professor?.id) === String(prof.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
                if (!isRoomBusy && !isProfBusy) {
                  const newSchedule = { room, professor: prof, subject, day, timeSlot };
                  tempSchedules.push(newSchedule);
                  const writeResult = await handleAddSchedule(newSchedule);
                  if (writeResult?.ok === false) continue;
                  results.push(newSchedule); scheduled = true; break searchLoop;
                }
              }
            }
          }
        }
        if (!scheduled) unscheduled.push(subject);
      }
      return { results, unscheduled, error: null };
    }
  };

  const handleUpdateSchedule = async (scheduleId, newDay, newTimeSlotId) => {
    if (!isAdmin) return { ok: false, errors: ['Not authorized.'] };
    const newTimeSlot = TIME_SLOTS.find(ts => ts.id === newTimeSlotId);
    const existing = schedules.find(s => s.id === scheduleId);
    if (!existing) return { ok: false, errors: ['Schedule not found.'] };
    const check = validateScheduleEntry({ room: existing.room, professor: existing.professor, subject: existing.subject, section: existing.section || null, day: newDay, timeSlot: newTimeSlot, excludeScheduleId: scheduleId });
    if (!check.valid) { return { ok: false, errors: check.errors }; }
    await updateDoc(doc(db, 'schedules', scheduleId.toString()), { day: newDay, timeSlot: newTimeSlot });
    return { ok: true };
  };

  const handleAddSchedule = async (newSchedule) => {
    if (!isAdmin) return { ok: false, errors: ['Not authorized.'] };
    const check = validateScheduleEntry({ room: newSchedule?.room, professor: newSchedule?.professor, subject: newSchedule?.subject, section: newSchedule?.section || null, day: newSchedule?.day, timeSlot: newSchedule?.timeSlot, excludeScheduleId: null });
    if (!check.valid) return { ok: false, errors: check.errors };
    await addDoc(collection(db, 'schedules'), { ...newSchedule, semester: activeSemester, schoolYear: activeSchoolYear });
    return { ok: true };
  };

  const handleRemoveSchedule = async (id) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, 'schedules', id.toString()));
  };

  const firstName = user?.name?.split?.(/\s+/)?.[0] ?? 'there';

  const displaySchedules = (!isAdmin && publishedTerms[`${activeSemester}_${activeSchoolYear}`] !== true) ? [] : activeSchedules;

  const enrichedSchedules = displaySchedules.map(s => ({
    ...s,
    professor: professors.find(p => String(p.id) === String(s.professor?.id)) || s.professor,
    room: rooms.find(r => String(r.id) === String(s.room?.id)) || s.room,
    section: sections.find(sec => String(sec.id) === String(s.section?.id)) || s.section,
    subject: subjects.find(sub => String(sub.id) === String(s.subject?.id)) || s.subject
  }));

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`smartsched-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>

      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}>

        {/* Logo block */}
        <div style={{ padding: '28px 20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', textAlign: 'center' }}>
          <img
            src={LOGO_SRC}
            alt="CAPSU Logo"
            className="dashboard-logo"
            onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_LOGO; }}
          />
          {!isSidebarCollapsed && (
            <>
              <div style={{ 
                fontWeight: 900, 
                fontSize: '1.25rem', 
                letterSpacing: '0.12em', 
                color: '#ffffff',
                textShadow: '0 2px 12px rgba(255,255,255,0.3)'
              }}>
                SMARTSCHED
              </div>
              <span style={{
                display: 'inline-block', marginTop: 10,
                fontSize: '0.75rem', padding: '6px 18px', borderRadius: '20px',
                background: isAdmin ? '#2f2c68' : 'rgba(2,185,116,0.2)',
                color: '#fff', fontWeight: 600, letterSpacing: '0.04em',
                border: isAdmin ? 'none' : '1px solid rgba(2,185,116,0.2)',
              }}>
                {user?.role}
              </span>
            </>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          <ul style={{ margin: 0, padding: 0 }}>
            {/* HIDE DASHBOARD TAB FOR STUDENTS */}
            {!isStudent && (
              <NavItem label="Dashboard" iconPath={NAV_ICONS.dashboard} active={activeTab === 'dashboard'} onClick={() => handleTabClick('dashboard')} />
            )}

            {isAdmin && (
              <>
                {/* Manage Data accordion */}
                <NavItem label={`Manage Data ${isManageDataOpen ? '▾' : '▸'}`} iconPath={NAV_ICONS.manage} onClick={() => setIsManageDataOpen(o => !o)} />
                {isManageDataOpen && (
                  <>
                    <NavItem label="Faculty Profiles" iconPath={NAV_ICONS.faculty} active={activeTab === 'faculty'} onClick={() => handleTabClick('faculty')} indent />
                    <NavItem label="Room List" iconPath={NAV_ICONS.rooms} active={activeTab === 'rooms'} onClick={() => handleTabClick('rooms')} indent />
                    <NavItem label="Subject Constraints" iconPath={NAV_ICONS.subjects} active={activeTab === 'subjects'} onClick={() => handleTabClick('subjects')} indent />
                    <NavItem label="Sections" iconPath={NAV_ICONS.sections} active={activeTab === 'sections'} onClick={() => handleTabClick('sections')} indent />
                    <NavItem label="Semesters & Years" iconPath={NAV_ICONS.calendar} active={activeTab === 'terms'} onClick={() => handleTabClick('terms')} indent />
                    <NavItem label="User Management" iconPath={NAV_ICONS.users} active={activeTab === 'users'} onClick={() => handleTabClick('users')} indent />
                  </>
                )}
                <NavItem label="Create Schedule" iconPath={NAV_ICONS.schedule} active={activeTab === 'schedule'} onClick={() => handleTabClick('schedule')} />
                <NavItem label="Scheduling History" iconPath={NAV_ICONS.history} active={activeTab === 'history'} onClick={() => handleTabClick('history')} />
                <NavItem label="Faculty Workload" iconPath={NAV_ICONS.workload} active={activeTab === 'workload'} onClick={() => handleTabClick('workload')} />
              </>
            )}

            <NavItem label="View Schedules" iconPath={NAV_ICONS.viewSchedules} active={activeTab === 'room-utilization'} onClick={() => handleTabClick('room-utilization')} />
          </ul>

          {/* Divider + Logout */}
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', margin: '10px 0' }} />
          <ul style={{ margin: 0, padding: 0 }}>
            <NavItem label="Profile" iconPath={NAV_ICONS.users} active={activeTab === 'profile'} onClick={() => handleTabClick('profile')} />
            <NavItem label="Log Out" iconPath={NAV_ICONS.logout} danger onClick={onLogout} />
          </ul>
        </nav>


      </aside>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <div className="main-content">

        {/* ── Top Bar ── */}
        <header style={{
          position: 'relative',
          zIndex: 100,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '16px',
          padding: '4px 0 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '28px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              className="sidebar-toggle-btn"
              onClick={() => setIsSidebarCollapsed(c => !c)}
              title={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
              style={{ flexShrink: 0 }}
            >
              <Icon d={NAV_ICONS.menu} size={20} />
            </button>
            <div>
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.5)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Capiz State University · Mambusao Satellite College
              </p>
              <h1 style={{ margin: '4px 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
                Welcome, {firstName} <span style={{ fontSize: '1.3rem' }}>👋</span>
              </h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              display: 'flex', gap: '8px', alignItems: 'center', 
              background: 'rgba(255, 255, 255, 0.08)', 
              backdropFilter: 'blur(12px)',
              padding: '8px 16px', 
              borderRadius: '10px', 
              border: '1px solid rgba(255, 255, 255, 0.12)',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            >
              <CustomDropdown 
                options={availableSemesters} 
                value={activeSemester} 
                onChange={setActiveSemester} 
                title="Select Semester"
                alignRight={false}
              />
              
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.9rem', margin: '0 2px' }}>|</span>
              
              <CustomDropdown 
                options={availableSchoolYears} 
                value={activeSchoolYear} 
                onChange={setActiveSchoolYear} 
                title="Select School Year"
                alignRight={true}
              />
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              padding: '8px 14px',
              textAlign: 'right',
              display: 'none',
            }}>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today</div>
              <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600, marginTop: 2 }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(o => !o)}>
              <Icon d={NAV_ICONS.menu} size={22} />
            </button>
          </div>
        </header>

        {/* ── Dashboard Tab ── */}
        {!isStudent && activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s' }}>

          {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <KpiTile label="Faculty Members" value={professors.length} iconPath={NAV_ICONS.faculty} color="#0288d1" />
              <KpiTile label="Rooms" value={rooms.length} iconPath={NAV_ICONS.rooms} color="#7c3aed" />
              <KpiTile label="Sections" value={sections.length} iconPath={NAV_ICONS.sections} color="#059669" />
              <KpiTile label="Scheduled Classes" value={enrichedSchedules.length} iconPath={NAV_ICONS.schedule} color="#d97706" />
            </div>

            {/* Admin preview cards */}
            {isAdmin && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '18px' }}>
                {/* Faculty preview */}
                <div className="card" style={{ padding: '22px' }}>
                  <div className="card-header" style={{ marginBottom: '14px' }}>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '8px',
                        background: 'linear-gradient(135deg, #0288d1, #4fc3f7)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', boxShadow: '0 2px 8px rgba(2,136,209,0.25)'
                      }}>
                        <Icon d={NAV_ICONS.faculty} size={14} />
                      </span>
                      Faculty Profiles
                    </h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab('faculty')} style={{ background: 'transparent', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', boxShadow: 'none', borderRadius: '8px' }}>View All</button>
                  </div>
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Department</th><th>Max Units</th></tr></thead>
                    <tbody>
                      {professors.slice(0, 3).map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td><span style={{ fontSize: '0.78rem', padding: '2px 8px', borderRadius: 6, background: '#EEF2FF', color: '#5645EE', fontWeight: 600 }}>{p.department}</span></td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.maxUnits || p.maxHours || 12}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {professors.length > 3 && (
                    <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right', fontWeight: 500 }}>
                      +{professors.length - 3} more faculty
                    </p>
                  )}
                </div>

                {/* Rooms preview */}
                <div className="card" style={{ padding: '22px' }}>
                  <div className="card-header" style={{ marginBottom: '14px' }}>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '8px',
                        background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', boxShadow: '0 2px 8px rgba(124,58,237,0.25)'
                      }}>
                        <Icon d={NAV_ICONS.rooms} size={14} />
                      </span>
                      Room List
                    </h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab('rooms')} style={{ background: 'transparent', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', boxShadow: 'none', borderRadius: '8px' }}>View All</button>
                  </div>
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Lab?</th></tr></thead>
                    <tbody>
                      {rooms.slice(0, 3).map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{r.name}</td>
                          <td><span style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>{r.type}</span></td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: '0.73rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700,
                              background: r.hasComputers ? 'linear-gradient(135deg, #E6F8F0, #D1FAE5)' : '#F1F5F9',
                              color: r.hasComputers ? '#059669' : '#94a3b8',
                            }}>
                              {r.hasComputers ? '✓ Yes' : 'No'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rooms.length > 3 && (
                    <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right', fontWeight: 500 }}>
                      +{rooms.length - 3} more rooms
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* --- NEW: Appropriate Dashboard Widgets (Quick Actions & Recent Activity) --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>

              {/* System Reminders Panel */}
              {isAdmin && (
                <div className="card" style={{ padding: '22px' }}>
                  <h3 className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '8px',
                      background: 'linear-gradient(135deg, #5645EE, #8B5CF6)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', boxShadow: '0 2px 8px rgba(86,69,238,0.25)'
                    }}>
                      <Icon d={NAV_ICONS.manage} size={14} />
                    </span>
                    System Reminders
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    <div style={{
                      padding: '14px 16px', borderRadius: '12px',
                      background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)',
                      border: '1px solid rgba(86,69,238,0.1)',
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                      transition: 'transform 0.2s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                      <span style={{
                        width: 32, height: 32, borderRadius: '8px', flexShrink: 0,
                        background: 'rgba(86,69,238,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#5645EE',
                      }}>
                        <Icon d={NAV_ICONS.subjects} size={16} />
                      </span>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.88rem', color: '#312e81' }}>Pre-Scheduling Checklist</strong>
                        <span style={{ fontSize: '0.8rem', color: '#6366f1', lineHeight: 1.5 }}>Ensure all faculty specializations and lab requirements are accurate before running the algorithm.</span>
                      </div>
                    </div>

                    <div style={{
                      padding: '14px 16px', borderRadius: '12px',
                      background: 'linear-gradient(135deg, #FEF6E9, #FFF7ED)',
                      border: '1px solid rgba(245,166,35,0.15)',
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                      transition: 'transform 0.2s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                      <span style={{
                        width: 32, height: 32, borderRadius: '8px', flexShrink: 0,
                        background: 'rgba(245,166,35,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#d97706',
                      }}>
                        <Icon d={NAV_ICONS.workload} size={16} />
                      </span>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.88rem', color: '#92400e' }}>Monitor Workloads</strong>
                        <span style={{ fontSize: '0.8rem', color: '#b45309', lineHeight: 1.5 }}>Regularly check the Workload Report. Assignments exceeding max units will be flagged.</span>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Recently Scheduled Feed */}
              <div className="card" style={{ padding: '20px' }}>
                <div className="card-header" style={{ marginBottom: '14px', borderBottom: 'none', paddingBottom: 0 }}>
                  <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon d={NAV_ICONS.schedule} size={16} /> Recently Scheduled
                  </h3>
                  <button className="btn btn-sm" onClick={() => setActiveTab('room-utilization')} style={{ background: 'transparent', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', boxShadow: 'none' }}>
                    View All
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {enrichedSchedules.slice(-4).reverse().map((s, i) => {
                    const colors = ['#5645EE', '#059669', '#d97706', '#0288d1'];
                    const accentColor = colors[i % colors.length];
                    return (
                      <div key={s.id || i} style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-main)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderLeft: `3px solid ${accentColor}`,
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                            {s.subject?.code} {s.section && <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>({s.section?.name})</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px', fontWeight: 500 }}>
                            {s.professor?.name} • {s.room?.name}
                          </div>
                        </div>
                        <div style={{
                          textAlign: 'center',
                          background: `linear-gradient(135deg, ${accentColor}12, ${accentColor}08)`,
                          padding: '8px 14px',
                          borderRadius: '10px',
                          border: `1px solid ${accentColor}20`,
                          minWidth: '52px',
                        }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            {typeof s.day === 'string' ? s.day.slice(0, 3) : s.day}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>
                            {s.timeSlot?.label?.split(' - ')[0]}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {enrichedSchedules.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'var(--bg-main)' }}>
                      <Icon d={NAV_ICONS.schedule} size={32} />
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '10px 0 0' }}>No classes scheduled yet.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>


          </div>
        )}

        {/* ── Other Tabs (unchanged) ── */}
        {isAdmin && activeTab === 'users' && <UserManagement onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'schedule' && (
          <div className="schedule-grid" style={{ animation: 'fadeIn 0.4s' }}>
            {!isMobile && (
              <ScheduleForm rooms={rooms} professors={professors} subjects={subjects} sections={sections} onSchedule={handleAddSchedule} validator={validator} activeSemester={activeSemester} />
            )}
            <AutoScheduler validator={validator} subjects={subjects} sections={sections} professors={professors} rooms={rooms} schedules={enrichedSchedules} activeSemester={activeSemester} onAutoSchedule={handleAddSchedule} onLogHistory={handleLogHistory} />
          </div>
        )}
        {isAdmin && activeTab === 'history' && <ScheduleHistory history={scheduleHistory} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'rooms' && <RoomManagement rooms={rooms} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'faculty' && <FacultyManagement professors={professors} subjects={subjects} rooms={rooms} sections={sections} activeSemester={activeSemester} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'subjects' && <SubjectManagement subjects={subjects} availableSemesters={availableSemesters} activeSemester={activeSemester} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'terms' && <TermManagement availableSemesters={availableSemesters} availableSchoolYears={availableSchoolYears} onBack={() => setActiveTab('dashboard')} publishedTerms={publishedTerms} setPublishedTerms={setPublishedTerms} />}
        {isAdmin && activeTab === 'sections' && <SectionManagement sections={sections} subjects={subjects} activeSemester={activeSemester} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'workload' && <ProfessorWorkload professors={professors} schedules={enrichedSchedules} />}

        {/* THIS IS THE ONLY TAB STUDENTS CAN ACCESS */}
        {activeTab === 'room-utilization' && <ScheduleViewer user={user} rooms={rooms} professors={professors} sections={sections} schedules={enrichedSchedules} isAdmin={isAdmin} onUpdateSchedule={handleUpdateSchedule} activeSemester={activeSemester} activeSchoolYear={activeSchoolYear} isPublished={publishedTerms[`${activeSemester}_${activeSchoolYear}`] === true} />}

        {activeTab === 'profile' && <Profile user={user} onBack={() => setActiveTab(isAdmin ? 'dashboard' : 'room-utilization')} />}

      </div>
      <Chatbot schedules={enrichedSchedules} professors={professors} subjects={subjects} sections={sections} rooms={rooms} />
      <BottomNav activeTab={activeTab} handleTabClick={handleTabClick} isAdmin={isAdmin} setIsMobileMenuOpen={setIsMobileMenuOpen} />

      {/* --- Mobile Floating Action Button (FAB) --- */}
      {isAdmin && isMobile && (activeTab === 'room-utilization' || activeTab === 'schedule') && (
        <DraggableSpeedDial 
          onAddSchedule={() => setIsScheduleFormOpen(true)} 
          onAutoScheduleAction={handleAutoScheduleAction}
          isHidden={isFabHidden}
        />
      )}

      {/* --- Bottom Sheet Modal for Schedule Form --- */}
      {isAdmin && isMobile && isScheduleFormOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end',
          animation: 'fadeIn 0.3s ease'
        }} onClick={() => setIsScheduleFormOpen(false)}>
          <div style={{
            background: 'var(--bg-main)',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            padding: '20px',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            position: 'relative'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '40px', height: '5px', background: 'var(--border-color)', borderRadius: '3px', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-main)' }}>Add Schedule</h2>
              <button onClick={() => setIsScheduleFormOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <ScheduleForm rooms={rooms} professors={professors} subjects={subjects} sections={sections} onSchedule={async (sched) => {
              const res = await handleAddSchedule(sched);
              if (res && res.ok) setIsScheduleFormOpen(false);
              return res;
            }} validator={validator} activeSemester={activeSemester} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;