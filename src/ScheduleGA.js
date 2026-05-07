/**
 * ScheduleGA - Genetic Algorithm for University Timetabling
 * 
 * Chromosome = array of genes, one per subject-section slot.
 * Gene = { professorId, roomId, dayIdx, timeIdx }
 */

const DEFAULT_CONFIG = {
  populationSize: 80,
  maxGenerations: 300,
  mutationRate: 0.15,
  crossoverRate: 0.8,
  elitismCount: 4,
  tournamentSize: 5,
  stagnationLimit: 50,
};

const PENALTY = {
  ROOM_CONFLICT: -100,
  PROF_CONFLICT: -100,
  SECTION_CONFLICT: -100,
  LAB_MISMATCH: -80,
  CAPACITY_EXCEEDED: -50,
  WORKLOAD_EXCEEDED: -60,
};

const BONUS = {
  SPECIALIZATION_MATCH: 20,
  WORKLOAD_BALANCE: 15,
  NO_CONSECUTIVE_OVERLOAD: 10,
  SPREAD_ACROSS_WEEK: 5,
  ROOM_SIZE_FIT: 3,
};

export class ScheduleGA {
  constructor(subjects, rooms, professors, sections, days, timeSlots, config = {}) {
    this.subjects = subjects;
    this.rooms = rooms;
    this.professors = professors;
    this.sections = sections;
    this.days = days;
    this.timeSlots = timeSlots;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.assignments = this._buildAssignmentList();
    this._buildLookups();
  }

  _buildAssignmentList() {
    const list = [];
    for (const sec of this.sections) {
      for (const subId of (sec.subjects || [])) {
        const sub = this.subjects.find(s => s.id === subId || s.code === subId);
        if (!sub) continue;
        const slots = Math.max(1, Math.ceil((sub.hoursPerWeek || sub.credits || 3) / 1.5));
        for (let i = 0; i < slots; i++) {
          list.push({ subject: sub, section: sec, slotIndex: i });
        }
      }
    }
    return list;
  }

  _buildLookups() {
    this.profsByDept = {};
    for (const p of this.professors) {
      const d = p.department || 'General';
      if (!this.profsByDept[d]) this.profsByDept[d] = [];
      this.profsByDept[d].push(p);
    }
    this.profSpecMap = {};
    for (const p of this.professors) {
      this.profSpecMap[p.id] = new Set((p.specialization || []).map(s => s.toLowerCase()));
    }
    this.roomMap = {};
    for (const r of this.rooms) this.roomMap[r.id] = r;
    this.profMap = {};
    for (const p of this.professors) this.profMap[p.id] = p;
  }

  _randomChromosome() {
    return this.assignments.map(asgn => {
      const deptProfs = this.profsByDept[asgn.subject.department] || this.professors;
      const prof = deptProfs[Math.floor(Math.random() * deptProfs.length)] || this.professors[0];
      let pool = this.rooms;
      if (asgn.subject.requiredLab) {
        const labs = this.rooms.filter(r => r.hasComputers);
        if (labs.length > 0) pool = labs;
      }
      const room = pool[Math.floor(Math.random() * pool.length)];
      return {
        professorId: prof.id,
        roomId: room.id,
        dayIdx: Math.floor(Math.random() * this.days.length),
        timeIdx: Math.floor(Math.random() * this.timeSlots.length),
      };
    });
  }

