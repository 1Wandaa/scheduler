import React, { useState, useEffect } from 'react';
import { initialRooms, initialProfessors, initialSubjects, initialSections, SEED_VERSION } from './initial';
import { TIME_SLOTS, DAYS } from './index';
import { db } from './firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, setDoc, writeBatch } from 'firebase/firestore';

import UserManagement from './UserManagement';
import ProfessorWorkload from './ProfessorWorkload';
import ScheduleTable from './ScheduleTable';
import ScheduleForm from './ScheduleForm';
import AutoScheduler from './AutoScheduler';
import RoomManagement from './RoomManagement';
import FacultyManagement from './FacultyManagement';
import SubjectManagement from './SubjectManagement';
import ScheduleViewer from './ScheduleViewer';
import SectionManagement from './SectionManagement';

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const NAV_ICONS = {
  dashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  faculty: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  rooms: "M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z M9 21V12h6v9",
  subjects: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  sections: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  users: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  schedule: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  workload: "M18 20V10 M12 20V4 M6 20v-6",
  viewSchedules: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  manage: "M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  menu: "M3 12h18 M3 6h18 M3 18h18",
  print: "M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z",
};

function professorMatchesSubject(professor, subject) {
  if (!professor || !subject) return false;
  const specs = professor.specialization || [];
  return specs.includes(subject.id) ||
    specs.includes(subject.code) ||
    specs.some(s => typeof s === 'string' && subject.name?.toLowerCase().includes(s.toLowerCase()));
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────
const KpiTile = ({ label, value, iconPath, color }) => (
  <div style={{
    background: 'var(--card-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '18px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }}>
    <div style={{
      width: 44, height: 44,
      borderRadius: '10px',
      background: `${color}18`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color,
      flexShrink: 0,
    }}>
      <Icon d={iconPath} size={20} />
    </div>
    <div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1, color: 'var(--text-main)' }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>{label}</div>
    </div>
  </div>
);

