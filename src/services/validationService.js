/**
 * validationService.js - Schedule entry validation and CRUD operations.
 *
 * Extracted from Dashboard.jsx to make validation logic testable,
 * reusable across components, and independent of React state.
 */

import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, writeBatch, query, where, limit } from 'firebase/firestore';
import { TIME_SLOTS, getScheduleConfig } from '../config/constants';
import {
  professorMatchesSubject,
  findScheduleConflicts,
  slotsNeededFromIndex,
  getTimeSlotIndex,
  getSectionDepartment,
  isRoomAllowedFor,
  isProfessorAllowedInRoom,
  getMeetingTimeLabel,
} from '../utils/scheduleUtils';
import { generateConflictResolutions } from './conflictResolutionService';

/**
 * Validate a schedule entry against all business rules.
 *
 * @param {Object} entry - { room, professor, subject, section, day, timeSlot, excludeScheduleId }
 * @param {Object[]} activeSchedules - currently active schedules to check conflicts against
 * @param {Object[]} rooms - all rooms (needed for professor-room checks)
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateScheduleEntry(
  { room, professor, subject, section, day, timeSlot, excludeScheduleId = null, scheduleMode },
  activeSchedules,
  rooms
) {
  const errors = [];
  const warnings = [];
  const config = getScheduleConfig(scheduleMode);

  // Required field checks
  if (!room?.id) errors.push('Room is required.');
  if (!professor?.id) errors.push('Faculty is required.');
  if (!subject?.id) errors.push('Subject is required.');
  if (!day) errors.push('Day is required.');
  if (!timeSlot?.id) errors.push('Time slot is required.');

  // Specialization check
  if (professor && subject && !professorMatchesSubject(professor, subject)) {
    errors.push(`Faculty "${professor.name}" is not authorized to teach "${subject.code}".`);
  }

  // Section enrollment check
  if (section && subject) {
    const sectionSubjects = section.subjects || [];
    if (!sectionSubjects.includes(subject.id) && !sectionSubjects.includes(subject.code)) {
      errors.push(`Section "${section.name}" is not enrolled in subject "${subject.code}".`);
    }
  }

  // Room eligibility (section-level)
  if (room?.id && subject) {
    if (!isRoomAllowedFor(room, subject, section)) {
      const roomName = (room.name || '').toUpperCase().replace(/\s+/g, '');
      const sectionDept = getSectionDepartment(section);
      const isSpeechLab = roomName.includes('SPEECH');
      const isBscsExclusive = roomName === 'NB04' || roomName === 'NB05' || roomName === 'NB06' || roomName === 'ROOM203' || roomName === '203';
      const isRoom204 = roomName === 'ROOM204' || roomName === '204';

      if (isSpeechLab && sectionDept !== 'BAEL') {
        errors.push(`Room "${room.name}" is reserved exclusively for BAEL sections.`);
      } else if (isSpeechLab) {
        const code = (subject.code || '').toUpperCase();
        if (code.startsWith('GE') || code.startsWith('PE') || code.startsWith('NSTP')) {
          errors.push(`Room "${room.name}" can only be used for BAEL major subjects (no GE, PE, or NSTP).`);
        }
      } else if (isBscsExclusive) {
        if (!subject?.requiredLab) {
          errors.push(`Room "${room.name}" is reserved for BSCS students and faculty only (unless taking a Lab subject).`);
        }
      } else if (isRoom204) {
        if (sectionDept === 'BSOA' && !subject?.requiredLab) {
          errors.push(`Room "${room.name}" can only be used by BSOA for Laboratory subjects.`);
        } else {
          errors.push(`Room "${room.name}" is reserved for BSCS (and BSOA Labs only).`);
        }
      }
    }

    // Room eligibility (professor-level)
    if (professor?.id && !isProfessorAllowedInRoom(room, professor, subject, section, rooms)) {
      const roomName = (room.name || '').toUpperCase().replace(/\s+/g, '');
      const isSpeechLab = roomName.includes('SPEECH');
      const isBscsExclusive = roomName === 'NB04' || roomName === 'NB05' || roomName === 'NB06' || roomName === 'ROOM203' || roomName === '203';
      if (isSpeechLab) {
        errors.push(`Room "${room.name}" can only be used by BAEL faculty.`);
      } else if (isBscsExclusive) {
        if (!subject?.requiredLab) {
          errors.push(`Room "${room.name}" cannot be used by non-BSCS faculty (${professor.name}) for non-lab subjects.`);
        }
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // Time slot fit check
  if (!timeSlot?.isCustom && !timeSlot?.customLabel) {
    const activeSlots = config.timeSlots;
    const startIdx = activeSlots.findIndex(ts => String(ts.id) === String(timeSlot?.id));
    const needed = slotsNeededFromIndex(startIdx, subject?.hoursPerMeeting, scheduleMode);
    if (startIdx < 0 || needed === 0) {
      errors.push(`Time slot does not fit the ${subject?.hoursPerMeeting || 1.5}hr meeting duration.`);
      return { valid: false, errors, warnings };
    }

    if (subject?.code?.toUpperCase().startsWith('PE') && String(timeSlot?.id) === '2') {
      errors.push('Physical Education (PE) subjects cannot be scheduled in the first period (7:30 AM).');
    }
  }

  // Conflict detection
  const conflicts = findScheduleConflicts(
    { room, professor, subject, section, day, timeSlot },
    activeSchedules,
    { excludeScheduleId }
  );
  if (conflicts.room) {
    const s = conflicts.room;
    const timeRange = getMeetingTimeLabel(s.timeSlot, s.subject?.hoursPerMeeting, scheduleMode) || timeSlot?.label;
    const occupant = `${s.subject?.code || 'a class'}${s.section?.name ? ` (${s.section.name})` : ''}${s.professor?.name ? ` taught by ${s.professor.name}` : ''}`;
    errors.push(`Room "${room?.name}" is already occupied on ${day} (${timeRange}) by ${occupant}.`);
  }
  if (conflicts.professor) {
    const s = conflicts.professor;
    const timeRange = getMeetingTimeLabel(s.timeSlot, s.subject?.hoursPerMeeting, scheduleMode) || timeSlot?.label;
    const teaching = `${s.subject?.code || 'a class'}${s.section?.name ? ` for ${s.section.name}` : ''}${s.room?.name ? ` in ${s.room.name}` : ''}`;
    errors.push(`Faculty "${professor?.name}" is already scheduled on ${day} (${timeRange}) teaching ${teaching}.`);
  }
  if (section?.id && conflicts.section) {
    const s = conflicts.section;
    const timeRange = getMeetingTimeLabel(s.timeSlot, s.subject?.hoursPerMeeting, scheduleMode) || timeSlot?.label;
    const session = `${s.subject?.code || 'a class'}${s.room?.name ? ` in ${s.room.name}` : ''}${s.professor?.name ? ` with ${s.professor.name}` : ''}`;
    errors.push(`Section "${section?.name}" already has a class on ${day} (${timeRange}): ${session}.`);
  }
  if (subject?.requiredLab && !room?.hasComputers) errors.push(`Subject "${subject?.code || 'selected'}" requires a computer laboratory, but room "${room?.name || 'selected'}" does not have computers.`);
  if (subject?.isFoodLab && !room?.isFoodLab) errors.push(`Subject "${subject?.code || 'selected'}" requires a food laboratory, but room "${room?.name || 'selected'}" is not a food laboratory.`);

  let suggestions = [];
  if (Object.keys(conflicts).length > 0 && rooms && rooms.length > 0) {
    suggestions = generateConflictResolutions(
      { room, professor, subject, section, day, timeSlot, excludeScheduleId },
      activeSchedules,
      rooms,
      scheduleMode
    );
  }

  return { valid: errors.length === 0, errors, warnings, suggestions };
}

// --------------------------------------------------------------------------
//  Firestore CRUD operations
// --------------------------------------------------------------------------

/**
 * Add a single schedule entry to Firestore.
 *
 * @param {Object} newSchedule - the schedule to add
 * @param {Object[]} activeSchedules - for validation
 * @param {Object[]} rooms - for validation
 * @param {string} activeSemester
 * @param {string} activeSchoolYear
 * @param {boolean} isAdmin
 * @returns {{ ok: boolean, errors?: string[] }}
 */
