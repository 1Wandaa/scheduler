import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { db } from '../../config/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';
import { DEPARTMENTS } from '../../config/constants';
import { detectLabRequirement, suggestDepartmentFromCode } from '../../utils/subjectLabDetector';
import HoursPerMeetingSelect from '../HoursPerMeetingSelect/HoursPerMeetingSelect';
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
  defaultDepartment,
  onSuccess
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [autoSelectedDept, setAutoSelectedDept] = useState(null);
  const [autoDetectedReason, setAutoDetectedReason] = useState(null);
  const [userLabModified, setUserLabModified] = useState(false);

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
    isFoodLab: false,
    hasLecLab: false,
    lectureHours: 2,
    labHours: 3
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
      setUserLabModified(false);
      const defaultDept = (defaultDepartment && defaultDepartment !== 'All')
        ? defaultDepartment
        : (departments[0]?.id || DEPARTMENTS[0] || 'BSCS');
      const defaultProg = courses[0]?.code || defaultDept;
      
      setAutoSelectedDept(defaultDept);
      const detection = detectLabRequirement({
        category: 'Major',
        departments: [defaultDept]
      }, subjects);
      setAutoDetectedReason(detection.reason);

      setSubjectData({
        code: '',
        name: '',
        departments: [defaultDept],
        credits: 3,
        hoursPerMeeting: 1.5,
        category: 'Major',
        semester: activeSemester || '1st Semester',
        requiredLab: detection.requiredLab,
        isFoodLab: detection.isFoodLab,
        hasLecLab: false,
        lectureHours: 2,
        labHours: 3
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
  }, [isOpen, type, departments, courses, activeSemester, defaultDepartment, subjects]);

  const handleCodeChange = (newCode) => {
    const suggestedDept = suggestDepartmentFromCode(newCode);
    setSubjectData(prev => {
      let nextDepts = [...(prev.departments || [])];
      if (autoSelectedDept && autoSelectedDept !== suggestedDept) {
        nextDepts = nextDepts.filter(d => d !== autoSelectedDept);
      }
      if (suggestedDept && !nextDepts.includes(suggestedDept)) {
        nextDepts = [...nextDepts, suggestedDept];
      }
      setAutoSelectedDept(suggestedDept || null);
      setUserLabModified(false);

      const nextForm = { ...prev, code: newCode, departments: nextDepts };
      if (!newCode.trim() && nextDepts.length === 0) {
        setAutoDetectedReason(null);
        return { ...nextForm, requiredLab: false, isFoodLab: false };
      }
      const detection = detectLabRequirement(nextForm, subjects);
      setAutoDetectedReason(detection.reason);
      return { ...nextForm, requiredLab: detection.requiredLab, isFoodLab: detection.isFoodLab };
    });
  };

  const handleNameChange = (newName) => {
    setSubjectData(prev => {
      const nextForm = { ...prev, name: newName };
      if (!userLabModified) {
        if (!nextForm.code?.trim() && (!nextForm.departments || nextForm.departments.length === 0) && !newName.trim()) {
          setAutoDetectedReason(null);
          return { ...nextForm, requiredLab: false, isFoodLab: false };
        }
        const detection = detectLabRequirement(nextForm, subjects);
        setAutoDetectedReason(detection.reason);
        return { ...nextForm, requiredLab: detection.requiredLab, isFoodLab: detection.isFoodLab };
      }
      return nextForm;
    });
  };

  const handleCategoryChange = (newCategory) => {
    setSubjectData(prev => {
      const nextForm = { ...prev, category: newCategory };
      if (!userLabModified) {
        const detection = detectLabRequirement(nextForm, subjects);
        setAutoDetectedReason(detection.reason);
        return { ...nextForm, requiredLab: detection.requiredLab, isFoodLab: detection.isFoodLab };
      }
      return nextForm;
    });
  };

  const handleDepartmentToggle = (dept) => {
    setSubjectData(prev => {
      const depts = prev.departments || [];
      const isSelected = depts.includes(dept);
      const nextDepts = isSelected ? depts.filter(d => d !== dept) : [...depts, dept];
      const nextForm = { ...prev, departments: nextDepts };
      if (!userLabModified) {
        const detection = detectLabRequirement(nextForm, subjects);
        setAutoDetectedReason(detection.reason);
        return { ...nextForm, requiredLab: detection.requiredLab, isFoodLab: detection.isFoodLab };
      }
      return nextForm;
    });
  };

  if (!isOpen) return null;

  const normalize = (str) => (str || '').replace(/\s+/g, '').toUpperCase();
  const normalizeFacultyName = (name) => {
    if (!name) return '';
    let clean = name.replace(/Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Engr\.|Atty\./gi, '');
    return clean.replace(/[^a-z]/gi, '').toLowerCase();
  };

  // Live duplicate checks
  const trimmedSubCode = (subjectData.code || '').trim();
  const trimmedSubName = (subjectData.name || '').trim();
  const isSubCodeDuplicate = Boolean(!isSaving && isOpen && trimmedSubCode && subjects.some(s => normalize(s.code) === normalize(trimmedSubCode)));
  const isSubNameDuplicate = Boolean(!isSaving && isOpen && trimmedSubName && subjects.some(s => normalize(s.name) === normalize(trimmedSubName)));

  const trimmedSecName = (sectionData.name || '').trim();
  const isSecNameDuplicate = Boolean(!isSaving && isOpen && trimmedSecName && sections.some(s => normalize(s.name) === normalize(trimmedSecName)));

  const fNameTrim = (facultyData.firstName || '').trim();
  const lNameTrim = (facultyData.lastName || '').trim();
  const combinedFacName = `${lNameTrim}, ${fNameTrim}`;
  const isFacNameDuplicate = Boolean(!isSaving && isOpen && fNameTrim && lNameTrim && professors.some(p =>
    normalizeFacultyName(p.name || `${p.firstName || ''} ${p.lastName || ''}`) === normalizeFacultyName(fNameTrim + lNameTrim)
  ));

  const handleSaveSubject = async () => {
    const code = trimmedSubCode;
    const name = trimmedSubName;

    if (!code || !name) {
      setError('Subject code and title are required.');
      return;
    }

    if (subjectData.category !== 'Minor' && (!subjectData.departments || subjectData.departments.length === 0)) {
      setError('Major subjects must have at least one department assigned.');
      return;
    }

    if (isSubCodeDuplicate) {
      setError(`A subject with the code "${code}" already exists.`);
      return;
    }
    if (isSubNameDuplicate) {
      setError(`A subject named "${name}" already exists.`);
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
        isFoodLab: Boolean(subjectData.isFoodLab),
        hasLecLab: Boolean(subjectData.hasLecLab),
        lectureHours: Number(subjectData.lectureHours) || 2,
        labHours: Number(subjectData.labHours) || 3
      };

      await setDoc(doc(db, 'subjects', newId), payload);
      const createdItem = { ...payload, docId: newId };

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
    const name = trimmedSecName;
    const program = sectionData.program;

    if (!name || !program) {
      setError('Section name and program/department are required.');
      return;
    }

    if (isSecNameDuplicate) {
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

      await setDoc(doc(db, 'sections', newId), payload);
      const createdItem = { ...payload, docId: newId };

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
    const firstName = fNameTrim;
    const lastName = lNameTrim;

    if (!firstName || !lastName) {
      setError('First name and last name are required.');
      return;
    }

    const combinedName = combinedFacName;
    if (isFacNameDuplicate) {
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

      await setDoc(doc(db, 'professors', newId), payload);
      const createdItem = { ...payload, docId: newId };

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

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="quick-modal-overlay">
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
                    className={`quick-form-input${isSubCodeDuplicate ? ' mgmt-input-duplicate' : ''}`}
                    placeholder="e.g. CS 101"
                    value={subjectData.code}
                    onChange={e => handleCodeChange(e.target.value.toUpperCase())}
                    autoFocus
                  />
                  {isSubCodeDuplicate && (
                    <div className="mgmt-field-duplicate-msg">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                      Already exists: Code "{trimmedSubCode}" is in use.
                    </div>
                  )}
                </div>
                <div className="quick-form-group" style={{ flex: 1.5 }}>
                  <label className="quick-form-label">Subject Title *</label>
                  <input
                    type="text"
                    className={`quick-form-input${isSubNameDuplicate ? ' mgmt-input-duplicate' : ''}`}
                    placeholder="e.g. Introduction to Computing"
                    value={subjectData.name}
                    onChange={e => handleNameChange(e.target.value)}
                  />
                  {isSubNameDuplicate && (
                    <div className="mgmt-field-duplicate-msg">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                      Already exists: Title "{trimmedSubName}" is in use.
                    </div>
                  )}
                </div>
              </div>

              <div className="quick-form-row">
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">Category</label>
                  <select
                    className="quick-form-select"
                    value={subjectData.category}
                    onChange={e => handleCategoryChange(e.target.value)}
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
              </div>

              {subjectData.hasLecLab ? (
                <div className="quick-form-row">
                  <div className="quick-form-group" style={{ flex: 1, minWidth: 0 }}>
                    <label className="quick-form-label">Lecture Hours (Weekly)</label>
                    <HoursPerMeetingSelect
                      value={subjectData.lectureHours || 2}
                      onChange={val => setSubjectData({ ...subjectData, lectureHours: Number(val) || 2 })}
                      selectClassName="quick-form-select"
                      inputClassName="quick-form-input"
                    />
                  </div>
                  <div className="quick-form-group" style={{ flex: 1, minWidth: 0 }}>
                    <label className="quick-form-label">Lab Hours (Weekly)</label>
                    <HoursPerMeetingSelect
                      value={subjectData.labHours || 3}
                      onChange={val => setSubjectData({ ...subjectData, labHours: Number(val) || 3 })}
                      selectClassName="quick-form-select"
                      inputClassName="quick-form-input"
                    />
                  </div>
                </div>
              ) : (
                <div className="quick-form-row">
                  <div className="quick-form-group" style={{ flex: 1, minWidth: 0, maxWidth: 'calc(50% - 7px)' }}>
                    <label className="quick-form-label">Hours / Meeting</label>
                    <HoursPerMeetingSelect
                      value={subjectData.hoursPerMeeting}
                      onChange={val => setSubjectData({ ...subjectData, hoursPerMeeting: val })}
                      selectClassName="quick-form-select"
                      inputClassName="quick-form-input"
                    />
                  </div>
                </div>
              )}

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
                          onClick={() => handleDepartmentToggle(dept)}
                        >
                          {dept}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(() => {
                const quickMode = subjectData.hasLecLab
                  ? 'lec_lab'
                  : (subjectData.requiredLab || subjectData.isFoodLab ? 'single_lab' : 'single_lec');
                const resolveQuickLabFlags = (prev) => {
                  if (prev.isFoodLab) return { requiredLab: false, isFoodLab: true };
                  if (prev.requiredLab) return { requiredLab: true, isFoodLab: false };
                  const depts = Array.isArray(prev.departments) ? prev.departments.map(d => String(d).toUpperCase()) : [];
                  const det = detectLabRequirement(prev, subjects);
                  if (det?.isFoodLab || depts.includes('BSFT')) {
                    return { requiredLab: false, isFoodLab: true };
                  }
                  return { requiredLab: true, isFoodLab: false };
                };
                return (
                  <div className="quick-form-group">
                    <label className="quick-form-label">Course Mode</label>
                    <div className="quick-session-mode-grid-3">
                      <button
                        type="button"
                        className={`quick-session-mode-card ${quickMode === 'single_lec' ? 'active-single' : ''}`}
                        onClick={() => {
                          setUserLabModified(true);
                          setAutoDetectedReason(null);
                          setSubjectData(prev => ({ ...prev, hasLecLab: false, requiredLab: false, isFoodLab: false }));
                        }}
                        aria-pressed={quickMode === 'single_lec'}
                      >
                        <div className="quick-session-mode-header">
                          <strong>Single Lec</strong>
                          {quickMode === 'single_lec' && (
                            <span className="quick-badge-single">Pure</span>
                          )}
                        </div>
                        <span className="quick-session-mode-sub">Pure lecture only</span>
                      </button>

                      <button
                        type="button"
                        className={`quick-session-mode-card ${quickMode === 'lec_lab' ? 'active-leclab' : ''}`}
                        onClick={() => {
                          setUserLabModified(true);
                          setAutoDetectedReason(null);
                          setSubjectData(prev => ({ ...prev, hasLecLab: true, ...resolveQuickLabFlags(prev) }));
                        }}
                        aria-pressed={quickMode === 'lec_lab'}
                      >
                        <div className="quick-session-mode-header">
                          <strong>Lec &amp; Lab</strong>
                          {quickMode === 'lec_lab' && (
                            <span className="quick-badge-leclab">2 Sessions</span>
                          )}
                        </div>
                        <span className="quick-session-mode-sub">Lecture + Lab room</span>
                      </button>

                      <button
                        type="button"
                        className={`quick-session-mode-card ${quickMode === 'single_lab' ? 'active-single-lab' : ''}`}
                        onClick={() => {
                          setUserLabModified(true);
                          setAutoDetectedReason(null);
                          setSubjectData(prev => ({ ...prev, hasLecLab: false, ...resolveQuickLabFlags(prev) }));
                        }}
                        aria-pressed={quickMode === 'single_lab'}
                      >
                        <div className="quick-session-mode-header">
                          <strong>Lab Only</strong>
                          {quickMode === 'single_lab' && (
                            <span className="quick-badge-single-lab">Single Lab</span>
                          )}
                        </div>
                        <span className="quick-session-mode-sub">Single laboratory only</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="quick-checkbox-row">
                <label className={`quick-checkbox-label quick-lab-option ${subjectData.requiredLab ? 'active-comp' : ''}`}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(subjectData.requiredLab)}
                      onChange={e => {
                        const checked = e.target.checked;
                        setUserLabModified(true);
                        setAutoDetectedReason(null);
                        setSubjectData(prev => {
                          const nextIsFood = checked ? false : Boolean(prev.isFoodLab);
                          return {
                            ...prev,
                            requiredLab: checked,
                            isFoodLab: nextIsFood,
                            hasLecLab: (!checked && !nextIsFood) ? false : prev.hasLecLab
                          };
                        });
                      }}
                    />
                    <span>Requires Computer Lab</span>
                  </span>
                  {subjectData.requiredLab && (
                    <span className="quick-badge-complab">Laboratory</span>
                  )}
                </label>
                <label className={`quick-checkbox-label quick-lab-option ${subjectData.isFoodLab ? 'active-food' : ''}`}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(subjectData.isFoodLab)}
                      onChange={e => {
                        const checked = e.target.checked;
                        setUserLabModified(true);
                        setAutoDetectedReason(null);
                        setSubjectData(prev => {
                          const nextReqLab = checked ? false : Boolean(prev.requiredLab);
                          return {
                            ...prev,
                            isFoodLab: checked,
                            requiredLab: nextReqLab,
                            hasLecLab: (!checked && !nextReqLab) ? false : prev.hasLecLab
                          };
                        });
                      }}
                    />
                    <span>Requires Food Lab</span>
                  </span>
                  {subjectData.isFoodLab && (
                    <span className="quick-badge-foodlab">Laboratory</span>
                  )}
                </label>
              </div>

              {autoDetectedReason && !userLabModified && (
                <div style={{
                  fontSize: '0.75rem',
                  color: subjectData.isFoodLab ? '#b45309' : '#059669',
                  fontWeight: 600,
                  padding: '7px 12px',
                  borderRadius: '6px',
                  background: subjectData.isFoodLab ? 'rgba(234, 179, 8, 0.1)' : 'rgba(16, 185, 129, 0.08)',
                  border: `1px solid ${subjectData.isFoodLab ? 'rgba(234, 179, 8, 0.3)' : 'rgba(16, 185, 129, 0.25)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Auto-detected: {autoDetectedReason}</span>
                </div>
              )}

              {userLabModified && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setUserLabModified(false);
                      const detection = detectLabRequirement(subjectData, subjects);
                      setSubjectData(prev => ({
                        ...prev,
                        requiredLab: detection.requiredLab,
                        isFoodLab: detection.isFoodLab
                      }));
                      setAutoDetectedReason(detection.reason);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary, #5645ee)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontWeight: 600
                    }}
                  >
                    Reset to auto-detected
                  </button>
                </div>
              )}
            </>
          )}

          {/* SECTION FORM */}
          {type === 'section' && (
            <>
              <div className="quick-form-group">
                <label className="quick-form-label">Section Name *</label>
                <input
                  type="text"
                  className={`quick-form-input${isSecNameDuplicate ? ' mgmt-input-duplicate' : ''}`}
                  placeholder="e.g. BSCS 1-A"
                  value={sectionData.name}
                  onChange={e => setSectionData({ ...sectionData, name: e.target.value.toUpperCase() })}
                  autoFocus
                />
                {isSecNameDuplicate && (
                  <div className="mgmt-field-duplicate-msg">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    Already exists: Section "{trimmedSecName}" is in use.
                  </div>
                )}
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
                    className={`quick-form-input${isFacNameDuplicate ? ' mgmt-input-duplicate' : ''}`}
                    value={facultyData.firstName}
                    onChange={e => setFacultyData({ ...facultyData, firstName: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="quick-form-group" style={{ flex: 1 }}>
                  <label className="quick-form-label">Last Name *</label>
                  <input
                    type="text"
                    className={`quick-form-input${isFacNameDuplicate ? ' mgmt-input-duplicate' : ''}`}
                    value={facultyData.lastName}
                    onChange={e => setFacultyData({ ...facultyData, lastName: e.target.value })}
                  />
                </div>
              </div>
              {isFacNameDuplicate && (
                <div className="mgmt-field-duplicate-msg" style={{ marginTop: '-6px', marginBottom: '12px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  Already exists: Faculty member "{combinedFacName}" is in use.
                </div>
              )}

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
    </div>,
    document.body
  );
};

export default QuickCreateModal;
