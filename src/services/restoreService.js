import { db } from '../config/firebase';
import { doc, writeBatch, arrayUnion } from 'firebase/firestore';

/**
 * Restores an item from the trash, reversing the cascade delete.
 * @param {Object} trashRecord - The record from the trash collection.
 */
export const restoreFromTrash = async (trashRecord) => {
  const batch = writeBatch(db);
  const { type, originalId, data, cascadedSchedules, modifications } = trashRecord;

  // 1. Determine collection for the main item
  let collectionName = type + 's';
  if (type === 'faculty') {
    collectionName = 'professors';
  }

  // 2. Re-create the main item
  batch.set(doc(db, collectionName, originalId), data);

  // 3. Re-create all cascaded schedules
  if (cascadedSchedules && cascadedSchedules.length > 0) {
    cascadedSchedules.forEach(sched => {
      batch.set(doc(db, 'schedules', String(sched.id)), sched);
    });
  }

  // 4. Reverse modifications using arrayUnion
  if (modifications) {
    if (modifications.modifiedProfessors && modifications.modifiedProfessors.length > 0) {
      modifications.modifiedProfessors.forEach(profId => {
        const updateData = {};
        if (type === 'subject') updateData.specialization = arrayUnion(data.id);
        if (type === 'room') updateData.preferredRooms = arrayUnion(data.id);
        if (type === 'section') updateData.assignedSections = arrayUnion(data.id);
        
        batch.update(doc(db, 'professors', String(profId)), updateData);
      });
    }

    if (modifications.modifiedSections && modifications.modifiedSections.length > 0) {
      modifications.modifiedSections.forEach(secId => {
        if (type === 'subject') {
          batch.update(doc(db, 'sections', String(secId)), {
            subjects: arrayUnion(data.id)
          });
        }
      });
    }
  }

  // 5. Delete the trash record
  batch.delete(doc(db, 'trash', String(trashRecord.id)));

  await batch.commit();
};
