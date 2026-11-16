/**
 * freeTimeUtils.js
 * Utilities for managing faculty free-time / available-time activity annotations
 * (e.g., "Consultation Hour", "Class Preparation", "Research/Extension Work")
 * for ScheduleViewer, PrintableFacultyWorkload (Print), and Word (.doc) export.
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getScheduleTimeRange, normalizeDay, isLunchSlot } from './scheduleUtils';

/**
 * Official 8 ISO time blocks from INS F22 (1st-Sem-26-27_FW.pdf)
 * Mapped to the exact 30-minute timeSlot IDs in ALL_TIME_SLOTS.
 */
export const FW_ISO_TIME_BLOCKS = [
  { id: 'b1', label: '7:00 – 8:30', start: 420, end: 510, slotIds: [1, 2, 3] },
  { id: 'b2', label: '8:30 – 10:00', start: 510, end: 600, slotIds: [4, 5, 6] },
  { id: 'b3', label: '10:00 – 11:30', start: 600, end: 690, slotIds: [7, 8, 9] },
  { id: 'lunch', label: '11:30 – 12:30', start: 690, end: 750, slotIds: [10, 19], isLunch: true },
  { id: 'b4', label: '12:30 – 2:00', start: 750, end: 840, slotIds: [11, 12, 13] },
  { id: 'b5', label: '2:00 – 3:30', start: 840, end: 930, slotIds: [14, 15, 16] },
  { id: 'b6', label: '3:30 – 5:00', start: 930, end: 1020, slotIds: [17, 18, 20] },
  { id: 'b7', label: '5:00 – 6:00', start: 1020, end: 1080, slotIds: [21, 22] }
];

/**
 * Slot ID to time window (in minutes from midnight) and label lookup
 */
export const SLOT_WINDOWS = {
  1:  { start: 420, end: 450, label: '7:00 - 7:30' },
  2:  { start: 450, end: 480, label: '7:30 - 8:00' },
  3:  { start: 480, end: 510, label: '8:00 - 8:30' },
  4:  { start: 510, end: 540, label: '8:30 - 9:00' },
  5:  { start: 540, end: 570, label: '9:00 - 9:30' },
  6:  { start: 570, end: 600, label: '9:30 - 10:00' },
  7:  { start: 600, end: 630, label: '10:00 - 10:30' },
  8:  { start: 630, end: 660, label: '10:30 - 11:00' },
  9:  { start: 660, end: 690, label: '11:00 - 11:30' },
  10: { start: 690, end: 720, label: '11:30 - 12:00' },
  19: { start: 720, end: 750, label: '12:00 - 12:30' },
  11: { start: 750, end: 780, label: '12:30 - 1:00' },
  12: { start: 780, end: 810, label: '1:00 - 1:30' },
  13: { start: 810, end: 840, label: '1:30 - 2:00' },
  14: { start: 840, end: 870, label: '2:00 - 2:30' },
  15: { start: 870, end: 900, label: '2:30 - 3:00' },
  16: { start: 900, end: 930, label: '3:00 - 3:30' },
  17: { start: 930, end: 960, label: '3:30 - 4:00' },
  18: { start: 960, end: 990, label: '4:00 - 4:30' },
  20: { start: 990, end: 1020, label: '4:30 - 5:00' },
  21: { start: 1020, end: 1050, label: '5:00 - 5:30' },
  22: { start: 1050, end: 1080, label: '5:30 - 6:00' }
};

/**
 * Common faculty workload free-time activities from official CapSU INS F22 reference
 */
export const FREE_TIME_PRESETS = [
  'Class Preparation',
  'Consultation Hour',
  'Research/Extension Work',
  'Checking & recording of Activities',
  'Checking & recording of Students Activities',
  'Checking of Students output',
  'Preparing lessons',
  'Update Records',
  "Record students' output",
  'Perform duties as a program Coordinator'
];

const LOCAL_STORAGE_PREFIX = 'smartsched_faculty_freetime_';
const firestoreSaveTimers = new Map();

