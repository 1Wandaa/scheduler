import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { ROOM_TYPES, BUILDINGS, DEPARTMENTS, getDeptColor } from '../../config/constants';
import RoomTable from '../../components/RoomTable/RoomTable';

const RoomManagement = ({ rooms, onBack }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: '', name: '', type: ROOM_TYPES.LECTURE, hasComputers: false, building: '', department: 'SHARED'
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', type: ROOM_TYPES.LECTURE, hasComputers: false, building: '', department: 'SHARED' });
    setEditMode(false);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (room) => {
    setFormData({
      id: room.id,
      name: room.name || '',
      type: room.type || ROOM_TYPES.LECTURE,
      hasComputers: !!room.hasComputers,
      building: room.building || '',
      department: room.department || 'SHARED',
    });
    setCurrentId(room.id);
    setEditMode(true);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!formData.name.trim()) {
      setError('Room name is required.');
      return;
    }
    const duplicate = rooms.find(r => 
      r.name.toLowerCase() === formData.name.trim().toLowerCase() && 
      (editMode ? r.id !== currentId : true)
    );
    if (duplicate) {
      setError(`A room named "${formData.name.trim()}" already exists.`);
      return;
    }
    const isCSBuilding = formData.building === 'BSCS Building' || formData.department === 'BSCS';
    const payload = {
      name: formData.name,
      type: formData.type,
      hasComputers: isCSBuilding ? true : formData.hasComputers,
      building: formData.building || 'Unassigned',
      department: formData.department || 'SHARED',
    };
    
    setIsSaving(true);
    try {
      if (editMode) {
        // Replaced the deleteField workaround with a pure payload update
        await updateDoc(doc(db, 'rooms', currentId.toString()), payload);
      } else {
        const newId = formData.id || `R${Date.now().toString().slice(-4)}`;
        await addDoc(collection(db, 'rooms'), { ...payload, id: newId });
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error saving room:", err);
      setError("Failed to save room. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };
  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Room?',
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
        await deleteDoc(doc(db, 'rooms', id.toString()));
        Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
      } catch (error) {
        console.error("Error deleting room: ", error);
        Swal.fire({ title: 'Error', text: 'Failed to delete.', icon: 'error', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
      }
    }
  };



  const filteredRooms = useMemo(() => {
    return rooms.filter(r => {
      const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBuilding = filterBuilding ? r.building === filterBuilding : true;
      const matchesDept = departmentFilter === 'All' ? true : (r.department || 'SHARED') === departmentFilter;
      return matchesSearch && matchesBuilding && matchesDept;
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [rooms, searchQuery, filterBuilding, departmentFilter]);

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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              Manage Rooms
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Configure campus facilities</p>
          </div>
        </div>
        <button className="btn" onClick={handleOpenAdd}>+ Add Room</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Filter by Department:</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['All', 'SHARED', ...DEPARTMENTS].map(dept => (
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
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Search room name..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            style={{ flex: 1, maxWidth: '300px' }}
          />
          <select 
            className="form-select" 
            value={filterBuilding} 
            onChange={(e) => setFilterBuilding(e.target.value)}
            style={{ flex: 1, maxWidth: '250px' }}
          >
            <option value="">All Buildings</option>
            {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <RoomTable roomList={filteredRooms} onEdit={handleOpenEdit} onDelete={handleDelete} />
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '450px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Room' : 'Add New Room'}</h3>
            {error && (
              <div style={{ position: 'sticky', top: '0', zIndex: 10, padding: '10px 15px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.3s', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}
            <div className="form-group"><label className="form-label">Room ID</label><input className="form-input" value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} disabled={editMode} placeholder="e.g. R001" /></div>

            <div className="form-group"><label className="form-label">Room Name</label><input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Room 101" /></div>

            <div className="form-group"><label className="form-label">Building</label>
              <select className="form-select" value={formData.building} onChange={e => setFormData({ ...formData, building: e.target.value })}>
                <option value="">Select a Building</option>
                {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="form-group"><label className="form-label">Department Owner</label>
              <select className="form-select" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })}>
                <option value="SHARED">SHARED (Any department)</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Priority scheduling for this department's sections. SHARED = available to all.</span>
            </div>

            <div className="form-group"><label className="form-label">Room Type</label>
              <select className="form-select" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                <option value={ROOM_TYPES.LECTURE}>Lecture</option>
                <option value={ROOM_TYPES.LAB}>Laboratory</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '25px', padding: '12px 16px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input 
                  type="checkbox" 
                  checked={(formData.building === 'BSCS Building' || formData.department === 'BSCS') ? true : formData.hasComputers} 
                  disabled={formData.building === 'BSCS Building' || formData.department === 'BSCS'} 
                  onChange={e => setFormData({ ...formData, hasComputers: e.target.checked })} 
                  style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }} 
                /> 
                Has Computers
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 18px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: 'var(--text-muted)' }} disabled={isSaving}>Cancel</button>
              <button className="btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RoomManagement;