/**
 * Shared scheduling utilities used by GA, Dashboard validation, AI, and AutoScheduler.
 */

import { TIME_SLOTS, getSlotDurationHours } from '../config/constants.js';

const DEPARTMENTS = ['BSCS', 'BAEL', 'BSOA', 'BSFT'];

/**
 * How many consecutive TIME_SLOTS rows a meeting occupies from a start index.
 * Accounts for the 30-minute slot before lunch (id 5).
 * Returns 0 if the meeting does not fit from that start index.
 */
export function slotsNeededFromIndex(startIdx, hoursPerMeeting) {
  if (startIdx === 0) {
    return 0; // Prevent classes from starting at 7:00 AM
  }

  const target = Number(hoursPerMeeting) || 1.5;
  let accumulated = 0;
  let count = 0;
  let crossesLunch = false;
  
  while (startIdx + count < TIME_SLOTS.length && accumulated < target - 0.001) {
    if (count > 0) {
      const prevSlot = TIME_SLOTS[startIdx + count - 1];
      const currSlot = TIME_SLOTS[startIdx + count];
      if (prevSlot.label === '11:30 - 12:00' && currSlot.label === '1:00 - 1:30') {
        crossesLunch = true;
        break;
      }
    }
    accumulated += getSlotDurationHours(startIdx + count);
    count++;
  }
  
  if (crossesLunch || accumulated < target - 0.001) {
    return 0;
  }
  return Math.max(1, count);
}

/** Number of consecutive timetable rows a meeting occupies (default start: enough for 1.5hr). */
export function slotsNeeded(hoursPerMeeting) {
  const target = Number(hoursPerMeeting) || 1.5;
  // Typical case: ceil hours when all slots are 1hr (1.5→2, 2→2, 2.5→3, 3→3)
  return Math.max(1, Math.ceil(target));
}

/** True if a meeting fits starting at the given TIME_SLOTS index. */
export function fitsFromTimeSlotIndex(startIdx, hoursPerMeeting) {
  return slotsNeededFromIndex(startIdx, hoursPerMeeting) > 0;
}

/** Human-readable time range for a scheduled class (e.g. "7:30 - 9:00"). */
export function getMeetingTimeLabel(startTimeSlot, hoursPerMeeting) {
  if (!startTimeSlot) return '';
  const startIdx = getTimeSlotIndex(startTimeSlot);
  if (startIdx < 0) return startTimeSlot.label || '';

  const rowCount = slotsNeededFromIndex(startIdx, hoursPerMeeting);
  const endIdx = startIdx + rowCount - 1;
  const startLabel = (startTimeSlot.label || '').split(' - ')[0]?.trim();
  const endSlot = TIME_SLOTS[endIdx];
  const endLabel = endSlot ? (endSlot.label || '').split(' - ').pop()?.trim() : '';
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startTimeSlot.label || '';
}

/** Extract department code from a section's program or name. */
export function getSectionDepartment(section) {
  if (!section) return null;
  const program = (section.program || '').toUpperCase();
  for (const dept of DEPARTMENTS) {
    if (program.includes(dept)) return dept;
  }
  const name = (section.name || '').toUpperCase();
  for (const dept of DEPARTMENTS) {
    if (name.startsWith(dept)) return dept;
  }
  return null;
}

/** Strict match: professor specialization must equal subject ID or code. */
export function professorMatchesSubject(professor, subject) {
  if (!professor || !subject) return false;
  const specs = professor.specialization || [];
  const subId = String(subject.id).toLowerCase();
  const subCode = String(subject.code || '').toLowerCase();

  return specs.some(s => {
    const spec = String(s).toLowerCase().trim();
    if (!spec) return false;
    return spec === subId || spec === subCode;
  });
}

/** Get the TIME_SLOTS index for a schedule entry's start slot. */
export function getTimeSlotIndex(timeSlot) {
  if (!timeSlot) return -1;
  return TIME_SLOTS.findIndex(ts => String(ts.id) === String(timeSlot.id));
}

