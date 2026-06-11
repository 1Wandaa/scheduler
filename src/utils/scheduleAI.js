/**
 * scheduleAI.js — Gemini AI helpers for scheduling optimization
 *
 * Uses Firebase AI Logic (Gemini 2.5 Flash) already configured in the project
 * to improve scheduling accuracy through:
 *   1. Smart professor-subject matching (pre-processing)
 *   2. Intelligent failure analysis with concrete prescriptions (post-processing)
 */

import { generativeModel } from '../config/firebase';
import { SchemaType } from 'firebase/ai';

/**
 * Ask Gemini to semantically rank which professors are the best fit for each
 * subject. This replaces the naive string-matching in the GA with contextual
 * understanding (e.g. a "Database Systems" professor can teach "Advanced SQL").
 *
 * @param {Array} professors - [{ id, name, specialization: [subjectId, ...], department, maxUnits }]
 * @param {Array} subjects   - [{ id, code, name, departments: [...], credits, requiredLab }]
 * @param {Array} sections   - [{ id, name, subjects: [subjectId, ...] }]
 * @returns {Object|null} Map of subjectId → ranked array of professorIds, or null on failure
 */
export async function suggestProfessorMatches(professors, subjects, sections) {
  if (!professors?.length || !subjects?.length) return null;

  try {
    // Build a compact text representation to minimize tokens
    const profSummary = professors.map(p => {
      const specs = (p.specialization || []).map(specId => {
        const sub = subjects.find(s => s.id === specId);
        return sub ? `${sub.code} (${sub.name})` : specId;
      });
      return `- Prof "${p.name}" [ID:${p.id}] dept:${p.department || '?'}, max:${p.maxUnits || 12} units, assigned subjects: [${specs.join(', ')}]`;
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

    const prompt = `You are a university scheduling assistant. Given the professors and subjects below, evaluate which professors are the best fit for each subject.

RULES:
1. A professor is a STRONG match if they are explicitly assigned to the subject (it appears in their "assigned subjects" list).
2. A professor is a GOOD match if their assigned subjects are semantically related (e.g. "Data Structures" professor can teach "Algorithms", "Database Systems" professor can teach "Advanced SQL").
3. A professor is a WEAK match if they are in the same department but have no related specialization.
4. Do NOT include professors who have zero relevance to the subject.
5. Only include subjects that are actually needed: [${[...neededSubjectIds].join(', ')}]
6. Rank the professor IDs from best fit to worst fit.

PROFESSORS:
${profSummary}

SUBJECTS:
${subSummary}`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1, // Low temperature for consistent, logical output
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              subjectId: { type: SchemaType.STRING },
              professorIds: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
            },
            required: ["subjectId", "professorIds"]
          }
        }
      },
    });

    const responseText = result.response.text();
    const parsedArray = JSON.parse(responseText);

    // Validate: ensure all IDs actually exist
    const validProfIds = new Set(professors.map(p => p.id));
    const validSubIds = new Set(subjects.map(s => s.id));
    const cleaned = {};

    for (const item of parsedArray) {
      if (!item || !item.subjectId || !Array.isArray(item.professorIds)) continue;
      if (!validSubIds.has(item.subjectId)) continue;
      
      const profs = item.professorIds.filter(pid => validProfIds.has(pid));
      if (profs.length > 0) {
        cleaned[item.subjectId] = profs;
      }
    }

    console.log('[AI] Professor matching complete:', Object.keys(cleaned).length, 'subjects mapped');
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  } catch (error) {
    console.warn('[AI] Professor matching failed, falling back to default:', error.message);
    return null; // Graceful fallback — GA will use its existing string-matching
  }
}

/**
 * Ask Gemini to analyze why certain subjects could not be scheduled,
 * and produce actionable prescriptions with CONCRETE suggestions
 * (specific rooms, times, professors from the actual available data).
 *
 * @param {Array} unscheduled - [{ subject, section, reason, professor?, room? }]
 * @param {Array} professors  - Full professor list
 * @param {Array} rooms       - Full room list
 * @param {Array} sections    - Full section list
 * @param {Array} scheduled   - Successfully scheduled items for context
 * @returns {Array|null} Array of prescription objects, or null
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

    // Resource summary — professor workload
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
      const remaining = Math.round((max - used) * 10) / 10;
      const specs = (p.specialization || []).length;
      return `- ${p.name} [${p.id}]: ${used}/${max} units (${remaining} remaining), dept:${p.department || '?'}, ${specs} subjects assigned`;
    }).join('\n');

    // Room availability — compute idle slots per room
    const roomSlotUsage = {};
    const totalSlots = 5 * 9; // 5 days × 9 time slots
    for (const r of rooms) roomSlotUsage[r.id] = 0;
    for (const s of (scheduled || [])) {
      if (s.room?.id) roomSlotUsage[s.room.id] = (roomSlotUsage[s.room.id] || 0) + 1;
    }

    const roomContext = rooms.map(r => {
      const used = roomSlotUsage[r.id] || 0;
      const free = totalSlots - used;
      return `- ${r.name} [${r.id}]: dept:${r.department || 'SHARED'}, lab:${r.hasComputers ? 'yes' : 'no'}, ${used}/${totalSlots} slots used (${free} free)`;
    }).join('\n');

    const prompt = `You are a university scheduling assistant. The auto-scheduler failed to place certain classes. Analyze each failure and provide CONCRETE prescriptions — specific rooms, times, and professors that could work.

CRITICAL RULES:
1. Every failed class MUST get at least one actionable prescription. No class should be left without a solution.
2. Prescriptions should reference REAL room names, professor names, and time slots from the data below.
3. If the original room/professor is unavailable, suggest overflow alternatives from OTHER departments.
4. If professor workload is the issue, suggest increasing their max units or reassigning to a less-loaded professor.
5. Prefer rooms with more free slots. Prefer professors with more remaining capacity.

FAILED CLASSES:
${failureText}

PROFESSOR WORKLOADS:
${profContext}

ROOM AVAILABILITY:
${roomContext}

TIME SLOTS: 7:30-8:30, 8:30-9:30, 9:30-10:30, 10:30-11:30, 11:30-12:00, 1:00-2:00, 2:00-3:00, 3:00-4:00, 4:00-5:00

For each failed class, provide a specific prescription with suggested room, day, time, and professor.`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 3072,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              subject: { type: SchemaType.STRING },
              section: { type: SchemaType.STRING },
              problem: { type: SchemaType.STRING },
              solutions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              suggestedRoom: { type: SchemaType.STRING },
              suggestedDay: { type: SchemaType.STRING },
              suggestedTime: { type: SchemaType.STRING },
              suggestedProfessor: { type: SchemaType.STRING },
            },
            required: ["subject", "section", "problem", "solutions"]
          }
        }
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log('[AI] Prescription analysis complete:', parsed.length, 'prescriptions generated');
      return parsed;
    }
    return null;
  } catch (error) {
    console.warn('[AI] Prescription analysis failed:', error.message);
    return null; // Non-critical — UI just won't show AI insights
  }
}
