/**
 * scheduleAI.js — Gemini AI helpers for scheduling optimization
 *
 * Uses Firebase AI Logic (Gemini 2.5 Flash) already configured in the project
 * to improve scheduling accuracy through:
 *   1. Smart professor-subject matching (pre-processing) — ranks within GA-feasible pool
 *   2. Intelligent failure analysis with concrete prescriptions (post-processing)
 */

import { generativeModel } from '../config/firebase';
import { SchemaType } from 'firebase/ai';
import { DAYS, TIME_SLOTS } from '../config/constants';
import {
  getEligibleProfessors,
  applyAIRanking,
  creditPerMeeting,
  getOccupiedSlots,
  schedulesOverlap,
} from './scheduleUtils';

/**
 * Build eligible professor pools per subject (union across all sections needing that subject).
 * Returns { subjectId: [professor, ...] }
 */
export function buildEligibleProfessorPools(professors, subjects, sections) {
  const pools = {};
  const subjectById = Object.fromEntries(subjects.map(s => [s.id, s]));
  const subjectByCode = Object.fromEntries(subjects.map(s => [s.code, s]));

  for (const sec of (sections || [])) {
    for (const subRef of (sec.subjects || [])) {
      const subject = subjectById[subRef] || subjectByCode[subRef];
      if (!subject) continue;

      const eligible = getEligibleProfessors(professors, subject, sec);
      if (!pools[subject.id]) pools[subject.id] = new Map();
      for (const p of eligible) pools[subject.id].set(p.id, p);
    }
  }

  const result = {};
  for (const [subId, profMap] of Object.entries(pools)) {
    result[subId] = [...profMap.values()];
  }
  return result;
}

/**
 * Ask Gemini to semantically rank which professors are the best fit for each
 * subject. AI output is post-filtered to only include GA-feasible professors.
 *
 * @returns {Object|null} Map of subjectId → ranked array of professorIds, or null on failure
 */
