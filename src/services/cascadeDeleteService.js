import { db } from '../config/firebase';
import { doc, writeBatch, collection } from 'firebase/firestore';

/**
 * SafeBatch helper to avoid exceeding Firestore's 500-operation limit.
 */
class SafeBatch {
  constructor(firestoreDb) {
    this.db = firestoreDb;
    this.batch = writeBatch(firestoreDb);
    this.count = 0;
  }

  async check() {
    if (this.count >= 400) {
      await this.batch.commit();
      this.batch = writeBatch(this.db);
      this.count = 0;
    }
  }

  async set(ref, data) {
    await this.check();
    this.batch.set(ref, data);
    this.count++;
  }

  async update(ref, data) {
    await this.check();
    this.batch.update(ref, data);
    this.count++;
  }

  async delete(ref) {
    await this.check();
    this.batch.delete(ref);
    this.count++;
  }

  async commit() {
    if (this.count > 0) {
      await this.batch.commit();
      this.count = 0;
    }
  }
}

/**
 * Helper to create a trash record.
 */
const createTrashRecord = async (safeBatch, type, item, cascadedSchedules = [], modifications = {}) => {
  const trashRef = doc(collection(db, 'trash'));
  await safeBatch.set(trashRef, {
    id: trashRef.id,
    type,
    originalId: String(item.id),
    data: item,
    cascadedSchedules: cascadedSchedules || [],
    modifications,
    deletedAt: Date.now()
  });
};

/**
 * Safely deletes a subject and cleans up all related data:
 * - Removes subject from any professor's specialization list.
 * - Removes subject from any section's enrolled subjects.
 * - Deletes any schedules that reference this subject.
 */
export const deleteSubjectCascade = async (subject, professors = [], sections = [], schedules = []) => {
  return deleteSubjectBatchCascade([subject], professors, sections, schedules);
};

/**
 * Safely batch deletes multiple subjects with cascade cleanup.
 */
