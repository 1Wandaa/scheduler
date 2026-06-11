const fs = require('fs');
let raw = fs.readFileSync('src/config/initialData_restored.js', 'utf16le');
if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
let data = `import { ROOM_TYPES } from './constants';
export const SEED_VERSION = 'capsu-v3';

export const initialSemesters = [
  { id: 'sem_1', name: '1st Semester 2026-2027', isActive: true },
  { id: 'sem_2', name: '2nd Semester 2026-2027', isActive: false },
  { id: 'summer_1', name: 'Summer 2026', isActive: false }
];

` + raw;
fs.writeFileSync('src/config/initialData.js', data, 'utf8');