function normalizeProfKey(name) {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * Retrieve free-time activities map for a professor.
 * Prioritizes local storage cache (instant & authoritative on the client) with Firestore fallback.
 * Keys are `${Day}-${slotId}` (e.g., "Monday-1", "Tuesday-16").
 */
export function getFacultyFreeTimeActivities(professorOrId, fallbackName = '') {
  if (!professorOrId && !fallbackName) return {};
  const isObj = typeof professorOrId === 'object' && professorOrId !== null;
  const profId = isObj ? String(professorOrId.id || '') : String(professorOrId || '');
  const profName = isObj ? (professorOrId.name || fallbackName) : fallbackName;

  const fromFirestore = (isObj && professorOrId.freeTimeActivities && typeof professorOrId.freeTimeActivities === 'object')
    ? professorOrId.freeTimeActivities
    : {};

  if (profId) {
    try {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${profId}`);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  const nameKey = normalizeProfKey(profName);
  if (nameKey) {
    try {
      const rawByName = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}name_${nameKey}`);
      if (rawByName !== null) {
        const parsed = JSON.parse(rawByName);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  return { ...fromFirestore };
}

/**
 * Persist free-time activities for a professor to both localStorage (immediate) and Firestore (debounced).
 */
export function saveFacultyFreeTimeActivities(professorId, freeTimeActivities, professorName = '') {
  if (!professorId && !professorName) return;
  const profIdStr = professorId ? String(professorId) : '';
  const nameKey = normalizeProfKey(professorName);

  // Clean empty strings
  const cleaned = {};
  Object.entries(freeTimeActivities || {}).forEach(([k, v]) => {
    const strVal = typeof v === 'string' ? v : '';
    if (strVal.trim() !== '') {
      cleaned[k] = strVal;
    }
  });

  try {
    if (profIdStr) {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${profIdStr}`, JSON.stringify(cleaned));
    }
    if (nameKey) {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}name_${nameKey}`, JSON.stringify(cleaned));
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('smartsched_free_time_updated', {
        detail: { professorId: profIdStr, professorName, freeTimeActivities: cleaned }
      }));
    }, 0);
  } catch (e) {
    console.warn('[freeTimeUtils] Failed to save to localStorage:', e);
  }

  if (profIdStr) {
    if (firestoreSaveTimers.has(profIdStr)) {
      clearTimeout(firestoreSaveTimers.get(profIdStr));
    }
    const timer = setTimeout(async () => {
      firestoreSaveTimers.delete(profIdStr);
      try {
        const profRef = doc(db, 'professors', profIdStr);
        await updateDoc(profRef, { freeTimeActivities: cleaned });
      } catch (err) {
        console.warn('[freeTimeUtils] Firestore update skipped or failed (saved locally):', err?.message || err);
      }
    }, 400);
    firestoreSaveTimers.set(profIdStr, timer);
  }
}

/**
 * Formats a human-readable time range label for a contiguous array of slotIds.
 */
export function getSegmentTimeLabel(slotIds = []) {
  if (!slotIds || slotIds.length === 0) return '';
  const first = SLOT_WINDOWS[slotIds[0]];
  const last = SLOT_WINDOWS[slotIds[slotIds.length - 1]];
  if (!first || !last) return '';
  const startStr = first.label.split(' - ')[0]?.trim() || '';
  const endStr = last.label.split(' - ')[1]?.trim() || '';
  return `${startStr} – ${endStr}`;
}

/**
 * Computes deduplicated Teaching Assignments & Totals matching INS F22 (1st-Sem-26-27_FW.pdf)
 */
