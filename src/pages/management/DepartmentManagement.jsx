import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

const DepartmentManagement = ({ departments, onBack, user }) => {
  const { confirm } = useGlobalDialog();
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
    const isConfirmed = await confirm({
      title: 'Delete Department?',
      text: "This action cannot be undone. Proceed?",
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });

    if (isConfirmed) {
      try {
        await deleteDoc(doc(db, 'departments', id.toString()));
        const dept = departments.find(d => String(d.id) === String(id));
        logActivity({ user, action: LOG_ACTIONS.DELETE_ROOM || 'DELETE_DEPARTMENT', details: `Deleted department: ${dept?.name || id}` });
        toast.success('Department deleted successfully');
      } catch (err) {
        console.error("Error deleting department:", err);
        toast.error('Failed to delete department');
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
                <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                Manage Departments
              </h3>
              <p>Configure academic departments</p>
            </div>
          </div>
          <button className="btn" onClick={handleOpenAdd}>+ Add Department</button>
        </div>

        <div className="mgmt-toolbar">
          <div className="mgmt-search-wrapper" style={{ maxWidth: '300px' }}>
            <span className="mgmt-search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input 
              type="text" 
              className="mgmt-search-input" 
              placeholder="Search department..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: '600px' }}>
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
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontSize: '0.75rem', padding: '4px 12px', borderRadius: '16px', fontWeight: 700,
                        background: `${dept.color}15`,
                        color: dept.color,
                        border: `1px solid ${dept.color}40`,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        {dept.id}
                      </span>
                    </td>
                    <td><strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{dept.name}</strong></td>
                    <td>
                      <div style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '4px 12px', borderRadius: '16px', 
                        background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: dept.color, border: '1px solid rgba(0,0,0,0.1)' }}></div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', letterSpacing: '0.5px' }}>{dept.color.toUpperCase()}</span>
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
          <div className="modal-content" style={{ width: '100%', maxWidth: '450px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Department' : 'Add New Department'}</h3>
            
            {error && (
              <div className="mgmt-modal-error">
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
              {!editMode && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>Used as unique identifier. Best to use the abbreviation.</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Department Name</label>
              <input 
                className="form-input" 
                value={formData.name} 
                onChange={e => setFormData({ ...formData, name: e.target.value })} 
                placeholder="e.g. Computer Science" 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Color Theme</label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ position: 'relative', width: '38px', height: '38px', borderRadius: '6px', overflow: 'hidden', border: '2px solid rgba(0,0,0,0.05)', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <input 
                    type="color" 
                    value={formData.color} 
                    onChange={e => setFormData({ ...formData, color: e.target.value })} 
                    style={{ position: 'absolute', top: '-10px', left: '-10px', width: '60px', height: '60px', padding: '0', border: 'none', cursor: 'pointer' }}
                  />
                </div>
                <div style={{ position: 'relative', flex: 1, maxWidth: '140px' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 'bold' }}>#</span>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={(formData.color || '').replace('#', '')} 
                    onChange={e => {
                      const hex = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                      setFormData({ ...formData, color: '#' + hex });
                    }} 
                    style={{ width: '100%', paddingLeft: '22px', fontFamily: 'monospace', fontSize: '0.95rem', letterSpacing: '0.5px' }}
                    placeholder="FFFFFF"
                  />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500', marginLeft: 'auto' }}>
                  Used for tags and charts
                </div>
              </div>
            </div>

            <div className="mgmt-modal-actions">
              <button className="mgmt-cancel-btn" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
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
