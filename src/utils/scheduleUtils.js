/**
 * Shared scheduling utilities used by GA, Dashboard validation, AI, and AutoScheduler.
 */

import { TIME_SLOTS, FOUR_DAY_TIME_SLOTS, getSlotDurationHours, getScheduleConfig, DAYS, FOUR_DAY_DAYS, PREFERRED_PAIRS_STANDARD, PREFERRED_PAIRS_FOUR_DAY } from '../config/constants.js';

const DEPARTMENTS = ['BSCS', 'BAEL', 'BSOA', 'BSFT'];

/**
 * Resolve which TIME_SLOTS array to use based on schedule mode.
 * @param {'standard'|'fourDay'} [scheduleMode]
 */
function resolveSlots(scheduleMode) {
  return scheduleMode === 'fourDay' ? FOUR_DAY_TIME_SLOTS : TIME_SLOTS;
}

/**
 * How many consecutive TIME_SLOTS rows a meeting occupies from a start index.
 * Returns 0 if the meeting does not fit from that start index.
 *
 * @param {number} startIdx - index in the active slots array
 * @param {number} hoursPerMeeting
 * @param {'standard'|'fourDay'} [scheduleMode] - defaults to standard
 */
export function slotsNeededFromIndex(startIdx, hoursPerMeeting, scheduleMode) {
  const slots = resolveSlots(scheduleMode);
  if (startIdx < 0 || startIdx >= slots.length) return 0;

  const config = getScheduleConfig(scheduleMode);

  // In standard mode, block the 7:00 AM slot (id 1) from being a start slot.
  // In 4-day mode, 7:00 AM is allowed.
  if (!config.allowSevenAm && slots[startIdx].id === 1) return 0;

  const target = Number(hoursPerMeeting) || 1.5;
  let accumulated = 0;
  let count = 0;
  while (startIdx + count < slots.length && accumulated < target - 0.001) {
    accumulated += getSlotDurationHours(startIdx + count, scheduleMode);
    count++;
  }

  if (accumulated < target - 0.001) {
    return 0;
  }
  return Math.max(1, count);
}

/** @deprecated Use slotsNeededFromIndex() instead - this function assumes 1hr slots but the timetable uses 30-min slots. */
export function slotsNeeded(hoursPerMeeting) {
  console.warn('[DEPRECATED] slotsNeeded() assumes 1hr slots. Use slotsNeededFromIndex() for accurate 30-min slot counting.');
  const target = Number(hoursPerMeeting) || 1.5;
  return Math.max(1, Math.ceil(target));
}

/** True if a meeting fits starting at the given TIME_SLOTS index. */
export function fitsFromTimeSlotIndex(startIdx, hoursPerMeeting, scheduleMode) {
  return slotsNeededFromIndex(startIdx, hoursPerMeeting, scheduleMode) > 0;
}

/**
 * Human-readable time range for a scheduled class (e.g. "7:30 - 9:00").
 * @param {Object} startTimeSlot
 * @param {number} hoursPerMeeting
 * @param {'standard'|'fourDay'} [scheduleMode]
 */