/**
 * Returns all (day, timeSlotId) pairs occupied by a schedule entry,
 * accounting for multi-slot duration.
 */
export function getOccupiedSlots(schedule) {
  if (!schedule?.day || !schedule?.timeSlot?.id) return [];
  const startIdx = getTimeSlotIndex(schedule.timeSlot);
  if (startIdx < 0) return [{ day: schedule.day, timeSlotId: schedule.timeSlot.id }];

  const needed = slotsNeededFromIndex(startIdx, schedule.subject?.hoursPerMeeting);
  if (needed === 0) return [{ day: schedule.day, timeSlotId: schedule.timeSlot.id }];
  const slots = [];
  for (let i = 0; i < needed; i++) {
    const idx = startIdx + i;
    if (idx >= TIME_SLOTS.length) break;
    slots.push({ day: schedule.day, timeSlotId: TIME_SLOTS[idx].id });
  }
  return slots;
}

/** True if two schedules share any occupied slot on room, professor, or section. */
export function schedulesOverlap(a, b) {
  if (!a || !b) return false;
  const slotsA = getOccupiedSlots(a);
  const slotsB = getOccupiedSlots(b);

  for (const sa of slotsA) {
    for (const sb of slotsB) {
      if (sa.day !== sb.day || String(sa.timeSlotId) !== String(sb.timeSlotId)) continue;
      if (a.room?.id && b.room?.id && String(a.room.id) === String(b.room.id)) return true;
      if (a.professor?.id && b.professor?.id && String(a.professor.id) === String(b.professor.id)) return true;
      if (a.section?.id && b.section?.id && String(a.section.id) === String(b.section.id)) return true;
    }
  }
  return false;
}

/**
 * Check if a candidate placement conflicts with any existing schedules.
 * Returns { room, professor, section } conflict objects (first match each).
 */
export function findScheduleConflicts(candidate, existingSchedules, { excludeScheduleId = null } = {}) {
  const conflicts = { room: null, professor: null, section: null };
  const candidateEntry = {
    room: candidate.room,
    professor: candidate.professor,
    section: candidate.section || null,
    subject: candidate.subject,
    day: candidate.day,
    timeSlot: candidate.timeSlot,
  };

  for (const s of existingSchedules) {
    if (excludeScheduleId && s.id === excludeScheduleId) continue;
    if (!schedulesOverlap(candidateEntry, s)) continue;

    if (!conflicts.room && candidate.room?.id && s.room?.id && String(s.room.id) === String(candidate.room.id)) {
      conflicts.room = s;
    }
    if (!conflicts.professor && candidate.professor?.id && s.professor?.id && String(s.professor.id) === String(candidate.professor.id)) {
      conflicts.professor = s;
    }
    if (!conflicts.section && candidate.section?.id && s.section?.id && String(s.section.id) === String(candidate.section.id)) {
      conflicts.section = s;
    }
    if (conflicts.room && conflicts.professor && (!candidate.section?.id || conflicts.section)) break;
  }
  return conflicts;
}

/**
 * Filter professors eligible to teach a subject for a given section.
 * Does NOT apply workload filter (caller adds that separately).
 */
export function getEligibleProfessors(professors, subject, section) {
  if (!subject) return [];
  let pool = professors.filter(p => professorMatchesSubject(p, subject));

  const sectionId = section?.id;
  const sectionName = section?.name;
  
  pool = pool.filter(p => {
    if (p.assignedSections && p.assignedSections.length > 0) {
      return p.assignedSections.includes(sectionId) || (sectionName && p.assignedSections.includes(sectionName));
    }
    return true;
  });

  if ((sectionId || sectionName) && pool.length > 0) {
    const explicitProfs = pool.filter(p => {
      const assigned = p.assignedSections || [];
      return assigned.includes(sectionId) || (sectionName && assigned.includes(sectionName));
    });
    if (explicitProfs.length > 0) pool = explicitProfs;
  }

  return pool;
}

/**
 * Sort an eligible professor pool by AI-ranked IDs.
 * Keeps all eligible professors; AI-ranked ones come first in rank order.
 */
