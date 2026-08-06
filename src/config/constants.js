// src/config/constants.js
export const ROOM_TYPES = {
  LECTURE: 'lecture',
  LAB: 'lab'
};

// ───────────────────────────────────────────────────────────
//  MASTER TIME SLOTS — complete pool covering 7:00 AM – 6:00 PM
//  Both 5-day and 4-day modes reference subsets of this array.
//  IDs are stable identifiers stored in Firestore; never renumber.
// ───────────────────────────────────────────────────────────
export const ALL_TIME_SLOTS = [
  { id: 1,  time: '7:00 AM - 7:30 AM',   label: '7:00 - 7:30',   durationHours: 0.5 },
  { id: 2,  time: '7:30 AM - 8:00 AM',   label: '7:30 - 8:00',   durationHours: 0.5 },
  { id: 3,  time: '8:00 AM - 8:30 AM',   label: '8:00 - 8:30',   durationHours: 0.5 },
  { id: 4,  time: '8:30 AM - 9:00 AM',   label: '8:30 - 9:00',   durationHours: 0.5 },
  { id: 5,  time: '9:00 AM - 9:30 AM',   label: '9:00 - 9:30',   durationHours: 0.5 },
  { id: 6,  time: '9:30 AM - 10:00 AM',  label: '9:30 - 10:00',  durationHours: 0.5 },
  { id: 7,  time: '10:00 AM - 10:30 AM', label: '10:00 - 10:30', durationHours: 0.5 },
  { id: 8,  time: '10:30 AM - 11:00 AM', label: '10:30 - 11:00', durationHours: 0.5 },
  { id: 9,  time: '11:00 AM - 11:30 AM', label: '11:00 - 11:30', durationHours: 0.5 },
  { id: 10, time: '11:30 AM - 12:00 PM', label: '11:30 - 12:00', durationHours: 0.5 },
  { id: 19, time: '12:00 PM - 12:30 PM', label: '12:00 - 12:30', durationHours: 0.5 },
  // ↑ id 19 — used only in 5-day mode (part of the morning block ending at 12:00)
  //   and in 4-day mode as the first slot of the lunch break gap
  { id: 11, time: '12:30 PM - 1:00 PM',  label: '12:30 - 1:00',  durationHours: 0.5 },
  { id: 12, time: '1:00 PM - 1:30 PM',   label: '1:00 - 1:30',   durationHours: 0.5 },
  { id: 13, time: '1:30 PM - 2:00 PM',   label: '1:30 - 2:00',   durationHours: 0.5 },
  { id: 14, time: '2:00 PM - 2:30 PM',   label: '2:00 - 2:30',   durationHours: 0.5 },
  { id: 15, time: '2:30 PM - 3:00 PM',   label: '2:30 - 3:00',   durationHours: 0.5 },
  { id: 16, time: '3:00 PM - 3:30 PM',   label: '3:00 - 3:30',   durationHours: 0.5 },
  { id: 17, time: '3:30 PM - 4:00 PM',   label: '3:30 - 4:00',   durationHours: 0.5 },
  { id: 18, time: '4:00 PM - 4:30 PM',   label: '4:00 - 4:30',   durationHours: 0.5 },
  { id: 20, time: '4:30 PM - 5:00 PM',   label: '4:30 - 5:00',   durationHours: 0.5 },
  { id: 21, time: '5:00 PM - 5:30 PM',   label: '5:00 - 5:30',   durationHours: 0.5 },
  { id: 22, time: '5:30 PM - 6:00 PM',   label: '5:30 - 6:00',   durationHours: 0.5 },
];

