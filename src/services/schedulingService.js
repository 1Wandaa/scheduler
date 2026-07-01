/**
 * schedulingService.js — Targeted scheduling algorithms.
 *
 * Extracted from Dashboard.jsx. Contains the 3-pass heuristic scheduler
 * (by section, by room, by faculty) and the legacy brute-force auto-scheduler.
 *
 * These are the "targeted" scheduling modes that complement the GA engine.
 * They run on the main thread and write directly to Firestore via the
 * addSchedule callback.
 */

import { TIME_SLOTS, DAYS } from '../config/constants';
import {
  professorMatchesSubject,
  getEligibleProfessors,
  applyAIRanking,
  creditPerMeeting,
  slotsNeededFromIndex,
  getTimeSlotIndex,
  schedulesOverlap,
  getEligibleRoomsTiered,
  isProfessorAllowedInRoom,
  isProfessorStageLocked,
} from '../utils/scheduleUtils';
import { validateScheduleEntry } from './validationService';

const PREFERRED_PAIRS = [['Monday', 'Thursday'], ['Tuesday', 'Friday']];

// ═══════════════════════════════════════════════════════════════════════
//  Helper: Eligible resource pools
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get tiered eligible rooms for a subject+section, optionally filtered
 * by a fixed professor's room restrictions.
 */
function getEligibleRooms(rooms, subject, section, constraints) {
  const tiers = getEligibleRoomsTiered(rooms, subject, section);
  const fixedProf = constraints?.fixedProfessor;
  if (fixedProf) {
    const filterProf = (arr) => arr.filter((r) => isProfessorAllowedInRoom(r, fixedProf, subject, section, rooms));
    return {
      tier1: filterProf(tiers.tier1),
      tier2: filterProf(tiers.tier2),
      tier3: filterProf(tiers.tier3),
      flat: filterProf(tiers.flat),
    };
  }
  return tiers;
}

/**
 * Get eligible professors for a subject+section, optionally re-ranked
 * by AI professor map.
 */
function getEligibleProfs(professors, subject, section, constraints) {
  if (!subject) return [];
  const basePool = getEligibleProfessors(professors, subject, section);
  if (constraints?.aiProfessorMap?.[subject.id]) {
    return applyAIRanking(basePool, constraints.aiProfessorMap[subject.id]);
  }
  return basePool;
}

// ═══════════════════════════════════════════════════════════════════════
//  Core: Build assignment list from subject enrollments
// ═══════════════════════════════════════════════════════════════════════

function buildAssignments(subjects, sections, activeSemester, filter) {
  const assignments = [];
  for (const section of sections) {
    for (const subId of section.subjects || []) {
      const subject = subjects.find((su) => su.id === subId || su.code === subId);
      if (!subject) continue;
      if (subject.semester && subject.semester !== 'Both' && subject.semester !== activeSemester) continue;
      if (filter && !filter(subject, section)) continue;

      const credits = Number(subject.credits) || 3;
      const targetDuration = Number(subject.hoursPerMeeting) || 1.5;
      const meetings = Math.max(1, Math.ceil(credits / targetDuration));
      for (let i = 0; i < meetings; i++) {
        assignments.push({ subject, section, meetingIndex: i + 1, targetDuration });
      }
    }
  }
  return assignments;
}

// ═══════════════════════════════════════════════════════════════════════
//  3-Pass Targeted Scheduler
// ═══════════════════════════════════════════════════════════════════════

/**
 * Schedule a set of assignments using a 3-pass heuristic approach:
 *   Pass 1 — STRICT: Department rooms only, paired days enforced
 *   Pass 2 — SHARED: Department + Shared rooms, any days
 *   Pass 3 — FALLBACK: ALL rooms (including cross-department overflow)
 *
 * @param {Object[]} assignments — list of { subject, section, meetingIndex, targetDuration }
 * @param {Object} context — { professors, rooms, subjects, sections, activeSchedules }
 * @param {Object} constraints — { fixedRoom?, fixedProfessor?, respectLabs, preventDoubleBooking, aiProfessorMap? }
 * @param {Function} addScheduleFn — async (schedule) => { ok: boolean, errors?: string[] }
 * @returns {{ results: Object[], unscheduled: Object[], error: string|null }}
 */
