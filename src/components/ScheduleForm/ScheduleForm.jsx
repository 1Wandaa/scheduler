import React, { useState } from 'react';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import { getEligibleProfessors, slotsNeededFromIndex, getMeetingTimeLabel } from '../../utils/scheduleUtils';
import '../../styles/SchedulerForm.css';

function ScheduleForm({ rooms, professors, subjects, sections, onSchedule, validator, activeSemester }) {
  const [formData, setFormData] = useState({
    subject: '',
    section: '',
    professor: '',
    room: '',
    day: '',
    timeSlot: ''
  });

  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setValidation(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.subject || !formData.section || !formData.professor || !formData.room || 
        !formData.day || !formData.timeSlot) {
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
    const timeSlot = TIME_SLOTS.find(t => t.id === parseInt(formData.timeSlot));

    const result = validator.validateAssignment(
      room,
      professor,
      subject,
      section,
      formData.day,
      timeSlot
    );

    if (result.valid) {
      const scheduleResult = validator.addSchedule(room, professor, subject, section, formData.day, timeSlot);
      setValidation({ valid: true, warnings: result.warnings });
      const addResult = await onSchedule(scheduleResult.schedule);
      if (addResult && addResult.ok === false) {
        setValidation({ valid: false, errors: addResult.errors || ['Schedule could not be added.'] });
      } else {
        setFormData({ subject: '', section: '', professor: '', room: '', day: '', timeSlot: '' });
        setTimeout(() => setValidation(null), 3000);
      }
    } else {
      setValidation(result);
    }

    setLoading(false);
  };

  const selectedSubject = subjects.find(s => s.id === formData.subject);
  const selectedSection = sections ? sections.find(s => s.id === formData.section) : null;
  const eligibleProfessors = selectedSubject
    ? getEligibleProfessors(professors, selectedSubject, selectedSection)
    : professors;

  const eligibleTimeSlots = selectedSubject
    ? TIME_SLOTS.filter((slot, idx) => slotsNeededFromIndex(idx, selectedSubject.hoursPerMeeting) > 0)
    : TIME_SLOTS;

  return (
    <div className="schedule-form-container">
      <h2>Create Schedule</h2>
      <form onSubmit={handleSubmit} className="schedule-form">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Subject *</label>
            <select
              className="form-select"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              required
            >
              <option value="">Select a subject</option>
              {[...subjects].filter(s => !s.semester || s.semester === 'Both' || s.semester === activeSemester).sort((a, b) => ((a.code || '').replace(/\s+/g, '').toUpperCase()).localeCompare(((b.code || '').replace(/\s+/g, '').toUpperCase()), undefined, { numeric: true, sensitivity: 'base' })).map(subject => (
                  <option key={subject.id} value={subject.id}>
                  {subject.code} - {subject.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Section *</label>
            <select
              className="form-select"
              name="section"
              value={formData.section}
              onChange={handleChange}
              required
            >
              <option value="">Select a section</option>
              {sections && [...sections].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(sec => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Professor *</label>
            <select
              className="form-select"
              name="professor"
              value={formData.professor}
              onChange={handleChange}
              required
            >
              <option value="">Select a professor</option>
              {[...eligibleProfessors].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(professor => (
                <option key={professor.id} value={professor.id}>
                  {professor.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Room *</label>
            <select
              className="form-select"
              name="room"
              value={formData.room}
              onChange={handleChange}
              required
            >
              <option value="">Select a room</option>
              {Object.entries(rooms.reduce((acc, r) => {
                const b = r.building || 'Other';
                if (!acc[b]) acc[b] = [];
                acc[b].push(r);
                return acc;
              }, {}))
              .sort(([bA], [bB]) => bA.localeCompare(bB))
              .map(([building, bRooms]) => (
                <optgroup key={building} label={building}>
                  {bRooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).map(room => (
                    <option key={room.id} value={room.id}>
                      {room.name}{room.hasComputers ? ' (Lab)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Day *</label>
            <div className="day-selector">
              {DAYS.map(day => {
                const shortDay = day.substring(0, 3);
                const isActive = formData.day === day;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, day }));
                      setValidation(null);
                    }}
                    className={`day-btn ${isActive ? 'active' : ''}`}
                  >
                    {shortDay}
                  </button>
                );
              })}
            </div>
            {/* Hidden input to maintain HTML5 validation if needed */}
            <input type="hidden" name="day" value={formData.day} required />
          </div>

          <div className="form-group">
            <label className="form-label">Time Slot *</label>
            <select
              className="form-select"
              name="timeSlot"
              value={formData.timeSlot}
              onChange={handleChange}
              required
            >
              <option value="">Select a time</option>
              {eligibleTimeSlots.map(slot => {
                const idx = TIME_SLOTS.findIndex(ts => ts.id === slot.id);
                const rangeLabel = selectedSubject
                  ? getMeetingTimeLabel(slot, selectedSubject.hoursPerMeeting)
                  : slot.label;
                return (
                  <option key={slot.id} value={slot.id}>
                    {rangeLabel}{idx >= 0 && slotsNeededFromIndex(idx, selectedSubject?.hoursPerMeeting) > 1 ? ` (${selectedSubject?.hoursPerMeeting || 1.5} hrs)` : ''}
                  </option>
                );
              })}
            </select>
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
