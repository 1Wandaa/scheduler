/**
 * scheduleAI.js — Gemini AI helpers for scheduling optimization
 *
 * Uses Firebase AI Logic (Gemini 2.5 Flash) already configured in the project
 * to improve scheduling accuracy through:
 *   1. Smart professor-subject matching (pre-processing)
 *   2. Pre-flight constraint validation (pre-processing)
 *   3. Room assignment hints (pre-processing)
 *   4. Intelligent failure analysis (post-processing)
 *   5. Schedule quality scoring (post-processing)
 *   6. Swap suggestions (post-processing)
 */

import { generativeModel } from '../config/firebase';

/**
 * Ask Gemini to semantically rank which professors are the best fit for each
 * subject. Enhanced with workload awareness and diversity instructions.
 *
 * @param {Array} professors - [{ id, name, specialization: [subjectId, ...], department, maxUnits }]
 * @param {Array} subjects   - [{ id, code, name, departments: [...], credits, requiredLab }]
 * @param {Array} sections   - [{ id, name, subjects: [subjectId, ...] }]
 * @param {Array} existingSchedules - Currently scheduled entries for workload context
 * @returns {Object|null} Map of subjectId → ranked array of professorIds, or null on failure
 */
export async function suggestProfessorMatches(professors, subjects, sections, existingSchedules = []) {
  if (!professors?.length || !subjects?.length) return null;

  try {
    // Calculate current workload for each professor
    const profLoad = {};
    const profSubjects = {};
    for (const s of existingSchedules) {
      if (s.professor?.id && s.subject?.id) {
        const key = `${s.professor.id}`;
        const subKey = `${s.subject.id}_${s.section?.id || 'x'}`;
        if (!profSubjects[key]) profSubjects[key] = new Set();
        if (!profSubjects[key].has(subKey)) {
          profSubjects[key].add(subKey);
          profLoad[key] = (profLoad[key] || 0) + (Number(s.subject?.credits) || 3);
        }
      }
    }

    // Build a compact text representation to minimize tokens
    const profSummary = professors.map(p => {
      const specs = (p.specialization || []).map(specId => {
        const sub = subjects.find(s => s.id === specId);
        return sub ? `${sub.code} (${sub.name})` : specId;
      });
      const maxUnits = Number(p.maxUnits) || 12;
      const usedUnits = Math.round((profLoad[p.id] || 0) * 10) / 10;
      const remaining = Math.max(0, maxUnits - usedUnits);
      return `- Prof "${p.name}" [ID:${p.id}] dept:${p.department || '?'}, max:${maxUnits} units, used:${usedUnits}, remaining:${remaining}, assigned subjects: [${specs.join(', ')}]`;
    }).join('\n');

    const subSummary = subjects.map(s =>
      `- "${s.code}: ${s.name}" [ID:${s.id}] dept:${(s.departments || []).join(',') || s.department || '?'}, ${s.credits || 3} units, lab:${s.requiredLab ? 'yes' : 'no'}`
    ).join('\n');

    // Identify which subjects actually need scheduling
    const neededSubjectIds = new Set();
    for (const sec of (sections || [])) {
      for (const subId of (sec.subjects || [])) {
        neededSubjectIds.add(subId);
      }
    }

    const prompt = `You are a university scheduling assistant. Given the professors and subjects below, produce a JSON object that maps each subject ID to a RANKED array of professor IDs, from best fit to worst fit.

RULES:
1. A professor is a STRONG match if they are explicitly assigned to the subject (it appears in their "assigned subjects" list).
2. A professor is a GOOD match if their assigned subjects are semantically related (e.g. "Data Structures" professor can teach "Algorithms", "Database Systems" professor can teach "Advanced SQL").
3. A professor is a WEAK match if they are in the same department but have no related specialization.
4. Do NOT include professors who have zero relevance to the subject.
5. Only include subjects that are actually needed: [${[...neededSubjectIds].join(', ')}]
6. WORKLOAD AWARENESS: Deprioritize professors who have very little remaining capacity. Professors with 0 remaining units should appear last or be excluded.
7. DIVERSITY: Try to spread assignments across professors rather than overloading the best-fit ones. If two professors are similarly qualified, prefer the one with more remaining capacity.
8. Return ONLY valid JSON — no markdown, no explanation.

PROFESSORS:
${profSummary}

SUBJECTS:
${subSummary}

Return format: { "subjectId1": ["profId_best", "profId_good", ...], "subjectId2": [...] }`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    // Validate: ensure all IDs actually exist
    const validProfIds = new Set(professors.map(p => p.id));
    const validSubIds = new Set(subjects.map(s => s.id));
    const cleaned = {};

    for (const [subId, profIds] of Object.entries(parsed)) {
      if (!validSubIds.has(subId)) continue;
      if (!Array.isArray(profIds)) continue;
      cleaned[subId] = profIds.filter(pid => validProfIds.has(pid));
    }

    console.log('[AI] Professor matching complete:', Object.keys(cleaned).length, 'subjects mapped');
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  } catch (error) {
    console.warn('[AI] Professor matching failed, falling back to default:', error.message);
    return null;
  }
}

