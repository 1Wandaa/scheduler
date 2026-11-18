import { db } from '../config/firebase';
import { doc, writeBatch, arrayUnion } from 'firebase/firestore';

/**
 * Restores an item from the trash, reversing the cascade delete.
 *
 * @param {Object} trashRecord - The record from the trash collection.
 */
export const restoreFromTrash = async (trashRecord) => {
  const ops = [];
  const { type, originalId, data, cascadedSchedules, modifications } = trashRecord;

  // 1. Determine collection for the main item
  let collectionName = type + 's';
  if (type === 'faculty') {
    collectionName = 'professors';
  }

  // 2. Re-create the main item
  ops.push({ kind: 'set', ref: doc(db, collectionName, String(originalId)), payload: data });

  // 3. Re-create all cascaded schedules
  if (cascadedSchedules && cascadedSchedules.length > 0) {
    cascadedSchedules.forEach(sched => {
      ops.push({ kind: 'set', ref: doc(db, 'schedules', String(sched.id)), payload: sched });
    });
  }

  // 4. Reverse modifications
  if (modifications) {
    if (modifications.modifiedProfessors && modifications.modifiedProfessors.length > 0) {
      modifications.modifiedProfessors.forEach(profId => {
        const updateData = {};
        if (type === 'subject') {
          updateData.specialization = arrayUnion(data.code || data.id);
        }
        if (type === 'room') {
          updateData.preferredRooms = arrayUnion(data.id);
        }
        if (type === 'section') {
          updateData.assignedSections = arrayUnion(data.id);
          if (modifications.removedSectionSubjectMap && modifications.removedSectionSubjectMap[profId]) {
            updateData[`sectionSubjectMap.${data.id}`] = modifications.removedSectionSubjectMap[profId];
          }
        }
        ops.push({ kind: 'update', ref: doc(db, 'professors', String(profId)), payload: updateData });
      });
    }

    if (modifications.modifiedSections && modifications.modifiedSections.length > 0) {
      modifications.modifiedSections.forEach(secId => {
        if (type === 'subject') {
          const secUpdate = {
            subjects: arrayUnion(data.id || data.code)
          };
          if (modifications.removedInstructors && modifications.removedInstructors[secId]) {
            for (const [subKey, profId] of Object.entries(modifications.removedInstructors[secId])) {
              secUpdate[`subjectInstructors.${subKey}`] = profId;
            }
          }
          ops.push({ kind: 'update', ref: doc(db, 'sections', String(secId)), payload: secUpdate });
        }
      });
    }

    if (type === 'faculty' && modifications.removedSectionInstructors) {
      for (const [secId, subKeys] of Object.entries(modifications.removedSectionInstructors)) {
        if (Array.isArray(subKeys) && subKeys.length > 0) {
          const secUpdate = {};
          subKeys.forEach(k => {
            secUpdate[`subjectInstructors.${k}`] = originalId;
          });
          ops.push({ kind: 'update', ref: doc(db, 'sections', String(secId)), payload: secUpdate });
        }
      }
    }
  }

  // 5. Delete the trash record
  ops.push({ kind: 'delete', ref: doc(db, 'trash', String(trashRecord.id)) });

  const BATCH_LIMIT = 400;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.kind === 'set') batch.set(op.ref, op.payload);
      else if (op.kind === 'update') batch.update(op.ref, op.payload);
      else if (op.kind === 'delete') batch.delete(op.ref);
    }
    await batch.commit();
  }
};
