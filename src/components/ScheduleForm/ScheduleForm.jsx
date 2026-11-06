import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIME_SLOTS, DAYS, FOUR_DAY_DAYS, isLunchSlot, overlapsLunchBreak } from '../../config/constants';
import {
  getEligibleProfessors,
  professorMatchesSubject,
  slotsNeededFromIndex,
  getMeetingTimeLabel,
  findScheduleConflicts,
  findAlternativeSlots,
  getSmartScheduleRecommendations,
  normalizeDay,
  resolveToDayPair,
  getScheduleTimeRange,
  parseTimeToMinutes,
  entitiesMatch,
  isRoomAllowedFor,
  isProfessorAllowedInRoom
} from '../../utils/scheduleUtils';
import CustomSelect from '../CustomSelect/CustomSelect';
import '../../styles/SchedulerForm.css';

function ScheduleForm({ rooms, professors, subjects, sections, onSchedule, validator, activeSemester, activeSchedules = [], onLogHistory, onSuccess, scheduleMode = 'standard' }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    subject: '',
    section: '',
    professor: '',
    room: '',
    day: [],
    timeSlot: {},
    component: 'Lecture' // default to Lecture
  });

  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openTimeSlotDay, setOpenTimeSlotDay] = useState(null);
  const [timeSlotSearch, setTimeSlotSearch] = useState({});
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenTimeSlotDay(null);
        setTimeSlotSearch({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = { ...prev, [name]: value };

      if (name === 'subject') {
        newData.component = 'Lecture';
        newData.timeSlot = {};
        if (!value) {
          newData.room = '';
        } else {
          const sub = subjects.find(s => s.id === value);
          // If professor was selected, verify they can teach the newly selected subject
          if (newData.professor) {
            const prof = professors.find(p => p.id === newData.professor);
            if (prof && sub && !professorMatchesSubject(prof, sub)) {
              newData.professor = '';
            }
          }
          // If section was selected, verify it is enrolled in the newly selected subject
          if (newData.section) {
            const sec = sections ? sections.find(s => s.id === newData.section) : null;
            if (sec && sub) {
              const secSubs = sec.subjects || [];
              const enrolled = secSubs.some(s => entitiesMatch(s, sub));
              if (!enrolled) {
                newData.section = '';
              }
            }
          }
          // If room was selected, verify it is allowed for the newly selected subject
          if (newData.room && sub) {
            const r = rooms.find(room => room.id === newData.room);
            const sec = sections ? sections.find(s => s.id === newData.section) : null;
            const prof = professors.find(p => p.id === newData.professor);
            const isCompLabNeeded = sub.requiredLab && (!sub.hasLecLab || newData.component !== 'Lecture');
            const isFoodLabNeeded = sub.isFoodLab && (!sub.hasLecLab || newData.component !== 'Lecture');
            if (r) {
              if ((isCompLabNeeded && !r.hasComputers) ||
                  (isFoodLabNeeded && !r.isFoodLab) ||
                  !isRoomAllowedFor(r, sub, sec) ||
                  (prof && !isProfessorAllowedInRoom(r, prof, sub, sec, rooms))) {
                newData.room = '';
              }
            }
          }
        }
      } else if (name === 'professor') {
        if (value) {
          const prof = professors.find(p => p.id === value);
          // If subject was selected, verify it matches the newly selected professor
          if (newData.subject) {
            const sub = subjects.find(s => s.id === newData.subject);
            if (prof && sub && !professorMatchesSubject(prof, sub)) {
              newData.subject = '';
            }
          }
          // If section was selected, verify it is eligible for the newly selected professor
          if (newData.section) {
            const sec = sections ? sections.find(s => s.id === newData.section) : null;
            if (sec && prof) {
              if (prof.assignedSections && prof.assignedSections.length > 0) {
                const isAssigned = prof.assignedSections.some(s => entitiesMatch(s, sec));
                if (!isAssigned) {
                  newData.section = '';
                }
              }
            }
          }
          // If room was selected, verify professor is allowed in this room
          if (newData.room && prof) {
            const r = rooms.find(room => room.id === newData.room);
            const sub = subjects.find(s => s.id === newData.subject);
            const sec = sections ? sections.find(s => s.id === newData.section) : null;
            if (r && sub && !isProfessorAllowedInRoom(r, prof, sub, sec, rooms)) {
              newData.room = '';
            }
          }
        }
      } else if (name === 'section') {
        if (value) {
          const sec = sections ? sections.find(s => s.id === value) : null;
          // If subject was selected, verify it is enrolled in this section
          if (newData.subject) {
            const sub = subjects.find(s => s.id === newData.subject);
            if (sec && sub) {
              const secSubs = sec.subjects || [];
              const enrolled = secSubs.some(s => entitiesMatch(s, sub));
              if (!enrolled) {
                newData.subject = '';
              }
            }
          }
          // If professor was selected, verify eligibility for this section
          if (newData.professor) {
            const prof = professors.find(p => p.id === newData.professor);
            if (sec && prof) {
              if (prof.assignedSections && prof.assignedSections.length > 0) {
                const isAssigned = prof.assignedSections.some(s => entitiesMatch(s, sec));
                if (!isAssigned) {
                  newData.professor = '';
                }
              }
            }
          }
          // If room was selected, verify room is allowed for this section
          if (newData.room && sec) {
            const r = rooms.find(room => room.id === newData.room);
            const sub = subjects.find(s => s.id === newData.subject);
            if (r && sub && !isRoomAllowedFor(r, sub, sec)) {
              newData.room = '';
            }
          }
        }
      } else if (name === 'component') {
        newData.timeSlot = {};
        // If switching to Laboratory, verify if the selected room meets lab requirements
        if (value === 'Laboratory' && newData.room && newData.subject) {
          const sub = subjects.find(s => s.id === newData.subject);
          const r = rooms.find(room => room.id === newData.room);
          if (sub && r) {
            if ((sub.requiredLab && !r.hasComputers) || (sub.isFoodLab && !r.isFoodLab)) {
              newData.room = '';
            }
          }
        }
      }

      return newData;
    });
    setValidation(null);
  };

  const selectedSubject = subjects.find(s => s.id === formData.subject);
  const selectedSection = sections ? sections.find(s => s.id === formData.section) : null;
  const selectedProfessor = professors.find(p => p.id === formData.professor);
  const selectedRoom = rooms.find(r => r.id === formData.room);

  // Active semester subjects base
  const activeSemesterSubjects = subjects.filter(s => !activeSemester || !s.semester || s.semester === 'Both' || s.semester === activeSemester);

  // Eligible Subjects: filtered by active semester, selected professor's subjects, and selected section's subjects
  const eligibleSubjects = activeSemesterSubjects.filter(sub => {
    if (selectedProfessor && !professorMatchesSubject(selectedProfessor, sub)) {
      return false;
    }
    if (selectedSection) {
      const secSubjects = selectedSection.subjects || [];
      const isEnrolled = secSubjects.some(s => entitiesMatch(s, sub));
      if (!isEnrolled) return false;
    }
    return true;
  });

  // Eligible Sections: filtered by selected subject and selected professor
  const eligibleSections = sections ? sections.filter(sec => {
    const secSubjects = sec.subjects || [];

    if (selectedSubject) {
      const isEnrolled = secSubjects.some(s => entitiesMatch(s, selectedSubject));
      if (!isEnrolled) return false;
    }

    if (selectedProfessor) {
      if (selectedProfessor.assignedSections && selectedProfessor.assignedSections.length > 0) {
        const isAssigned = selectedProfessor.assignedSections.some(s => entitiesMatch(s, sec));
        if (!isAssigned) return false;
      } else if (!selectedSubject) {
        const profSubjects = activeSemesterSubjects.filter(sub => professorMatchesSubject(selectedProfessor, sub));
        const takesAnyProfSubject = profSubjects.some(sub =>
          secSubjects.some(s => entitiesMatch(s, sub))
        );
        if (!takesAnyProfSubject) return false;
      }
    }

    return true;
  }) : [];

  // Eligible Professors: filtered by selected subject and selected section
  const eligibleProfessors = selectedSubject
    ? getEligibleProfessors(professors, selectedSubject, selectedSection)
    : selectedSection
      ? professors.filter(p => {
        const secSubjects = selectedSection.subjects || [];
        const profSubjects = activeSemesterSubjects.filter(sub => professorMatchesSubject(p, sub));
        const matchesSecSubject = profSubjects.some(sub =>
          secSubjects.some(s => entitiesMatch(s, sub))
        );
        if (!matchesSecSubject) return false;

        if (p.assignedSections && p.assignedSections.length > 0) {
          return p.assignedSections.some(s => entitiesMatch(s, selectedSection));
        }
        return true;
      })
      : professors;

  const currentRenderHours = selectedSubject?.hasLecLab 
    ? (formData.component === 'Lecture' ? ((Number(selectedSubject.lectureHours) || 2) / 2) : ((Number(selectedSubject.labHours) || 3) / 2)) 
    : (Number(selectedSubject?.hoursPerMeeting) || 1.5);

  const isPESubject = selectedSubject?.code?.toUpperCase().startsWith('PE');
  const eligibleTimeSlots = selectedSubject
    ? TIME_SLOTS.filter((slot, idx) => {
        if (isLunchSlot(slot)) return false;
        if (isPESubject && String(slot.id) === '2') return false;
        return slotsNeededFromIndex(idx, currentRenderHours, scheduleMode) > 0;
      })
    : TIME_SLOTS.filter(slot => !isLunchSlot(slot));

  const resolveTimeSlotForDay = (day) => {
    if (!formData.timeSlot) return null;
    const timeStr = typeof formData.timeSlot === 'object' && formData.timeSlot !== null
      ? (formData.timeSlot[day] || formData.timeSlot[normalizeDay(day)])
      : formData.timeSlot;
    if (!timeStr) return null;

    const cleanTimeStr = (str) => String(str || '').replace(/\s+/g, '').toUpperCase();
    const targetStr = cleanTimeStr(timeStr);

    let resolvedSlot = eligibleTimeSlots.find(t =>
      cleanTimeStr(getMeetingTimeLabel(t, currentRenderHours, scheduleMode)) === targetStr ||
      cleanTimeStr(t.label) === targetStr ||
      cleanTimeStr(t.time) === targetStr
    );
    if (!resolvedSlot) resolvedSlot = TIME_SLOTS.find(t => String(t.id) === String(timeStr));

    if (!resolvedSlot) {
      const typedMins = parseTimeToMinutes(timeStr);
      if (typedMins !== null && eligibleTimeSlots.length > 0) {
        let floorSlot = eligibleTimeSlots[0];
        let maxStart = -1;
        for (const s of eligibleTimeSlots) {
          const sMins = parseTimeToMinutes(s.time);
          if (sMins !== null && sMins <= typedMins && sMins > maxStart) {
            maxStart = sMins;
            floorSlot = s;
          }
        }
        resolvedSlot = { ...floorSlot, customLabel: timeStr };
      } else if (eligibleTimeSlots.length > 0) {
        resolvedSlot = { ...eligibleTimeSlots[0], customLabel: timeStr };
      }
    }
    return resolvedSlot;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const selectedDays = Array.isArray(formData.day)
      ? formData.day.map(normalizeDay).filter(Boolean)
      : (formData.day ? [normalizeDay(formData.day)].filter(Boolean) : []);
    const daysToSchedule = [...new Set(selectedDays)];

    if (!formData.subject || !formData.section || !formData.professor || !formData.room || daysToSchedule.length === 0) {
      setValidation({
        valid: false,
        errors: ['Please fill in all required fields (Subject, Section, Faculty, Room, and at least one Day).']
      });
      setLoading(false);
      return;
    }

    const subject = subjects.find(s => s.id === formData.subject);
    const getSubjectHours = (sub, comp) => sub?.hasLecLab 
      ? (comp === 'Lecture' ? ((Number(sub.lectureHours) || 2) / 2) : ((Number(sub.labHours) || 3) / 2)) 
      : (Number(sub?.hoursPerMeeting) || 1.5);
    const currentHours = getSubjectHours(subject, formData.component);
    const section = sections ? sections.find(s => s.id === formData.section) : null;
    const professor = professors.find(p => p.id === formData.professor);
    const room = rooms.find(r => r.id === formData.room);

    let allValid = true;
    let allWarnings = [];
    let allErrors = [];
    const resolvedSessions = [];

    for (const day of daysToSchedule) {
      const timeStr = typeof formData.timeSlot === 'object' && formData.timeSlot !== null
        ? (formData.timeSlot[day] || formData.timeSlot[normalizeDay(day)])
        : formData.timeSlot;
      
      if (!timeStr || !String(timeStr).trim()) {
        allValid = false;
        allErrors.push(`Please select a time slot for ${day}.`);
        continue;
      }

      const timeSlotObj = resolveTimeSlotForDay(day);

      if (!timeSlotObj) {
        allValid = false;
        allErrors.push(`Failed to resolve time slot "${timeStr}" for ${day}.`);
        continue;
      }

      if (isLunchSlot(timeSlotObj)) {
        allValid = false;
        allErrors.push(`Classes cannot be scheduled during lunch break (11:30 AM - 12:30 PM) on ${day}.`);
        continue;
      }

      const formSchedRange = getScheduleTimeRange({ timeSlot: timeSlotObj, hours: currentHours, subject, component: formData.component }, scheduleMode);
      if (formSchedRange && formSchedRange.start > 0 && formSchedRange.end > 0 && overlapsLunchBreak(formSchedRange.start, formSchedRange.end)) {
        allValid = false;
        allErrors.push(`Classes cannot be scheduled during lunch break (11:30 AM - 12:30 PM) on ${day}.`);
        continue;
      }

      const meetingTimeLabel = getMeetingTimeLabel(timeSlotObj, currentHours, scheduleMode);
      const enrichedTimeSlot = {
        ...timeSlotObj,
        customLabel: timeSlotObj.customLabel || meetingTimeLabel || timeSlotObj.label
      };

      const validationSubject = subject ? { 
        ...subject, 
        hoursPerMeeting: currentHours,
        credits: subject.hasLecLab 
          ? (formData.component === 'Lecture' ? (Number(subject.lectureHours) || 2) : (Number(subject.labHours) || 3))
          : (Number(subject.credits) || 3)
      } : subject;

      const result = validator.validateAssignment(room, professor, validationSubject, section, day, enrichedTimeSlot, scheduleMode, currentHours, formData.component);
      if (!result.valid) {
        allValid = false;
        allErrors.push(`Failed for ${day}: ${result.errors.join(', ')}`);
      } else if (result.warnings) {
        allWarnings.push(...result.warnings.map(w => `${day}: ${w}`));
      }

      resolvedSessions.push({ day, timeSlotObj: enrichedTimeSlot, originalLabel: timeStr });
    }

    if (allValid) {
      let hasAddError = false;
      const successfullyAdded = [];

      for (const sess of resolvedSessions) {
        const validationSubject = subject ? { 
          ...subject, 
          hoursPerMeeting: currentHours,
          credits: subject.hasLecLab 
            ? (formData.component === 'Lecture' ? (Number(subject.lectureHours) || 2) : (Number(subject.labHours) || 3))
            : (Number(subject.credits) || 3)
        } : subject;
        const scheduleResult = validator.addSchedule(room, professor, validationSubject, section, sess.day, sess.timeSlotObj, currentHours, formData.component);
        if (scheduleResult.schedule) {
          if (subject?.hasLecLab) {
            scheduleResult.schedule.component = formData.component;
          }
          scheduleResult.schedule.hours = currentHours;
          scheduleResult.schedule.timeSlot = sess.timeSlotObj;
        }
        const addResult = await onSchedule(scheduleResult.schedule);
        if (addResult && addResult.ok === false) {
          hasAddError = true;
          allErrors.push(`Failed to save for ${sess.day}: ${addResult.errors?.join(', ') || 'Unknown error'}`);
        } else {
          successfullyAdded.push({
            subject: `${subject?.code || ''} ${subject?.name ? `— ${subject.name}` : ''}`.trim() + (subject?.hasLecLab ? ` (${formData.component})` : ''),
            section: section?.name || '',
            professor: professor?.name || '',
            room: room?.name || '',
            day: sess.day,
            timeSlot: sess.timeSlotObj.customLabel || getMeetingTimeLabel(sess.timeSlotObj, currentHours, scheduleMode) || sess.timeSlotObj?.label || sess.originalLabel
          });
        }
      }

      if (hasAddError) {
        setValidation({ valid: false, errors: allErrors, warnings: allWarnings });
        if (onLogHistory) {
          onLogHistory({
            engineMode: 'manual',
            totalAttempted: daysToSchedule.length,
            successCount: successfullyAdded.length,
            errorCount: allErrors.length,
            createdSchedules: successfullyAdded,
            errors: allErrors.map((e) => ({
              subject: subject?.code || subject?.name || 'Subject',
              section: section?.name || 'Section',
              reason: e
            }))
          });
        }
      } else {
        setValidation({
          valid: true,
          warnings: allWarnings,
          room: formData.room,
          section: formData.section,
          professor: formData.professor
        });
        if (onLogHistory) {
          onLogHistory({
            engineMode: 'manual',
            totalAttempted: daysToSchedule.length,
            successCount: successfullyAdded.length,
            errorCount: 0,
            createdSchedules: successfullyAdded,
            errors: []
          });
        }
        setFormData({ subject: '', section: '', professor: '', room: '', day: [], timeSlot: {}, component: 'Lecture' });
        setTimeSlotSearch({});
        if (onSuccess) {
          onSuccess();
        }
      }
    } else {
      setValidation({ valid: false, errors: allErrors, warnings: allWarnings });
    }

    setLoading(false);
  };

  const checkConflict = (overrides) => {
    if (loading) return false;
    if (!selectedSubject || !activeSchedules) return false;

    const candidateBase = {
      subject: selectedSubject ? { ...selectedSubject, hoursPerMeeting: currentRenderHours } : null,
      section: selectedSection,
      professor: selectedProfessor,
      room: selectedRoom,
      day: formData.day,
      hours: currentRenderHours,
      component: formData.component,
      ...overrides
    };

    const daysToCheck = Array.isArray(candidateBase.day)
      ? candidateBase.day.map(normalizeDay).filter(Boolean)
      : (candidateBase.day ? [normalizeDay(candidateBase.day)] : []);

    if (daysToCheck.length === 0) return false;

    // Specific check for professor dropdown
    if (overrides?.professor) {
      for (const d of daysToCheck) {
        if (!d) continue;
        const timeSlot = resolveTimeSlotForDay(d);
        if (!timeSlot) continue;
        const candidate = {
          professor: overrides.professor,
          day: d,
          timeSlot: timeSlot,
          subject: candidateBase.subject,
          hours: currentRenderHours,
          component: formData.component
        };
        const conf = findScheduleConflicts(candidate, activeSchedules, { scheduleMode: 'standard' });
        if (conf.professor) return true;
      }
      return false;
    }

    // Specific check for room dropdown
    if (overrides?.room) {
      for (const d of daysToCheck) {
        if (!d) continue;
        const timeSlot = resolveTimeSlotForDay(d);
        if (!timeSlot) continue;
        const candidate = {
          room: overrides.room,
          day: d,
          timeSlot: timeSlot,
          subject: candidateBase.subject,
          hours: currentRenderHours,
          component: formData.component
        };
        const conf = findScheduleConflicts(candidate, activeSchedules, { scheduleMode: 'standard' });
        if (conf.room) return true;
      }
      return false;
    }

    // Specific check for day selector buttons
    if (overrides?.day) {
      if (!candidateBase.room?.id && !candidateBase.professor?.id && !candidateBase.section?.id) {
        return false;
      }
      const dayStr = normalizeDay(overrides.day);
      const timeSlot = resolveTimeSlotForDay(dayStr);
      if (!timeSlot) return false;
      const candidate = { ...candidateBase, day: dayStr, timeSlot, hours: currentRenderHours, component: formData.component };
      const conf = findScheduleConflicts(candidate, activeSchedules, { scheduleMode: 'standard' });
      return !!(conf.room || conf.professor || conf.section);
    }

    for (const d of daysToCheck) {
      if (!d) continue;
      const timeSlot = resolveTimeSlotForDay(d);
      if (!timeSlot) continue;
      const candidate = { ...candidateBase, day: d, timeSlot, hours: currentRenderHours, component: formData.component };
      const conflicts = findScheduleConflicts(candidate, activeSchedules, { scheduleMode: 'standard' });
      if (conflicts.room || conflicts.professor || conflicts.section) {
        return true;
      }
    }
    return false;
  };

  const getTimeSlotConflictTag = (slot, specificDay) => {
    if (loading) return null;
    if (!selectedSubject || !activeSchedules) return null;
    
    let daysToCheck = [];
    if (specificDay) {
       daysToCheck = [normalizeDay(specificDay)];
    } else {
       daysToCheck = Array.isArray(formData.day)
         ? formData.day.map(normalizeDay).filter(Boolean)
         : (formData.day ? [normalizeDay(formData.day)] : []);
    }

    if (daysToCheck.length === 0 || !slot) return null;
    if (!selectedRoom?.id && !selectedProfessor?.id && !selectedSection?.id) return null;

    for (const d of daysToCheck) {
      if (!d) continue;
      const candidate = {
        subject: selectedSubject ? { ...selectedSubject, hoursPerMeeting: currentRenderHours } : null,
        section: selectedSection,
        professor: selectedProfessor,
        room: selectedRoom,
        day: d,
        timeSlot: slot,
        hours: currentRenderHours,
        component: formData.component
      };
      const conf = findScheduleConflicts(candidate, activeSchedules, { scheduleMode: 'standard' });
      if (conf.room) return `Room Booked (${d.slice(0, 3)})`;
      if (conf.professor) return `Prof. Busy (${d.slice(0, 3)})`;
      if (conf.section) return `Section Busy (${d.slice(0, 3)})`;
    }
    return null;
  };

  const [appliedMessage, setAppliedMessage] = useState('');

  useEffect(() => {
    if (appliedMessage) {
      const timer = setTimeout(() => {
        setAppliedMessage('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [appliedMessage]);

  // Subtle Proactive Suggestion Chip (only computed when subject or section is selected)
  const bestSuggestion = (() => {
    if (!formData.subject && !formData.section && !formData.professor) return null;
    const recs = getSmartScheduleRecommendations({
      formData,
      subjects,
      sections,
      professors,
      rooms,
      activeSchedules,
      activeSemester,
      scheduleMode,
      limit: 1
    });
    return recs && recs.length > 0 ? recs[0] : null;
  })();

  const activeConflictData = (() => {
    if (loading) return null;
    if (!selectedSubject || !selectedSection || !selectedProfessor || !selectedRoom || !formData.day || (Array.isArray(formData.day) && formData.day.length === 0)) {
      return null;
    }
    const daysToCheck = (Array.isArray(formData.day) ? formData.day : [formData.day])
      .map(normalizeDay)
      .filter(Boolean);

    if (daysToCheck.length === 0) return null;

    let hasConflict = false;
    let combinedConflicts = { room: null, professor: null, section: null };
    let firstConflictingDay = null;
    let fallbackSlot = null;

    for (const d of daysToCheck) {
      const timeSlot = resolveTimeSlotForDay(d);
      if (!timeSlot) continue;

      const cand = {
        subject: selectedSubject ? { ...selectedSubject, hoursPerMeeting: currentRenderHours } : null,
        section: selectedSection,
        professor: selectedProfessor,
        room: selectedRoom,
        day: d,
        timeSlot: timeSlot,
        hours: currentRenderHours,
        component: formData.component
      };
      const conf = findScheduleConflicts(cand, activeSchedules, { scheduleMode });
      if (conf.room || conf.professor || conf.section) {
        hasConflict = true;
        if (!firstConflictingDay) {
          firstConflictingDay = d;
          fallbackSlot = timeSlot;
        }
        if (conf.room) combinedConflicts.room = conf.room;
        if (conf.professor) combinedConflicts.professor = conf.professor;
        if (conf.section) combinedConflicts.section = conf.section;
      }
    }

    if (hasConflict) {
      if (!fallbackSlot) {
        firstConflictingDay = daysToCheck.find(d => resolveTimeSlotForDay(d) !== null) || daysToCheck[0];
        fallbackSlot = resolveTimeSlotForDay(firstConflictingDay);
      }

      const alts = findAlternativeSlots({
        subject: selectedSubject ? { ...selectedSubject, hoursPerMeeting: currentRenderHours } : null,
        section: selectedSection,
        professor: selectedProfessor,
        room: selectedRoom,
        days: daysToCheck,
        day: daysToCheck,
        timeSlot: fallbackSlot,
        hours: currentRenderHours,
        component: formData.component
      }, activeSchedules, rooms, eligibleTimeSlots, scheduleMode);

      const dayLabel = daysToCheck.map(d => d.slice(0, 3)).join(' / ');
      return {
        day: dayLabel,
        days: daysToCheck,
        conflicts: combinedConflicts,
        alternatives: alts || []
      };
    }
    return null;
  })();

  const handleApplyAlternative = (alt) => {
    const daysToSet = alt.days
      ? alt.days.map(normalizeDay)
      : (alt.day ? (Array.isArray(alt.day) ? alt.day.map(normalizeDay) : [normalizeDay(alt.day)]) : []);
    const resolvedDays = daysToSet.length > 0
      ? daysToSet
      : (Array.isArray(formData.day) && formData.day.length > 0 ? formData.day.map(normalizeDay) : [normalizeDay(formData.day)]);
    
    const timeLabel = alt.timeSlot?.label || alt.timeSlot?.customLabel;

    setFormData(prev => {
      const newTimeSlot = typeof prev.timeSlot === 'object' && prev.timeSlot !== null ? { ...prev.timeSlot } : {};
      if (timeLabel) {
        resolvedDays.forEach(d => {
          newTimeSlot[d] = timeLabel;
        });
      }
      return {
        ...prev,
        room: alt.room?.id || prev.room,
        day: resolvedDays,
        timeSlot: timeLabel ? newTimeSlot : prev.timeSlot
      };
    });
    setTimeSlotSearch({});
    setAppliedMessage(`✓ Conflict resolved: ${alt.title}`);
    setOpenTimeSlotDay(null);
    setValidation(null);
  };

  const handleApplySuggestion = (rec) => {
    const daysToSet = rec.days
      ? rec.days.map(normalizeDay)
      : (Array.isArray(rec.day) ? rec.day.map(normalizeDay) : (rec.day ? [normalizeDay(rec.day)] : []));
    const resolvedDays = daysToSet.length > 0
      ? daysToSet
      : (Array.isArray(formData.day) && formData.day.length > 0 ? formData.day.map(normalizeDay) : ['Monday']);
    const dayDisplay = rec.dayLabel || resolvedDays.map(d => d.slice(0, 3)).join(' / ');
    const timeLabel = rec.timeSlot?.label || rec.timeSlot?.customLabel || '';
    const timeSlotMapping = {};
    resolvedDays.forEach(d => {
      timeSlotMapping[d] = timeLabel;
    });

    setFormData({
      subject: rec.subject?.id || '',
      section: rec.section?.id || '',
      professor: rec.professor?.id || '',
      room: rec.room?.id || '',
      day: resolvedDays,
      timeSlot: timeSlotMapping,
      component: rec.component || formData.component || 'Lecture'
    });
    setTimeSlotSearch({});
    setAppliedMessage(`✓ Auto-filled: ${dayDisplay} ${timeLabel} · ${rec.room?.name}`);
    setOpenTimeSlotDay(null);
    setValidation(null);
  };

  const selectedDays = Array.isArray(formData.day)
    ? formData.day.map(normalizeDay).filter(Boolean)
    : (formData.day ? [normalizeDay(formData.day)].filter(Boolean) : []);

  const hasAllTimeSlots = selectedDays.length > 0 && selectedDays.every(d => {
    const val = typeof formData.timeSlot === 'object' && formData.timeSlot !== null
      ? (formData.timeSlot[d] || formData.timeSlot[normalizeDay(d)])
      : formData.timeSlot;
    return Boolean(val && String(val).trim());
  });

  const isFormIncomplete = !formData.subject || !formData.section || !formData.professor || !formData.room || selectedDays.length === 0 || !hasAllTimeSlots;

  return (
    <div className="schedule-form-container">
      <h2>Create Schedule</h2>

      {/* Applied Confirmation Notice */}
      {appliedMessage && (
        <div className="ai-applied-feedback-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          <span>{appliedMessage}</span>
        </div>
      )}

      {/* Reactive AI Conflict Resolver Banner */}
      {!appliedMessage && activeConflictData && activeConflictData.alternatives.length > 0 && (
        <div className="ai-conflict-banner">
          <div className="ai-conflict-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            Conflict Detected on {activeConflictData.day} — Suggested Fixes:
          </div>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.82rem', color: '#9f1239' }}>
            {activeConflictData.conflicts.room && `Room "${selectedRoom?.name}" is already booked. `}
            {activeConflictData.conflicts.professor && `Prof. "${selectedProfessor?.name}" is teaching another class. `}
            {activeConflictData.conflicts.section && `Section "${selectedSection?.name}" is in another session. `}
          </p>

          <div className="ai-conflict-actions">
            {activeConflictData.alternatives.map((alt, i) => (
              <button
                key={i}
                type="button"
                className="ai-conflict-btn"
                onClick={() => handleApplyAlternative(alt)}
              >
                <span>✨ {alt.title}</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>({alt.description})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subtle, Clean Proactive Suggestion Chip (Only when fields are unfilled) */}
      {!appliedMessage && bestSuggestion && isFormIncomplete && !activeConflictData && (
        <div className="ai-inline-chip-bar">
          <span className="ai-inline-chip-text">
            💡 <strong>AI Suggestion:</strong> {bestSuggestion.dayLabel || (Array.isArray(bestSuggestion.day) ? bestSuggestion.day.map(d => d.slice(0, 3)).join(' / ') : bestSuggestion.day)} {bestSuggestion.timeSlot?.label} · {bestSuggestion.room?.name} · Prof. {bestSuggestion.professor?.name}
          </span>
          <button
            type="button"
            className="ai-inline-chip-btn"
            onClick={() => handleApplySuggestion(bestSuggestion)}
          >
            ⚡ Auto-Fill
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="schedule-form">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Subject *</label>
            <CustomSelect
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              placeholder="Select a subject..."
              required
              options={(() => {
                const sorted = [...eligibleSubjects].sort((a, b) => 
                  ((a.code || '').replace(/\s+/g, '').toUpperCase()).localeCompare(((b.code || '').replace(/\s+/g, '').toUpperCase()), undefined, { numeric: true, sensitivity: 'base' })
                );

                if (selectedSection) {
                  const enrolledIds = selectedSection.subjects || [];
                  const enrolled = [];
                  const others = [];

                  sorted.forEach(sub => {
                    const isEnrolled = enrolledIds.includes(sub.id) ||
                      (sub.code && enrolledIds.includes(sub.code)) ||
                      (sub.name && enrolledIds.includes(sub.name));
                    
                    if (isEnrolled) {
                      enrolled.push({
                        value: sub.id,
                        label: `${sub.code} - ${sub.name}`,
                        badge: '✨ Enrolled',
                        badgeColor: '#059669'
                      });
                    } else {
                      others.push({
                        value: sub.id,
                        label: `${sub.code} - ${sub.name}`
                      });
                    }
                  });

                  const groups = [];
                  if (enrolled.length > 0) {
                    groups.push({
                      label: `✨ Recommended for ${selectedSection.name}`,
                      options: enrolled
                    });
                  }
                  if (others.length > 0) {
                    groups.push({
                      label: 'Other Subjects',
                      options: others
                    });
                  }
                  return groups.length > 0 ? groups : sorted.map(s => ({ value: s.id, label: `${s.code} - ${s.name}` }));
                }

                if (selectedProfessor) {
                  const specs = selectedProfessor.specialization || [];
                  const specialized = [];
                  const others = [];

                  sorted.forEach(sub => {
                    const isSpec = specs.includes(sub.id) ||
                      (sub.code && specs.includes(sub.code)) ||
                      (sub.name && specs.includes(sub.name));
                    
                    if (isSpec) {
                      specialized.push({
                        value: sub.id,
                        label: `${sub.code} - ${sub.name}`,
                        badge: '✨ Specialized',
                        badgeColor: '#059669'
                      });
                    } else {
                      others.push({
                        value: sub.id,
                        label: `${sub.code} - ${sub.name}`
                      });
                    }
                  });

                  const groups = [];
                  if (specialized.length > 0) {
                    groups.push({
                      label: `✨ Specialization of Prof. ${selectedProfessor.name}`,
                      options: specialized
                    });
                  }
                  if (others.length > 0) {
                    groups.push({
                      label: 'Other Subjects',
                      options: others
                    });
                  }
                  return groups.length > 0 ? groups : sorted.map(s => ({ value: s.id, label: `${s.code} - ${s.name}` }));
                }

                return sorted.map(subject => ({ value: subject.id, label: `${subject.code} - ${subject.name}` }));
              })()}
            />
            {selectedSubject?.hasLecLab && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="component" 
                    value="Lecture" 
                    checked={formData.component === 'Lecture'} 
                    onChange={handleChange}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  Lecture ({selectedSubject.lectureHours || 2} hrs · 2 meetings of 1 hr)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="component" 
                    value="Laboratory" 
                    checked={formData.component === 'Laboratory'} 
                    onChange={handleChange}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  Laboratory ({selectedSubject.labHours || 3} hrs · 2 meetings of 1.5 hrs)
                </label>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Section *</label>
            <CustomSelect
              name="section"
              value={formData.section}
              onChange={handleChange}
              placeholder="Select a section..."
              required
              options={(() => {
                const sorted = eligibleSections ? [...eligibleSections].sort((a, b) => (a.name || '').localeCompare(b.name || '')) : [];

                if (selectedSubject) {
                  const matching = [];
                  const others = [];

                  sorted.forEach(sec => {
                    const secSubjects = sec.subjects || [];
                    const isEnrolled = secSubjects.includes(selectedSubject.id) ||
                      (selectedSubject.code && secSubjects.includes(selectedSubject.code)) ||
                      (selectedSubject.name && secSubjects.includes(selectedSubject.name));
                    
                    if (isEnrolled) {
                      matching.push({
                        value: sec.id,
                        label: `${sec.name}${sec.program ? ` (${sec.program})` : ''}`,
                        badge: '✨ Enrolled',
                        badgeColor: '#059669'
                      });
                    } else {
                      others.push({
                        value: sec.id,
                        label: `${sec.name}${sec.program ? ` (${sec.program})` : ''}`
                      });
                    }
                  });

                  const groups = [];
                  if (matching.length > 0) {
                    groups.push({
                      label: `✨ Recommended for ${selectedSubject.code}`,
                      options: matching
                    });
                  }
                  if (others.length > 0) {
                    groups.push({
                      label: 'Other Sections',
                      options: others
                    });
                  }
                  return groups.length > 0 ? groups : sorted.map(s => ({ value: s.id, label: s.name }));
                }

                if (selectedProfessor) {
                  const assigned = [];
                  const others = [];

                  sorted.forEach(sec => {
                    const isAssigned = (selectedProfessor.assignedSections || []).includes(sec.id) ||
                      (sec.name && (selectedProfessor.assignedSections || []).includes(sec.name));
                    
                    if (isAssigned) {
                      assigned.push({
                        value: sec.id,
                        label: `${sec.name}${sec.program ? ` (${sec.program})` : ''}`,
                        badge: '✨ Assigned',
                        badgeColor: '#059669'
                      });
                    } else {
                      others.push({
                        value: sec.id,
                        label: `${sec.name}${sec.program ? ` (${sec.program})` : ''}`
                      });
                    }
                  });

                  const groups = [];
                  if (assigned.length > 0) {
                    groups.push({
                      label: `✨ Assigned Sections of Prof. ${selectedProfessor.name}`,
                      options: assigned
                    });
                  }
                  if (others.length > 0) {
                    groups.push({
                      label: 'Other Sections',
                      options: others
                    });
                  }
                  return groups.length > 0 ? groups : sorted.map(s => ({ value: s.id, label: s.name }));
                }

                return sorted.map(sec => ({
                  value: sec.id,
                  label: `${sec.name}${sec.program ? ` (${sec.program})` : ''}`
                }));
              })()}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Professor *</label>
            <CustomSelect
              name="professor"
              value={formData.professor}
              onChange={handleChange}
              placeholder="Select a professor..."
              required
              options={(() => {
                const sorted = [...eligibleProfessors].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                if (selectedSubject) {
                  const specialized = [];
                  const others = [];

                  sorted.forEach(professor => {
                    const isConflict = checkConflict({ professor });
                    const isSpec = professorMatchesSubject(professor, selectedSubject);

                    if (isSpec) {
                      specialized.push({
                        value: professor.id,
                        label: `${professor.name}${professor.department ? ` (${professor.department})` : ''}`,
                        badge: isConflict ? '(Occupied)' : '✨ Specialized',
                        badgeColor: isConflict ? '#ef4444' : '#059669'
                      });
                    } else {
                      others.push({
                        value: professor.id,
                        label: `${professor.name}${professor.department ? ` (${professor.department})` : ''}`,
                        badge: isConflict ? '(Occupied)' : null,
                        badgeColor: isConflict ? '#ef4444' : null
                      });
                    }
                  });

                  const groups = [];
                  if (specialized.length > 0) {
                    groups.push({
                      label: `✨ Recommended for ${selectedSubject.code}`,
                      options: specialized
                    });
                  }
                  if (others.length > 0) {
                    groups.push({
                      label: 'Other Faculty',
                      options: others
                    });
                  }
                  return groups.length > 0 ? groups : sorted.map(p => ({ value: p.id, label: p.name }));
                }

                if (selectedSection) {
                  const sectionFaculty = [];
                  const others = [];

                  sorted.forEach(professor => {
                    const isConflict = checkConflict({ professor });
                    const isAdviser = selectedSection.adviser === professor.id || selectedSection.adviser === professor.name;
                    const isAssigned = (professor.assignedSections || []).includes(selectedSection.id) ||
                      (selectedSection.name && (professor.assignedSections || []).includes(selectedSection.name));
                    
                    if (isAdviser || isAssigned) {
                      sectionFaculty.push({
                        value: professor.id,
                        label: `${professor.name}${professor.department ? ` (${professor.department})` : ''}`,
                        badge: isConflict ? '(Occupied)' : isAdviser ? '✨ Adviser' : '✨ Assigned',
                        badgeColor: isConflict ? '#ef4444' : '#059669'
                      });
                    } else {
                      others.push({
                        value: professor.id,
                        label: `${professor.name}${professor.department ? ` (${professor.department})` : ''}`,
                        badge: isConflict ? '(Occupied)' : null,
                        badgeColor: isConflict ? '#ef4444' : null
                      });
                    }
                  });

                  const groups = [];
                  if (sectionFaculty.length > 0) {
                    groups.push({
                      label: `✨ Recommended Faculty for ${selectedSection.name}`,
                      options: sectionFaculty
                    });
                  }
                  if (others.length > 0) {
                    groups.push({
                      label: 'Other Faculty',
                      options: others
                    });
                  }
                  return groups.length > 0 ? groups : sorted.map(p => ({ value: p.id, label: p.name }));
                }

                return sorted.map(professor => {
                  const isConflict = checkConflict({ professor });
                  return {
                    value: professor.id,
                    label: `${professor.name}${professor.department ? ` (${professor.department})` : ''}`,
                    badge: isConflict ? '(Occupied)' : null,
                    badgeColor: isConflict ? '#ef4444' : null
                  };
                });
              })()}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Room *</label>
            <CustomSelect
              name="room"
              value={formData.room}
              onChange={handleChange}
              placeholder="Select a room..."
              required
              options={(() => {
                const buildingGroups = Object.entries(rooms.reduce((acc, r) => {
                  const b = r.building || 'Other';
                  if (!acc[b]) acc[b] = [];
                  acc[b].push(r);
                  return acc;
                }, {}))
                  .sort(([bA], [bB]) => bA.localeCompare(bB))
                  .map(([building, bRooms]) => ({
                    label: building,
                    options: bRooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).map(room => {
                      const isConflict = checkConflict({ room });
                      const isCompLabNeeded = selectedSubject?.requiredLab && (!selectedSubject.hasLecLab || formData.component !== 'Lecture');
                      const isFoodLabNeeded = selectedSubject?.isFoodLab && (!selectedSubject.hasLecLab || formData.component !== 'Lecture');
                      const isNonLabForCompSubject = isCompLabNeeded && !room.hasComputers;
                      const isNonFoodForFoodSubject = isFoodLabNeeded && !room.isFoodLab;
                      const isPolicyAllowed = !selectedSubject || isRoomAllowedFor(room, selectedSubject, selectedSection);
                      const isProfAllowed = !selectedProfessor || !selectedSubject || isProfessorAllowedInRoom(room, selectedProfessor, selectedSubject, selectedSection, rooms);
                      const isDisallowed = isNonLabForCompSubject || isNonFoodForFoodSubject || !isPolicyAllowed || !isProfAllowed;
                      
                      let badge = null;
                      if (isConflict) badge = '(In Use)';
                      else if (isNonLabForCompSubject) badge = '(Not a Comp Lab)';
                      else if (isNonFoodForFoodSubject) badge = '(Not a Food Lab)';
                      else if (!isPolicyAllowed || !isProfAllowed) badge = '(Restricted)';
                      
                      let roomLabel = room.name;
                      if (room.hasComputers) roomLabel += ' (Comp Lab)';
                      if (room.isFoodLab) roomLabel += ' (Food Lab)';

                      return {
                        value: room.id,
                        label: roomLabel,
                        badge,
                        disabled: isDisallowed
                      };
                    })
                  }));
                  
                let finalOptions = [];
                const isCompLabNeeded = selectedSubject?.requiredLab && (!selectedSubject.hasLecLab || formData.component !== 'Lecture');
                const isFoodLabNeeded = selectedSubject?.isFoodLab && (!selectedSubject.hasLecLab || formData.component !== 'Lecture');
                if (selectedSubject && (isCompLabNeeded || isFoodLabNeeded)) {
                  const suggestedRooms = rooms.filter(r => {
                    if (isCompLabNeeded && !r.hasComputers) return false;
                    if (isFoodLabNeeded && !r.isFoodLab) return false;
                    if (!isRoomAllowedFor(r, selectedSubject, selectedSection)) return false;
                    if (selectedProfessor && !isProfessorAllowedInRoom(r, selectedProfessor, selectedSubject, selectedSection, rooms)) return false;
                    return !checkConflict({ room: r });
                  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

                  if (suggestedRooms.length > 0) {
                    finalOptions.push({
                      label: '✨ Suggested Labs',
                      options: suggestedRooms.map(room => {
                         let roomLabel = room.name;
                         if (room.hasComputers) roomLabel += ' (Comp Lab)';
                         if (room.isFoodLab) roomLabel += ' (Food Lab)';
                         return {
                           value: room.id,
                           label: roomLabel,
                           badge: '✨ Recommended'
                         };
                      })
                    });
                  }
                }
                
                return finalOptions.concat(buildingGroups);
              })()}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Day *</label>
            <div className="day-selector">
              {(scheduleMode === 'fourDay' ? FOUR_DAY_DAYS : DAYS).map(day => {
                const shortDay = day.substring(0, 3);
                const activeDays = Array.isArray(formData.day)
                  ? formData.day.map(normalizeDay)
                  : (formData.day ? [normalizeDay(formData.day)] : []);
                const isActive = activeDays.includes(day);
                const isConflict = isActive && checkConflict({ day });
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setFormData(prev => {
                        const prevDays = Array.isArray(prev.day)
                          ? prev.day.map(normalizeDay)
                          : (prev.day ? [normalizeDay(prev.day)] : []);
                        let newDays;
                        if (prevDays.includes(day)) {
                          newDays = prevDays.filter(d => d !== day);
                        } else if (prevDays.length === 0 && (selectedSubject?.hasLecLab || (Number(selectedSubject?.credits || 3) > Number(selectedSubject?.hoursPerMeeting || 1.5)))) {
                          newDays = resolveToDayPair(day, scheduleMode);
                        } else {
                          newDays = [...prevDays, day];
                        }
                        return { ...prev, day: newDays };
                      });
                      setValidation(null);
                    }}
                    className={`day-btn ${isActive ? 'active' : ''} ${isConflict ? 'has-conflict' : ''}`}
                    title={isConflict ? 'Occupied schedule on this day' : ''}
                  >
                    {shortDay}
                  </button>
                );
              })}
            </div>
            {/* Hidden input to store day string */}
            <input type="hidden" name="day" value={Array.isArray(formData.day) ? formData.day.join(',') : (formData.day || '')} />
          </div>
            
          {/* Time Slot Dropdowns per selected day */}
          {selectedDays.map(dayStr => {
              const isDropdownOpen = openTimeSlotDay === dayStr;
              const timeValue = (typeof formData.timeSlot === 'object' && formData.timeSlot !== null
                ? (formData.timeSlot[dayStr] || formData.timeSlot[normalizeDay(dayStr)])
                : formData.timeSlot) || '';
              const searchQuery = timeSlotSearch[dayStr] !== undefined ? timeSlotSearch[dayStr] : null;
              const displayValue = searchQuery !== null ? searchQuery : timeValue;
              const filterQuery = (searchQuery !== null ? searchQuery : '').trim().toLowerCase();

              return (
              <div key={dayStr} className="form-group" style={{ position: 'relative' }} ref={isDropdownOpen ? dropdownRef : null}>
                <label>{dayStr} Time Slot</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-select"
                    value={displayValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTimeSlotSearch(prev => ({ ...prev, [dayStr]: val }));
                      setFormData(prev => ({
                        ...prev,
                        timeSlot: { ...prev.timeSlot, [dayStr]: val }
                      }));
                      setOpenTimeSlotDay(dayStr);
                      setValidation(null);
                    }}
                    onFocus={() => {
                      setOpenTimeSlotDay(dayStr);
                      setTimeSlotSearch(prev => ({ ...prev, [dayStr]: '' }));
                    }}
                    placeholder="Select or type a time..."
                    style={{ paddingRight: timeValue ? '56px' : '30px', width: '100%' }}
                    autoComplete="off"
                  />
                  {timeValue && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormData(prev => ({
                          ...prev,
                          timeSlot: { ...prev.timeSlot, [dayStr]: '' }
                        }));
                        setTimeSlotSearch(prev => ({ ...prev, [dayStr]: '' }));
                        setValidation(null);
                      }}
                      style={{
                        position: 'absolute',
                        right: '28px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px'
                      }}
                      title="Clear time slot"
                    >
                      ✕
                    </button>
                  )}
                  <div
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--text-muted)' }}
                    onClick={() => {
                      if (isDropdownOpen) {
                        setOpenTimeSlotDay(null);
                        setTimeSlotSearch({});
                      } else {
                        setOpenTimeSlotDay(dayStr);
                        setTimeSlotSearch(prev => ({ ...prev, [dayStr]: '' }));
                      }
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                </div>

                {isDropdownOpen && (
                  <div className="custom-dropdown-menu" style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    maxHeight: '220px',
                    overflowY: 'auto',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    zIndex: 1000,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {eligibleTimeSlots.map(slot => {
                      const rangeLabel = selectedSubject
                        ? getMeetingTimeLabel(slot, currentRenderHours, scheduleMode)
                        : slot.label;

                      if (filterQuery && !rangeLabel.toLowerCase().includes(filterQuery)) {
                        return null;
                      }

                      const isSelected = timeValue === rangeLabel;
                      const conflictTag = getTimeSlotConflictTag(slot, dayStr);

                      return (
                        <div
                          key={slot.id}
                          onClick={() => {
                            setFormData(prev => {
                              const newTimeSlot = { ...prev.timeSlot, [dayStr]: isSelected ? '' : rangeLabel };
                              if (!isSelected && Array.isArray(prev.day) && prev.day.length > 1) {
                                prev.day.forEach(d => {
                                  if (!newTimeSlot[d]) newTimeSlot[d] = rangeLabel;
                                });
                              }
                              return {
                                ...prev,
                                timeSlot: newTimeSlot
                              };
                            });
                            setTimeSlotSearch(prev => {
                              const next = { ...prev };
                              delete next[dayStr];
                              return next;
                            });
                            setOpenTimeSlotDay(null);
                            setValidation(null);
                          }}
                          style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border-color)',
                            color: conflictTag ? '#dc2626' : 'var(--text-main)',
                            backgroundColor: isSelected ? 'var(--accent-primary-light, rgba(99,102,241,0.1))' : 'transparent',
                            fontWeight: isSelected ? '600' : '400',
                            fontSize: '0.9rem',
                            transition: 'background-color 0.15s ease',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--table-header)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isSelected ? 'var(--accent-primary-light, rgba(99,102,241,0.1))' : 'transparent'; }}
                        >
                          <span>{rangeLabel}</span>
                          {conflictTag && (
                            <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
                              {conflictTag}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {filterQuery && !eligibleTimeSlots.some(slot => {
                      const rangeLabel = selectedSubject ? getMeetingTimeLabel(slot, currentRenderHours, scheduleMode) : slot.label;
                      return rangeLabel.toLowerCase() === filterQuery;
                    }) && (
                        <div
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              timeSlot: { ...prev.timeSlot, [dayStr]: filterQuery }
                            }));
                            setTimeSlotSearch(prev => {
                              const next = { ...prev };
                              delete next[dayStr];
                              return next;
                            });
                            setOpenTimeSlotDay(null);
                            setValidation(null);
                          }}
                          style={{
                            padding: '12px',
                            cursor: 'pointer',
                            color: 'var(--accent-primary)',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            backgroundColor: 'var(--bg-main)'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--table-header)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
                        >
                          Use custom time "{filterQuery}"
                        </div>
                      )}
                  </div>
                )}
              </div>
              );
            })}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button type="submit" disabled={loading} className="submit-btn" style={{ flex: 1 }}>
            {loading ? 'Scheduling...' : 'Add to Schedule'}
          </button>
          <button
            type="button"
            disabled={loading || (!formData.subject && !formData.section && !formData.professor && !formData.room && selectedDays.length === 0)}
            onClick={() => {
              setFormData({ subject: '', section: '', professor: '', room: '', day: [], timeSlot: {}, component: 'Lecture' });
              setTimeSlotSearch({});
              setValidation(null);
              setOpenTimeSlotDay(null);
            }}
            className="btn btn-outline"
            style={{
              padding: '13px 20px',
              borderRadius: '12px',
              border: '1.5px solid var(--border-color)',
              background: 'var(--bg-main)',
              color: 'var(--text-muted)',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
        </div>
      </form>

      {selectedSubject && (selectedSubject.requiredLab && (!selectedSubject.hasLecLab || formData.component !== 'Lecture')) && (
        <div className="info-box">
          ⚠️ This subject requires a computer laboratory.
        </div>
      )}

      {selectedSubject && (selectedSubject.isFoodLab && (!selectedSubject.hasLecLab || formData.component !== 'Lecture')) && (
        <div className="info-box">
          ⚠️ This subject requires a food laboratory.
        </div>
      )}

      {selectedSubject && eligibleSections.length === 0 && (
        <div className="info-box">
          ℹ️ No sections are currently enrolled in this subject. You can assign this subject to a section in Section Management or Assignment Hub.
        </div>
      )}

      {selectedSubject && eligibleProfessors.length === 0 && (
        <div className="info-box danger">
          No faculty is authorized for this subject{selectedSection ? ` in section ${selectedSection.name}` : ''}. Assign a specialization in Faculty Management.
        </div>
      )}

      {validation && (
        <div
          className={`validation-box ${validation.valid ? 'success' : 'error'}`}
          style={validation.valid ? { cursor: 'pointer', transition: 'background-color 0.2s ease' } : {}}
          onClick={validation.valid ? () => {
            const room = validation.room;
            setValidation(null);
            navigate('/dashboard/view-schedules', { state: { viewTarget: { viewType: 'room', selectedId: room } } });
          } : undefined}
          onMouseEnter={validation.valid ? (e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' : undefined}
          onMouseLeave={validation.valid ? (e) => e.currentTarget.style.backgroundColor = '' : undefined}
        >
          {validation.valid ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0 }}>✓ Schedule added successfully! <span style={{ textDecoration: 'underline', fontSize: '0.85em', marginLeft: '8px' }}>Click to view</span></p>
              </div>
              {validation.warnings && validation.warnings.length > 0 && (
                <ul style={{ marginTop: '8px' }}>
                  {validation.warnings.map((w, i) => (
                    <li key={i}>⚠️ {w}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p>✗ Schedule could not be added:</p>
              <ul>
                {validation.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ScheduleForm;
