import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { deleteRoomCascade } from '../../services/cascadeDeleteService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { ROOM_TYPES, BUILDINGS, DEPARTMENTS, getDeptColor } from '../../config/constants';
import RoomTable from '../../components/RoomTable/RoomTable';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

const RoomManagement = ({ rooms, professors, schedules, departments = [], onBack, user }) => {
  const { confirm } = useGlobalDialog();
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: '', name: '', type: ROOM_TYPES.LECTURE, hasComputers: false, isFoodLab: false, building: '', department: 'SHARED'
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', type: ROOM_TYPES.LECTURE, hasComputers: false, isFoodLab: false, building: '', department: 'SHARED' });
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
      isFoodLab: !!room.isFoodLab,
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
      isFoodLab: formData.isFoodLab,
      building: formData.building || 'Unassigned',
      department: formData.department || 'SHARED',
    };
    
    setIsSaving(true);
    try {
      if (editMode) {
        await updateDoc(doc(db, 'rooms', currentId.toString()), payload);
        logActivity({ user, action: LOG_ACTIONS.UPDATE_ROOM, details: `Updated room: ${formData.name}` });
      } else {
        const newId = formData.id || `R${Date.now().toString().slice(-4)}`;
        await addDoc(collection(db, 'rooms'), { ...payload, id: newId });
        logActivity({ user, action: LOG_ACTIONS.ADD_ROOM, details: `Added new room: ${formData.name} (${formData.type})` });
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
    const isConfirmed = await confirm({
      title: 'Delete Room?',
      text: "This action cannot be undone. Proceed?",
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });

    if (isConfirmed) {
      try {
        const roomToDelete = rooms.find(r => String(r.id) === String(id));
        await deleteRoomCascade(roomToDelete, professors, schedules);
        logActivity({ user, action: LOG_ACTIONS.DELETE_ROOM, details: `Deleted room: ${roomToDelete?.name || id}` });
        toast.success('Room deleted successfully');
      } catch (err) {
        console.error("Error deleting room:", err);
        toast.error('Failed to delete room');
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
      <div className="card" style={{ position: 'relative', backgroundImage: 'none', backgroundColor: '#ffffff' }}>
      {/* Sticky Wrapper for Header & Filters */}
      <div className="sticky-mgmt-header" style={{ position: 'sticky', top: '-24px', zIndex: 40, backgroundColor: '#ffffff', paddingTop: '24px', paddingBottom: '10px', borderBottom: '1px solid var(--border-color)', margin: '-24px -24px 20px -24px', paddingLeft: '24px', paddingRight: '24px' }}>
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
              <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              Manage Rooms
            </h3>
            <p>Configure campus facilities</p>
          </div>
        </div>
        <button className="btn" onClick={handleOpenAdd}>+ Add Room</button>
      </div>

      <div className="mgmt-toolbar">
        <div className="mgmt-toolbar-row">
          <span className="mgmt-toolbar-label">Filter by Department:</span>
          <div className="mgmt-filter-pills">
            {['All', 'SHARED', ...(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)].map(dept => {
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
            )})}
          </div>
        </div>
        <div className="mgmt-toolbar-row">
          <div className="mgmt-search-wrapper" style={{ maxWidth: '300px' }}>
            <span className="mgmt-search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input 
              type="text" 
              className="mgmt-search-input" 
              placeholder="Search room name or ID..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
            />
          </div>
          
          <div className="mgmt-search-wrapper" style={{ maxWidth: '250px' }}>
            <span className="mgmt-search-icon" style={{ pointerEvents: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>
            </span>
            <select 
              className="mgmt-search-input" 
              value={filterBuilding} 
              onChange={(e) => setFilterBuilding(e.target.value)}
              style={{ appearance: 'auto' }}
            >
              <option value="">All Buildings</option>
              {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
      </div>
      </div>

      <RoomTable roomList={filteredRooms} onEdit={handleOpenEdit} onDelete={handleDelete} />
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '450px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Room' : 'Add New Room'}</h3>
            {error && (
              <div className="mgmt-modal-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M2 15h10"></path><path d="M5 12l-3 3 3 3"></path></svg>
                  Room ID
                </label>
                <input className="form-input" value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} disabled={editMode} placeholder="e.g. R001" style={{ backgroundColor: editMode ? 'var(--bg-main)' : '#fff' }} />
              </div>

              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                  Room Name
                </label>
                <input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Computer Lab 1" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>
                  Building
                </label>
                <select className="form-select" value={formData.building} onChange={e => setFormData({ ...formData, building: e.target.value })} style={{ color: !formData.building ? '#757575' : 'inherit' }}>
                  <option value="" disabled hidden>Select a Building</option>
                  {BUILDINGS.map(b => <option key={b} value={b} style={{ color: '#000' }}>{b}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  Room Type
                </label>
                <select className="form-select" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                  <option value={ROOM_TYPES.LECTURE}>Lecture</option>
                  <option value={ROOM_TYPES.LAB}>Laboratory</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                Department Owner
              </label>
              <select className="form-select" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })}>
                <option value="SHARED">SHARED (Any department)</option>
                {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Priority scheduling for this department's sections. SHARED = available to all.</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px', padding: '12px 16px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input 
                  type="checkbox" 
                  checked={(formData.building === 'BSCS Building' || formData.department === 'BSCS') ? true : formData.hasComputers} 
                  disabled={formData.building === 'BSCS Building' || formData.department === 'BSCS'} 
                  onChange={e => setFormData({ ...formData, hasComputers: e.target.checked, isFoodLab: e.target.checked ? false : formData.isFoodLab })} 
                  style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }} 
                /> 
                Has Computers
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input 
                  type="checkbox" 
                  checked={formData.isFoodLab} 
                  onChange={e => setFormData({ ...formData, isFoodLab: e.target.checked, hasComputers: e.target.checked ? false : formData.hasComputers })} 
                  style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }} 
                /> 
                Is Food Laboratory
              </label>
            </div>

            <div className="mgmt-modal-actions">
              <button className="mgmt-cancel-btn" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
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