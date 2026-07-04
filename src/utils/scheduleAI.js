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

    const prompt = `You are a university scheduling assistant. Rank professors for each subject to guide a heuristic auto-scheduler.

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
 * AI Pass 4: Resolve Unscheduled Classes by relaxing constraints.
 * Allows small workload overrides (+3 max units) and restricts to Dept/Shared rooms.
 */
// eslint-disable-next-line no-unused-vars
export async function resolveUnscheduledClasses(unscheduledGroups, context, constraints) {
  if (!unscheduledGroups?.length) return [];
  // eslint-disable-next-line no-unused-vars
  const { professors, rooms, activeSchedules, subjects, sections } = context;

  const profLoad = {};
  for (const s of (activeSchedules || [])) {
    if (s.professor?.id) {
      profLoad[s.professor.id] = (profLoad[s.professor.id] || 0) + creditPerMeeting(s.subject);
    }
  }

  const roomOccupancy = {}; 
  for (const s of (activeSchedules || [])) {
    if (s.room?.id) {
      if (!roomOccupancy[s.room.id]) roomOccupancy[s.room.id] = {};
      const slots = getOccupiedSlots(s);
      for (const slot of slots) {
        if (!roomOccupancy[s.room.id][slot.day]) roomOccupancy[s.room.id][slot.day] = [];
        roomOccupancy[s.room.id][slot.day].push(slot.timeSlotId);
      }
    }
  }

  const profOccupancy = {};
  for (const s of (activeSchedules || [])) {
    if (s.professor?.id) {
      if (!profOccupancy[s.professor.id]) profOccupancy[s.professor.id] = {};
      const slots = getOccupiedSlots(s);
      for (const slot of slots) {
        if (!profOccupancy[s.professor.id][slot.day]) profOccupancy[s.professor.id][slot.day] = [];
        profOccupancy[s.professor.id][slot.day].push(slot.timeSlotId);
      }
    }
  }

  const groupContexts = unscheduledGroups.map((g, idx) => {
    const { subject, section, count } = g;
    const eligibleProfs = getEligibleProfessors(professors, subject, section);
    const relaxedProfs = eligibleProfs.filter(p => {
      const max = (Number(p.maxUnits) || Number(p.maxHours) || 12) + 3; 
      const current = profLoad[p.id] || 0;
      return current + (Number(subject.credits) || 3) <= max + 0.01;
    });

    return `- Group ${idx}: Subject "${subject.code}" (${subject.id}), Section "${section?.name || 'Any'}" (${section?.id || 'none'}), Meetings Needed: ${count}, Duration: ${subject.hoursPerMeeting || 1.5}hr. Eligible Profs (with +3 unit override allowed): [${relaxedProfs.map(p => p.id).join(', ')}]`;
  }).join('\n');

  const profSummary = professors.map(p => {
    const max = Number(p.maxUnits) || Number(p.maxHours) || 12;
    const used = Math.round((profLoad[p.id] || 0) * 10) / 10;
    return `- Prof "${p.name}" [${p.id}]: Load: ${used}/${max} units. Occupied: ${JSON.stringify(profOccupancy[p.id] || {})}`;
  }).join('\n');

  const roomSummary = rooms.map(r => {
    const dept = r.department || 'SHARED';
    return `- Room "${r.name}" [${r.id}]: Dept: ${dept}, Lab: ${r.hasComputers?'yes':'no'}, Occupied: ${JSON.stringify(roomOccupancy[r.id] || {})}`;
  }).join('\n');

  const timeSlotsSummary = TIME_SLOTS.map((t, idx) => `- ${t.id}: ${t.label} (Index ${idx})`).join('\n');

  const prompt = `You are an AI Scheduling Assistant. Your task is to resolve unscheduled classes by strategically relaxing constraints.

RULES FOR RESOLVING CONFLICTS:
1. No Double Booking: A room or professor CANNOT be booked for two classes at the same time. Check their Occupied slots carefully!
2. Overriding Professor Max Units: You MAY assign a professor up to 3 units OVER their standard max limit if no other professor is available.
3. Allowed Rooms: You MUST use rooms that are either "SHARED" or belong to the section's department. Do NOT use rooms from completely unrelated departments unless it's a "SHARED" room.
4. Meeting Count: If a group needs "Meetings Needed: 2", you must return 2 schedule entries for that group on different days.
5. Provide a 'prescriptionNote' for each entry explaining what constraint was relaxed (e.g. "Overrode max units by 3 for Professor X" or "Used SHARED room to avoid conflict").

AVAILABLE TIME SLOTS:
${timeSlotsSummary}

PROFESSORS (Current State):
${profSummary}

ROOMS (Current State):
${roomSummary}

UNSCHEDULED GROUPS TO RESOLVE:
${groupContexts}

Provide your response in JSON matching this schema:
[
  {
    "groupIndex": <number>,
    "day": <"Monday"|"Tuesday"|"Wednesday"|"Thursday"|"Friday">,
    "timeSlotId": <number>,
    "roomId": <string>,
    "professorId": <string>,
    "prescriptionNote": <string>
  }
]
Only provide valid, non-overlapping placements. If a group cannot be placed even with relaxed rules, omit it.`;

  try {
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
              groupIndex: { type: SchemaType.NUMBER },
              day: { type: SchemaType.STRING },
              timeSlotId: { type: SchemaType.NUMBER },
              roomId: { type: SchemaType.STRING },
              professorId: { type: SchemaType.STRING },
              prescriptionNote: { type: SchemaType.STRING },
            },
            required: ["groupIndex", "day", "timeSlotId", "roomId", "professorId", "prescriptionNote"]
          }
        }
      },
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    console.error('[AI Conflict Resolution] Failed:', error);
    return [];
  }
}