export const deleteSubjectBatchCascade = async (subjectList, professors = [], sections = [], schedules = []) => {
  if (!subjectList || subjectList.length === 0) return;
  const safeBatch = new SafeBatch(db);

  const subjectIds = new Set(subjectList.map(s => String(s.id)));
  const subjectCodes = new Set(subjectList.map(s => s.code).filter(Boolean));
  const subjectNames = new Set(subjectList.map(s => s.name).filter(Boolean));

  // 1. Delete subjects
  for (const subject of subjectList) {
    await safeBatch.delete(doc(db, 'subjects', String(subject.id)));
  }

  const subjectModsMap = new Map();
  subjectList.forEach(s => subjectModsMap.set(String(s.id), {
    modifiedProfessors: [],
    modifiedSections: [],
    removedInstructors: {}
  }));

  const matchesSingleSubject = (val, sub) =>
    String(val) === String(sub.id) ||
    (sub.code && String(val) === String(sub.code)) ||
    (sub.name && String(val) === String(sub.name));

  // 2. Remove from professors' specializations and sectionSubjectMap
  for (const prof of professors) {
    let profNeedsUpdate = false;
    const profUpdates = {};

    for (const sub of subjectList) {
      const hitSpec = (prof.specialization || []).some(s => matchesSingleSubject(s, sub));
      const hitMap = prof.sectionSubjectMap && Object.values(prof.sectionSubjectMap).some(
        arr => Array.isArray(arr) && arr.some(s => matchesSingleSubject(s, sub))
      );
      if (hitSpec || hitMap) {
        subjectModsMap.get(String(sub.id)).modifiedProfessors.push(String(prof.id));
      }
    }

    if (prof.specialization && Array.isArray(prof.specialization)) {
      const hasMatch = prof.specialization.some(s => subjectIds.has(String(s)) || subjectCodes.has(s) || subjectNames.has(s));
      if (hasMatch) {
        profUpdates.specialization = prof.specialization.filter(s => !subjectIds.has(String(s)) && !subjectCodes.has(s) && !subjectNames.has(s));
        profNeedsUpdate = true;
      }
    }

    if (prof.sectionSubjectMap) {
      let mapChanged = false;
      const newMap = {};
      for (const [secId, subs] of Object.entries(prof.sectionSubjectMap)) {
        if (Array.isArray(subs)) {
          const filtered = subs.filter(s => !subjectIds.has(String(s)) && !subjectCodes.has(s) && !subjectNames.has(s));
          if (filtered.length !== subs.length) mapChanged = true;
          if (filtered.length > 0) newMap[secId] = filtered;
        } else {
          newMap[secId] = subs;
        }
      }
      if (mapChanged) {
        profUpdates.sectionSubjectMap = newMap;
        profNeedsUpdate = true;
      }
    }

    if (profNeedsUpdate) {
      await safeBatch.update(doc(db, 'professors', String(prof.id)), profUpdates);
    }
  }

  // 3. Remove from sections' subjects and subjectInstructors
  for (const sec of sections) {
    let secNeedsUpdate = false;
    const secUpdates = {};

    for (const sub of subjectList) {
      const hitSubs = (sec.subjects || []).some(s => matchesSingleSubject(s, sub));
      if (hitSubs) {
        subjectModsMap.get(String(sub.id)).modifiedSections.push(String(sec.id));
      }
      if (sec.subjectInstructors) {
        for (const [subKey, profId] of Object.entries(sec.subjectInstructors)) {
          if (matchesSingleSubject(subKey, sub)) {
            const mods = subjectModsMap.get(String(sub.id));
            if (!mods.removedInstructors[sec.id]) mods.removedInstructors[sec.id] = {};
            mods.removedInstructors[sec.id][subKey] = profId;
          }
        }
      }
    }

    if (sec.subjects && Array.isArray(sec.subjects)) {
      const hasMatch = sec.subjects.some(s => subjectIds.has(String(s)) || subjectCodes.has(s) || subjectNames.has(s));
      if (hasMatch) {
        secUpdates.subjects = sec.subjects.filter(s => !subjectIds.has(String(s)) && !subjectCodes.has(s) && !subjectNames.has(s));
        secNeedsUpdate = true;
      }
    }

    if (sec.subjectInstructors) {
      let instructorsChanged = false;
      const newInstructors = { ...sec.subjectInstructors };
      for (const [subKey] of Object.entries(sec.subjectInstructors)) {
        if (subjectIds.has(String(subKey)) || subjectCodes.has(subKey) || subjectNames.has(subKey)) {
          delete newInstructors[subKey];
          instructorsChanged = true;
        }
      }
      if (instructorsChanged) {
        secUpdates.subjectInstructors = newInstructors;
        secNeedsUpdate = true;
      }
    }

    if (secNeedsUpdate) {
      await safeBatch.update(doc(db, 'sections', String(sec.id)), secUpdates);
    }
  }

  // 4. Delete schedules referencing these subjects
  const deletedScheduleIds = new Set();
  const subjectCascadedMap = new Map();
  subjectList.forEach(s => subjectCascadedMap.set(String(s.id), []));

  for (const sched of schedules) {
    if (sched.subject) {
      const subId = String(sched.subject.id);
      const subCode = sched.subject.code;
      if (subjectIds.has(subId) || subjectCodes.has(subCode)) {
        if (!deletedScheduleIds.has(String(sched.id))) {
          deletedScheduleIds.add(String(sched.id));
          await safeBatch.delete(doc(db, 'schedules', String(sched.id)));
          const targetId = subjectIds.has(subId) ? subId : subjectList.find(s => s.code === subCode)?.id;
          if (targetId && subjectCascadedMap.has(String(targetId))) {
            subjectCascadedMap.get(String(targetId)).push(sched);
          }
        }
      }
    }
  }

  // 5. Create trash records
  for (const subject of subjectList) {
    const cascaded = subjectCascadedMap.get(String(subject.id)) || [];
    const mods = subjectModsMap.get(String(subject.id)) || {};
    await createTrashRecord(safeBatch, 'subject', subject, cascaded, mods);
  }

  await safeBatch.commit();
};

/**
 * Safely deletes a room and cleans up all related data:
 * - Removes room from any professor's preferred rooms list.
 * - Deletes any schedules that reference this room.
 */
export const deleteRoomCascade = async (room, professors = [], schedules = []) => {
  return deleteRoomBatchCascade([room], professors, schedules);
};

/**
 * Safely batch deletes multiple rooms with cascade cleanup.
 */
