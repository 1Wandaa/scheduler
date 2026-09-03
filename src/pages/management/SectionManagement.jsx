import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { deleteSectionCascade } from '../../services/cascadeDeleteService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { DEPARTMENTS, PROGRAM_DEPARTMENTS, getDeptColor } from '../../config/constants';
import SectionTable from '../../components/SectionTable/SectionTable';
import SubjectSelector from '../../components/SubjectSelector/SubjectSelector';
import QuickCreateModal from '../../components/QuickCreateModal/QuickCreateModal';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

const SectionManagement = ({ sections, professors, schedules, subjects, activeSemester, departments = [], courses = [], user, onBack, onNavigateToHub }) => {
  const { confirm } = useGlobalDialog();
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Map of subjectIdOrCode -> assigned professorId
  const [subjectInstructorMap, setSubjectInstructorMap] = useState({});
  const [quickCreateState, setQuickCreateState] = useState({ isOpen: false, type: 'subject' });

  const [formData, setFormData] = useState({
    id: '', name: '', program: '', yearLevel: 1, subjects: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', program: '', yearLevel: 1, subjects: [] });
    setSubjectInstructorMap({});
    setEditMode(false);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (section) => {
    setFormData({ ...section });
    setCurrentId(section.id);

    // Initialize instructors assigned to this section's subjects
    const initialMap = { ...(section.subjectInstructors || {}) };
    (section.subjects || []).forEach(subRef => {
      const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef };
      const subKey = sub.code || sub.id;

      // If not already in subjectInstructors, fallback to professor's sectionSubjectMap or specialization
      if (!initialMap[subRef] && !initialMap[subKey] && !initialMap[sub.id]) {
        const assignedProf = professors.find(p => {
          const hasSection = (p.assignedSections || []).includes(section.id) || (p.assignedSections || []).includes(section.name);
          if (!hasSection) return false;
          if (p.sectionSubjectMap && (p.sectionSubjectMap[section.id] || p.sectionSubjectMap[section.name])) {
            const mappedSubs = p.sectionSubjectMap[section.id] || p.sectionSubjectMap[section.name] || [];
            return mappedSubs.some(s => s === sub.id || s === sub.code || s === sub.name);
          }
          return (p.specialization || []).some(sp => sp === sub.id || sp === sub.code || sp === sub.name);
        });
        if (assignedProf) {
          initialMap[subRef] = assignedProf.id;
        }
      }
    });
    setSubjectInstructorMap(initialMap);

    setEditMode(true);
    setError(null);
    setShowModal(true);
  };

  const handleQuickCreateSuccess = (newItem, type) => {
    if (type === 'subject') {
      setFormData(prev => ({
        ...prev,
        subjects: [...(prev.subjects || []), newItem.id]
      }));
    } else if (type === 'faculty') {
      toast.info(`Faculty ${newItem.name} added! You can now assign them to enrolled subjects.`);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!formData.name || !formData.program) {
      setError("Section name and program are required.");
      return;
    }

    const normalize = str => (str || '').replace(/\s+/g, '').toUpperCase();
    const isDuplicate = sections.some(s => s.id !== currentId && normalize(s.name) === normalize(formData.name));

    if (isDuplicate) {
      setError(`A section named "${formData.name}" already exists.`);
      return;
    }

    if (!formData.subjects || formData.subjects.length === 0) {
      const isConfirmed = await confirm({
        title: 'No Subjects Enrolled',
        text: 'Are you sure you want to create a section with no subjects?',
        icon: 'warning',
        confirmButtonText: 'Yes, save it'
      });
      if (!isConfirmed) return;
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const secId = currentId || formData.id || `SEC${Date.now().toString().slice(-4)}`;
      const secPayload = { 
        ...formData, 
        id: secId,
        subjectInstructors: subjectInstructorMap || {}
      };

      if (editMode) {
        batch.update(doc(db, 'sections', currentId.toString()), secPayload);
        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_SECTION,
          details: `Updated section: ${formData.name} (${formData.program})`
        });
      } else {
        const newDocRef = doc(collection(db, 'sections'));
        batch.set(newDocRef, secPayload);
        logActivity({
          user,
          action: LOG_ACTIONS.ADD_SECTION,
          details: `Added new section: ${formData.name} (${formData.program}) with ${formData.subjects?.length || 0} enrolled subjects`
        });
      }

      // Sync professors assigned to this section's subjects
      // 1. Group by professor: profId -> list of subject codes/ids
      const assignedProfMap = {};
      Object.entries(subjectInstructorMap).forEach(([subRef, pId]) => {
        if (pId && (formData.subjects || []).includes(subRef)) {
          if (!assignedProfMap[pId]) assignedProfMap[pId] = [];
          assignedProfMap[pId].push(subRef);
        }
      });

      // 2. Add section and subject to assigned professors
      Object.entries(assignedProfMap).forEach(([pId, subRefs]) => {
        const prof = professors.find(p => p.id === pId);
        if (prof) {
          const currentSecs = prof.assignedSections || [];
          const updatedSecs = currentSecs.includes(secId) || (formData.name && currentSecs.includes(formData.name))
            ? currentSecs
            : [...currentSecs, secId];

          const currentSpecs = prof.specialization || [];
          let updatedSpecs = [...currentSpecs];
          subRefs.forEach(subRef => {
            const subObj = subjects.find(s => s.id === subRef || s.code === subRef);
            const codeOrId = subObj?.code || subObj?.id || subRef;
            if (!updatedSpecs.includes(codeOrId) && (!subObj || !updatedSpecs.includes(subObj.id))) {
              updatedSpecs.push(codeOrId);
            }
          });

          batch.update(doc(db, 'professors', String(prof.id)), {
            assignedSections: updatedSecs,
            specialization: updatedSpecs
          });
        }
      });

      // 3. For professors who were previously assigned to this section but are no longer assigned to any subject here
      if (editMode) {
        professors.forEach(prof => {
          const hadSec = (prof.assignedSections || []).includes(currentId) || (prof.assignedSections || []).includes(formData.name);
          if (hadSec && !assignedProfMap[prof.id]) {
            const newSecs = (prof.assignedSections || []).filter(s => s !== currentId && s !== formData.name);
            batch.update(doc(db, 'professors', String(prof.id)), {
              assignedSections: newSecs
            });
          }
        });
      }

      await batch.commit();
      setShowModal(false);
      toast.success(`Section ${formData.name} saved successfully!`);
    } catch (err) {
      console.error("Error saving section:", err);
      setError("Failed to save section. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Section?',
      text: "This action cannot be undone. Proceed?",
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });

    if (isConfirmed) {
      try {
        const sectionToDelete = sections.find(s => String(s.id) === String(id));
        await deleteSectionCascade(sectionToDelete, professors, schedules);
        logActivity({
          user,
          action: LOG_ACTIONS.DELETE_SECTION,
          details: `Deleted section: ${sectionToDelete?.name || id} (${sectionToDelete?.program || 'Section'})`
        });
        toast.success('Section deleted successfully');
      } catch (err) {
        console.error("Error deleting section:", err);
        toast.error('Failed to delete section');
      }
    }
  };

  const handleSubjectToggle = (subjectId) => {
    setFormData(prev => {
      const current = prev.subjects || [];
      if (subjectId === 'CLEAR_ALL') {
        return { ...prev, subjects: [] };
      }

      if (Array.isArray(subjectId)) {
        const targetTokens = subjectId.flatMap(id => {
          const sObj = subjects.find(s => s.id === id || s.code === id || s.name === id);
          return sObj ? [sObj.id, sObj.code, sObj.name].filter(Boolean) : [id];
        });

        const allPresent = subjectId.every(id => {
          const sObj = subjects.find(s => s.id === id || s.code === id || s.name === id);
          const tokens = sObj ? [sObj.id, sObj.code, sObj.name].filter(Boolean) : [id];
          return current.some(c => tokens.includes(c));
        });

        if (allPresent) {
          return { ...prev, subjects: current.filter(c => !targetTokens.includes(c)) };
        } else {
          const toAdd = [];
          subjectId.forEach(id => {
            const sObj = subjects.find(s => s.id === id || s.code === id || s.name === id);
            const tokens = sObj ? [sObj.id, sObj.code, sObj.name].filter(Boolean) : [id];
            if (!current.some(c => tokens.includes(c))) {
              toAdd.push(sObj?.id || id);
            }
          });
          return { ...prev, subjects: [...current, ...toAdd] };
        }
      }

      const subObj = subjects.find(s => s.id === subjectId || s.code === subjectId || s.name === subjectId);
      const tokens = subObj ? [subObj.id, subObj.code, subObj.name].filter(Boolean) : [subjectId];
      const isPresent = current.some(c => tokens.includes(c));

      if (isPresent) {
        return { ...prev, subjects: current.filter(c => !tokens.includes(c)) };
      } else {
        return { ...prev, subjects: [...current, subObj?.id || subjectId] };
      }
    });
  };

  const orphanSubjects = useMemo(() => {
    const currentSubjs = formData.subjects || [];
    return currentSubjs.filter(subRef => {
      const found = subjects.some(s => 
        String(s.id).toLowerCase() === String(subRef).toLowerCase() || 
        String(s.code).toLowerCase() === String(subRef).toLowerCase() || 
        String(s.name).toLowerCase() === String(subRef).toLowerCase()
      );
      return !found;
    });
  }, [formData.subjects, subjects]);

  const handleRemoveOrphanSubjects = () => {
    const toClean = [...orphanSubjects];
    setFormData(prev => ({
      ...prev,
      subjects: (prev.subjects || []).filter(s => !toClean.includes(s))
    }));
    toast.success(`Removed legacy subject(s): ${toClean.join(', ')}`);
  };

  const handleAutoAssignTeachers = () => {
    const nextMap = { ...subjectInstructorMap };
    let countAssigned = 0;

    (formData.subjects || []).forEach(subRef => {
      if (!nextMap[subRef]) {
        const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef);
        // Find professors who specialize in this subject
        const matchingProfs = professors.filter(p => {
          return sub && (p.specialization || []).some(sp => sp === sub.id || sp === sub.code || sp === sub.name);
        });

        if (matchingProfs.length > 0) {
          // Sort by lowest current section load
          const bestProf = [...matchingProfs].sort((a, b) => {
            const loadA = (a.assignedSections || []).length;
            const loadB = (b.assignedSections || []).length;
            return loadA - loadB;
          })[0];

          nextMap[subRef] = bestProf.id;
          countAssigned++;
        }
      }
    });

    setSubjectInstructorMap(nextMap);
    if (countAssigned > 0) {
      toast.success(`⚡ Automatically assigned specialized instructors for ${countAssigned} subject(s)!`);
    } else {
      toast.info("All enrolled subjects already have instructors or no specialized faculty were found.");
    }
  };

  // Filter sections globally via useMemo for performance
  const filteredSections = useMemo(() => {
    return sections
      .filter(sec => sec.name.toLowerCase().includes(searchQuery.toLowerCase()) || sec.program.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (a.yearLevel !== b.yearLevel) return a.yearLevel - b.yearLevel;
        return a.name.localeCompare(b.name);
      });
  }, [sections, searchQuery]);

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
                <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                Section Management
              </h3>
              <p>Manage student sections and their enrolled subjects</p>
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
            <button className="btn" onClick={handleOpenAdd}>+ Add Section</button>
          </div>
        </div>

        {/* Department Filter and Search Bar */}
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
          </div>
          <div className="mgmt-search-wrapper">
            <span className="mgmt-search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input
              type="text"
              className="mgmt-search-input"
              placeholder="Search section name or program..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Render sections grouped by their Department */}
        {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => {
          if (departmentFilter !== 'All' && departmentFilter !== dept) return null;

          const isDeptSection = (sec) => {
            if (sec.program === dept) return true; // Direct match
            // Try matching course
            const course = courses.find(c => c.code === sec.program || c.id === sec.program);
            if (course && course.departmentId === dept) return true;
            // Fallback to legacy
            if (PROGRAM_DEPARTMENTS[sec.program] === dept) return true;
            return false;
          };

          const deptSections = filteredSections.filter(isDeptSection);
          const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);

          return (
            <SectionTable
              key={dept}
              sectionList={deptSections}
              title={`${dept} Sections`}
              titleColor={deptColor}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
              subjects={subjects}
              professors={professors}
              departments={departments}
              courses={courses}
            />
          );
        })}

        {/* Render any sections that do not match the standard program list */}
        {(departmentFilter === 'All') && (
          <SectionTable
            sectionList={filteredSections.filter(sec => {
              const allDepts = departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS;
              const hasCourseMatch = courses.some(c => c.code === sec.program || c.id === sec.program);
              return !hasCourseMatch && !allDepts.includes(sec.program) && !allDepts.includes(PROGRAM_DEPARTMENTS[sec.program]);
            })}
            title="Other / Unassigned Sections"
            titleColor="var(--text-muted)"
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            subjects={subjects}
            professors={professors}
            departments={departments}
            courses={courses}
          />
        )}

        {sections.length === 0 && (
          <div className="mgmt-empty-state">
            <h4>No sections yet</h4>
            <p>Add sections to enable the Auto-Scheduler</p>
          </div>
        )}
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
                {editMode ? 'Edit Section' : 'Add New Section'}
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
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                Section Name
              </label>
              <input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Enter section name" />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                Program
              </label>
              <select className="form-select" value={formData.program} onChange={e => setFormData({ ...formData, program: e.target.value })} style={{ color: !formData.program ? '#757575' : 'inherit' }}>
                <option value="" disabled hidden>Select Program / Department</option>
                {courses.length > 0 ? courses.map(c => (
                  <option key={c.id} value={c.code} style={{ color: '#000' }}>{c.code} ({c.title})</option>
                )) : (departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => (
                  <option key={dept} value={dept} style={{ color: '#000' }}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                Year Level
              </label>
              <select className="form-select" value={formData.yearLevel} onChange={e => setFormData({ ...formData, yearLevel: parseInt(e.target.value) })}>
                <option value={1}>1st Year</option>
                <option value={2}>2nd Year</option>
                <option value={3}>3rd Year</option>
                <option value={4}>4th Year</option>
              </select>
            </div>

            {/* Unmatched / Legacy Subjects Alert Banner */}
            {orphanSubjects.length > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1.5px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '14px',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <div style={{ fontSize: '0.82rem', color: '#b91c1c' }}>
                  <strong>⚠️ Legacy / Unmatched Subject(s) Detected:</strong>{' '}
                  <span style={{ fontWeight: 700 }}>{orphanSubjects.join(', ')}</span>
                  <div style={{ fontSize: '0.74rem', opacity: 0.85, marginTop: '2px' }}>
                    These subject references exist in this section but are not in your active subjects list. Click to remove them.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveOrphanSubjects}
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)'
                  }}
                >
                  🗑️ Remove {orphanSubjects.join(', ')}
                </button>
              </div>
            )}

            <SubjectSelector
              subjects={subjects}
              activeSemester={activeSemester}
              selectedSubjects={formData.subjects}
              departments={departments}
              onToggleSubject={handleSubjectToggle}
              recommendedDepartment={formData.program}
              yearLevel={formData.yearLevel}
              contextType="section"
              label="Enrolled Subjects"
              onQuickAdd={() => setQuickCreateState({ isOpen: true, type: 'subject' })}
            />

            {/* Subject-Specific Instructor Assignment */}
            {formData.subjects && formData.subjects.length > 0 && (
              <div style={{
                marginTop: '14px',
                marginBottom: '20px',
                padding: '14px',
                background: 'var(--bg-main, #f8fafc)',
                borderRadius: '10px',
                border: '1px solid var(--border-color, #e2e8f0)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main, #1e293b)' }}>
                    Assign Faculty Instructors to Enrolled Subjects:
                  </span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={handleAutoAssignTeachers}
                      style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                      }}
                      title="Automatically match specialized instructors with lowest workload"
                    >
                      ⚡ Auto-Assign Teachers
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickCreateState({ isOpen: true, type: 'faculty' })}
                      style={{
                        background: 'rgba(86, 69, 238, 0.1)',
                        border: '1px solid rgba(86, 69, 238, 0.3)',
                        color: 'var(--accent-primary, #5645ee)',
                        borderRadius: '6px',
                        padding: '4px 8px',
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
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {formData.subjects.map(subRef => {
                    const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef, name: subRef };
                    const currentProfId = subjectInstructorMap[subRef] || '';

                    // Prioritize professors specialized in this subject
                    const specProfs = professors.filter(p => (p.specialization || []).some(sp => sp === sub.id || sp === sub.code || sp === sub.name));

                    return (
                      <div key={subRef} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '8px 12px',
                        background: 'var(--bg-surface, #ffffff)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: '120px' }}>
                          <span style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--accent-dark, #0f172a)' }}>{sub.code}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>{sub.name}</span>
                        </div>

                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <select
                            className="form-select"
                            style={{ padding: '6px 10px', fontSize: '0.82rem', width: '100%', margin: 0 }}
                            value={currentProfId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSubjectInstructorMap(prev => ({
                                ...prev,
                                [subRef]: val
                              }));
                            }}
                          >
                            <option value="">No Instructor Assigned</option>
                            {specProfs.length > 0 && (
                              <optgroup label="Specialized in this subject">
                                {specProfs.map(p => (
                                  <option key={p.id} value={p.id}>
                                    ✨ {p.name || `${p.lastName}, ${p.firstName}`} ({p.department})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="All Faculty Members">
                              {professors.filter(p => !specProfs.some(sp => sp.id === p.id)).map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name || `${p.lastName}, ${p.firstName}`} ({p.department})
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mgmt-modal-actions">
              <button className="mgmt-cancel-btn" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
              <button className="btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Section'}
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

export default SectionManagement;