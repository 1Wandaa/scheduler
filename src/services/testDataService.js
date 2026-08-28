/**
 * testDataService.js — Test Data Seeding & Archive/Restore
 *
 * Provides three workflows for system testing:
 *   1. seedTestData()        – writes sample rooms, professors, subjects,
 *                              sections, and schedules to Firestore.
 *   2. archiveAndReset()     – snapshots every doc in the core collections
 *                              into meta/archivedData, then deletes them.
 *   3. restoreArchivedData() – reads the snapshot and re-creates every doc.
 *
 * All test-data IDs use a "TEST_" prefix so they are easy to spot.
 */

import { db } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';

// ────────────────────────────────────────────────
//  1.  SAMPLE TEST DATA
// ────────────────────────────────────────────────

const testRooms = [
  { id: 'TEST_R01', name: 'Test Room A (Lecture)', type: 'lecture', building: 'BSCS Building', hasComputers: false, capacity: 40, department: 'BSCS' },
  { id: 'TEST_R02', name: 'Test Room B (Lab)',     type: 'lab',     building: 'BSCS Building', hasComputers: true,  capacity: 35, department: 'BSCS' },
  { id: 'TEST_R03', name: 'Test Room C (Lecture)', type: 'lecture', building: 'BSFT Building', hasComputers: false, capacity: 40, department: 'BSFT' },
  { id: 'TEST_R04', name: 'Test Room D (Lab)',     type: 'lab',     building: 'BSFT Building', hasComputers: true,  capacity: 30, department: 'BSFT' },
  { id: 'TEST_R05', name: 'Test Room E (Lecture)', type: 'lecture', building: 'General Building', hasComputers: false, capacity: 50, department: 'SHARED' },
];

const testProfessors = [
  { id: 'TEST_P01', name: 'Test Faculty, Juan',    department: 'BSCS', specialization: ['TEST_CS101', 'TEST_CS102'], maxUnits: 18 },
  { id: 'TEST_P02', name: 'Test Faculty, Maria',   department: 'BSCS', specialization: ['TEST_CS103', 'TEST_GE01'],  maxUnits: 15 },
  { id: 'TEST_P03', name: 'Test Faculty, Carlos',  department: 'BSFT', specialization: ['TEST_FT01', 'TEST_FT02'],   maxUnits: 20 },
  { id: 'TEST_P04', name: 'Test Faculty, Ana',     department: 'BAEL', specialization: ['TEST_EL01', 'TEST_GE01'],   maxUnits: 12 },
  { id: 'TEST_P05', name: 'Test Faculty, Pedro',   department: 'BSOA', specialization: ['TEST_OA01', 'TEST_GE01'],   maxUnits: 15 },
  { id: 'TEST_P06', name: 'Test Faculty, Rosa',    department: 'BSFT', specialization: ['TEST_FT01', 'TEST_GE01'],   maxUnits: 18 },
];

const testSubjects = [
  { id: 'TEST_S01', code: 'TEST_CS101', name: 'Intro to Computer Science',      department: 'BSCS', credits: 3, requiredLab: false, hoursPerMeeting: 1.5, hoursPerWeek: 3 },
  { id: 'TEST_S02', code: 'TEST_CS102', name: 'Data Structures & Algorithms',   department: 'BSCS', credits: 3, requiredLab: true,  hoursPerMeeting: 2.5, hoursPerWeek: 5 },
  { id: 'TEST_S03', code: 'TEST_CS103', name: 'Web Development Fundamentals',   department: 'BSCS', credits: 3, requiredLab: true,  hoursPerMeeting: 2.5, hoursPerWeek: 5 },
  { id: 'TEST_S04', code: 'TEST_FT01',  name: 'Food Processing Basics',         department: 'BSFT', credits: 3, requiredLab: true,  hoursPerMeeting: 2.5, hoursPerWeek: 5 },
  { id: 'TEST_S05', code: 'TEST_FT02',  name: 'Food Safety & Sanitation',       department: 'BSFT', credits: 3, requiredLab: false, hoursPerMeeting: 1.5, hoursPerWeek: 3 },
  { id: 'TEST_S06', code: 'TEST_EL01',  name: 'English Communication Skills',   department: 'BAEL', credits: 3, requiredLab: false, hoursPerMeeting: 1.5, hoursPerWeek: 3 },
  { id: 'TEST_S07', code: 'TEST_OA01',  name: 'Office Management Principles',   department: 'BSOA', credits: 3, requiredLab: false, hoursPerMeeting: 1.5, hoursPerWeek: 3 },
  { id: 'TEST_S08', code: 'TEST_GE01',  name: 'General Education Elective',     department: 'BSCS', credits: 3, requiredLab: false, hoursPerMeeting: 1.5, hoursPerWeek: 3 },
];

