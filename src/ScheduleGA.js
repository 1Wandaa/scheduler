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

const PENALTY = { ROOM_CONFLICT: -100, PROF_CONFLICT: -100, SECTION_CONFLICT: -100, SAME_DAY_CONFLICT: -90, LAB_MISMATCH: -80, WORKLOAD_EXCEEDED: -60 };
const BONUS = { SPECIALIZATION_MATCH: 20, ROOM_PREFERENCE: 15, WORKLOAD_BALANCE: 15, NO_CONSECUTIVE_OVERLOAD: 10, SPREAD_ACROSS_WEEK: 5 };

export class ScheduleGA {
  constructor(subjects, rooms, professors, sections, days, timeSlots, existingSchedules = [], config = {}) {
    this.subjects = subjects;
    this.rooms = rooms;
    this.professors = professors;
    this.sections = sections;
    this.days = days;
    this.timeSlots = timeSlots;
    this.existingSchedules = existingSchedules;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._validateInputs();
    this._buildLookups();
    this.assignments = this._buildAssignmentList();
  }

  _validateInputs() {
    // ... existing validation code ...
  }

  _buildLookups() {
    this.profSpecMap = {};
    for (const p of this.professors) this.profSpecMap[p.id] = new Set((p.specialization || []).map(s => s.toLowerCase()));
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
        if (s.room) this.existingRoomSlots[`${s.room.id}-${dIdx}-${tIdx}`] = true;
        if (s.professor) this.existingProfSlots[`${s.professor.id}-${dIdx}-${tIdx}`] = true;
        if (s.section) this.existingSecSlots[`${s.section.id}-${dIdx}-${tIdx}`] = true;
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
        const meetings = Math.max(1, Math.ceil(credits / 1.5));
        const alreadyScheduled = existingCounts[`${sec.id}-${sub.id}`] || 0;
        const needed = meetings - alreadyScheduled;

        for (let i = 0; i < needed; i++) {
          list.push({ subject: sub, section: sec, meetingIndex: alreadyScheduled + i + 1, totalMeetings: meetings });
        }
      }
    }
    return list;
  }

  // ... copy over your existing _randInt, _shuffle, _eligibleRoomsFor, _eligibleProfsFor, _occupy, _repair, _randomChromosome, _selectParent, _crossover, _mutate, solve, and _toSchedule exactly as they are ...

  _isSlotFree({ roomId, professorId, sectionId, dayIdx, timeIdx }, roomSlots, profSlots, secSlots) {
    const rk = `${roomId}-${dayIdx}-${timeIdx}`;
    const pk = `${professorId}-${dayIdx}-${timeIdx}`;
    const sk = `${sectionId}-${dayIdx}-${timeIdx}`;

    // Respect existing database schedules
    if (this.existingRoomSlots[rk] || this.existingProfSlots[pk] || this.existingSecSlots[sk]) return false;
    return !roomSlots[rk] && !profSlots[pk] && !secSlots[sk];
  }

  _fitness(chrom) {
    let hardScore = 0, softScore = 0, hardViolations = 0;
    const roomSlots = {}, profSlots = {}, secSlots = {};
    const dailySubjectCheck = {};
    const profAssignedSubjects = {};

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

      const rk = `${g.roomId}-${g.dayIdx}-${g.timeIdx}`;
      const pk = `${g.professorId}-${g.dayIdx}-${g.timeIdx}`;
      const sk = `${a.section.id}-${g.dayIdx}-${g.timeIdx}`;

      if (this.existingRoomSlots[rk]) { hardScore += PENALTY.ROOM_CONFLICT; hardViolations++; }
      if (this.existingProfSlots[pk]) { hardScore += PENALTY.PROF_CONFLICT; hardViolations++; }
      if (this.existingSecSlots[sk]) { hardScore += PENALTY.SECTION_CONFLICT; hardViolations++; }

      roomSlots[rk] = (roomSlots[rk] || 0) + 1;
      profSlots[pk] = (profSlots[pk] || 0) + 1;
      secSlots[sk] = (secSlots[sk] || 0) + 1;

      if (!profAssignedSubjects[g.professorId]) profAssignedSubjects[g.professorId] = new Set();
      profAssignedSubjects[g.professorId].add(`${a.subject.id}_${a.section.id}`);

      const dailyKey = `${a.section.id}-${a.subject.id}-${g.dayIdx}`;
      if (dailySubjectCheck[dailyKey]) { hardScore += PENALTY.SAME_DAY_CONFLICT; hardViolations++; }
      dailySubjectCheck[dailyKey] = true;
    }

    // ... Copy over the rest of the existing loops that evaluate penalty scores (room, prof, section loops, lab mismatches, etc) ...
    // Note: Instead of doing `profWork` with floats, use `profAssignedSubjects` to check workload maximums if desired, or leave your workload evaluation loop as it was.

    return { score: hardScore + softScore, hardViolations, hardScore, softScore };
  }
}