// ───────────────────────────────────────────────────────────
//  STANDARD 5-DAY MODE (Mon–Fri, 7:30 AM – 5:00 PM, lunch 12:00–1:00 PM)
// ───────────────────────────────────────────────────────────
export const TIME_SLOTS = [
  { id: 2,  time: '7:30 AM - 8:00 AM',   label: '7:30 - 8:00',   durationHours: 0.5 },
  { id: 3,  time: '8:00 AM - 8:30 AM',   label: '8:00 - 8:30',   durationHours: 0.5 },
  { id: 4,  time: '8:30 AM - 9:00 AM',   label: '8:30 - 9:00',   durationHours: 0.5 },
  { id: 5,  time: '9:00 AM - 9:30 AM',   label: '9:00 - 9:30',   durationHours: 0.5 },
  { id: 6,  time: '9:30 AM - 10:00 AM',  label: '9:30 - 10:00',  durationHours: 0.5 },
  { id: 7,  time: '10:00 AM - 10:30 AM', label: '10:00 - 10:30', durationHours: 0.5 },
  { id: 8,  time: '10:30 AM - 11:00 AM', label: '10:30 - 11:00', durationHours: 0.5 },
  { id: 9,  time: '11:00 AM - 11:30 AM', label: '11:00 - 11:30', durationHours: 0.5 },
  { id: 10, time: '11:30 AM - 12:00 PM', label: '11:30 - 12:00', durationHours: 0.5 },
  // 12:00 PM - 1:00 PM is Lunch Break (5-day mode)
  { id: 11, time: '1:00 PM - 1:30 PM',   label: '1:00 - 1:30',   durationHours: 0.5 },
  { id: 12, time: '1:30 PM - 2:00 PM',   label: '1:30 - 2:00',   durationHours: 0.5 },
  { id: 13, time: '2:00 PM - 2:30 PM',   label: '2:00 - 2:30',   durationHours: 0.5 },
  { id: 14, time: '2:30 PM - 3:00 PM',   label: '2:30 - 3:00',   durationHours: 0.5 },
  { id: 15, time: '3:00 PM - 3:30 PM',   label: '3:00 - 3:30',   durationHours: 0.5 },
  { id: 16, time: '3:30 PM - 4:00 PM',   label: '3:30 - 4:00',   durationHours: 0.5 },
  { id: 17, time: '4:00 PM - 4:30 PM',   label: '4:00 - 4:30',   durationHours: 0.5 },
  { id: 18, time: '4:30 PM - 5:00 PM',   label: '4:30 - 5:00',   durationHours: 0.5 }
];

// ───────────────────────────────────────────────────────────
//  4-DAY MODE (Mon–Thu, 7:00 AM – 6:00 PM, lunch 11:30 AM – 12:30 PM)
// ───────────────────────────────────────────────────────────
export const FOUR_DAY_TIME_SLOTS = [
  { id: 1,  time: '7:00 AM - 7:30 AM',   label: '7:00 - 7:30',   durationHours: 0.5 },
  { id: 2,  time: '7:30 AM - 8:00 AM',   label: '7:30 - 8:00',   durationHours: 0.5 },
  { id: 3,  time: '8:00 AM - 8:30 AM',   label: '8:00 - 8:30',   durationHours: 0.5 },
  { id: 4,  time: '8:30 AM - 9:00 AM',   label: '8:30 - 9:00',   durationHours: 0.5 },
  { id: 5,  time: '9:00 AM - 9:30 AM',   label: '9:00 - 9:30',   durationHours: 0.5 },
  { id: 6,  time: '9:30 AM - 10:00 AM',  label: '9:30 - 10:00',  durationHours: 0.5 },
  { id: 7,  time: '10:00 AM - 10:30 AM', label: '10:00 - 10:30', durationHours: 0.5 },
  { id: 8,  time: '10:30 AM - 11:00 AM', label: '10:30 - 11:00', durationHours: 0.5 },
  { id: 9,  time: '11:00 AM - 11:30 AM', label: '11:00 - 11:30', durationHours: 0.5 },
  // 11:30 AM - 12:30 PM is Lunch Break (4-day mode)
  { id: 11, time: '12:30 PM - 1:00 PM',  label: '12:30 - 1:00',  durationHours: 0.5 },
  { id: 12, time: '1:00 PM - 1:30 PM',   label: '1:00 - 1:30',   durationHours: 0.5 },
  { id: 13, time: '1:30 PM - 2:00 PM',   label: '1:30 - 2:00',   durationHours: 0.5 },
  { id: 14, time: '2:00 PM - 2:30 PM',   label: '2:00 - 2:30',   durationHours: 0.5 },
  { id: 15, time: '2:30 PM - 3:00 PM',   label: '2:30 - 3:00',   durationHours: 0.5 },
  { id: 16, time: '3:00 PM - 3:30 PM',   label: '3:00 - 3:30',   durationHours: 0.5 },
  { id: 17, time: '3:30 PM - 4:00 PM',   label: '3:30 - 4:00',   durationHours: 0.5 },
  { id: 18, time: '4:00 PM - 4:30 PM',   label: '4:00 - 4:30',   durationHours: 0.5 },
  { id: 20, time: '4:30 PM - 5:00 PM',   label: '4:30 - 5:00',   durationHours: 0.5 },
  { id: 21, time: '5:00 PM - 5:30 PM',   label: '5:00 - 5:30',   durationHours: 0.5 },
  { id: 22, time: '5:30 PM - 6:00 PM',   label: '5:30 - 6:00',   durationHours: 0.5 },
];