const testSections = [
  { id: 'TEST_SEC01', name: 'Test BSCS 1A', program: 'BS Computer Science',            yearLevel: 1, studentCount: 35, subjects: ['TEST_S01', 'TEST_S02', 'TEST_S08'] },
  { id: 'TEST_SEC02', name: 'Test BSFT 1A', program: 'BS Food Technology',              yearLevel: 1, studentCount: 30, subjects: ['TEST_S04', 'TEST_S05', 'TEST_S08'] },
  { id: 'TEST_SEC03', name: 'Test BAEL 1A', program: 'BA English Language',             yearLevel: 1, studentCount: 25, subjects: ['TEST_S06', 'TEST_S08'] },
  { id: 'TEST_SEC04', name: 'Test BSOA 1A', program: 'BS Office Administration',        yearLevel: 1, studentCount: 30, subjects: ['TEST_S07', 'TEST_S08'] },
];

/** Build a handful of sample schedule entries tied to the test data above. */
function buildTestSchedules(semester, schoolYear) {
  return [
    {
      id: 'TEST_SCHED01',
      day: 'Monday',
      timeSlot: { id: 1, time: '7:00 AM - 7:30 AM', label: '7:00 - 7:30', durationHours: 0.5 },
      slotsUsed: [1, 2, 3],
      room:      { id: 'TEST_R01', name: 'Test Room A (Lecture)' },
      professor: { id: 'TEST_P01', name: 'Test Faculty, Juan' },
      subject:   { id: 'TEST_S01', code: 'TEST_CS101', name: 'Intro to Computer Science', credits: 3 },
      section:   { id: 'TEST_SEC01', name: 'Test BSCS 1A' },
      semester, schoolYear,
    },
    {
      id: 'TEST_SCHED02',
      day: 'Tuesday',
      timeSlot: { id: 3, time: '8:00 AM - 8:30 AM', label: '8:00 - 8:30', durationHours: 0.5 },
      slotsUsed: [3, 4, 5, 6, 7],
      room:      { id: 'TEST_R02', name: 'Test Room B (Lab)' },
      professor: { id: 'TEST_P01', name: 'Test Faculty, Juan' },
      subject:   { id: 'TEST_S02', code: 'TEST_CS102', name: 'Data Structures & Algorithms', credits: 3 },
      section:   { id: 'TEST_SEC01', name: 'Test BSCS 1A' },
      semester, schoolYear,
    },
    {
      id: 'TEST_SCHED03',
      day: 'Wednesday',
      timeSlot: { id: 1, time: '7:00 AM - 7:30 AM', label: '7:00 - 7:30', durationHours: 0.5 },
      slotsUsed: [1, 2, 3],
      room:      { id: 'TEST_R03', name: 'Test Room C (Lecture)' },
      professor: { id: 'TEST_P03', name: 'Test Faculty, Carlos' },
      subject:   { id: 'TEST_S05', code: 'TEST_FT02', name: 'Food Safety & Sanitation', credits: 3 },
      section:   { id: 'TEST_SEC02', name: 'Test BSFT 1A' },
      semester, schoolYear,
    },
    {
      id: 'TEST_SCHED04',
      day: 'Thursday',
      timeSlot: { id: 5, time: '9:00 AM - 9:30 AM', label: '9:00 - 9:30', durationHours: 0.5 },
      slotsUsed: [5, 6, 7],
      room:      { id: 'TEST_R05', name: 'Test Room E (Lecture)' },
      professor: { id: 'TEST_P04', name: 'Test Faculty, Ana' },
      subject:   { id: 'TEST_S06', code: 'TEST_EL01', name: 'English Communication Skills', credits: 3 },
      section:   { id: 'TEST_SEC03', name: 'Test BAEL 1A' },
      semester, schoolYear,
    },
  ];
}

// ────────────────────────────────────────────────
//  2.  CORE FUNCTIONS
// ────────────────────────────────────────────────

const CORE_COLLECTIONS = ['rooms', 'professors', 'subjects', 'sections', 'schedules'];
const BATCH_LIMIT = 499;