export async function runTargetedScheduler(assignments, context, constraints, addScheduleFn, options = {}) {
  const { professors, rooms, activeSchedules } = context;
  const { onProgress, signal } = options;

  // Early abort check — yield so pending Cancel clicks can fire
  await new Promise((r) => setTimeout(r, 0));
  if (signal?.aborted) return { results: [], unscheduled: [], error: 'Cancelled by user.' };

  const results = [];
  const unscheduled = [];
  const fixedRoom = constraints?.fixedRoom || null;
  const fixedProfessor = constraints?.fixedProfessor || null;
  const temp = [...activeSchedules];

  // 1. Group assignments by Section + Subject
  const groupsMap = new Map();
  for (const a of assignments) {
    // Skip subjects that have no eligible professors (considered "unassigned" or not enrolled)
    const profPool = fixedProfessor ? [fixedProfessor] : getEligibleProfs(professors, a.subject, a.section, constraints);
    if (profPool.length === 0) continue;

    const key = `${a.section?.id || 'none'}_${a.subject?.id}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, { subject: a.subject, section: a.section, count: 0 });
    }
    groupsMap.get(key).count++;
  }

  // Reduce counts by already-scheduled to prevent duplicates
  for (const s of temp) {
    const key = `${s.section?.id || 'none'}_${s.subject?.id}`;
    if (groupsMap.has(key)) {
      groupsMap.get(key).count--;
    }
  }

  // Sort: PE first, then Lab subjects
  const allGroups = Array.from(groupsMap.values())
    .filter((g) => g.count > 0)
    .sort((a, b) => {
      const aPE = (a.subject?.code || '').toUpperCase().startsWith('PE') ? 1 : 0;
      const bPE = (b.subject?.code || '').toUpperCase().startsWith('PE') ? 1 : 0;
      if (aPE !== bPE) return bPE - aPE;
      const aLab = a.subject?.requiredLab ? 1 : 0;
      const bLab = b.subject?.requiredLab ? 1 : 0;
      return bLab - aLab;
    });

  const placedKeys = new Set();
  const totalGroups = allGroups.length;
  let processedCount = 0;

  // Helper: report progress and yield to UI thread
  const reportProgress = async (pass, groupIndex, passTotal) => {
    processedCount++;
    if (onProgress) {
      // Weight passes: Pass 1 = 0-50%, Pass 2 = 50-80%, Pass 3 = 80-100%
      const passWeights = [0, 0.5, 0.8, 1.0];
      const passStart = passWeights[pass - 1];
      const passEnd = passWeights[pass];
      const passProgress = passTotal > 0 ? (groupIndex + 1) / passTotal : 1;
      const pct = Math.round((passStart + (passEnd - passStart) * passProgress) * 100);
      onProgress({ percent: Math.min(pct, 100), placed: results.length, total: totalGroups, pass });
    }
    // Yield to UI thread periodically
    if (processedCount % 2 === 0) await new Promise((r) => setTimeout(r, 0));
  };

  // ─── Helper: attempt to place a single group ────────────────────
  const tryPlaceGroup = async (group, roomPool, usePairsOnly) => {
    const { subject, section, count } = group;
    const profPool = fixedProfessor ? [fixedProfessor] : getEligibleProfs(professors, subject, section, constraints);
    const hasStage = rooms.some((r) => (r.name || '').toLowerCase().includes('stage'));

    for (const professor of profPool) {
      if (signal?.aborted) return false;
      // Yield to event loop so Cancel click can be processed
      await new Promise((r) => setTimeout(r, 0));
      if (signal?.aborted) return false;

      const isStageLocked = isProfessorStageLocked(professor);
      const profSchedules = temp.filter((s) => String(s.professor?.id) === String(professor.id));
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
        const validPrefRooms = roomPool.filter((r) => prefRoomIds.includes(r.id));
        const nonPrefRooms = roomPool.filter((r) => !prefRoomIds.includes(r.id));
        sortedRoomPool = [...validPrefRooms, ...nonPrefRooms];
      }

      for (let ri = 0; ri < sortedRoomPool.length; ri++) {
        const room = sortedRoomPool[ri];
        // Yield every few rooms so the UI stays responsive
        if (ri % 3 === 0) {
          await new Promise((r) => setTimeout(r, 0));
          if (signal?.aborted) return false;
        }

        if (hasStage) {
          const isStage = (room.name || '').toLowerCase().includes('stage');
          if (isStageLocked && !isStage) continue;
          if (!isStageLocked && isStage) continue;
        }

        for (const timeSlot of TIME_SLOTS) {
          if (signal?.aborted) return false;
          const startIdx = getTimeSlotIndex(timeSlot);
          if (startIdx < 0 || slotsNeededFromIndex(startIdx, subject?.hoursPerMeeting) === 0) continue;

          const isFree = (d) => {
            const candidate = { room, professor, subject, section, day: d, timeSlot };
            if (temp.some((s) => schedulesOverlap(candidate, s))) return false;
            const chk = validateScheduleEntry({ room, professor, subject, section, day: d, timeSlot }, temp, rooms);
            return chk.valid;
          };

          // Try preferred day pairs for 2-meeting classes
          if (count === 2) {
            for (const pair of PREFERRED_PAIRS) {
              if (isFree(pair[0]) && isFree(pair[1])) {
                const s1 = { room, professor, subject, section, day: pair[0], timeSlot };
                const s2 = { room, professor, subject, section, day: pair[1], timeSlot };
                const w1 = await addScheduleFn(s1);
                const w2 = await addScheduleFn(s2);

                if (w1?.ok !== false && w2?.ok !== false) {
                  temp.push(s1, s2);
                  results.push(s1, s2);
                  return true;
                }
              }
            }
          }

          // Any-day fallback — only for 1 or 3+ meetings
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
                const w = await addScheduleFn(sc);
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

  // ── PASS 1 — STRICT: Department rooms, preferred pairs ────────────
  console.log(`[AutoScheduler] Pass 1 (Strict): ${allGroups.length} groups to schedule`);
  for (let i = 0; i < allGroups.length; i++) {
    if (signal?.aborted) return { results, unscheduled, error: 'Cancelled by user.' };
    const group = allGroups[i];
    const groupKey = `${group.section?.id || 'none'}_${group.subject?.id}`;
    const tiers = fixedRoom ? { tier1: [fixedRoom], tier2: [], tier3: [] } : getEligibleRooms(rooms, group.subject, group.section, constraints);
    if (tiers.tier1.length > 0) {
      const placed = await tryPlaceGroup(group, tiers.tier1, group.count === 2);
      if (placed) placedKeys.add(groupKey);
    }
    await reportProgress(1, i, allGroups.length);
  }

  // ── PASS 2 — SHARED: Department + Shared rooms, any days ──────────
  const remainingAfterPass1 = allGroups.filter((g) => !placedKeys.has(`${g.section?.id || 'none'}_${g.subject?.id}`));
  console.log(`[AutoScheduler] Pass 2 (Shared): ${remainingAfterPass1.length} groups remaining`);
  for (let i = 0; i < remainingAfterPass1.length; i++) {
    if (signal?.aborted) return { results, unscheduled, error: 'Cancelled by user.' };
    const group = remainingAfterPass1[i];
    const groupKey = `${group.section?.id || 'none'}_${group.subject?.id}`;
    const tiers = fixedRoom ? { tier1: [fixedRoom], tier2: [], tier3: [] } : getEligibleRooms(rooms, group.subject, group.section, constraints);
    const pool = [...tiers.tier1, ...tiers.tier2];
    if (pool.length > 0) {
      const placed = await tryPlaceGroup(group, pool, false);
      if (placed) placedKeys.add(groupKey);
    }
    await reportProgress(2, i, remainingAfterPass1.length);
  }

  // ── PASS 3 — FALLBACK: ALL rooms, any days ────────────────────────
  const remainingAfterPass2 = allGroups.filter((g) => !placedKeys.has(`${g.section?.id || 'none'}_${g.subject?.id}`));
  console.log(`[AutoScheduler] Pass 3 (Fallback): ${remainingAfterPass2.length} groups remaining`);
  for (let i = 0; i < remainingAfterPass2.length; i++) {
    if (signal?.aborted) return { results, unscheduled, error: 'Cancelled by user.' };
    const group = remainingAfterPass2[i];
    const groupKey = `${group.section?.id || 'none'}_${group.subject?.id}`;
    const tiers = fixedRoom ? { tier1: [fixedRoom], tier2: [], tier3: [] } : getEligibleRooms(rooms, group.subject, group.section, constraints);
    const pool = [...tiers.tier1, ...tiers.tier2, ...tiers.tier3];
    const placed = await tryPlaceGroup(group, pool, false);
    if (placed) {
      placedKeys.add(groupKey);
    } else {
      let reason = 'Lack of available rooms or time slots.';
      if (constraints?.respectLabs && group.subject?.requiredLab && fixedRoom && !fixedRoom.hasComputers) {
        reason = 'Requires computer lab.';
      }
      unscheduled.push({ subject: group.subject, section: group.section, reason });
    }
    await reportProgress(3, i, remainingAfterPass2.length);
  }

  console.log(`[AutoScheduler] Done: ${results.length} placed, ${unscheduled.length} unscheduled`);
  return { results, unscheduled, error: null };
}

// ═══════════════════════════════════════════════════════════════════════
//  Convenience wrappers for by-section, by-room, by-faculty modes
// ═══════════════════════════════════════════════════════════════════════

export async function autoScheduleForSection(sectionId, context, constraints, addScheduleFn, activeSemester, options) {
  const { sections, subjects } = context;
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return { results: [], unscheduled: [], error: `Section "${sectionId}" not found.` };

  const assignments = buildAssignments(subjects, [section], activeSemester, null);
  return runTargetedScheduler(assignments, context, constraints, addScheduleFn, options);
}

export async function autoScheduleForRoom(roomId, context, constraints, addScheduleFn, activeSemester, options) {
  const { rooms, sections, subjects } = context;
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return { results: [], unscheduled: [], error: `Room "${roomId}" not found.` };

  const assignments = buildAssignments(subjects, sections, activeSemester, null);
  return runTargetedScheduler(assignments, context, { ...constraints, fixedRoom: room }, addScheduleFn, options);
}

export async function autoScheduleForFaculty(professorId, context, constraints, addScheduleFn, activeSemester, options) {
  const { professors, sections, subjects } = context;
  const professor = professors.find((p) => p.id === professorId);
  if (!professor) return { results: [], unscheduled: [], error: `Faculty "${professorId}" not found.` };

  const filter = (subject) => professorMatchesSubject(professor, subject);
  const assignments = buildAssignments(subjects, sections, activeSemester, filter);
  return runTargetedScheduler(assignments, context, { ...constraints, fixedProfessor: professor }, addScheduleFn, options);
}

export async function autoScheduleFull(context, constraints, addScheduleFn, activeSemester, options) {
  const { sections, subjects } = context;
  const assignments = buildAssignments(subjects, sections, activeSemester, null);
  return runTargetedScheduler(assignments, context, constraints, addScheduleFn, options);
}

// ═══════════════════════════════════════════════════════════════════════
//  Legacy brute-force auto-scheduler (subject list mode)
// ═══════════════════════════════════════════════════════════════════════

export async function autoScheduleLegacy(subjList, context, constraints, addScheduleFn) {
  const { professors, rooms } = context;
  const activeSchedules = context.activeSchedules;
  const results = [];
  const unscheduledItems = [];
  const tempSchedules = [...activeSchedules];

  for (const subject of subjList) {
    const profPool = professors.filter((p) => professorMatchesSubject(p, subject));
    if (profPool.length === 0) continue; // Skip unassigned subjects
    let scheduled = false;
    searchLoop: for (const prof of profPool) {
      for (const day of DAYS) {
        for (const timeSlot of TIME_SLOTS) {
          for (const room of rooms) {
            if (constraints.respectLabs && subject.requiredLab && !room.hasComputers) continue;
            const isRoomBusy = tempSchedules.some((s) => String(s.room?.id) === String(room.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
            const isProfBusy = tempSchedules.some((s) => String(s.professor?.id) === String(prof.id) && s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
            if (!isRoomBusy && !isProfBusy) {
              const newSchedule = { room, professor: prof, subject, day, timeSlot };
              tempSchedules.push(newSchedule);
              const writeResult = await addScheduleFn(newSchedule);
              if (writeResult?.ok === false) continue;
              results.push(newSchedule);
              scheduled = true;
              break searchLoop;
            }
          }
        }
      }
    }
    if (!scheduled) unscheduledItems.push(subject);
  }
  return { results, unscheduled: unscheduledItems, error: null };
}
