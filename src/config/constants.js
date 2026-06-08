// src/config/constants.js
export const ROOM_TYPES = {
  LECTURE: 'lecture',
  LAB: 'lab'
};

export const TIME_SLOTS = [
  { id: 1, time: '7:30 AM - 8:30 AM', label: '7:30 - 8:30' },
  { id: 2, time: '8:30 AM - 9:30 AM', label: '8:30 - 9:30' },
  { id: 3, time: '9:30 AM - 10:30 AM', label: '9:30 - 10:30' },
  { id: 4, time: '10:30 AM - 11:30 AM', label: '10:30 - 11:30' },
  { id: 5, time: '11:30 AM - 12:00 PM', label: '11:30 - 12:00' },
  // Lunch Break is handled dynamically between 12:00 and 1:00
  { id: 6, time: '1:00 PM - 2:00 PM', label: '1:00 - 2:00' },
  { id: 7, time: '2:00 PM - 3:00 PM', label: '2:00 - 3:00' },
  { id: 8, time: '3:00 PM - 4:00 PM', label: '3:00 - 4:00' },
  { id: 9, time: '4:00 PM - 5:00 PM', label: '4:00 - 5:00' }
];

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const DEPARTMENTS = ['BSCS', 'BAEL', 'BSOA', 'BSFT'];