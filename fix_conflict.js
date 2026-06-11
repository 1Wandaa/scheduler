const fs = require('fs');
const file = 'src/config/initialData.js';
let content = fs.readFileSync(file, 'utf8');

const roomsData = `export const SEED_VERSION = 'capsu-v10';

export const initialSemesters = [
  { id: 'sem_1', name: '1st Semester 2026-2027', isActive: true },
  { id: 'sem_2', name: '2nd Semester 2026-2027', isActive: false },
  { id: 'summer_1', name: 'Summer 2026', isActive: false }
];

// CAPSU Mambusao Official Data (Loading_2nd-2025-2026 superfinal) - CLEANED
export const initialRooms = [
  { id: "R_ScienceLab", name: "Science Lab", type: "Laboratory", hasComputers: true, hasProjector: true },
  { id: "R_GymFTE", name: "Gym FTE", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_FoodPro", name: "Food Pro", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_PhysicoChem", name: "Physico Chem", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_FTELectRoom", name: "FTE Lect Room", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_Flavier", name: "Flavier", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_Gym4", name: "Gym 4", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_Gym3", name: "Gym 3", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_Gym2", name: "Gym 2", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_Gym", name: "Gym", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_Stage", name: "Stage", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_MULTIMEDIAROOM", name: "MULTIMEDIA ROOM", type: "Laboratory", hasComputers: true, hasProjector: true },
  { id: "R_GS7", name: "GS 7", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_GS6", name: "GS 6", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_GS5", name: "GS 5", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_GS4", name: "GS 4", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_GS3", name: "GS 3", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_GS2", name: "GS 2", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_GS1", name: "GS 1", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_SpeechLab", name: "Speech Lab", type: "Laboratory", hasComputers: true, hasProjector: true },
  { id: "R_Room204", name: "Room 204", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_Room203", name: "Room 203", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_Room102", name: "Room 102", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_Room101", name: "Room 101", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_NB6", name: "NB 6", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_NB5", name: "NB 5", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_NB4", name: "NB 4", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_NB3", name: "NB 3", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_NB2", name: "NB 2", type: "Lecture", hasComputers: false, hasProjector: true },
  { id: "R_NB1", name: "NB 1", type: "Lecture", hasComputers: false, hasProjector: true }
];`;

let lines = content.split('\n');
let headIndex = lines.findIndex(l => l.startsWith('<<<<<<< HEAD'));
let sepIndex = lines.findIndex(l => l.startsWith('======='));

if (headIndex !== -1 && sepIndex !== -1) {
  let headContentLines = lines.slice(headIndex + 1, sepIndex);
  let profIndex = headContentLines.findIndex(l => l.startsWith('export const initialProfessors'));
  
  let finalContent = lines[0] + '\n' + roomsData + '\n\n' + headContentLines.slice(profIndex).join('\n') + '\n';
  fs.writeFileSync(file, finalContent);
  console.log('Fixed merge conflict.');
} else {
  console.log('No merge conflict found.');
}