export const deleteRoomBatchCascade = async (roomList, professors = [], schedules = []) => {
  if (!roomList || roomList.length === 0) return;
  const safeBatch = new SafeBatch(db);

  const roomIds = new Set(roomList.map(r => String(r.id)));
  const roomNames = new Set(roomList.map(r => r.name).filter(Boolean));

  // 1. Delete rooms
  for (const room of roomList) {
    await safeBatch.delete(doc(db, 'rooms', String(room.id)));
  }

  const roomModsMap = new Map();
  roomList.forEach(r => roomModsMap.set(String(r.id), { modifiedProfessors: [] }));

  // 2. Remove from professors' preferred rooms
  for (const prof of professors) {
    if (prof.preferredRooms && Array.isArray(prof.preferredRooms)) {
      for (const room of roomList) {
        if (prof.preferredRooms.some(r => String(r) === String(room.id) || (room.name && r === room.name))) {
          roomModsMap.get(String(room.id)).modifiedProfessors.push(String(prof.id));
        }
      }
      const hasMatch = prof.preferredRooms.some(r => roomIds.has(String(r)) || roomNames.has(r));
      if (hasMatch) {
        const newPrefs = prof.preferredRooms.filter(r => !roomIds.has(String(r)) && !roomNames.has(r));
        await safeBatch.update(doc(db, 'professors', String(prof.id)), { preferredRooms: newPrefs });
      }
    }
  }

  // 3. Delete schedules referencing these rooms
  const deletedScheduleIds = new Set();
  const roomCascadedMap = new Map();
  roomList.forEach(r => roomCascadedMap.set(String(r.id), []));

  for (const sched of schedules) {
    if (sched.room) {
      const rId = String(sched.room.id);
      const rName = sched.room.name;
      if (roomIds.has(rId) || roomNames.has(rName)) {
        if (!deletedScheduleIds.has(String(sched.id))) {
          deletedScheduleIds.add(String(sched.id));
          await safeBatch.delete(doc(db, 'schedules', String(sched.id)));
          const targetId = roomIds.has(rId) ? rId : roomList.find(r => r.name === rName)?.id;
          if (targetId && roomCascadedMap.has(String(targetId))) {
            roomCascadedMap.get(String(targetId)).push(sched);
          }
        }
      }
    }
  }

  // 4. Create trash records
  for (const room of roomList) {
    const cascaded = roomCascadedMap.get(String(room.id)) || [];
    const mods = roomModsMap.get(String(room.id)) || {};
    await createTrashRecord(safeBatch, 'room', room, cascaded, mods);
  }

  await safeBatch.commit();
};

/**
 * Safely deletes a section and cleans up all related data:
 * - Removes section from any professor's assigned sections list.
 * - Deletes any schedules that reference this section.
 */
export const deleteSectionCascade = async (section, professors = [], schedules = []) => {
  return deleteSectionBatchCascade([section], professors, schedules);
};

/**
 * Safely batch deletes multiple sections with cascade cleanup.
 */
export const deleteSectionBatchCascade = async (sectionList, professors = [], schedules = []) => {
  if (!sectionList || sectionList.length === 0) return;
  const safeBatch = new SafeBatch(db);

  const sectionIds = new Set(sectionList.map(s => String(s.id)));
  const sectionNames = new Set(sectionList.map(s => s.name).filter(Boolean));

  // 1. Delete sections
  for (const sec of sectionList) {
    await safeBatch.delete(doc(db, 'sections', String(sec.id)));
  }

  const sectionModsMap = new Map();
  sectionList.forEach(s => sectionModsMap.set(String(s.id), {
    modifiedProfessors: [],
    removedSectionSubjectMap: {}
  }));

  // 2. Remove from professors' assigned sections and sectionSubjectMap
  for (const prof of professors) {
    let profNeedsUpdate = false;
    const profUpdates = {};

    for (const sec of sectionList) {
      const hitSec = (prof.assignedSections || []).some(s => String(s) === String(sec.id) || (sec.name && s === sec.name));
      const hitMap = prof.sectionSubjectMap && (prof.sectionSubjectMap[sec.id] || (sec.name && prof.sectionSubjectMap[sec.name]));
      if (hitSec || hitMap) {
        const mods = sectionModsMap.get(String(sec.id));
        mods.modifiedProfessors.push(String(prof.id));
        if (hitMap) {
          mods.removedSectionSubjectMap[prof.id] = hitMap;
        }
      }
    }

    if (prof.assignedSections && Array.isArray(prof.assignedSections)) {
      const hasMatch = prof.assignedSections.some(s => sectionIds.has(String(s)) || sectionNames.has(s));
      if (hasMatch) {
        profUpdates.assignedSections = prof.assignedSections.filter(s => !sectionIds.has(String(s)) && !sectionNames.has(s));
        profNeedsUpdate = true;
      }
    }

    if (prof.sectionSubjectMap) {
      const newMap = { ...prof.sectionSubjectMap };
      let mapChanged = false;
      for (const sId of sectionIds) {
        if (newMap[sId]) {
          delete newMap[sId];
          mapChanged = true;
        }
      }
      for (const sName of sectionNames) {
        if (newMap[sName]) {
          delete newMap[sName];
          mapChanged = true;
        }
      }
      if (mapChanged) {
        profUpdates.sectionSubjectMap = newMap;
        profNeedsUpdate = true;
      }
    }

    if (profNeedsUpdate) {
      await safeBatch.update(doc(db, 'professors', String(prof.id)), profUpdates);
    }
  }

  // 3. Delete schedules referencing these sections
  const deletedScheduleIds = new Set();
  const sectionCascadedMap = new Map();
  sectionList.forEach(s => sectionCascadedMap.set(String(s.id), []));

  for (const sched of schedules) {
    if (sched.section) {
      const secId = String(sched.section.id);
      const secName = sched.section.name;
      if (sectionIds.has(secId) || sectionNames.has(secName)) {
        if (!deletedScheduleIds.has(String(sched.id))) {
          deletedScheduleIds.add(String(sched.id));
          await safeBatch.delete(doc(db, 'schedules', String(sched.id)));
          const targetId = sectionIds.has(secId) ? secId : sectionList.find(s => s.name === secName)?.id;
          if (targetId && sectionCascadedMap.has(String(targetId))) {
            sectionCascadedMap.get(String(targetId)).push(sched);
          }
        }
      }
    }
  }

  // 4. Create trash records
  for (const sec of sectionList) {
    const cascaded = sectionCascadedMap.get(String(sec.id)) || [];
    const mods = sectionModsMap.get(String(sec.id)) || {};
    await createTrashRecord(safeBatch, 'section', sec, cascaded, mods);
  }

  await safeBatch.commit();
};