export async function addSchedule(newSchedule, activeSchedules, rooms, activeSemester, activeSchoolYear, isAdmin, scheduleMode) {
  if (!isAdmin) return { ok: false, errors: ['Not authorized.'] };

  const check = validateScheduleEntry(
    {
      room: newSchedule?.room,
      professor: newSchedule?.professor,
      subject: newSchedule?.subject,
      section: newSchedule?.section || null,
      day: newSchedule?.day,
      timeSlot: newSchedule?.timeSlot,
      excludeScheduleId: null,
      scheduleMode,
    },
    activeSchedules,
    rooms
  );

  if (!check.valid) return { ok: false, errors: check.errors };
  await addDoc(collection(db, 'schedules'), { ...newSchedule, semester: activeSemester, schoolYear: activeSchoolYear });
  return { ok: true };
}

/**
 * Update day/time for an existing schedule entry.
 */
export async function updateSchedule(scheduleId, newDay, newTimeSlotOrId, schedules, activeSchedules, rooms, isAdmin) {
  if (!isAdmin) return { ok: false, errors: ['Not authorized.'] };

  let newTimeSlot;
  if (typeof newTimeSlotOrId === 'object' && newTimeSlotOrId !== null) {
    newTimeSlot = newTimeSlotOrId;
  } else {
    newTimeSlot = TIME_SLOTS.find((ts) => String(ts.id) === String(newTimeSlotOrId));
  }

  const existing = schedules.find((s) => s.id === scheduleId);
  if (!existing) return { ok: false, errors: ['Schedule not found.'] };

  const check = validateScheduleEntry(
    {
      room: existing.room,
      professor: existing.professor,
      subject: existing.subject,
      section: existing.section || null,
      day: newDay,
      timeSlot: newTimeSlot,
      excludeScheduleId: scheduleId,
    },
    activeSchedules,
    rooms
  );

  if (!check.valid) return { ok: false, errors: check.errors };
  await updateDoc(doc(db, 'schedules', scheduleId.toString()), { day: newDay, timeSlot: newTimeSlot });
  return { ok: true };
}

