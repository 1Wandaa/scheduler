export const ROOM_TYPES = {
  LECTURE: 'lecture',
  LAB: 'lab',
};

export const TIME_SLOTS = [
  // 1.5 Hour Slots
  { id: 1, time: '7:30 AM - 9:00 AM', label: '7:30 AM - 9:00 AM', duration: 1.5 },
  { id: 2, time: '9:00 AM - 10:30 AM', label: '9:00 AM - 10:30 AM', duration: 1.5 },
  { id: 3, time: '10:30 AM - 12:00 PM', label: '10:30 AM - 12:00 PM', duration: 1.5 },
  { id: 4, time: '1:00 PM - 2:30 PM', label: '1:00 PM - 2:30 PM', duration: 1.5 },
  { id: 5, time: '2:30 PM - 4:00 PM', label: '2:30 PM - 4:00 PM', duration: 1.5 },
  { id: 6, time: '4:00 PM - 5:30 PM', label: '4:00 PM - 5:30 PM', duration: 1.5 },
  { id: 7, time: '5:30 PM - 7:00 PM', label: '5:30 PM - 7:00 PM', duration: 1.5 },

  // 2 Hour Slots
  { id: 8, time: '7:30 AM - 9:30 AM', label: '7:30 AM - 9:30 AM', duration: 2 },
  { id: 9, time: '9:30 AM - 11:30 AM', label: '9:30 AM - 11:30 AM', duration: 2 },
  { id: 10, time: '1:00 PM - 3:00 PM', label: '1:00 PM - 3:00 PM', duration: 2 },
  { id: 11, time: '2:00 PM - 4:00 PM', label: '3:00 PM - 5:00 PM', duration: 2 },
  { id: 12, time: '4:00 PM - 6:00 PM', label: '5:00 PM - 7:00 PM', duration: 2 }
];

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const DEPARTMENTS = ['BSCS', 'BAEL', 'BSOA', 'BSFT'];