/**
 * Phase 3.1: Pre-flight validation — check data integrity before running the GA.
 * Identifies potential issues that would cause scheduling failures.
 *
 * @param {Array} professors
 * @param {Array} subjects
 * @param {Array} sections
 * @param {Array} rooms
 * @returns {Object|null} { warnings: [...], blockers: [...] } or null
 */
export async function validateScheduleSetup(professors, subjects, sections, rooms) {
  if (!professors?.length || !subjects?.length || !sections?.length || !rooms?.length) {
    return {
      warnings: [],
      blockers: ['Missing required data: ensure professors, subjects, sections, and rooms are all defined.']
    };
  }

  try {
    // Build compact summaries
    const profSummary = professors.map(p => {
      const specs = (p.specialization || []).join(', ');
      return `"${p.name}" [${p.id}]: dept=${p.department || '?'}, max=${p.maxUnits || 12}, specs=[${specs}]`;
    }).join('\n');

    const subSummary = subjects.map(s =>
      `"${s.code}: ${s.name}" [${s.id}]: dept=${(s.departments || []).join(',') || s.department || '?'}, ${s.credits || 3} units, lab=${s.requiredLab ? 'yes' : 'no'}`
    ).join('\n');

    const secSummary = sections.map(sec =>
      `"${sec.name}" [${sec.id}]: subjects=[${(sec.subjects || []).join(', ')}]`
    ).join('\n');

    const roomSummary = `${rooms.length} rooms total (${rooms.filter(r => r.hasComputers).length} computer labs, ${rooms.filter(r => (r.name || '').toUpperCase().includes('GYM')).length} gyms)`;

    const prompt = `You are a university scheduling system pre-flight checker. Analyze the following data and identify issues that would prevent successful automatic scheduling.

PROFESSORS:
${profSummary}

SUBJECTS:
${subSummary}

SECTIONS:
${secSummary}

ROOMS: ${roomSummary}

Check for these issues:
1. BLOCKER: Any subject that a section needs but NO professor is qualified to teach (check specializations)
2. BLOCKER: Lab-required subjects but no computer lab rooms available
3. WARNING: Professors with very few subjects assigned (under-utilized)
4. WARNING: Subjects assigned to many sections that may overwhelm the available time slots
5. WARNING: Professors whose maxUnits is too low for the number of subjects they must teach

Return ONLY valid JSON — no markdown:
{ "warnings": ["warning message 1", ...], "blockers": ["blocker message 1", ...] }`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    console.log('[AI] Pre-flight check complete:', (parsed.blockers?.length || 0), 'blockers,', (parsed.warnings?.length || 0), 'warnings');
    return {
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
    };
  } catch (error) {
    console.warn('[AI] Pre-flight check failed:', error.message);
    return null;
  }
}

/**
 * Phase 3.3: Ask Gemini to suggest professor-room pairings for the affinity system.
 *
 * @param {Array} professors
 * @param {Array} subjects
 * @param {Array} rooms
 * @param {Array} existingSchedules - For context on current patterns
 * @returns {Object|null} Map of professorId → suggested roomId
 */
