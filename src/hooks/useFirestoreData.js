/**
 * useFirestoreData.js - Centralized Firestore data layer.
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
  query,
  where,
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
import { isStandardOneAndHalfHourClass, parseTimeToMinutes } from '../utils/scheduleUtils';

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
 * @param {string} activeSemester  - currently selected semester
 * @param {string} activeSemester  - currently selected semester
 * @param {string} activeSchoolYear - currently selected school year
 * @param {boolean} [isAdmin] - whether the current user is an admin
 */
export function useFirestoreData(activeSemester, activeSchoolYear, isAdmin = true) {
 // Core collection state
  const [rooms, setRooms] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [scheduleHistory, setScheduleHistory] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);

 // Term / settings state
  const [availableSemesters, setAvailableSemesters] = useState(SEMESTERS);
  const [availableSchoolYears, setAvailableSchoolYears] = useState(SCHOOL_YEARS);
  const [publishedTerms, setPublishedTerms] = useState({});
  const [loading, setLoading] = useState(true);

  const seedDone = useRef(false);
  const loadedSnapshots = useRef(new Set());

 // One-time data seeding & migration (Admin only)
  useEffect(() => {
    if (!isAdmin) return;
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

        // One-time sync for 1st Semester SY 2026-2027 subjects and professor specializations
        // Removes subjects/professors not on the main page of the Excel file, skips existing valid subjects,
        // assigns professors to their subjects (specialization), and clears pre-recorded section loads so workload starts at 0 without schedules.
        const syncDoc = await getDoc(doc(db, 'meta', 'firstSem2627Sync_v3'));
        if (!syncDoc.exists()) {
          const normStr = (str) => String(str || '').replace(/\s+/g, '').toUpperCase();
          const normProfName = (str) =>
            String(str || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/\b(dr|prof|mr|mrs|ms|engr|atty)\.?\b/gi, '')
              .replace(/[^a-z]/gi, '')
              .toLowerCase();

          const [subjSnap, profSnap, secSnap] = await Promise.all([
            getDocs(collection(db, 'subjects')),
            getDocs(collection(db, 'professors')),
            getDocs(collection(db, 'sections'))
          ]);

          const validSubjCodes = new Set(initialSubjects.map((s) => normStr(s.code)));
          const existingSubjByCode = new Map();
          const existingSubjByName = new Map();
          const ops = [];

          // 1. Remove subjects not on the main page of the Excel file; keep existing valid ones
          subjSnap.docs.forEach((d) => {
            const data = { ...d.data(), id: d.id };
            const codeKey = normStr(data.code);
            if (!validSubjCodes.has(codeKey)) {
              ops.push({ type: 'delete', col: 'subjects', id: String(d.id) });
            } else {
              if (data.code) existingSubjByCode.set(codeKey, data);
              if (data.name) existingSubjByName.set(normStr(data.name), data);
            }
          });

          // 2. Add only missing subjects from the Excel list (skip subjects currently in the system)
          for (const sub of initialSubjects) {
            const codeKey = normStr(sub.code);
            const nameKey = normStr(sub.name);
            if (existingSubjByCode.has(codeKey) || existingSubjByName.has(nameKey)) {
              continue; // Skip existing subject
            }
            const subData = { ...sub, id: String(sub.id) };
            ops.push({ type: 'set', col: 'subjects', id: String(sub.id), data: subData });
            existingSubjByCode.set(codeKey, subData);
            existingSubjByName.set(nameKey, subData);
          }

          // Build set of valid subject IDs and codes
          const validSubjTokens = new Set();
          for (const sub of existingSubjByCode.values()) {
            if (sub.id) validSubjTokens.add(normStr(sub.id));
            if (sub.code) validSubjTokens.add(normStr(sub.code));
          }

          // 3. Clean sections and add any missing sections
          const secByNormName = new Map();
          const secById = new Map();

          secSnap.docs.forEach((d) => {
            const data = { ...d.data(), id: d.id };
            const prevSubs = Array.isArray(data.subjects) ? data.subjects : [];
            const filteredSubs = prevSubs.filter((s) => validSubjTokens.has(normStr(s)));
            data.subjects = filteredSubs;
            data.subjectInstructors = {};
            ops.push({ type: 'set', col: 'sections', id: String(d.id), data });
            secById.set(String(d.id), data);
            if (data.name) secByNormName.set(normStr(data.name), data);
          });

          for (const sec of initialSections) {
            const normName = normStr(sec.name);
            if (!secByNormName.has(normName) && !secById.has(String(sec.id))) {
              const secData = { ...sec, id: String(sec.id), subjectInstructors: {} };
              secById.set(String(sec.id), secData);
              secByNormName.set(normName, secData);
              ops.push({ type: 'set', col: 'sections', id: String(sec.id), data: secData });
            }
          }

          // 4. Map existing professors
          const profById = new Map();
          const profByNormName = new Map();
          profSnap.docs.forEach((d) => {
            const data = { ...d.data(), id: d.id };
            profById.set(String(d.id), data);
            const fullName = data.name || `${data.lastName || ''}, ${data.firstName || ''}`;
            if (fullName) profByNormName.set(normProfName(fullName), data);
          });

          const matchedProfIds = new Set();

          // 5. Assign professors strictly to their subjects (specialization) without pre-recording section loads
          for (const item of initialProfessors) {
            let prof =
              profById.get(String(item.id)) ||
              profByNormName.get(normProfName(item.name));

            if (!prof) {
              const targetLast = normProfName(item.name.split(',')[0]);
              if (targetLast) {
                for (const p of profById.values()) {
                  const pLast = normProfName((p.name || p.lastName || '').split(',')[0]);
                  if (pLast && pLast === targetLast) {
                    prof = p;
                    break;
                  }
                }
              }
            }

            const isNewProf = !prof;
            const parts = item.name.split(',');
            const lastName = (parts[0] || '').trim();
            const firstName = parts.slice(1).join(',').trim();

            const specSet = new Set();
            for (const rawCode of item.specialization || []) {
              const codeKey = normStr(rawCode);
              const matchedSub = existingSubjByCode.get(codeKey);
              specSet.add(matchedSub?.code || rawCode);
            }

            const profDoc = prof
              ? {
                  ...prof,
                  specialization: Array.from(specSet),
                  assignedSections: [],
                  sectionSubjectMap: {},
                  maxUnits: item.maxUnits ?? prof.maxUnits ?? 15
                }
              : {
                  id: String(item.id),
                  name: item.name,
                  firstName,
                  lastName,
                  department: item.department,
                  maxUnits: item.maxUnits ?? 15,
                  specialization: Array.from(specSet),
                  assignedSections: [],
                  sectionSubjectMap: {},
                  preferredRooms: []
                };

            matchedProfIds.add(String(profDoc.id));
            profById.set(String(profDoc.id), profDoc);
            ops.push({
              type: isNewProf ? 'set' : 'update',
              col: 'professors',
              id: String(profDoc.id),
              data: profDoc
            });
          }

          // Delete professors not on the Excel list (e.g. P05, P07, P20)
          for (const existingProfId of profById.keys()) {
            if (!matchedProfIds.has(String(existingProfId))) {
              ops.push({ type: 'delete', col: 'professors', id: String(existingProfId) });
            }
          }

          const BATCH_LIMIT = 450;
          for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
            const chunk = ops.slice(i, i + BATCH_LIMIT);
            const b = writeBatch(db);
            chunk.forEach((op) => {
              const ref = doc(db, op.col, op.id);
              if (op.type === 'delete') {
                b.delete(ref);
              } else if (op.type === 'update') {
                b.update(ref, op.data);
              } else {
                b.set(ref, op.data, { merge: true });
              }
            });
            await b.commit();
          }

          await setDoc(doc(db, 'meta', 'firstSem2627Sync_v3'), {
            syncedAt: new Date().toISOString(),
            operationsCount: ops.length
          });
          console.log(`Synced 1st Semester SY 2026-2027 subjects and professor specializations (${ops.length} updates).`);
        }
      } catch (err) {
        console.error('Data initialization failed:', err);
      }
    };

    initializeData();
  }, [isAdmin]);

 // Real-time listeners
  useEffect(() => {
    const checkAllLoaded = (key) => {
      loadedSnapshots.current.add(key);
      if (['rooms', 'professors', 'subjects', 'sections'].every(k => loadedSnapshots.current.has(k))) {
        setLoading(false);
      }
    };

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      setRooms(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      checkAllLoaded('rooms');
    });

    const unsubProfs = onSnapshot(collection(db, 'professors'), (snap) => {
      setProfessors(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      checkAllLoaded('professors');
    });

    const unsubSubj = onSnapshot(collection(db, 'subjects'), (snap) => {
      setSubjects(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      checkAllLoaded('subjects');
    });

    const unsubSec = onSnapshot(collection(db, 'sections'), (snap) => {
      setSections(
        snap.docs.map((d) => {
          const data = d.data();
          return { ...data, program: normalizeProgram(data.program), id: d.id };
        })
      );
      checkAllLoaded('sections');
    });

    // We removed unsubSched from here so it can be in its own useEffect
    const unsubHist = onSnapshot(collection(db, 'scheduleHistory'), (snap) =>
      setScheduleHistory(
        snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          .sort((a, b) => {
            const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp || 0).getTime());
            const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp || 0).getTime());
            return timeB - timeA;
          })
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
      unsubHist();
      unsubDept();
      unsubCourse();
      unsubMeta();
    };
  }, []);

  // Real-time listener for schedules (filtered by active semester and school year)
  useEffect(() => {
    if (!activeSemester || !activeSchoolYear) return;

    // Filter unpublished schedules for non-admins
    if (isAdmin === false) {
      const termKey = `${activeSemester}_${activeSchoolYear}`;
      if (publishedTerms[termKey] !== true) {
        const timer = setTimeout(() => setSchedules([]), 0);
        return () => clearTimeout(timer);
      }
    }

    const schedulesQuery = query(
      collection(db, 'schedules'),
      where('semester', '==', activeSemester),
      where('schoolYear', '==', activeSchoolYear)
    );

    const unsubSched = onSnapshot(schedulesQuery, (snap) => {
      setSchedules(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubSched();
    };
  }, [activeSemester, activeSchoolYear, isAdmin, publishedTerms]);

 // Derived data

  /** Schedules filtered to the active semester + school year. */
  const activeSchedules = useMemo(
    () => schedules.filter((s) => s.semester === activeSemester && s.schoolYear === activeSchoolYear),
    [schedules, activeSemester, activeSchoolYear]
  );

 // Lookup maps (O(1) access instead of .find())

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
    return activeSchedules.map((s) => {
      const fullSubject = (s.subject?.id && subjectById[s.subject.id]) || s.subject;
      const isOneAndHalf = isStandardOneAndHalfHourClass({ ...s, subject: fullSubject });
      let effectiveHours = isOneAndHalf ? 1.5 : Number(s.hours);
      if (!effectiveHours && fullSubject?.hasLecLab) {
        effectiveHours = s.component === 'Lecture'
          ? ((Number(fullSubject.lectureHours) || 2) / 2)
          : ((Number(fullSubject.labHours) || 3) / 2);
      } else if (!effectiveHours) {
        effectiveHours = Number(fullSubject?.hoursPerMeeting) || 1.5;
      }

      const enrichedSubject = fullSubject ? {
        ...fullSubject,
        hoursPerMeeting: isOneAndHalf ? 1.5 : effectiveHours,
        ...(fullSubject.hasLecLab && s.component ? {
          credits: s.component === 'Lecture' ? (Number(fullSubject.lectureHours) || 2) : (Number(fullSubject.labHours) || 3)
        } : {})
      } : fullSubject;

      // Also normalize customLabel if it is a 1.5h class but elongated beyond 90 mins (e.g. 10:00 - 12:00)
      let enrichedTimeSlot = s.timeSlot;
      if (isOneAndHalf && s.timeSlot?.customLabel) {
        const parts = s.timeSlot.customLabel.split('-');
        if (parts.length === 2) {
          const startM = parseTimeToMinutes(parts[0].trim());
          const endM = parseTimeToMinutes(parts[1].trim());
          if (startM !== null && endM !== null && (endM - startM) > 90) {
            const newEndM = startM + 90;
            const h = Math.floor(newEndM / 60);
            const m = newEndM % 60;
            const period = h >= 12 ? 'PM' : 'AM';
            const displayH = h % 12 === 0 ? 12 : h % 12;
            const displayM = m.toString().padStart(2, '0');
            const endLabel = parts[1].includes(':') && (parts[1].includes('AM') || parts[1].includes('PM'))
              ? `${displayH}:${displayM} ${period}`
              : `${displayH}:${displayM}`;
            enrichedTimeSlot = {
              ...s.timeSlot,
              customLabel: `${parts[0].trim()} - ${endLabel}`
            };
          }
        }
      }

      const profKey = s.professor?.id ?? s.professorId ?? (typeof s.professor === 'string' ? s.professor : null);
      const roomKey = s.room?.id ?? s.roomId ?? (typeof s.room === 'string' ? s.room : null);
      const secKey = s.section?.id ?? s.sectionId ?? (typeof s.section === 'string' ? s.section : null);

      return {
        ...s,
        hours: effectiveHours,
        timeSlot: enrichedTimeSlot,
        professor: (profKey && professorById[profKey]) || s.professor,
        room: (roomKey && roomById[roomKey]) || s.room,
        section: (secKey && sectionById[secKey]) || s.section,
        subject: enrichedSubject,
      };
    });
  }, [activeSchedules, professorById, roomById, sectionById, subjectById]);

  return {
    loading,
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
