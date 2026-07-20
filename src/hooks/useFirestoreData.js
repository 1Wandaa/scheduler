/**
 * useFirestoreData.js — Centralized Firestore data layer.
 *
 * Owns ALL real-time listeners for the application's core collections.
 * Handles initial data seeding and one-time migrations.
 * Returns reactive state for: rooms, professors, subjects, sections,
 * schedules, scheduleHistory, and term settings.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../config/firebase';
import {
  collection,
  onSnapshot,
  getDocs,
  getDoc,
  setDoc,
  writeBatch,
  doc,
} from 'firebase/firestore';
import {
  initialRooms,
  initialProfessors,
  initialSubjects,
  initialSections,
  initialDepartments,
  initialCourses,
  SEED_VERSION,
} from '../config/initialData';
import { SEMESTERS, SCHOOL_YEARS, PROGRAM_DEPARTMENTS } from '../config/constants';

/**
 * Normalize a section's program name into a short department code
 * using the canonical PROGRAM_DEPARTMENTS map from constants.js.
 */
function normalizeProgram(prog) {
  if (!prog) return prog;
  // Check exact match first
  if (PROGRAM_DEPARTMENTS[prog]) return PROGRAM_DEPARTMENTS[prog];
  // Check if the program is already a short code (e.g. 'BSCS')
  const upper = prog.toUpperCase();
  if (Object.values(PROGRAM_DEPARTMENTS).includes(upper)) return upper;
  // Fallback: substring matching for flexibility
  const pUp = upper;
  if (pUp.includes('COMPUTER SCIENCE')) return 'BSCS';
  if (pUp.includes('INFORMATION TECHNOLOGY')) return 'BSIT';
  if (pUp.includes('ENGLISH LANGUAGE')) return 'BAEL';
  if (pUp.includes('OFFICE ADMINISTRATION')) return 'BSOA';
  if (pUp.includes('FOOD TECHNOLOGY')) return 'BSFT';
  return prog;
}

/**
 * Custom hook that manages ALL Firestore real-time listeners and
 * provides memoized lookup maps for efficient access.
 *
 * @param {string} activeSemester  — currently selected semester
 * @param {string} activeSchoolYear — currently selected school year
 */
