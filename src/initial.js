import { ROOM_TYPES } from './index';

export const initialRooms = [
  {
    id: 'R101',
    name: 'Room 101',
    capacity: 40,
    type: ROOM_TYPES.LECTURE,
    hasComputers: false,
    hasProjector: true
  },
  {
    id: 'R102',
    name: 'Room 102',
    capacity: 35,
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
    capacity: 25,
    type: ROOM_TYPES.LAB,
    hasComputers: true,
    hasProjector: true
  },
  {
    id: 'SEM1',
    name: 'Seminar Room 1',
    capacity: 20,
    type: ROOM_TYPES.SEMINAR,
    hasComputers: false,
    hasProjector: false
  }
];

export const initialProfessors = [
  {
    id: 'P001',
    name: 'Dr. John Smith',
    department: 'Computer Science',
    specialization: ['Web Development', 'Databases'],
    maxUnits: 12
  },
  {
    id: 'P002',
    name: 'Dr. Sarah Johnson',
    department: 'Computer Science',
    specialization: ['AI', 'Machine Learning'],
    maxUnits: 12
  },
  {
    id: 'P003',
    name: 'Prof. Mike Davis',
    department: 'Computer Science',
    specialization: ['Networks', 'Security'],
    maxUnits: 10
  },
  {
    id: 'P004',
    name: 'Dr. Emily Brown',
    department: 'Mathematics',
    specialization: ['Calculus', 'Linear Algebra'],
    maxUnits: 12
  }
];

export const initialSubjects = [
  {
    id: 'S001',
    code: 'CS101',
    name: 'Introduction to Programming',
    department: 'Computer Science',
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
    department: 'Computer Science',
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
    department: 'Computer Science',
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
    department: 'Computer Science',
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
    department: 'Mathematics',
    credits: 4,
    requiredLab: false,
    capacity: 40,
    hoursPerWeek: 2,
    assignedProfessor: null,
    assignedRoom: null,
    assignedTimeSlots: []
  }
];
