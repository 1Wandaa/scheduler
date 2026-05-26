import { ROOM_TYPES } from './constants';
export const SEED_VERSION = 'capsu-v1';

export const initialRooms = [
  {
    id: 'R101',
    name: 'Room 101',
    type: ROOM_TYPES.LECTURE,
    hasComputers: false,
    hasProjector: true
  },
  {
    id: 'R102',
    name: 'Room 102',
    type: ROOM_TYPES.LECTURE,
    hasComputers: false,
    hasProjector: true
  },
  {
    id: 'LAB1',
    name: 'Computer Lab 1',
    capacity: 30,
    type: ROOM_TYPES.LAB,
    hasComputers: true,
    hasProjector: true
  },
  {
    id: 'LAB2',
    name: 'Computer Lab 2',
    type: ROOM_TYPES.LAB,
    hasComputers: true,
    hasProjector: true
  },
  {
    id: 'SEM1',
    name: 'Seminar Room 1',
    type: ROOM_TYPES.SEMINAR,
    hasComputers: false,
    hasProjector: false
  }
];

export const initialProfessors = [
  {
    id: 'P001',
    name: 'Dr. Jelly Paredes',
    department: 'BSCS',
    specialization: ['Web Development', 'Databases'],
    maxUnits: 12
  },
  {
    id: 'P002',
    name: 'Prof. Art Jayson Osuyos',
    department: 'BSCS',
    specialization: ['AI', 'Machine Learning'],
    maxUnits: 12
  },
  {
    id: 'P003',
    name: 'Prof. Olga Llanera',
    department: 'BSCS',
    specialization: ['Networks', 'Security'],
    maxUnits: 10
  },
  {
    id: 'P004',
    name: 'Prof, Judith Vista',
    department: 'BSCS',
    specialization: ['Calculus', 'Linear Algebra'],
    maxUnits: 12
  }
];

export const initialSubjects = [
  {
    id: 'S001',
    code: 'CS101',
    name: 'Introduction to Programming',
    department: 'BSCS',
    credits: 3,
    requiredLab: false,
    capacity: 40,
    hoursPerWeek: 2,
    assignedProfessor: null,
    assignedRoom: null,
    assignedTimeSlots: []
  },
  {
    id: 'S002',
    code: 'CS102',
    name: 'Web Development',
    department: 'BSCS',
    credits: 3,
    requiredLab: true,
    capacity: 30,
    hoursPerWeek: 3,
    assignedProfessor: null,
    assignedRoom: null,
    assignedTimeSlots: []
  },
  {
    id: 'S003',
    code: 'CS201',
    name: 'Database Systems',
    department: 'BSCS',
    credits: 3,
    requiredLab: true,
    capacity: 25,
    hoursPerWeek: 3,
    assignedProfessor: null,
    assignedRoom: null,
    assignedTimeSlots: []
  },
  {
    id: 'S004',
    code: 'CS301',
    name: 'Artificial Intelligence',
    department: 'BSCS',
    credits: 3,
    requiredLab: false,
    capacity: 35,
    hoursPerWeek: 2,
    assignedProfessor: null,
    assignedRoom: null,
    assignedTimeSlots: []
  },
  {
    id: 'S005',
    code: 'MATH101',
    name: 'Calculus I',
    department: 'BSCS',
    credits: 4,
    requiredLab: false,
    capacity: 40,
    hoursPerWeek: 2,
    assignedProfessor: null,
    assignedRoom: null,
    assignedTimeSlots: []
  }
];

export const initialSections = [
  {
    id: 'SEC001',
    name: 'BSCS 1A',
    program: 'BS Computer Science',
    yearLevel: 1,
    studentCount: 38,
    subjects: ['S001', 'S002', 'S005']
  },
  {
    id: 'SEC002',
    name: 'BSCS 2A',
    program: 'BS Computer Science',
    yearLevel: 2,
    studentCount: 35,
    subjects: ['S003', 'S004']
  },
  {
    id: 'SEC003',
    name: 'BSIT 1A',
    program: 'BS Information Technology',
    yearLevel: 1,
    studentCount: 40,
    subjects: ['S001', 'S005']
  }
];