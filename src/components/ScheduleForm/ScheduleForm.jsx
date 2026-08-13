import React, { useState, useRef, useEffect } from 'react';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import { getEligibleProfessors, slotsNeededFromIndex, getMeetingTimeLabel, findScheduleConflicts } from '../../utils/scheduleUtils';
import '../../styles/SchedulerForm.css';

const CustomSelect = ({ options, value, onChange, placeholder, name, required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const flatOptions = options.flatMap(o => o.options || [o]);
  const selectedOption = flatOptions.find(o => o.value === value);

  useEffect(() => {
    if (!isOpen) setSearch(selectedOption ? selectedOption.label : '');
  }, [isOpen, selectedOption]);

  const filteredOptions = options.map(group => {
    if (group.options) {
      return {
        ...group,
        options: group.options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      };
    }
    return group;
  }).filter(group => group.options ? group.options.length > 0 : group.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        type="text"
        className="form-select"
        value={isOpen ? search : (selectedOption ? selectedOption.label : '')}
        onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
        onFocus={() => { setIsOpen(true); setSearch(''); }}
        placeholder={placeholder}
        required={required && !value}
        style={{ width: '100%', paddingRight: '30px' }}
      />
      <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>
      {isOpen && (
        <div className="custom-dropdown-menu" style={{
           position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '220px', overflowY: 'auto',
           backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px',
           marginTop: '4px', zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column'
        }}>
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>No options found</div>
          ) : filteredOptions.map((opt, i) => {
            if (opt.options) {
              return (
                <div key={opt.label}>
                  <div style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)' }}>{opt.label}</div>
                  {opt.options.map(child => (
                    <div
                      key={child.value}
                      onClick={() => {
                        if (!child.disabled) {
                           onChange({ target: { name, value: child.value } });
                           setIsOpen(false);
                        }
                      }}
                      style={{
                        padding: '10px 12px', paddingLeft: '20px', cursor: child.disabled ? 'not-allowed' : 'pointer',
                        color: child.disabled ? 'var(--text-muted)' : 'var(--text-main)',
                        textDecoration: child.disabled ? 'line-through' : 'none',
                        borderBottom: '1px solid var(--border-color)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = child.disabled ? 'transparent' : 'var(--table-header)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {child.label}
                    </div>
                  ))}
                </div>
              );
            } else {
              return (
                <div
                  key={opt.value}
                  onClick={() => {
                    if (!opt.disabled) {
                       onChange({ target: { name, value: opt.value } });
                       setIsOpen(false);
                    }
                  }}
                  style={{
                    padding: '10px 12px', cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    color: opt.disabled ? 'var(--text-muted)' : 'var(--text-main)',
                    textDecoration: opt.disabled ? 'line-through' : 'none',
                    borderBottom: '1px solid var(--border-color)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = opt.disabled ? 'transparent' : 'var(--table-header)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {opt.label}
                </div>
              );
            }
          })}
        </div>
      )}
    </div>
  );
};

function ScheduleForm({ rooms, professors, subjects, sections, onSchedule, validator, activeSemester, activeSchedules = [] }) {
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
      // Clear dependent fields when subject changes
      if (name === 'subject') {
        newData.section = '';
        newData.professor = '';
        newData.room = '';
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
        setValidation({ valid: true, warnings: allWarnings });
        setFormData({ subject: '', section: '', professor: '', room: '', day: [], timeSlot: '' });
        setTimeout(() => setValidation(null), 3000);
      }
    } else {
      setValidation({ valid: false, errors: allErrors, warnings: allWarnings });
    }

    setLoading(false);
  };

  const selectedSubject = subjects.find(s => s.id === formData.subject);
  const selectedSection = sections ? sections.find(s => s.id === formData.section) : null;
  const eligibleSections = selectedSubject && sections
    ? sections.filter(sec => {
        const sectionSubjects = sec.subjects || [];
        return sectionSubjects.includes(selectedSubject.id) || sectionSubjects.includes(selectedSubject.code);
      })
    : sections;
  const eligibleProfessors = selectedSubject
    ? getEligibleProfessors(professors, selectedSubject, selectedSection)
    : professors;

  const eligibleTimeSlots = selectedSubject
    ? TIME_SLOTS.filter((slot, idx) => slotsNeededFromIndex(idx, selectedSubject.hoursPerMeeting) > 0)
    : TIME_SLOTS;

  const selectedProfessor = professors.find(p => p.id === formData.professor);
  const selectedRoom = rooms.find(r => r.id === formData.room);
  
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
              options={[...subjects]
                .filter(s => !s.semester || s.semester === 'Both' || s.semester === activeSemester)
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

                  return (
                    <div
                      key={slot.id}
                      onClick={() => {
                        setFormData(prev => ({ ...prev, timeSlot: rangeLabel }));
                        setIsTimeSlotOpen(false);
                        setValidation(null);
                      }}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '0.9rem',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--table-header)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
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
        <div className={`validation-box ${validation.valid ? 'success' : 'error'}`}>
          {validation.valid ? (
            <>
              <p>✓ Schedule added successfully!</p>
              {validation.warnings && validation.warnings.length > 0 && (
                <ul>
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
