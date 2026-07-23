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
  slotsNeededFromIndex,
  getTimeSlotIndex,
  schedulesOverlap,
  getEligibleRoomsTiered,
  isProfessorAllowedInRoom,
  isProfessorStageLocked,
} from '../utils/scheduleUtils';
import { resolveUnscheduledClasses } from '../utils/scheduleAI';

const PREFERRED_PAIRS = [['Monday', 'Thursday'], ['Tuesday', 'Friday']];

/**
 * Yield to the main thread without using setTimeout.
 * MessageChannel.postMessage is NOT throttled when the tab is hidden,
 * unlike setTimeout which browsers clamp to >=1000ms in background tabs.
 * This prevents the scheduler from stalling when the user alt-tabs.
 */
function yieldToMain() {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  Helper: Eligible resource pools
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get tiered eligible rooms for a subject+section, optionally filtered
 * by a fixed professor's room restrictions.
 */
function getEligibleRooms(rooms, subject, section, constraints) {
  let activeSubject = subject;
  if (constraints && constraints.respectLabs === false) {
    activeSubject = { ...subject, requiredLab: false, isFoodLab: false };
  }
  const tiers = getEligibleRoomsTiered(rooms, activeSubject, section);
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
    const uniqueSubjects = [...new Set(section.subjects || [])];
    for (const subId of uniqueSubjects) {
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
  await yieldToMain();
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

  // ─── Helper: compute a professor's remaining unit capacity from temp ───
  const getProfRemainingCapacity = (professor) => {
    const profSchedules = temp.filter((s) => String(s.professor?.id) === String(professor.id));
    const uniqueLoad = new Map();
    for (const s of profSchedules) {
      const k = `${s.subject?.id || 'x'}__${s.section?.id || 'x'}`;
      if (!uniqueLoad.has(k)) {
        const creds = Number(s.subject?.credits);
        uniqueLoad.set(k, isNaN(creds) || s.subject?.credits === '' ? 3 : creds);
      }
    }
    const currentLoad = Array.from(uniqueLoad.values()).reduce((s, c) => s + c, 0);
    const maxUnits = Number(professor.maxUnits) || Number(professor.maxHours) || 24;
    return maxUnits - currentLoad;
  };

  // Sort by constraint tightness: PE → Lab/FoodLab → fewest eligible rooms → fewest eligible profs → tightest capacity
  const allGroups = Array.from(groupsMap.values())
    .filter((g) => g.count > 0)
    .map((g) => {
      // Pre-compute constraint tightness for sorting
      const eligibleRoomCount = fixedRoom ? 1 : getEligibleRooms(rooms, g.subject, g.section, constraints).flat.length;
      const profPoolForSort = fixedProfessor ? [fixedProfessor] : getEligibleProfs(professors, g.subject, g.section, constraints);
      const eligibleProfCount = profPoolForSort.length;
      // Total remaining capacity across all eligible professors — lower = more constrained
      const totalCapacity = profPoolForSort.reduce((sum, p) => sum + Math.max(0, getProfRemainingCapacity(p)), 0);
      return { ...g, _eligibleRooms: eligibleRoomCount, _eligibleProfs: eligibleProfCount, _totalCapacity: totalCapacity };
    })
    .sort((a, b) => {
      // 1. PE subjects first (very constrained — gym/stage only)
      const aPE = (a.subject?.code || '').toUpperCase().startsWith('PE') ? 1 : 0;
      const bPE = (b.subject?.code || '').toUpperCase().startsWith('PE') ? 1 : 0;
      if (aPE !== bPE) return bPE - aPE;
      // 2. Lab/FoodLab subjects next (limited room pool)
      const aLab = (a.subject?.requiredLab || a.subject?.isFoodLab) ? 1 : 0;
      const bLab = (b.subject?.requiredLab || b.subject?.isFoodLab) ? 1 : 0;
      if (aLab !== bLab) return bLab - aLab;
      // 3. Fewest eligible rooms first (most room-constrained)
      if (a._eligibleRooms !== b._eligibleRooms) return a._eligibleRooms - b._eligibleRooms;
      // 4. Fewest eligible professors first
      if (a._eligibleProfs !== b._eligibleProfs) return a._eligibleProfs - b._eligibleProfs;
      // 5. Tightest total professor capacity first (most capacity-constrained)
      if (a._totalCapacity !== b._totalCapacity) return a._totalCapacity - b._totalCapacity;
      return 0;
    });

  const placedKeys = new Set();
  const totalGroups = allGroups.length;
  let processedCount = 0;

  // Helper: report progress and yield to UI thread
  const reportProgress = async (pass, groupIndex, passTotal) => {
    processedCount++;
    if (onProgress) {
      // Weight passes: Pass 1 = 0-40%, Pass 2 = 40-70%, Pass 3 = 70-90%, Pass 4 = 90-100%
      const passWeights = [0, 0.4, 0.7, 0.9, 1.0];
      const passStart = passWeights[pass - 1] || 0;
      const passEnd = passWeights[pass] || 1;
      const passProgress = passTotal > 0 ? (groupIndex + 1) / passTotal : 1;
      const pct = Math.round((passStart + (passEnd - passStart) * passProgress) * 100);
      onProgress({ percent: Math.min(pct, 100), placed: results.length, total: totalGroups, pass });
    }
    // Yield to UI thread periodically
    if (processedCount % 2 === 0) await yieldToMain();
  };

  // ─── Helper: check if a single slot is free for a given combo ───
  // NOTE: We intentionally do NOT call validateScheduleEntry here.
  // Lab requirements (computer/food) are already enforced by the room pool
  // filter (getEligibleRooms → getEligibleRoomsTiered). Calling validateScheduleEntry
  // would re-enforce lab checks without the respectLabs constraint context,
  // causing false rejections (e.g. FT subjects blocked from all rooms).
  // Conflict checks (room/prof/section overlap) are handled by schedulesOverlap.
  const isSlotFree = (room, professor, subject, section, day, timeSlot) => {
    const candidate = { room, professor, subject, section, day, timeSlot };
    // Check for time conflicts with already-scheduled classes
    if (temp.some((s) => schedulesOverlap(candidate, s))) return false;
    // Verify the time slot fits the meeting duration (already checked by caller,
    // but needed for the flexible fallback where timeSlot varies)
    const startIdx = getTimeSlotIndex(timeSlot);
    if (startIdx < 0 || slotsNeededFromIndex(startIdx, subject?.hoursPerMeeting) === 0) return false;
    return true;
  };

  // ─── Helper: attempt to place a single group ────────────────────
  const tryPlaceGroup = async (group, roomPool, usePairsOnly) => {
    const { subject, section, count } = group;
    const rawProfPool = fixedProfessor ? [fixedProfessor] : getEligibleProfs(professors, subject, section, constraints);
    const hasStage = rooms.some((r) => (r.name || '').toLowerCase().includes('stage'));

    // ── Sort professors by remaining capacity (most headroom first) ──
    // This prevents near-maxed professors from "claiming" slots when a
    // higher-capacity professor could take the subject instead.
    const profPool = [...rawProfPool].sort((a, b) => {
      const capA = getProfRemainingCapacity(a);
      const capB = getProfRemainingCapacity(b);
      return capB - capA; // descending: most remaining capacity first
    });

    // ── Diagnostic counters ──
    let profMaxUnitsReached = false;
    let anyProfEligibleForRooms = false;
    let profMaxUnitsCount = 0;
    let totalProfsChecked = profPool.length;

    for (const professor of profPool) {
      if (signal?.aborted) return { success: false };
      await yieldToMain();
      if (signal?.aborted) return { success: false };

      const isStageLocked = isProfessorStageLocked(professor);
      const profSchedules = temp.filter((s) => String(s.professor?.id) === String(professor.id));
      const uniqueLoad = new Map();
      for (const s of profSchedules) {
        const k = `${s.subject?.id || 'x'}__${s.section?.id || 'x'}`;
        if (!uniqueLoad.has(k)) {
          const creds = Number(s.subject?.credits);
          uniqueLoad.set(k, isNaN(creds) || s.subject?.credits === '' ? 3 : creds);
        }
      }
      const profCurrentLoad = Array.from(uniqueLoad.values()).reduce((s, c) => s + c, 0);
      const groupKey = `${subject?.id || 'x'}__${section?.id || 'x'}`;
      let subjectCredits = 0;
      if (!uniqueLoad.has(groupKey)) {
        const creds = Number(subject.credits);
        subjectCredits = isNaN(creds) || subject.credits === '' ? 3 : creds;
      }
      const maxUnits = Number(professor.maxUnits) || Number(professor.maxHours) || 24;

      if (profCurrentLoad + subjectCredits > maxUnits + 0.01) {
        profMaxUnitsReached = true;
        profMaxUnitsCount++;
        continue;
      }

      anyProfEligibleForRooms = true;

      const prefRoomIds = professor.preferredRooms || [];
      let sortedRoomPool = roomPool;
      if (prefRoomIds.length > 0) {
        const validPrefRooms = roomPool.filter((r) => prefRoomIds.includes(r.id));
        const nonPrefRooms = roomPool.filter((r) => !prefRoomIds.includes(r.id));
        sortedRoomPool = [...validPrefRooms, ...nonPrefRooms];
      }

      for (let ri = 0; ri < sortedRoomPool.length; ri++) {
        const room = sortedRoomPool[ri];
        if (ri % 3 === 0) {
          await yieldToMain();
          if (signal?.aborted) return { success: false };
        }

        if (hasStage) {
          const isStage = (room.name || '').toLowerCase().includes('stage');
          if (isStageLocked && !isStage) continue;
          if (!isStageLocked && isStage) continue;
        }


        // ── Professor-room compatibility check ──
        // Skip rooms that this professor is not allowed to use (BSCS-exclusive,
        // Speech Lab, Room 204 restrictions). Without this, the scheduler wastes
        // attempts on combos that will always fail Firestore validation.
        if (!isProfessorAllowedInRoom(room, professor, subject, section, rooms)) continue;

        for (const timeSlot of TIME_SLOTS) {
          if (signal?.aborted) return { success: false };
          const startIdx = getTimeSlotIndex(timeSlot);
          if (startIdx < 0 || slotsNeededFromIndex(startIdx, subject?.hoursPerMeeting) === 0) continue;

          const isFree = (d) => isSlotFree(room, professor, subject, section, d, timeSlot);

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
                  return { success: true };
                }
              }
            }
          }

          // Try preferred pattern for 3-meeting classes (MWF)
          if (count === 3) {
            const mwf = ['Monday', 'Wednesday', 'Friday'];
            if (isFree(mwf[0]) && isFree(mwf[1]) && isFree(mwf[2])) {
              const s1 = { room, professor, subject, section, day: mwf[0], timeSlot };
              const s2 = { room, professor, subject, section, day: mwf[1], timeSlot };
              const s3 = { room, professor, subject, section, day: mwf[2], timeSlot };
              const w1 = await addScheduleFn(s1);
              const w2 = await addScheduleFn(s2);
              const w3 = await addScheduleFn(s3);
              if (w1?.ok !== false && w2?.ok !== false && w3?.ok !== false) {
                temp.push(s1, s2, s3);
                results.push(s1, s2, s3);
                return { success: true };
              }
            }
          }

          // Any-day same-timeslot fallback
          if (!usePairsOnly) {
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
                return { success: true };
              }
            }
          }
        }
      }

      // ── FLEXIBLE TIME SLOT FALLBACK ──
      // Each meeting can use a DIFFERENT time slot on different days.
      // Only try this in non-pairs mode (Pass 2/3) to avoid slowing Pass 1.
      // IMPORTANT: We validate all placements in-memory FIRST, then write to
      // Firestore only after confirming all meetings can be placed. This
      // prevents orphaned documents if only some meetings succeed.
      if (!usePairsOnly && count >= 2) {
        const placedMeetings = [];
        const usedDays = new Set();

        for (let mi = 0; mi < count; mi++) {
          let placed = false;
          for (let ri = 0; ri < sortedRoomPool.length && !placed; ri++) {
            const room = sortedRoomPool[ri];
            if (hasStage) {
              const isStage = (room.name || '').toLowerCase().includes('stage');
              if (isStageLocked && !isStage) continue;
              if (!isStageLocked && isStage) continue;
            }
            if (!isProfessorAllowedInRoom(room, professor, subject, section, rooms)) continue;
            for (const ts of TIME_SLOTS) {
              if (signal?.aborted) return { success: false };
              const si = getTimeSlotIndex(ts);
              if (si < 0 || slotsNeededFromIndex(si, subject?.hoursPerMeeting) === 0) continue;
              for (const day of DAYS) {
                if (usedDays.has(day)) continue;
                if (isSlotFree(room, professor, subject, section, day, ts)) {
                  const meeting = { room, professor, subject, section, day, timeSlot: ts };
                  placedMeetings.push(meeting);
                  // Temporarily add to temp so next meetings see this as occupied
                  temp.push(meeting);
                  usedDays.add(day);
                  placed = true;
                  break;
                }
              }
              if (placed) break;
            }
          }
          if (!placed) break;
        }

        if (placedMeetings.length === count) {
          // All meetings fit in-memory — now batch write to Firestore
          let allOk = true;
          for (const sc of placedMeetings) {
            const w = await addScheduleFn(sc);
            if (w?.ok === false) { allOk = false; break; }
          }
          if (allOk) {
            results.push(...placedMeetings);
            return { success: true };
          }
        }
        // Rollback temp if flexible placement failed or Firestore writes failed
        for (const pm of placedMeetings) {
          const idx = temp.indexOf(pm);
          if (idx !== -1) temp.splice(idx, 1);
        }
      }
    }

    // ── Detailed failure diagnostics ──
    if (!anyProfEligibleForRooms && profMaxUnitsReached) {
      return { success: false, reason: `All ${profMaxUnitsCount} eligible professor(s) reached their max units.` };
    }
    if (roomPool.length === 0) {
      return { success: false, reason: 'No eligible rooms available for this subject/section.' };
    }
    if (profMaxUnitsCount > 0 && profMaxUnitsCount < totalProfsChecked) {
      const availableProfs = totalProfsChecked - profMaxUnitsCount;
      return { success: false, reason: `${profMaxUnitsCount} of ${totalProfsChecked} professors at max units; remaining ${availableProfs} professor(s) have no free slots across ${roomPool.length} room(s).` };
    }
    return { success: false, reason: `No free time slots found across ${totalProfsChecked} professor(s) and ${roomPool.length} room(s).` };
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
      if (placed?.success) placedKeys.add(groupKey);
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
      if (placed?.success) placedKeys.add(groupKey);
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
    if (placed?.success) {
      placedKeys.add(groupKey);
    } else {
      let reason = placed?.reason || 'No matching room and professor availability found.';
      if (constraints?.respectLabs && group.subject?.requiredLab && fixedRoom && !fixedRoom.hasComputers) {
        reason = 'Requires computer lab.';
      } else if (constraints?.respectLabs && group.subject?.isFoodLab && fixedRoom && !fixedRoom.isFoodLab) {
        reason = 'Requires food lab.';
      }
      unscheduled.push({ subject: group.subject, section: group.section, reason });
    }
    await reportProgress(3, i, remainingAfterPass2.length);
  }

  // ── PASS 3.25 — UNIT-BLOCKED RETRY ───────────────────────────────
  // Re-attempt groups that failed due to "max units reached". Other
  // placements may have gone to different professors, freeing capacity
  // for professors who were previously at-max.
  const unitBlockedRetry = allGroups.filter((g) => {
    const gk = `${g.section?.id || 'none'}_${g.subject?.id}`;
    if (placedKeys.has(gk)) return false;
    const failed = unscheduled.find((u) => u.subject?.id === g.subject?.id && u.section?.id === g.section?.id);
    return failed && failed.reason && failed.reason.toLowerCase().includes('max units');
  });
  if (unitBlockedRetry.length > 0) {
    console.log(`[AutoScheduler] Pass 3.25 (Unit-Blocked Retry): ${unitBlockedRetry.length} groups to retry`);
    for (let i = 0; i < unitBlockedRetry.length; i++) {
      if (signal?.aborted) return { results, unscheduled, error: 'Cancelled by user.' };
      const group = unitBlockedRetry[i];
      const groupKey = `${group.section?.id || 'none'}_${group.subject?.id}`;
      if (placedKeys.has(groupKey)) continue;
      const tiers = fixedRoom ? { tier1: [fixedRoom], tier2: [], tier3: [] } : getEligibleRooms(rooms, group.subject, group.section, constraints);
      const pool = [...tiers.tier1, ...tiers.tier2, ...tiers.tier3];
      const placed = await tryPlaceGroup(group, pool, false);
      if (placed?.success) {
        placedKeys.add(groupKey);
        // Remove from unscheduled list since it's now placed
        const uIdx = unscheduled.findIndex((u) => u.subject?.id === group.subject?.id && u.section?.id === group.section?.id);
        if (uIdx !== -1) unscheduled.splice(uIdx, 1);
        console.log(`[AutoScheduler] Unit-blocked retry success: ${group.subject?.code} (${group.section?.name})`);
      }
    }
  }

  // ── PASS 3.5 — BUMP-AND-RETRY ────────────────────────────────────
  // For each unscheduled group, try to displace a less-constrained
  // already-placed class and re-schedule it elsewhere.
  const stillUnscheduled = allGroups.filter((g) => !placedKeys.has(`${g.section?.id || 'none'}_${g.subject?.id}`));
  if (stillUnscheduled.length > 0 && stillUnscheduled.length < allGroups.length) {
    console.log(`[AutoScheduler] Pass 3.5 (Bump-Retry): ${stillUnscheduled.length} groups to retry`);
    for (let ui = 0; ui < stillUnscheduled.length; ui++) {
      if (signal?.aborted) return { results, unscheduled, error: 'Cancelled by user.' };
      const unschedGroup = stillUnscheduled[ui];
      const unschedKey = `${unschedGroup.section?.id || 'none'}_${unschedGroup.subject?.id}`;
      if (placedKeys.has(unschedKey)) continue; // Already resolved by a prior bump

      const unschedRoomPool = fixedRoom ? [fixedRoom] : getEligibleRooms(rooms, unschedGroup.subject, unschedGroup.section, constraints).flat;
      if (unschedRoomPool.length === 0) continue;

      // Find placed classes that occupy slots this group might need
      // Try bumping one at a time — bump the one with the MOST alternative slots (easiest to re-place)
      // Deduplicate by subject+section so we bump entire groups, not individual meetings
      const seenBumpKeys = new Set();
      const candidateBumps = [];
      for (const placed of results) {
        // Only consider bumping classes that share eligible rooms
        if (!unschedRoomPool.some((r) => String(r.id) === String(placed.room?.id))) continue;
        // Don't bump PE or Lab subjects — they're heavily constrained
        const placedCode = (placed.subject?.code || '').toUpperCase();
        if (placedCode.startsWith('PE')) continue;
        if (placed.subject?.requiredLab || placed.subject?.isFoodLab) continue;

        // Deduplicate: only add one candidate per subject+section group
        const bumpGroupKey = `${placed.section?.id || 'none'}_${placed.subject?.id}`;
        if (seenBumpKeys.has(bumpGroupKey)) continue;
        seenBumpKeys.add(bumpGroupKey);

        candidateBumps.push(placed);
      }

      let bumpSucceeded = false;
      // Try bumping each candidate (limit to 20 to avoid excessive computation)
      for (let bi = 0; bi < Math.min(candidateBumps.length, 20); bi++) {
        if (signal?.aborted) return { results, unscheduled, error: 'Cancelled by user.' };
        const bumpTarget = candidateBumps[bi];
        const bumpSubjectId = String(bumpTarget.subject?.id);
        const bumpSectionId = String(bumpTarget.section?.id);

        // Find ALL meetings for this bumped subject+section group
        const bumpedMeetings = results.filter((s) =>
          String(s.subject?.id) === bumpSubjectId &&
          String(s.section?.id) === bumpSectionId
        );
        if (bumpedMeetings.length === 0) continue;

        // Temporarily remove ALL bumped meetings from temp and results
        for (const bm of bumpedMeetings) {
          const tIdx = temp.indexOf(bm);
          if (tIdx !== -1) temp.splice(tIdx, 1);
          const rIdx = results.indexOf(bm);
          if (rIdx !== -1) results.splice(rIdx, 1);
        }

        // Snapshot results length to track what tryPlaceGroup adds for unschedGroup
        const resultsLenBefore = results.length;

        // Try to place the unscheduled group now
        const retryPlaced = await tryPlaceGroup(unschedGroup, unschedRoomPool, false);
        if (retryPlaced?.success) {
          // Now try to re-place the bumped class with its ACTUAL meeting count
          const bumpedOrigGroup = allGroups.find((g) =>
            String(g.subject?.id) === bumpSubjectId &&
            String(g.section?.id) === bumpSectionId
          );
          const bumpedCount = bumpedOrigGroup?.count || bumpedMeetings.length;
          const bumpedGroup = { subject: bumpTarget.subject, section: bumpTarget.section, count: bumpedCount };
          const bumpedTiers = getEligibleRooms(rooms, bumpTarget.subject, bumpTarget.section, constraints);
          const bumpedPool = [...bumpedTiers.tier1, ...bumpedTiers.tier2, ...bumpedTiers.tier3];
          const rePlaced = await tryPlaceGroup(bumpedGroup, bumpedPool, false);

          if (rePlaced?.success) {
            // Both placed! Remove from unscheduled list
            placedKeys.add(unschedKey);
            const uIdx = unscheduled.findIndex((u) => u.subject?.id === unschedGroup.subject?.id && u.section?.id === unschedGroup.section?.id);
            if (uIdx !== -1) unscheduled.splice(uIdx, 1);
            bumpSucceeded = true;
            console.log(`[AutoScheduler] Bump success: displaced ${bumpTarget.subject?.code} to make room for ${unschedGroup.subject?.code}`);
            break;
          } else {
            // Re-placing bumped class failed — rollback: remove entries added for unschedGroup
            const addedForUnsched = results.splice(resultsLenBefore);
            for (const added of addedForUnsched) {
              const ti = temp.indexOf(added);
              if (ti !== -1) temp.splice(ti, 1);
            }
            // Restore the bump target meetings
            temp.push(...bumpedMeetings);
            results.push(...bumpedMeetings);
          }
        } else {
          // Couldn't place even after bump — restore bump target meetings
          temp.push(...bumpedMeetings);
          results.push(...bumpedMeetings);
        }
      }
    }
  }

  // ── PASS 3.75 — POST-BUMP RETRY ──────────────────────────────────
  // After bumps may have rearranged classes, re-attempt unscheduled groups
  // with all rooms. Previously-full slot combos may now be free.
  const postBumpRemaining = allGroups.filter((g) => !placedKeys.has(`${g.section?.id || 'none'}_${g.subject?.id}`));
  if (postBumpRemaining.length > 0 && postBumpRemaining.length < stillUnscheduled.length) {
    console.log(`[AutoScheduler] Pass 3.75 (Post-Bump Retry): ${postBumpRemaining.length} groups to retry`);
    for (let i = 0; i < postBumpRemaining.length; i++) {
      if (signal?.aborted) return { results, unscheduled, error: 'Cancelled by user.' };
      const group = postBumpRemaining[i];
      const groupKey = `${group.section?.id || 'none'}_${group.subject?.id}`;
      if (placedKeys.has(groupKey)) continue;
      const tiers = fixedRoom ? { tier1: [fixedRoom], tier2: [], tier3: [] } : getEligibleRooms(rooms, group.subject, group.section, constraints);
      const pool = [...tiers.tier1, ...tiers.tier2, ...tiers.tier3];
      const placed = await tryPlaceGroup(group, pool, false);
      if (placed?.success) {
        placedKeys.add(groupKey);
        const uIdx = unscheduled.findIndex((u) => u.subject?.id === group.subject?.id && u.section?.id === group.section?.id);
        if (uIdx !== -1) unscheduled.splice(uIdx, 1);
        console.log(`[AutoScheduler] Post-bump retry success: ${group.subject?.code} (${group.section?.name})`);
      }
    }
  }

  // ── PASS 4 — AI CONFLICT RESOLUTION ──────────────────────────────
  const remainingAfterPass3 = allGroups.filter((g) => !placedKeys.has(`${g.section?.id || 'none'}_${g.subject?.id}`));
  if (constraints?.aiAssisted && remainingAfterPass3.length > 0) {
    console.log(`[AutoScheduler] Pass 4 (AI Resolution): Attempting to resolve ${remainingAfterPass3.length} unscheduled groups`);
    await reportProgress(4, 0, remainingAfterPass3.length);
    const aiResolutions = await resolveUnscheduledClasses(remainingAfterPass3, context, constraints);

    if (aiResolutions && aiResolutions.length > 0) {
      for (let i = 0; i < aiResolutions.length; i++) {
        const res = aiResolutions[i];
        if (signal?.aborted) return { results, unscheduled, error: 'Cancelled by user.' };
        const group = remainingAfterPass3[res.groupIndex];
        if (!group) continue;

        const room = rooms.find(r => String(r.id) === String(res.roomId));
        const professor = professors.find(p => String(p.id) === String(res.professorId));
        const timeSlot = TIME_SLOTS.find(ts => String(ts.id) === String(res.timeSlotId));
        const day = res.day;

        if (!room || !professor || !timeSlot || !day) continue;

        const sc = { room, professor, subject: group.subject, section: group.section, day, timeSlot, prescriptionNote: res.prescriptionNote };
        const w = await addScheduleFn(sc);

        if (w?.ok !== false) {
          temp.push(sc);
          results.push(sc);

          const uIdx = unscheduled.findIndex(u => u.subject?.id === group.subject?.id && (u.section?.id === group.section?.id || (!u.section && !group.section)));
          if (uIdx !== -1) {
            unscheduled.splice(uIdx, 1);
          }
        }
        await reportProgress(4, i, aiResolutions.length);
      }
    }
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


