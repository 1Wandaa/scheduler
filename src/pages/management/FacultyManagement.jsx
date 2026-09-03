import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { deleteFacultyCascade } from '../../services/cascadeDeleteService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { DEPARTMENTS, getDeptColor } from '../../config/constants';
import FacultyTable from '../../components/FacultyTable/FacultyTable';
import SubjectSelector from '../../components/SubjectSelector/SubjectSelector';
import AutocompleteMultiSelect from '../../components/AutocompleteMultiSelect/AutocompleteMultiSelect';
import QuickCreateModal from '../../components/QuickCreateModal/QuickCreateModal';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

const FacultyManagement = ({ professors, subjects = [], rooms = [], sections = [], schedules = [], activeSemester, departments = [], courses = [], onBack, user, onNavigateToHub }) => {
  const { confirm } = useGlobalDialog();
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Map of sectionId -> array of subject codes/ids assigned to that section for this faculty
  const [sectionSubjectMap, setSectionSubjectMap] = useState({});
  const [quickCreateState, setQuickCreateState] = useState({ isOpen: false, type: 'subject' });

  const [formData, setFormData] = useState({
    id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, specialization: [], preferredRooms: [], assignedSections: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, specialization: [], preferredRooms: [], assignedSections: [] });
    setSectionSubjectMap({});
    setEditMode(false);
    setError(null);
    setSectionSearchQuery('');
    setShowModal(true);
  };

  const getSectionSubjects = (sec) => {
    if (!sec || !sec.subjects || !Array.isArray(sec.subjects)) return [];
    return (sec.subjects || []).map(subRef => {
      return subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef, name: subRef };
    });
  };

  const getFacultyMatchingSubjectsForSection = (sec, specialization) => {
    if (!sec || !specialization || specialization.length === 0) return [];
    const secSubjs = getSectionSubjects(sec);
    return secSubjs.filter(sub =>
      specialization.includes(sub.id) ||
      specialization.includes(sub.code) ||
      specialization.includes(sub.name)
    );
  };

  const handleSubjectToggle = (subjectId) => {
    if (subjectId === 'CLEAR_ALL') {
      setFormData(prev => ({ ...prev, specialization: [] }));
      setSectionSubjectMap({});
      return;
    }

    if (Array.isArray(subjectId)) {
      setFormData(prev => {
        const current = prev.specialization || [];
        const allPresent = subjectId.every(id => current.includes(id));
        const nextSpecs = allPresent
          ? current.filter(id => !subjectId.includes(id))
          : [...current, ...subjectId.filter(id => !current.includes(id))];
        return { ...prev, specialization: nextSpecs };
      });
      return;
    }

    // SubjectSelector single subjectId
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;

    setFormData(prev => {
      const current = prev.specialization || [];
      const isChecked = current.includes(subject.id) || current.includes(subject.code) || current.includes(subject.name);
      const newSpecialization = isChecked
        ? current.filter(s => s !== subject.id && s !== subject.code && s !== subject.name)
        : [...current, subject.id];

      // Update sectionSubjectMap to prune any removed subject
      if (isChecked) {
        setSectionSubjectMap(prevMap => {
          const nextMap = { ...prevMap };
          Object.keys(nextMap).forEach(secKey => {
            nextMap[secKey] = (nextMap[secKey] || []).filter(
              s => s !== subject.id && s !== subject.code && s !== subject.name
            );
          });
          return nextMap;
        });
      }

      return {
        ...prev,
        specialization: newSpecialization
      };
    });
  };

  const handleRoomToggle = (room) => {
    setFormData(prev => {
      const current = prev.preferredRooms || [];
      const isChecked = current.includes(room.id) || current.includes(room.name);
      if (isChecked) {
        return { ...prev, preferredRooms: current.filter(r => r !== room.id && r !== room.name) };
      } else {
        return { ...prev, preferredRooms: [...current, room.id] };
      }
    });
  };

  const handleSectionToggle = (sec) => {
    const current = formData.assignedSections || [];
    const isChecked = current.includes(sec.id) || current.includes(sec.name);
    if (isChecked) {
      setFormData(prev => ({
        ...prev,
        assignedSections: (prev.assignedSections || []).filter(s => s !== sec.id && s !== sec.name)
      }));
      setSectionSubjectMap(prev => {
        const next = { ...prev };
        delete next[sec.id];
        delete next[sec.name];
        return next;
      });
      return;
    }

    const assignedSubjectIds = formData.specialization || [];
    if (assignedSubjectIds.length === 0) {
      toast.warning("Please select the faculty's Assigned Subjects first before assigning sections.");
      return;
    }

    // Default to existing enrolled matching subjects, or if none, pre-select the first assigned subject
    const matching = getFacultyMatchingSubjectsForSection(sec, assignedSubjectIds);
    let initialSubs = matching.map(m => m.code || m.id);
    if (initialSubs.length === 0 && assignedSubjectIds.length === 1) {
      const firstSub = subjects.find(s => s.id === assignedSubjectIds[0] || s.code === assignedSubjectIds[0]);
      initialSubs = [firstSub?.code || firstSub?.id || assignedSubjectIds[0]];
    }

    setFormData(prev => ({
      ...prev,
      assignedSections: [...(prev.assignedSections || []), sec.id]
    }));

    setSectionSubjectMap(prev => ({
      ...prev,
      [sec.id]: initialSubs
    }));
  };

  const handleToggleSubjectForSection = (secId, subjectRef) => {
    setSectionSubjectMap(prev => {
      const currentList = prev[secId] || [];
      const exists = currentList.includes(subjectRef);
      const updated = exists 
        ? currentList.filter(s => s !== subjectRef) 
        : [...currentList, subjectRef];
      return {
        ...prev,
        [secId]: updated
      };
    });
  };

  const handleQuickCreateSuccess = (newItem, type) => {
    if (type === 'subject') {
      setFormData(prev => ({
        ...prev,
        specialization: [...(prev.specialization || []), newItem.id]
      }));
    } else if (type === 'section') {
      setFormData(prev => ({
        ...prev,
        assignedSections: [...(prev.assignedSections || []), newItem.id]
      }));
      if (formData.specialization && formData.specialization.length > 0) {
        const firstSub = subjects.find(s => s.id === formData.specialization[0] || s.code === formData.specialization[0]) || { code: formData.specialization[0] };
        setSectionSubjectMap(prev => ({
          ...prev,
          [newItem.id]: [firstSub.code || firstSub.id]
        }));
      }
    }
  };

  const handleOpenEdit = (prof) => {
    let fName = prof.firstName || '';
    let lName = prof.lastName || '';

    if (!fName && !lName && prof.name) {
      if (prof.name.includes(',')) {
        const parts = prof.name.split(',');
        lName = parts[0].trim();
        fName = parts.slice(1).join(',').trim();
      } else {
        const titles = ['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'Engr.', 'Atty.'];
        let parts = prof.name.trim().split(/\s+/);
        let title = '';
        if (parts.length > 0 && titles.includes(parts[0])) title = parts.shift();

        if (parts.length >= 2) {
          lName = parts.pop();
          fName = (title ? title + ' ' : '') + parts.join(' ');
        } else {
          lName = prof.name;
        }
      }
    }

    const assignedSecs = prof.assignedSections || [];
    const initialMap = { ...(prof.sectionSubjectMap || {}) };
    assignedSecs.forEach(secId => {
      const sec = sections.find(s => s.id === secId || s.name === secId);
      if (sec && (!initialMap[sec.id] || initialMap[sec.id].length === 0)) {
        if (sec.subjectInstructors) {
          const explicitSubs = Object.entries(sec.subjectInstructors)
            .filter(([subRef, pId]) => pId === prof.id)
            .map(([subRef]) => subRef);
          if (explicitSubs.length > 0) {
            initialMap[sec.id] = explicitSubs;
            return;
          }
        }
        const matching = getFacultyMatchingSubjectsForSection(sec, prof.specialization || []);
        initialMap[sec.id] = matching.map(m => m.code || m.id);
      }
    });

    setFormData({
      ...prof,
      firstName: fName,
      lastName: lName,
      preferredRooms: prof.preferredRooms || [],
      assignedSections: assignedSecs
    });
    setSectionSubjectMap(initialMap);
    setCurrentId(prof.id);
    setEditMode(true);
    setError(null);
    setSectionSearchQuery('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!formData.firstName || !formData.lastName) {
      setError("First and last names are required.");
      return;
    }

    const combinedName = `${(formData.lastName || '').trim()}, ${(formData.firstName || '').trim()}`;

    // Robust duplicate check: normalize by removing titles, spaces, and punctuation
    const normalizeName = (name) => {
      if (!name) return '';
      let clean = name.replace(/Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Engr\.|Atty\./gi, '');
      return clean.replace(/[^a-z]/gi, '').toLowerCase();
    };

    const newNameNormalized = normalizeName(formData.firstName + formData.lastName);

    const isDuplicate = professors.some(p =>
      p.id !== currentId &&
      normalizeName(p.name) === newNameNormalized
    );

    if (isDuplicate) {
      setError(`A faculty member named "${combinedName}" already exists!`);
      return;
    }

    if (formData.assignedSections && formData.assignedSections.length > 0) {
      if (!formData.specialization || formData.specialization.length === 0) {
        setError("Cannot assign sections without selecting assigned subjects. Please select assigned subjects first.");
        return;
      }

      // Check that each assigned section has at least one subject selected
      const missingSubjects = (formData.assignedSections || []).filter(secId => {
        const sec = sections.find(s => s.id === secId || s.name === secId);
        const list = sec ? (sectionSubjectMap[sec.id] || sectionSubjectMap[sec.name] || []) : [];
        return list.length === 0;
      });

      if (missingSubjects.length > 0) {
        const names = missingSubjects.map(secId => {
          const sec = sections.find(s => s.id === secId || s.name === secId);
          return sec ? sec.name : secId;
        }).join(', ');
        setError(`Please select which subject(s) this faculty member teaches for: ${names}`);
        return;
      }
    }

    const dataToSave = { 
      ...formData, 
      name: combinedName,
      sectionSubjectMap: sectionSubjectMap || {}
    };

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const profId = (currentId || formData.id || `P${Date.now().toString().slice(-4)}`).toString();

      if (editMode) {
        batch.update(doc(db, 'professors', currentId.toString()), dataToSave);
        logActivity({ user, action: LOG_ACTIONS.UPDATE_FACULTY, details: `Updated faculty: ${combinedName}` });
      } else {
        const newDocRef = doc(collection(db, 'professors'));
        batch.set(newDocRef, { ...dataToSave, id: profId });
        logActivity({ user, action: LOG_ACTIONS.ADD_FACULTY, details: `Added new faculty: ${combinedName} (${formData.department})` });
      }

      // Auto-enroll sections ONLY in the specific subjects chosen for each section
      const assignedSecs = formData.assignedSections || [];
      assignedSecs.forEach(secId => {
        const sec = sections.find(s => s.id === secId || s.name === secId);
        if (sec) {
          const assignedSubjs = sectionSubjectMap[sec.id] || [];
          const currentSubjs = sec.subjects || [];
          let updatedSubjs = [...currentSubjs];
          let hasChanges = false;
          const updatedSubjectInstructors = { ...(sec.subjectInstructors || {}) };

          assignedSubjs.forEach(subRef => {
            const subObj = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef);
            const valToAdd = subObj?.code || subObj?.id || subRef;
            const isAlreadyIn = updatedSubjs.some(existing => 
              existing === valToAdd || (subObj && (existing === subObj.id || existing === subObj.code))
            );
            if (!isAlreadyIn) {
              updatedSubjs.push(valToAdd);
              hasChanges = true;
            }
            updatedSubjectInstructors[valToAdd] = profId;
            hasChanges = true;
          });

          if (hasChanges) {
            batch.update(doc(db, 'sections', String(sec.id)), { 
              subjects: updatedSubjs,
              subjectInstructors: updatedSubjectInstructors
            });
          }
        }
      });

      await batch.commit();
      setShowModal(false);
      toast.success(`Faculty ${combinedName} saved successfully!`);
    } catch (err) {
      console.error("Error saving faculty:", err);
      setError("Failed to save faculty. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Faculty?',
      text: "This action cannot be undone. Proceed?",
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });

    if (isConfirmed) {
      try {
        const prof = professors.find(p => String(p.id) === String(id));
        await deleteFacultyCascade(prof, schedules);
        logActivity({ user, action: LOG_ACTIONS.DELETE_FACULTY, details: `Deleted faculty: ${prof?.name || id}` });
        toast.success('Faculty deleted successfully');
      } catch (err) {
        console.error("Error deleting faculty:", err);
        toast.error('Failed to delete faculty');
      }
    }
  };

  const filteredProfessors = useMemo(() => {
    return professors
      .map(p => ({
        ...p,
        formattedName: (() => {
          if (!p.name) return '';
          if (p.name.includes(',')) return p.name;
          const titles = ['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'Engr.', 'Atty.'];
          let parts = p.name.trim().split(/\s+/);
          let title = '';
          if (parts.length > 0 && titles.includes(parts[0])) title = parts.shift();
          if (parts.length < 2) return p.name;
          const surname = parts.pop();
          return `${surname}, ${title ? title + ' ' : ''}${parts.join(' ')}`.trim();
        })()
      }))
      .filter(p => departmentFilter === 'All' || p.department === departmentFilter)
      .filter(p => p.formattedName.toLowerCase().includes(searchQuery.toLowerCase()) || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.formattedName.localeCompare(b.formattedName));
  }, [professors, departmentFilter, searchQuery]);

  const filteredSections = useMemo(() => {
    const assignedSubjectIds = formData.specialization || [];
    const hasAssignedSubjects = assignedSubjectIds.length > 0;
    const profDept = (formData.department || '').toUpperCase();

    return [...sections]
      .map(sec => {
        const allEnrolled = getSectionSubjects(sec);
        const matching = getFacultyMatchingSubjectsForSection(sec, assignedSubjectIds);
        const secDept = (sec.department || sec.program || '').toUpperCase();
        const isRecommended = Boolean(profDept && (secDept.includes(profDept) || profDept.includes(secDept)));
        return {
          ...sec,
          allEnrolled,
          matchingSubjects: matching,
          disabled: !hasAssignedSubjects,
          isRecommended,
          disabledReason: !hasAssignedSubjects ? 'Select assigned subjects first' : ''
        };
      })
      .filter(sec => {
        if (!sectionSearchQuery.trim()) return true;
        const q = sectionSearchQuery.toLowerCase();
        const nameMatch = (sec.name || '').toLowerCase().includes(q);
        const deptMatch = (sec.department || sec.program || '').toLowerCase().includes(q);
        const subjectMatch = sec.allEnrolled.some(s =>
          (s.code || '').toLowerCase().includes(q) ||
          (s.name || '').toLowerCase().includes(q)
        );
        return nameMatch || deptMatch || subjectMatch;
      })
      .sort((a, b) => {
        // Show eligible & recommended sections first
        if (a.disabled !== b.disabled) {
          return a.disabled ? 1 : -1;
        }
        if (a.isRecommended !== b.isRecommended) {
          return a.isRecommended ? -1 : 1;
        }
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [sections, sectionSearchQuery, formData.specialization, formData.department, subjects]);

  const sortedRooms = useMemo(() => {
    const profDept = (formData.department || '').toUpperCase();
    return [...rooms].map(r => {
      const rDept = (r.department || '').toUpperCase();
      const rBuilding = (r.building || '').toUpperCase();
      const isRecommended = Boolean(profDept && (rDept === profDept || rBuilding.includes(profDept) || profDept.includes(rDept)));
      return {
        ...r,
        isRecommended
      };
    }).sort((a, b) => {
      if (a.isRecommended !== b.isRecommended) {
        return a.isRecommended ? -1 : 1;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [rooms, formData.department]);

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
      <div className="card" style={{ position: 'relative' }}>
        {/* Sticky Wrapper for Header & Filters */}
        <div className="sticky-mgmt-header" style={{ position: 'sticky', top: '-24px', zIndex: 40, backgroundColor: '#ffffff', paddingTop: '24px', paddingBottom: '10px', borderBottom: '1px solid var(--border-color)', margin: '-24px -24px 20px -24px', paddingLeft: '24px', paddingRight: '24px' }}>
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
                  <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
                  Faculty Management
                </h3>
                <p>Manage instructors, their departments, and constraints</p>
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
              <button className="btn" onClick={handleOpenAdd}>+ Add Faculty</button>
            </div>
          </div>

          {/* Department Filter and Search */}
          <div className="mgmt-toolbar">
            <div className="mgmt-toolbar-row">
              <span className="mgmt-toolbar-label">Filter by Department:</span>
              <div className="mgmt-filter-pills">
                {['All', ...(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)].map(dept => {
                  const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
                  const isActive = departmentFilter === dept;
                  return (
                    <button
                      key={dept}
                      className={`mgmt-filter-pill${isActive ? ' active' : ''}`}
                      onClick={() => setDepartmentFilter(dept)}
                      style={isActive ? { background: deptColor, borderColor: deptColor } : undefined}
                    >
                      {dept === 'All' ? 'All Departments' : dept}
                    </button>
                  )
                })}
              </div>
              {departmentFilter !== 'All' && (
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: '500' }}>
                  Showing {professors.filter(p => p.department === departmentFilter).length} of {professors.length} faculty
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
                placeholder="Search faculty name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <FacultyTable facultyList={filteredProfessors} subjects={subjects} schedules={schedules} departments={departments} onEdit={handleOpenEdit} onDelete={handleDelete} />
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => !isSaving && setShowModal(false)}>
          <div 
            className="modal-content" 
            style={{ width: '500px', maxWidth: '100%' }} 
            onClick={e => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-main)' }}>
                {editMode ? 'Edit Faculty' : 'Add New Faculty'}
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

            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Last Name (Surname)</label>
                <input className="form-input" value={formData.lastName || ''} onChange={e => setFormData({ ...formData, lastName: e.target.value })} placeholder="Last name" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">First Name</label>
                <input className="form-input" value={formData.firstName || ''} onChange={e => setFormData({ ...formData, firstName: e.target.value })} placeholder="First name" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Department</label>
                <select className="form-select" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })}>
                  {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              {(() => {
                let currentUnits = 0;

                if (editMode && currentId) {
                  const professorIdOf = (s) => s?.professor?.id ?? s?.professorId ?? null;
                  const matchesProfessor = (s, id) => professorIdOf(s) != null && String(professorIdOf(s)) === String(id);
                  const profSchedules = (schedules || []).filter(s => matchesProfessor(s, currentId));

                  const uniqueSubjectSections = new Map();
                  for (const s of profSchedules) {
                    const subjectId = s.subject?.id || s.subject?.code || 'unknown';
                    const sectionId = s.section?.id || 'no-section';
                    const key = `${subjectId}__${sectionId}`;
                    if (!uniqueSubjectSections.has(key)) {
                      uniqueSubjectSections.set(key, Number(s.subject?.credits) || 3);
                    }
                  }
                  currentUnits = Array.from(uniqueSubjectSections.values()).reduce((sum, c) => sum + c, 0);
                } else {
                  const selectedIds = formData.specialization || [];
                  const assignedSectionsCount = (formData.assignedSections || []).length;

                  const baseUnits = subjects
                    .filter(s => selectedIds.includes(s.id) || selectedIds.includes(s.code) || selectedIds.includes(s.name))
                    .reduce((sum, s) => sum + (Number(s.credits) || 3), 0);

                  currentUnits = baseUnits * Math.max(1, assignedSectionsCount);
                }

                return (
                  <div className="form-group" style={{ width: '100px' }}>
                    <label className="form-label">Total Units</label>
                    <div style={{
                      padding: '11px',
                      borderRadius: '8px',
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: currentUnits > formData.maxUnits ? 'var(--danger)' : 'var(--success)'
                    }}>
                      {currentUnits}
                    </div>
                  </div>
                );
              })()}
              <div className="form-group" style={{ width: '100px' }}>
                <label className="form-label">Max Units</label>
        <input type="number" className="form-input" value={formData.maxUnits} onChange={e => setFormData({ ...formData, maxUnits: e.target.value === '' ? '' : parseInt(e.target.value) })} style={{ textAlign: 'center' }} />
              </div>
            </div>

            <SubjectSelector
              label="Assigned Subjects"
              subjects={subjects}
              activeSemester={activeSemester}
              selectedSubjects={formData.specialization || []}
              departments={departments}
              onToggleSubject={handleSubjectToggle}
              recommendedDepartment={formData.department}
              contextType="faculty"
              onQuickAdd={() => setQuickCreateState({ isOpen: true, type: 'subject' })}
            />

            <div className="form-group" style={{ marginBottom: '25px' }}>
              <label className="form-label">Preferred Rooms</label>
              <AutocompleteMultiSelect
                allOptions={rooms}
                options={sortedRooms}
                selectedIds={formData.preferredRooms || []}
                onToggle={handleRoomToggle}
                placeholder="Search room name..."
                searchQuery={roomSearchQuery}
                setSearchQuery={setRoomSearchQuery}
                noOptionsMessage={sortedRooms.length === 0 ? "No rooms available." : "No rooms match your search."}
                renderChip={(room, onRemove) => (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 10px', borderRadius: '16px',
                    background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)',
                    fontSize: '0.8rem', fontWeight: '600', color: '#3b82f6'
                  }}>
                    {room.name}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemove(); }}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7, marginLeft: '2px' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                )}
                renderOption={(room) => (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '600', color: 'var(--accent-dark)' }}>{room.name}</span>
                      {room.building && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({room.building})</span>
                      )}
                    </div>
                    {room.isRecommended && (
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: '700', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                        ✨ Recommended
                      </span>
                    )}
                  </div>
                )}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '25px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Assigned Sections</label>
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
                  {formData.specialization && formData.specialization.length > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
                      {filteredSections.filter(s => !s.disabled).length} eligible section(s)
                    </span>
                  )}
                </div>
              </div>

              {(!formData.specialization || formData.specialization.length === 0) && (
                <div style={{
                  fontSize: '0.78rem', color: 'var(--warning)',
                  background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)',
                  padding: '8px 12px', borderRadius: '6px', marginBottom: '10px',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  <span>⚠️</span>
                  <span>Please select at least one <strong>Assigned Subject</strong> above first to view and assign eligible sections.</span>
                </div>
              )}

              <AutocompleteMultiSelect
                allOptions={sections}
                options={filteredSections}
                selectedIds={formData.assignedSections || []}
                onToggle={handleSectionToggle}
                placeholder={(!formData.specialization || formData.specialization.length === 0) ? "Select subjects first..." : "Search section name or enrolled subject..."}
                searchQuery={sectionSearchQuery}
                setSearchQuery={setSectionSearchQuery}
                noOptionsMessage={
                  sections.length === 0
                    ? "No sections available."
                    : (!formData.specialization || formData.specialization.length === 0)
                      ? "Select assigned subjects first to see eligible sections."
                      : "No sections match your search."
                }
                renderChip={(sec, onRemove) => {
                  const assignedSubs = sectionSubjectMap[sec.id] || [];
                  const subLabels = assignedSubs.join(', ');

                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '4px 10px', borderRadius: '16px',
                      background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)',
                      fontSize: '0.8rem', fontWeight: '600', color: '#10b981'
                    }}>
                      <span>{sec.name}</span>
                      {subLabels && (
                        <span style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: '500', color: '#047857' }}>
                          ({subLabels})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7, marginLeft: '2px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                  );
                }}
                renderOption={(sec) => {
                  const isEligible = !sec.disabled;
                  const matchingCodes = (sec.matchingSubjects || []).map(s => s.code || s.name);
                  const otherEnrolledCodes = (sec.allEnrolled || [])
                    .filter(s => !matchingCodes.includes(s.code || s.name))
                    .map(s => s.code || s.name);

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', padding: '2px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '700', color: isEligible ? 'var(--accent-dark)' : 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {sec.name}
                          </span>
                          {sec.program && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                              {sec.program}
                            </span>
                          )}
                          {sec.isRecommended && (
                            <span style={{ fontSize: '0.7rem', color: '#059669', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', padding: '1px 6px', borderRadius: '8px', fontWeight: '700' }}>
                              ✨ Recommended
                            </span>
                          )}
                        </div>
                        {matchingCodes.length > 0 ? (
                          <span style={{ fontSize: '0.7rem', color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                            {matchingCodes.length} Enrolled Match
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: '#b45309', background: 'rgba(234, 179, 8, 0.15)', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                            Can assign & auto-enroll
                          </span>
                        )}
                      </div>

                      {/* Enrolled Subjects List */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600' }}>Enrolled:</span>
                        {sec.allEnrolled && sec.allEnrolled.length > 0 ? (
                          <>
                            {matchingCodes.map(code => (
                              <span key={code} style={{
                                fontSize: '0.7rem', fontWeight: '700',
                                background: 'rgba(16, 185, 129, 0.15)', color: '#059669',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                padding: '1px 6px', borderRadius: '4px'
                              }}>
                                ✓ {code}
                              </span>
                            ))}
                            {otherEnrolledCodes.slice(0, 4).map(code => (
                              <span key={code} style={{
                                fontSize: '0.7rem', fontWeight: '500',
                                background: 'var(--bg-main)', color: 'var(--text-muted)',
                                border: '1px solid var(--border-color)',
                                padding: '1px 5px', borderRadius: '4px', opacity: 0.8
                              }}>
                                {code}
                              </span>
                            ))}
                            {otherEnrolledCodes.length > 4 && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                +{otherEnrolledCodes.length - 4} more
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No subjects enrolled yet
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }}
              />

              {/* Section-Specific Subject Assignment Matrix */}
              {formData.assignedSections && formData.assignedSections.length > 0 && formData.specialization && formData.specialization.length > 0 && (
                <div style={{
                  marginTop: '16px',
                  padding: '14px',
                  background: 'var(--bg-main, #f8fafc)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main, #1e293b)' }}>
                      Subjects Taught for Each Assigned Section:
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)' }}>
                      Click to choose which subject(s) this faculty member teaches
                    </span>
                  </div>

                  {formData.assignedSections.map(secId => {
                    const sec = sections.find(s => s.id === secId || s.name === secId) || { id: secId, name: secId };
                    const selectedSubsForSec = sectionSubjectMap[sec.id] || [];
                    const specSubjects = (formData.specialization || []).map(specId => {
                      return subjects.find(s => s.id === specId || s.code === specId || s.name === specId) || { id: specId, code: specId, name: specId };
                    });

                    return (
                      <div key={sec.id} style={{
                        padding: '10px 14px',
                        background: 'var(--bg-surface, #ffffff)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--accent-dark, #0f172a)' }}>
                            {sec.name}
                          </span>
                          {selectedSubsForSec.length === 0 ? (
                            <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: '600' }}>
                              ⚠️ Must assign at least 1 subject
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: '600' }}>
                              {selectedSubsForSec.length} subject(s) selected
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {specSubjects.map(sub => {
                            const subKey = sub.code || sub.id;
                            const isChecked = selectedSubsForSec.includes(subKey) || selectedSubsForSec.includes(sub.id) || selectedSubsForSec.includes(sub.code);
                            const isAlreadyEnrolled = (sec.subjects || []).some(s => s === sub.id || s === sub.code || s === sub.name);

                            return (
                              <button
                                key={sub.id || sub.code}
                                type="button"
                                onClick={() => handleToggleSubjectForSection(sec.id, subKey)}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '16px',
                                  fontSize: '0.78rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  border: isChecked ? '1px solid var(--accent-primary, #5645ee)' : '1px solid var(--border-color, #cbd5e1)',
                                  background: isChecked ? 'rgba(86, 69, 238, 0.12)' : 'var(--bg-main, #f8fafc)',
                                  color: isChecked ? 'var(--accent-primary, #5645ee)' : 'var(--text-muted, #64748b)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  transition: 'all 0.15s'
                                }}
                              >
                                <span>{isChecked ? '✓' : '+'}</span>
                                <span>{sub.code || sub.name}</span>
                                {isChecked && !isAlreadyEnrolled && (
                                  <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '6px', background: 'rgba(234, 179, 8, 0.2)', color: '#b45309' }}>
                                    Auto-enrolls
                                  </span>
                                )}
                                {isChecked && isAlreadyEnrolled && (
                                  <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669' }}>
                                    Enrolled
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mgmt-modal-actions">
              <button className="mgmt-cancel-btn" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
              <button className="btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Faculty'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Create Modal */}
      <QuickCreateModal
        isOpen={quickCreateState.isOpen}
        type={quickCreateState.type}
        onClose={() => setQuickCreateState({ isOpen: false, type: 'subject' })}
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

export default FacultyManagement;