/** Duration in hours of a timetable row. */
export function getSlotDurationHours(timeSlotOrIndex, scheduleMode) {
  const slots = scheduleMode === 'fourDay' ? FOUR_DAY_TIME_SLOTS : TIME_SLOTS;
  if (typeof timeSlotOrIndex === 'number') {
    const slot = slots[timeSlotOrIndex];
    return slot?.durationHours ?? 0.5;
  }
  if (timeSlotOrIndex?.durationHours != null) return timeSlotOrIndex.durationHours;
  return 0.5;
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const FOUR_DAY_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];

// Preferred day pairs for the scheduling engine
export const PREFERRED_PAIRS_STANDARD = [
  ['Monday', 'Thursday'],
  ['Tuesday', 'Friday'],
  ['Monday', 'Wednesday'],
  ['Wednesday', 'Friday']
];

export const PREFERRED_PAIRS_FOUR_DAY = [
  ['Monday', 'Wednesday'],
  ['Tuesday', 'Thursday'],
  ['Monday', 'Thursday'],
];

// Schedule mode constants
export const SCHEDULE_MODES = {
  STANDARD: 'standard',
  FOUR_DAY: 'fourDay',
};

/**
 * Returns the correct configuration for a given schedule mode.
 * @param {'standard'|'fourDay'} mode
 * @returns {{ timeSlots: Object[], days: string[], preferredPairs: string[][], lunchBreakBefore: number, lunchBreakAfter: number }}
 */
export function getScheduleConfig(mode) {
  if (mode === 'fourDay') {
    return {
      timeSlots: FOUR_DAY_TIME_SLOTS,
      days: FOUR_DAY_DAYS,
      preferredPairs: PREFERRED_PAIRS_FOUR_DAY,
      // Lunch gap: last morning slot id 9 (11:00–11:30) → first afternoon slot id 11 (12:30–1:00)
      lunchBeforeId: 9,
      lunchAfterId: 11,
      lunchLabel: '11:30 AM – 12:30 PM',
      allowSevenAm: true,
    };
  }
  // Standard 5-day mode
  return {
    timeSlots: TIME_SLOTS,
    days: DAYS,
    preferredPairs: PREFERRED_PAIRS_STANDARD,
    // Lunch gap: last morning slot id 10 (11:30–12:00) → first afternoon slot id 11 (1:00–1:30)
    lunchBeforeId: 10,
    lunchAfterId: 11,
    lunchLabel: '12:00 PM – 1:00 PM',
    allowSevenAm: false,
  };
}
export const DEPARTMENTS = ['BSCS', 'BAEL', 'BSOA', 'BSFT'];
export const BUILDINGS = ['BSOA Building', 'BAEL Building', 'BSFT Building', 'BSCS Building', 'General Building', 'Gymnasium'];
export const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer'];
export const SCHOOL_YEARS = ['2024-2025', '2025-2026', '2026-2027', '2027-2028'];

// Map full program names to their short department codes for grouping
export const PROGRAM_DEPARTMENTS = {
  'Bachelor of Science in Computer Science': 'BSCS',
  'BS Computer Science': 'BSCS',
  'Bachelor of Science in Food Technology': 'BSFT',
  'BS Food Technology': 'BSFT',
  'Bachelor of Science in Office Administration': 'BSOA',
  'BS Office Administration': 'BSOA',
  'Bachelor of Arts in English Language': 'BAEL',
  'BA English Language': 'BAEL'
};

export const getDeptColor = (dept) => {
  switch (dept) {
    case 'BSCS': return '#109EEF'; // Blue
    case 'BAEL': return '#EAB308'; // Yellow
    case 'BSOA': return '#8B5CF6'; // Purple
    case 'BSFT': return '#16A34A'; // Green
    case 'SHARED': return '#64748B'; // Slate
    case 'Minor': return '#000000ff'; // Black (distinct from BAEL)
    default: return 'var(--accent-primary)';
  }
};