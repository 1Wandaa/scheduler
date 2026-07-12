export const buildSystemPrompt = (schedules, professors, rooms, sections, subjects) => {
    // ── Schedule entries ──
    const scheduleContext = schedules.map(s => {
      const subject = s.subject?.code || s.subject?.name || 'Unknown Subject';
      const section = s.section?.name || 'Unknown Section';
      const prof = s.professor?.name || 'Unknown Professor';
      const room = s.room?.name || 'Unknown Room';
      const day = s.day;
      const time = s.timeSlot?.label || 'Unknown Time';
      return `- ${subject} | Section: ${section} | Prof: ${prof} | Room: ${room} | ${day} ${time}`;
    }).join('\n');

    // ── Faculty overview ──
    const profContext = professors.map(p => {
      const specs = (p.specialization || []).join(', ') || 'None listed';
      const maxUnits = p.maxUnits || p.maxHours || '24';
      const dept = p.department || 'No Dept';
      // Calculate current load from schedules
      const profSchedules = schedules.filter(s => String(s.professor?.id) === String(p.id));
      const uniqueSubjects = new Map();
      profSchedules.forEach(s => {
        const k = `${s.subject?.id}__${s.section?.id}`;
        if (!uniqueSubjects.has(k)) {
          const creds = Number(s.subject?.credits);
          uniqueSubjects.set(k, isNaN(creds) ? 3 : creds);
        }
      });
      const currentLoad = Array.from(uniqueSubjects.values()).reduce((sum, c) => sum + c, 0);
      return `- **${p.name}** (${dept}) | Load: ${currentLoad}/${maxUnits} units | Specializations: ${specs}`;
    }).join('\n');

    // ── Rooms overview ──
    const roomContext = rooms.map(r => {
      const dept = r.department || 'SHARED';
      const cap = r.capacity || '?';
      const features = [];
      if (r.hasComputers) features.push('Computer Lab');
      if (r.isFoodLab) features.push('Food Lab');
      if ((r.name || '').toLowerCase().includes('stage')) features.push('Stage/Gym');
      const featureStr = features.length > 0 ? ` | Features: ${features.join(', ')}` : '';
      // Count how many classes are scheduled in this room
      const roomSchedules = schedules.filter(s => String(s.room?.id) === String(r.id));
      return `- **${r.name}** (${dept}) | Capacity: ${cap} | Scheduled: ${roomSchedules.length} classes${featureStr}`;
    }).join('\n');

    // ── Sections overview ──
    const sectionContext = (sections || []).map(sec => {
      const enrolledSubjects = (sec.subjects || []).map(subId => {
        const sub = (subjects || []).find(s => s.id === subId || s.code === subId);
        return sub ? (sub.code || sub.name) : subId;
      }).join(', ');
      const dept = sec.department || 'No Dept';
      const yearLevel = sec.yearLevel || '?';
      return `- **${sec.name}** (${dept}, Year ${yearLevel}) | Subjects: ${enrolledSubjects || 'None enrolled'}`;
    }).join('\n');

    // ── Subjects catalog ──
    const subjectContext = (subjects || []).map(sub => {
      const code = sub.code || 'NO_CODE';
      const name = sub.name || 'Unnamed';
      const credits = sub.credits ?? '?';
      const sem = sub.semester || 'Both';
      const features = [];
      if (sub.requiredLab) features.push('Requires Computer Lab');
      if (sub.isFoodLab) features.push('Requires Food Lab');
      const hoursPerMeeting = sub.hoursPerMeeting || '1.5';
      const featureStr = features.length > 0 ? ` | ${features.join(', ')}` : '';
      return `- **${code}** — ${name} | Credits: ${credits} | Hours/Meeting: ${hoursPerMeeting} | Semester: ${sem}${featureStr}`;
    }).join('\n');

    // ── Conflict detection ──
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
          const sec1 = s1.section?.name || '?';
          const sec2 = s2.section?.name || '?';
          const timeDesc = `${s1.day} at ${s1.timeSlot?.label}`;

          if (s1.room?.id && s1.room.id === s2.room?.id) {
            conflicts.push(`🔴 **ROOM CONFLICT**: ${s1.room.name} is double-booked — ${subj1} (${sec1}) vs ${subj2} (${sec2}) on ${timeDesc}`);
          }
          if (s1.professor?.id && s1.professor.id === s2.professor?.id) {
            conflicts.push(`🟠 **PROFESSOR CONFLICT**: ${s1.professor.name} is double-booked — ${subj1} (${sec1}) vs ${subj2} (${sec2}) on ${timeDesc}`);
          }
          if (s1.section?.id && s1.section.id === s2.section?.id) {
            conflicts.push(`🟡 **SECTION CONFLICT**: Section ${s1.section.name} is double-booked — ${subj1} vs ${subj2} on ${timeDesc}`);
          }
        }
      }
    });

    const uniqueConflicts = [...new Set(conflicts)];
    const conflictContext = uniqueConflicts.length > 0
      ? uniqueConflicts.join('\n')
      : '✅ No conflicts detected in the current schedule.';

    // ── Build available time slots per room (for conflict resolution) ──
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const roomAvailability = rooms.slice(0, 10).map(r => {
      const bookedSlots = schedules
        .filter(s => String(s.room?.id) === String(r.id))
        .map(s => `${s.day} ${s.timeSlot?.label}`)
        .join(', ');
      return `- ${r.name}: Booked at [${bookedSlots || 'NONE — fully available'}]`;
    }).join('\n');

    return `You are **SMARTSCHED Assistant**, an expert AI for the SMARTSCHED university class scheduling system.

## YOUR ROLE
You help administrators understand, analyze, and troubleshoot class schedules. You have access to the COMPLETE scheduling data below.

## RESPONSE RULES
1. **Be specific** — Always reference actual names, codes, days, and times from the data below. Never invent data.
2. **Format clearly** — Use **bold** for emphasis, bullet lists for multiple items, and numbered lists for steps.
3. **Be concise** — Summarize when the user asks general questions. Only list all data when explicitly asked.
4. **Stay on topic** — Only answer questions about scheduling, faculty, rooms, sections, and subjects. For anything else, politely redirect: "I can only help with scheduling-related questions."
5. **Admit gaps** — If the data doesn't contain what's needed, say "I don't have that information in the current schedule data" instead of guessing.
6. **Use emojis sparingly** — Only for conflict severity indicators (🔴 🟠 🟡 ✅).

## HOW TO ANSWER SPECIFIC QUESTION TYPES

### "Are there conflicts?" / "Show conflicts"
List each conflict with its type, affected entities, and time. Then for EACH conflict, suggest a concrete fix using the ROOM AVAILABILITY data below. Format:
- State the conflict
- Suggest moving one of the classes to a specific free room + time slot
- Explain why your suggestion works

### "Show schedule for [section/professor/room]"
Filter the schedule data and present it organized by day, in time order. Use a clean list format.

### "Who teaches [subject]?" / "What does [professor] teach?"
Cross-reference the schedule data to answer. Include section and time details.

### "What rooms/professors are available on [day]?"
Compare the scheduled data against all rooms/professors to find unbooked ones on that day.

### "How loaded is [professor]?" / "Faculty workload"
Show current units vs max units, list their assigned subjects/sections.

═══════════════════════════════════════════════════════
CURRENT SCHEDULE DATA (${schedules.length} class entries)
═══════════════════════════════════════════════════════
${scheduleContext || 'No classes scheduled yet.'}

═══════════════════════════════════════════════════════
DETECTED CONFLICTS
═══════════════════════════════════════════════════════
${conflictContext}

═══════════════════════════════════════════════════════
ROOM AVAILABILITY (for conflict resolution)
═══════════════════════════════════════════════════════
Available days: ${dayNames.join(', ')}
${roomAvailability || 'No room data available.'}

═══════════════════════════════════════════════════════
SECTIONS (${(sections || []).length} sections)
═══════════════════════════════════════════════════════
${sectionContext || 'No section data available.'}

═══════════════════════════════════════════════════════
SUBJECTS CATALOG (${(subjects || []).length} subjects)
═══════════════════════════════════════════════════════
${subjectContext || 'No subject data available.'}

═══════════════════════════════════════════════════════
FACULTY (${professors.length} professors)
═══════════════════════════════════════════════════════
${profContext || 'No faculty data available.'}

═══════════════════════════════════════════════════════
ROOMS (${rooms.length} rooms)
═══════════════════════════════════════════════════════
${roomContext || 'No room data available.'}`;
};
