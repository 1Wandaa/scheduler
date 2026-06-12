import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { DEPARTMENTS } from '../../config/constants';

const FacultyManagement = ({ professors, subjects = [], rooms = [], sections = [], onBack }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, specialization: [], preferredRooms: [], assignedSections: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, specialization: [], preferredRooms: [], assignedSections: [] });
    setEditMode(false);
    setError(null);
    setSubjectSearchQuery('');
    setSectionSearchQuery('');
    setShowModal(true);
  };

  const handleSubjectToggle = (subject) => {
    setFormData(prev => {
      const current = prev.specialization || [];
      const isChecked = current.includes(subject.id) || current.includes(subject.code) || current.includes(subject.name);
      if (isChecked) {
        return { ...prev, specialization: current.filter(s => s !== subject.id && s !== subject.code && s !== subject.name) };
      } else {
        return { ...prev, specialization: [...current, subject.id] };
      }
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
    setFormData(prev => {
      const current = prev.assignedSections || [];
      const isChecked = current.includes(sec.id) || current.includes(sec.name);
      if (isChecked) {
        return { ...prev, assignedSections: current.filter(s => s !== sec.id && s !== sec.name) };
      } else {
        return { ...prev, assignedSections: [...current, sec.id] };
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
      preferredRooms: prof.preferredRooms || [],
      assignedSections: prof.assignedSections || []
    });
    setCurrentId(prof.id);
    setEditMode(true);
    setError(null);
    setSubjectSearchQuery('');
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

    const dataToSave = { ...formData, name: combinedName };

    if (editMode) {
      await updateDoc(doc(db, 'professors', currentId.toString()), dataToSave);
    } else {
      const newId = formData.id || `P${Date.now().toString().slice(-4)}`;
      await addDoc(collection(db, 'professors'), { ...dataToSave, id: newId });
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Faculty?',
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
        await deleteDoc(doc(db, 'professors', id.toString()));
        Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
      } catch (error) {
        console.error("Error deleting faculty: ", error);
        Swal.fire({ title: 'Error', text: 'Failed to delete.', icon: 'error', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
      }
    }
  };

  const getDeptColor = (dept) => {
    switch(dept) {
      case 'BSCS': return '#109EEF'; // Blue
      case 'BAEL': return '#EAB308'; // Yellow
      case 'BSOA': return '#8B5CF6'; // Purple
      case 'BSFT': return '#16A34A'; // Green
      default: return 'var(--accent-primary)';
    }
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
      <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                Back
              </button>
            )}
            <div>
              <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                Faculty Management
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage instructors, their departments, and constraints</p>
            </div>
          </div>
          <button className="btn" onClick={handleOpenAdd}>+ Add Faculty</button>
        </div>

        {/* Department Filter and Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Filter by Department:</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['All', ...DEPARTMENTS].map(dept => (
                <button
                  key={dept}
                  onClick={() => setDepartmentFilter(dept)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: departmentFilter === dept ? `1.5px solid ${getDeptColor(dept)}` : '1px solid var(--border-color)',
                    background: departmentFilter === dept ? getDeptColor(dept) : 'transparent',
                    color: departmentFilter === dept ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { if (departmentFilter !== dept) { e.target.style.borderColor = getDeptColor(dept); e.target.style.color = getDeptColor(dept); } }}
                  onMouseLeave={(e) => { if (departmentFilter !== dept) { e.target.style.borderColor = 'var(--border-color)'; e.target.style.color = 'var(--text-muted)'; } }}
                >
                  {dept === 'All' ? 'All Departments' : dept}
                </button>
              ))}
            </div>
            {departmentFilter !== 'All' && (
              <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: '500' }}>
                Showing {professors.filter(p => p.department === departmentFilter).length} of {professors.length} faculty
              </span>
            )}
          </div>
          <div style={{ display: 'flex' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search faculty name..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ flex: 1, maxWidth: '300px' }}
            />
          </div>
        </div>

        <table className="data-table">
          <thead><tr><th>Name</th><th>Department</th><th>Max Load</th><th>Subjects</th><th>Sections</th><th>Rooms</th><th>Actions</th></tr></thead>
          <tbody>
            {professors
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
              .sort((a, b) => a.formattedName.localeCompare(b.formattedName))
              .map(p => (
                <tr key={p.id}>
                  <td><strong style={{ color: 'var(--text-main)' }}>{p.formattedName}</strong></td>
                  <td>{p.department}</td>
                  <td><span style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '600' }}>{p.maxUnits || p.maxHours || 12} units</span></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {(p.specialization || []).length} subject{(p.specialization || []).length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {(p.assignedSections || []).length} section{(p.assignedSections || []).length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {(p.preferredRooms || []).length} room{(p.preferredRooms || []).length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-edit" onClick={() => handleOpenEdit(p)}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '500px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Faculty' : 'Add New Faculty'}</h3>
            {error && (
              <div style={{ position: 'sticky', top: '0', zIndex: 10, padding: '10px 15px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.3s', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}
            <div className="form-group"><label className="form-label">Faculty ID</label><input className="form-input" value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} disabled={editMode} placeholder="e.g. P001" /></div>
            
            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">First Name</label>
                <input className="form-input" value={formData.firstName || ''} onChange={e => setFormData({ ...formData, firstName: e.target.value })} placeholder="e.g. Dr. John" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Last Name (Surname)</label>
                <input className="form-input" value={formData.lastName || ''} onChange={e => setFormData({ ...formData, lastName: e.target.value })} placeholder="e.g. Smith" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Department</label>
                <select className="form-select" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })}>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ width: '120px' }}>
                <label className="form-label">Max Units</label>
                <input type="number" className="form-input" value={formData.maxUnits} onChange={e => setFormData({ ...formData, maxUnits: e.target.value === '' ? '' : parseInt(e.target.value) })} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Subjects</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search subject code or name..." 
                value={subjectSearchQuery} 
                onChange={(e) => setSubjectSearchQuery(e.target.value)}
                style={{ marginBottom: '10px', marginTop: '5px' }}
              />
              <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: 'var(--bg-main)' }}>
                {subjects.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No subjects available.</p>}
                {[...subjects]
                  .filter(sub => 
                    (sub.code || '').toLowerCase().includes(subjectSearchQuery.toLowerCase()) || 
                    (sub.name || '').toLowerCase().includes(subjectSearchQuery.toLowerCase())
                  )
                  .sort((a, b) => ((a.code || '').replace(/\s+/g, '').toUpperCase()).localeCompare(((b.code || '').replace(/\s+/g, '').toUpperCase()), undefined, { numeric: true, sensitivity: 'base' })).map(sub => (
                  <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.specialization || []).includes(sub.id) || (formData.specialization || []).includes(sub.code) || (formData.specialization || []).includes(sub.name)}
                      onChange={() => handleSubjectToggle(sub)}
                      style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: '600', color: 'var(--accent-dark)' }}>{sub.code}</span>
                    <span>{sub.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '25px' }}>
              <label className="form-label">Preferred Rooms (Optional)</label>
              <div style={{ marginTop: '8px', maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: 'var(--bg-main)' }}>
                {rooms.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No rooms available.</p>}
                {[...rooms].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(room => (
                  <label key={room.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.preferredRooms || []).includes(room.id) || (formData.preferredRooms || []).includes(room.name)}
                      onChange={() => handleRoomToggle(room)}
                      style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: '600', color: 'var(--accent-dark)' }}>{room.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '25px' }}>
              <label className="form-label">Assigned Sections (Optional)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search section name..." 
                value={sectionSearchQuery} 
                onChange={(e) => setSectionSearchQuery(e.target.value)}
                style={{ marginBottom: '10px', marginTop: '5px' }}
              />
              <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: 'var(--bg-main)' }}>
                {sections.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No sections available.</p>}
                {[...sections]
                  .filter(sec => (sec.name || '').toLowerCase().includes(sectionSearchQuery.toLowerCase()))
                  .sort((a, b) => a.name.localeCompare(b.name)).map(sec => (
                  <label key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.assignedSections || []).includes(sec.id) || (formData.assignedSections || []).includes(sec.name)}
                      onChange={() => handleSectionToggle(sec)}
                      style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: '600', color: 'var(--accent-dark)' }}>{sec.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 18px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: 'var(--text-muted)' }}>Cancel</button>
              <button className="btn" onClick={handleSave}>Save Faculty</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FacultyManagement;