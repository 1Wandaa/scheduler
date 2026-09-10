import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { deleteFacultyCascade, deleteFacultyBatchCascade } from '../../services/cascadeDeleteService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { DEPARTMENTS, getDeptColor } from '../../config/constants';
import FacultyTable from '../../components/FacultyTable/FacultyTable';
import BatchActionBar from '../../components/common/BatchActionBar';
import AutocompleteMultiSelect from '../../components/AutocompleteMultiSelect/AutocompleteMultiSelect';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';
import { getColorNameAndCode } from '../../utils/colorUtils';

const FacultyManagement = ({ professors, subjects = [], rooms = [], sections = [], schedules = [], activeSemester, departments = [], courses = [], onBack, user, onNavigateToHub }) => {
  const { confirm } = useGlobalDialog();
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);


  const [formData, setFormData] = useState({
    id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, preferredRooms: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, preferredRooms: [] });
    setEditMode(false);
    setError(null);
    setShowModal(true);
  };





  const handleRoomToggle = (room) => {
    const roomId = typeof room === 'object' && room !== null ? (room.id || room.name) : room;
    const roomName = typeof room === 'object' && room !== null ? room.name : null;
    const tokens = [roomId, roomName].filter(Boolean).map(t => String(t).toLowerCase());

    setFormData(prev => {
      const current = prev.preferredRooms || [];
      const isChecked = current.some(r => tokens.includes(String(r).toLowerCase()));
      if (isChecked) {
        return { ...prev, preferredRooms: current.filter(r => !tokens.includes(String(r).toLowerCase())) };
      } else {
        return { ...prev, preferredRooms: [...current, roomId] };
      }
    });
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
      preferredRooms: prof.preferredRooms || []
    });
    setCurrentId(prof.id);
    setEditMode(true);
    setError(null);
    setShowModal(true);
  };

  const normalizeFacultyName = (name) => {
    if (!name) return '';
    let clean = name.replace(/Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Engr\.|Atty\./gi, '');
    return clean.replace(/[^a-z]/gi, '').toLowerCase();
  };

  const fNameTrim = (formData.firstName || '').trim();
  const lNameTrim = (formData.lastName || '').trim();
  const combinedName = `${lNameTrim}, ${fNameTrim}`;
  const newNameNormalized = normalizeFacultyName(fNameTrim + lNameTrim);

  const isNameDuplicate = Boolean(fNameTrim && lNameTrim) && professors.some(p =>
    p.id !== currentId &&
    normalizeFacultyName(p.name || `${p.firstName || ''} ${p.lastName || ''}`) === newNameNormalized
  );

  const handleSave = async () => {
    setError(null);
    if (!fNameTrim || !lNameTrim) {
      setError("First and last names are required.");
      return;
    }

    if (isNameDuplicate) {
      setError(`A faculty member named "${combinedName}" already exists!`);
      return;
    }

    const dataToSave = { 
      ...formData, 
      firstName: fNameTrim,
      lastName: lNameTrim,
      name: combinedName
    };

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const profId = (currentId || formData.id || `P${Date.now().toString().slice(-4)}`).toString();

      if (editMode) {
        batch.update(doc(db, 'professors', currentId.toString()), dataToSave);
        logActivity({ user, action: LOG_ACTIONS.UPDATE_FACULTY, details: `Updated faculty: ${combinedName}` });
      } else {
        const newDocRef = doc(db, 'professors', profId);
        batch.set(newDocRef, { ...dataToSave, id: profId });
        logActivity({ user, action: LOG_ACTIONS.ADD_FACULTY, details: `Added new faculty: ${combinedName} (${formData.department})` });
      }

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
        setSelectedIds(prev => prev.filter(item => item !== id));
        logActivity({ user, action: LOG_ACTIONS.DELETE_FACULTY, details: `Deleted faculty: ${prof?.name || id}` });
        toast.success('Faculty deleted successfully');
      } catch (err) {
        console.error("Error deleting faculty:", err);
        toast.error('Failed to delete faculty');
      }
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = (idsInView) => {
    const allInViewSelected = idsInView.length > 0 && idsInView.every(id => selectedIds.includes(id));
    if (allInViewSelected) {
      setSelectedIds(prev => prev.filter(id => !idsInView.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...idsInView])));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(filteredProfessors.map(p => p.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleExitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const handleDeleteSelected = async () => {
    const selectedInView = selectedIds.filter(id => filteredProfessors.some(p => p.id === id));
    if (selectedInView.length === 0) return;
    const count = selectedInView.length;

    const isConfirmed = await confirm({
      title: `Delete ${count} Faculty Member${count > 1 ? 's' : ''}?`,
      text: `Are you sure you want to delete ${count} selected faculty member${count > 1 ? 's' : ''}? Their assigned schedules will be removed and records moved to the Recycle Bin.`,
      icon: 'warning',
      confirmButtonText: `Delete ${count} Selected`,
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting ${count} faculty member${count > 1 ? 's' : ''}...`);
      try {
        const profsToDelete = professors.filter(p => selectedInView.includes(p.id));
        await deleteFacultyBatchCascade(profsToDelete, schedules);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_FACULTY,
          details: `Batch deleted ${count} faculty: ${profsToDelete.map(p => p.name || p.id).join(', ')}`
        });
        toast.success(`Successfully deleted ${count} faculty member${count > 1 ? 's' : ''}`, { id: toastId });
        setSelectedIds(prev => prev.filter(id => !selectedInView.includes(id)));
      } catch (err) {
        console.error("Error batch deleting faculty:", err);
        toast.error('Failed to delete selected faculty', { id: toastId });
      }
    }
  };

  const handleDeleteAll = async () => {
    const count = filteredProfessors.length;
    if (count === 0) return;

    const isConfirmed = await confirm({
      title: `Delete All ${count} Faculty Members?`,
      text: `Are you sure you want to delete ALL ${count} faculty members in this view? Their assigned schedules will be removed and records moved to the Recycle Bin.`,
      icon: 'warning',
      confirmButtonText: 'Delete All',
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting all ${count} faculty members...`);
      try {
        await deleteFacultyBatchCascade(filteredProfessors, schedules);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_FACULTY,
          details: `Deleted all ${count} faculty in view (${departmentFilter})`
        });
        toast.success(`Successfully deleted all ${count} faculty members`, { id: toastId });
        setSelectedIds([]);
      } catch (err) {
        console.error("Error deleting all faculty:", err);
        toast.error('Failed to delete faculty', { id: toastId });
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
              <button
                className={`select-mode-btn${selectionMode ? ' active' : ''}`}
                onClick={() => selectionMode ? handleExitSelectionMode() : setSelectionMode(true)}
                title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                {selectionMode ? 'Cancel' : 'Select'}
              </button>
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

        {selectionMode && (
          <BatchActionBar
            selectedCount={selectedIds.filter(id => filteredProfessors.some(p => p.id === id)).length}
            totalCount={filteredProfessors.length}
            itemName="faculty"
            onSelectAll={handleSelectAllFiltered}
            onDeselectAll={handleDeselectAll}
            onDeleteSelected={handleDeleteSelected}
            onDeleteAll={handleDeleteAll}
            onExitSelectionMode={handleExitSelectionMode}
          />
        )}

        <FacultyTable
          facultyList={filteredProfessors}
          subjects={subjects}
          schedules={schedules}
          departments={departments}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          selectedIds={selectionMode ? selectedIds : []}
          onToggleSelect={selectionMode ? handleToggleSelect : undefined}
          onToggleSelectAll={selectionMode ? handleToggleSelectAll : undefined}
        />
      </div>

      {showModal && (
        <div className="modal-overlay">
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
                <input className={`form-input${isNameDuplicate ? ' mgmt-input-duplicate' : ''}`} value={formData.lastName || ''} onChange={e => setFormData({ ...formData, lastName: e.target.value })} placeholder="Last name" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">First Name</label>
                <input className={`form-input${isNameDuplicate ? ' mgmt-input-duplicate' : ''}`} value={formData.firstName || ''} onChange={e => setFormData({ ...formData, firstName: e.target.value })} placeholder="First name" />
              </div>
            </div>
            {isNameDuplicate && (
              <div className="mgmt-field-duplicate-msg" style={{ marginTop: '-8px', marginBottom: '16px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                Already exists: A faculty member named "{combinedName}" is already registered.
              </div>
            )}

            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Department</label>
                <select className="form-select" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })}>
                  {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(deptId => {
                    const deptObj = departments.find(d => d.id === deptId);
                    const colorHex = deptObj?.color || getDeptColor(deptId);
                    const colorInfo = getColorNameAndCode(colorHex);
                    return (
                      <option key={deptId} value={deptId}>
                        {deptId} — {colorInfo.name} ({colorInfo.hex})
                      </option>
                    );
                  })}
                </select>
                {(() => {
                  const deptObj = departments.find(d => d.id === formData.department);
                  const colorHex = deptObj?.color || getDeptColor(formData.department);
                  const colorInfo = getColorNameAndCode(colorHex);
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      marginTop: '6px', padding: '4px 10px', borderRadius: '6px',
                      background: `${colorInfo.hex}15`, border: `1px solid ${colorInfo.hex}40`
                    }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: colorInfo.hex, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }}></div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>{colorInfo.name}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 700, marginLeft: 'auto' }}>{colorInfo.hex}</span>
                    </div>
                  );
                })()}
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