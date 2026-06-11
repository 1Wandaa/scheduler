/**
 * Web Worker for ScheduleGA — runs the Genetic Algorithm off the main thread
 * so the UI stays responsive during timetable generation.
 *
 * Communication protocol:
 *   Main → Worker:  { type: 'start', payload: { subjects, rooms, professors, sections, days, timeSlots, existingSchedules, config, aiProfessorMap } }
 *   Worker → Main:  { type: 'progress', gen, max, fitness }
 *   Worker → Main:  { type: 'done', result: { schedule, prescriptions, fitness, stats } }
 *   Worker → Main:  { type: 'error', message }
 */

import { ScheduleGA } from './ScheduleGA.js';

self.onmessage = async function (e) {
  const { type, payload } = e.data;

  if (type !== 'start') return;

  try {
    const {
      subjects, rooms, professors, sections, days, timeSlots,
      existingSchedules, config, aiProfessorMap
    } = payload;

    const ga = new ScheduleGA(
      subjects, rooms, professors, sections, days, timeSlots,
      existingSchedules || [], config || {}, aiProfessorMap || null
    );

    const result = await ga.solve((gen, bestFitness, totalGens) => {
      // Send progress back to main thread
      self.postMessage({ type: 'progress', gen, max: totalGens, fitness: bestFitness });
    });

    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
