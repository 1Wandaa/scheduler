export const buildSystemPrompt = (schedules, professors, rooms, sections) => {
    // Build a rich text representation of the current state
    const scheduleContext = schedules.map(s => {
      const subject = s.subject?.code || s.subject?.name || 'Unknown Subject';
      const section = s.section?.name || 'Unknown Section';
      const prof = s.professor?.name || 'Unknown Professor';
      const room = s.room?.name || 'Unknown Room';
      const day = s.day;
      const time = s.timeSlot?.label || 'Unknown Time';
      return `- ${subject} for section ${section} is taught by ${prof} in ${room} on ${day} at ${time}.`;
    }).join('\n');

    const profContext = professors.map(p => `- ${p.name} (${p.department || 'No Dept'}). Specs: ${(p.specialization || []).length} subjects.`).join('\n');
    const roomContext = rooms.map(r => `- ${r.name} (${r.department || 'SHARED'}). Cap: ${r.capacity || '?'}.`).join('\n');

    // --- Conflict Detection ---
    const conflicts = [];
    const timeMap = {};
    
    schedules.forEach(s => {
      if (!s.day || !s.timeSlot?.id) return;
      const key = `${s.day}_${s.timeSlot.id}`;
      if (!timeMap[key]) timeMap[key] = [];
      timeMap[key].push(s);
    });

    Object.values(timeMap).forEach(slotSchedules => {
      if (slotSchedules.length < 2) return;
      
      for (let i = 0; i < slotSchedules.length; i++) {
        for (let j = i + 1; j < slotSchedules.length; j++) {
          const s1 = slotSchedules[i];
          const s2 = slotSchedules[j];
          
          const subj1 = s1.subject?.code || s1.subject?.name;
          const subj2 = s2.subject?.code || s2.subject?.name;
          const timeDesc = `on ${s1.day} at ${s1.timeSlot?.label}`;

          if (s1.room?.id && s1.room.id === s2.room?.id) {
            conflicts.push(`ROOM CONFLICT: ${s1.room.name} is double-booked for ${subj1} and ${subj2} ${timeDesc}.`);
          }
          if (s1.professor?.id && s1.professor.id === s2.professor?.id) {
            conflicts.push(`PROFESSOR CONFLICT: ${s1.professor.name} is double-booked for ${subj1} and ${subj2} ${timeDesc}.`);
          }
          if (s1.section?.id && s1.section.id === s2.section?.id) {
            conflicts.push(`SECTION CONFLICT: Section ${s1.section.name} is double-booked for ${subj1} and ${subj2} ${timeDesc}.`);
          }
        }
      }
    });
    
    // Deduplicate conflicts
    const uniqueConflicts = [...new Set(conflicts)];
    const conflictContext = uniqueConflicts.length > 0 
      ? uniqueConflicts.join('\n') 
      : 'No conflicts detected in the current schedule.';

    return `You are an expert AI assistant for the SMARTSCHED university scheduling system.
Your job is to answer questions about the schedule, faculty, rooms, and subjects.
Be extremely helpful, concise, and format your answers beautifully using markdown (like **bold** or bullet points).

--- CURRENT SCHEDULE (${schedules.length} classes) ---
${scheduleContext || 'There are no classes scheduled yet.'}

--- DETECTED CONFLICTS ---
If the user asks about conflicts or how to fix them, you MUST suggest alternative schedules based on the OVERVIEWS below. Suggest an alternative room, professor, or time that fixes the conflict.
${conflictContext}

--- FACULTY OVERVIEW (${professors.length} professors) ---
${profContext || 'No faculty data.'}

--- ROOMS OVERVIEW (${rooms.length} rooms) ---
${roomContext || 'No room data.'}

Do not list all data unless explicitly asked. Summarize when appropriate.`;
};