export async function suggestRoomAssignments(professors, subjects, rooms, existingSchedules = []) {
  if (!professors?.length || !rooms?.length) return null;

  try {
    const profSummary = professors.map(p => {
      const specs = (p.specialization || []).map(specId => {
        const sub = subjects.find(s => s.id === specId);
        return sub ? `${sub.code} (lab:${sub.requiredLab ? 'yes' : 'no'})` : specId;
      });
      return `"${p.name}" [${p.id}]: dept=${p.department || '?'}, teaches=[${specs.join(', ')}]`;
    }).join('\n');

    const roomSummary = rooms.map(r =>
      `"${r.name}" [${r.id}]: type=${r.type || 'lecture'}, lab=${r.hasComputers ? 'yes' : 'no'}, building=${r.building || '?'}`
    ).join('\n');

    // Existing patterns
    const existingPatterns = {};
    for (const s of existingSchedules) {
      if (s.professor?.id && s.room?.id) {
        existingPatterns[s.professor.id] = s.room.id;
      }
    }
    const patternText = Object.entries(existingPatterns).map(([pid, rid]) => {
      const p = professors.find(p => p.id === pid);
      const r = rooms.find(r => r.id === rid);
      return p && r ? `${p.name} → ${r.name}` : null;
    }).filter(Boolean).join(', ');

    const prompt = `You are a university room assignment advisor. Each professor should ideally teach ALL their classes in a SINGLE room for convenience.

PROFESSORS:
${profSummary}

ROOMS:
${roomSummary}

${patternText ? `EXISTING PATTERNS: ${patternText}` : ''}

RULES:
1. Professors who teach lab subjects MUST be assigned to a room with computers.
2. PE professors should be assigned to a Gym if available.
3. Respect existing patterns when possible.
4. Balance room usage — don't assign all professors to the same room.
5. Consider department/building alignment if building info is available.

Return ONLY valid JSON mapping professor IDs to room IDs:
{ "profId1": "roomId1", "profId2": "roomId2" }`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    // Validate IDs
    const validProfIds = new Set(professors.map(p => p.id));
    const validRoomIds = new Set(rooms.map(r => r.id));
    const cleaned = {};

    for (const [profId, roomId] of Object.entries(parsed)) {
      if (validProfIds.has(profId) && validRoomIds.has(roomId)) {
        cleaned[profId] = roomId;
      }
    }

    console.log('[AI] Room assignment hints:', Object.keys(cleaned).length, 'professors mapped');
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  } catch (error) {
    console.warn('[AI] Room assignment suggestion failed:', error.message);
    return null;
  }
}

/**
 * Ask Gemini to analyze why certain subjects could not be scheduled,
 * and produce actionable recommendations for the user.
 *
 * @param {Array} unscheduled - [{ subject, section, reason, professor?, room? }]
 * @param {Array} professors  - Full professor list
 * @param {Array} rooms       - Full room list
 * @param {Array} sections    - Full section list
 * @param {Array} scheduled   - Successfully scheduled items for context
 * @returns {Array|null} Array of { subject, section, problem, solutions: string[] }, or null
 */
export async function analyzeScheduleFailures(unscheduled, professors, rooms, sections, scheduled = []) {
  if (!unscheduled?.length) return null;

  try {
    // Build compact failure descriptions
    const failureText = unscheduled.map((item, i) => {
      const sub = item.subject?.code || item.subject?.name || 'Unknown';
      const sec = item.section?.name || '?';
      const reason = item.reason || 'Unknown conflict';
      const prof = item.professor?.name || 'unassigned';
      const room = item.room?.name || 'unassigned';
      return `${i + 1}. ${sub} for ${sec} — reason: "${reason}" (prof: ${prof}, room: ${room})`;
    }).join('\n');

    // Resource summary
    const profLoad = {};
    for (const s of (scheduled || [])) {
      if (s.professor?.id) {
        const credits = Number(s.subject?.credits || 3) / Math.max(1, Math.ceil(Number(s.subject?.credits || 3) / (Number(s.subject?.hoursPerMeeting) || 1.5)));
        profLoad[s.professor.id] = (profLoad[s.professor.id] || 0) + credits;
      }
    }

    const profContext = professors.map(p => {
      const max = Number(p.maxUnits) || Number(p.maxHours) || 12;
      const used = Math.round((profLoad[p.id] || 0) * 10) / 10;
      const specs = (p.specialization || []).length;
      return `- ${p.name} [${p.id}]: ${used}/${max} units used, ${specs} subjects assigned`;
    }).join('\n');

    const roomContext = `${rooms.length} rooms total (${rooms.filter(r => r.hasComputers).length} computer labs)`;

    const prompt = `You are a university scheduling assistant. The auto-scheduler failed to place certain classes. Analyze each failure and provide specific, actionable solutions.

FAILED CLASSES:
${failureText}

PROFESSOR WORKLOADS:
${profContext}

ROOMS: ${roomContext}

For each failed class, provide:
1. A clear explanation of the root cause
2. 1-3 specific actions the administrator can take to resolve it

Return ONLY valid JSON array — no markdown, no extra text.
Format: [{ "subject": "CODE", "section": "SECTION_NAME", "problem": "clear explanation", "solutions": ["action 1", "action 2"] }]`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log('[AI] Failure analysis complete:', parsed.length, 'insights generated');
      return parsed;
    }
    return null;
  } catch (error) {
    console.warn('[AI] Failure analysis failed:', error.message);
    return null;
  }
}

