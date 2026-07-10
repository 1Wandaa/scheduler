import { db } from '../config/firebase';
import { doc, writeBatch, collection } from 'firebase/firestore';

/**
 * Helper to create a trash record.
 */
const createTrashRecord = (batch, type, item, cascadedSchedules, modifications = {}) => {
  const trashRef = doc(collection(db, 'trash'));
  batch.set(trashRef, {
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
export const deleteSubjectCascade = async (subject, professors, sections, schedules) => {
  const batch = writeBatch(db);
  
  const cascadedSchedules = [];
  const modifiedProfessors = [];
  const modifiedSections = [];

  // 1. Delete the subject itself
  batch.delete(doc(db, 'subjects', String(subject.id)));

  // 2. Remove from professors' specializations
  professors.forEach(prof => {
    if (prof.specialization && (prof.specialization.includes(subject.id) || prof.specialization.includes(subject.code) || prof.specialization.includes(subject.name))) {
      const newSpecs = prof.specialization.filter(s => s !== subject.id && s !== subject.code && s !== subject.name);
      batch.update(doc(db, 'professors', String(prof.id)), { specialization: newSpecs });
      modifiedProfessors.push(prof.id);
    }
  });

  // 3. Remove from sections' subjects
  sections.forEach(sec => {
    if (sec.subjects && (sec.subjects.includes(subject.id) || sec.subjects.includes(subject.code) || sec.subjects.includes(subject.name))) {
      const newSubjs = sec.subjects.filter(s => s !== subject.id && s !== subject.code && s !== subject.name);
      batch.update(doc(db, 'sections', String(sec.id)), { subjects: newSubjs });
      modifiedSections.push(sec.id);
    }
  });

  // 4. Delete schedules referencing this subject
  schedules.forEach(sched => {
    if (sched.subject && (sched.subject.id === subject.id || sched.subject.code === subject.code)) {
      batch.delete(doc(db, 'schedules', String(sched.id)));
      cascadedSchedules.push(sched);
    }
  });

  // 5. Save to trash
  createTrashRecord(batch, 'subject', subject, cascadedSchedules, { modifiedProfessors, modifiedSections });

  await batch.commit();
};

/**
 * Safely deletes a room and cleans up all related data:
 * - Removes room from any professor's preferred rooms list.
 * - Deletes any schedules that reference this room.
 */
export const deleteRoomCascade = async (room, professors, schedules) => {
  const batch = writeBatch(db);
  
  const cascadedSchedules = [];
  const modifiedProfessors = [];

  // 1. Delete the room itself
  batch.delete(doc(db, 'rooms', String(room.id)));

  // 2. Remove from professors' preferred rooms
  professors.forEach(prof => {
    if (prof.preferredRooms && (prof.preferredRooms.includes(room.id) || prof.preferredRooms.includes(room.name))) {
      const newPrefs = prof.preferredRooms.filter(r => r !== room.id && r !== room.name);
      batch.update(doc(db, 'professors', String(prof.id)), { preferredRooms: newPrefs });
      modifiedProfessors.push(prof.id);
    }
  });

  // 3. Delete schedules referencing this room
  schedules.forEach(sched => {
    if (sched.room && sched.room.id === room.id) {
      batch.delete(doc(db, 'schedules', String(sched.id)));
      cascadedSchedules.push(sched);
    }
  });

  // 4. Save to trash
  createTrashRecord(batch, 'room', room, cascadedSchedules, { modifiedProfessors });

  await batch.commit();
};

/**
 * Safely deletes a section and cleans up all related data:
 * - Removes section from any professor's assigned sections list.
 * - Deletes any schedules that reference this section.
 */
export const deleteSectionCascade = async (section, professors, schedules) => {
  const batch = writeBatch(db);
  
  const cascadedSchedules = [];
  const modifiedProfessors = [];

  // 1. Delete the section itself
  batch.delete(doc(db, 'sections', String(section.id)));

  // 2. Remove from professors' assigned sections
  professors.forEach(prof => {
    if (prof.assignedSections && (prof.assignedSections.includes(section.id) || prof.assignedSections.includes(section.name))) {
      const newSecs = prof.assignedSections.filter(s => s !== section.id && s !== section.name);
      batch.update(doc(db, 'professors', String(prof.id)), { assignedSections: newSecs });
      modifiedProfessors.push(prof.id);
    }
  });

  // 3. Delete schedules referencing this section
  schedules.forEach(sched => {
    if (sched.section && sched.section.id === section.id) {
      batch.delete(doc(db, 'schedules', String(sched.id)));
      cascadedSchedules.push(sched);
    }
  });

  // 4. Save to trash
  createTrashRecord(batch, 'section', section, cascadedSchedules, { modifiedProfessors });

  await batch.commit();
};

/**
 * Safely deletes a faculty member and cleans up all related data:
 * - Deletes any schedules that reference this faculty member.
 */
export const deleteFacultyCascade = async (faculty, schedules) => {
  const batch = writeBatch(db);
  
  const cascadedSchedules = [];

  // 1. Delete the professor itself
  batch.delete(doc(db, 'professors', String(faculty.id)));

  // 2. Delete schedules referencing this professor
  schedules.forEach(sched => {
    if (sched.professor && sched.professor.id === faculty.id) {
      batch.delete(doc(db, 'schedules', String(sched.id)));
      cascadedSchedules.push(sched);
    }
  });

  // 3. Save to trash
  createTrashRecord(batch, 'faculty', faculty, cascadedSchedules, {});

  await batch.commit();
};
