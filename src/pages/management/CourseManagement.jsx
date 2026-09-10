import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { deleteCourseBatch } from '../../services/cascadeDeleteService';
import BatchActionBar from '../../components/common/BatchActionBar';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';
import { getColorNameAndCode } from '../../utils/colorUtils';

const CourseManagement = ({ courses, departments, onBack, user }) => {
  const { confirm } = useGlobalDialog();
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);

  const [formData, setFormData] = useState({
    id: '',
    code: '',
    title: '',
    departmentId: '',
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', code: '', title: '', departmentId: departments.length > 0 ? departments[0].id : '' });
    setEditMode(false);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (course) => {
    setFormData({
      id: course.id,
      code: course.code || '',
      title: course.title || '',
      departmentId: course.departmentId || '',
    });
    setCurrentId(course.id);
    setEditMode(true);
    setError(null);
    setShowModal(true);
  };

  const trimmedId = (formData.id || '').trim();
  const trimmedCode = (formData.code || '').trim();
  const trimmedTitle = (formData.title || '').trim();

  const isIdDuplicate = !editMode && trimmedId && courses.some(c =>
    c.id && String(c.id).trim().toLowerCase() === trimmedId.toLowerCase()
  );

  const isCodeDuplicate = trimmedCode && courses.some(c =>
    (!editMode || c.id !== currentId) &&
    (c.code || '').trim().toLowerCase() === trimmedCode.toLowerCase()
  );

  const isTitleDuplicate = trimmedTitle && courses.some(c =>
    (!editMode || c.id !== currentId) &&
    (c.title || '').trim().toLowerCase() === trimmedTitle.toLowerCase()
  );

  const handleSave = async () => {
    setError(null);
    if (!trimmedCode) {
      setError('Course code is required.');
      return;
    }
    if (!trimmedTitle) {
      setError('Course title is required.');
      return;
    }
    
    // Check for duplicates
    if (isIdDuplicate) {
      setError(`A course with ID "${trimmedId}" already exists.`);
      return;
    }
    if (isCodeDuplicate) {
      setError(`A course with code "${trimmedCode}" already exists.`);
      return;
    }
    if (isTitleDuplicate) {
      setError(`A course with title "${trimmedTitle}" already exists.`);
      return;
    }

    const payload = {
      code: trimmedCode,
      title: trimmedTitle,
      departmentId: formData.departmentId,
    };
    
    setIsSaving(true);
    try {
      if (editMode) {
        await updateDoc(doc(db, 'courses', currentId.toString()), payload);
        logActivity({ user, action: LOG_ACTIONS.UPDATE_COURSE, details: `Updated course: ${formData.code} - ${formData.title}` });
      } else {
        const newId = formData.id.trim() || `C${Date.now().toString().slice(-4)}`;
        await setDoc(doc(db, 'courses', newId), { ...payload, id: newId });
        logActivity({ user, action: LOG_ACTIONS.ADD_COURSE, details: `Added new course: ${formData.code} - ${formData.title}` });
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error saving course:", err);
      setError("Failed to save course. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Course?',
      text: "This action cannot be undone. Proceed?",
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });

    if (isConfirmed) {
      try {
        await deleteDoc(doc(db, 'courses', id.toString()));
        setSelectedIds(prev => prev.filter(item => item !== id));
        const course = courses.find(c => String(c.id) === String(id));
        logActivity({ user, action: LOG_ACTIONS.DELETE_COURSE, details: `Deleted course: ${course?.code || id}` });
        toast.success('Course deleted successfully');
      } catch (err) {
        console.error("Error deleting course:", err);
        toast.error('Failed to delete course');
      }
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const allInViewSelected = filteredCourses.length > 0 && filteredCourses.every(c => selectedIds.includes(c.id));
    if (allInViewSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredCourses.some(c => c.id === id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...filteredCourses.map(c => c.id)])));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(filteredCourses.map(c => c.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleExitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const handleDeleteSelected = async () => {
    const selectedInView = selectedIds.filter(id => filteredCourses.some(c => c.id === id));
    if (selectedInView.length === 0) return;
    const count = selectedInView.length;

    const isConfirmed = await confirm({
      title: `Delete ${count} Course${count > 1 ? 's' : ''}?`,
      text: `Are you sure you want to delete ${count} selected courses? This action cannot be undone.`,
      icon: 'warning',
      confirmButtonText: `Delete ${count} Selected`,
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting ${count} courses...`);
      try {
        const coursesToDelete = courses.filter(c => selectedInView.includes(c.id));
        await deleteCourseBatch(coursesToDelete);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_COURSES,
          details: `Batch deleted ${count} courses: ${coursesToDelete.map(c => c.code || c.id).join(', ')}`
        });
        toast.success(`Successfully deleted ${count} courses`, { id: toastId });
        setSelectedIds(prev => prev.filter(id => !selectedInView.includes(id)));
      } catch (err) {
        console.error("Error batch deleting courses:", err);
        toast.error('Failed to delete selected courses', { id: toastId });
      }
    }
  };

  const handleDeleteAll = async () => {
    const count = filteredCourses.length;
    if (count === 0) return;

    const isConfirmed = await confirm({
      title: `Delete All ${count} Courses?`,
      text: `Are you sure you want to delete ALL ${count} courses matching your view? This action cannot be undone.`,
      icon: 'warning',
      confirmButtonText: 'Delete All',
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting all ${count} courses...`);
      try {
        await deleteCourseBatch(filteredCourses);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_COURSES,
          details: `Deleted all ${count} courses in view`
        });
        toast.success(`Successfully deleted all ${count} courses`, { id: toastId });
        setSelectedIds([]);
      } catch (err) {
        console.error("Error deleting all courses:", err);
        toast.error('Failed to delete courses', { id: toastId });
      }
    }
  };

  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (c.code || '').toLowerCase().includes(query) || 
                            (c.title || '').toLowerCase().includes(query) ||
                            (c.id && String(c.id).toLowerCase().includes(query));
      const matchesDept = departmentFilter === 'All' ? true : c.departmentId === departmentFilter;
      return matchesSearch && matchesDept;
    }).sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [courses, searchQuery, departmentFilter]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.placeholder && e.target.placeholder.toLowerCase().includes('search')) return;
      e.preventDefault();
      handleSave();
    }
  };

  const getDeptColor = (deptId) => {
    const d = departments.find(d => d.id === deptId);
    return d ? d.color : 'var(--accent-primary)';
  };
  
  const getDeptName = (deptId) => {
    const d = departments.find(d => d.id === deptId);
    return d ? d.name : deptId;
  };

  return (
    <>
      <div className="card" style={{  position: 'relative' }}>
        <div className="mgmt-header">
          <div className="mgmt-header-left">
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Back
              </button>
            )}
            <div className="mgmt-header-info">
              <h3 className="card-title">
                <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                Manage Courses / Programs
              </h3>
              <p>Configure academic courses</p>
            </div>
          </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                className={`select-mode-btn${selectionMode ? ' active' : ''}`}
                onClick={() => selectionMode ? handleExitSelectionMode() : setSelectionMode(true)}
                title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                {selectionMode ? 'Cancel' : 'Select'}
              </button>
              <button className="btn" onClick={handleOpenAdd}>+ Add Course</button>
            </div>
        </div>

        <div className="mgmt-toolbar">
          <div className="mgmt-toolbar-row">
            <span className="mgmt-toolbar-label">Filter by Department:</span>
            <div className="mgmt-filter-pills">
              <button
                className={`mgmt-filter-pill${departmentFilter === 'All' ? ' active' : ''}`}
                onClick={() => setDepartmentFilter('All')}
                style={departmentFilter === 'All' ? { background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' } : undefined}
              >
                All Departments
              </button>
              {departments.map(dept => {
                const isActive = departmentFilter === dept.id;
                return (
                <button
                  key={dept.id}
                  className={`mgmt-filter-pill${isActive ? ' active' : ''}`}
                  onClick={() => setDepartmentFilter(dept.id)}
                  style={isActive ? { background: dept.color, borderColor: dept.color } : undefined}
                >
                  {dept.name}
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
              placeholder="Search course code or title..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ maxWidth: '300px' }}
            />
          </div>
        </div>

        {selectionMode && (
          <BatchActionBar
            selectedCount={selectedIds.filter(id => filteredCourses.some(c => c.id === id)).length}
            totalCount={filteredCourses.length}
            itemName="course"
            onSelectAll={handleSelectAllFiltered}
            onDeselectAll={handleDeselectAll}
            onDeleteSelected={handleDeleteSelected}
            onDeleteAll={handleDeleteAll}
            onExitSelectionMode={handleExitSelectionMode}
          />
        )}

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                {selectionMode && (
                  <th className="table-checkbox-col">
                    <input
                      type="checkbox"
                      className="data-checkbox"
                      checked={filteredCourses.length > 0 && filteredCourses.every(c => selectedIds.includes(c.id))}
                      onChange={handleToggleSelectAll}
                      title="Select/Deselect all"
                    />
                  </th>
                )}
                <th>Program Code</th>
                <th>Program Title</th>
                <th>Department</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No programs found matching the filter.
                  </td>
                </tr>
              ) : (
                filteredCourses.map(course => {
                  const isSelected = selectionMode && selectedIds.includes(course.id);
                  return (
                  <tr key={course.id} className={isSelected ? 'table-row-selected' : ''}>
                    {selectionMode && (
                      <td className="table-checkbox-col">
                        <input
                          type="checkbox"
                          className="data-checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(course.id)}
                          aria-label={`Select ${course.code}`}
                        />
                      </td>
                    )}
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontSize: '0.75rem', padding: '4px 12px', borderRadius: '16px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)',
                        color: '#4338ca',
                        border: '1px solid #c7d2fe',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        {course.code}
                      </span>
                    </td>
                    <td><strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{course.title}</strong></td>
                    <td>
                      <span style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontSize: '0.75rem', padding: '4px 12px', borderRadius: '16px', fontWeight: 700,
                        background: `${getDeptColor(course.departmentId)}15`,
                        color: getDeptColor(course.departmentId), 
                        border: `1px solid ${getDeptColor(course.departmentId)}40`,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getDeptColor(course.departmentId) }}></div>
                        {getDeptName(course.departmentId)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleOpenEdit(course)} className="btn-icon" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px' }} title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button onClick={() => handleDelete(course.id)} className="btn-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '6px' }} title="Delete">
                           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => !isSaving && setShowModal(false)}>
          <div 
            className="modal-content" 
            style={{ width: '100%', maxWidth: '450px' }} 
            onClick={e => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-main)' }}>
                {editMode ? 'Edit Course' : 'Add New Course'}
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
              <label className="form-label">Course ID / Internal Code</label>
              <input 
                className={`form-input${isIdDuplicate ? ' mgmt-input-duplicate' : ''}`}
                value={formData.id} 
                onChange={e => setFormData({ ...formData, id: e.target.value })} 
                disabled={editMode} 
                placeholder="Enter course ID" 
              />
              {isIdDuplicate && (
                <div className="mgmt-field-duplicate-msg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  Already exists: A course with ID "{trimmedId}" is already registered.
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Course Code</label>
              <input 
                className={`form-input${isCodeDuplicate ? ' mgmt-input-duplicate' : ''}`}
                value={formData.code} 
                onChange={e => setFormData({ ...formData, code: e.target.value })} 
                placeholder="Enter course code" 
              />
              {isCodeDuplicate && (
                <div className="mgmt-field-duplicate-msg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  Already exists: A course with code "{trimmedCode}" is already registered.
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Full Title</label>
              <input 
                className={`form-input${isTitleDuplicate ? ' mgmt-input-duplicate' : ''}`}
                value={formData.title} 
                onChange={e => setFormData({ ...formData, title: e.target.value })} 
                placeholder="Enter full course title" 
              />
              {isTitleDuplicate && (
                <div className="mgmt-field-duplicate-msg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  Already exists: A course with title "{trimmedTitle}" is already registered.
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Department Owner</label>
              <select className="form-select" value={formData.departmentId} onChange={e => setFormData({ ...formData, departmentId: e.target.value })}>
                {departments.map(d => {
                  const colorInfo = getColorNameAndCode(d.color || getDeptColor(d.id));
                  return (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id}) — {colorInfo.name} ({colorInfo.hex})
                    </option>
                  );
                })}
              </select>
              {(() => {
                const selectedDept = departments.find(d => d.id === formData.departmentId);
                if (!selectedDept) return null;
                const colorInfo = getColorNameAndCode(selectedDept.color || getDeptColor(selectedDept.id));
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    marginTop: '8px', padding: '6px 12px', borderRadius: '8px',
                    background: `${colorInfo.hex}15`, border: `1px solid ${colorInfo.hex}40`
                  }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: colorInfo.hex, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }}></div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 600 }}>
                      Department Color: {colorInfo.name}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 700, marginLeft: 'auto' }}>
                      {colorInfo.hex}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="mgmt-modal-actions">
              <button className="mgmt-cancel-btn" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
              <button className="btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Course'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CourseManagement;
