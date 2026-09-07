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

  // 2. Remove from professors' specializations
  professors.forEach(prof => {
    if (prof.specialization && Array.isArray(prof.specialization)) {
      const hasMatch = prof.specialization.some(s => subjectIds.has(String(s)) || subjectCodes.has(s) || subjectNames.has(s));
      if (hasMatch) {
        const newSpecs = prof.specialization.filter(s => !subjectIds.has(String(s)) && !subjectCodes.has(s) && !subjectNames.has(s));
        safeBatch.update(doc(db, 'professors', String(prof.id)), { specialization: newSpecs });
      }
    }
  });

  // 3. Remove from sections' subjects
  sections.forEach(sec => {
    if (sec.subjects && Array.isArray(sec.subjects)) {
      const hasMatch = sec.subjects.some(s => subjectIds.has(String(s)) || subjectCodes.has(s) || subjectNames.has(s));
      if (hasMatch) {
        const newSubjs = sec.subjects.filter(s => !subjectIds.has(String(s)) && !subjectCodes.has(s) && !subjectNames.has(s));
        safeBatch.update(doc(db, 'sections', String(sec.id)), { subjects: newSubjs });
      }
    }
  });

  // 4. Delete schedules referencing these subjects
  const deletedScheduleIds = new Set();
  const subjectCascadedMap = new Map();
  subjectList.forEach(s => subjectCascadedMap.set(String(s.id), []));

  schedules.forEach(sched => {
    if (sched.subject) {
      const subId = String(sched.subject.id);
      const subCode = sched.subject.code;
      if (subjectIds.has(subId) || subjectCodes.has(subCode)) {
        if (!deletedScheduleIds.has(String(sched.id))) {
          deletedScheduleIds.add(String(sched.id));
          safeBatch.delete(doc(db, 'schedules', String(sched.id)));
          const targetId = subjectIds.has(subId) ? subId : subjectList.find(s => s.code === subCode)?.id;
          if (targetId && subjectCascadedMap.has(String(targetId))) {
            subjectCascadedMap.get(String(targetId)).push(sched);
          }
        }
      }
    }
  });

  // 5. Create trash records
  for (const subject of subjectList) {
    const cascaded = subjectCascadedMap.get(String(subject.id)) || [];
    await createTrashRecord(safeBatch, 'subject', subject, cascaded, {});
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

  // 2. Remove from professors' preferred rooms
  professors.forEach(prof => {
    if (prof.preferredRooms && Array.isArray(prof.preferredRooms)) {
      const hasMatch = prof.preferredRooms.some(r => roomIds.has(String(r)) || roomNames.has(r));
      if (hasMatch) {
        const newPrefs = prof.preferredRooms.filter(r => !roomIds.has(String(r)) && !roomNames.has(r));
        safeBatch.update(doc(db, 'professors', String(prof.id)), { preferredRooms: newPrefs });
      }
    }
  });

  // 3. Delete schedules referencing these rooms
  const deletedScheduleIds = new Set();
  const roomCascadedMap = new Map();
  roomList.forEach(r => roomCascadedMap.set(String(r.id), []));

  schedules.forEach(sched => {
    if (sched.room) {
      const rId = String(sched.room.id);
      const rName = sched.room.name;
      if (roomIds.has(rId) || roomNames.has(rName)) {
        if (!deletedScheduleIds.has(String(sched.id))) {
          deletedScheduleIds.add(String(sched.id));
          safeBatch.delete(doc(db, 'schedules', String(sched.id)));
          const targetId = roomIds.has(rId) ? rId : roomList.find(r => r.name === rName)?.id;
          if (targetId && roomCascadedMap.has(String(targetId))) {
            roomCascadedMap.get(String(targetId)).push(sched);
          }
        }
      }
    }
  });

  // 4. Create trash records
  for (const room of roomList) {
    const cascaded = roomCascadedMap.get(String(room.id)) || [];
    await createTrashRecord(safeBatch, 'room', room, cascaded, {});
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

  // 2. Remove from professors' assigned sections
  professors.forEach(prof => {
    if (prof.assignedSections && Array.isArray(prof.assignedSections)) {
      const hasMatch = prof.assignedSections.some(s => sectionIds.has(String(s)) || sectionNames.has(s));
      if (hasMatch) {
        const newSecs = prof.assignedSections.filter(s => !sectionIds.has(String(s)) && !sectionNames.has(s));
        safeBatch.update(doc(db, 'professors', String(prof.id)), { assignedSections: newSecs });
      }
    }
  });

  // 3. Delete schedules referencing these sections
  const deletedScheduleIds = new Set();
  const sectionCascadedMap = new Map();
  sectionList.forEach(s => sectionCascadedMap.set(String(s.id), []));

  schedules.forEach(sched => {
    if (sched.section) {
      const secId = String(sched.section.id);
      const secName = sched.section.name;
      if (sectionIds.has(secId) || sectionNames.has(secName)) {
        if (!deletedScheduleIds.has(String(sched.id))) {
          deletedScheduleIds.add(String(sched.id));
          safeBatch.delete(doc(db, 'schedules', String(sched.id)));
          const targetId = sectionIds.has(secId) ? secId : sectionList.find(s => s.name === secName)?.id;
          if (targetId && sectionCascadedMap.has(String(targetId))) {
            sectionCascadedMap.get(String(targetId)).push(sched);
          }
        }
      }
    }
  });

  // 4. Create trash records
  for (const sec of sectionList) {
    const cascaded = sectionCascadedMap.get(String(sec.id)) || [];
    await createTrashRecord(safeBatch, 'section', sec, cascaded, {});
  }

  await safeBatch.commit();
};

/**
 * Safely deletes a faculty member and cleans up all related data:
 * - Deletes any schedules that reference this faculty member.
 */
export const deleteFacultyCascade = async (faculty, schedules = []) => {
  return deleteFacultyBatchCascade([faculty], schedules);
};

/**
 * Safely batch deletes multiple faculty members with cascade cleanup.
 */
export const deleteFacultyBatchCascade = async (facultyList, schedules = []) => {
  if (!facultyList || facultyList.length === 0) return;
  const safeBatch = new SafeBatch(db);

  for (const faculty of facultyList) {
    const fId = String(faculty.id);
    // 1. Delete faculty doc
    await safeBatch.delete(doc(db, 'professors', fId));

    // 2. Delete schedules referencing this faculty
    const cascadedSchedules = [];
    schedules.forEach(sched => {
      const profId = sched.professor?.id ?? sched.professorId;
      if (profId != null && String(profId) === fId) {
        safeBatch.delete(doc(db, 'schedules', String(sched.id)));
        cascadedSchedules.push(sched);
      }
    });

    // 3. Create trash record
    await createTrashRecord(safeBatch, 'faculty', faculty, cascadedSchedules, {});
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