export async function suggestProfessorMatches(professors, subjects, sections, scheduled = []) {
  if (!professors?.length || !subjects?.length) return null;

  try {
    const eligiblePools = buildEligibleProfessorPools(professors, subjects, sections);

    // Professor workload from existing schedules
    const profLoad = {};
    for (const s of (scheduled || [])) {
      if (s.professor?.id) {
        profLoad[s.professor.id] = (profLoad[s.professor.id] || 0) + creditPerMeeting(s.subject);
      }
    }

    const sectionNameById = Object.fromEntries((sections || []).map(s => [s.id, s.name]));

    const profSummary = professors.map(p => {
      const specs = (p.specialization || []).map(specRef => {
        const sub = subjects.find(s => s.id === specRef || s.code === specRef);
        return sub ? `${sub.code} [${sub.id}]` : specRef;
      });
      const assignedSecNames = (p.assignedSections || [])
        .map(id => sectionNameById[id] || id)
        .join(', ') || 'any section';
      const max = Number(p.maxUnits) || Number(p.maxHours) || 12;
      const used = Math.round((profLoad[p.id] || 0) * 10) / 10;
      return `- Prof "${p.name}" [ID:${p.id}] dept:${p.department || '?'}, workload:${used}/${max} units, assigned sections: [${assignedSecNames}], specializations: [${specs.join(', ')}]`;
    }).join('\n');

    const subSummary = subjects.map(s =>
      `- "${s.code}: ${s.name}" [ID:${s.id}] dept:${(s.departments || []).join(',') || s.department || '?'}, ${s.credits || 3} units, ${s.hoursPerMeeting || 1.5}hr/meeting, lab:${s.requiredLab ? 'yes' : 'no'}`
    ).join('\n');

    const sectionContext = (sections || []).map(sec => {
      const subRefs = (sec.subjects || []).map(ref => {
        const sub = subjects.find(s => s.id === ref || s.code === ref);
        return sub ? `${sub.code} [${sub.id}]` : ref;
      });
      return `- Section "${sec.name}" [ID:${sec.id}]: subjects [${subRefs.join(', ')}]`;
    }).join('\n');

    const eligibleSummary = Object.entries(eligiblePools).map(([subId, pool]) => {
      const sub = subjects.find(s => s.id === subId);
      const ids = pool.map(p => p.id).join(', ');
      return `- ${sub?.code || subId} [${subId}]: eligible professor IDs only: [${ids}]`;
    }).join('\n');

    const neededSubjectIds = Object.keys(eligiblePools);

    const prompt = `You are a university scheduling assistant. Rank professors for each subject to guide a genetic algorithm scheduler.

SCHEDULER CONSTRAINTS (you must respect these):
1. Only professors listed in the ELIGIBLE POOLS below may be ranked for each subject — never suggest IDs outside that pool.
2. A professor with assigned sections can ONLY teach those sections for that subject.
3. One professor must teach ALL meetings of a subject for a given section (no mixed assignments).
4. Meeting days should pair Mon↔Thu or Tue↔Fri when a subject meets twice per week.
5. All meetings of the same subject+section share the same room and time slot on different days.
6. Lab subjects (lab:yes) require rooms with computers.
7. Prefer professors with more remaining workload capacity.

RANKING RULES:
1. STRONG match: subject appears in professor's specialization list.
2. GOOD match: semantically related specialization in the same department.
3. WEAK match: same department, limited relevance — rank last within the eligible pool.
4. Only rank professors from the eligible pool for each subject.
5. Return subjectId using the exact ID from the subject list (e.g. "S01"), not the code.

ELIGIBLE POOLS (hard constraint — only these IDs are valid per subject):
${eligibleSummary || '(none)'}

SECTIONS NEEDING SCHEDULING:
${sectionContext || '(none)'}

PROFESSORS:
${profSummary}

SUBJECTS:
${subSummary}

Only include these subject IDs: [${neededSubjectIds.join(', ')}]
Rank professor IDs from best fit to worst fit within each subject's eligible pool.`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
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

    const parsedArray = JSON.parse(result.response.text());
    const validProfIds = new Set(professors.map(p => p.id));
    const cleaned = {};

    for (const item of parsedArray) {
      if (!item?.subjectId || !Array.isArray(item.professorIds)) continue;
      if (!eligiblePools[item.subjectId]) continue;

      const aiRanked = item.professorIds.filter(pid => validProfIds.has(pid));
      const ranked = applyAIRanking(eligiblePools[item.subjectId], aiRanked);
      if (ranked.length > 0) {
        cleaned[item.subjectId] = ranked.map(p => p.id);
      }
    }

    // Ensure every eligible subject has at least its base pool (AI may have omitted some)
    for (const [subId, pool] of Object.entries(eligiblePools)) {
      if (!cleaned[subId] && pool.length > 0) {
        cleaned[subId] = pool.map(p => p.id);
      }
    }

    console.log('[AI] Professor matching complete:', Object.keys(cleaned).length, 'subjects mapped');
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  } catch (error) {
    console.warn('[AI] Professor matching failed, falling back to default:', error.message);
    return null;
  }
}

/**
 * Validate AI prescription suggestions against real data and schedule state.
 */
export function validatePrescriptions(prescriptions, rooms, professors, scheduled = []) {
  if (!prescriptions?.length) return [];

  const roomById = Object.fromEntries(rooms.map(r => [r.id, r]));
  const roomByName = Object.fromEntries(rooms.map(r => [r.name?.toLowerCase(), r]));
  const profById = Object.fromEntries(professors.map(p => [p.id, p]));
  const profByName = Object.fromEntries(professors.map(p => [p.name?.toLowerCase(), p]));
  const slotById = Object.fromEntries(TIME_SLOTS.map(ts => [String(ts.id), ts]));
  const slotByLabel = Object.fromEntries(TIME_SLOTS.map(ts => [ts.label?.toLowerCase(), ts]));

  return prescriptions.map(rx => {
    const validated = { ...rx, validated: false, validationWarnings: [] };

    const room = rx.suggestedRoomId
      ? roomById[rx.suggestedRoomId]
      : roomByName[rx.suggestedRoom?.toLowerCase()];
    const professor = rx.suggestedProfessorId
      ? profById[rx.suggestedProfessorId]
      : profByName[rx.suggestedProfessor?.toLowerCase()];
    const timeSlot = rx.suggestedTimeSlotId
      ? slotById[String(rx.suggestedTimeSlotId)]
      : slotByLabel[rx.suggestedTime?.toLowerCase()];
    const day = rx.suggestedDay && DAYS.includes(rx.suggestedDay) ? rx.suggestedDay : null;

    if (!room) validated.validationWarnings.push('Suggested room not found in system.');
    if (!professor) validated.validationWarnings.push('Suggested professor not found in system.');
    if (!day) validated.validationWarnings.push('Suggested day is invalid or missing.');
    if (!timeSlot) validated.validationWarnings.push('Suggested time slot is invalid or missing.');

    if (room) validated.suggestedRoomId = room.id;
    if (professor) validated.suggestedProfessorId = professor.id;
    if (timeSlot) validated.suggestedTimeSlotId = timeSlot.id;

    if (room && professor && day && timeSlot) {
      const candidate = { room, professor, day, timeSlot, subject: {}, section: {} };
      const hasConflict = scheduled.some(s => schedulesOverlap(candidate, s));
      if (hasConflict) {
        validated.validationWarnings.push('Suggested slot conflicts with an existing schedule.');
      } else {
        validated.validated = true;
      }
    }

    return validated;
  });
}

