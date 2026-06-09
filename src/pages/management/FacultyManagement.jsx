import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { DEPARTMENTS } from '../../config/constants';

const FacultyManagement = ({ professors, subjects = [], rooms = [], onBack }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, specialization: [], preferredRooms: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', firstName: '', lastName: '', department: 'BSCS', maxUnits: 12, specialization: [], preferredRooms: [] });
    setEditMode(false);
    setShowModal(true);
  };

  const handleSubjectToggle = (subjectId) => {
    setFormData(prev => {
      const current = prev.specialization || [];
      if (current.includes(subjectId)) {
        return { ...prev, specialization: current.filter(s => s !== subjectId) };
      } else {
        return { ...prev, specialization: [...current, subjectId] };
      }
    });
  };

  const handleRoomToggle = (roomId) => {
    setFormData(prev => {
      const current = prev.preferredRooms || [];
      if (current.includes(roomId)) {
        return { ...prev, preferredRooms: current.filter(r => r !== roomId) };
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
      preferredRooms: prof.preferredRooms || [] // Ensure array exists
    });
    setCurrentId(prof.id);
    setEditMode(true);
    setShowModal(true);
  };

  const handleSave = async () => {
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
      alert(`A faculty member named "${combinedName}" already exists!`);
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
    if (window.confirm('Are you sure you want to delete this faculty member?')) {
      try {
        await deleteDoc(doc(db, 'professors', id.toString()));
      } catch (error) {
        console.error("Error deleting faculty: ", error);
        alert('Failed to delete faculty member. Please check your connection.');
      }
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                Faculty Database
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage instructor details, teaching load, and room preferences</p>
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
                    border: departmentFilter === dept ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: departmentFilter === dept ? 'var(--accent-primary)' : 'transparent',
                    color: departmentFilter === dept ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { if (departmentFilter !== dept) { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.color = 'var(--accent-primary)'; } }}
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
          <thead><tr><th>Name</th><th>Department</th><th>Max Load</th><th>Subjects</th><th>Rooms</th><th>Actions</th></tr></thead>
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
          <div className="modal-content" style={{ width: '500px' }}>
            <h3>{editMode ? 'Edit Faculty' : 'Add New Faculty'}</h3>

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
              <div style={{ marginTop: '8px', maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: 'var(--bg-main)' }}>
                {subjects.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No subjects available.</p>}
                {[...subjects].sort((a, b) => ((a.code || '').replace(/\s+/g, '').toUpperCase()).localeCompare(((b.code || '').replace(/\s+/g, '').toUpperCase()), undefined, { numeric: true, sensitivity: 'base' })).map(sub => (
                  <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.specialization || []).includes(sub.id)}
                      onChange={() => handleSubjectToggle(sub.id)}
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
                {rooms.map(room => (
                  <label key={room.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.preferredRooms || []).includes(room.id)}
                      onChange={() => handleRoomToggle(room.id)}
                      style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: '600', color: 'var(--accent-dark)' }}>{room.name}</span>
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