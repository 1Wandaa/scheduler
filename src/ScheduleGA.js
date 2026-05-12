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
  // When true, we apply a repair pass to push chromosomes toward feasibility.
  repair: true,
  // How many random attempts per gene during repair.
  repairTriesPerGene: 40,
};

const PENALTY = {
  ROOM_CONFLICT: -100,
  PROF_CONFLICT: -100,
  SECTION_CONFLICT: -100,
  LAB_MISMATCH: -80,
  WORKLOAD_EXCEEDED: -60,
};

const BONUS = {
  SPECIALIZATION_MATCH: 20,
  WORKLOAD_BALANCE: 15,
  NO_CONSECUTIVE_OVERLOAD: 10,
  SPREAD_ACROSS_WEEK: 5,
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
    this._validateInputs();
    this.assignments = this._buildAssignmentList();
    this._buildLookups();
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
    this.profSpecMap = {};
    for (const p of this.professors) {
      this.profSpecMap[p.id] = new Set((p.specialization || []).map(s => s.toLowerCase()));
    }
    this.roomMap = {};
    for (const r of this.rooms) this.roomMap[r.id] = r;
    this.profMap = {};
    for (const p of this.professors) this.profMap[p.id] = p;
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

  _eligibleProfsFor(a, profWork = null) {
    const subject = a.subject;
    let pool = this.professors;
    if (subject) {
      const validProfs = this.professors.filter(p => {
        const specs = p.specialization || [];
        return specs.includes(subject.id) ||
          specs.includes(subject.code) ||
          specs.some(s => typeof s === 'string' && subject.name?.toLowerCase().includes(s.toLowerCase()));
      });

      // Strict constraint: Enforce validProfs only. 
      // If none are qualified, return an empty array to force an error.
      pool = validProfs;
    }

    if (!profWork) return pool;

    const feasible = [];
    const fallback = [];
    for (const p of pool) {
      const max = Math.ceil((p.maxUnits || p.maxHours || 12) / 1.5);
      const w = profWork[p.id] || 0;
      if (w < max) feasible.push(p);
      fallback.push(p);
    }
    return feasible.length > 0 ? feasible : fallback;
  }

  _isSlotFree({ roomId, professorId, sectionId, dayIdx, timeIdx }, roomSlots, profSlots, secSlots) {
    const rk = `${roomId}-${dayIdx}-${timeIdx}`;
    const pk = `${professorId}-${dayIdx}-${timeIdx}`;
    const sk = `${sectionId}-${dayIdx}-${timeIdx}`;
    return !roomSlots[rk] && !profSlots[pk] && !secSlots[sk];
  }

  _occupy({ roomId, professorId, sectionId, dayIdx, timeIdx }, roomSlots, profSlots, secSlots) {
    roomSlots[`${roomId}-${dayIdx}-${timeIdx}`] = 1;
    profSlots[`${professorId}-${dayIdx}-${timeIdx}`] = 1;
    secSlots[`${sectionId}-${dayIdx}-${timeIdx}`] = 1;
  }

  _repair(chrom) {
    // Greedy repair to reduce hard violations: try to re-place genes into conflict-free slots.
    if (!chrom || chrom.length === 0) return chrom;

    const roomSlots = {};
    const profSlots = {};
    const secSlots = {};
    const profWork = {};

    const idxs = this._shuffle(Array.from({ length: chrom.length }, (_, i) => i));

    for (const i of idxs) {
      const a = this.assignments[i];
      const sectionId = a.section.id;

      // Build candidate lists (shuffled) to diversify.
      const rooms = this._shuffle([...this._eligibleRoomsFor(a)]);
      const profs = this._shuffle([...this._eligibleProfsFor(a, profWork)]);

      let placed = false;
      let bestFallback = null;

      for (let t = 0; t < this.config.repairTriesPerGene; t++) {
        const prof = profs[this._randInt(profs.length)];
        const room = rooms[this._randInt(rooms.length)];
        const dayIdx = this._randInt(this.days.length);
        const timeIdx = this._randInt(this.timeSlots.length);

        const ok = this._isSlotFree(
          { roomId: room.id, professorId: prof.id, sectionId, dayIdx, timeIdx },
          roomSlots,
          profSlots,
          secSlots
        );

        // Track a fallback that minimizes conflicts in case we cannot find a perfect placement.
        if (!ok) {
          const rk = `${room.id}-${dayIdx}-${timeIdx}`;
          const pk = `${prof.id}-${dayIdx}-${timeIdx}`;
          const sk = `${sectionId}-${dayIdx}-${timeIdx}`;
          const conflicts = (roomSlots[rk] ? 1 : 0) + (profSlots[pk] ? 1 : 0) + (secSlots[sk] ? 1 : 0);
          if (!bestFallback || conflicts < bestFallback.conflicts) {
            bestFallback = { roomId: room.id, professorId: prof.id, dayIdx, timeIdx, conflicts };
          }
          continue;
        }

        // Workload feasibility (softly enforced here, still penalized by fitness).
        const p = this.profMap[prof.id];
        const max = p ? Math.ceil((p.maxUnits || p.maxHours || 12) / 1.5) : Infinity;
        const w = profWork[prof.id] || 0;
        if (w + 1 > max) {
          // Keep as fallback, but try to find another professor first.
          if (!bestFallback) bestFallback = { roomId: room.id, professorId: prof.id, dayIdx, timeIdx, conflicts: 0 };
          continue;
        }

        chrom[i] = { professorId: prof.id, roomId: room.id, dayIdx, timeIdx };
        this._occupy({ roomId: room.id, professorId: prof.id, sectionId, dayIdx, timeIdx }, roomSlots, profSlots, secSlots);
        profWork[prof.id] = (profWork[prof.id] || 0) + 1;
        placed = true;
        break;
      }

      if (!placed) {
        // Fall back to the least-conflicting option we saw.
        const g = bestFallback || chrom[i];
        chrom[i] = { professorId: g.professorId, roomId: g.roomId, dayIdx: g.dayIdx, timeIdx: g.timeIdx };
        this._occupy({ roomId: chrom[i].roomId, professorId: chrom[i].professorId, sectionId, dayIdx: chrom[i].dayIdx, timeIdx: chrom[i].timeIdx }, roomSlots, profSlots, secSlots);
        profWork[chrom[i].professorId] = (profWork[chrom[i].professorId] || 0) + 1;
      }
    }

    return chrom;
  }

  _randomChromosome() {
    const chrom = this.assignments.map(a => {
      const profs = this._eligibleProfsFor(a);
      const prof = profs[this._randInt(profs.length)] || this.professors[0];
      const rooms = this._eligibleRoomsFor(a);
      const room = rooms[this._randInt(rooms.length)] || this.rooms[0];
      return {
        professorId: prof?.id,
        roomId: room?.id,
        dayIdx: this._randInt(this.days.length),
        timeIdx: this._randInt(this.timeSlots.length),
      };
    });
    return this.config.repair ? this._repair(chrom) : chrom;
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
    for (const k in roomSlots) if (roomSlots[k] > 1) { const o = roomSlots[k] - 1; hardScore += PENALTY.ROOM_CONFLICT * o; hardViolations += o; }
    for (const k in profSlots) if (profSlots[k] > 1) { const o = profSlots[k] - 1; hardScore += PENALTY.PROF_CONFLICT * o; hardViolations += o; }
    for (const k in secSlots) if (secSlots[k] > 1) { const o = secSlots[k] - 1; hardScore += PENALTY.SECTION_CONFLICT * o; hardViolations += o; }

    // Hard: per-gene
    for (let i = 0; i < chrom.length; i++) {
      const g = chrom[i], a = this.assignments[i], room = this.roomMap[g.roomId];
      if (a.subject.requiredLab && room && !room.hasComputers) { hardScore += PENALTY.LAB_MISMATCH; hardViolations++; }
    }

    // Hard: workload
    for (const pid in profWork) {
      const prof = this.profMap[pid];
      if (prof) {
        const max = Math.ceil((prof.maxUnits || prof.maxHours || 12) / 1.5);
        if (profWork[pid] > max) { const o = profWork[pid] - max; hardScore += PENALTY.WORKLOAD_EXCEEDED * o; hardViolations += o; }
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
      const avg = wv.reduce((a, b) => a + b, 0) / wv.length;
      const variance = wv.reduce((s, v) => s + (v - avg) ** 2, 0) / wv.length;
      softScore += Math.max(0, BONUS.WORKLOAD_BALANCE - variance * 2);
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
      const s = profDay[key].sort((a, b) => a - b);
      let consec = 1, bad = false;
      for (let i = 1; i < s.length; i++) { if (s[i] === s[i - 1] + 1) { consec++; if (consec >= 3) bad = true; } else consec = 1; }
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
    if (Math.random() > this.config.crossoverRate) return p1.map(g => ({ ...g }));
    return p1.map((g, i) => Math.random() < 0.5 ? { ...g } : { ...p2[i] });
  }

  _mutate(chrom) {
    for (let i = 0; i < chrom.length; i++) {
      if (Math.random() < this.config.mutationRate) {
        const g = chrom[i], a = this.assignments[i];
        switch (Math.floor(Math.random() * 4)) {
          case 0: {
            const pool = this._eligibleRoomsFor(a);
            g.roomId = pool[this._randInt(pool.length)].id;
            break;
          }
          case 1: g.dayIdx = this._randInt(this.days.length); break;
          case 2: g.timeIdx = this._randInt(this.timeSlots.length); break;
          case 3: {
            const dp = this._eligibleProfsFor(a);
            if (dp.length) g.professorId = dp[this._randInt(dp.length)].id;
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

      // Adaptive mutation: increase exploration during stagnation or when still infeasible.
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

    // Restore base mutation (avoid surprising callers reusing config object).
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
