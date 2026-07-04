import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

const CourseManagement = ({ courses, departments, onBack, user }) => {
  const { confirm } = useGlobalDialog();
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSave = async () => {
    setError(null);
    if (!formData.code.trim()) {
      setError('Course code is required.');
      return;
    }
    if (!formData.title.trim()) {
      setError('Course title is required.');
      return;
    }
    
    // Check for duplicates based on code
    const duplicate = courses.find(c => 
      c.code.toLowerCase() === formData.code.trim().toLowerCase() && 
      (editMode ? c.id !== currentId : true)
    );
    
    if (duplicate) {
      setError(`A course with code "${formData.code.trim()}" already exists.`);
      return;
    }

    const payload = {
      code: formData.code.trim(),
      title: formData.title.trim(),
      departmentId: formData.departmentId,
    };
    
    setIsSaving(true);
    try {
      if (editMode) {
        await updateDoc(doc(db, 'courses', currentId.toString()), payload);
        logActivity({ user, action: LOG_ACTIONS.UPDATE_ROOM || 'UPDATE_COURSE', details: `Updated course: ${formData.code}` });
      } else {
        const newId = formData.id.trim() || `C${Date.now().toString().slice(-4)}`;
        await addDoc(collection(db, 'courses'), { ...payload, id: newId });
        logActivity({ user, action: LOG_ACTIONS.ADD_ROOM || 'ADD_COURSE', details: `Added new course: ${formData.code}` });
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
        const course = courses.find(c => String(c.id) === String(id));
        logActivity({ user, action: LOG_ACTIONS.DELETE_ROOM || 'DELETE_COURSE', details: `Deleted course: ${course?.code || id}` });
        toast.success('Course deleted successfully');
      } catch (err) {
        console.error("Error deleting course:", err);
        toast.error('Failed to delete course');
      }
    }
  };

  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      const matchesSearch = c.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            c.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = departmentFilter === 'All' ? true : c.departmentId === departmentFilter;
      return matchesSearch && matchesDept;
    }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
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
      <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Back
              </button>
            )}
            <div>
              <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                Manage Courses / Programs
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Configure academic courses</p>
            </div>
          </div>
          <button className="btn" onClick={handleOpenAdd}>+ Add Course</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Filter by Department:</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setDepartmentFilter('All')}
                style={{
                  padding: '6px 14px', borderRadius: '20px',
                  border: departmentFilter === 'All' ? `1.5px solid var(--accent-primary)` : '1px solid var(--border-color)',
                  background: departmentFilter === 'All' ? 'var(--accent-primary)' : 'transparent',
                  color: departmentFilter === 'All' ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600', transition: 'all 0.2s ease',
                }}
              >
                All Departments
              </button>
              {departments.map(dept => (
                <button
                  key={dept.id}
                  onClick={() => setDepartmentFilter(dept.id)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px',
                    border: departmentFilter === dept.id ? `1.5px solid ${dept.color}` : '1px solid var(--border-color)',
                    background: departmentFilter === dept.id ? dept.color : 'transparent',
                    color: departmentFilter === dept.id ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600', transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { if (departmentFilter !== dept.id) { e.target.style.borderColor = dept.color; e.target.style.color = dept.color; } }}
                  onMouseLeave={(e) => { if (departmentFilter !== dept.id) { e.target.style.borderColor = 'var(--border-color)'; e.target.style.color = 'var(--text-muted)'; } }}
                >
                  {dept.name}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search course code or title..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ flex: 1, maxWidth: '300px' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: '700px' }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Department</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No courses found.
                  </td>
                </tr>
              ) : (
                filteredCourses.map(course => (
                  <tr key={course.id}>
                    <td style={{ fontWeight: 600 }}>{course.code}</td>
                    <td>{course.title}</td>
                    <td>
                      <span style={{ 
                        fontSize: '0.78rem', padding: '2px 8px', borderRadius: '6px', 
                        background: `${getDeptColor(course.departmentId)}20`, // 20 for slight transparency
                        color: getDeptColor(course.departmentId), 
                        fontWeight: 600 
                      }}>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '100%', maxWidth: '450px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Course' : 'Add New Course'}</h3>
            
            {error && (
              <div style={{ padding: '10px 15px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}
            
            <div className="form-group">
              <label className="form-label">Course ID / Internal Code</label>
              <input 
                className="form-input" 
                value={formData.id} 
                onChange={e => setFormData({ ...formData, id: e.target.value })} 
                disabled={editMode} 
                placeholder="e.g. C01" 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Course Code</label>
              <input 
                className="form-input" 
                value={formData.code} 
                onChange={e => setFormData({ ...formData, code: e.target.value })} 
                placeholder="e.g. BSCS" 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Full Title</label>
              <input 
                className="form-input" 
                value={formData.title} 
                onChange={e => setFormData({ ...formData, title: e.target.value })} 
                placeholder="e.g. Bachelor of Science in Computer Science" 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Department Owner</label>
              <select className="form-select" value={formData.departmentId} onChange={e => setFormData({ ...formData, departmentId: e.target.value })}>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 18px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: 'var(--text-muted)' }} disabled={isSaving}>Cancel</button>
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
