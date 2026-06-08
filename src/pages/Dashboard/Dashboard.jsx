// src/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { initialRooms, initialProfessors, initialSubjects, initialSections, SEED_VERSION } from '../../config/initialData';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import { db } from '../../config/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, setDoc, writeBatch } from 'firebase/firestore';

import UserManagement from '../management/UserManagement';
import ProfessorWorkload from '../../components/ProfessorWorkload/ProfessorWorkload';
import ScheduleTable from '../../components/ScheduleTable/ScheduleTable';
import ScheduleForm from '../../components/ScheduleForm/ScheduleForm';
import AutoScheduler from '../../components/AutoScheduler/AutoScheduler';
import RoomManagement from '../management/RoomManagement';
import FacultyManagement from '../management/FacultyManagement';
import SubjectManagement from '../management/SubjectManagement';
import ScheduleViewer from '../management/ScheduleViewer';
import SectionManagement from '../management/SectionManagement';
import Chatbot from '../../components/Chatbot/Chatbot';

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
};

function professorMatchesSubject(professor, subject) {
  if (!professor || !subject) return false;
  const specs = professor.specialization || [];
  const subId = String(subject.id).toLowerCase();
  const subCode = String(subject.code).toLowerCase();

  return specs.some(s => {
    const spec = String(s).toLowerCase().trim();
    if (!spec) return false;
    // Strict match on Subject ID or Code only
    return spec === subId || spec === subCode;
  });
}

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

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = ({ user, onLogout }) => {
  const LOGO_SRC = '/logo.jpg?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  // --- ROLE IDENTIFICATION ---
  const isAdmin = user?.role === 'Admin' || user?.role === 'Department Head';
  const isStudent = user?.role === 'Student' || user?.role === 'User';

  // Make students default to the 'room-utilization' (View Schedules) tab
  const [activeTab, setActiveTab] = useState(isStudent ? 'room-utilization' : 'dashboard');

  const [isManageDataOpen, setIsManageDataOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleTabClick = (tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); };

  const [rooms, setRooms] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [schedules, setSchedules] = useState([]);

  const findScheduleConflicts = ({ roomId, professorId, sectionId, day, timeSlotId, excludeScheduleId = null }) => {
    const conflicts = { room: null, professor: null, section: null };
    for (const s of schedules) {
      if (excludeScheduleId && s.id === excludeScheduleId) continue;
      if (s.day !== day) continue;
      if (String(s.timeSlot?.id) !== String(timeSlotId)) continue;
      if (!conflicts.room && String(s.room?.id) === String(roomId)) conflicts.room = s;
      if (!conflicts.professor && String(s.professor?.id) === String(professorId)) conflicts.professor = s;
      if (!conflicts.section && sectionId && String(s.section?.id) === String(sectionId)) conflicts.section = s;
      if (conflicts.room && conflicts.professor && (!sectionId || conflicts.section)) break;
    }
    return conflicts;
  };

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
    if (errors.length > 0) return { valid: false, errors, warnings };
    const conflicts = findScheduleConflicts({ roomId: room.id, professorId: professor.id, sectionId: section?.id || null, day, timeSlotId: timeSlot.id, excludeScheduleId });
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
    };
    initializeData();
    const unsubRooms = onSnapshot(collection(db, 'rooms'), snap => setRooms(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubProfs = onSnapshot(collection(db, 'professors'), snap => setProfessors(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSubj = onSnapshot(collection(db, 'subjects'), snap => setSubjects(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSec = onSnapshot(collection(db, 'sections'), snap => setSections(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubSched = onSnapshot(collection(db, 'schedules'), snap => setSchedules(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { unsubRooms(); unsubProfs(); unsubSubj(); unsubSec(); unsubSched(); };
  }, []);

  const validator = {
    validateAssignment: (room, professor, subject, section, day, timeSlot) =>
      validateScheduleEntry({ room, professor, subject, section, day, timeSlot }),
    addSchedule: (room, professor, subject, section, day, timeSlot) => ({ schedule: { room, professor, subject, section, day, timeSlot } }),
    clearAllSchedules: async () => {
      const snap = await getDocs(collection(db, 'schedules'));
      if (snap.empty) { setSchedules([]); return; }
      const batch = writeBatch(db); snap.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); setSchedules([]);
    },
    autoScheduleForSection: async (sectionId, constraints = { respectLabs: true, preventDoubleBooking: true }) => {
      const section = sections.find(s => s.id === sectionId);
      if (!section) return { results: [], unscheduled: [], error: `Section "${sectionId}" not found.` };
      const subjectObjs = (section.subjects || []).map(subId => subjects.find(su => su.id === subId || su.code === subId)).filter(Boolean);
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
          if (subject) {
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

          // FIX: Only add to assignments if the professor actually teaches this subject!
          if (subject && professorMatchesSubject(professor, subject)) {
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
      const isGym = (r) => (r.name || '').toUpperCase().includes('GYM');

      if (isPE) {
        const gyms = rooms.filter(isGym);
        if (gyms.length > 0) return gyms;
      }

      if (constraints?.respectLabs && subject?.requiredLab) { 
        const labs = rooms.filter(r => r.hasComputers); 
        if (labs.length > 0) pool = labs; 
      }

      return [...pool].sort((a, b) => {
        const aGym = isGym(a);
        const bGym = isGym(b);
        if (aGym && !bGym) return 1;
        if (!aGym && bGym) return -1;
        return 0;
      });
    },
    _eligibleProfsFor: subject => { if (!subject) return []; return professors.filter(p => professorMatchesSubject(p, subject)); },
    _autoScheduleAssignments: async (assignments, constraints) => {
      const results = [];
      const unscheduled = [];
      const fixedRoom = constraints?.fixedRoom || null;
      const fixedProfessor = constraints?.fixedProfessor || null;
      const temp = [...schedules];

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

      // Sort remaining groups: Lab subjects first
      const groups = Array.from(groupsMap.values())
        .filter(g => g.count > 0)
        .sort((a, b) => (b.subject?.requiredLab ? 1 : 0) - (a.subject?.requiredLab ? 1 : 0));

      const PREFERRED_PAIRS = [['Monday', 'Thursday'], ['Tuesday', 'Friday']];

      for (const group of groups) {
        const { subject, section, count } = group;
        const roomPool = fixedRoom ? [fixedRoom] : validator._eligibleRoomsFor(subject, section, constraints);
        const profPool = fixedProfessor ? [fixedProfessor] : validator._eligibleProfsFor(subject);

        let placedCount = 0;

        searchLoop: for (const professor of profPool) {
          const profSchedules = temp.filter(s => String(s.professor?.id) === String(professor.id));
          const uniqueLoad = new Map();
          for (const s of profSchedules) {
            const k = `${s.subject?.id || 'x'}__${s.section?.id || 'x'}`;
            if (!uniqueLoad.has(k)) uniqueLoad.set(k, Number(s.subject?.credits) || 3);
          }
          const profCurrentLoad = Array.from(uniqueLoad.values()).reduce((s, c) => s + c, 0);

          if (profCurrentLoad + (Number(subject.credits) || 3) > (Number(professor.maxUnits) || Number(professor.maxHours) || 12) + 0.01) {
            continue;
          }

          for (const room of roomPool) {
            for (const timeSlot of TIME_SLOTS) {
              const isFree = (d) => {
                if (constraints?.preventDoubleBooking) {
                  const rBusy = temp.some(s => String(s.room?.id) === String(room.id) && s.day === d && String(s.timeSlot?.id) === String(timeSlot.id));
                  const pBusy = temp.some(s => String(s.professor?.id) === String(professor.id) && s.day === d && String(s.timeSlot?.id) === String(timeSlot.id));
                  const sBusy = section?.id ? temp.some(s => String(s.section?.id) === String(section.id) && s.day === d && String(s.timeSlot?.id) === String(timeSlot.id)) : false;
                  if (rBusy || pBusy || sBusy) return false;
                }
                const chk = validateScheduleEntry({ room, professor, subject, section, day: d, timeSlot });
                return chk.valid;
              };

              // Try preferred pairs first
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
                      placedCount = 2;
                      break searchLoop;
                    }
                  }
                }
              }

              // FALLBACK: If preferred pairs failed, or count !== 2, find ANY available combination
              if (placedCount === 0) {
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
                    placedCount = count;
                    break searchLoop;
                  }
                }
              }
            }
          }
        }

        if (placedCount < count) {
          let reason = 'Insufficient slots available or missing qualified faculty.';
          if (constraints?.respectLabs && subject?.requiredLab && fixedRoom && !fixedRoom.hasComputers) {
            reason = 'Requires computer lab.';
          }
          unscheduled.push({ subject, section, reason });
        }
      }

      return { results, unscheduled, error: null };
    },
    autoSchedule: async (subjList, constraints) => {
      const results = []; const unscheduled = []; const tempSchedules = [...schedules];
      for (const subject of subjList) {
        let scheduled = false;
        const profPool = professors.filter(p => professorMatchesSubject(p, subject));
        searchLoop: for (const prof of profPool) {
          for (const day of DAYS) {
            for (const timeSlot of TIME_SLOTS) {
              for (const room of rooms) {
                if (constraints.respectLabs && subject.requiredLab && !room.hasComputers) continue;
                const isRoomBusy = constraints.preventDoubleBooking ? tempSchedules.some(s => String(s.room?.id) === String(room.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id)) : false;
                const isProfBusy = constraints.preventDoubleBooking ? tempSchedules.some(s => String(s.professor?.id) === String(prof.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id)) : false;
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
    await addDoc(collection(db, 'schedules'), newSchedule);
    return { ok: true };
  };

  const handleRemoveSchedule = async (id) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, 'schedules', id.toString()));
  };

  const firstName = user?.name?.split?.(/\s+/)?.[0] ?? 'there';

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`smartsched-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>

      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}>

        {/* Logo block */}
        <div style={{ padding: '28px 20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', margin: '0 auto 12px',
            background: 'linear-gradient(135deg, rgba(0,191,255,0.4), rgba(65,105,225,0.2))',
            padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 28px rgba(0,191,255,0.3)',
          }}>
            <img
              src={LOGO_SRC}
              alt="CAPSU Logo"
              onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_LOGO; }}
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          </div>
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
                    <NavItem label="User Management" iconPath={NAV_ICONS.users} active={activeTab === 'users'} onClick={() => handleTabClick('users')} indent />
                  </>
                )}
                <NavItem label="Create Schedule" iconPath={NAV_ICONS.schedule} active={activeTab === 'schedule'} onClick={() => handleTabClick('schedule')} />
                <NavItem label="Faculty Workload" iconPath={NAV_ICONS.workload} active={activeTab === 'workload'} onClick={() => handleTabClick('workload')} />
              </>
            )}

            <NavItem label="View Schedules" iconPath={NAV_ICONS.viewSchedules} active={activeTab === 'room-utilization'} onClick={() => handleTabClick('room-utilization')} />
          </ul>

          {/* Divider + Logout */}
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', margin: '10px 0' }} />
          <ul style={{ margin: 0, padding: 0 }}>
            <NavItem label="Log Out" iconPath={NAV_ICONS.logout} danger onClick={onLogout} />
          </ul>
        </nav>


      </aside>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <div className="main-content">

        {/* ── Top Bar ── */}
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
              <KpiTile label="Scheduled Classes" value={schedules.length} iconPath={NAV_ICONS.schedule} color="#d97706" />
            </div>

            {/* Admin preview cards */}
            {isAdmin && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>

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
                  {schedules.slice(-4).reverse().map((s, i) => {
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
                  {schedules.length === 0 && (
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
            <ScheduleForm rooms={rooms} professors={professors} subjects={subjects} sections={sections} onSchedule={handleAddSchedule} validator={validator} />
            <AutoScheduler validator={validator} subjects={subjects} sections={sections} professors={professors} rooms={rooms} schedules={schedules} onAutoSchedule={handleAddSchedule} />
          </div>
        )}
        {isAdmin && activeTab === 'rooms' && <RoomManagement rooms={rooms} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'faculty' && <FacultyManagement professors={professors} subjects={subjects} rooms={rooms} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'subjects' && <SubjectManagement subjects={subjects} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'sections' && <SectionManagement sections={sections} subjects={subjects} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'workload' && <ProfessorWorkload professors={professors} schedules={schedules} />}

        {/* THIS IS THE ONLY TAB STUDENTS CAN ACCESS */}
        {activeTab === 'room-utilization' && <ScheduleViewer rooms={rooms} professors={professors} sections={sections} schedules={schedules} isAdmin={isAdmin} onUpdateSchedule={handleUpdateSchedule} />}

      </div>
      <Chatbot schedules={schedules} />
    </div>
  );
};

export default Dashboard;