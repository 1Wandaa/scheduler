import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import {
  getEligibleProfessors,
  professorMatchesSubject,
  slotsNeededFromIndex,
  getMeetingTimeLabel,
  findScheduleConflicts,
  findAlternativeSlots,
  getSmartScheduleRecommendations,
  normalizeDay,
  resolveToDayPair
} from '../../utils/scheduleUtils';
import CustomSelect from '../CustomSelect/CustomSelect';
import '../../styles/SchedulerForm.css';

function ScheduleForm({ rooms, professors, subjects, sections, onSchedule, validator, activeSemester, activeSchedules = [] }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    subject: '',
    section: '',
    professor: '',
    room: '',
    day: [],
    timeSlot: ''
  });

  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isTimeSlotOpen, setIsTimeSlotOpen] = useState(false);
  const dropdownRef = useRef(null);

  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return null;
    let [_, hours, mins, period] = match;
    hours = parseInt(hours, 10);
    mins = parseInt(mins, 10);
    if (period) {
      if (period.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
    } else {
      if (hours >= 1 && hours <= 6) hours += 12; // Assume 1-6 is PM
    }
    return hours * 60 + mins;
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsTimeSlotOpen(false);
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
        if (!value) {
          newData.room = '';
        } else {
          // If professor was selected, verify they can teach the newly selected subject
          if (newData.professor) {
            const prof = professors.find(p => p.id === newData.professor);
            const sub = subjects.find(s => s.id === value);
            if (prof && sub && !professorMatchesSubject(prof, sub)) {
              newData.professor = '';
            }
          }
          // If section was selected, verify it is enrolled in the newly selected subject
          if (newData.section) {
            const sec = sections ? sections.find(s => s.id === newData.section) : null;
            const sub = subjects.find(s => s.id === value);
            if (sec && sub) {
              const secSubs = sec.subjects || [];
              const enrolled = secSubs.includes(sub.id) ||
                (sub.code && secSubs.includes(sub.code)) ||
                (sub.name && secSubs.includes(sub.name));
              if (!enrolled) {
                newData.section = '';
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
                const isAssigned = prof.assignedSections.includes(sec.id) ||
                  (sec.name && prof.assignedSections.includes(sec.name));
                if (!isAssigned) {
                  newData.section = '';
                }
              }
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
              const enrolled = secSubs.includes(sub.id) ||
                (sub.code && secSubs.includes(sub.code)) ||
                (sub.name && secSubs.includes(sub.name));
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
                const isAssigned = prof.assignedSections.includes(sec.id) ||
                  (sec.name && prof.assignedSections.includes(sec.name));
                if (!isAssigned) {
                  newData.professor = '';
                }
              }
            }
          }
        }
      }

      return newData;
    });
    setValidation(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.subject || !formData.section || !formData.professor || !formData.room ||
      !formData.day || formData.day.length === 0 || !formData.timeSlot) {
      setValidation({
        valid: false,
        errors: ['Please fill in all fields']
      });
      setLoading(false);
      return;
    }

    const subject = subjects.find(s => s.id === formData.subject);
    const section = sections ? sections.find(s => s.id === formData.section) : null;
    const professor = professors.find(p => p.id === formData.professor);
    const room = rooms.find(r => r.id === formData.room);

    // Determine if timeslot is standard or custom
    let timeSlot = null;
    if (formData.timeSlot) {
      const eligibleSlots = subject
        ? TIME_SLOTS.filter((slot, idx) => slotsNeededFromIndex(idx, subject.hoursPerMeeting) > 0)
        : TIME_SLOTS;

      const cleanTimeStr = (str) => String(str || '').replace(/\s+/g, '').toUpperCase();
      const targetStr = cleanTimeStr(formData.timeSlot);

      timeSlot = eligibleSlots.find(t =>
        cleanTimeStr(getMeetingTimeLabel(t, subject?.hoursPerMeeting)) === targetStr ||
        cleanTimeStr(t.label) === targetStr ||
        cleanTimeStr(t.time) === targetStr
      );
      if (!timeSlot) timeSlot = TIME_SLOTS.find(t => String(t.id) === String(formData.timeSlot));

      if (!timeSlot) {
        const typedMins = parseTimeToMinutes(formData.timeSlot);
        if (typedMins !== null && eligibleSlots.length > 0) {
          let floorSlot = eligibleSlots[0];
          let maxStart = -1;
          for (const s of eligibleSlots) {
            const sMins = parseTimeToMinutes(s.time);
            if (sMins !== null && sMins <= typedMins && sMins > maxStart) {
              maxStart = sMins;
              floorSlot = s;
            }
          }
          timeSlot = { ...floorSlot, customLabel: formData.timeSlot };
        } else if (eligibleSlots.length > 0) {
          timeSlot = { ...eligibleSlots[0], customLabel: formData.timeSlot };
        }
      }
    }

    let allValid = true;
    let allWarnings = [];
    let allErrors = [];

    const daysToSchedule = Array.isArray(formData.day)
      ? formData.day.map(normalizeDay)
      : [normalizeDay(formData.day)];

    // Validate all selected days first
    for (const day of daysToSchedule) {
      const result = validator.validateAssignment(room, professor, subject, section, day, timeSlot);
      if (!result.valid) {
        allValid = false;
        allErrors.push(`Failed for ${day}: ${result.errors.join(', ')}`);
      } else if (result.warnings) {
        allWarnings.push(...result.warnings.map(w => `${day}: ${w}`));
      }
    }

    if (allValid) {
      let hasAddError = false;
      for (const day of daysToSchedule) {
        const scheduleResult = validator.addSchedule(room, professor, subject, section, day, timeSlot);
        const addResult = await onSchedule(scheduleResult.schedule);
        if (addResult && addResult.ok === false) {
          hasAddError = true;
          allErrors.push(`Failed to save for ${day}: ${addResult.errors?.join(', ') || 'Unknown error'}`);
        }
      }

      if (hasAddError) {
        setValidation({ valid: false, errors: allErrors, warnings: allWarnings });
      } else {
        setValidation({
          valid: true,
          warnings: allWarnings,
          room: formData.room,
          section: formData.section,
          professor: formData.professor
        });
        setFormData({ subject: '', section: '', professor: '', room: '', day: [], timeSlot: '' });
      }
    } else {
      setValidation({ valid: false, errors: allErrors, warnings: allWarnings });
    }

    setLoading(false);
  };

  const selectedSubject = subjects.find(s => s.id === formData.subject);
  const selectedSection = sections ? sections.find(s => s.id === formData.section) : null;
  const selectedProfessor = professors.find(p => p.id === formData.professor);
  const selectedRoom = rooms.find(r => r.id === formData.room);

  // Active semester subjects base
  const activeSemesterSubjects = subjects.filter(s => !s.semester || s.semester === 'Both' || s.semester === activeSemester);

  // Eligible Subjects: filtered by active semester, selected professor's subjects, and selected section's subjects
  const eligibleSubjects = activeSemesterSubjects.filter(sub => {
    if (selectedProfessor && !professorMatchesSubject(selectedProfessor, sub)) {
      return false;
    }
    if (selectedSection) {
      const secSubjects = selectedSection.subjects || [];
      const isEnrolled = secSubjects.includes(sub.id) ||
        (sub.code && secSubjects.includes(sub.code)) ||
        (sub.name && secSubjects.includes(sub.name));
      if (!isEnrolled) return false;
    }
    return true;
  });

  // Eligible Sections: filtered by selected subject and selected professor
  const eligibleSections = sections ? sections.filter(sec => {
    const secSubjects = sec.subjects || [];

    if (selectedSubject) {
      const isEnrolled = secSubjects.includes(selectedSubject.id) ||
        (selectedSubject.code && secSubjects.includes(selectedSubject.code)) ||
        (selectedSubject.name && secSubjects.includes(selectedSubject.name));
      if (!isEnrolled) return false;
    }

    if (selectedProfessor) {
      if (selectedProfessor.assignedSections && selectedProfessor.assignedSections.length > 0) {
        const isAssigned = selectedProfessor.assignedSections.includes(sec.id) ||
          (sec.name && selectedProfessor.assignedSections.includes(sec.name));
        if (!isAssigned) return false;
      } else if (!selectedSubject) {
        const profSubjects = activeSemesterSubjects.filter(sub => professorMatchesSubject(selectedProfessor, sub));
        const takesAnyProfSubject = profSubjects.some(sub =>
          secSubjects.includes(sub.id) ||
          (sub.code && secSubjects.includes(sub.code)) ||
          (sub.name && secSubjects.includes(sub.name))
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
          secSubjects.includes(sub.id) ||
          (sub.code && secSubjects.includes(sub.code)) ||
          (sub.name && secSubjects.includes(sub.name))
        );
        if (!matchesSecSubject) return false;

        if (p.assignedSections && p.assignedSections.length > 0) {
          return p.assignedSections.includes(selectedSection.id) ||
            (selectedSection.name && p.assignedSections.includes(selectedSection.name));
        }
        return true;
      })
      : professors;

  const eligibleTimeSlots = selectedSubject
    ? TIME_SLOTS.filter((slot, idx) => slotsNeededFromIndex(idx, selectedSubject.hoursPerMeeting) > 0)
    : TIME_SLOTS;

  let selectedTimeSlot = null;
  if (formData.timeSlot) {
    const cleanTimeStr = (str) => String(str || '').replace(/\s+/g, '').toUpperCase();
    const targetStr = cleanTimeStr(formData.timeSlot);

    selectedTimeSlot = eligibleTimeSlots.find(t =>
      cleanTimeStr(getMeetingTimeLabel(t, selectedSubject?.hoursPerMeeting)) === targetStr ||
      cleanTimeStr(t.label) === targetStr ||
      cleanTimeStr(t.time) === targetStr
    );
    if (!selectedTimeSlot) selectedTimeSlot = TIME_SLOTS.find(t => String(t.id) === String(formData.timeSlot));

    if (!selectedTimeSlot) {
      const typedMins = parseTimeToMinutes(formData.timeSlot);
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
        selectedTimeSlot = { ...floorSlot, customLabel: formData.timeSlot };
      } else if (eligibleTimeSlots.length > 0) {
        selectedTimeSlot = { ...eligibleTimeSlots[0], customLabel: formData.timeSlot };
      }
    }
  }

  const checkConflict = (overrides) => {
    if (!selectedSubject || !activeSchedules) return false;

    const candidateBase = {
      subject: selectedSubject,
      section: selectedSection,
      professor: selectedProfessor,
      room: selectedRoom,
      day: formData.day,
      timeSlot: selectedTimeSlot,
      ...overrides
    };

    const daysToCheck = Array.isArray(candidateBase.day)
      ? candidateBase.day.map(normalizeDay).filter(Boolean)
      : (candidateBase.day ? [normalizeDay(candidateBase.day)] : []);

    if (daysToCheck.length === 0 || !candidateBase.timeSlot) return false;
    if (!candidateBase.room?.id && !candidateBase.professor?.id && !candidateBase.section?.id) {
      return false;
    }

    for (const d of daysToCheck) {
      if (!d) continue;
      const candidate = { ...candidateBase, day: d };
      const conflicts = findScheduleConflicts(candidate, activeSchedules);
      if (conflicts.room || conflicts.professor || conflicts.section) {
        return true;
      }
    }
    return false;
  };

  const getTimeSlotConflictTag = (slot) => {
    if (!selectedSubject || !activeSchedules) return null;
    const daysToCheck = Array.isArray(formData.day)
      ? formData.day.map(normalizeDay).filter(Boolean)
      : (formData.day ? [normalizeDay(formData.day)] : []);

    if (daysToCheck.length === 0 || !slot) return null;
    if (!selectedRoom?.id && !selectedProfessor?.id && !selectedSection?.id) return null;

    for (const d of daysToCheck) {
      if (!d) continue;
      const candidate = {
        subject: selectedSubject,
        section: selectedSection,
        professor: selectedProfessor,
        room: selectedRoom,
        day: d,
        timeSlot: slot
      };
      const conf = findScheduleConflicts(candidate, activeSchedules);
      if (conf.room) return `Room Booked (${d.slice(0, 3)})`;
      if (conf.professor) return `Prof. Busy (${d.slice(0, 3)})`;
      if (conf.section) return `Section Busy (${d.slice(0, 3)})`;
    }
    return null;
  };

  const isApplyingRef = useRef(false);
  const [appliedMessage, setAppliedMessage] = useState('');

  useEffect(() => {
    if (appliedMessage) {
      const timer = setTimeout(() => {
        setAppliedMessage('');
        isApplyingRef.current = false;
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [appliedMessage]);

  // Subtle Proactive Suggestion Chip (only computed when subject or section is selected)
  const bestSuggestion = useMemo(() => {
    if (!formData.subject && !formData.section && !formData.professor) return null;
    const recs = getSmartScheduleRecommendations({
      formData,
      subjects,
      sections,
      professors,
      rooms,
      activeSchedules,
      activeSemester,
      scheduleMode: 'standard',
      limit: 1
    });
    return recs && recs.length > 0 ? recs[0] : null;
  }, [formData, subjects, sections, professors, rooms, activeSchedules, activeSemester]);

  // Reactive Conflict Resolver: Computes instant alternatives when collision is detected
  const activeConflictData = useMemo(() => {
    if (isApplyingRef.current) return null;
    if (!selectedSubject || !selectedRoom || !selectedProfessor || !selectedTimeSlot || !formData.day || (Array.isArray(formData.day) && formData.day.length === 0)) {
      return null;
    }
    const candidateDays = resolveToDayPair(formData.day, 'standard');
    let hasConflict = false;
    let combinedConflicts = { room: null, professor: null, section: null };

    for (const d of candidateDays) {
      const cand = {
        subject: selectedSubject,
        section: selectedSection,
        professor: selectedProfessor,
        room: selectedRoom,
        day: d,
        timeSlot: selectedTimeSlot
      };
      const conf = findScheduleConflicts(cand, activeSchedules);
      if (conf.room || conf.professor || conf.section) {
        hasConflict = true;
        if (conf.room) combinedConflicts.room = conf.room;
        if (conf.professor) combinedConflicts.professor = conf.professor;
        if (conf.section) combinedConflicts.section = conf.section;
      }
    }

    if (hasConflict) {
      const alts = findAlternativeSlots({
        subject: selectedSubject,
        section: selectedSection,
        professor: selectedProfessor,
        room: selectedRoom,
        days: candidateDays,
        timeSlot: selectedTimeSlot
      }, activeSchedules, rooms, eligibleTimeSlots, 'standard');

      const dayLabel = candidateDays.map(d => d.slice(0, 3)).join(' / ');
      return {
        day: dayLabel,
        days: candidateDays,
        conflicts: combinedConflicts,
        alternatives: alts || []
      };
    }
    return null;
  }, [selectedSubject, selectedSection, selectedProfessor, selectedRoom, selectedTimeSlot, formData.day, activeSchedules, rooms, eligibleTimeSlots]);

  const handleApplyAlternative = (alt) => {
    isApplyingRef.current = true;
    const daysToSet = alt.days
      ? alt.days.map(normalizeDay)
      : (alt.day ? (Array.isArray(alt.day) ? alt.day.map(normalizeDay) : [normalizeDay(alt.day)]) : []);
    const resolvedDays = daysToSet.length > 0 ? daysToSet : resolveToDayPair(formData.day, 'standard');
    setFormData(prev => ({
      ...prev,
      room: alt.room?.id || prev.room,
      day: resolvedDays,
      timeSlot: alt.timeSlot?.label || alt.timeSlot?.customLabel || prev.timeSlot
    }));
    setAppliedMessage(`✓ Conflict resolved: ${alt.title}`);
    setValidation(null);
  };

  const handleApplySuggestion = (rec) => {
    isApplyingRef.current = true;
    const daysToSet = rec.days
      ? rec.days.map(normalizeDay)
      : (Array.isArray(rec.day) ? rec.day.map(normalizeDay) : (rec.day ? [normalizeDay(rec.day)] : []));
    const resolvedDays = daysToSet.length > 0 ? daysToSet : resolveToDayPair(rec.day, 'standard');
    const dayDisplay = rec.dayLabel || resolvedDays.map(d => d.slice(0, 3)).join(' / ');
    setFormData({
      subject: rec.subject?.id || '',
      section: rec.section?.id || '',
      professor: rec.professor?.id || '',
      room: rec.room?.id || '',
      day: resolvedDays,
      timeSlot: rec.timeSlot?.label || rec.timeSlot?.customLabel || ''
    });
    setAppliedMessage(`✓ Auto-filled: ${dayDisplay} ${rec.timeSlot?.label} · ${rec.room?.name}`);
    setValidation(null);
  };

  const isFormIncomplete = !formData.room || !formData.timeSlot || !formData.day || (Array.isArray(formData.day) && formData.day.length === 0);

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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
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
              options={[...eligibleSubjects]
                .sort((a, b) => ((a.code || '').replace(/\s+/g, '').toUpperCase()).localeCompare(((b.code || '').replace(/\s+/g, '').toUpperCase()), undefined, { numeric: true, sensitivity: 'base' }))
                .map(subject => ({ value: subject.id, label: `${subject.code} - ${subject.name}` }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Section *</label>
            <CustomSelect
              name="section"
              value={formData.section}
              onChange={handleChange}
              placeholder="Select a section..."
              required
              options={eligibleSections ? [...eligibleSections].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(sec => ({
                value: sec.id,
                label: sec.name
              })) : []}
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
              options={[...eligibleProfessors].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(professor => {
                const isConflict = checkConflict({ professor });
                return {
                  value: professor.id,
                  label: `${professor.name} ${isConflict ? '(Occupied)' : ''}`
                };
              })}
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
              options={Object.entries(rooms.reduce((acc, r) => {
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
                    const isNonLabForLabSubject = selectedSubject?.requiredLab && !room.hasComputers;
                    return {
                      value: room.id,
                      label: `${room.name}${room.hasComputers ? ' (Lab)' : ''} ${isConflict ? '(In Use)' : isNonLabForLabSubject ? '(Not a Lab)' : ''}`
                    };
                  })
                }))}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Day *</label>
            <div className="day-selector">
              {DAYS.map(day => {
                const shortDay = day.substring(0, 3);
                const activeDays = Array.isArray(formData.day)
                  ? formData.day.map(normalizeDay)
                  : (formData.day ? [normalizeDay(formData.day)] : []);
                const isActive = activeDays.includes(day);
                const isConflict = checkConflict({ day });
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setFormData(prev => {
                        const prevDays = Array.isArray(prev.day)
                          ? prev.day.map(normalizeDay)
                          : (prev.day ? [normalizeDay(prev.day)] : []);
                        const newDays = prevDays.includes(day)
                          ? prevDays.filter(d => d !== day)
                          : [...prevDays, day];
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
            {/* Hidden input to maintain HTML5 validation if needed */}
            <input type="hidden" name="day" value={Array.isArray(formData.day) ? formData.day.join(',') : formData.day} required={!formData.day || formData.day.length === 0} />
          </div>

          <div className="form-group" ref={dropdownRef} style={{ position: 'relative' }}>
            <label className="form-label">Time Slot *</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-select"
                name="timeSlot"
                value={formData.timeSlot}
                onChange={(e) => {
                  handleChange(e);
                  setIsTimeSlotOpen(true);
                }}
                onFocus={() => setIsTimeSlotOpen(true)}
                placeholder="Select or type a time..."
                required
                style={{ paddingRight: '30px', width: '100%' }}
                autoComplete="off"
              />
              <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>

            {isTimeSlotOpen && (
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
                marginTop: '4px',
                zIndex: 100,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {eligibleTimeSlots.map(slot => {
                  const rangeLabel = selectedSubject
                    ? getMeetingTimeLabel(slot, selectedSubject.hoursPerMeeting)
                    : slot.label;

                  // Filter based on input
                  if (formData.timeSlot && !rangeLabel.toLowerCase().includes(formData.timeSlot.toLowerCase())) {
                    return null;
                  }

                  const isSelected = formData.timeSlot === rangeLabel;
                  const conflictTag = getTimeSlotConflictTag(slot);

                  return (
                    <div
                      key={slot.id}
                      onClick={() => {
                        setFormData(prev => ({ ...prev, timeSlot: isSelected ? '' : rangeLabel }));
                        setIsTimeSlotOpen(false);
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

                {formData.timeSlot && !eligibleTimeSlots.some(slot => {
                  const rangeLabel = selectedSubject ? getMeetingTimeLabel(slot, selectedSubject.hoursPerMeeting) : slot.label;
                  return rangeLabel.toLowerCase() === formData.timeSlot.toLowerCase();
                }) && (
                    <div
                      onClick={() => {
                        setIsTimeSlotOpen(false);
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
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      + Use custom time: "{formData.timeSlot}"
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>

        <button type="submit" disabled={loading} className="submit-btn" style={{ width: '100%', marginTop: '10px' }}>
          {loading ? 'Scheduling...' : 'Add to Schedule'}
        </button>
      </form>

      {selectedSubject && selectedSubject.requiredLab && (
        <div className="info-box">
          ⚠️ This subject requires a computer laboratory.
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