/**
 * Seed test data into Firestore.
 * Merges with any existing data — does NOT clear first.
 *
 * @param {string} semester    – e.g. "2nd Semester"
 * @param {string} schoolYear  – e.g. "2025-2026"
 */
export async function seedTestData(semester, schoolYear) {
  const allDocs = [
    ...testRooms.map((r)   => ({ col: 'rooms',      id: r.id,   data: r })),
    ...testProfessors.map((p) => ({ col: 'professors', id: p.id,   data: p })),
    ...testSubjects.map((s)  => ({ col: 'subjects',   id: s.id,   data: s })),
    ...testSections.map((s)  => ({ col: 'sections',   id: s.id,   data: s })),
    ...buildTestSchedules(semester, schoolYear).map((s) => ({ col: 'schedules', id: s.id, data: s })),
  ];

  for (let i = 0; i < allDocs.length; i += BATCH_LIMIT) {
    const chunk = allDocs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach(({ col, id, data }) => batch.set(doc(db, col, id), data));
    await batch.commit();
  }

  return {
    rooms: testRooms.length,
    professors: testProfessors.length,
    subjects: testSubjects.length,
    sections: testSections.length,
    schedules: buildTestSchedules(semester, schoolYear).length,
  };
}

/**
 * Check whether an archived-data snapshot already exists.
 * Looks for the lightweight metadata doc at meta/archivedData.
 */
export async function hasArchivedData() {
  const snap = await getDoc(doc(db, 'meta', 'archivedData'));
  return snap.exists();
}

/**
 * Snapshot every doc in the core collections into subcollections
 * under `archivedData/{collectionName}/{docId}`, then delete
 * all docs from the live collections so the system appears empty.
 *
 * The metadata doc at `meta/archivedData` stores only the timestamp
 * and the list of collection names — the actual data lives in
 * individual subcollection docs to avoid Firestore size/index limits.
 *
 * @returns {{ totalArchived: number }}
 */
export async function archiveAndReset() {
  let totalArchived = 0;

  // 1. Copy every doc from each core collection into archivedData/{colName}/{docId}
  for (const colName of CORE_COLLECTIONS) {
    const snap = await getDocs(collection(db, colName));
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((d) => {
        batch.set(doc(db, 'archivedData', colName, 'docs', d.id), d.data());
      });
      await batch.commit();
      totalArchived += chunk.length;
    }
  }

  if (totalArchived === 0) {
    throw new Error('No data to archive — all collections are already empty.');
  }

  // 2. Save lightweight metadata
  await setDoc(doc(db, 'meta', 'archivedData'), {
    archivedAt: Date.now(),
    collections: CORE_COLLECTIONS,
    totalArchived,
  });

  // 3. Delete all docs from the live collections
  for (const colName of CORE_COLLECTIONS) {
    const snap = await getDocs(collection(db, colName));
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  return { totalArchived };
}

/**
 * Restore every doc from the archived subcollections, then clean up
 * the archive docs and the metadata marker.
 *
 * @returns {{ totalRestored: number }}
 */
export async function restoreArchivedData() {
  const metaSnap = await getDoc(doc(db, 'meta', 'archivedData'));
  if (!metaSnap.exists()) {
    throw new Error('No archived data found.');
  }

  const { collections: archivedCollections } = metaSnap.data();
  let totalRestored = 0;

  // 1. Clear current live data (so test data doesn't mix with restored data)
  for (const colName of CORE_COLLECTIONS) {
    const currentSnap = await getDocs(collection(db, colName));
    for (let i = 0; i < currentSnap.docs.length; i += BATCH_LIMIT) {
      const chunk = currentSnap.docs.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // 2. Read archived docs and write them back to the live collections
  for (const colName of archivedCollections) {
    const archiveSnap = await getDocs(collection(db, 'archivedData', colName, 'docs'));
    for (let i = 0; i < archiveSnap.docs.length; i += BATCH_LIMIT) {
      const chunk = archiveSnap.docs.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((d) => {
        // Restore to the live collection
        batch.set(doc(db, colName, d.id), d.data());
        // Delete the archived copy
        batch.delete(d.ref);
      });
      await batch.commit();
      totalRestored += chunk.length;
    }
  }

  // 3. Remove the metadata marker
  await deleteDoc(doc(db, 'meta', 'archivedData'));

  return { totalRestored };
}
