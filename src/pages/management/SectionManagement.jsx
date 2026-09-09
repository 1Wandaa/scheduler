import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { deleteSectionCascade, deleteSectionBatchCascade } from '../../services/cascadeDeleteService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { DEPARTMENTS, PROGRAM_DEPARTMENTS, getDeptColor } from '../../config/constants';
import SectionTable from '../../components/SectionTable/SectionTable';
import BatchActionBar from '../../components/common/BatchActionBar';
import SubjectSelector from '../../components/SubjectSelector/SubjectSelector';
import QuickCreateModal from '../../components/QuickCreateModal/QuickCreateModal';
import CustomSelect from '../../components/CustomSelect/CustomSelect';
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
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);


  const [formData, setFormData] = useState({
    id: '', name: '', program: '', yearLevel: 1, subjects: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', program: '', yearLevel: 1 });
    setEditMode(false);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (section) => {
    setFormData({ ...section });
    setCurrentId(section.id);

    setEditMode(true);
    setError(null);
    setShowModal(true);
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



    const secPayload = {
      id: currentId || formData.id || `SEC${Date.now().toString().slice(-4)}`,
      name: formData.name.trim(),
      program: formData.program,
      yearLevel: formData.yearLevel || 1,
      subjects: formData.subjects || [],
    };

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const secId = secPayload.id;
      if (editMode) {
        batch.update(doc(db, 'sections', currentId.toString()), secPayload);
        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_SECTION,
          details: `Updated section: ${formData.name} (${formData.program})`
        });
      } else {
        const newDocRef = doc(db, 'sections', secId);
        batch.set(newDocRef, secPayload);
        logActivity({
          user,
          action: LOG_ACTIONS.ADD_SECTION,
          details: `Added new section: ${formData.name} (${formData.program})`
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
        setSelectedIds(prev => prev.filter(item => item !== id));
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
    setSelectedIds(filteredSections.map(s => s.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleExitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const handleDeleteSelected = async () => {
    const selectedInView = selectedIds.filter(id => filteredSections.some(s => s.id === id));
    if (selectedInView.length === 0) return;
    const count = selectedInView.length;

    const isConfirmed = await confirm({
      title: `Delete ${count} Section${count > 1 ? 's' : ''}?`,
      text: `Are you sure you want to delete ${count} selected section${count > 1 ? 's' : ''}? Their assigned schedules will be removed and records moved to the Recycle Bin.`,
      icon: 'warning',
      confirmButtonText: `Delete ${count} Selected`,
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting ${count} section${count > 1 ? 's' : ''}...`);
      try {
        const sectionsToDelete = sections.filter(s => selectedInView.includes(s.id));
        await deleteSectionBatchCascade(sectionsToDelete, professors, schedules);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_SECTIONS,
          details: `Batch deleted ${count} sections: ${sectionsToDelete.map(s => s.name || s.id).join(', ')}`
        });
        toast.success(`Successfully deleted ${count} section${count > 1 ? 's' : ''}`, { id: toastId });
        setSelectedIds(prev => prev.filter(id => !selectedInView.includes(id)));
      } catch (err) {
        console.error("Error batch deleting sections:", err);
        toast.error('Failed to delete selected sections', { id: toastId });
      }
    }
  };

  const handleDeleteAll = async () => {
    const count = filteredSections.length;
    if (count === 0) return;

    const isConfirmed = await confirm({
      title: `Delete All ${count} Sections?`,
      text: `Are you sure you want to delete ALL ${count} sections in this view? Their assigned schedules will be removed and records moved to the Recycle Bin.`,
      icon: 'warning',
      confirmButtonText: 'Delete All',
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting all ${count} sections...`);
      try {
        await deleteSectionBatchCascade(filteredSections, professors, schedules);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_SECTIONS,
          details: `Deleted all ${count} sections in view (${departmentFilter})`
        });
        toast.success(`Successfully deleted all ${count} sections`, { id: toastId });
        setSelectedIds([]);
      } catch (err) {
        console.error("Error deleting all sections:", err);
        toast.error('Failed to delete sections', { id: toastId });
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
          const sObj = subjects.find(s => 
            String(s.id).toLowerCase() === String(id).toLowerCase() || 
            String(s.code).toLowerCase() === String(id).toLowerCase() || 
            String(s.name).toLowerCase() === String(id).toLowerCase()
          );
          return sObj ? [sObj.id, sObj.code, sObj.name].filter(Boolean) : [id];
        }).map(t => String(t).toLowerCase());

        const allPresent = subjectId.every(id => {
          const sObj = subjects.find(s => 
            String(s.id).toLowerCase() === String(id).toLowerCase() || 
            String(s.code).toLowerCase() === String(id).toLowerCase() || 
            String(s.name).toLowerCase() === String(id).toLowerCase()
          );
          const tokens = sObj ? [sObj.id, sObj.code, sObj.name].filter(Boolean) : [id];
          return current.some(c => tokens.map(t => String(t).toLowerCase()).includes(String(c).toLowerCase()));
        });

        if (allPresent) {
          return { ...prev, subjects: current.filter(c => !targetTokens.includes(String(c).toLowerCase())) };
        } else {
          const toAdd = [];
          subjectId.forEach(id => {
            const sObj = subjects.find(s => 
              String(s.id).toLowerCase() === String(id).toLowerCase() || 
              String(s.code).toLowerCase() === String(id).toLowerCase() || 
              String(s.name).toLowerCase() === String(id).toLowerCase()
            );
            const tokens = sObj ? [sObj.id, sObj.code, sObj.name].filter(Boolean) : [id];
            if (!current.some(c => tokens.map(t => String(t).toLowerCase()).includes(String(c).toLowerCase()))) {
              toAdd.push(sObj?.id || id);
            }
          });
          return { ...prev, subjects: [...current, ...toAdd] };
        }
      }

      const searchKey = typeof subjectId === 'object' && subjectId !== null
        ? (subjectId.id || subjectId.code || subjectId.name)
        : subjectId;

      const subObj = subjects.find(s => 
        String(s.id).toLowerCase() === String(searchKey).toLowerCase() || 
        String(s.code).toLowerCase() === String(searchKey).toLowerCase() || 
        String(s.name).toLowerCase() === String(searchKey).toLowerCase()
      );

      const tokensSet = new Set();
      if (typeof subjectId === 'object' && subjectId !== null) {
        if (subjectId.id) tokensSet.add(String(subjectId.id).toLowerCase());
        if (subjectId.code) tokensSet.add(String(subjectId.code).toLowerCase());
        if (subjectId.name) tokensSet.add(String(subjectId.name).toLowerCase());
      }
      if (subObj) {
        if (subObj.id) tokensSet.add(String(subObj.id).toLowerCase());
        if (subObj.code) tokensSet.add(String(subObj.code).toLowerCase());
        if (subObj.name) tokensSet.add(String(subObj.name).toLowerCase());
      }
      if (searchKey) tokensSet.add(String(searchKey).toLowerCase());

      const tokens = Array.from(tokensSet);
      const isPresent = current.some(c => tokens.includes(String(c).toLowerCase()));

      if (isPresent) {
        return { ...prev, subjects: current.filter(c => !tokens.includes(String(c).toLowerCase())) };
      } else {
        return { ...prev, subjects: [...current, subObj?.id || searchKey] };
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

  const handleNameChange = (e) => {
    const newName = e.target.value;
    const updates = { name: newName };

    // Auto-detect program/department from section name
    const programCodes = courses.length > 0 
      ? courses.map(c => c.code) 
      : (departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS);

    const sortedCodes = [...programCodes].sort((a, b) => b.length - a.length);
    const cleanName = newName.toUpperCase().replace(/[^A-Z0-9]/g, '');

    for (const code of sortedCodes) {
      const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanCode && cleanName.startsWith(cleanCode)) {
        updates.program = code;

        // Auto-detect year level: extract the first digit after the program code
        const afterCode = cleanName.slice(cleanCode.length);
        const yearMatch = afterCode.match(/^(\d)/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1], 10);
          if (year >= 1 && year <= 6) {
            updates.yearLevel = year;
          }
        }
        break;
      }
    }

    setFormData(prev => ({ ...prev, ...updates }));
  };

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
            <button
              className={`select-mode-btn${selectionMode ? ' active' : ''}`}
              onClick={() => selectionMode ? handleExitSelectionMode() : setSelectionMode(true)}
              title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              {selectionMode ? 'Cancel' : 'Select'}
            </button>
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

        {selectionMode && (
          <BatchActionBar
            selectedCount={selectedIds.filter(id => filteredSections.some(s => s.id === id)).length}
            totalCount={filteredSections.length}
            itemName="section"
            onSelectAll={handleSelectAllFiltered}
            onDeselectAll={handleDeselectAll}
            onDeleteSelected={handleDeleteSelected}
            onDeleteAll={handleDeleteAll}
            onExitSelectionMode={handleExitSelectionMode}
          />
        )}

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
              selectedIds={selectionMode ? selectedIds : []}
              onToggleSelect={selectionMode ? handleToggleSelect : undefined}
              onToggleSelectAll={selectionMode ? handleToggleSelectAll : undefined}
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
            selectedIds={selectionMode ? selectedIds : []}
            onToggleSelect={selectionMode ? handleToggleSelect : undefined}
            onToggleSelectAll={selectionMode ? handleToggleSelectAll : undefined}
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
              <input className="form-input" value={formData.name} onChange={handleNameChange} placeholder="Enter section name" />
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
            
            <div className="mgmt-modal-actions">
              <button className="mgmt-cancel-btn" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
              <button className="btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Section'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SectionManagement;