export function computeTeachingAssignments(schedules = []) {
  const assignmentsMap = new Map();

  (schedules || []).forEach(s => {
    if (!s.subject || !s.section) return;
    const subjKey = s.subject.id || s.subject.code || '';
    const secKey = s.section.id || s.section.name || '';
    const key = `${subjKey}-${secKey}`;

    if (!assignmentsMap.has(key)) {
      const hasLecLab = Boolean(s.subject.hasLecLab);
      const lecHours = hasLecLab
        ? (Number(s.subject.lectureHours) || 2)
        : (Number(s.subject.hoursPerWeek) || Number(s.subject.units ?? s.subject.credits) || 3);
      const labHours = hasLecLab ? (Number(s.subject.labHours) || 3) : 0;

      let unit = Number(s.subject.units ?? s.subject.credits) || 3;
      if (hasLecLab) {
        if (lecHours === 2 && labHours === 3) {
          unit = 4.25;
        } else if (lecHours === 3 && labHours === 6) {
          unit = 7.5;
        } else if (lecHours === 1 && labHours === 2) {
          unit = 3;
        }
      }

      const hoursDisplay = hasLecLab ? `${lecHours}/${labHours}` : `${lecHours}`;
      const rawCode = (s.subject.code || 'N/A')
        .replace(/\s*\((?:Lecture|Laboratory|Lec|Lab)\)/gi, '')
        .trim();
      const studentsCount = s.section.studentsCount ?? s.section.studentCount ?? '';

      assignmentsMap.set(key, {
        id: key,
        subjectCode: rawCode,
        subjectName: s.subject.name || s.subject.title || 'N/A',
        unit,
        lecHours,
        labHours,
        hoursPerWeek: hoursDisplay,
        sectionName: s.section.name || 'N/A',
        studentsCount
      });
    }
  });

  const uniqueAssignments = Array.from(assignmentsMap.values());
  const totalUnitsRaw = uniqueAssignments.reduce((sum, a) => sum + Number(a.unit || 0), 0);
  const totalUnits = Number.isInteger(totalUnitsRaw) ? totalUnitsRaw : Number(totalUnitsRaw.toFixed(2));
  const totalLecHours = uniqueAssignments.reduce((sum, a) => sum + Number(a.lecHours || 0), 0);
  const totalLabHours = uniqueAssignments.reduce((sum, a) => sum + Number(a.labHours || 0), 0);
  const totalHoursDisplay = uniqueAssignments.length === 0
    ? ''
    : (totalLabHours > 0 ? `${totalLecHours}/${totalLabHours}` : `${totalLecHours}`);
  const totalStudents = uniqueAssignments.reduce((sum, a) => sum + (Number(a.studentsCount) || 0), 0);

  return {
    uniqueAssignments,
    totalUnits,
    totalHoursDisplay,
    totalStudents
  };
}


/**
 * Builds the 8-block × 5-day Class Schedule grid for INS F22 (Print & Word export).
 * Each cell in the returned grid contains ordered items (both classes and free-time activities)
 * and rowSpan / border merge metadata matching `references/faculty-workload-iso/1st-Sem-26-27_FW.pdf`.
 */
