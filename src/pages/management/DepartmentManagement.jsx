import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

const DepartmentManagement = ({ departments, onBack, user }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    color: '#109EEF',
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', color: '#109EEF' });
    setEditMode(false);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (dept) => {
    setFormData({
      id: dept.id,
      name: dept.name || '',
      color: dept.color || '#109EEF',
    });
    setCurrentId(dept.id);
    setEditMode(true);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!formData.name.trim()) {
      setError('Department name is required.');
      return;
    }
    
    // Check for duplicates
    const duplicate = departments.find(d => 
      d.name.toLowerCase() === formData.name.trim().toLowerCase() && 
      (editMode ? d.id !== currentId : true)
    );
    
    if (duplicate) {
      setError(`A department named "${formData.name.trim()}" already exists.`);
      return;
    }

    const payload = {
      name: formData.name.trim(),
      color: formData.color,
    };
    
    setIsSaving(true);
    try {
      if (editMode) {
        await updateDoc(doc(db, 'departments', currentId.toString()), payload);
        logActivity({ user, action: LOG_ACTIONS.UPDATE_ROOM || 'UPDATE_DEPARTMENT', details: `Updated department: ${formData.name}` }); // Note: you might want to add UPDATE_DEPARTMENT to LOG_ACTIONS if it doesn't exist
      } else {
        const newId = formData.id.trim() || `D${Date.now().toString().slice(-4)}`;
        await addDoc(collection(db, 'departments'), { ...payload, id: newId });
        logActivity({ user, action: LOG_ACTIONS.ADD_ROOM || 'ADD_DEPARTMENT', details: `Added new department: ${formData.name}` });
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error saving department:", err);
      setError("Failed to save department. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Department?',
      text: "This action cannot be undone. Proceed?",
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'minimal-swal',
        title: 'minimal-title',
        htmlContainer: 'minimal-text',
        actions: 'minimal-actions',
        confirmButton: 'btn-delete',
        cancelButton: 'back-btn'
      },
      buttonsStyling: false,
      focusCancel: true
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'departments', id.toString()));
        const dept = departments.find(d => String(d.id) === String(id));
        logActivity({ user, action: LOG_ACTIONS.DELETE_ROOM || 'DELETE_DEPARTMENT', details: `Deleted department: ${dept?.name || id}` });
        Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
      } catch (error) {
        console.error("Error deleting department: ", error);
        Swal.fire({ title: 'Error', text: 'Failed to delete.', icon: 'error', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
      }
    }
  };

  const filteredDepartments = useMemo(() => {
    return departments.filter(d => {
      const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            d.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [departments, searchQuery]);

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
      <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Back
              </button>
            )}
            <div>
              <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                Manage Departments
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Configure academic departments</p>
            </div>
          </div>
          <button className="btn" onClick={handleOpenAdd}>+ Add Department</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: '15px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search department..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ flex: 1, maxWidth: '300px' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID / Code</th>
                <th>Name</th>
                <th>Color</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No departments found.
                  </td>
                </tr>
              ) : (
                filteredDepartments.map(dept => (
                  <tr key={dept.id}>
                    <td style={{ fontWeight: 600 }}>{dept.id}</td>
                    <td>{dept.name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: dept.color }}></div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{dept.color}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleOpenEdit(dept)} className="btn-icon" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px' }} title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button onClick={() => handleDelete(dept.id)} className="btn-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '6px' }} title="Delete">
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
          <div className="modal-content" style={{ width: '450px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Department' : 'Add New Department'}</h3>
            
            {error && (
              <div style={{ padding: '10px 15px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}
            
            <div className="form-group">
              <label className="form-label">Department ID / Code</label>
              <input 
                className="form-input" 
                value={formData.id} 
                onChange={e => setFormData({ ...formData, id: e.target.value })} 
                disabled={editMode} 
                placeholder="e.g. BSCS" 
              />
              {!editMode && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>Used as unique identifier. Best to use the abbreviation.</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Department Name</label>
              <input 
                className="form-input" 
                value={formData.name} 
                onChange={e => setFormData({ ...formData, name: e.target.value })} 
                placeholder="e.g. BSCS or Computer Science" 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Color Theme</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                  type="color" 
                  value={formData.color} 
                  onChange={e => setFormData({ ...formData, color: e.target.value })} 
                  style={{ width: '40px', height: '40px', padding: '0', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                />
                <input 
                  type="text" 
                  className="form-input" 
                  value={formData.color} 
                  onChange={e => setFormData({ ...formData, color: e.target.value })} 
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 18px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: 'var(--text-muted)' }} disabled={isSaving}>Cancel</button>
              <button className="btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Department'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DepartmentManagement;
