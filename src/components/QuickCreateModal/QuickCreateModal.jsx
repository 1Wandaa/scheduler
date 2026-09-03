import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';
import { DEPARTMENTS } from '../../config/constants';
import './QuickCreateModal.css';

const QuickCreateModal = ({
  isOpen,
  onClose,
  type = 'subject', // 'subject' | 'section' | 'faculty'
  departments = [],
  courses = [],
  subjects = [],
  sections = [],
  professors = [],
  user,
  activeSemester = '1st Semester',
  onSuccess
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  // Subject Form State
  const [subjectData, setSubjectData] = useState({
    code: '',
    name: '',
    departments: [],
    credits: 3,
    hoursPerMeeting: 1.5,
    category: 'Major',
    semester: activeSemester || '1st Semester',
    requiredLab: false,
    isFoodLab: false
  });

  // Section Form State
  const [sectionData, setSectionData] = useState({
    name: '',
    program: '',
    yearLevel: 1,
    subjects: []
  });

  // Faculty Form State
  const [facultyData, setFacultyData] = useState({
    firstName: '',
    lastName: '',
    department: 'BSCS',
    maxUnits: 12,
    specialization: [],
    preferredRooms: [],
    assignedSections: []
  });

  useEffect(() => {
    if (isOpen) {
      setError(null);
      const defaultDept = departments[0]?.id || DEPARTMENTS[0] || 'BSCS';
      const defaultProg = courses[0]?.code || defaultDept;
      
      setSubjectData({
        code: '',
        name: '',
        departments: [defaultDept],
        credits: 3,
        hoursPerMeeting: 1.5,
        category: 'Major',
        semester: activeSemester || '1st Semester',
        requiredLab: false,
        isFoodLab: false
      });

      setSectionData({
        name: '',
        program: defaultProg,
        yearLevel: 1,
        subjects: []
      });

      setFacultyData({
        firstName: '',
        lastName: '',
        department: defaultDept,
        maxUnits: 12,
        specialization: [],
        preferredRooms: [],
        assignedSections: []
      });
    }
  }, [isOpen, type, departments, courses, activeSemester]);

  if (!isOpen) return null;

  const normalize = (str) => (str || '').replace(/\s+/g, '').toUpperCase();

  const handleSaveSubject = async () => {
    const code = subjectData.code.trim();
    const name = subjectData.name.trim();

    if (!code || !name) {
      setError('Subject code and title are required.');
      return;
    }

    if (subjectData.category !== 'Minor' && (!subjectData.departments || subjectData.departments.length === 0)) {
      setError('Major subjects must have at least one department assigned.');
      return;
    }

    const isDuplicate = subjects.some(s => normalize(s.code) === normalize(code));
    if (isDuplicate) {
      setError(`A subject with the code "${code}" already exists.`);
      return;
    }

    setIsSaving(true);
    try {
      const newId = `S${Date.now().toString().slice(-4)}`;
      const payload = {
        ...subjectData,
        id: newId,
        code,
        name,
        department: subjectData.departments?.[0] || (subjectData.category === 'Minor' ? 'SHARED' : ''),
        credits: Number(subjectData.credits) || 3,
        hoursPerMeeting: Number(subjectData.hoursPerMeeting) || 1.5,
        requiredLab: Boolean(subjectData.requiredLab),
        isFoodLab: Boolean(subjectData.isFoodLab)
      };

      const docRef = await addDoc(collection(db, 'subjects'), payload);
      const createdItem = { ...payload, docId: docRef.id };

      logActivity({
        user,
        action: LOG_ACTIONS.ADD_SUBJECT,
        details: `Quick-added subject: ${code} - ${name} (${payload.credits} units)`
      });

      toast.success(`Subject ${code} created successfully!`);
      if (onSuccess) onSuccess(createdItem, 'subject');
      onClose();
    } catch (err) {
      console.error('Error quick creating subject:', err);
      setError('Failed to create subject. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSection = async () => {
    const name = sectionData.name.trim();
    const program = sectionData.program;

    if (!name || !program) {
      setError('Section name and program/department are required.');
      return;
    }

    const isDuplicate = sections.some(s => normalize(s.name) === normalize(name));
    if (isDuplicate) {
      setError(`A section named "${name}" already exists.`);
      return;
    }

    setIsSaving(true);
    try {
      const newId = `SEC${Date.now().toString().slice(-4)}`;
      const payload = {
        ...sectionData,
        id: newId,
        name,
        yearLevel: Number(sectionData.yearLevel) || 1
      };

      const docRef = await addDoc(collection(db, 'sections'), payload);
      const createdItem = { ...payload, docId: docRef.id };

      logActivity({
        user,
        action: LOG_ACTIONS.ADD_SECTION,
        details: `Quick-added section: ${name} (${program})`
      });

      toast.success(`Section ${name} created successfully!`);
      if (onSuccess) onSuccess(createdItem, 'section');
      onClose();
    } catch (err) {
      console.error('Error quick creating section:', err);
      setError('Failed to create section. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFaculty = async () => {
    const firstName = facultyData.firstName.trim();
    const lastName = facultyData.lastName.trim();

    if (!firstName || !lastName) {
      setError('First name and last name are required.');
      return;
    }

    const combinedName = `${lastName}, ${firstName}`;
    const isDuplicate = professors.some(p => normalize(p.name) === normalize(combinedName));
    if (isDuplicate) {
      setError(`A faculty member named "${combinedName}" already exists.`);
      return;
    }

    setIsSaving(true);
    try {
      const newId = `P${Date.now().toString().slice(-4)}`;
      const payload = {
        ...facultyData,
        id: newId,
        firstName,
        lastName,
        name: combinedName,
        maxUnits: Number(facultyData.maxUnits) || 12
      };

      const docRef = await addDoc(collection(db, 'professors'), payload);
      const createdItem = { ...payload, docId: docRef.id };

      logActivity({
        user,
        action: LOG_ACTIONS.ADD_FACULTY,
        details: `Quick-added faculty: ${combinedName} (${payload.department})`
      });

      toast.success(`Faculty ${combinedName} created successfully!`);
      if (onSuccess) onSuccess(createdItem, 'faculty');
      onClose();
    } catch (err) {
      console.error('Error quick creating faculty:', err);
      setError('Failed to create faculty member. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    setError(null);
    if (type === 'subject') handleSaveSubject();
    else if (type === 'section') handleSaveSection();
    else if (type === 'faculty') handleSaveFaculty();
  };

  const availableDepts = departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS;

  return (
    <div className="quick-modal-overlay" onClick={onClose}>
      <div className="quick-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="quick-modal-header">
          <div className="quick-modal-title-group">
            <span className="quick-modal-badge">Quick Add</span>
            <h3 className="quick-modal-title">
              {type === 'subject' && 'Create New Subject'}
              {type === 'section' && 'Create New Section'}
              {type === 'faculty' && 'Create New Faculty Profile'}
            </h3>
          </div>
          <button className="quick-modal-close" onClick={onClose} title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {error && (
          <div className="quick-modal-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="quick-modal-body">
          {/* SUBJECT FORM */}
          {type === 'subject' && (
            <>
              <div className="quick-form-row">
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">Subject Code *</label>
                  <input
                    type="text"
                    className="quick-form-input"
                    placeholder="e.g. CS 101"
                    value={subjectData.code}
                    onChange={e => setSubjectData({ ...subjectData, code: e.target.value.toUpperCase() })}
                    autoFocus
                  />
                </div>
                <div className="quick-form-group" style={{ flex: 1.5 }}>
                  <label className="quick-form-label">Subject Title *</label>
                  <input
                    type="text"
                    className="quick-form-input"
                    placeholder="e.g. Introduction to Computing"
                    value={subjectData.name}
                    onChange={e => setSubjectData({ ...subjectData, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="quick-form-row">
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">Category</label>
                  <select
                    className="quick-form-select"
                    value={subjectData.category}
                    onChange={e => setSubjectData({ ...subjectData, category: e.target.value })}
                  >
                    <option value="Major">Major</option>
                    <option value="Minor">Minor (Gen Ed)</option>
                  </select>
                </div>
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">Total Units</label>
                  <input
                    type="number"
                    step="any"
                    className="quick-form-input"
                    value={subjectData.credits}
                    onChange={e => setSubjectData({ ...subjectData, credits: e.target.value })}
                  />
                </div>
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">Hours / Meeting</label>
                  <select
                    className="quick-form-select"
                    value={subjectData.hoursPerMeeting}
                    onChange={e => setSubjectData({ ...subjectData, hoursPerMeeting: Number(e.target.value) })}
                  >
                    <option value={1}>1.0 Hour</option>
                    <option value={1.5}>1.5 Hours</option>
                    <option value={2}>2.0 Hours</option>
                    <option value={2.5}>2.5 Hours</option>
                    <option value={3}>3.0 Hours</option>
                  </select>
                </div>
              </div>

              {subjectData.category !== 'Minor' && (
                <div className="quick-form-group">
                  <label className="quick-form-label">Departments Offering this Subject</label>
                  <div className="quick-dept-chips">
                    {availableDepts.map(dept => {
                      const isSelected = subjectData.departments.includes(dept);
                      return (
                        <button
                          key={dept}
                          type="button"
                          className={`quick-dept-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSubjectData(prev => {
                              const depts = prev.departments || [];
                              return {
                                ...prev,
                                departments: isSelected ? depts.filter(d => d !== dept) : [...depts, dept]
                              };
                            });
                          }}
                        >
                          {dept}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="quick-checkbox-row">
                <label className="quick-checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(subjectData.requiredLab)}
                    onChange={e => setSubjectData({
                      ...subjectData,
                      requiredLab: e.target.checked,
                      isFoodLab: e.target.checked ? false : subjectData.isFoodLab
                    })}
                  />
                  <span>Requires Computer Lab</span>
                </label>
                <label className="quick-checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(subjectData.isFoodLab)}
                    onChange={e => setSubjectData({
                      ...subjectData,
                      isFoodLab: e.target.checked,
                      requiredLab: e.target.checked ? false : subjectData.requiredLab
                    })}
                  />
                  <span>Requires Food Lab</span>
                </label>
              </div>
            </>
          )}

          {/* SECTION FORM */}
          {type === 'section' && (
            <>
              <div className="quick-form-group">
                <label className="quick-form-label">Section Name *</label>
                <input
                  type="text"
                  className="quick-form-input"
                  placeholder="e.g. BSCS 1-A"
                  value={sectionData.name}
                  onChange={e => setSectionData({ ...sectionData, name: e.target.value.toUpperCase() })}
                  autoFocus
                />
              </div>

              <div className="quick-form-row">
                <div className="quick-form-group" style={{ flex: 1.5 }}>
                  <label className="quick-form-label">Program / Department *</label>
                  <select
                    className="quick-form-select"
                    value={sectionData.program}
                    onChange={e => setSectionData({ ...sectionData, program: e.target.value })}
                  >
                    {courses.length > 0 ? (
                      courses.map(c => (
                        <option key={c.id} value={c.code}>{c.code} ({c.title})</option>
                      ))
                    ) : (
                      availableDepts.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))
                    )}
                  </select>
                </div>
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">Year Level</label>
                  <select
                    className="quick-form-select"
                    value={sectionData.yearLevel}
                    onChange={e => setSectionData({ ...sectionData, yearLevel: Number(e.target.value) })}
                  >
                    <option value={1}>1st Year</option>
                    <option value={2}>2nd Year</option>
                    <option value={3}>3rd Year</option>
                    <option value={4}>4th Year</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* FACULTY FORM */}
          {type === 'faculty' && (
            <>
              <div className="quick-form-row">
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">First Name *</label>
                  <input
                    type="text"
                    className="quick-form-input"
                    placeholder="e.g. Maria"
                    value={facultyData.firstName}
                    onChange={e => setFacultyData({ ...facultyData, firstName: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">Last Name *</label>
                  <input
                    type="text"
                    className="quick-form-input"
                    placeholder="e.g. Santos"
                    value={facultyData.lastName}
                    onChange={e => setFacultyData({ ...facultyData, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="quick-form-row">
                <div className="quick-form-group" style={{ flex: 1.5 }}>
                  <label className="quick-form-label">Department *</label>
                  <select
                    className="quick-form-select"
                    value={facultyData.department}
                    onChange={e => setFacultyData({ ...facultyData, department: e.target.value })}
                  >
                    {availableDepts.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">Max Teaching Units</label>
                  <input
                    type="number"
                    className="quick-form-input"
                    value={facultyData.maxUnits}
                    onChange={e => setFacultyData({ ...facultyData, maxUnits: Number(e.target.value) })}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="quick-modal-actions">
          <button type="button" className="quick-btn-cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="quick-btn-save" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save & Use Instantly'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickCreateModal;