export function buildFacultyWorkloadScheduleGrid(schedules = [], freeTimeActivities = {}, scheduleMode = 'standard') {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  // rawCells[day][blockIdx] = { block, items: [ { type: 'class'|'activity', ... } ] }
  const rawCells = {};

  days.forEach(day => {
    rawCells[day] = FW_ISO_TIME_BLOCKS.map(block => {
      if (block.isLunch) {
        return { block, isLunch: true, items: [] };
      }

      // 1. Find all scheduled classes on `day` overlapping this ISO block
      const daySchedules = (schedules || []).filter(s => {
        const sDay = normalizeDay(s.day) || s.day;
        if (sDay !== day) return false;
        const slotId = Number(s.timeSlot?.id || s.timeSlot);
        if (isLunchSlot(slotId)) return false;
        return true;
      });

      const overlappingClasses = [];
      const occupiedSlotIds = new Set();

      daySchedules.forEach(s => {
        let range = getScheduleTimeRange(s, scheduleMode);
        const slotId = Number(s.timeSlot?.id || s.timeSlot);
        if (!range || (range.start === 0 && range.end === 0)) {
          const sw = SLOT_WINDOWS[slotId];
          if (sw) {
            const hrs = Number(s.hours) || 1.5;
            range = { start: sw.start, end: sw.start + hrs * 60 };
          }
        }
        if (!range || range.end <= range.start) return;

        // Check overlap with block [block.start, block.end]
        const overlapStart = Math.max(range.start, block.start);
        const overlapEnd = Math.min(range.end, block.end);
        const overlapMins = overlapEnd - overlapStart;

        if (overlapMins >= 15) {
          overlappingClasses.push({
            type: 'class',
            schedule: s,
            start: overlapStart,
            end: overlapEnd
          });

          // Mark which 30-min slots in block.slotIds are occupied by this class
          block.slotIds.forEach(sid => {
            const sw = SLOT_WINDOWS[sid];
            if (sw) {
              const slotOverlap = Math.min(range.end, sw.end) - Math.max(range.start, sw.start);
              if (slotOverlap >= 15) {
                occupiedSlotIds.add(sid);
              }
            }
          });
        }
      });

      // 2. Group remaining unoccupied slotIds in block.slotIds into contiguous free segments
      const freeSegments = [];
      let currentSeg = [];
      block.slotIds.forEach(sid => {
        if (!occupiedSlotIds.has(sid)) {
          currentSeg.push(sid);
        } else {
          if (currentSeg.length > 0) {
            freeSegments.push(currentSeg);
            currentSeg = [];
          }
        }
      });
      if (currentSeg.length > 0) {
        freeSegments.push(currentSeg);
      }

      // 3. Extract free-time activities for each free segment
      const activityItems = [];
      freeSegments.forEach(segSlotIds => {
        // Check if all or any slots in this segment have activity text
        // Group consecutive slots within the segment that share the same non-empty text
        let subRunText = null;
        let subRunSlots = [];

        const flushSubRun = () => {
          if (subRunText && subRunSlots.length > 0) {
            const firstWin = SLOT_WINDOWS[subRunSlots[0]];
            const lastWin = SLOT_WINDOWS[subRunSlots[subRunSlots.length - 1]];
            activityItems.push({
              type: 'activity',
              text: subRunText.trim(),
              start: firstWin ? firstWin.start : block.start,
              end: lastWin ? lastWin.end : block.end,
              slotIds: [...subRunSlots]
            });
          }
          subRunText = null;
          subRunSlots = [];
        };

        segSlotIds.forEach(sid => {
          const rawText = freeTimeActivities[`${day}-${sid}`] || '';
          const trimmed = rawText.trim();
          if (trimmed) {
            if (subRunText && subRunText.toLowerCase() === trimmed.toLowerCase()) {
              subRunSlots.push(sid);
            } else {
              flushSubRun();
              subRunText = trimmed;
              subRunSlots = [sid];
            }
          } else {
            flushSubRun();
          }
        });
        flushSubRun();
      });

      // 4. Combine classes and activity items and sort chronologically
      const allItems = [...overlappingClasses, ...activityItems].sort((a, b) => a.start - b.start);

      return {
        block,
        isLunch: false,
        items: allItems,
        isSingleFullActivity:
          allItems.length === 1 &&
          allItems[0].type === 'activity' &&
          overlappingClasses.length === 0
      };
    });
  });

  // 5. Compute vertical rowSpan merging for consecutive full-block identical activities on the same day
  // (e.g., Research/Extension Work spanning 12:30-2:00, 2:00-3:30, 3:30-5:00 as in 1st-Sem-26-27_FW.pdf)
  days.forEach(day => {
    const col = rawCells[day];
    for (let i = 0; i < col.length; i++) {
      const cell = col[i];
      cell.rowSpan = 1;
      cell.skip = false;
      cell.mergeTopWithPrev = false;
      cell.mergeBottomWithNext = false;
    }

    let i = 0;
    while (i < col.length) {
      const cell = col[i];
      if (cell.isLunch || cell.skip || !cell.isSingleFullActivity) {
        i++;
        continue;
      }

      const baseText = cell.items[0].text.toLowerCase();
      let span = 1;
      while (i + span < col.length) {
        const nextCell = col[i + span];
        if (nextCell.isLunch) break;
        if (nextCell.isSingleFullActivity && nextCell.items[0].text.toLowerCase() === baseText) {
          nextCell.skip = true;
          span++;
        } else {
          break;
        }
      }
      cell.rowSpan = span;

      // Also check if the immediately following block (after the span) starts with the same activity
      // followed by a class (like Page 1 Tuesday 7:00-8:30 + 8:30-9:00 Checking & recording of Activities)
      const afterIdx = i + span;
      if (afterIdx < col.length && !col[afterIdx].isLunch) {
        const afterCell = col[afterIdx];
        if (
          afterCell.items.length === 2 &&
          afterCell.items[0].type === 'activity' &&
          afterCell.items[0].text.toLowerCase() === baseText &&
          afterCell.items[1].type === 'class'
        ) {
          cell.mergeBottomWithNext = true;
          afterCell.mergeTopWithPrev = true;
        }
      }

      i += span;
    }
  });

  return rawCells;
}