/**
 * Safely deletes a faculty member and cleans up all related data:
 * - Removes faculty from section.subjectInstructors
 * - Deletes any schedules that reference this faculty member.
 */
export const deleteFacultyCascade = async (faculty, schedules = [], sections = []) => {
  return deleteFacultyBatchCascade([faculty], schedules, sections);
};

/**
 * Safely batch deletes multiple faculty members with cascade cleanup.
 */
export const deleteFacultyBatchCascade = async (facultyList, schedules = [], sections = []) => {
  if (!facultyList || facultyList.length === 0) return;
  const safeBatch = new SafeBatch(db);

  const facultyIds = new Set(facultyList.map(f => String(f.id)));
  const facultyModsMap = new Map();
  facultyList.forEach(f => facultyModsMap.set(String(f.id), { removedSectionInstructors: {} }));

  // Clean up section.subjectInstructors referencing deleted faculty
  for (const sec of (sections || [])) {
    if (sec.subjectInstructors && typeof sec.subjectInstructors === 'object') {
      let changed = false;
      const nextInstructors = { ...sec.subjectInstructors };
      for (const [subKey, profId] of Object.entries(sec.subjectInstructors)) {
        if (facultyIds.has(String(profId))) {
          const mods = facultyModsMap.get(String(profId));
          if (mods) {
            if (!mods.removedSectionInstructors[sec.id]) mods.removedSectionInstructors[sec.id] = [];
            mods.removedSectionInstructors[sec.id].push(subKey);
          }
          delete nextInstructors[subKey];
          changed = true;
        }
      }
      if (changed) {
        await safeBatch.update(doc(db, 'sections', String(sec.id)), { subjectInstructors: nextInstructors });
      }
    }
  }

  for (const faculty of facultyList) {
    const fId = String(faculty.id);
    // 1. Delete faculty doc
    await safeBatch.delete(doc(db, 'professors', fId));

    // 2. Delete schedules referencing this faculty
    const cascadedSchedules = [];
    for (const sched of schedules) {
      const profId = sched.professor?.id ?? sched.professorId;
      if (profId != null && String(profId) === fId) {
        await safeBatch.delete(doc(db, 'schedules', String(sched.id)));
        cascadedSchedules.push(sched);
      }
    }

    // 3. Create trash record
    const mods = facultyModsMap.get(fId) || {};
    await createTrashRecord(safeBatch, 'faculty', faculty, cascadedSchedules, mods);
  }

  await safeBatch.commit();
};

/**
 * Safely batch deletes departments and sends them to trash.
 */
export const deleteDepartmentBatch = async (departmentList) => {
  if (!departmentList || departmentList.length === 0) return;
  const safeBatch = new SafeBatch(db);

  for (const dept of departmentList) {
    await safeBatch.delete(doc(db, 'departments', String(dept.id)));
    await createTrashRecord(safeBatch, 'department', dept, [], {});
  }

  await safeBatch.commit();
};

/**
 * Safely batch deletes courses and sends them to trash.
 */
export const deleteCourseBatch = async (courseList) => {
  if (!courseList || courseList.length === 0) return;
  const safeBatch = new SafeBatch(db);

  for (const course of courseList) {
    await safeBatch.delete(doc(db, 'courses', String(course.id)));
    await createTrashRecord(safeBatch, 'course', course, [], {});
  }

  await safeBatch.commit();
};

/**
 * Safely batch deletes users and sends them to trash.
 */
export const deleteUserBatch = async (userList) => {
  if (!userList || userList.length === 0) return;
  const safeBatch = new SafeBatch(db);

  for (const u of userList) {
    await safeBatch.delete(doc(db, 'users', String(u.id)));
    await createTrashRecord(safeBatch, 'user', u, [], {});
  }

  await safeBatch.commit();
};
