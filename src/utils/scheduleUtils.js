/**
 * Shared scheduling utilities used by GA, Dashboard validation, AI, and AutoScheduler.
 */

import { TIME_SLOTS, getSlotDurationHours } from '../config/constants';

const DEPARTMENTS = ['BSCS', 'BAEL', 'BSOA', 'BSFT'];

/**
 * How many consecutive TIME_SLOTS rows a meeting occupies from a start index.
 * Accounts for the 30-minute slot before lunch (id 5).
 * Returns 0 if the meeting does not fit from that start index.
 */
export function slotsNeededFromIndex(startIdx, hoursPerMeeting) {
  const target = Number(hoursPerMeeting) || 1.5;
  let accumulated = 0;
  let count = 0;
  while (startIdx + count < TIME_SLOTS.length && accumulated < target - 0.001) {
    accumulated += getSlotDurationHours(startIdx + count);
    count++;
  }
  return accumulated >= target - 0.001 ? Math.max(1, count) : 0;
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
  pool = pool.filter(p => {
    if (p.assignedSections && p.assignedSections.length > 0) {
      return p.assignedSections.includes(sectionId);
    }
    return true;
  });

  if (sectionId && pool.length > 0) {
    const explicitProfs = pool.filter(p => (p.assignedSections || []).includes(sectionId));
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
