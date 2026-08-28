import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { deleteFacultyCascade } from '../../services/cascadeDeleteService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { DEPARTMENTS, getDeptColor } from '../../config/constants';
import FacultyTable from '../../components/FacultyTable/FacultyTable';
import SubjectSelector from '../../components/SubjectSelector/SubjectSelector';
import AutocompleteMultiSelect from '../../components/AutocompleteMultiSelect/AutocompleteMultiSelect';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

const FacultyManagement = ({ professors, subjects = [], rooms = [], sections = [], schedules = [], activeSemester, departments = [], onBack, user }) => {
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

  const [formData, setFormData] = useState({
    id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, specialization: [], preferredRooms: [], assignedSections: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, specialization: [], preferredRooms: [], assignedSections: [] });
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
    // SubjectSelector only passes the subjectId
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;

    setFormData(prev => {
      const current = prev.specialization || [];
      const isChecked = current.includes(subject.id) || current.includes(subject.code) || current.includes(subject.name);
      const newSpecialization = isChecked
        ? current.filter(s => s !== subject.id && s !== subject.code && s !== subject.name)
        : [...current, subject.id];

      // Auto-prune any assigned sections that are no longer enrolled in any of the remaining subjects
      const updatedSections = (prev.assignedSections || []).filter(secId => {
        const sec = sections.find(s => s.id === secId || s.name === secId);
        if (!sec) return false;
        return getFacultyMatchingSubjectsForSection(sec, newSpecialization).length > 0;
      });

      return {
        ...prev,
        specialization: newSpecialization,
        assignedSections: updatedSections
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
      return;
    }

    const assignedSubjectIds = formData.specialization || [];
    if (assignedSubjectIds.length === 0) {
      toast.warning("Please select the faculty's Assigned Subjects first before assigning sections.");
      return;
    }

    const matching = getFacultyMatchingSubjectsForSection(sec, assignedSubjectIds);
    if (matching.length === 0) {
      toast.error(`Cannot assign ${sec.name}: This section is not enrolled in any of the faculty's assigned subjects.`);
      return;
    }

    setFormData(prev => ({
      ...prev,
      assignedSections: [...(prev.assignedSections || []), sec.id]
    }));
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

    setFormData({
      ...prof,
      firstName: fName,
      lastName: lName,
      preferredRooms: prof.preferredRooms || [],
      assignedSections: prof.assignedSections || []
    });
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

      const invalidSections = formData.assignedSections.filter(secId => {
        const sec = sections.find(s => s.id === secId || s.name === secId);
        if (!sec) return false;
        return getFacultyMatchingSubjectsForSection(sec, formData.specialization).length === 0;
      });

      if (invalidSections.length > 0) {
        const names = invalidSections.map(secId => {
          const sec = sections.find(s => s.id === secId || s.name === secId);
          return sec ? sec.name : secId;
        }).join(', ');
        setError(`Cannot save: The section(s) [${names}] are not enrolled in any of the faculty's assigned subjects.`);
        return;
      }
    }

    const dataToSave = { ...formData, name: combinedName };

    setIsSaving(true);
    try {
      if (editMode) {
        await updateDoc(doc(db, 'professors', currentId.toString()), dataToSave);
        logActivity({ user, action: LOG_ACTIONS.UPDATE_FACULTY, details: `Updated faculty: ${combinedName}` });
      } else {
        const newId = formData.id || `P${Date.now().toString().slice(-4)}`;
        await addDoc(collection(db, 'professors'), { ...dataToSave, id: newId });
        logActivity({ user, action: LOG_ACTIONS.ADD_FACULTY, details: `Added new faculty: ${combinedName} (${formData.department})` });
      }
      setShowModal(false);
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
        const isEligible = hasAssignedSubjects && matching.length > 0;
        const secDept = (sec.department || sec.program || '').toUpperCase();
        const isRecommended = isEligible && Boolean(profDept && (secDept.includes(profDept) || profDept.includes(secDept)));
        return {
          ...sec,
          allEnrolled,
          matchingSubjects: matching,
          disabled: !isEligible,
          isRecommended,
          disabledReason: !hasAssignedSubjects
            ? 'Select assigned subjects first'
            : 'Section is not enrolled in any of the faculty’s assigned subjects'
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
            <button className="btn" onClick={handleOpenAdd}>+ Add Faculty</button>
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
            <div className="form-group"><label className="form-label">Faculty ID</label><input className="form-input" value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} disabled={editMode} placeholder="e.g. P001" /></div>

            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Last Name (Surname)</label>
                <input className="form-input" value={formData.lastName || ''} onChange={e => setFormData({ ...formData, lastName: e.target.value })} placeholder="e.g. Dela Cruz" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">First Name</label>
                <input className="form-input" value={formData.firstName || ''} onChange={e => setFormData({ ...formData, firstName: e.target.value })} placeholder="e.g. Juan" />
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
                {formData.specialization && formData.specialization.length > 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
                    {filteredSections.filter(s => !s.disabled).length} eligible section(s)
                  </span>
                )}
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
                  const matching = getFacultyMatchingSubjectsForSection(sec, formData.specialization || []);
                  const matchingLabel = matching.map(s => s.code || s.name).join(', ');

                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '4px 10px', borderRadius: '16px',
                      background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)',
                      fontSize: '0.8rem', fontWeight: '600', color: '#10b981'
                    }}>
                      <span>{sec.name}</span>
                      {matchingLabel && (
                        <span style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: '500', color: '#047857' }}>
                          ({matchingLabel})
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
                        {!isEligible ? (
                          <span style={{ fontSize: '0.7rem', color: '#ef4444', background: '#fee2e2', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                            Not Enrolled
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                            {matchingCodes.length} Matching Subject(s)
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
                            No subjects enrolled
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
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
    </>
  );
};

export default FacultyManagement;