/**
 * Phase 4.1: Generate a schedule quality report after a successful GA run.
 *
 * @param {Array} schedule    - Successfully scheduled items
 * @param {Array} professors
 * @param {Array} rooms
 * @param {Array} sections
 * @returns {Object|null} { grade, summary, details: { workload, rooms, pairing, consistency } }
 */
export async function generateScheduleQualityReport(schedule, professors, rooms, sections) {
  if (!schedule?.length) return null;

  try {
    // Compute stats for Gemini
    const profLoad = {};
    const profRooms = {};
    for (const s of schedule) {
      if (s.professor?.id) {
        const subKey = `${s.subject?.id}_${s.section?.id}`;
        if (!profLoad[s.professor.id]) profLoad[s.professor.id] = new Set();
        profLoad[s.professor.id].add(subKey);
      }
      if (s.professor?.id && s.room?.id) {
        if (!profRooms[s.professor.id]) profRooms[s.professor.id] = new Set();
        profRooms[s.professor.id].add(s.room.id);
      }
    }

    const profStats = professors.map(p => {
      const max = Number(p.maxUnits) || 12;
      const uniqueSubs = profLoad[p.id]?.size || 0;
      const roomCount = profRooms[p.id]?.size || 0;
      const roomList = profRooms[p.id] ? [...profRooms[p.id]].map(rid => rooms.find(r => r.id === rid)?.name || rid).join(', ') : 'none';
      return `${p.name}: ${uniqueSubs} subjects, max ${max} units, ${roomCount} room(s) [${roomList}]`;
    }).join('\n');

    // Day distribution
    const dayDist = {};
    for (const s of schedule) {
      dayDist[s.day] = (dayDist[s.day] || 0) + 1;
    }
    const dayText = Object.entries(dayDist).map(([d, c]) => `${d}: ${c}`).join(', ');

    const prompt = `You are a university schedule quality evaluator. Analyze the following schedule and produce a quality report.

SCHEDULE STATS:
- Total classes scheduled: ${schedule.length}
- Day distribution: ${dayText}

PROFESSOR STATS:
${profStats}

QUALITY CRITERIA:
1. WORKLOAD FAIRNESS: Are professors evenly loaded? Is anyone over/under-utilized?
2. ROOM CONSISTENCY: Does each professor teach in a single room (ideal) or multiple rooms?
3. DAY BALANCE: Are classes spread evenly across the week?
4. Overall quality grade (A/B/C/D/F) with brief justification.

Return ONLY valid JSON:
{
  "grade": "A",
  "summary": "Brief 1-2 sentence overall assessment",
  "details": {
    "workload": "Assessment of professor workload fairness",
    "roomConsistency": "Assessment of professor-room consistency",
    "dayBalance": "Assessment of weekly distribution"
  }
}`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    console.log('[AI] Quality report generated — Grade:', parsed.grade);
    return parsed;
  } catch (error) {
    console.warn('[AI] Quality report failed:', error.message);
    return null;
  }
}

/**
 * Phase 4.2: Suggest specific swaps to improve schedule quality.
 *
 * @param {Array} schedule
 * @param {Array} professors
 * @param {Array} rooms
 * @returns {Array|null} [{ description, reason, impact }]
 */
export async function suggestScheduleSwaps(schedule, professors, rooms) {
  if (!schedule?.length) return null;

  try {
    const scheduleText = schedule.slice(0, 30).map((s, i) =>
      `${i + 1}. ${s.subject?.code} (${s.section?.name}) → Prof: ${s.professor?.name}, Room: ${s.room?.name}, ${s.day} ${s.timeSlot?.label}`
    ).join('\n');

    const prompt = `You are a university schedule optimizer. Analyze this schedule and suggest 2-3 specific SWAPS that would improve it.

CURRENT SCHEDULE (first 30 entries):
${scheduleText}

Focus on:
1. Moving a professor's class to their most-used room for consistency
2. Reducing gaps in a section's daily schedule
3. Better distributing classes across the week

Return ONLY valid JSON array:
[{ "description": "Swap X with Y", "reason": "Why this improves the schedule", "impact": "high/medium/low" }]`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log('[AI] Swap suggestions:', parsed.length, 'suggestions');
      return parsed;
    }
    return null;
  } catch (error) {
    console.warn('[AI] Swap suggestions failed:', error.message);
    return null;
  }
}