/**
 * Remove a single schedule entry from Firestore.
 */
export async function removeSchedule(id, isAdmin) {
  if (!isAdmin) return { ok: false, errors: ['Not authorized.'] };
  await deleteDoc(doc(db, 'schedules', id.toString()));
  return { ok: true };
}

/**
 * Remove multiple schedule entries from Firestore in a batch.
 */
export async function removeSchedulesBatch(ids, isAdmin) {
  if (!isAdmin) return { ok: false, errors: ['Not authorized.'] };

  try {
    const BATCH_LIMIT = 499;
    for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
      const chunk = ids.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.delete(doc(db, 'schedules', id.toString()));
      }
      await batch.commit();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errors: [e.message] };
  }
}

/**
 * Batch-add multiple schedule entries to Firestore.
 */
export async function addSchedulesBatch(newSchedules, activeSchedules, rooms, activeSemester, activeSchoolYear, isAdmin, scheduleMode) {
  if (!isAdmin) return { ok: false, errors: ['Not authorized.'] };

  const validSchedules = [];
  const errors = [];

  // Validate each schedule against both existing schedules AND already-accepted batch entries
  for (const s of newSchedules) {
    const check = validateScheduleEntry(
      { room: s.room, professor: s.professor, subject: s.subject, section: s.section || null, day: s.day, timeSlot: s.timeSlot, excludeScheduleId: null, scheduleMode },
      [...activeSchedules, ...validSchedules],
      rooms
    );
    if (check.valid) {
      validSchedules.push(s);
    } else {
      errors.push(`Failed to validate ${s.subject?.code}: ${check.errors.join(', ')}`);
    }
  }

  if (validSchedules.length === 0) {
    return { ok: false, errors: errors.length > 0 ? errors : ['No valid schedules to add.'] };
  }

  try {
    // Chunk into batches of 499 to respect Firestore's 500-operation limit
    const BATCH_LIMIT = 499;
    const schedulesRef = collection(db, 'schedules');
    for (let i = 0; i < validSchedules.length; i += BATCH_LIMIT) {
      const chunk = validSchedules.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const s of chunk) {
        const newDocRef = doc(schedulesRef);
        batch.set(newDocRef, { ...s, semester: activeSemester, schoolYear: activeSchoolYear });
      }
      await batch.commit();
    }
    return { ok: true, errors: errors.length > 0 ? errors : null, writtenCount: validSchedules.length };
  } catch (e) {
    return { ok: false, errors: [e.message] };
  }
}

/**
 * Clear all schedules for the active semester/year.
 */
export async function clearAllSchedules(activeSemester, activeSchoolYear) {
  const BATCH_LIMIT = 499;
  let hasMore = true;

  while (hasMore) {
    let q;
    if (activeSemester && activeSchoolYear) {
      q = query(
        collection(db, 'schedules'),
        where('semester', '==', activeSemester),
        where('schoolYear', '==', activeSchoolYear),
        limit(BATCH_LIMIT)
      );
    } else {
      q = query(collection(db, 'schedules'), limit(BATCH_LIMIT));
    }

    const snap = await getDocs(q);
    if (snap.empty) {
      hasMore = false;
      break;
    }

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    // Yield to the main thread to allow React to process snapshot updates and re-render without freezing
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/**
 * Log a history entry for an auto-schedule run.
 */
export async function logScheduleHistory(historyData, isAdmin) {
  if (!isAdmin) return;
  try {
    await addDoc(collection(db, 'scheduleHistory'), {
      ...historyData,
      timestamp: new Date(),
    });
  } catch (e) {
    console.error('Failed to log schedule history:', e);
  }
}
