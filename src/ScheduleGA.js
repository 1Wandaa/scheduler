/**
 * ScheduleGA - Genetic Algorithm for University Timetabling
 */

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
  SAME_DAY_CONFLICT: -90,
  LAB_MISMATCH: -80,
  WORKLOAD_EXCEEDED: -60,
};

const BONUS = {
  SPECIALIZATION_MATCH: 20,
  ROOM_PREFERENCE: 15,
  WORKLOAD_BALANCE: 15,
  NO_CONSECUTIVE_OVERLOAD: 10,
  SPREAD_ACROSS_WEEK: 5,
  SAME_ROOM_TIME_DIFFERENT_DAYS: 30,
};

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
        if (s.room) this.existingRoomSlots[`${s.room.id}-${dIdx}-${tIdx}`] = true;
        if (s.professor) this.existingProfSlots[`${s.professor.id}-${dIdx}-${tIdx}`] = true;
        if (s.section) this.existingSecSlots[`${s.section.id}-${dIdx}-${tIdx}`] = true;
      }
    }

    // Overlap Matrix for Time Slots
    this.overlapMatrix = {};
    const parseTime = (timeStr) => {
        if (!timeStr) return 0;
        const parts = timeStr.trim().split(' ');
        if (parts.length < 2) return 0;
        let [h, m] = parts[0].split(':').map(Number);
        if (parts[1].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (parts[1].toUpperCase() === 'AM' && h === 12) h = 0;
        return h * 60 + m;
    };

    for (let i = 0; i < this.timeSlots.length; i++) {
        this.overlapMatrix[i] = [];
        const t1 = this.timeSlots[i].time || this.timeSlots[i].label || '';
        if (!t1) continue;
        const [start1Str, end1Str] = t1.split('-');
        const start1 = parseTime(start1Str);
        const end1 = parseTime(end1Str);

        for (let j = 0; j < this.timeSlots.length; j++) {
            const t2 = this.timeSlots[j].time || this.timeSlots[j].label || '';
            if (!t2) continue;
            const [start2Str, end2Str] = t2.split('-');
            const start2 = parseTime(start2Str);
            const end2 = parseTime(end2Str);
            
            // Overlap condition (exclusive of exact boundaries)
            if (start1 < end2 && start2 < end1) {
                this.overlapMatrix[i].push(j);
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

  _eligibleRoomsFor(a) {
    let pool = this.rooms;
    if (a.subject.requiredLab) {
      const labs = this.rooms.filter(r => r.hasComputers);
      if (labs.length > 0) pool = labs;
    }
    return pool;
  }

  _eligibleTimeSlotsFor(a) {
    const dur = a.targetDuration || 1.5;
    return this.timeSlots.map((ts, idx) => ({ ts, idx }))
      .filter(item => {
        const slotDur = item.ts.duration || 1.5;
        return slotDur === dur;
      })
      .map(item => item.idx);
  }

  _eligibleProfsFor(a, profWork = null) {
    const subject = a.subject;
    let pool = this.professors;
    if (subject) {
      pool = this.professors.filter(p => {
        const specs = p.specialization || [];
        const subId = String(subject.id).toLowerCase();
        const subCode = (subject.code ? String(subject.code).toLowerCase() : '');
        const subName = (subject.name ? String(subject.name).toLowerCase() : '');

        return specs.some(s => {
          const spec = String(s).toLowerCase().trim();
          if (!spec) return false;
          // Fuzzy match on Subject ID, Code, or Name
          return subId.includes(spec) || subCode.includes(spec) || subName.includes(spec) || spec === subId || spec === subCode;
        });
      });
    }

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

  _isSlotFree({ roomId, professorId, sectionId, dayIdx, timeIdx }, roomSlots, profSlots, secSlots) {
    const overlaps = this.overlapMatrix[timeIdx] || [timeIdx];
    for (const t of overlaps) {
      const rk = `${roomId}-${dayIdx}-${t}`;
      const pk = `${professorId}-${dayIdx}-${t}`;
      const sk = `${sectionId}-${dayIdx}-${t}`;

      if (this.existingRoomSlots[rk] || this.existingProfSlots[pk] || this.existingSecSlots[sk]) return false;
      if (roomSlots[rk] || profSlots[pk] || secSlots[sk]) return false;
    }
    return true;
  }

  _occupy({ roomId, professorId, sectionId, dayIdx, timeIdx }, roomSlots, profSlots, secSlots) {
    roomSlots[`${roomId}-${dayIdx}-${timeIdx}`] = 1;
    profSlots[`${professorId}-${dayIdx}-${timeIdx}`] = 1;
    secSlots[`${sectionId}-${dayIdx}-${timeIdx}`] = 1;
  }

  _repair(chrom) {
    if (!chrom || chrom.length === 0) return chrom;

    const roomSlots = {};
    const profSlots = {};
    const secSlots = {};
    const profWork = {};
    const assignedSecSub = {};

    const idxs = this._shuffle(Array.from({ length: chrom.length }, (_, i) => i));

    for (const i of idxs) {
      const a = this.assignments[i];
      const sectionId = a.section.id;
      const secSubKey = `${sectionId}-${a.subject.id}`;
      const creditPerSlot = (Number(a.subject?.credits) || 3) / (a.totalMeetings || Math.max(1, Math.ceil((Number(a.subject?.credits) || 3) / 1.5)));

      const rooms = this._shuffle([...this._eligibleRoomsFor(a)]);
      const profs = this._shuffle([...this._eligibleProfsFor(a, profWork)]);

      let placed = false;
      let bestFallback = null;

      const g = chrom[i];
      let validExisting = false;
      if (g && g.professorId && g.roomId) {
        const isProfEligible = profs.some(p => p.id === g.professorId);
        const isRoomEligible = rooms.some(r => r.id === g.roomId);
        if (isProfEligible && isRoomEligible) {
          const ok = this._isSlotFree(
            { roomId: g.roomId, professorId: g.professorId, sectionId, dayIdx: g.dayIdx, timeIdx: g.timeIdx },
            roomSlots, profSlots, secSlots
          );
          if (ok) validExisting = true;
        }
      }

      if (validExisting) {
        this._occupy({ roomId: g.roomId, professorId: g.professorId, sectionId, dayIdx: g.dayIdx, timeIdx: g.timeIdx }, roomSlots, profSlots, secSlots);
        profWork[g.professorId] = (Number(profWork[g.professorId]) || 0) + creditPerSlot;
        
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
          room = rooms[this._randInt(rooms.length)];
          const validTimes = this._eligibleTimeSlotsFor(a);
          timeIdx = validTimes[this._randInt(validTimes.length)];
        }

        if (!room) break;

        const dayIdx = this._randInt(this.days.length);

        const ok = this._isSlotFree(
          { roomId: room.id, professorId: prof.id, sectionId, dayIdx, timeIdx },
          roomSlots,
          profSlots,
          secSlots
        );

        let sameDayConflict = false;
        if (usePref && pref.daysUsed && pref.daysUsed.has(dayIdx)) {
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
        this._occupy({ roomId: room.id, professorId: prof.id, sectionId, dayIdx, timeIdx }, roomSlots, profSlots, secSlots);
        profWork[prof.id] = (Number(profWork[prof.id]) || 0) + creditPerSlot;

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
          this._occupy({ roomId: chrom[i].roomId, professorId: chrom[i].professorId, sectionId, dayIdx: chrom[i].dayIdx, timeIdx: chrom[i].timeIdx }, roomSlots, profSlots, secSlots);
          profWork[chrom[i].professorId] = (profWork[chrom[i].professorId] || 0) + creditPerSlot;
          
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
    return chrom;
  }

  _randomChromosome() {
    const chrom = this.assignments.map(a => {
      const profs = this._eligibleProfsFor(a);
      const prof = profs[this._randInt(profs.length)];
      const rooms = this._eligibleRoomsFor(a);
      const room = rooms[this._randInt(rooms.length)];
      const validTimes = this._eligibleTimeSlotsFor(a);
      return {
        professorId: prof?.id || null,
        roomId: room?.id || null,
        dayIdx: this._randInt(this.days.length),
        timeIdx: validTimes[this._randInt(validTimes.length)],
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

      if (!profTimeline[g.professorId]) profTimeline[g.professorId] = {};
      if (!secTimeline[a.section.id]) secTimeline[a.section.id] = {};
      if (!roomTimeline[g.roomId]) roomTimeline[g.roomId] = {};
      if (!profTimeline[g.professorId][g.dayIdx]) profTimeline[g.professorId][g.dayIdx] = [];
      if (!secTimeline[a.section.id][g.dayIdx]) secTimeline[a.section.id][g.dayIdx] = [];
      if (!roomTimeline[g.roomId][g.dayIdx]) roomTimeline[g.roomId][g.dayIdx] = [];
      
      profTimeline[g.professorId][g.dayIdx].push({ timeIdx: g.timeIdx, roomId: g.roomId });
      secTimeline[a.section.id][g.dayIdx].push({ timeIdx: g.timeIdx, roomId: g.roomId });
      roomTimeline[g.roomId][g.dayIdx].push({ timeIdx: g.timeIdx });

      const creditPerSlot = (Number(a.subject?.credits) || 3) / (a.totalMeetings || Math.max(1, Math.ceil((Number(a.subject?.credits) || 3) / 1.5)));
      profWork[g.professorId] = (profWork[g.professorId] || 0) + creditPerSlot;

      if (this.existingRoomSlots[rk]) { hardScore += PENALTY.ROOM_CONFLICT; hardViolations++; }
      if (this.existingProfSlots[pk]) { hardScore += PENALTY.PROF_CONFLICT; hardViolations++; }
      if (this.existingSecSlots[sk]) { hardScore += PENALTY.SECTION_CONFLICT; hardViolations++; }

      roomSlots[rk] = (roomSlots[rk] || 0) + 1;
      profSlots[pk] = (profSlots[pk] || 0) + 1;
      secSlots[sk] = (secSlots[sk] || 0) + 1;

      if (!profAssignedSubjects[g.professorId]) profAssignedSubjects[g.professorId] = new Set();
      profAssignedSubjects[g.professorId].add(`${a.subject.id}_${a.section.id}`);

      const secSubKey = `${a.section.id}-${a.subject.id}`;
      if (!sectionSubjectMeetings[secSubKey]) sectionSubjectMeetings[secSubKey] = [];
      sectionSubjectMeetings[secSubKey].push(g);

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
    }

    for (const k in roomSlots) if (roomSlots[k] > 1) { const o = roomSlots[k] - 1; hardScore += PENALTY.ROOM_CONFLICT * o; hardViolations += o; }
    for (const k in profSlots) if (profSlots[k] > 1) { const o = profSlots[k] - 1; hardScore += PENALTY.PROF_CONFLICT * o; hardViolations += o; }
    for (const k in secSlots) if (secSlots[k] > 1) { const o = secSlots[k] - 1; hardScore += PENALTY.SECTION_CONFLICT * o; hardViolations += o; }

    for (let i = 0; i < chrom.length; i++) {
      const g = chrom[i], a = this.assignments[i];
      if (!g || !g.roomId) continue;
      const room = this.roomMap[g.roomId];
      if (a.subject.requiredLab && room && !room.hasComputers) { hardScore += PENALTY.LAB_MISMATCH; hardViolations++; }
    }

    for (let i = 0; i < chrom.length; i++) {
      if (!chrom[i] || !chrom[i].professorId) continue;
      const prof = this.profMap[chrom[i].professorId];

      const specs = this.profSpecMap[chrom[i].professorId];
      if (specs && specs.size > 0) {
        const name = (this.assignments[i].subject.name || '').toLowerCase();
        for (const sp of specs) { if (name.includes(sp)) { softScore += BONUS.SPECIALIZATION_MATCH; break; } }
      }

      if (prof && prof.preferredRooms && prof.preferredRooms.includes(chrom[i].roomId)) {
        softScore += BONUS.ROOM_PREFERENCE;
      }
    }

    // Add bonus for multiple meetings of the same subject-section having the same room and time
    for (const key in sectionSubjectMeetings) {
      const meetings = sectionSubjectMeetings[key];
      if (meetings.length > 1) {
        const first = meetings[0];
        if (!first || !first.roomId) continue;

        let allSameTimeAndRoom = true;
        let allDifferentDays = true;
        const daysUsed = new Set([first.dayIdx]);

        for (let i = 1; i < meetings.length; i++) {
          const m = meetings[i];
          if (!m || !m.roomId) {
            allSameTimeAndRoom = false;
            break;
          }
          if (m.roomId !== first.roomId || m.timeIdx !== first.timeIdx) {
            allSameTimeAndRoom = false;
          }
          if (daysUsed.has(m.dayIdx)) {
            allDifferentDays = false;
          }
          daysUsed.add(m.dayIdx);
        }

        if (allSameTimeAndRoom && allDifferentDays) {
          // Bonus per additional meeting that successfully matches the pattern
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

    // Check consecutive classes and travel time
    const checkTimeline = (timeline, isProf) => {
      for (const id in timeline) {
        for (const day in timeline[id]) {
          const classes = timeline[id][day].sort((a, b) => a.timeIdx - b.timeIdx);
          let consecutive = 1;
          for (let i = 0; i < classes.length; i++) {
            const curr = classes[i];
            
            // Check true overlap using the precomputed matrix
            for (let j = i + 1; j < classes.length; j++) {
              const next = classes[j];
              if (this.overlapMatrix[curr.timeIdx] && this.overlapMatrix[curr.timeIdx].includes(next.timeIdx)) {
                 hardScore += isProf ? PENALTY.PROF_CONFLICT : PENALTY.SECTION_CONFLICT;
                 hardViolations++;
              }
            }

            if (i > 0) {
              const prev = classes[i-1];
              // Use index adjacency as a proxy for consecutive logic
              if (curr.timeIdx === prev.timeIdx + 1) {
                 consecutive++;
                 if (consecutive > 4) {
                    if (isProf) hardScore += PENALTY.WORKLOAD_EXCEEDED / 2;
                 }
                 if (curr.roomId !== prev.roomId) {
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
               if (this.overlapMatrix[classes[i].timeIdx] && this.overlapMatrix[classes[i].timeIdx].includes(classes[j].timeIdx)) {
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
      return { schedule: [], fitness: { score: 0, hardViolations: 0 }, stats: { generations: 0, totalAssignments: 0, hardViolations: 0 } };
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

      if (gen % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

    this.config.mutationRate = baseMutation;

    return {
      schedule: this._toSchedule(bestEver),
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
      return {
        subject: a.subject,
        section: a.section,
        professor: this.profMap[g.professorId],
        room: this.roomMap[g.roomId],
        day: this.days[g.dayIdx],
        timeSlot: this.timeSlots[g.timeIdx],
      };
    });
  }
}