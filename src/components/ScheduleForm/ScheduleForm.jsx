import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import { getEligibleProfessors, professorMatchesSubject, slotsNeededFromIndex, getMeetingTimeLabel, findScheduleConflicts } from '../../utils/scheduleUtils';
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

      timeSlot = eligibleSlots.find(t => getMeetingTimeLabel(t, subject?.hoursPerMeeting) === formData.timeSlot);
      if (!timeSlot) timeSlot = TIME_SLOTS.find(t => t.id.toString() === formData.timeSlot);

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

    // Validate all selected days first
    for (const day of formData.day) {
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
      for (const day of formData.day) {
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
        setValidation({ valid: true, warnings: allWarnings, room: formData.room });
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
    selectedTimeSlot = eligibleTimeSlots.find(t => getMeetingTimeLabel(t, selectedSubject?.hoursPerMeeting) === formData.timeSlot);
    if (!selectedTimeSlot) selectedTimeSlot = TIME_SLOTS.find(t => t.id.toString() === formData.timeSlot);
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

    const daysToCheck = Array.isArray(candidateBase.day) ? candidateBase.day : [candidateBase.day];

    if (daysToCheck.length === 0 || !candidateBase.timeSlot) return false;

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

  return (
    <div className="schedule-form-container">
      <h2>Create Schedule</h2>
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
                  label: `${professor.name} ${isConflict ? '(Busy)' : ''}`,
                  disabled: isConflict
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
                    const isDisabled = isConflict || isNonLabForLabSubject;
                    return {
                      value: room.id,
                      label: `${room.name}${room.hasComputers ? ' (Lab)' : ''} ${isConflict ? '(In Use)' : isNonLabForLabSubject ? '(Not a Lab)' : ''}`,
                      disabled: isDisabled
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
                const isActive = Array.isArray(formData.day) ? formData.day.includes(day) : formData.day === day;
                const isConflict = checkConflict({ day });
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setFormData(prev => {
                        const prevDays = Array.isArray(prev.day) ? prev.day : (prev.day ? [prev.day] : []);
                        const newDays = prevDays.includes(day)
                          ? prevDays.filter(d => d !== day)
                          : [...prevDays, day];
                        return { ...prev, day: newDays };
                      });
                      setValidation(null);
                    }}
                    disabled={isConflict}
                    className={`day-btn ${isActive ? 'active' : ''} ${isConflict ? 'conflict' : ''}`}
                    style={isConflict && !isActive ? { opacity: 0.5, textDecoration: 'line-through', cursor: 'not-allowed' } : {}}
                    title={isConflict ? 'Conflict on this day' : ''}
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
                        color: 'var(--text-main)',
                        backgroundColor: isSelected ? 'var(--accent-primary-light, rgba(99,102,241,0.1))' : 'transparent',
                        fontWeight: isSelected ? '600' : '400',
                        fontSize: '0.9rem',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--table-header)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isSelected ? 'var(--accent-primary-light, rgba(99,102,241,0.1))' : 'transparent'; }}
                    >
                      {rangeLabel}
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