export function useFirestoreData(activeSemester, activeSchoolYear) {
  // ─── Core collection state ──────────────────────────────────────────
  const [rooms, setRooms] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [scheduleHistory, setScheduleHistory] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);

  // ─── Term / settings state ──────────────────────────────────────────
  const [availableSemesters, setAvailableSemesters] = useState(SEMESTERS);
  const [availableSchoolYears, setAvailableSchoolYears] = useState(SCHOOL_YEARS);
  const [publishedTerms, setPublishedTerms] = useState({});

  const seedDone = useRef(false);

  // ─── One-time data seeding & migration ──────────────────────────────
  useEffect(() => {
    if (seedDone.current) return;
    seedDone.current = true;

    const initializeData = async () => {
      try {
        const versionDoc = await getDoc(doc(db, 'meta', 'seedVersion'));
        const storedVersion = versionDoc.exists() ? versionDoc.data().version : null;

        if (storedVersion !== SEED_VERSION) {
          const BATCH_LIMIT = 499;
          const collectionsToWipe = ['rooms', 'professors', 'subjects', 'sections', 'schedules'];
          for (const colName of collectionsToWipe) {
            const snap = await getDocs(collection(db, colName));
            if (!snap.empty) {
              for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
                const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
                const batch = writeBatch(db);
                chunk.forEach((d) => batch.delete(d.ref));
                await batch.commit();
              }
            }
          }
          // Seed data in chunked batches
          const allSeeds = [
            ...initialRooms.map((r) => ({ col: 'rooms', id: r.id.toString(), data: r })),
            ...initialProfessors.map((p) => ({ col: 'professors', id: p.id.toString(), data: p })),
            ...initialSubjects.map((s) => ({ col: 'subjects', id: s.id.toString(), data: s })),
            ...initialSections.map((sec) => ({ col: 'sections', id: sec.id.toString(), data: sec })),
          ];
          for (let i = 0; i < allSeeds.length; i += BATCH_LIMIT) {
            const chunk = allSeeds.slice(i, i + BATCH_LIMIT);
            const seedBatch = writeBatch(db);
            chunk.forEach(({ col, id, data }) => seedBatch.set(doc(db, col, id), data));
            await seedBatch.commit();
          }
          await setDoc(doc(db, 'meta', 'seedVersion'), { version: SEED_VERSION });
        }

        // One-time migration for old schedules missing semester/year tags
        const schedSnap = await getDocs(collection(db, 'schedules'));
        const docsToMigrate = schedSnap.docs.filter((d) => {
          const data = d.data();
          return !data.semester || !data.schoolYear;
        });
        if (docsToMigrate.length > 0) {
          const BATCH_LIMIT = 499;
          for (let i = 0; i < docsToMigrate.length; i += BATCH_LIMIT) {
            const chunk = docsToMigrate.slice(i, i + BATCH_LIMIT);
            const migrateBatch = writeBatch(db);
            chunk.forEach((d) => migrateBatch.update(d.ref, { semester: '2nd Semester', schoolYear: '2025-2026' }));
            await migrateBatch.commit();
          }
          console.log(`Migrated ${docsToMigrate.length} legacy schedules to 2nd Semester 2025-2026.`);
        }

        // Seed departments and courses if they are empty (without wiping existing data)
        const deptSnap = await getDocs(collection(db, 'departments'));
        if (deptSnap.empty) {
          const deptBatch = writeBatch(db);
          initialDepartments.forEach((d) => deptBatch.set(doc(db, 'departments', d.id.toString()), d));
          await deptBatch.commit();
        }
        
        const courseSnap = await getDocs(collection(db, 'courses'));
        if (courseSnap.empty) {
          const courseBatch = writeBatch(db);
          initialCourses.forEach((c) => courseBatch.set(doc(db, 'courses', c.id.toString()), c));
          await courseBatch.commit();
        }

        // Ensure meta/settings exists with default terms
        const settingsDoc = await getDoc(doc(db, 'meta', 'settings'));
        if (!settingsDoc.exists()) {
          await setDoc(doc(db, 'meta', 'settings'), { semesters: SEMESTERS, schoolYears: SCHOOL_YEARS });
        }
      } catch (err) {
        console.error('Data initialization failed:', err);
      }
    };

    initializeData();
  }, []);

  // ─── Real-time listeners ────────────────────────────────────────────
  useEffect(() => {
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) =>
      setRooms(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );

    const unsubProfs = onSnapshot(collection(db, 'professors'), (snap) =>
      setProfessors(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );

    const unsubSubj = onSnapshot(collection(db, 'subjects'), (snap) =>
      setSubjects(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );

    const unsubSec = onSnapshot(collection(db, 'sections'), (snap) =>
      setSections(
        snap.docs.map((d) => {
          const data = d.data();
          return { ...data, program: normalizeProgram(data.program), id: d.id };
        })
      )
    );

    const unsubSched = onSnapshot(collection(db, 'schedules'), (snap) =>
      setSchedules(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );

    const unsubHist = onSnapshot(collection(db, 'scheduleHistory'), (snap) =>
      setScheduleHistory(
        snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          .sort((a, b) => b.timestamp - a.timestamp)
      )
    );

    const unsubDept = onSnapshot(collection(db, 'departments'), (snap) =>
      setDepartments(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );

    const unsubCourse = onSnapshot(collection(db, 'courses'), (snap) =>
      setCourses(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );

    const unsubMeta = onSnapshot(doc(db, 'meta', 'settings'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.semesters) setAvailableSemesters(data.semesters);
        if (data.schoolYears) setAvailableSchoolYears(data.schoolYears);
        if (data.publishedTerms) setPublishedTerms(data.publishedTerms);
      }
    });

    return () => {
      unsubRooms();
      unsubProfs();
      unsubSubj();
      unsubSec();
      unsubSched();
      unsubHist();
      unsubDept();
      unsubCourse();
      unsubMeta();
    };
  }, []);

  // ─── Derived data ───────────────────────────────────────────────────

  /** Schedules filtered to the active semester + school year. */
  const activeSchedules = useMemo(
    () => schedules.filter((s) => s.semester === activeSemester && s.schoolYear === activeSchoolYear),
    [schedules, activeSemester, activeSchoolYear]
  );

  // ─── Lookup maps (O(1) access instead of .find()) ──────────────────

  const roomById = useMemo(() => {
    const map = {};
    for (const r of rooms) map[r.id] = r;
    return map;
  }, [rooms]);

  const professorById = useMemo(() => {
    const map = {};
    for (const p of professors) map[p.id] = p;
    return map;
  }, [professors]);

  const subjectById = useMemo(() => {
    const map = {};
    for (const s of subjects) map[s.id] = s;
    return map;
  }, [subjects]);

  const sectionById = useMemo(() => {
    const map = {};
    for (const s of sections) map[s.id] = s;
    return map;
  }, [sections]);

  const departmentById = useMemo(() => {
    const map = {};
    for (const d of departments) map[d.id] = d;
    return map;
  }, [departments]);

  const courseById = useMemo(() => {
    const map = {};
    for (const c of courses) map[c.id] = c;
    return map;
  }, [courses]);

  /** Schedules enriched with full object references via lookup maps. */
  const enrichedSchedules = useMemo(() => {
    return activeSchedules.map((s) => ({
      ...s,
      professor: (s.professor?.id && professorById[s.professor.id]) || s.professor,
      room: (s.room?.id && roomById[s.room.id]) || s.room,
      section: (s.section?.id && sectionById[s.section.id]) || s.section,
      subject: (s.subject?.id && subjectById[s.subject.id]) || s.subject,
    }));
  }, [activeSchedules, professorById, roomById, sectionById, subjectById]);

  return {
    // Core collections
    rooms,
    professors,
    subjects,
    sections,
    schedules,
    activeSchedules,
    enrichedSchedules,
    scheduleHistory,
    departments,
    courses,

    // Term settings
    availableSemesters,
    availableSchoolYears,
    publishedTerms,
    setPublishedTerms,

    // Lookup maps
    roomById,
    professorById,
    subjectById,
    sectionById,
    departmentById,
    courseById,
  };
}