export function getMeetingTimeLabel(startTimeSlot, hoursPerMeeting, scheduleMode) {
  if (!startTimeSlot) return '';
  if (startTimeSlot.customLabel) return startTimeSlot.customLabel;
  const slots = resolveSlots(scheduleMode);
  const startIdx = getTimeSlotIndex(startTimeSlot, scheduleMode);
  if (startIdx < 0) return startTimeSlot.label || '';

  const rowCount = slotsNeededFromIndex(startIdx, hoursPerMeeting, scheduleMode);
  const endIdx = startIdx + rowCount - 1;
  const startLabel = (startTimeSlot.label || '').split(' - ')[0]?.trim();
  const endSlot = slots[endIdx];
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

export function professorMatchesSubject(professor, subject) {
  if (!professor || !subject) return false;
  const specs = professor.specialization || [];
  const subId = String(subject.id || '').toLowerCase().trim();
  const subCode = String(subject.code || '').toLowerCase().trim();
  const subName = String(subject.name || '').toLowerCase().trim();

  return specs.some(s => {
    const spec = String(s || '').toLowerCase().trim();
    if (!spec) return false;
    return (subId && spec === subId) || (subCode && spec === subCode) || (subName && spec === subName);
  });
}

/**
 * Get the index of a time slot in the active slots array.
 * @param {Object} timeSlot
 * @param {'standard'|'fourDay'} [scheduleMode]
 */
export function getTimeSlotIndex(timeSlot, scheduleMode) {
  if (!timeSlot) return -1;
  const slots = resolveSlots(scheduleMode);
  return slots.findIndex(ts => String(ts.id) === String(timeSlot.id));
}

/**
 * Returns all (day, timeSlotId) pairs occupied by a schedule entry,
 * accounting for multi-slot duration.
 * @param {Object} schedule
 * @param {'standard'|'fourDay'} [scheduleMode]
 */
export function getOccupiedSlots(schedule, scheduleMode) {
  if (!schedule?.day || !schedule?.timeSlot?.id) return [];
  const slots = resolveSlots(scheduleMode);
  const startIdx = getTimeSlotIndex(schedule.timeSlot, scheduleMode);
  if (startIdx < 0) return [{ day: schedule.day, timeSlotId: schedule.timeSlot.id }];

  const needed = slotsNeededFromIndex(startIdx, schedule.subject?.hoursPerMeeting, scheduleMode);
  if (needed === 0) return [{ day: schedule.day, timeSlotId: schedule.timeSlot.id }];
  const slotList = [];
  for (let i = 0; i < needed; i++) {
    const idx = startIdx + i;
    if (idx >= slots.length) break;
    slotList.push({ day: schedule.day, timeSlotId: slots[idx].id });
  }
  return slotList;
}

export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return null;
  let [_, hours, mins, period] = match;
  hours = parseInt(hours, 10);
  mins = parseInt(mins, 10);
  if (period) {
    if (period.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
  } else {
    if (hours >= 1 && hours <= 6) hours += 12; // Assume 1-6 is PM
  }
  return hours * 60 + mins;
}

export function entitiesMatch(a, b) {
  if (!a || !b) return false;

  const getKeys = (item) => {
    const keys = new Set();
    if (typeof item === 'string' || typeof item === 'number') {
      const s = String(item).trim();
      if (s) keys.add(s.toLowerCase());
    } else if (typeof item === 'object' && item) {
      if (item.id && String(item.id).trim()) keys.add(String(item.id).trim().toLowerCase());
      if (item.name && String(item.name).trim()) keys.add(String(item.name).trim().toLowerCase());
      if (item.code && String(item.code).trim()) keys.add(String(item.code).trim().toLowerCase());
    }
    return keys;
  };

  const keysA = getKeys(a);
  const keysB = getKeys(b);

  if (keysA.size === 0 || keysB.size === 0) return false;

  for (const k of keysA) {
    if (keysB.has(k)) return true;
  }
  return false;
}

export function getScheduleTimeRange(schedule, scheduleMode) {
  if (!schedule) return { start: 0, end: 0 };

  // 0. Direct string timeSlot support
  if (typeof schedule.timeSlot === 'string') {
    const parts = schedule.timeSlot.split('-');
    if (parts.length === 2) {
      const start = parseTimeToMinutes(parts[0].trim());
      const end = parseTimeToMinutes(parts[1].trim());
      if (start !== null && end !== null && start < end) return { start, end };
    }
    const start = parseTimeToMinutes(schedule.timeSlot);
    if (start !== null) {
      const duration = (schedule.subject?.hoursPerMeeting || 1.5) * 60;
      return { start, end: start + duration };
    }
  }

  // 1. Custom label takes highest precedence
  if (schedule.timeSlot?.customLabel) {
    const customParts = schedule.timeSlot.customLabel.split('-');
    if (customParts.length === 2) {
      const start = parseTimeToMinutes(customParts[0].trim());
      const end = parseTimeToMinutes(customParts[1].trim());
      if (start !== null && end !== null && start < end) return { start, end };
    }
    const start = parseTimeToMinutes(schedule.timeSlot.customLabel);
    if (start !== null) {
      const duration = (schedule.subject?.hoursPerMeeting || 1.5) * 60;
      return { start, end: start + duration };
    }
  }

  // 2. Try standard label resolution
  const label = getMeetingTimeLabel(schedule.timeSlot, schedule.subject?.hoursPerMeeting, scheduleMode);
  const parts = (label || '').split('-');
  if (parts.length === 2) {
    const start = parseTimeToMinutes(parts[0].trim());
    const end = parseTimeToMinutes(parts[1].trim());
    if (start !== null && end !== null && start < end) return { start, end };
  }

  // 3. Fallback to raw timeSlot.time
  const timeParts = (schedule.timeSlot?.time || '').split('-');
  if (timeParts.length === 2) {
    const start = parseTimeToMinutes(timeParts[0].trim());
    let end = parseTimeToMinutes(timeParts[1].trim());
    if (start !== null && end !== null && start < end) {
      if (schedule.subject?.hoursPerMeeting) {
        end = Math.max(end, start + schedule.subject.hoursPerMeeting * 60);
      }
      return { start, end };
    }
  }

  // 4. Fallback to raw timeSlot.label
  const labelParts = (schedule.timeSlot?.label || '').split('-');
  if (labelParts.length === 2) {
    const start = parseTimeToMinutes(labelParts[0].trim());
    let end = parseTimeToMinutes(labelParts[1].trim());
    if (start !== null && end !== null && start < end) {
      if (schedule.subject?.hoursPerMeeting) {
        end = Math.max(end, start + schedule.subject.hoursPerMeeting * 60);
      }
      return { start, end };
    }
  }

  return { start: 0, end: 0 };
}

/**
 * Normalize any day representation (e.g. 'Mon', 'mon', 'Monday') to canonical full day name.
 */
export function normalizeDay(day) {
  if (!day) return '';
  const d = String(day).trim();
  const lower = d.toLowerCase();
  if (lower.startsWith('mon')) return 'Monday';
  if (lower.startsWith('tue')) return 'Tuesday';
  if (lower.startsWith('wed')) return 'Wednesday';
  if (lower.startsWith('thu')) return 'Thursday';
  if (lower.startsWith('fri')) return 'Friday';
  if (lower.startsWith('sat')) return 'Saturday';
  if (lower.startsWith('sun')) return 'Sunday';
  return d;
}

/** True if two schedules share any occupied time range on room, professor, or section. */
export function schedulesOverlap(a, b, scheduleMode) {
  if (!a || !b) return false;

  const daysA = Array.isArray(a.day) ? a.day.map(normalizeDay).filter(Boolean) : (a.day ? [normalizeDay(a.day)] : []);
  const daysB = Array.isArray(b.day) ? b.day.map(normalizeDay).filter(Boolean) : (b.day ? [normalizeDay(b.day)] : []);
  const sharesDay = daysA.some(dA => daysB.includes(dA));
  if (!sharesDay) return false;

  const entityOverlap = entitiesMatch(a.room, b.room) ||
                        entitiesMatch(a.professor, b.professor) ||
                        entitiesMatch(a.section, b.section);

  if (!entityOverlap) return false;

  const rangeA = getScheduleTimeRange(a, scheduleMode);
  const rangeB = getScheduleTimeRange(b, scheduleMode);

  if (rangeA.start === 0 && rangeA.end === 0) return false;
  if (rangeB.start === 0 && rangeB.end === 0) return false;

  if (rangeA.start < rangeB.end && rangeA.end > rangeB.start) {
    return true;
  }

  return false;
}

/**
 * Check if a candidate placement conflicts with any existing schedules.
 * Returns { room, professor, section } conflict objects (first match each).
 */
export function findScheduleConflicts(candidate, existingSchedules, { excludeScheduleId = null, scheduleMode = 'standard' } = {}) {
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
    if (!schedulesOverlap(candidateEntry, s, scheduleMode)) continue;

    if (!conflicts.room && entitiesMatch(candidate.room, s.room)) {
      conflicts.room = s;
    }
    if (!conflicts.professor && entitiesMatch(candidate.professor, s.professor)) {
      conflicts.professor = s;
    }
    if (!conflicts.section && entitiesMatch(candidate.section, s.section)) {
      conflicts.section = s;
    }
    if (conflicts.room && conflicts.professor && (!candidate.section || conflicts.section)) break;
  }
  return conflicts;
}

