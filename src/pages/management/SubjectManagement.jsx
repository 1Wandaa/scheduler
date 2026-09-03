import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import SubjectTable, { getSubjectDepts } from '../../components/SubjectTable/SubjectTable';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { deleteSubjectCascade } from '../../services/cascadeDeleteService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { DEPARTMENTS, getDeptColor } from '../../config/constants';
import AutocompleteMultiSelect from '../../components/AutocompleteMultiSelect/AutocompleteMultiSelect';
import QuickCreateModal from '../../components/QuickCreateModal/QuickCreateModal';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';
import { detectLabRequirement, suggestDepartmentFromCode } from '../../utils/subjectLabDetector';

const SubjectManagement = ({ subjects, professors, sections, schedules, availableSemesters = [], activeSemester, departments = [], courses = [], onBack, user, onNavigateToHub }) => {
  const { confirm } = useGlobalDialog();
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [detailsSubject, setDetailsSubject] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [userLabModified, setUserLabModified] = useState(false);
  const [autoSelectedDept, setAutoSelectedDept] = useState(null);
  const [autoDetectedReason, setAutoDetectedReason] = useState(null);

  // States for cross-entity assignments
  const [enrolledSections, setEnrolledSections] = useState([]);
  const [assignedProfessors, setAssignedProfessors] = useState([]);
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');
  const [facultySearchQuery, setFacultySearchQuery] = useState('');
  const [quickCreateState, setQuickCreateState] = useState({ isOpen: false, type: 'section' });
  const [formData, setFormData] = useState({
    id: '', code: '', name: '', departments: [], credits: 3, requiredLab: false, isFoodLab: false, hoursPerMeeting: 1.5, category: 'Major', semester: activeSemester || (availableSemesters[0] || '')
  });

  const handleCodeChange = (newCode) => {
    const suggestedDept = suggestDepartmentFromCode(newCode);

    setFormData(prev => {
      let nextDepts = [...(prev.departments || [])];

      // If we previously auto-selected a department, remove it if newCode suggests a different department or nothing
      if (autoSelectedDept && autoSelectedDept !== suggestedDept) {
        nextDepts = nextDepts.filter(d => d !== autoSelectedDept);
      }

      // If newCode suggests a department, add it to nextDepts if not present
      if (suggestedDept) {
        if (!nextDepts.includes(suggestedDept)) {
          nextDepts = [...nextDepts, suggestedDept];
        }
        setAutoSelectedDept(suggestedDept);
      } else {
        setAutoSelectedDept(null);
      }

      const nextForm = {
        ...prev,
        code: newCode,
        departments: nextDepts
      };

      setUserLabModified(false);

      // If code was cleared and no departments remain, reset lab options
      if (!newCode.trim() && nextDepts.length === 0) {
        setAutoDetectedReason(null);
        return {
          ...nextForm,
          requiredLab: false,
          isFoodLab: false
        };
      }

      const detection = detectLabRequirement(nextForm, subjects);
      setAutoDetectedReason(detection.reason);
      return {
        ...nextForm,
        requiredLab: detection.requiredLab,
        isFoodLab: detection.isFoodLab
      };
    });
  };

  const handleNameChange = (newName) => {
    setFormData(prev => {
      const nextForm = { ...prev, name: newName };
      if (!userLabModified) {
        if (!nextForm.code?.trim() && (!nextForm.departments || nextForm.departments.length === 0) && !newName.trim()) {
          setAutoDetectedReason(null);
          return {
            ...nextForm,
            requiredLab: false,
            isFoodLab: false
          };
        }
        const detection = detectLabRequirement(nextForm, subjects);
        setAutoDetectedReason(detection.reason);
        return {
          ...nextForm,
          requiredLab: detection.requiredLab,
          isFoodLab: detection.isFoodLab
        };
      }
      return nextForm;
    });
  };

  const handleCategoryChange = (newCategory) => {
    setFormData(prev => {
      const updates = { category: newCategory };
      if (newCategory !== 'Minor' && prev.semester === 'Both') {
        updates.semester = activeSemester || availableSemesters[0] || '1st Semester';
      }
      const nextForm = { ...prev, ...updates };

      if (!userLabModified) {
        const detection = detectLabRequirement(nextForm, subjects);
        setAutoDetectedReason(detection.reason);
        return {
          ...nextForm,
          requiredLab: detection.requiredLab,
          isFoodLab: detection.isFoodLab
        };
      }
      return nextForm;
    });
  };

  const handleOpenAdd = () => {
    const defaultDepts = (departmentFilter !== 'All' && departmentFilter !== 'Minor') ? [departmentFilter] : [];
    const defaultCategory = departmentFilter === 'Minor' ? 'Minor' : 'Major';
    const detection = detectLabRequirement({
      category: defaultCategory,
      departments: defaultDepts
    }, subjects);

    setFormData({
      id: '',
      code: '',
      name: '',
      departments: defaultDepts,
      credits: 3,
      requiredLab: detection.requiredLab,
      isFoodLab: detection.isFoodLab,
      hoursPerMeeting: 1.5,
      category: defaultCategory,
      semester: activeSemester || (availableSemesters[0] || '1st Semester')
    });
    setEnrolledSections([]);
    setAssignedProfessors([]);
    setEditMode(false);
    setError(null);
    setUserLabModified(false);
    setAutoSelectedDept(defaultDepts.length === 1 ? defaultDepts[0] : null);
    setAutoDetectedReason(detection.reason);
    setShowModal(true);
  };

  const handleOpenEdit = (subject) => {
    // Normalize: convert old single `department` string into `departments` array
    const depts = Array.isArray(subject.departments) && subject.departments.length > 0
      ? subject.departments
      : (subject.department ? [subject.department] : []);

    const cat = subject.category || 'Major';
    const sem = (subject.semester && subject.semester !== 'Both')
      ? subject.semester
      : (cat === 'Minor' ? 'Both' : (activeSemester || (availableSemesters[0] || '1st Semester')));

    const normalized = {
      ...subject,
      code: subject.code || '',
      name: subject.name || '',
      departments: depts,
      category: cat,
      semester: sem,
      credits: subject.credits !== undefined ? Number(subject.credits) : 3,
      hoursPerMeeting: subject.hoursPerMeeting !== undefined ? Number(subject.hoursPerMeeting) : 1.5,
      requiredLab: Boolean(subject.requiredLab),
      isFoodLab: Boolean(subject.isFoodLab),
    };

    const initialSections = sections.filter(s => 
      (s.subjects || []).some(sub => sub === subject.id || sub === subject.code || sub === subject.name)
    ).map(s => s.id);

    const initialProfs = professors.filter(p => 
      (p.specialization || []).some(sub => sub === subject.id || sub === subject.code || sub === subject.name)
    ).map(p => p.id);

    setEnrolledSections(initialSections);
    setAssignedProfessors(initialProfs);
    setFormData(normalized);
    setCurrentId(subject.id);
    setEditMode(true);
    setError(null);
    setUserLabModified(true);
    setAutoSelectedDept(null);
    setAutoDetectedReason(null);
    setShowModal(true);
  };

  const handleQuickCreateSuccess = (newItem, type) => {
    if (type === 'section') {
      setEnrolledSections(prev => [...prev, newItem.id]);
    } else if (type === 'faculty') {
      setAssignedProfessors(prev => [...prev, newItem.id]);
    }
  };

  const handleSave = async () => {
    setError(null);
    const code = (formData.code || '').trim();
    const name = (formData.name || '').trim();

    if (!code) {
      setError("Subject code is required.");
      return;
    }
    if (!name) {
      setError("Subject name is required.");
      return;
    }

    if (formData.category !== 'Minor' && (!formData.departments || formData.departments.length === 0)) {
      setError("Major subjects must have at least one department assigned.");
      return;
    }
    
    const normalize = str => (str || '').replace(/\s+/g, '').toUpperCase();
    const isDuplicate = subjects.some(s => String(s.id) !== String(currentId) && normalize(s.code) === normalize(code));
    
    if (isDuplicate) {
      setError(`A subject with the code "${code}" already exists.`);
      return;
    }

    const payload = {
      ...formData,
      code,
      name,
      departments: formData.departments || [],
      department: formData.departments?.[0] || (formData.category === 'Minor' ? 'SHARED' : ''),
      category: formData.category || 'Major',
      semester: formData.semester || activeSemester || '1st Semester',
      credits: formData.credits === '' ? 3 : Number(formData.credits),
      hoursPerMeeting: Number(formData.hoursPerMeeting) || 1.5,
      requiredLab: Boolean(formData.requiredLab),
      isFoodLab: Boolean(formData.isFoodLab),
    };

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const subId = currentId || payload.id || `S${Date.now().toString().slice(-4)}`;
      const docPayload = { ...payload, id: subId };

      if (editMode) {
        batch.update(doc(db, 'subjects', currentId.toString()), docPayload);
        logActivity({ user, action: LOG_ACTIONS.UPDATE_SUBJECT, details: `Updated subject: ${payload.code} - ${payload.name}` });
      } else {
        const newDocRef = doc(collection(db, 'subjects'));
        batch.set(newDocRef, docPayload);
        logActivity({ user, action: LOG_ACTIONS.ADD_SUBJECT, details: `Added new subject: ${payload.code} - ${payload.name} (${payload.credits} units)` });
      }

      // 1. Sync sections: update enrolled sections
      sections.forEach(sec => {
        const wasEnrolled = (sec.subjects || []).some(s => s === currentId || s === subId || s === code || (editMode && s === formData.code));
        const isNowEnrolled = enrolledSections.includes(sec.id) || enrolledSections.includes(sec.name);

        if (!wasEnrolled && isNowEnrolled) {
          const updated = [...(sec.subjects || []), code];
          batch.update(doc(db, 'sections', String(sec.id)), { subjects: updated });
        } else if (wasEnrolled && !isNowEnrolled) {
          const nameStr = formData.name || '';
          const updated = (sec.subjects || []).filter(s => s !== currentId && s !== subId && s !== code && s !== formData.code && s !== nameStr);
          const updatedInstructors = { ...(sec.subjectInstructors || {}) };
          delete updatedInstructors[currentId];
          delete updatedInstructors[subId];
          delete updatedInstructors[code];
          if (formData.code) delete updatedInstructors[formData.code];
          batch.update(doc(db, 'sections', String(sec.id)), {
            subjects: updated,
            subjectInstructors: updatedInstructors
          });
        }
      });

      // 2. Sync professors: update specializations
      professors.forEach(prof => {
        const wasAssigned = (prof.specialization || []).some(s => s === currentId || s === subId || s === code || (editMode && s === formData.code));
        const isNowAssigned = assignedProfessors.includes(prof.id);

        if (!wasAssigned && isNowAssigned) {
          const updated = [...(prof.specialization || []), code];
          batch.update(doc(db, 'professors', String(prof.id)), { specialization: updated });
        } else if (wasAssigned && !isNowAssigned) {
          const updated = (prof.specialization || []).filter(s => s !== currentId && s !== subId && s !== code && s !== formData.code);
          batch.update(doc(db, 'professors', String(prof.id)), { specialization: updated });
        }
      });

      await batch.commit();
      setShowModal(false);
      toast.success(`Subject ${payload.code} saved successfully!`);
    } catch (err) {
      console.error("Error saving subject:", err);
      setError("Failed to save subject. Please try again.");
      toast.error("Failed to save subject.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Subject?',
      text: "This action cannot be undone. Proceed?",
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });

    if (isConfirmed) {
      const subjectToDelete = subjects.find(s => s.id === id);
      try {
        await deleteSubjectCascade(subjectToDelete, professors, sections, schedules);
        logActivity({ user, action: LOG_ACTIONS.DELETE_SUBJECT, details: `Deleted subject: ${subjectToDelete?.code || id}` });
        toast.success('Subject deleted successfully');
      } catch (err) {
        console.error("Error deleting subject:", err);
        toast.error('Failed to delete subject');
      }
    }
  };

  const handleDeptToggle = (dept) => {
    setAutoSelectedDept(null);
    setFormData(prev => {
      const current = prev.departments || [];
      const updated = current.includes(dept)
        ? current.filter(d => d !== dept)
        : [...current, dept];
      const nextForm = { ...prev, departments: updated };

      if (!userLabModified) {
        if (!nextForm.code?.trim() && updated.length === 0) {
          setAutoDetectedReason(null);
          return {
            ...nextForm,
            requiredLab: false,
            isFoodLab: false
          };
        }
        const detection = detectLabRequirement(nextForm, subjects);
        setAutoDetectedReason(detection.reason);
        return {
          ...nextForm,
          requiredLab: detection.requiredLab,
          isFoodLab: detection.isFoodLab
        };
      }

      return nextForm;
    });
  };

  // Split subjects into categories using useMemo for performance
  const { minorSubjects, majorSubjects } = useMemo(() => {
    const filteredSubjects = subjects.filter(s => {
      const matchesSemester = !s.semester || s.semester === 'Both' || s.semester === activeSemester;
      const searchLowerCode = searchQuery.toLowerCase().replace(/\s+/g, '');
      const codeMatch = (s.code || '').toLowerCase().replace(/\s+/g, '').includes(searchLowerCode);
      const nameMatch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      if (searchQuery.trim() !== '') {
        return codeMatch || nameMatch;
      }
      return matchesSemester;
    }).sort((a, b) => {
      const codeA = (a.code || '').replace(/\s+/g, '').toUpperCase();
      const codeB = (b.code || '').replace(/\s+/g, '').toUpperCase();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    return {
      minorSubjects: filteredSubjects.filter(s => s.category === 'Minor'),
      majorSubjects: filteredSubjects.filter(s => s.category !== 'Minor') // Default to major
    };
  }, [subjects, searchQuery, activeSemester]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.placeholder && e.target.placeholder.toLowerCase().includes('search')) return;
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <>
      <div className="card" style={{  position: 'relative' }}>
        <div className="mgmt-header">
          <div className="mgmt-header-left">
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                Back
              </button>
            )}
            <div className="mgmt-header-info">
              <h3 className="card-title">
                <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                Subject Requirements
              </h3>
              <p>Manage courses and their scheduling constraints</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {onNavigateToHub && (
              <button 
                className="btn" 
                onClick={onNavigateToHub}
                style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)', boxShadow: 'none' }}
              >
                ⇄ Assignments Hub
              </button>
            )}
            <button className="btn" onClick={handleOpenAdd}>+ Add Subject</button>
          </div>
        </div>

        {/* Department Filter and Search Bar */}
        <div className="mgmt-toolbar">
          <div className="mgmt-toolbar-row">
            <span className="mgmt-toolbar-label">Filter by:</span>
            <div className="mgmt-filter-pills">
              {['All', 'Minor', ...(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)].map(dept => {
                const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
                const isActive = departmentFilter === dept;
                return (
                <button
                  key={dept}
                  className={`mgmt-filter-pill${isActive ? ' active' : ''}`}
                  onClick={() => setDepartmentFilter(dept)}
                  style={isActive ? { background: deptColor, borderColor: deptColor } : undefined}
                >
                  {dept === 'All' ? 'All Subjects' : dept === 'Minor' ? 'Minor Subjects' : dept}
                </button>
              )})}
            </div>
          </div>
          <div className="mgmt-search-wrapper">
            <span className="mgmt-search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input 
              type="text" 
              className="mgmt-search-input" 
              placeholder="Search subject code or name..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ maxWidth: '300px' }}
            />
          </div>
        </div>

        {/* --- DYNAMIC TABLES INSTEAD OF ONE BIG TABLE --- */}

        {/* Render Minor Subjects First */}
        {(departmentFilter === 'All' || departmentFilter === 'Minor') && (
          <SubjectTable 
            subjectList={minorSubjects} 
            title="Minor Subjects" 
            titleColor={getDeptColor('Minor')} 
            onEdit={handleOpenEdit} 
            onDelete={handleDelete} 
            onViewDetails={setDetailsSubject}
            departments={departments}
          />
        )}

        {/* Render Major Subjects grouped by Department */}
        {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => {
          if (departmentFilter !== 'All' && departmentFilter !== dept) return null;
          const deptMajors = majorSubjects.filter(s => getSubjectDepts(s).includes(dept));
          const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
          
          return (
            <SubjectTable 
              key={dept}
              subjectList={deptMajors} 
              title={`${dept} Major Subjects`} 
              titleColor={deptColor} 
              onEdit={handleOpenEdit} 
              onDelete={handleDelete} 
              onViewDetails={setDetailsSubject}
              departments={departments}
            />
          );
        })}

        {/* Fallback for major subjects that don't have a department assigned yet */}
        {(departmentFilter === 'All') && (
          <SubjectTable 
            subjectList={majorSubjects.filter(s => getSubjectDepts(s).length === 0)} 
            title="Unassigned Major Subjects" 
            titleColor="var(--text-muted)" 
            onEdit={handleOpenEdit} 
            onDelete={handleDelete} 
            onViewDetails={setDetailsSubject}
            departments={departments}
          />
        )}

      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => !isSaving && setShowModal(false)}>
          <div 
            className="modal-content" 
            style={{ width: '480px', maxWidth: '100%' }} 
            onClick={e => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-main)' }}>
                {editMode ? 'Edit Subject' : 'Add New Subject'}
              </h3>
              <button 
                type="button"
                onClick={() => !isSaving && setShowModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}
                title="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {error && (
              <div className="mgmt-modal-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Subject Code</label>
              <input 
                className="form-input" 
                value={formData.code} 
                onChange={e => handleCodeChange(e.target.value)} 
                placeholder="Enter subject code" 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Subject Name</label>
              <input 
                className="form-input" 
                value={formData.name} 
                onChange={e => handleNameChange(e.target.value)} 
                placeholder="Enter subject name" 
              />
            </div>

            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Category</label>
                <select 
                  className="form-select" 
                  value={formData.category || 'Major'} 
                  onChange={e => handleCategoryChange(e.target.value)} 
                >
                  <option value="Major">Major Subject</option>
                  <option value="Minor">Minor Subject</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Semester</label>
                <select 
                  className="form-select" 
                  value={formData.semester || (activeSemester || (availableSemesters[0] || '1st Semester'))} 
                  onChange={e => setFormData({ ...formData, semester: e.target.value })}
                >
                  {availableSemesters.map(sem => (
                    <option key={sem} value={sem}>{sem}</option>
                  ))}
                  {formData.category === 'Minor' && <option value="Both">Both Semesters</option>}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Departments</label>
              <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: '12px', background: 'var(--bg-main)' }}>
                {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => (
                  <label key={dept} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: '500', color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.departments || []).includes(dept)}
                      onChange={() => handleDeptToggle(dept)}
                      style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                    />
                    {dept}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '6px 0 0', fontWeight: '500' }}>
                Select all departments that offer this subject
              </p>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Total Units (Credits)</label>
                <input 
                  type="number" 
                  step="any"
                  className="form-input" 
                  value={formData.credits === undefined ? '' : formData.credits} 
                  onChange={e => {
                    const newCredits = e.target.value === '' ? '' : Number(e.target.value);
                    const nextForm = { ...formData, credits: newCredits };
                    setFormData(nextForm);
                    runAutoDetectLab(nextForm, userLabModified);
                  }} 
                />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Hours per Meeting</label>
                <select 
                  className="form-select" 
                  value={formData.hoursPerMeeting || 1.5} 
                  onChange={e => setFormData({ ...formData, hoursPerMeeting: Number(e.target.value) })}
                >
                  <option value={1}>1.0 Hours</option>
                  <option value={1.5}>1.5 Hours</option>
                  <option value={2}>2.0 Hours</option>
                  <option value={2.5}>2.5 Hours</option>
                  <option value={3}>3.0 Hours</option>
                  <option value={4}>4.0 Hours</option>
                  <option value={5}>5.0 Hours</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '25px', padding: '14px 16px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input 
                  type="checkbox" 
                  checked={Boolean(formData.requiredLab)} 
                  onChange={e => {
                    const checked = e.target.checked;
                    setUserLabModified(true);
                    setAutoDetectedReason(null);
                    setFormData(prev => ({ 
                      ...prev, 
                      requiredLab: checked, 
                      isFoodLab: checked ? false : prev.isFoodLab 
                    }));
                  }} 
                  style={{ accentColor: 'var(--accent-primary)', width: '18px', height: '18px' }} 
                /> 
                Requires Computer Laboratory
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input 
                  type="checkbox" 
                  checked={Boolean(formData.isFoodLab)} 
                  onChange={e => {
                    const checked = e.target.checked;
                    setUserLabModified(true);
                    setAutoDetectedReason(null);
                    setFormData(prev => ({ 
                      ...prev, 
                      isFoodLab: checked, 
                      requiredLab: checked ? false : prev.requiredLab 
                    }));
                  }} 
                  style={{ accentColor: 'var(--accent-primary)', width: '18px', height: '18px' }} 
                /> 
                Requires Food Laboratory
              </label>

              {autoDetectedReason && !userLabModified && (
                <div style={{
                  marginTop: '4px',
                  padding: '6px 10px',
                  background: formData.isFoodLab ? 'rgba(234, 179, 8, 0.12)' : 'rgba(16, 158, 239, 0.12)',
                  borderRadius: '6px',
                  border: `1px solid ${formData.isFoodLab ? 'rgba(234, 179, 8, 0.3)' : 'rgba(16, 158, 239, 0.3)'}`,
                  color: formData.isFoodLab ? '#b45309' : '#0284c7',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
                  </svg>
                  <span>Auto-detected: {autoDetectedReason}</span>
                </div>
              )}

              {userLabModified && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setUserLabModified(false);
                      const detection = detectLabRequirement(formData, subjects);
                      setFormData(prev => ({
                        ...prev,
                        requiredLab: detection.requiredLab,
                        isFoodLab: detection.isFoodLab
                      }));
                      setAutoDetectedReason(detection.reason);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      textDecoration: 'underline',
                      fontWeight: '500'
                    }}
                  >
                    Re-check laboratory requirement
                  </button>
                </div>
              )}
            </div>

            {/* Cross-Entity: Enrolled Sections */}
            <div className="form-group" style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Enrolled Sections</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setQuickCreateState({ isOpen: true, type: 'section' })}
                    style={{
                      background: 'rgba(86, 69, 238, 0.1)',
                      border: '1px solid rgba(86, 69, 238, 0.3)',
                      color: 'var(--accent-primary, #5645ee)',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    + Quick Add Section
                  </button>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
                    {enrolledSections.length} section(s) enrolled
                  </span>
                </div>
              </div>

              <AutocompleteMultiSelect
                allOptions={sections}
                options={sections.filter(s => !sectionSearchQuery.trim() || s.name.toLowerCase().includes(sectionSearchQuery.toLowerCase()))}
                selectedIds={enrolledSections}
                onToggle={(secId) => {
                  setEnrolledSections(prev => 
                    prev.includes(secId) ? prev.filter(id => id !== secId) : [...prev, secId]
                  );
                }}
                placeholder="Search section to enroll..."
                searchQuery={sectionSearchQuery}
                setSearchQuery={setSectionSearchQuery}
                noOptionsMessage={sections.length === 0 ? "No sections available." : "No sections match your search."}
                renderChip={(sec, onRemove) => (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 10px', borderRadius: '16px',
                    background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)',
                    fontSize: '0.8rem', fontWeight: '600', color: '#10b981'
                  }}>
                    <span>{sec.name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemove(); }}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7, marginLeft: '2px' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                )}
                renderOption={(sec) => (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '600', color: 'var(--accent-dark)' }}>{sec.name}</span>
                      {sec.program && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({sec.program} - Year {sec.yearLevel})</span>
                      )}
                    </div>
                  </div>
                )}
              />
            </div>

            {/* Cross-Entity: Assigned Faculty */}
            <div className="form-group" style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Assigned Faculty (Specialization)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setQuickCreateState({ isOpen: true, type: 'faculty' })}
                    style={{
                      background: 'rgba(86, 69, 238, 0.1)',
                      border: '1px solid rgba(86, 69, 238, 0.3)',
                      color: 'var(--accent-primary, #5645ee)',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    + Quick Add Faculty
                  </button>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
                    {assignedProfessors.length} faculty assigned
                  </span>
                </div>
              </div>

              <AutocompleteMultiSelect
                allOptions={professors}
                options={professors.filter(p => !facultySearchQuery.trim() || (p.name || '').toLowerCase().includes(facultySearchQuery.toLowerCase()))}
                selectedIds={assignedProfessors}
                onToggle={(profId) => {
                  setAssignedProfessors(prev => 
                    prev.includes(profId) ? prev.filter(id => id !== profId) : [...prev, profId]
                  );
                }}
                placeholder="Search faculty name..."
                searchQuery={facultySearchQuery}
                setSearchQuery={setFacultySearchQuery}
                noOptionsMessage={professors.length === 0 ? "No faculty available." : "No faculty match your search."}
                renderChip={(prof, onRemove) => (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 10px', borderRadius: '16px',
                    background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)',
                    fontSize: '0.8rem', fontWeight: '600', color: '#3b82f6'
                  }}>
                    <span>{prof.name || `${prof.lastName}, ${prof.firstName}`}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemove(); }}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7, marginLeft: '2px' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                )}
                renderOption={(prof) => (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '600', color: 'var(--accent-dark)' }}>{prof.name || `${prof.lastName}, ${prof.firstName}`}</span>
                      {prof.department && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({prof.department})</span>
                      )}
                    </div>
                  </div>
                )}
              />
            </div>

            <div className="mgmt-modal-actions">
              <button className="mgmt-cancel-btn" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
              <button className="btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Subject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detailsSubject && (
        <div className="modal-overlay" onClick={() => setDetailsSubject(null)}>
          <div className="modal-content" style={{ width: '500px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>{detailsSubject.code}</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{detailsSubject.name}</p>
              </div>
              <button onClick={() => setDetailsSubject(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '5px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                Assigned Professors
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {professors && professors.filter(p => p.specialization && (p.specialization.includes(detailsSubject.id) || p.specialization.includes(detailsSubject.code) || p.specialization.includes(detailsSubject.name))).length > 0 ? (
                  professors.filter(p => p.specialization && (p.specialization.includes(detailsSubject.id) || p.specialization.includes(detailsSubject.code) || p.specialization.includes(detailsSubject.name))).map((prof, index, arr) => (
                    <li key={prof.id} style={{ padding: '10px 15px', borderBottom: index < arr.length - 1 ? '1px solid var(--border-color)' : 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        {prof.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: '500' }}>{prof.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{prof.department}</div>
                      </div>
                    </li>
                  ))
                ) : (
                  <li style={{ padding: '15px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No professors specialized in this subject.</li>
                )}
              </ul>
            </div>

            <div>
              <h4 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success)' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                Enrolled Sections
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {sections && sections.filter(s => s.subjects && (s.subjects.includes(detailsSubject.id) || s.subjects.includes(detailsSubject.code) || s.subjects.includes(detailsSubject.name))).length > 0 ? (
                  sections.filter(s => s.subjects && (s.subjects.includes(detailsSubject.id) || s.subjects.includes(detailsSubject.code) || s.subjects.includes(detailsSubject.name))).map((sec, index, arr) => (
                    <li key={sec.id} style={{ padding: '10px 15px', borderBottom: index < arr.length - 1 ? '1px solid var(--border-color)' : 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        {sec.name}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {sec.department} • {sec.yearLevel}
                      </div>
                    </li>
                  ))
                ) : (
                  <li style={{ padding: '15px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No sections enrolled in this subject.</li>
                )}
              </ul>
            </div>
            
            <div className="mgmt-modal-actions" style={{ marginTop: '25px' }}>
              <button className="btn" onClick={() => setDetailsSubject(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Create Modal */}
      <QuickCreateModal
        isOpen={quickCreateState.isOpen}
        type={quickCreateState.type}
        onClose={() => setQuickCreateState({ isOpen: false, type: 'section' })}
        departments={departments}
        courses={courses}
        subjects={subjects}
        sections={sections}
        professors={professors}
        user={user}
        activeSemester={activeSemester}
        onSuccess={handleQuickCreateSuccess}
      />
    </>
  );
};

export default SubjectManagement;