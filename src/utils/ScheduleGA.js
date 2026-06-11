/**
 * ScheduleGA - Genetic Algorithm for University Timetabling
 * 
 * v2: Room department ownership, professor room pinning, multi-pass rescue,
 *     prescription output, room utilization spread.
 */

import {
  getSectionDepartment,
  getEligibleProfessors,
  applyAIRanking,
  slotsNeededFromIndex,
} from './scheduleUtils.js';

const DEFAULT_CONFIG = {
  populationSize: 80,
  maxGenerations: 300,
  mutationRate: 0.15,
  crossoverRate: 0.8,
  elitismCount: 4,
  tournamentSize: 5,
  stagnationLimit: 50,
  repair: true,
  repairTriesPerGene: 40,
};

const PENALTY = {
  ROOM_CONFLICT: -100,
  PROF_CONFLICT: -100,
  SECTION_CONFLICT: -100,
  MIXED_PROF_SECTION: -150,
  UNPAIRED_DAYS: -120,
  INCONSISTENT_TIME_OR_ROOM: -200,   // Increased from -110 — hard-lock room+time
  IGNORED_ROOM_PREFERENCE: -150,      // Make preferred rooms a strict requirement
  SAME_DAY_CONFLICT: -90,
  LAB_MISMATCH: -80,
  WORKLOAD_EXCEEDED: -60,
  WRONG_DEPARTMENT_ROOM: -20,         // Non-shared room used by wrong department
  IDLE_ROOM: -15,                     // Per unused room across entire week
};

const BONUS = {
  SPECIALIZATION_MATCH: 20,
  ROOM_PREFERENCE: 15,
  WORKLOAD_BALANCE: 15,
  NO_CONSECUTIVE_OVERLOAD: 10,
  SPREAD_ACROSS_WEEK: 5,
  SAME_ROOM_TIME_DIFFERENT_DAYS: 30,
  PAIRED_DAY_MATCH: 40,
  AI_MATCH_1ST: 40,
  AI_MATCH_2ND: 20,
  AI_MATCH_3RD: 5,
  DEPARTMENT_ROOM_MATCH: 25,          // Room dept matches section dept
  ROOM_UTILIZATION_SPREAD: 10,        // Reward using more rooms
};

// Day pairing: Mon(0)<->Thu(3), Tue(1)<->Fri(4), Wed(2) has no pair
const DAY_PAIR_MAP = { 0: 3, 3: 0, 1: 4, 4: 1 };

export class ScheduleGA {
  constructor(subjects, rooms, professors, sections, days, timeSlots, existingSchedules = [], config = {}, aiProfessorMap = null) {
    this.subjects = subjects;
    this.rooms = rooms;
    this.professors = professors;
    this.sections = sections;
    this.days = days;
    this.timeSlots = timeSlots;
    this.existingSchedules = existingSchedules;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiProfessorMap = aiProfessorMap; // Optional AI-ranked professor map: { subjectId: [profId1, profId2, ...] }
    this._validateInputs();
    this._buildLookups();
    this.assignments = this._buildAssignmentList();
  }

  _validateInputs() {
    const problems = [];
    if (!Array.isArray(this.subjects)) problems.push('subjects must be an array');
    if (!Array.isArray(this.rooms)) problems.push('rooms must be an array');
    if (!Array.isArray(this.professors)) problems.push('professors must be an array');
    if (!Array.isArray(this.sections)) problems.push('sections must be an array');
    if (!Array.isArray(this.days) || this.days.length === 0) problems.push('days must be a non-empty array');
    if (!Array.isArray(this.timeSlots) || this.timeSlots.length === 0) problems.push('timeSlots must be a non-empty array');
    if (problems.length > 0) {
      throw new Error(`ScheduleGA: invalid inputs: ${problems.join(', ')}`);
    }
  }

  _buildLookups() {
    this.profSpecMap = {};
    for (const p of this.professors) {
      this.profSpecMap[p.id] = new Set((p.specialization || []).map(s => s.toLowerCase()));
    }
    this.roomMap = {};
    for (const r of this.rooms) this.roomMap[r.id] = r;
    this.profMap = {};
    for (const p of this.professors) this.profMap[p.id] = p;

    // Track existing schedules to navigate around them
    this.existingRoomSlots = {};
    this.existingProfSlots = {};
    this.existingSecSlots = {};

    for (const s of this.existingSchedules) {
      const dIdx = this.days.indexOf(s.day);
      const tIdx = this.timeSlots.findIndex(ts => String(ts.id) === String(s.timeSlot?.id));
      if (dIdx >= 0 && tIdx >= 0) {
        const needed = slotsNeededFromIndex(tIdx, s.subject?.hoursPerMeeting);
        for (let i = 0; i < needed; i++) {
          const t = tIdx + i;
          if (t >= this.timeSlots.length) continue;
          if (s.room) this.existingRoomSlots[`${s.room.id}-${dIdx}-${t}`] = true;
          if (s.professor) this.existingProfSlots[`${s.professor.id}-${dIdx}-${t}`] = true;
          if (s.section) this.existingSecSlots[`${s.section.id}-${dIdx}-${t}`] = true;
        }
      }
    }
  }

  _buildAssignmentList() {
    const list = [];
    const existingCounts = {};

    // Prevent duplicating meetings if already existing
    for (const s of this.existingSchedules) {
      if (s.section && s.subject) {
        const key = `${s.section.id}-${s.subject.id}`;
        existingCounts[key] = (existingCounts[key] || 0) + 1;
      }
    }

    for (const sec of this.sections) {
      for (const subId of (sec.subjects || [])) {
        const sub = this.subjects.find(s => s.id === subId || s.code === subId);
        if (!sub) continue;

        const credits = Number(sub.credits) || 3;
        const targetDuration = Number(sub.hoursPerMeeting) || 1.5;
        const meetings = Math.max(1, Math.ceil(credits / targetDuration));

        const alreadyScheduled = existingCounts[`${sec.id}-${sub.id}`] || 0;
        const needed = meetings - alreadyScheduled;

        for (let i = 0; i < needed; i++) {
          list.push({ subject: sub, section: sec, meetingIndex: alreadyScheduled + i + 1, totalMeetings: meetings, targetDuration });
        }
      }
    }
    return list;
  }