/**
 * Filter professors eligible to teach a subject for a given section.
 * Does NOT apply workload filter (caller adds that separately).
 */
export function getEligibleProfessors(professors, subject, section) {
  if (!subject) return [];
  const sectionId = section?.id;
  const sectionName = section?.name;
  const subCode = subject.code || subject.id;

  // 1. Highest Priority: Specific instructor assigned for this subject in this section
  if (section?.subjectInstructors) {
    const assignedProfId = section.subjectInstructors[subCode] || section.subjectInstructors[subject.id];
    if (assignedProfId) {
      const explicitProf = professors.find(p => p.id === assignedProfId);
      if (explicitProf) return [explicitProf];
    }
  }

  // 2. Second Priority: Professor whose sectionSubjectMap explicitly includes this subject for this section
  if (sectionId || sectionName) {
    const mappedProf = professors.find(p => {
      const hasSec = (p.assignedSections || []).includes(sectionId) || (sectionName && (p.assignedSections || []).includes(sectionName));
      if (!hasSec) return false;
      const subs = (p.sectionSubjectMap && (p.sectionSubjectMap[sectionId] || (sectionName && p.sectionSubjectMap[sectionName]))) || [];
      return subs.some(s => s === subCode || s === subject.id || s === subject.name);
    });
    if (mappedProf) return [mappedProf];
  }

  let pool = professors.filter(p => professorMatchesSubject(p, subject));

  if (sectionId || sectionName) {
    pool = pool.filter(p => {
      if (p.assignedSections && p.assignedSections.length > 0) {
        return p.assignedSections.includes(sectionId) || (sectionName && p.assignedSections.includes(sectionName));
      }
      return true;
    });

    if (pool.length > 0) {
      const explicitProfs = pool.filter(p => {
        const assigned = p.assignedSections || [];
        return assigned.includes(sectionId) || (sectionName && assigned.includes(sectionName));
      });
      if (explicitProfs.length > 0) pool = explicitProfs;
    }
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

// --------------------------------------------------------------------------
//  Room eligibility rules (used by validator and scheduling engine)
// --------------------------------------------------------------------------

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

  // BSCS-exclusive rooms: reject non-BSCS faculty, UNLESS subject requires lab
  const isBscsExclusive = room.bscsExclusive || roomName === 'NB04' || roomName === 'NB05' || roomName === 'NB06' || roomName === 'ROOM203' || roomName === '203';
  if (isBscsExclusive && profDept && profDept !== 'BSCS') {
    if (!subject?.requiredLab) return false;
  }

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
 * Uses the `stageLocked` flag from the professor's data.
 *
 * To mark a professor as stage-locked, set `stageLocked: true` in their Firestore document.
 */
export function isProfessorStageLocked(professor) {
  if (!professor) return false;
  return professor.stageLocked === true;
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

  // BSCS-exclusive rooms: reject non-BSCS sections, UNLESS subject requires lab
  const isBscsExclusive = room.bscsExclusive || roomName === 'NB04' || roomName === 'NB05' || roomName === 'NB06' || roomName === 'ROOM203' || roomName === '203';
  if (isBscsExclusive && sectionDept !== 'BSCS') {
    if (!subject?.requiredLab) return false;
  }

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
  } else if (subject?.isFoodLab) {
    const foodLabs = rooms.filter(r => r.isFoodLab);
    if (foodLabs.length > 0) pool = foodLabs;
  }

  const tier1 = []; // Department-owned rooms matching this section
  const tier2 = []; // SHARED rooms
  const tier3 = []; // Other department rooms (overflow)

  const isGEOrMinor = subject && ((subject.code || '').toUpperCase().startsWith('GE') || subject.category === 'Minor');

  for (const r of pool) {
    // Apply section-level room restrictions
    if (!isRoomAllowedFor(r, subject, section)) continue;

    const roomDept = (r.department || 'SHARED').toUpperCase();
    const roomBldg = (r.building || 'Unassigned').toUpperCase();
    const roomName = (r.name || '').toUpperCase();
    const isShared = roomDept === 'SHARED' || roomBldg === 'UNASSIGNED' || roomBldg === 'GENERAL BUILDING' || roomBldg === 'GYMNASIUM' || roomBldg === 'GS' || roomName.startsWith('GS');

    if (isGEOrMinor) {
      if (isShared) {
        tier1.push(r);
      } else if (sectionDept && roomDept === sectionDept) {
        tier2.push(r);
      } else {
        tier3.push(r);
      }
    } else {
      if (isShared) {
        tier2.push(r);
      } else if (sectionDept && roomDept === sectionDept) {
        tier1.push(r);
      } else {
        tier3.push(r);
      }
    }
  }

  const sortLabRoomsLast = (roomArray) => {
    if (subject?.requiredLab || subject?.isFoodLab) return roomArray;
    return [...roomArray].sort((a, b) => {
      const aIsLab = (a.hasComputers || a.isFoodLab) ? 1 : 0;
      const bIsLab = (b.hasComputers || b.isFoodLab) ? 1 : 0;
      return aIsLab - bIsLab;
    });
  };

  return {
    tier1: sortLabRoomsLast(tier1),
    tier2: sortLabRoomsLast(tier2),
    tier3: sortLabRoomsLast(tier3),
    flat: sortLabRoomsLast([...tier1, ...tier2, ...tier3])
  };
}

/**
 * Find conflict-free alternative slots when a candidate placement has conflicts.
 */
/**
 * Standard 2-day pairs for academic schedules (e.g., Mon/Thu, Tue/Fri).
 */
export function getStandardDayPairs(scheduleMode = 'standard') {
  if (scheduleMode === 'fourDay') {
    return [
      ['Monday', 'Wednesday'],
      ['Tuesday', 'Thursday']
    ];
  }
  return [
    ['Monday', 'Thursday'],
    ['Tuesday', 'Friday']
  ];
}

/**
 * Resolve any day or array of days to its canonical 2-day academic pair.
 */
export function resolveToDayPair(daysInput, scheduleMode = 'standard') {
  const pairs = getStandardDayPairs(scheduleMode);
  const rawList = Array.isArray(daysInput)
    ? daysInput.map(normalizeDay).filter(Boolean)
    : (daysInput ? [normalizeDay(daysInput)] : []);

  if (rawList.length === 0) {
    return pairs[0];
  }
  for (const pair of pairs) {
    if (rawList.some(d => pair.includes(d))) {
      return pair;
    }
  }
  if (rawList.length >= 2) return rawList.slice(0, 2);
  return [rawList[0], pairs[0][1]];
}

/**
 * Find conflict-free alternative slots when a candidate placement has conflicts.
 * Always suggests and validates 2-day paired schedules.
 */
export function findAlternativeSlots(candidate, activeSchedules, rooms, eligibleTimeSlots, scheduleMode = 'standard') {
  if (!candidate?.subject) return null;
  const dayPairs = getStandardDayPairs(scheduleMode);
  const alternatives = [];

  const rawCandidateDays = candidate.days || (candidate.day ? (Array.isArray(candidate.day) ? candidate.day : [candidate.day]) : []);
  const candidateDays = rawCandidateDays.length > 0
    ? rawCandidateDays.map(normalizeDay).filter(Boolean)
    : resolveToDayPair(candidate.day, scheduleMode);
  const dayLabel = candidateDays.map(d => d.slice(0, 3)).join(' / ');

  // 1. Try alternative rooms across the candidate days & timeSlot
  if (candidate.timeSlot) {
    for (const r of (rooms || [])) {
      if (r.id === candidate.room?.id) continue;
      if (!isRoomAllowedFor(r, candidate.subject, candidate.section)) continue;
      if (candidate.professor && !isProfessorAllowedInRoom(r, candidate.professor, candidate.subject, candidate.section, rooms)) continue;

      let allDaysClean = true;
      for (const d of candidateDays) {
        const testCand = { ...candidate, day: d, room: r };
        const conf = findScheduleConflicts(testCand, activeSchedules, { scheduleMode });
        if (conf.room || conf.professor || conf.section) {
          allDaysClean = false;
          break;
        }
      }

      if (allDaysClean) {
        const timeLabel = getMeetingTimeLabel(candidate.timeSlot, candidate.subject?.hoursPerMeeting, scheduleMode) || candidate.timeSlot.label;
        alternatives.push({
          type: 'room',
          title: `Switch Room to ${r.name}`,
          room: r,
          days: candidateDays,
          day: candidateDays,
          timeSlot: { ...candidate.timeSlot, label: timeLabel },
          description: `Room ${r.name} is available on ${dayLabel} at ${timeLabel || candidate.timeSlot.time || ''}.`
        });
        if (alternatives.length >= 2) break;
      }
    }
  }

  // 2. Try alternative time slots on the SAME candidate days with the same room
  if (candidate.room) {
    for (const ts of (eligibleTimeSlots || [])) {
      if (String(ts.id) === String(candidate.timeSlot?.id)) continue;

      let allDaysClean = true;
      for (const d of candidateDays) {
        const testCand = { ...candidate, day: d, timeSlot: ts };
        const conf = findScheduleConflicts(testCand, activeSchedules, { scheduleMode });
        if (conf.room || conf.professor || conf.section) {
          allDaysClean = false;
          break;
        }
      }

      if (allDaysClean) {
        const label = getMeetingTimeLabel(ts, candidate.subject.hoursPerMeeting, scheduleMode) || ts.label;
        alternatives.push({
          type: 'timeSlot',
          title: `Switch Time to ${label}`,
          room: candidate.room,
          days: candidateDays,
          day: candidateDays,
          timeSlot: { ...ts, label },
          description: `${candidate.room.name} and Prof. ${candidate.professor?.name || ''} are free on ${dayLabel} at ${label}.`
        });
        if (alternatives.length >= 3) break;
      }
    }
  }

  // 3. Try alternative Day Options (single days for 1-day classes, day pairs for multi-day classes)
  const isSingleDay = candidateDays.length === 1;
  const dayOptionsToTry = isSingleDay
    ? (scheduleMode === 'fourDay' ? FOUR_DAY_DAYS : DAYS).map(d => [d])
    : dayPairs;

  for (const optionDays of dayOptionsToTry) {
    const optionNorm = optionDays.map(normalizeDay);
    const isCurrent = candidateDays.length === optionNorm.length && candidateDays.every(d => optionNorm.includes(d));
    if (isCurrent) continue;
    if (!candidate.room || !candidate.timeSlot) continue;

    let allDaysClean = true;
    for (const d of optionNorm) {
      const testCand = { ...candidate, day: d };
      const conf = findScheduleConflicts(testCand, activeSchedules, { scheduleMode });
      if (conf.room || conf.professor || conf.section) {
        allDaysClean = false;
        break;
      }
    }

    if (allDaysClean) {
      const label = getMeetingTimeLabel(candidate.timeSlot, candidate.subject.hoursPerMeeting, scheduleMode) || candidate.timeSlot.label;
      const optLabel = optionNorm.map(d => d.slice(0, 3)).join(' / ');
      alternatives.push({
        type: 'day',
        title: `Switch Day${optionNorm.length > 1 ? 's' : ''} to ${optLabel}`,
        room: candidate.room,
        days: optionNorm,
        day: optionNorm,
        timeSlot: { ...candidate.timeSlot, label },
        description: `Everything is free on ${optLabel} at ${label}.`
      });
      if (alternatives.length >= 3) break;
    }
  }

  return alternatives.slice(0, 2);
}

/**
 * Compute real-time professor workloads.
 */
export function getProfessorWorkloadMap(professors, activeSchedules = []) {
  const loadMap = {};
  for (const p of (professors || [])) {
    const max = Number(p.maxUnits) || Number(p.maxHours) || 15;
    loadMap[p.id] = { usedUnits: 0, maxUnits: max, loadRatio: 0, count: 0 };
  }

  for (const s of (activeSchedules || [])) {
    if (s.professor?.id && loadMap[s.professor.id]) {
      const units = creditPerMeeting(s.subject);
      loadMap[s.professor.id].usedUnits += units;
      loadMap[s.professor.id].count += 1;
    }
  }

  for (const profId in loadMap) {
    const item = loadMap[profId];
    item.usedUnits = Math.round(item.usedUnits * 10) / 10;
    item.loadRatio = item.maxUnits > 0 ? item.usedUnits / item.maxUnits : 1;
    item.isNearCapacity = item.usedUnits >= item.maxUnits;
  }

  return loadMap;
}

/**
 * Generate smart recommendations for conflict-free manual schedule placement.
 * Always suggests conflict-free 2-day pairs (e.g. Mon/Thu, Tue/Fri).
 */
export function getSmartScheduleRecommendations({
  formData = {},
  subjects = [],
  sections = [],
  professors = [],
  rooms = [],
  activeSchedules = [],
  activeSemester = '',
  scheduleMode = 'standard',
  limit = 1
}) {
  const activeSemesterSubjects = subjects.filter(s => !s.semester || s.semester === 'Both' || s.semester === activeSemester);
  const workloadMap = getProfessorWorkloadMap(professors, activeSchedules);
  const slots = resolveSlots(scheduleMode);

  // Target subject candidate list
  let candidateSubjects = [];
  if (formData.subject) {
    const found = subjects.find(s => s.id === formData.subject);
    if (found) candidateSubjects = [found];
  } else if (formData.professor) {
    const prof = professors.find(p => p.id === formData.professor);
    candidateSubjects = activeSemesterSubjects.filter(s => prof && professorMatchesSubject(prof, s));
  } else if (formData.section) {
    const sec = sections.find(s => s.id === formData.section);
    if (sec) {
      const secSubs = sec.subjects || [];
      candidateSubjects = activeSemesterSubjects.filter(s =>
        secSubs.includes(s.id) || (s.code && secSubs.includes(s.code)) || (s.name && secSubs.includes(s.name))
      );
    }
  }

  if (candidateSubjects.length === 0) {
    return [];
  }

  const recommendations = [];

  for (const subject of candidateSubjects) {
    const targetDuration = Number(subject?.hoursPerMeeting) || 1.5;
    const credits = Number(subject?.credits) || 3;
    const meetingsNeeded = Math.max(1, Math.round(credits / targetDuration));

    let subjectDayOptions = [];
    if (formData.day && (Array.isArray(formData.day) ? formData.day.length > 0 : !!formData.day)) {
      const userDays = (Array.isArray(formData.day) ? formData.day : [formData.day]).map(normalizeDay).filter(Boolean);
      if (userDays.length > 0) {
        subjectDayOptions = [userDays];
      }
    }

    if (subjectDayOptions.length === 0) {
      if (meetingsNeeded === 1) {
        subjectDayOptions = (scheduleMode === 'fourDay' ? FOUR_DAY_DAYS : DAYS).map(d => [d]);
      } else {
        subjectDayOptions = scheduleMode === 'fourDay' ? PREFERRED_PAIRS_FOUR_DAY : PREFERRED_PAIRS_STANDARD;
      }
    }

    // 1. Candidate sections (prioritize sections that have not yet been scheduled for this subject)
    let candSections = [];
    if (formData.section) {
      const foundSec = sections.find(s => s.id === formData.section);
      if (foundSec) candSections = [foundSec];
    } else {
      const unscheduledSections = (sections || []).filter(sec => {
        const secSubs = sec.subjects || [];
        const needsSubject = secSubs.includes(subject.id) || (subject.code && secSubs.includes(subject.code)) || (subject.name && secSubs.includes(subject.name));
        if (!needsSubject) return false;
        const alreadyScheduled = (activeSchedules || []).some(s =>
          entitiesMatch(s.section, sec) && entitiesMatch(s.subject, subject)
        );
        return !alreadyScheduled;
      });

      candSections = unscheduledSections.length > 0
        ? unscheduledSections
        : (sections || []).filter(sec => {
            const secSubs = sec.subjects || [];
            return secSubs.includes(subject.id) || (subject.code && secSubs.includes(subject.code)) || (subject.name && secSubs.includes(subject.name));
          });
    }
    if (candSections.length === 0) continue;

    for (const section of candSections) {
      // 2. Candidate professors
      let candProfs = [];
      if (formData.professor) {
        const foundProf = professors.find(p => p.id === formData.professor);
        if (foundProf && professorMatchesSubject(foundProf, subject)) candProfs = [foundProf];
      } else {
        candProfs = getEligibleProfessors(professors, subject, section);
      }
      if (candProfs.length === 0) continue;

      // Sort professors by lowest workload
      candProfs.sort((a, b) => {
        const loadA = workloadMap[a.id]?.loadRatio ?? 0;
        const loadB = workloadMap[b.id]?.loadRatio ?? 0;
        return loadA - loadB;
      });

      // 3. Candidate rooms
      let candRooms = [];
      if (formData.room) {
        const foundRoom = rooms.find(r => r.id === formData.room);
        if (foundRoom && isRoomAllowedFor(foundRoom, subject, section)) candRooms = [foundRoom];
      } else {
        const tiered = getEligibleRoomsTiered(rooms, subject, section);
        candRooms = [...tiered.tier1, ...tiered.tier2, ...tiered.tier3];
      }
      if (candRooms.length === 0) continue;

      // 4. Candidate Time Slots
      const eligibleSlots = slots.filter((slot, idx) => slotsNeededFromIndex(idx, subject.hoursPerMeeting, scheduleMode) > 0);

      // Explore combinations
      for (const professor of candProfs.slice(0, 3)) {
        const profLoad = workloadMap[professor.id] || { usedUnits: 0, maxUnits: 15 };
        if (profLoad.isNearCapacity && candProfs.length > 1) continue;

        for (const room of candRooms.slice(0, 5)) {
          if (!isProfessorAllowedInRoom(room, professor, subject, section, rooms)) continue;
          if (subject.requiredLab && !room.hasComputers) continue;
          if (subject.isFoodLab && !room.isFoodLab) continue;

          for (const pair of subjectDayOptions) {
            const pairNorm = pair.map(normalizeDay);

            for (const timeSlot of eligibleSlots) {
              // Physical Education (PE) subjects cannot be scheduled in the first period (7:30 AM)
              if (subject?.code?.toUpperCase().startsWith('PE') && String(timeSlot?.id) === '2') {
                continue;
              }
              // Verify ALL days in the pair are 100% free of conflicts
              let isPairConflictFree = true;
              for (const day of pairNorm) {
                const candidate = {
                  subject,
                  section,
                  professor,
                  room,
                  day,
                  timeSlot,
                };
                const conflicts = findScheduleConflicts(candidate, activeSchedules, { scheduleMode });
                if (conflicts.room || conflicts.professor || conflicts.section) {
                  isPairConflictFree = false;
                  break;
                }
              }

              if (!isPairConflictFree) continue;

              // Calculate recommendation score
              let score = 100;
              score += (1 - (profLoad.loadRatio || 0)) * 40;
              const sectionDept = getSectionDepartment(section);
              const roomDept = (room.department || '').toUpperCase();
              if (sectionDept && roomDept === sectionDept) score += 25;
              if (subject.requiredLab && room.hasComputers) score += 20;
              if (subject.isFoodLab && room.isFoodLab) score += 20;
              const slotIdx = getTimeSlotIndex(timeSlot, scheduleMode);
              if (slotIdx >= 1 && slotIdx <= 6) score += 10;

              const timeLabel = getMeetingTimeLabel(timeSlot, subject.hoursPerMeeting, scheduleMode) || timeSlot.label;
              const dayLabel = pairNorm.map(d => d.slice(0, 3)).join(' / ');

              let badge = '✨ Best Match';
              if (profLoad.usedUnits === 0) badge = '🌟 Lowest Load';
              else if (subject.requiredLab) badge = '💻 Dedicated Lab';
              else if (sectionDept && roomDept === sectionDept) badge = '🏛️ Dept Room';

              recommendations.push({
                subject,
                section,
                professor,
                room,
                days: pairNorm,
                day: pairNorm,
                dayLabel,
                timeSlot: { ...timeSlot, label: timeLabel },
                score,
                badge,
                reason: `Conflict-free on ${dayLabel} in ${room.name} with Prof. ${professor.name}.`
              });

              if (recommendations.length >= limit * 3) break;
            }
            if (recommendations.length >= limit * 3) break;
          }
          if (recommendations.length >= limit * 3) break;
        }
        if (recommendations.length >= limit * 3) break;
      }
      if (recommendations.length >= limit * 3) break;
    }
    if (recommendations.length >= limit * 3) break;
  }

  recommendations.sort((a, b) => b.score - a.score);
  return recommendations.slice(0, limit);
}