  _fitness(chrom) {
    let hardScore = 0, softScore = 0, hardViolations = 0;
    const roomSlots = {}, profSlots = {}, secSlots = {}, profWork = {};

    for (let i = 0; i < chrom.length; i++) {
      const g = chrom[i], a = this.assignments[i];
      const rk = `${g.roomId}-${g.dayIdx}-${g.timeIdx}`;
      const pk = `${g.professorId}-${g.dayIdx}-${g.timeIdx}`;
      const sk = `${a.section.id}-${g.dayIdx}-${g.timeIdx}`;
      roomSlots[rk] = (roomSlots[rk] || 0) + 1;
      profSlots[pk] = (profSlots[pk] || 0) + 1;
      secSlots[sk] = (secSlots[sk] || 0) + 1;
      profWork[g.professorId] = (profWork[g.professorId] || 0) + 1;
    }

    // Hard: conflicts
    for (const k in roomSlots) if (roomSlots[k] > 1) { const o = roomSlots[k]-1; hardScore += PENALTY.ROOM_CONFLICT*o; hardViolations += o; }
    for (const k in profSlots) if (profSlots[k] > 1) { const o = profSlots[k]-1; hardScore += PENALTY.PROF_CONFLICT*o; hardViolations += o; }
    for (const k in secSlots) if (secSlots[k] > 1) { const o = secSlots[k]-1; hardScore += PENALTY.SECTION_CONFLICT*o; hardViolations += o; }

    // Hard: per-gene
    for (let i = 0; i < chrom.length; i++) {
      const g = chrom[i], a = this.assignments[i], room = this.roomMap[g.roomId];
      if (a.subject.requiredLab && room && !room.hasComputers) { hardScore += PENALTY.LAB_MISMATCH; hardViolations++; }
      const need = a.subject.capacity || a.section.studentCount || 30;
      if (room && room.capacity < need) { hardScore += PENALTY.CAPACITY_EXCEEDED; hardViolations++; }
    }

    // Hard: workload
    for (const pid in profWork) {
      const prof = this.profMap[pid];
      if (prof) {
        const max = Math.ceil((prof.maxUnits || prof.maxHours || 12) / 1.5);
        if (profWork[pid] > max) { const o = profWork[pid]-max; hardScore += PENALTY.WORKLOAD_EXCEEDED*o; hardViolations += o; }
      }
    }

    // Soft: specialization
    for (let i = 0; i < chrom.length; i++) {
      const specs = this.profSpecMap[chrom[i].professorId];
      if (specs && specs.size > 0) {
        const name = (this.assignments[i].subject.name || '').toLowerCase();
        for (const sp of specs) { if (name.includes(sp)) { softScore += BONUS.SPECIALIZATION_MATCH; break; } }
      }
    }

    // Soft: workload balance
    const wv = Object.values(profWork);
    if (wv.length > 1) {
      const avg = wv.reduce((a,b)=>a+b,0)/wv.length;
      const variance = wv.reduce((s,v)=>s+(v-avg)**2,0)/wv.length;
      softScore += Math.max(0, BONUS.WORKLOAD_BALANCE - variance * 2);
    }

    // Soft: room fit
    for (let i = 0; i < chrom.length; i++) {
      const room = this.roomMap[chrom[i].roomId];
      if (room) {
        const need = this.assignments[i].subject.capacity || this.assignments[i].section.studentCount || 30;
        if (room.capacity - need >= 0 && room.capacity - need <= 10) softScore += BONUS.ROOM_SIZE_FIT;
      }
    }

    // Soft: section day spread
    const secDays = {};
    for (let i = 0; i < chrom.length; i++) {
      const sid = this.assignments[i].section.id;
      if (!secDays[sid]) secDays[sid] = new Set();
      secDays[sid].add(chrom[i].dayIdx);
    }
    for (const sid in secDays) if (secDays[sid].size >= 3) softScore += BONUS.SPREAD_ACROSS_WEEK;

    // Soft: no consecutive overload for professors
    const profDay = {};
    for (let i = 0; i < chrom.length; i++) {
      const key = `${chrom[i].professorId}-${chrom[i].dayIdx}`;
      if (!profDay[key]) profDay[key] = [];
      profDay[key].push(chrom[i].timeIdx);
    }
    for (const key in profDay) {
      const s = profDay[key].sort((a,b)=>a-b);
      let consec = 1, bad = false;
      for (let i = 1; i < s.length; i++) { if (s[i]===s[i-1]+1) { consec++; if (consec>=3) bad=true; } else consec=1; }
      if (!bad && s.length > 0) softScore += BONUS.NO_CONSECUTIVE_OVERLOAD;
    }

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
    if (Math.random() > this.config.crossoverRate) return p1.map(g => ({...g}));
    return p1.map((g, i) => Math.random() < 0.5 ? {...g} : {...p2[i]});
  }

  _mutate(chrom) {
    for (let i = 0; i < chrom.length; i++) {
      if (Math.random() < this.config.mutationRate) {
        const g = chrom[i], a = this.assignments[i];
        switch (Math.floor(Math.random() * 4)) {
          case 0: {
            let pool = this.rooms;
            if (a.subject.requiredLab) { const labs = this.rooms.filter(r=>r.hasComputers); if (labs.length) pool = labs; }
            g.roomId = pool[Math.floor(Math.random()*pool.length)].id;
            break;
          }
          case 1: g.dayIdx = Math.floor(Math.random()*this.days.length); break;
          case 2: g.timeIdx = Math.floor(Math.random()*this.timeSlots.length); break;
          case 3: {
            const dp = this.profsByDept[a.subject.department] || this.professors;
            if (dp.length) g.professorId = dp[Math.floor(Math.random()*dp.length)].id;
            break;
          }
        }
      }
    }
    return chrom;
  }

  async solve(onProgress = null) {
    const { populationSize, maxGenerations, elitismCount, stagnationLimit } = this.config;
    if (this.assignments.length === 0) {
      return { schedule: [], fitness: { score: 0, hardViolations: 0 }, stats: { generations: 0, totalAssignments: 0, hardViolations: 0 } };
    }

    let pop = Array.from({ length: populationSize }, () => this._randomChromosome());
    let bestEver = null, bestFit = { score: -Infinity, hardViolations: Infinity };
    let stag = 0, genRan = 0;

    for (let gen = 0; gen < maxGenerations; gen++) {
      genRan = gen + 1;
      const fits = pop.map(ch => this._fitness(ch));
      let bIdx = 0;
      for (let i = 1; i < fits.length; i++) if (fits[i].score > fits[bIdx].score) bIdx = i;

      if (fits[bIdx].score > bestFit.score) {
        bestFit = { ...fits[bIdx] };
        bestEver = pop[bIdx].map(g => ({...g}));
        stag = 0;
      } else stag++;

      if (onProgress) onProgress(gen + 1, bestFit, maxGenerations);

      if (bestFit.hardViolations === 0 && stag >= Math.floor(stagnationLimit/2)) break;
      if (stag >= stagnationLimit) break;

      const sorted = fits.map((f,i)=>({f,i})).sort((a,b)=>b.f.score-a.f.score);
      const next = [];
      for (let i = 0; i < elitismCount && i < sorted.length; i++) next.push(pop[sorted[i].i].map(g=>({...g})));
      while (next.length < populationSize) {
        let child = this._crossover(this._selectParent(pop, fits), this._selectParent(pop, fits));
        child = this._mutate(child);
        next.push(child);
      }
      pop = next;

      if (gen % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

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
      return {
        subject: a.subject,
        section: a.section,
        professor: this.profMap[g.professorId] || { id: g.professorId, name: 'Unknown' },
        room: this.roomMap[g.roomId] || { id: g.roomId, name: 'Unknown' },
        day: this.days[g.dayIdx],
        timeSlot: this.timeSlots[g.timeIdx],
      };
    });
  }
}
