import { 
  findScheduleConflicts, 
  isRoomAllowedFor, 
  slotsNeededFromIndex, 
  getTimeSlotIndex 
} from '../utils/scheduleUtils';
import { getScheduleConfig } from '../config/constants';

/**
 * Check if a timeslot fits the meeting duration.
 */
function checkSlotFits(timeSlot, hoursPerMeeting, scheduleMode) {
  const startIdx = getTimeSlotIndex(timeSlot, scheduleMode);
  if (startIdx < 0) return false;
  return slotsNeededFromIndex(startIdx, hoursPerMeeting, scheduleMode) > 0;
}

/**
 * Generates conflict resolution suggestions for a failed schedule entry.
 * 
 * @param {Object} failedEntry - The schedule entry that caused a conflict.
 * @param {Array} activeSchedules - All currently active schedules.
 * @param {Array} allRooms - All available rooms in the system.
 * @param {String} scheduleMode - 'standard' or 'fourDay'
 * @returns {Array} List of top suggestions.
 */
export function generateConflictResolutions(failedEntry, activeSchedules, allRooms, scheduleMode = 'standard') {
  const suggestions = [];
  const config = getScheduleConfig(scheduleMode);
  const activeTimeSlots = config.timeSlots;
  const days = config.days;

  // 1. STRATEGY: Alternate Room (Same time, same day)
  // Find rooms that are allowed for this subject/section
  if (failedEntry.subject && failedEntry.timeSlot) {
    const validRooms = allRooms.filter(room => 
      isRoomAllowedFor(room, failedEntry.subject, failedEntry.section)
    );

    for (const room of validRooms) {
      if (room.id === failedEntry.room?.id) continue;

      const testEntry = { ...failedEntry, room };
      
      // Explicitly exclude the failed entry's schedule ID (if it's an edit)
      const excludeScheduleId = failedEntry.excludeScheduleId || failedEntry.id;
      const conflicts = findScheduleConflicts(testEntry, activeSchedules, { excludeScheduleId });
      
      if (Object.keys(conflicts).length === 0) {
        suggestions.push({
          type: 'ALTERNATE_ROOM',
          score: 100, // High score for minimal disruption
          description: `Room ${failedEntry.room?.name || 'selected'} is unavailable. Use Room ${room.name} at the same time.`,
          suggestedEntry: testEntry
        });
      }
    }
  }

  // 2. STRATEGY: Alternate Time (Same room, different time/day)
  // Only attempt if room is defined
  if (failedEntry.room?.id && failedEntry.subject) {
    for (const day of days) {
      for (const slot of activeTimeSlots) {
        if (day === failedEntry.day && String(slot.id) === String(failedEntry.timeSlot?.id)) continue;

        // Skip if this timeslot doesn't have enough consecutive slots for the meeting duration
        if (!checkSlotFits(slot, failedEntry.subject?.hoursPerMeeting, scheduleMode)) continue;

        // Physical Education (PE) subjects cannot be scheduled in the first period.
        if (failedEntry.subject?.code?.toUpperCase().startsWith('PE') && String(slot.id) === '2') {
             continue;
        }

        const testEntry = { ...failedEntry, day, timeSlot: slot };
        const excludeScheduleId = failedEntry.excludeScheduleId || failedEntry.id;
        const conflicts = findScheduleConflicts(testEntry, activeSchedules, { excludeScheduleId });
        
        if (Object.keys(conflicts).length === 0) {
          const isSameDay = day === failedEntry.day;
          suggestions.push({
            type: 'ALTERNATE_TIME',
            score: isSameDay ? 80 : 60, // Prefer same day changes
            description: `Time slot is unavailable. Move to ${day} at ${slot.label} in the same room.`,
            suggestedEntry: testEntry
          });
        }
      }
    }
  }

  // 3. Rank and Return Top 3 Suggestions
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, 3);
}