  _randInt(n) {
    return Math.floor(Math.random() * n);
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this._randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Get eligible rooms for an assignment, tiered by department ownership.
   * Tier 1: Rooms owned by the section's department
   * Tier 2: SHARED rooms
   * Tier 3: All other rooms (overflow — cross-department)
   */
  _eligibleRoomsFor(a) {
    const sectionDept = getSectionDepartment(a.section);
    const isPE = a.subject && (a.subject.code || '').toUpperCase().startsWith('PE');
    const isGym = (r) => (r.name || '').toUpperCase().includes('GYM');

    // PE subjects must go to gym
    if (isPE) {
      const gyms = this.rooms.filter(isGym);
      if (gyms.length > 0) return gyms;
    }

    let pool = this.rooms;
    // Lab filter first
    if (a.subject.requiredLab) {
      const labs = this.rooms.filter(r => r.hasComputers);
      if (labs.length > 0) pool = labs;
    }

    // Tier the rooms by department ownership
    const tier1 = []; // Department-owned rooms matching this section
    const tier2 = []; // SHARED rooms
    const tier3 = []; // Other department rooms (overflow)

    for (const r of pool) {
      if (isGym(r) && !isPE) {
        tier3.push(r); // Gym is last resort for non-PE
        continue;
      }
      const roomDept = (r.department || 'SHARED').toUpperCase();
      if (roomDept === 'SHARED') {
        tier2.push(r);
      } else if (sectionDept && roomDept === sectionDept) {
        tier1.push(r);
      } else {
        tier3.push(r);
      }
    }

    // Return in priority order: own dept first, then shared, then overflow
    return [...tier1, ...tier2, ...tier3];
  }

  _eligibleTimeSlotsFor(a) {
    return this.timeSlots.map((ts, idx) => idx).filter(idx => slotsNeededFromIndex(idx, a.targetDuration) > 0);
  }

  _eligibleProfsFor(a, profWork = null) {
    const subject = a.subject;
    const basePool = getEligibleProfessors(this.professors, subject, a.section);
    let pool = this.aiProfessorMap?.[subject?.id]
      ? applyAIRanking(basePool, this.aiProfessorMap[subject.id])
      : basePool;

    if (!profWork) return pool;

    const credits = Number(a.subject?.credits) || 3;
    const totalMeetings = a.totalMeetings || Math.max(1, Math.ceil(credits / 1.5));
    const creditPerSlot = credits / totalMeetings;

    const feasible = [];
    for (const p of pool) {
      const max = Number(p.maxUnits) || Number(p.maxHours) || 12;
      const w = Number(profWork[p.id]) || 0;
      if (w + creditPerSlot <= max + 0.01) feasible.push(p);
    }
    return feasible;
  }

  /**
   * Broader professor pool for rescue pass: any professor in the same department,
   * even without exact specialization match.
   */
  _rescueProfsFor(a, profWork = null) {
    const sectionDept = getSectionDepartment(a.section);
    let pool = sectionDept
      ? this.professors.filter(p => (p.department || '').toUpperCase() === sectionDept)
      : [...this.professors];

    // --- ASSIGNED SECTIONS FILTER ---
    const sectionId = a.section?.id;
    
    pool = pool.filter(p => {
      if (p.assignedSections && p.assignedSections.length > 0) {
        return p.assignedSections.includes(sectionId);
      }
      return true;
    });

    if (sectionId && pool.length > 0) {
      const explicitProfs = pool.filter(p => (p.assignedSections || []).includes(sectionId));
      if (explicitProfs.length > 0) {
        pool = explicitProfs;
      }
    }

    if (!profWork) return pool;

    const credits = Number(a.subject?.credits) || 3;
    const totalMeetings = a.totalMeetings || Math.max(1, Math.ceil(credits / 1.5));
    const creditPerSlot = credits / totalMeetings;

    return pool.filter(p => {
      const max = Number(p.maxUnits) || Number(p.maxHours) || 12;
      const w = Number(profWork[p.id]) || 0;
      return w + creditPerSlot <= max + 0.01;
    });
  }

  _isSlotFree({ roomId, professorId, sectionId, dayIdx, timeIdx, targetDuration }, roomSlots, profSlots, secSlots) {
    const needed = slotsNeededFromIndex(timeIdx, targetDuration);
    if (needed === 0) return false;

    for (let i = 0; i < needed; i++) {
      const t = timeIdx + i;
      const rk = `${roomId}-${dayIdx}-${t}`;
      const pk = `${professorId}-${dayIdx}-${t}`;
      const sk = `${sectionId}-${dayIdx}-${t}`;

      if (this.existingRoomSlots[rk] || this.existingProfSlots[pk] || this.existingSecSlots[sk]) return false;
      if (roomSlots[rk] || profSlots[pk] || secSlots[sk]) return false;
    }
    return true;
  }

  _occupy({ roomId, professorId, sectionId, dayIdx, timeIdx, targetDuration }, roomSlots, profSlots, secSlots) {
    const needed = slotsNeededFromIndex(timeIdx, targetDuration);
    if (needed === 0) return;
    for (let i = 0; i < needed; i++) {
      const t = timeIdx + i;
      if (t >= this.timeSlots.length) continue;
      const rk = `${roomId}-${dayIdx}-${t}`;
      const pk = `${professorId}-${dayIdx}-${t}`;
      const sk = `${sectionId}-${dayIdx}-${t}`;

      roomSlots[rk] = (roomSlots[rk] || 0) + 1;
      if (professorId) profSlots[pk] = (profSlots[pk] || 0) + 1;
      if (sectionId) secSlots[sk] = (secSlots[sk] || 0) + 1;
    }
  }

  /** Get the paired day index (Mon<->Thu, Tue<->Fri). Returns -1 for Wed or invalid. */
  _getPairedDay(dayIdx) {
    return DAY_PAIR_MAP[dayIdx] !== undefined ? DAY_PAIR_MAP[dayIdx] : -1;
  }

  _repair(chrom) {
    if (!chrom || chrom.length === 0) return chrom;

    const roomSlots = {};
    const profSlots = {};
    const secSlots = {};
    const profWork = {};
    const assignedSecSub = {};
    // Track which professor is locked to each section+subject pair
    // Once a professor is chosen for a section+subject, all meetings must use the same professor
    const lockedProfForSecSub = {};
    // Track which room is locked to each section+subject pair (NEW: hard-lock room)
    const lockedRoomForSecSub = {};

    // Seed locked professors and rooms from existing schedules
    for (const s of this.existingSchedules) {
      if (s.professor && s.section && s.subject) {
        const key = `${s.section.id}-${s.subject.id}`;
        if (!lockedProfForSecSub[key]) {
          lockedProfForSecSub[key] = s.professor.id;
        }
      }
      if (s.room && s.section && s.subject) {
        const key = `${s.section.id}-${s.subject.id}`;
        if (!lockedRoomForSecSub[key]) {
          lockedRoomForSecSub[key] = s.room.id;
        }
      }
    }

    const idxs = this._shuffle(Array.from({ length: chrom.length }, (_, i) => i));

    for (const i of idxs) {
      const a = this.assignments[i];
      const sectionId = a.section.id;
      const secSubKey = `${sectionId}-${a.subject.id}`;
      const creditPerSlot = (Number(a.subject?.credits) || 3) / (a.totalMeetings || Math.max(1, Math.ceil((Number(a.subject?.credits) || 3) / 1.5)));

      const eligibleRooms = this._eligibleRoomsFor(a);
      const isPE = a.subject && (a.subject.code || '').toUpperCase().startsWith('PE');
      const isGym = (r) => (r.name || '').toUpperCase().includes('GYM');
      
      let rooms;
      // If room is locked for this section+subject, force that room
      const lockedRoomId = lockedRoomForSecSub[secSubKey];
      if (lockedRoomId && this.roomMap[lockedRoomId]) {
        rooms = [this.roomMap[lockedRoomId]];
      } else if (isPE) {
        rooms = this._shuffle([...eligibleRooms]);
      } else {
        const normal = this._shuffle(eligibleRooms.filter(r => !isGym(r)));
        const gyms = this._shuffle(eligibleRooms.filter(isGym));
        rooms = [...normal, ...gyms];
      }

      let profs = this._shuffle([...this._eligibleProfsFor(a, profWork)]);

      // If a professor is already locked for this section+subject, force using that professor
      const lockedProfId = lockedProfForSecSub[secSubKey];
      if (lockedProfId) {
        const lockedProf = profs.find(p => p.id === lockedProfId);
        if (lockedProf) {
          profs = [lockedProf]; // Only allow the locked professor
        }
        // If the locked prof is not in the eligible pool (e.g. overloaded), still try them
        else {
          const fallbackProf = this.profMap[lockedProfId];
          if (fallbackProf) profs = [fallbackProf];
        }
      }

      let placed = false;
      let bestFallback = null;

      const g = chrom[i];
      let validExisting = false;
      if (g && g.professorId && g.roomId) {
        // Check if the existing professor matches the lock
        const profMatchesLock = !lockedProfId || g.professorId === lockedProfId;
        // Check if the existing room matches the lock
        const roomMatchesLock = !lockedRoomId || g.roomId === lockedRoomId;
        const isProfEligible = profMatchesLock && profs.some(p => p.id === g.professorId);
        const isRoomEligible = roomMatchesLock && rooms.some(r => r.id === g.roomId);
        if (isProfEligible && isRoomEligible) {
          const ok = this._isSlotFree(
            { roomId: g.roomId, professorId: g.professorId, sectionId, dayIdx: g.dayIdx, timeIdx: g.timeIdx, targetDuration: a.targetDuration },
            roomSlots, profSlots, secSlots
          );
          if (ok) validExisting = true;
        }
      }

      if (validExisting) {
        this._occupy({ roomId: g.roomId, professorId: g.professorId, sectionId, dayIdx: g.dayIdx, timeIdx: g.timeIdx, targetDuration: a.targetDuration }, roomSlots, profSlots, secSlots);
        profWork[g.professorId] = (Number(profWork[g.professorId]) || 0) + creditPerSlot;
        
        // Lock professor and room for this section+subject
        if (!lockedProfForSecSub[secSubKey]) {
          lockedProfForSecSub[secSubKey] = g.professorId;
        }
        if (!lockedRoomForSecSub[secSubKey]) {
          lockedRoomForSecSub[secSubKey] = g.roomId;
        }

        if (!assignedSecSub[secSubKey]) {
          assignedSecSub[secSubKey] = { roomId: g.roomId, timeIdx: g.timeIdx, daysUsed: new Set([g.dayIdx]) };
        } else {
          assignedSecSub[secSubKey].daysUsed.add(g.dayIdx);
        }
        continue;
      }

      const pref = assignedSecSub[secSubKey];

      for (let t = 0; t < this.config.repairTriesPerGene; t++) {
        const prof = profs[this._randInt(profs.length)];
        if (!prof) break;

        let room, timeIdx;
        const usePref = pref && t < this.config.repairTriesPerGene / 2;

        if (usePref) {
          room = this.roomMap[pref.roomId];
          if (!room || !rooms.find(r => r.id === room.id)) {
            room = rooms[this._randInt(rooms.length)];
          }
          timeIdx = pref.timeIdx;
        } else {
          const prefRoomIds = prof.preferredRooms || [];
          if (prefRoomIds.length > 0) {
            const validPrefRooms = rooms.filter(r => prefRoomIds.includes(r.id));
            if (validPrefRooms.length > 0) {
              room = validPrefRooms[this._randInt(validPrefRooms.length)];
            } else {
              room = rooms[this._randInt(rooms.length)];
            }
          } else {
            room = rooms[this._randInt(rooms.length)];
          }
          
          const validTimes = this._eligibleTimeSlotsFor(a);
          timeIdx = validTimes[this._randInt(validTimes.length)];
        }

        if (!room) break;

        // Choose day: when we have a preference, use the PAIRED day deterministically
        let dayIdx;
        if (usePref && pref.daysUsed && pref.daysUsed.size > 0) {
          // Find the paired day of the first meeting
          const firstDay = [...pref.daysUsed][0];
          const pairedDay = this._getPairedDay(firstDay);
          if (pairedDay >= 0 && !pref.daysUsed.has(pairedDay)) {
            dayIdx = pairedDay; // Mon->Thu, Tue->Fri, etc.
          } else {
            // Paired day already used or no pair exists (Wed), pick random unused day
            const unused = [];
            for (let d = 0; d < this.days.length; d++) {
              if (!pref.daysUsed.has(d)) unused.push(d);
            }
            dayIdx = unused.length > 0 ? unused[this._randInt(unused.length)] : this._randInt(this.days.length);
          }
        } else {
          dayIdx = this._randInt(this.days.length);
        }

        const ok = this._isSlotFree(
          { roomId: room.id, professorId: prof.id, sectionId, dayIdx, timeIdx, targetDuration: a.targetDuration },
          roomSlots,
          profSlots,
          secSlots
        );

        let sameDayConflict = false;
        if (pref && pref.daysUsed && pref.daysUsed.has(dayIdx)) {
          sameDayConflict = true;
        }

        if (!ok || sameDayConflict) {
          const rk = `${room.id}-${dayIdx}-${timeIdx}`;
          const pk = `${prof.id}-${dayIdx}-${timeIdx}`;
          const sk = `${sectionId}-${dayIdx}-${timeIdx}`;
          const conflicts = (roomSlots[rk] ? 1 : 0) + (profSlots[pk] ? 1 : 0) + (secSlots[sk] ? 1 : 0) + (sameDayConflict ? 1 : 0);
          if (!bestFallback || conflicts < bestFallback.conflicts) {
            bestFallback = { roomId: room.id, professorId: prof.id, dayIdx, timeIdx, conflicts };
          }
          continue;
        }

        chrom[i] = { professorId: prof.id, roomId: room.id, dayIdx, timeIdx };
        this._occupy({ roomId: room.id, professorId: prof.id, sectionId, dayIdx, timeIdx, targetDuration: a.targetDuration }, roomSlots, profSlots, secSlots);
        profWork[prof.id] = (Number(profWork[prof.id]) || 0) + creditPerSlot;

        // Lock professor and room for this section+subject
        if (!lockedProfForSecSub[secSubKey]) {
          lockedProfForSecSub[secSubKey] = prof.id;
        }
        if (!lockedRoomForSecSub[secSubKey]) {
          lockedRoomForSecSub[secSubKey] = room.id;
        }

        if (!assignedSecSub[secSubKey]) {
          assignedSecSub[secSubKey] = { roomId: room.id, timeIdx, daysUsed: new Set([dayIdx]) };
        } else {
          assignedSecSub[secSubKey].daysUsed.add(dayIdx);
        }

        placed = true;
        break;
      }

      if (!placed) {
        if (bestFallback && bestFallback.professorId) {
          chrom[i] = { professorId: bestFallback.professorId, roomId: bestFallback.roomId, dayIdx: bestFallback.dayIdx, timeIdx: bestFallback.timeIdx };
          this._occupy({ roomId: chrom[i].roomId, professorId: chrom[i].professorId, sectionId, dayIdx: chrom[i].dayIdx, timeIdx: chrom[i].timeIdx, targetDuration: a.targetDuration }, roomSlots, profSlots, secSlots);
          profWork[chrom[i].professorId] = (profWork[chrom[i].professorId] || 0) + creditPerSlot;
          
          // Lock professor and room for this section+subject
          if (!lockedProfForSecSub[secSubKey]) {
            lockedProfForSecSub[secSubKey] = bestFallback.professorId;
          }
          if (!lockedRoomForSecSub[secSubKey]) {
            lockedRoomForSecSub[secSubKey] = bestFallback.roomId;
          }

          if (!assignedSecSub[secSubKey]) {
            assignedSecSub[secSubKey] = { roomId: bestFallback.roomId, timeIdx: bestFallback.timeIdx, daysUsed: new Set([bestFallback.dayIdx]) };
          } else {
            assignedSecSub[secSubKey].daysUsed.add(bestFallback.dayIdx);
          }
        } else {
          chrom[i] = { professorId: null, roomId: null, dayIdx: 0, timeIdx: 0 };
        }
      }
    }

    // ─── RESCUE PASS: Try to place any null genes with relaxed constraints ───
    this._rescuePass(chrom, roomSlots, profSlots, secSlots, profWork, lockedProfForSecSub, lockedRoomForSecSub);

    return chrom;
  }

  /**
   * Rescue pass: For any gene that ended up with null professor/room,
   * relax constraints and try to place them using any available slot.
   * 1. Try any room (including cross-department overflow)
   * 2. Try any professor in the same department (even without specialization)
   * 3. Mark rescued items with a prescriptionNote
   */
  _rescuePass(chrom, roomSlots, profSlots, secSlots, profWork, lockedProfForSecSub, lockedRoomForSecSub) {
    for (let i = 0; i < chrom.length; i++) {
      const g = chrom[i];
      if (g && g.professorId && g.roomId) continue; // Already placed

      const a = this.assignments[i];
      const sectionId = a.section.id;
      const secSubKey = `${sectionId}-${a.subject.id}`;
      const creditPerSlot = (Number(a.subject?.credits) || 3) / (a.totalMeetings || Math.max(1, Math.ceil((Number(a.subject?.credits) || 3) / 1.5)));

      // Get broader pools: all rooms (including overflow) and department professors
      const allRooms = this._shuffle([...this.rooms]);
      let rescueProfs = this._shuffle([...this._rescueProfsFor(a, profWork)]);

      // If professor is locked, still use the locked one
      const lockedProfId = lockedProfForSecSub[secSubKey];
      if (lockedProfId) {
        const lp = this.profMap[lockedProfId];
        if (lp) rescueProfs = [lp];
      }

      // If no rescue profs found, try ALL professors
      if (rescueProfs.length === 0) {
        rescueProfs = this._shuffle([...this.professors]);
      }

      let placed = false;
      for (const prof of rescueProfs) {
        if (placed) break;
        for (const room of allRooms) {
          if (placed) break;
          // Skip lab mismatch
          if (a.subject.requiredLab && !room.hasComputers) continue;

          const validTimes = this._eligibleTimeSlotsFor(a);
          for (const timeIdx of validTimes) {
            if (placed) break;
            for (let dayIdx = 0; dayIdx < this.days.length; dayIdx++) {
              const ok = this._isSlotFree(
                { roomId: room.id, professorId: prof.id, sectionId, dayIdx, timeIdx, targetDuration: a.targetDuration },
                roomSlots, profSlots, secSlots
              );
              if (ok) {
                chrom[i] = { professorId: prof.id, roomId: room.id, dayIdx, timeIdx, rescued: true };
                this._occupy({ roomId: room.id, professorId: prof.id, sectionId, dayIdx, timeIdx, targetDuration: a.targetDuration }, roomSlots, profSlots, secSlots);
                profWork[prof.id] = (Number(profWork[prof.id]) || 0) + creditPerSlot;
                if (!lockedProfForSecSub[secSubKey]) lockedProfForSecSub[secSubKey] = prof.id;
                if (!lockedRoomForSecSub[secSubKey]) lockedRoomForSecSub[secSubKey] = room.id;
                placed = true;
                break;
              }
            }
          }
        }
      }

      // If still unplaced after rescue, leave as null (will generate prescription in output)
      if (!placed && (!chrom[i] || !chrom[i].professorId)) {
        chrom[i] = { professorId: null, roomId: null, dayIdx: 0, timeIdx: 0 };
      }
    }
  }

  _randomChromosome() {
    // Pre-assign one professor, room, time slot, and day pair per section+subject
    // so all meetings of the same subject for a section are consistent
    const profForSecSub = {};
    const slotForSecSub = {}; // { roomId, timeIdx, firstDay, meetingCount }

    // Seed from existing schedules first
    for (const s of this.existingSchedules) {
      if (s.professor && s.section && s.subject) {
        const key = `${s.section.id}-${s.subject.id}`;
        if (!profForSecSub[key]) profForSecSub[key] = s.professor.id;
      }
    }

    const chrom = this.assignments.map(a => {
      const secSubKey = `${a.section.id}-${a.subject.id}`;

      // Lock professor
      let profId = profForSecSub[secSubKey];
      if (!profId) {
        const profs = this._eligibleProfsFor(a);
        const prof = profs[this._randInt(profs.length)];
        profId = prof?.id || null;
        if (profId) profForSecSub[secSubKey] = profId;
      }

      // Lock room, time slot, and day pair for consistency
      let slot = slotForSecSub[secSubKey];
      if (!slot) {
        // First meeting: pick room, time, and a starting day (prefer Mon=0 or Tue=1)
        const rooms = this._eligibleRoomsFor(a);
        let room;
        
        const assignedProf = this.profMap[profId];
        const prefRoomIds = assignedProf?.preferredRooms || [];
        if (prefRoomIds.length > 0) {
          const validPrefRooms = rooms.filter(r => prefRoomIds.includes(r.id));
          if (validPrefRooms.length > 0) {
            room = validPrefRooms[this._randInt(validPrefRooms.length)];
          } else {
            room = rooms[this._randInt(rooms.length)];
          }
        } else {
          room = rooms[this._randInt(rooms.length)];
        }

        const validTimes = this._eligibleTimeSlotsFor(a);
        const timeIdx = validTimes[this._randInt(validTimes.length)];
        const pairStarts = [0, 1]; // Monday or Tuesday
        const firstDay = pairStarts[this._randInt(pairStarts.length)];
        slot = { roomId: room?.id || null, timeIdx, firstDay, meetingCount: 0 };
        slotForSecSub[secSubKey] = slot;
      }

      // Assign the day: first meeting gets firstDay, second gets paired day, etc.
      let dayIdx;
      if (slot.meetingCount === 0) {
        dayIdx = slot.firstDay;
      } else if (slot.meetingCount === 1) {
        const paired = this._getPairedDay(slot.firstDay);
        dayIdx = paired >= 0 ? paired : this._randInt(this.days.length);
      } else {
        // 3+ meetings: use remaining days
        const usedDays = new Set();
        usedDays.add(slot.firstDay);
        const paired = this._getPairedDay(slot.firstDay);
        if (paired >= 0) usedDays.add(paired);
        const remaining = [];
        for (let d = 0; d < this.days.length; d++) {
          if (!usedDays.has(d)) remaining.push(d);
        }
        dayIdx = remaining.length > 0 ? remaining[this._randInt(remaining.length)] : this._randInt(this.days.length);
      }
      slot.meetingCount++;

      return {
        professorId: profId,
        roomId: slot.roomId,
        dayIdx,
        timeIdx: slot.timeIdx,
      };
    });
    return this.config.repair ? this._repair(chrom) : chrom;
  }

  _fitness(chrom) {
    let hardScore = 0, softScore = 0, hardViolations = 0;
    const roomSlots = {}, profSlots = {}, secSlots = {};
    const dailySubjectCheck = {};
    const profAssignedSubjects = {};
    const sectionSubjectMeetings = {};
    const profTimeline = {};
    const secTimeline = {};
    const roomTimeline = {};
    const profWork = {};
    const roomsUsed = new Set();

    // Base Workload Seed
    for (const s of this.existingSchedules) {
      if (s.professor && s.subject) {
        if (!profAssignedSubjects[s.professor.id]) profAssignedSubjects[s.professor.id] = new Set();
        profAssignedSubjects[s.professor.id].add(`${s.subject.id}_${s.section?.id || 'x'}`);
      }
    }

    for (let i = 0; i < chrom.length; i++) {
      const g = chrom[i], a = this.assignments[i];
      if (!g || !g.professorId || !g.roomId) {
        hardScore += PENALTY.PROF_CONFLICT * 2;
        hardViolations++;
        continue;
      }

      roomsUsed.add(g.roomId);

      if (!profTimeline[g.professorId]) profTimeline[g.professorId] = {};
      if (!secTimeline[a.section.id]) secTimeline[a.section.id] = {};
      if (!roomTimeline[g.roomId]) roomTimeline[g.roomId] = {};
      if (!profTimeline[g.professorId][g.dayIdx]) profTimeline[g.professorId][g.dayIdx] = [];
      if (!secTimeline[a.section.id][g.dayIdx]) secTimeline[a.section.id][g.dayIdx] = [];
      if (!roomTimeline[g.roomId][g.dayIdx]) roomTimeline[g.roomId][g.dayIdx] = [];

      const needed = slotsNeededFromIndex(g.timeIdx, a.targetDuration);
      const creditPerSlot = (Number(a.subject?.credits) || 3) / (a.totalMeetings || Math.max(1, Math.ceil((Number(a.subject?.credits) || 3) / 1.5)));
      profWork[g.professorId] = (profWork[g.professorId] || 0) + creditPerSlot;

      for (let s = 0; s < needed; s++) {
        const t = g.timeIdx + s;
        if (t >= this.timeSlots.length) continue;

        const rk = `${g.roomId}-${g.dayIdx}-${t}`;
        const pk = `${g.professorId}-${g.dayIdx}-${t}`;
        const sk = `${a.section.id}-${g.dayIdx}-${t}`;

        profTimeline[g.professorId][g.dayIdx].push({ timeIdx: t, roomId: g.roomId });
        secTimeline[a.section.id][g.dayIdx].push({ timeIdx: t, roomId: g.roomId });
        roomTimeline[g.roomId][g.dayIdx].push({ timeIdx: t });

        if (this.existingRoomSlots[rk]) { hardScore += PENALTY.ROOM_CONFLICT; hardViolations++; }
        if (this.existingProfSlots[pk]) { hardScore += PENALTY.PROF_CONFLICT; hardViolations++; }
        if (this.existingSecSlots[sk]) { hardScore += PENALTY.SECTION_CONFLICT; hardViolations++; }

        roomSlots[rk] = (roomSlots[rk] || 0) + 1;
        profSlots[pk] = (profSlots[pk] || 0) + 1;
        secSlots[sk] = (secSlots[sk] || 0) + 1;
      }

      if (!profAssignedSubjects[g.professorId]) profAssignedSubjects[g.professorId] = new Set();
      profAssignedSubjects[g.professorId].add(`${a.subject.id}_${a.section.id}`);

      const secSubKey = `${a.section.id}-${a.subject.id}`;
      if (!sectionSubjectMeetings[secSubKey]) sectionSubjectMeetings[secSubKey] = { entries: [], professorIds: new Set() };
      sectionSubjectMeetings[secSubKey].entries.push(g);
      sectionSubjectMeetings[secSubKey].professorIds.add(g.professorId);

      const dailyKey = `${a.section.id}-${a.subject.id}-${g.dayIdx}`;
      if (!dailySubjectCheck[dailyKey]) {
        dailySubjectCheck[dailyKey] = [];
      }
      
      const prevTimes = dailySubjectCheck[dailyKey];
      let conflict = false;
      if (prevTimes.length > 0) {
        const isConsecutive = prevTimes.some(t => Math.abs(t - g.timeIdx) === 1);
        if (!isConsecutive) {
           conflict = true; // non-consecutive on the same day is bad
        }
      }
      if (conflict) {
        hardScore += PENALTY.SAME_DAY_CONFLICT; hardViolations++;
      }
      dailySubjectCheck[dailyKey].push(g.timeIdx);

      // Department room match bonus/penalty
      const sectionDept = getSectionDepartment(a.section);
      const room = this.roomMap[g.roomId];
      if (room && sectionDept) {
        const roomDept = (room.department || 'SHARED').toUpperCase();
        if (roomDept === sectionDept) {
          softScore += BONUS.DEPARTMENT_ROOM_MATCH;
        } else if (roomDept !== 'SHARED') {
          softScore += PENALTY.WRONG_DEPARTMENT_ROOM;
        }
      }
    }

    for (const k in roomSlots) if (roomSlots[k] > 1) { const o = roomSlots[k] - 1; hardScore += PENALTY.ROOM_CONFLICT * o; hardViolations += o; }
    for (const k in profSlots) if (profSlots[k] > 1) { const o = profSlots[k] - 1; hardScore += PENALTY.PROF_CONFLICT * o; hardViolations += o; }
    for (const k in secSlots) if (secSlots[k] > 1) { const o = secSlots[k] - 1; hardScore += PENALTY.SECTION_CONFLICT * o; hardViolations += o; }

    for (let i = 0; i < chrom.length; i++) {
      const g = chrom[i], a = this.assignments[i];
      if (!g || !g.roomId) continue;
      const room = this.roomMap[g.roomId];
      
      if (a.subject.requiredLab && room && !room.hasComputers) { hardScore += PENALTY.LAB_MISMATCH; hardViolations++; }

      const isPE = a.subject && (a.subject.code || '').toUpperCase().startsWith('PE');
      const isGym = room && (room.name || '').toUpperCase().includes('GYM');

      if (isPE && !isGym) {
        hardScore -= 100; // PE must be in Gym
        hardViolations++;
      } else if (!isPE && isGym) {
        softScore -= 50; // Gym is last option for non-PE
      }
    }

    for (let i = 0; i < chrom.length; i++) {
      if (!chrom[i] || !chrom[i].professorId) continue;
      const prof = this.profMap[chrom[i].professorId];

      const specs = this.profSpecMap[chrom[i].professorId];
      if (specs && specs.size > 0) {
        const name = (this.assignments[i].subject.name || '').toLowerCase();
        for (const sp of specs) { if (name.includes(sp)) { softScore += BONUS.SPECIALIZATION_MATCH; break; } }
      }

      if (prof && prof.preferredRooms && prof.preferredRooms.length > 0) {
        if (prof.preferredRooms.includes(chrom[i].roomId)) {
          softScore += BONUS.ROOM_PREFERENCE;
        } else {
          hardScore += PENALTY.IGNORED_ROOM_PREFERENCE;
          hardViolations++;
        }
      }

      // AI match bonus — only when professor is in the eligible pool for this assignment
      const assignment = this.assignments[i];
      const eligibleForBonus = getEligibleProfessors(this.professors, assignment.subject, assignment.section);
      const eligibleIds = new Set(eligibleForBonus.map(p => p.id));
      if (eligibleIds.has(chrom[i].professorId) && this.aiProfessorMap?.[assignment.subject.id]) {
        const rankedIds = this.aiProfessorMap[assignment.subject.id].filter(id => eligibleIds.has(id));
        const rank = rankedIds.indexOf(chrom[i].professorId);
        if (rank === 0) softScore += BONUS.AI_MATCH_1ST;
        else if (rank === 1) softScore += BONUS.AI_MATCH_2ND;
        else if (rank > 1) softScore += BONUS.AI_MATCH_3RD;
      }
    }

    // Penalize mixed professors for the same section+subject (HARD constraint)
    // Enforce day pairing (Mon-Thu, Tue-Fri) and same time/room across meetings
    for (const key in sectionSubjectMeetings) {
      const { entries: meetings, professorIds } = sectionSubjectMeetings[key];

      // HARD PENALTY: Different professors teaching the same subject to the same section
      if (professorIds.size > 1) {
        hardScore += PENALTY.MIXED_PROF_SECTION * (professorIds.size - 1);
        hardViolations += (professorIds.size - 1);
      }

      if (meetings.length > 1) {
        const first = meetings[0];
        if (!first || !first.roomId) continue;

        let allSameTimeAndRoom = true;
        let allDifferentDays = true;
        let allProperlyPaired = true;
        const daysUsed = new Set([first.dayIdx]);

        for (let i = 1; i < meetings.length; i++) {
          const m = meetings[i];
          if (!m || !m.roomId) {
            allSameTimeAndRoom = false;
            allProperlyPaired = false;
            break;
          }
          // Check same time and room
          if (m.roomId !== first.roomId || m.timeIdx !== first.timeIdx) {
            allSameTimeAndRoom = false;
          }
          // Check different days
          if (daysUsed.has(m.dayIdx)) {
            allDifferentDays = false;
          }
          daysUsed.add(m.dayIdx);
        }

        // Check if days form proper pairs (Mon-Thu or Tue-Fri)
        if (meetings.length === 2 && allDifferentDays) {
          const dayA = meetings[0].dayIdx;
          const dayB = meetings[1].dayIdx;
          const expectedPair = DAY_PAIR_MAP[dayA];
          if (expectedPair === undefined || expectedPair !== dayB) {
            allProperlyPaired = false;
          }
        } else if (meetings.length > 2) {
          // For 3+ meetings, check that at least Mon-Thu or Tue-Fri pairs exist
          const daySet = new Set(meetings.map(m => m.dayIdx));
          const hasPair = (daySet.has(0) && daySet.has(3)) || (daySet.has(1) && daySet.has(4));
          if (!hasPair) allProperlyPaired = false;
        }

        // HARD PENALTY: Meetings not on paired days (e.g., Mon-Fri instead of Mon-Thu)
        if (!allProperlyPaired) {
          hardScore += PENALTY.UNPAIRED_DAYS;
          hardViolations++;
        } else {
          // Bonus for proper day pairing
          softScore += BONUS.PAIRED_DAY_MATCH * (meetings.length - 1);
        }

        // HARD PENALTY: Different time slots or rooms across meetings of same subject
        if (!allSameTimeAndRoom) {
          hardScore += PENALTY.INCONSISTENT_TIME_OR_ROOM;
          hardViolations++;
        }

        if (allSameTimeAndRoom && allDifferentDays) {
          softScore += BONUS.SAME_ROOM_TIME_DIFFERENT_DAYS * (meetings.length - 1);
        }
      }
    }

    // Check Professor Workload
    for (const pk in profWork) {
      const p = this.profMap[pk];
      if (p) {
        const max = Number(p.maxUnits) || Number(p.maxHours) || 12;
        if (profWork[pk] > max) {
          hardScore += PENALTY.WORKLOAD_EXCEEDED * Math.ceil(profWork[pk] - max);
          hardViolations++;
        } else {
          softScore += BONUS.WORKLOAD_BALANCE;
        }
      }
    }

    // Room utilization spread: reward using more rooms, penalize idle rooms
    if (this.rooms.length > 0) {
      const utilRatio = roomsUsed.size / this.rooms.length;
      softScore += Math.round(BONUS.ROOM_UTILIZATION_SPREAD * utilRatio * 10);
      // Penalize each unused room
      const unusedRooms = this.rooms.length - roomsUsed.size;
      if (unusedRooms > 0) {
        softScore += PENALTY.IDLE_ROOM * unusedRooms;
      }
    }

    // Check consecutive classes and travel time
    const checkTimeline = (timeline, isProf) => {
      for (const id in timeline) {
        for (const day in timeline[id]) {
          const classes = timeline[id][day].sort((a, b) => a.timeIdx - b.timeIdx);
          let consecutive = 1;
          for (let i = 0; i < classes.length; i++) {
            const curr = classes[i];
            
            // Check true overlap using the timeline
            for (let j = i + 1; j < classes.length; j++) {
              const next = classes[j];
              if (curr.timeIdx === next.timeIdx) {
                 hardScore += isProf ? PENALTY.PROF_CONFLICT : PENALTY.SECTION_CONFLICT;
                 hardViolations++;
              }
            }

            if (i > 0) {
              const prev = classes[i-1];
              if (curr.timeIdx === prev.timeIdx + 1) {
                 consecutive++;
                 if (consecutive > 4) {
                    if (isProf) hardScore += PENALTY.WORKLOAD_EXCEEDED / 2;
                 }
                 if (curr.roomId !== prev.roomId && curr.timeIdx !== prev.timeIdx) {
                    softScore -= 10; // penalty for back-to-back different rooms
                 }
              } else {
                 consecutive = 1;
              }
            }
          }
          if (consecutive <= 3 && classes.length > 0) {
            if (isProf) softScore += BONUS.NO_CONSECUTIVE_OVERLOAD;
          }
        }
      }
    };
    
    const checkRoomTimeline = (timeline) => {
      for (const id in timeline) {
        for (const day in timeline[id]) {
          const classes = timeline[id][day];
          for (let i = 0; i < classes.length; i++) {
            for (let j = i + 1; j < classes.length; j++) {
               if (classes[i].timeIdx === classes[j].timeIdx) {
                   hardScore += PENALTY.ROOM_CONFLICT;
                   hardViolations++;
               }
            }
          }
        }
      }
    };

    checkTimeline(profTimeline, true);
    checkTimeline(secTimeline, false);
    checkRoomTimeline(roomTimeline);

    return { score: hardScore + softScore, hardViolations, hardScore, softScore };
  }

  _selectParent(pop, fits) {
    let best = Math.floor(Math.random() * pop.length);
    for (let i = 1; i < this.config.tournamentSize; i++) {
      const idx = Math.floor(Math.random() * pop.length);
      if (fits[idx].score > fits[best].score) best = idx;
    }
    return pop[best];
  }

  _crossover(p1, p2) {
    if (Math.random() > this.config.crossoverRate) return p1.map(g => ({ ...g }));
    return p1.map((g, i) => Math.random() < 0.5 ? { ...g } : { ...p2[i] });
  }

  _mutate(chrom) {
    for (let i = 0; i < chrom.length; i++) {
      if (!chrom[i] || !chrom[i].professorId) continue;
      if (Math.random() < this.config.mutationRate) {
        const g = chrom[i], a = this.assignments[i];
        switch (Math.floor(Math.random() * 4)) {
          case 0: {
            const pool = this._eligibleRoomsFor(a);
            if (pool && pool.length > 0) g.roomId = pool[this._randInt(pool.length)].id;
            break;
          }
          case 1: g.dayIdx = this._randInt(this.days.length); break;
          case 2: {
            const validTimes = this._eligibleTimeSlotsFor(a);
            if (validTimes.length > 0) g.timeIdx = validTimes[this._randInt(validTimes.length)];
            break;
          }
          case 3: {
            const dp = this._eligibleProfsFor(a);
            if (dp && dp.length > 0) g.professorId = dp[this._randInt(dp.length)].id;
            break;
          }
        }
      }
    }
    return this.config.repair ? this._repair(chrom) : chrom;
  }

  async solve(onProgress = null) {
    const { populationSize, maxGenerations, elitismCount, stagnationLimit } = this.config;
    if (this.assignments.length === 0) {
      return { schedule: [], prescriptions: [], fitness: { score: 0, hardViolations: 0 }, stats: { generations: 0, totalAssignments: 0, hardViolations: 0 } };
    }

    let pop = Array.from({ length: populationSize }, () => this._randomChromosome());
    let bestEver = null, bestFit = { score: -Infinity, hardViolations: Infinity };
    let stag = 0, genRan = 0;
    const baseMutation = this.config.mutationRate;

    for (let gen = 0; gen < maxGenerations; gen++) {
      genRan = gen + 1;
      const fits = pop.map(ch => this._fitness(ch));
      let bIdx = 0;
      for (let i = 1; i < fits.length; i++) if (fits[i].score > fits[bIdx].score) bIdx = i;

      if (fits[bIdx].score > bestFit.score) {
        bestFit = { ...fits[bIdx] };
        bestEver = pop[bIdx].map(g => ({ ...g }));
        stag = 0;
      } else stag++;

      if (onProgress) onProgress(gen + 1, bestFit, maxGenerations);

      const stagFactor = Math.min(1, stag / Math.max(1, stagnationLimit));
      const infeasibleBoost = bestFit.hardViolations > 0 ? 0.25 : 0;
      this.config.mutationRate = Math.min(0.6, Math.max(0.05, baseMutation * (1 + 1.5 * stagFactor) + infeasibleBoost));

      if (bestFit.hardViolations === 0 && stag >= Math.floor(stagnationLimit / 2)) break;
      if (stag >= stagnationLimit) break;

      const sorted = fits.map((f, i) => ({ f, i })).sort((a, b) => b.f.score - a.f.score);
      const next = [];
      for (let i = 0; i < elitismCount && i < sorted.length; i++) next.push(pop[sorted[i].i].map(g => ({ ...g })));
      while (next.length < populationSize) {
        let child = this._crossover(this._selectParent(pop, fits), this._selectParent(pop, fits));
        child = this._mutate(child);
        next.push(child);
      }
      pop = next;

      if (gen % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    this.config.mutationRate = baseMutation;

    return {
      schedule: this._toSchedule(bestEver),
      prescriptions: this._buildPrescriptions(bestEver),
      fitness: bestFit,
      stats: { generations: genRan, totalAssignments: this.assignments.length, hardViolations: bestFit.hardViolations },
    };
  }

  _toSchedule(chrom) {
    if (!chrom) return [];
    return chrom.map((g, i) => {
      const a = this.assignments[i];
      if (!g || !g.professorId || !g.roomId) {
        return { failed: true, subject: a.subject, section: a.section, reason: 'No available faculty (Workload full or missing specialization)' };
      }
      const entry = {
        subject: a.subject,
        section: a.section,
        professor: this.profMap[g.professorId],
        room: this.roomMap[g.roomId],
        day: this.days[g.dayIdx],
        timeSlot: this.timeSlots[g.timeIdx],
      };
      if (g.rescued) {
        entry.prescriptionNote = 'Placed via overflow — professor may not have exact specialization match, or room is from a different department.';
      }
      return entry;
    });
  }

  /**
   * Build structured prescriptions for items that could not be scheduled.
   * Each prescription suggests a concrete room, time, and professor option.
   */
  _buildPrescriptions(chrom) {
    if (!chrom) return [];
    const prescriptions = [];

    for (let i = 0; i < chrom.length; i++) {
      const g = chrom[i];
      const a = this.assignments[i];
      
      if (g && g.professorId && g.roomId) continue; // Successfully placed

      // Build a prescription with suggestions
      const sectionDept = getSectionDepartment(a.section);
      const eligibleRooms = this._eligibleRoomsFor(a);
      const allRooms = this.rooms;
      const eligibleProfs = this._eligibleProfsFor(a);
      const deptProfs = sectionDept
        ? this.professors.filter(p => (p.department || '').toUpperCase() === sectionDept)
        : [];

      prescriptions.push({
        subject: a.subject,
        section: a.section,
        reason: 'All time slots exhausted — room and faculty capacity fully utilized during repair.',
        suggestedRooms: eligibleRooms.slice(0, 3).map(r => ({
          id: r.id, name: r.name, department: r.department || 'SHARED'
        })),
        suggestedProfessors: (eligibleProfs.length > 0 ? eligibleProfs : deptProfs).slice(0, 3).map(p => ({
          id: p.id, name: p.name, department: p.department
        })),
        suggestedAction: eligibleProfs.length === 0
          ? 'No professor has the specialization for this subject. Assign a professor to this subject in Faculty Management, or increase an existing professor\'s max units.'
          : 'Try scheduling manually in an off-peak time slot, or add more rooms to the system.',
      });
    }

    return prescriptions;
  }
}