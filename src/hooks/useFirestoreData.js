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
import { SEMESTERS, SCHOOL_YEARS } from '../config/constants';

/**
 * Normalize a section's program name into a short department code
 * so that getSectionDepartment() works correctly downstream.
 */
function normalizeProgram(prog) {
  const pUp = (prog || '').toUpperCase();
  if (pUp.includes('COMPUTER SCIENCE')) return 'BSCS';
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
          const collectionsToWipe = ['rooms', 'professors', 'subjects', 'sections', 'schedules'];
          for (const colName of collectionsToWipe) {
            const snap = await getDocs(collection(db, colName));
            if (!snap.empty) {
              const batch = writeBatch(db);
              snap.docs.forEach((d) => batch.delete(d.ref));
              await batch.commit();
            }
          }
          const seedBatch = writeBatch(db);
          initialRooms.forEach((r) => seedBatch.set(doc(db, 'rooms', r.id.toString()), r));
          initialProfessors.forEach((p) => seedBatch.set(doc(db, 'professors', p.id.toString()), p));
          initialSubjects.forEach((s) => seedBatch.set(doc(db, 'subjects', s.id.toString()), s));
          initialSections.forEach((sec) => seedBatch.set(doc(db, 'sections', sec.id.toString()), sec));
          await seedBatch.commit();
          await setDoc(doc(db, 'meta', 'seedVersion'), { version: SEED_VERSION });
        }

        // One-time migration for old schedules missing semester/year tags
        const schedSnap = await getDocs(collection(db, 'schedules'));
        const migrateBatch = writeBatch(db);
        let migrationCount = 0;
        schedSnap.docs.forEach((d) => {
          const data = d.data();
          if (!data.semester || !data.schoolYear) {
            migrateBatch.update(d.ref, { semester: '2nd Semester', schoolYear: '2025-2026' });
            migrationCount++;
          }
        });
        if (migrationCount > 0) {
          await migrateBatch.commit();
          console.log(`Migrated ${migrationCount} legacy schedules to 2nd Semester 2025-2026.`);
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
