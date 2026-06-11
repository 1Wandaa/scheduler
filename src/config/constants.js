// src/config/constants.js
export const ROOM_TYPES = {
  LECTURE: 'lecture',
  LAB: 'lab'
};

export const TIME_SLOTS = [
  { id: 1, time: '7:00 AM - 7:30 AM', label: '7:00 - 7:30', durationHours: 0.5 },
  { id: 2, time: '7:30 AM - 8:00 AM', label: '7:30 - 8:00', durationHours: 0.5 },
  { id: 3, time: '8:00 AM - 8:30 AM', label: '8:00 - 8:30', durationHours: 0.5 },
  { id: 4, time: '8:30 AM - 9:00 AM', label: '8:30 - 9:00', durationHours: 0.5 },
  { id: 5, time: '9:00 AM - 9:30 AM', label: '9:00 - 9:30', durationHours: 0.5 },
  { id: 6, time: '9:30 AM - 10:00 AM', label: '9:30 - 10:00', durationHours: 0.5 },
  { id: 7, time: '10:00 AM - 10:30 AM', label: '10:00 - 10:30', durationHours: 0.5 },
  { id: 8, time: '10:30 AM - 11:00 AM', label: '10:30 - 11:00', durationHours: 0.5 },
  { id: 9, time: '11:00 AM - 11:30 AM', label: '11:00 - 11:30', durationHours: 0.5 },
  { id: 10, time: '11:30 AM - 12:00 PM', label: '11:30 - 12:00', durationHours: 0.5 },
  // 12:00 PM - 1:00 PM is Lunch Break
  { id: 11, time: '1:00 PM - 1:30 PM', label: '1:00 - 1:30', durationHours: 0.5 },
  { id: 12, time: '1:30 PM - 2:00 PM', label: '1:30 - 2:00', durationHours: 0.5 },
  { id: 13, time: '2:00 PM - 2:30 PM', label: '2:00 - 2:30', durationHours: 0.5 },
  { id: 14, time: '2:30 PM - 3:00 PM', label: '2:30 - 3:00', durationHours: 0.5 },
  { id: 15, time: '3:00 PM - 3:30 PM', label: '3:00 - 3:30', durationHours: 0.5 },
  { id: 16, time: '3:30 PM - 4:00 PM', label: '3:30 - 4:00', durationHours: 0.5 },
  { id: 17, time: '4:00 PM - 4:30 PM', label: '4:00 - 4:30', durationHours: 0.5 },
  { id: 18, time: '4:30 PM - 5:00 PM', label: '4:30 - 5:00', durationHours: 0.5 }
];

/** Duration in hours of a timetable row. */
export function getSlotDurationHours(timeSlotOrIndex) {
  if (typeof timeSlotOrIndex === 'number') {
    const slot = TIME_SLOTS[timeSlotOrIndex];
    return slot?.durationHours ?? 0.5;
  }
  if (timeSlotOrIndex?.durationHours != null) return timeSlotOrIndex.durationHours;
  return 0.5;
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const DEPARTMENTS = ['BSCS', 'BAEL', 'BSOA', 'BSFT'];
export const BUILDINGS = ['BSOA Building', 'BAEL Building', 'BSFT Building', 'BSCS Building', 'General Building', 'Gymnasium'];