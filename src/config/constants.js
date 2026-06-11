// src/config/constants.js
export const ROOM_TYPES = {
  LECTURE: 'lecture',
  LAB: 'lab'
};

export const TIME_SLOTS = [
  { id: 1, time: '7:30 AM - 8:30 AM', label: '7:30 - 8:30', durationHours: 1 },
  { id: 2, time: '8:30 AM - 9:30 AM', label: '8:30 - 9:30', durationHours: 1 },
  { id: 3, time: '9:30 AM - 10:30 AM', label: '9:30 - 10:30', durationHours: 1 },
  { id: 4, time: '10:30 AM - 11:30 AM', label: '10:30 - 11:30', durationHours: 1 },
  { id: 5, time: '11:30 AM - 12:00 PM', label: '11:30 - 12:00', durationHours: 0.5 },
  // Lunch Break is handled dynamically between 12:00 and 1:00
  { id: 6, time: '1:00 PM - 2:00 PM', label: '1:00 - 2:00', durationHours: 1 },
  { id: 7, time: '2:00 PM - 3:00 PM', label: '2:00 - 3:00', durationHours: 1 },
  { id: 8, time: '3:00 PM - 4:00 PM', label: '3:00 - 4:00', durationHours: 1 },
  { id: 9, time: '4:00 PM - 5:00 PM', label: '4:00 - 5:00', durationHours: 1 }
];

/** Duration in hours of a timetable row (most slots are 1hr; slot 5 is 30min). */
export function getSlotDurationHours(timeSlotOrIndex) {
  if (typeof timeSlotOrIndex === 'number') {
    const slot = TIME_SLOTS[timeSlotOrIndex];
    return slot?.durationHours ?? 1;
  }
  if (timeSlotOrIndex?.durationHours != null) return timeSlotOrIndex.durationHours;
  return Number(timeSlotOrIndex?.id) === 5 ? 0.5 : 1;
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const DEPARTMENTS = ['BSCS', 'BAEL', 'BSOA', 'BSFT'];
export const BUILDINGS = ['BSOA Building', 'BAEL Building', 'BSFT Building', 'BSCS Building'];