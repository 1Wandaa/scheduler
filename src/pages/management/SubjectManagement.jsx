import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import SubjectTable, { getSubjectDepts } from '../../components/SubjectTable/SubjectTable';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { deleteSubjectCascade, deleteSubjectBatchCascade } from '../../services/cascadeDeleteService';
import BatchActionBar from '../../components/common/BatchActionBar';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { DEPARTMENTS, getDeptColor } from '../../config/constants';
import AutocompleteMultiSelect from '../../components/AutocompleteMultiSelect/AutocompleteMultiSelect';
import QuickCreateModal from '../../components/QuickCreateModal/QuickCreateModal';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';
import { detectLabRequirement, suggestDepartmentFromCode } from '../../utils/subjectLabDetector';
import { getColorNameAndCode } from '../../utils/colorUtils';

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
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);

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
    // Left empty since quick creating cross-entity is removed from this form
  };

  const normalizeSubject = str => (str || '').replace(/\s+/g, '').toUpperCase();
  const trimmedCode = (formData.code || '').trim();
  const trimmedName = (formData.name || '').trim();
  const trimmedId = (formData.id || '').trim();

  const isCodeDuplicate = trimmedCode && subjects.some(s =>
    (!editMode || String(s.id) !== String(currentId)) &&
    normalizeSubject(s.code) === normalizeSubject(trimmedCode)
  );

  const isNameDuplicate = trimmedName && subjects.some(s =>
    (!editMode || String(s.id) !== String(currentId)) &&
    normalizeSubject(s.name) === normalizeSubject(trimmedName)
  );

  const isIdDuplicate = !editMode && trimmedId && subjects.some(s =>
    String(s.id).trim().toLowerCase() === trimmedId.toLowerCase()
  );

  const handleSave = async () => {
    setError(null);
    const code = trimmedCode;
    const name = trimmedName;

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
    
    if (isCodeDuplicate) {
      setError(`A subject with the code "${code}" already exists.`);
      return;
    }
    if (isNameDuplicate) {
      setError(`A subject named "${name}" already exists.`);
      return;
    }
    if (isIdDuplicate) {
      setError(`A subject with ID "${trimmedId}" already exists.`);
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
        const newDocRef = doc(db, 'subjects', subId);
        batch.set(newDocRef, docPayload);
        logActivity({ user, action: LOG_ACTIONS.ADD_SUBJECT, details: `Added new subject: ${payload.code} - ${payload.name} (${payload.credits} units)` });
      }
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
        setSelectedIds(prev => prev.filter(item => item !== id));
        logActivity({ user, action: LOG_ACTIONS.DELETE_SUBJECT, details: `Deleted subject: ${subjectToDelete?.code || id}` });
        toast.success('Subject deleted successfully');
      } catch (err) {
        console.error("Error deleting subject:", err);
        toast.error('Failed to delete subject');
      }
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = (idsInGroup) => {
    const allInGroupSelected = idsInGroup.length > 0 && idsInGroup.every(id => selectedIds.includes(id));
    if (allInGroupSelected) {
      setSelectedIds(prev => prev.filter(id => !idsInGroup.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...idsInGroup])));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(allVisibleSubjects.map(s => s.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleExitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const handleDeleteSelected = async () => {
    const selectedInView = selectedIds.filter(id => allVisibleSubjects.some(s => s.id === id));
    if (selectedInView.length === 0) return;
    const count = selectedInView.length;

    const isConfirmed = await confirm({
      title: `Delete ${count} Subject${count > 1 ? 's' : ''}?`,
      text: `Are you sure you want to delete ${count} selected subject${count > 1 ? 's' : ''}? Their assigned schedules will be removed and records moved to the Recycle Bin.`,
      icon: 'warning',
      confirmButtonText: `Delete ${count} Selected`,
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting ${count} subject${count > 1 ? 's' : ''}...`);
      try {
        const subjectsToDelete = subjects.filter(s => selectedInView.includes(s.id));
        await deleteSubjectBatchCascade(subjectsToDelete, professors, sections, schedules);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_SUBJECTS,
          details: `Batch deleted ${count} subjects: ${subjectsToDelete.map(s => s.code || s.id).join(', ')}`
        });
        toast.success(`Successfully deleted ${count} subject${count > 1 ? 's' : ''}`, { id: toastId });
        setSelectedIds(prev => prev.filter(id => !selectedInView.includes(id)));
      } catch (err) {
        console.error("Error batch deleting subjects:", err);
        toast.error('Failed to delete selected subjects', { id: toastId });
      }
    }
  };

  const handleDeleteAll = async () => {
    const count = allVisibleSubjects.length;
    if (count === 0) return;

    const isConfirmed = await confirm({
      title: `Delete All ${count} Subjects?`,
      text: `Are you sure you want to delete ALL ${count} subjects currently displayed? Their assigned schedules will be removed and records moved to the Recycle Bin.`,
      icon: 'warning',
      confirmButtonText: 'Delete All',
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting all ${count} subjects...`);
      try {
        await deleteSubjectBatchCascade(allVisibleSubjects, professors, sections, schedules);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_SUBJECTS,
          details: `Deleted all ${count} subjects in view (${departmentFilter})`
        });
        toast.success(`Successfully deleted all ${count} subjects`, { id: toastId });
        setSelectedIds([]);
      } catch (err) {
        console.error("Error deleting all subjects:", err);
        toast.error('Failed to delete subjects', { id: toastId });
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
      // Filter by active semester if applicable
      if (activeSemester && s.semester && s.semester !== 'Both' && s.semester !== activeSemester) {
        return false;
      }
      
      const searchLowerCode = searchQuery.toLowerCase().replace(/\s+/g, '');
      const codeMatch = (s.code || '').toLowerCase().replace(/\s+/g, '').includes(searchLowerCode);
      const nameMatch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      if (searchQuery.trim() !== '') {
        return codeMatch || nameMatch;
      }
      return true;
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

  const allVisibleSubjects = useMemo(() => {
    let list = [];
    if (departmentFilter === 'All' || departmentFilter === 'Minor') {
      list = [...list, ...minorSubjects];
    }
    (departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).forEach(dept => {
      if (departmentFilter === 'All' || departmentFilter === dept) {
        const deptMajors = majorSubjects.filter(s => getSubjectDepts(s).includes(dept));
        list = [...list, ...deptMajors];
      }
    });
    if (departmentFilter === 'All') {
      const unassigned = majorSubjects.filter(s => getSubjectDepts(s).length === 0);
      list = [...list, ...unassigned];
    }
    const unique = [];
    const seen = new Set();
    for (const s of list) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        unique.push(s);
      }
    }
    return unique;
  }, [minorSubjects, majorSubjects, departmentFilter, departments]);

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
            <button
              className={`select-mode-btn${selectionMode ? ' active' : ''}`}
              onClick={() => selectionMode ? handleExitSelectionMode() : setSelectionMode(true)}
              title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              {selectionMode ? 'Cancel' : 'Select'}
            </button>
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
                  {dept === 'All' ? 'All Subjects' : dept === 'Minor' ? 'General Ed / Minor' : dept}
                </button>
              )})}
            </div>
            {departmentFilter !== 'All' && (
              <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: '500' }}>
                Showing {departmentFilter === 'Minor' ? minorSubjects.length : majorSubjects.filter(s => getSubjectDepts(s).includes(departmentFilter)).length} subjects
              </span>
            )}
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
            />
          </div>
        </div>

        {selectionMode && (
          <BatchActionBar
            selectedCount={selectedIds.filter(id => allVisibleSubjects.some(s => s.id === id)).length}
            totalCount={allVisibleSubjects.length}
            itemName="subject"
            onSelectAll={handleSelectAllFiltered}
            onDeselectAll={handleDeselectAll}
            onDeleteSelected={handleDeleteSelected}
            onDeleteAll={handleDeleteAll}
            onExitSelectionMode={handleExitSelectionMode}
          />
        )}

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
            selectedIds={selectionMode ? selectedIds : []}
            onToggleSelect={selectionMode ? handleToggleSelect : undefined}
            onToggleSelectAll={selectionMode ? handleToggleSelectAll : undefined}
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
              selectedIds={selectionMode ? selectedIds : []}
              onToggleSelect={selectionMode ? handleToggleSelect : undefined}
              onToggleSelectAll={selectionMode ? handleToggleSelectAll : undefined}
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
            selectedIds={selectionMode ? selectedIds : []}
            onToggleSelect={selectionMode ? handleToggleSelect : undefined}
            onToggleSelectAll={selectionMode ? handleToggleSelectAll : undefined}
          />
        )}

      </div>

      {showModal && (
        <div className="modal-overlay">
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
                className={`form-input${isCodeDuplicate ? ' mgmt-input-duplicate' : ''}`}
                value={formData.code} 
                onChange={e => handleCodeChange(e.target.value)} 
                placeholder="Enter subject code" 
              />
              {isCodeDuplicate && (
                <div className="mgmt-field-duplicate-msg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  Already exists: A subject with code "{trimmedCode}" is already registered.
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Subject Name</label>
              <input 
                className={`form-input${isNameDuplicate ? ' mgmt-input-duplicate' : ''}`}
                value={formData.name} 
                onChange={e => handleNameChange(e.target.value)} 
                placeholder="Enter subject name" 
              />
              {isNameDuplicate && (
                <div className="mgmt-field-duplicate-msg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  Already exists: A subject named "{trimmedName}" is already registered.
                </div>
              )}
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
                {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => {
                  const deptObj = departments.find(d => d.id === dept);
                  const colorHex = deptObj?.color || getDeptColor(dept);
                  const colorInfo = getColorNameAndCode(colorHex);
                  const isChecked = (formData.departments || []).includes(dept);
                  return (
                    <label
                      key={dept}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        cursor: 'pointer', fontSize: '0.85rem', fontWeight: isChecked ? '600' : '500',
                        color: 'var(--text-main)', padding: '5px 10px', borderRadius: '6px',
                        background: isChecked ? `${colorInfo.hex}18` : 'transparent',
                        border: isChecked ? `1px solid ${colorInfo.hex}40` : '1px solid transparent',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleDeptToggle(dept)}
                        style={{ accentColor: colorInfo.hex, width: '16px', height: '16px' }}
                      />
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: colorInfo.hex, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }}></div>
                      <span>{dept}</span>
                    </label>
                  );
                })}
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
                    if (!userLabModified) {
                      const detection = detectLabRequirement(nextForm, subjects);
                      setAutoDetectedReason(detection.reason);
                      setFormData({ ...nextForm, requiredLab: detection.requiredLab, isFoodLab: detection.isFoodLab });
                    } else {
                      setFormData(nextForm);
                    }
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
        <div className="modal-overlay">
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