// ─── NavItem ──────────────────────────────────────────────────────────────────
const NavItem = ({ label, iconPath, active, onClick, danger, indent }) => (
  <li
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
      transition: 'background 0.15s, color 0.15s',
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

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isManageDataOpen, setIsManageDataOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const isAdmin = user?.role === 'Admin' || user?.role === 'Department Head';

  const handleTabClick = (tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); };

  const [rooms, setRooms] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [schedules, setSchedules] = useState([]);

  // ── All your existing logic (unchanged) ──────────────────────────────────
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
    validateAssignment: (room, professor, subject, day, timeSlot) =>
      validateScheduleEntry({ room, professor, subject, section: null, day, timeSlot }),
    addSchedule: (room, professor, subject, day, timeSlot) => ({ schedule: { room, professor, subject, day, timeSlot } }),
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
      for (const subject of subjectObjs) { const credits = Number(subject.credits) || 3; const meetings = Math.max(1, Math.ceil(credits / 1.5)); for (let i = 0; i < meetings; i++) assignments.push({ subject, section, meetingIndex: i + 1 }); }
      return validator._autoScheduleAssignments(assignments, { ...constraints });
    },
    autoScheduleForRoom: async (roomId, constraints = { respectLabs: true, preventDoubleBooking: true }) => {
      const room = rooms.find(r => r.id === roomId);
      if (!room) return { results: [], unscheduled: [], error: `Room "${roomId}" not found.` };
      const assignments = [];
      for (const section of sections) for (const subId of (section.subjects || [])) { const subject = subjects.find(su => su.id === subId || su.code === subId); if (subject) { const credits = Number(subject.credits) || 3; const meetings = Math.max(1, Math.ceil(credits / 1.5)); for (let i = 0; i < meetings; i++) assignments.push({ subject, section, meetingIndex: i + 1 }); } }
      return validator._autoScheduleAssignments(assignments, { ...constraints, fixedRoom: room });
    },
    autoScheduleForFaculty: async (professorId, constraints = { respectLabs: true, preventDoubleBooking: true }) => {
      const professor = professors.find(p => p.id === professorId);
      if (!professor) return { results: [], unscheduled: [], error: `Faculty "${professorId}" not found.` };
      const assignments = [];
      for (const section of sections) for (const subId of (section.subjects || [])) { const subject = subjects.find(su => su.id === subId || su.code === subId); if (subject) { const credits = Number(subject.credits) || 3; const meetings = Math.max(1, Math.ceil(credits / 1.5)); for (let i = 0; i < meetings; i++) assignments.push({ subject, section, meetingIndex: i + 1 }); } }
      return validator._autoScheduleAssignments(assignments, { ...constraints, fixedProfessor: professor });
    },
    _eligibleRoomsFor: (subject, section, constraints) => {
      let pool = rooms;
      if (constraints?.respectLabs && subject?.requiredLab) { const labs = rooms.filter(r => r.hasComputers); if (labs.length > 0) pool = labs; }
      return pool;
    },
    _eligibleProfsFor: subject => { if (!subject) return []; return professors.filter(p => professorMatchesSubject(p, subject)); },
    _autoScheduleAssignments: async (assignments, constraints) => {
      const results = []; const unscheduled = [];
      const fixedRoom = constraints?.fixedRoom || null; const fixedProfessor = constraints?.fixedProfessor || null;
      const temp = [...schedules];
      const ordered = [...assignments].sort((a, b) => (b.subject?.requiredLab ? 1 : 0) - (a.subject?.requiredLab ? 1 : 0));
      for (const a of ordered) {
        const subject = a.subject; const section = a.section || null;
        const roomPool = fixedRoom ? [fixedRoom] : validator._eligibleRoomsFor(subject, section, constraints);
        const profPool = fixedProfessor ? [fixedProfessor] : validator._eligibleProfsFor(subject);
        let placed = false;
        for (const day of DAYS) {
          for (const timeSlot of TIME_SLOTS) {
            for (const room of roomPool) {
              for (const professor of profPool) {
                const profSchedules = temp.filter(s => String(s.professor?.id) === String(professor.id));
                const uniqueLoad = new Map(); for (const s of profSchedules) { const k = `${s.subject?.id || 'x'}__${s.section?.id || 'x'}`; if (!uniqueLoad.has(k)) uniqueLoad.set(k, Number(s.subject?.credits) || 3); }
                const profCurrentLoad = Array.from(uniqueLoad.values()).reduce((s, c) => s + c, 0);
                if (profCurrentLoad + (Number(subject.credits) || 3) > (professor.maxUnits || professor.maxHours || 12)) continue;
                if (constraints?.preventDoubleBooking) {
                  const roomBusy = temp.some(s => String(s.room?.id) === String(room.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
                  const profBusy = temp.some(s => String(s.professor?.id) === String(professor.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
                  const secBusy = section?.id ? temp.some(s => String(s.section?.id) === String(section.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id)) : false;
                  const sameDaySubjectBusy = section?.id ? temp.some(s => String(s.section?.id) === String(section.id) && String(s.subject?.id) === String(subject.id) && s.day === day) : false;
                  if (roomBusy || profBusy || secBusy || sameDaySubjectBusy) continue;
                }
                const check = validateScheduleEntry({ room, professor, subject, section, day, timeSlot });
                if (!check.valid) continue;
                const newSchedule = { room, professor, subject, section, day, timeSlot };
                const writeResult = await handleAddSchedule(newSchedule);
                if (writeResult?.ok === false) continue;
                temp.push(newSchedule); results.push(newSchedule); placed = true; break;
              } if (placed) break;
            } if (placed) break;
          } if (placed) break;
        }
        if (!placed) {
          let reason = 'Insufficient valid slots or missing qualified faculty';
          if (constraints?.respectLabs && subject?.requiredLab && fixedRoom && !fixedRoom.hasComputers) reason = 'Requires computer lab (selected room is not a lab)';
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
    if (!check.valid) { alert(`Cannot move schedule:\n${check.errors.join('\n')}`); return { ok: false, errors: check.errors }; }
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
        <div style={{ padding: '24px 16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'center' }}>
          <img
            src={LOGO_SRC}
            alt="CAPSU Logo"
            onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_LOGO; }}
            style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent-primary)', display: 'block', margin: '0 auto 10px' }}
          />
          {!isSidebarCollapsed && (
            <>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.08em', color: 'var(--sidebar-text-active)' }}>SMARTSCHED</div>
              <span style={{
                display: 'inline-block', marginTop: 6,
                fontSize: '0.72rem', padding: '3px 10px', borderRadius: '20px',
                background: isAdmin ? 'var(--accent-primary)' : 'var(--success)',
                color: '#fff', fontWeight: 600, letterSpacing: '0.03em',
              }}>
                {user?.role}
              </span>
            </>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          <ul style={{ margin: 0, padding: 0 }}>
            <NavItem label="Dashboard" iconPath={NAV_ICONS.dashboard} active={activeTab === 'dashboard'} onClick={() => handleTabClick('dashboard')} />

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

        {/* Stats strip */}
        {!isSidebarCollapsed && (
          <div style={{
            margin: '0 8px 12px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '12px 14px',
            fontSize: '0.82rem',
          }}>
            {[
              { label: 'Faculty', val: professors.length },
              { label: 'Rooms', val: rooms.length },
              { label: 'Sections', val: sections.length },
              { label: 'Classes', val: schedules.length },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--sidebar-text-muted)' }}>
                <span>{s.label}</span>
                <strong style={{ color: 'var(--sidebar-text-active)' }}>{s.val}</strong>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <div className="main-content">

        {/* ── Top Bar ── */}
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 0 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          marginBottom: '24px',
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
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.8)', fontWeight: 500, letterSpacing: '0.02em' }}>
                Capiz State University · Mambusao Satellite College
              </p>
              <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#ffffff' }}>
                Welcome back, {firstName} 👋
              </h1>
            </div>
          </div>
          <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(o => !o)}>
            <Icon d={NAV_ICONS.menu} size={22} />
          </button>
        </header>

        {/* ── Dashboard Tab ── */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s' }}>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
              <KpiTile label="Faculty Members" value={professors.length} iconPath={NAV_ICONS.faculty} color="#0288d1" />
              <KpiTile label="Rooms" value={rooms.length} iconPath={NAV_ICONS.rooms} color="#7c3aed" />
              <KpiTile label="Sections" value={sections.length} iconPath={NAV_ICONS.sections} color="#059669" />
              <KpiTile label="Scheduled Classes" value={schedules.length} iconPath={NAV_ICONS.schedule} color="#d97706" />
            </div>

            {/* Admin preview cards */}
            {isAdmin && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {/* Faculty preview */}
                <div className="card" style={{ padding: '20px' }}>
                  <div className="card-header" style={{ marginBottom: '14px' }}>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon d={NAV_ICONS.faculty} size={16} /> Faculty Profiles
                    </h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab('faculty')}>View All</button>
                  </div>
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Department</th><th>Max Units</th></tr></thead>
                    <tbody>
                      {professors.slice(0, 3).map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500 }}>{p.name}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.department}</td>
                          <td style={{ textAlign: 'center' }}>{p.maxUnits || p.maxHours || 12}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {professors.length > 3 && (
                    <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                      +{professors.length - 3} more
                    </p>
                  )}
                </div>

                {/* Rooms preview */}
                <div className="card" style={{ padding: '20px' }}>
                  <div className="card-header" style={{ marginBottom: '14px' }}>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon d={NAV_ICONS.rooms} size={16} /> Room List
                    </h3>
                    <button className="btn btn-sm" onClick={() => setActiveTab('rooms')}>View All</button>
                  </div>
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Lab?</th></tr></thead>
                    <tbody>
                      {rooms.slice(0, 3).map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500 }}>{r.name}</td>
                          <td style={{ textTransform: 'uppercase', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{r.type}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: r.hasComputers ? '#05966918' : 'var(--border-color)', color: r.hasComputers ? '#059669' : 'var(--text-muted)' }}>
                              {r.hasComputers ? 'Yes' : 'No'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rooms.length > 3 && (
                    <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                      +{rooms.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Weekly Schedule card */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon d={NAV_ICONS.viewSchedules} size={16} /> Weekly Schedule
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isAdmin && (
                    <button className="btn btn-sm" onClick={() => setActiveTab('schedule')}>
                      + Add Entry
                    </button>
                  )}
                  <button
                    className="btn btn-sm"
                    onClick={() => window.print()}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                  >
                    <Icon d={NAV_ICONS.print} size={14} /> Print
                  </button>
                </div>
              </div>
              <div style={{ padding: '12px', overflowX: 'auto' }}>
                <ScheduleTable
                  schedules={schedules}
                  onRemove={isAdmin ? handleRemoveSchedule : null}
                  onUpdateSchedule={isAdmin ? handleUpdateSchedule : null}
                />
              </div>
            </div>

            {/* Alerts */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 className="card-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                System Alerts
              </h3>
              <div className="alert-item alert-info">
                <strong>Ready:</strong> Schedule data is live and up to date.
              </div>
              {!isAdmin && (
                <div className="alert-item alert-warning" style={{ marginTop: 8 }}>
                  <strong>Notice:</strong> You are in View-Only mode. Contact an Admin to make schedule changes.
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── Other Tabs (unchanged) ── */}
        {isAdmin && activeTab === 'users' && <UserManagement onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'schedule' && (
          <div className="schedule-grid" style={{ animation: 'fadeIn 0.4s' }}>
            <ScheduleForm rooms={rooms} professors={professors} subjects={subjects} onSchedule={handleAddSchedule} validator={validator} />
            <AutoScheduler validator={validator} subjects={subjects} sections={sections} professors={professors} rooms={rooms} onAutoSchedule={handleAddSchedule} />
          </div>
        )}
        {isAdmin && activeTab === 'rooms' && <RoomManagement rooms={rooms} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'faculty' && <FacultyManagement professors={professors} subjects={subjects} rooms={rooms} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'subjects' && <SubjectManagement subjects={subjects} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'sections' && <SectionManagement sections={sections} subjects={subjects} onBack={() => setActiveTab('dashboard')} />}
        {isAdmin && activeTab === 'workload' && <ProfessorWorkload professors={professors} schedules={schedules} />}
        {activeTab === 'room-utilization' && <ScheduleViewer rooms={rooms} professors={professors} sections={sections} schedules={schedules} />}

      </div>
    </div>
  );
};

export default Dashboard;