export function applyAIRanking(eligiblePool, aiRankedIds) {
  if (!aiRankedIds?.length || !eligiblePool?.length) return eligiblePool;

  const eligibleIds = new Set(eligiblePool.map(p => p.id));
  const ranked = aiRankedIds
    .filter(id => eligibleIds.has(id))
    .map(id => eligiblePool.find(p => p.id === id))
    .filter(Boolean);

  const rankedSet = new Set(ranked.map(p => p.id));
  const remainder = eligiblePool.filter(p => !rankedSet.has(p.id));

  return [...ranked, ...remainder];
}

/** Compute per-meeting credit load for a subject. */
export function creditPerMeeting(subject) {
  const credits = Number(subject?.credits) || 3;
  const targetDuration = Number(subject?.hoursPerMeeting) || 1.5;
  const meetings = Math.max(1, Math.ceil(credits / targetDuration));
  return credits / meetings;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CANONICAL ROOM ELIGIBILITY — Single source of truth for all room rules.
//  Used by: ScheduleGA, Dashboard validator, targeted heuristic engine.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check whether a specific professor is allowed to use a specific room,
 * given the subject and section context.
 *
 * This handles professor-specific room restrictions:
 *  - Stage rooms are reserved for the designated Stage professor(s)
 *  - BSCS-exclusive rooms reject non-BSCS faculty
 *  - Speech Lab rejects non-BAEL faculty
 *  - Room 204 rejects non-BSCS faculty (except BSOA lab override)
 *
 * @param {Object} room
 * @param {Object|null} professor
 * @param {Object|null} subject
 * @param {Object|null} section
 * @param {Object[]} allRooms - Full rooms list (used to check if Stage exists)
 * @returns {boolean}
 */
export function isProfessorAllowedInRoom(room, professor, subject, section, allRooms) {
  if (!room || !professor) return true;

  const roomName = (room.name || '').toUpperCase().replace(/\s+/g, '');
  const profDept = (professor.department || '').toUpperCase();
  const sectionDept = getSectionDepartment(section);

  // Stage constraint: only designated Stage professor(s) may use Stage, and they must use Stage
  const hasStage = (allRooms || []).some(r => r.isStage || (r.name || '').toLowerCase().includes('stage'));
  if (hasStage) {
    const isStageProf = isProfessorStageLocked(professor);
    const isStageRoom = room.isStage || (room.name || '').toLowerCase().includes('stage');
    if (isStageProf && !isStageRoom) return false;
    if (!isStageProf && isStageRoom) return false;
  }

  // BSCS-exclusive rooms: reject non-BSCS faculty
  const isBscsExclusive = room.bscsExclusive || roomName === 'NB04' || roomName === 'NB05' || roomName === 'NB06' || roomName === 'ROOM203' || roomName === '203';
  if (isBscsExclusive && profDept && profDept !== 'BSCS') return false;

  // Speech Lab: BAEL faculty only, no GE/PE/NSTP subjects
  const isSpeechLab = room.baelOnly || roomName.includes('SPEECH');
  if (isSpeechLab) {
    if (profDept !== 'BAEL') return false;
    if (subject) {
      const code = (subject.code || '').toUpperCase();
      if (code.startsWith('GE') || code.startsWith('PE') || code.startsWith('NSTP')) return false;
    }
  }

  // Room 204: BSCS faculty, or BSOA faculty for lab subjects
  const isRoom204 = room.restrictedAccess || roomName === 'ROOM204' || roomName === '204';
  if (isRoom204) {
    const isBSCS = (!sectionDept || sectionDept === 'BSCS') && (!profDept || profDept === 'BSCS');
    const isBSOALab = sectionDept === 'BSOA' && subject?.requiredLab && (!profDept || profDept === 'BSOA');
    if (!isBSCS && !isBSOALab) return false;
  }

  return true;
}

/**
 * Determine if a professor is "Stage-locked" (must always use the Stage room).
 * Currently checks professor ID 'P04' or name containing 'ballera'.
 *
 * Centralised here so the hardcoded identity lives in exactly one place.
 */
export function isProfessorStageLocked(professor) {
  if (!professor) return false;
  return professor.stageLocked === true || professor.id === 'P04' || (professor.name || '').toLowerCase().includes('ballera');
}

/**
 * Check whether a room is allowed for a given subject + section combination,
 * independent of which professor is assigned.
 *
 * This handles section-level room restrictions:
 *  - PE subjects must go to Gym/Stage rooms
 *  - Lab subjects prefer rooms with computers
 *  - BSCS-exclusive rooms reject non-BSCS sections
 *  - Speech Lab rejects non-BAEL sections and GE/PE/NSTP subjects
 *  - Room 204 rejects non-BSCS sections (except BSOA labs)
 *
 * @param {Object} room
 * @param {Object|null} subject
 * @param {Object|null} section
 * @returns {boolean}
 */
export function isRoomAllowedFor(room, subject, section) {
  if (!room) return false;

  const roomName = (room.name || '').toUpperCase().replace(/\s+/g, '');
  const sectionDept = getSectionDepartment(section);

  // BSCS-exclusive rooms: reject non-BSCS sections
  const isBscsExclusive = room.bscsExclusive || roomName === 'NB04' || roomName === 'NB05' || roomName === 'NB06' || roomName === 'ROOM203' || roomName === '203';
  if (isBscsExclusive && sectionDept !== 'BSCS') return false;

  // Speech Lab: BAEL sections only, no GE/PE/NSTP subjects
  const isSpeechLab = room.baelOnly || roomName.includes('SPEECH');
  if (isSpeechLab) {
    if (sectionDept !== 'BAEL') return false;
    if (subject) {
      const code = (subject.code || '').toUpperCase();
      if (code.startsWith('GE') || code.startsWith('PE') || code.startsWith('NSTP')) return false;
    }
  }

  // Room 204: BSCS sections, or BSOA sections for lab subjects
  const isRoom204 = room.restrictedAccess || roomName === 'ROOM204' || roomName === '204';
  if (isRoom204) {
    const isBSCS = !sectionDept || sectionDept === 'BSCS';
    const isBSOALab = sectionDept === 'BSOA' && subject?.requiredLab;
    if (!isBSCS && !isBSOALab) return false;
  }

  return true;
}

/**
 * Build tiered eligible room pools for an assignment.
 *
 * - PE subjects → Gym/Stage rooms only
 * - Lab subjects → filter to rooms with computers first
 * - Tier 1: Rooms owned by the section's department
 * - Tier 2: SHARED / unassigned-building rooms
 * - Tier 3: Other department rooms (overflow)
 *
 * @param {Object[]} rooms - All available rooms
 * @param {Object} subject
 * @param {Object|null} section
 * @returns {{ tier1: Object[], tier2: Object[], tier3: Object[], flat: Object[] }}
 */
export function getEligibleRoomsTiered(rooms, subject, section) {
  const sectionDept = getSectionDepartment(section);
  const isPE = subject && (subject.code || '').toUpperCase().startsWith('PE');
  const isGymOrStage = (r) => {
    const name = (r.name || '').toLowerCase();
    return name.includes('gym') || name.includes('stage');
  };

  // PE subjects must go to gym or stage
  if (isPE) {
    const gyms = rooms.filter(isGymOrStage);
    if (gyms.length > 0) return { tier1: gyms, tier2: [], tier3: [], flat: gyms };
  }

  let pool = rooms;
  // Lab filter first
  if (subject?.requiredLab) {
    const labs = rooms.filter(r => r.hasComputers);
    if (labs.length > 0) pool = labs;
  }

  const tier1 = []; // Department-owned rooms matching this section
  const tier2 = []; // SHARED rooms
  const tier3 = []; // Other department rooms (overflow)

  for (const r of pool) {
    // Apply section-level room restrictions
    if (!isRoomAllowedFor(r, subject, section)) continue;

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
}