/**
 * Ask Gemini to analyze scheduling failures and produce actionable prescriptions.
 */
export async function analyzeScheduleFailures(unscheduled, professors, rooms, sections, scheduled = []) {
  if (!unscheduled?.length) return null;

  try {
    const failureText = unscheduled.map((item, i) => {
      const sub = item.subject?.code || item.subject?.name || 'Unknown';
      const sec = item.section?.name || '?';
      const reason = item.reason || 'Unknown conflict';
      return `${i + 1}. ${sub} for ${sec} — reason: "${reason}"`;
    }).join('\n');

    const profLoad = {};
    for (const s of (scheduled || [])) {
      if (s.professor?.id) {
        profLoad[s.professor.id] = (profLoad[s.professor.id] || 0) + creditPerMeeting(s.subject);
      }
    }

    const profContext = professors.map(p => {
      const max = Number(p.maxUnits) || Number(p.maxHours) || 12;
      const used = Math.round((profLoad[p.id] || 0) * 10) / 10;
      const remaining = Math.round((max - used) * 10) / 10;
      return `- ${p.name} [ID:${p.id}]: ${used}/${max} units (${remaining} remaining), dept:${p.department || '?'}`;
    }).join('\n');

    const totalSlots = DAYS.length * TIME_SLOTS.length;
    const roomSlotUsage = {};
    for (const r of rooms) roomSlotUsage[r.id] = 0;
    for (const s of (scheduled || [])) {
      if (s.room?.id) {
        const occupied = getOccupiedSlots(s);
        roomSlotUsage[s.room.id] = (roomSlotUsage[s.room.id] || 0) + occupied.length;
      }
    }

    const roomContext = rooms.map(r => {
      const used = roomSlotUsage[r.id] || 0;
      const free = totalSlots - used;
      return `- ${r.name} [ID:${r.id}]: dept:${r.department || 'SHARED'}, lab:${r.hasComputers ? 'yes' : 'no'}, ${used}/${totalSlots} slot-blocks used (${free} free)`;
    }).join('\n');

    const timeSlotList = TIME_SLOTS.map(ts => `${ts.label} [ID:${ts.id}]`).join(', ');

    const prompt = `You are a university scheduling assistant. The auto-scheduler failed to place certain classes. Analyze each failure and provide CONCRETE prescriptions.

CRITICAL RULES:
1. Every failed class MUST get at least one actionable prescription.
2. Use REAL room IDs, professor IDs, and time slot IDs from the data below.
3. Suggest only professors who are authorized for the subject (check specializations).
4. Lab subjects require rooms with lab:yes.
5. Prefer rooms/professors with more remaining capacity.
6. Days must be one of: ${DAYS.join(', ')}.

FAILED CLASSES:
${failureText}

PROFESSOR WORKLOADS:
${profContext}

ROOM AVAILABILITY:
${roomContext}

TIME SLOTS: ${timeSlotList}

For each failed class, provide subject code, section name, problem, solutions, and suggested room/day/time/professor with their IDs where possible.`;

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
              suggestedRoomId: { type: SchemaType.STRING },
              suggestedDay: { type: SchemaType.STRING },
              suggestedTime: { type: SchemaType.STRING },
              suggestedTimeSlotId: { type: SchemaType.STRING },
              suggestedProfessor: { type: SchemaType.STRING },
              suggestedProfessorId: { type: SchemaType.STRING },
            },
            required: ["subject", "section", "problem", "solutions"]
          }
        }
      },
    });

    const parsed = JSON.parse(result.response.text());

    if (Array.isArray(parsed) && parsed.length > 0) {
      const validated = validatePrescriptions(parsed, rooms, professors, scheduled);
      console.log('[AI] Prescription analysis complete:', validated.length, 'prescriptions generated');
      return validated;
    }
    return null;
  } catch (error) {
    console.warn('[AI] Prescription analysis failed:', error.message);
    return null;
  }
}
