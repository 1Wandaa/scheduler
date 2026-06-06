import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, deleteField } from 'firebase/firestore';
import { ROOM_TYPES } from '../../config/constants';

const RoomManagement = ({ rooms, onBack }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  const [formData, setFormData] = useState({
    id: '', name: '', type: ROOM_TYPES.LECTURE, hasComputers: false, hasProjector: true
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', type: ROOM_TYPES.LECTURE, hasComputers: false, hasProjector: true });
    setEditMode(false);
    setShowModal(true);
  };

  const handleOpenEdit = (room) => {
    setFormData({
      id: room.id,
      name: room.name || '',
      type: room.type || ROOM_TYPES.LECTURE,
      hasComputers: !!room.hasComputers,
      hasProjector: room.hasProjector !== false,
    });
    setCurrentId(room.id);
    setEditMode(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload = {
      name: formData.name,
      type: formData.type,
      hasComputers: formData.hasComputers,
      hasProjector: formData.hasProjector,
    };
    if (editMode) {
      // Replaced the deleteField workaround with a pure payload update
      await updateDoc(doc(db, 'rooms', currentId.toString()), payload);
    } else {
      const newId = formData.id || `R${Date.now().toString().slice(-4)}`;
      await addDoc(collection(db, 'rooms'), { ...payload, id: newId });
    }
    setShowModal(false);
  };
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this room?')) {
      try {
        await deleteDoc(doc(db, 'rooms', id.toString()));
      } catch (error) {
        console.error("Error deleting room: ", error);
        alert('Failed to delete room. Please check your connection.');
      }
    }
  };



  const getRoomTypeBadge = (room) => {
    let bg = 'var(--success-bg)';
    let color = 'var(--success)';

    if (room.type === 'lab') {
      bg = 'var(--warning-bg)';
      color = 'var(--warning)';
    } else if (room.type === 'seminar') {
      bg = '#EEF2FF';
      color = 'var(--accent-primary)';
    }

    const facilities = [];
    if (room.hasComputers) facilities.push('Computers');
    if (room.hasProjector) facilities.push('Projector');

    return (
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span style={{
          background: bg,
          color: color,
          padding: '3px 8px', 
          borderRadius: '4px', 
          fontSize: '0.75rem', 
          fontWeight: '600', 
          textTransform: 'capitalize'
        }}>
          {room.type}
        </span>
        
        {facilities.length > 0 && (
          <div style={{ display: 'flex', gap: '6px' }}>
            {facilities.map(f => (
              <span key={f} style={{ 
                fontSize: '0.7rem', 
                color: 'var(--text-muted)', 
                border: '1px solid var(--border-color)', 
                padding: '2px 6px', 
                borderRadius: '4px' 
              }}>
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    );
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

      <table className="data-table">
        <thead><tr><th>Name</th><th>Type & Facilities</th><th>Actions</th></tr></thead>
        <tbody>
          {rooms.map(r => (
            <tr key={r.id}>
              <td><strong style={{ color: 'var(--text-main)' }}>{r.name}</strong></td>
              <td>{getRoomTypeBadge(r)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn-edit" onClick={() => handleOpenEdit(r)}>Edit</button>
                <button className="btn-delete" onClick={() => handleDelete(r.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '400px' }}>
            <h3>{editMode ? 'Edit Room' : 'Add New Room'}</h3>

            <div className="form-group"><label className="form-label">Room Name</label><input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Room 101" /></div>

            <div className="form-group"><label className="form-label">Room Type</label>
              <select className="form-select" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                <option value={ROOM_TYPES.LECTURE}>Lecture</option>
                <option value={ROOM_TYPES.LAB}>Laboratory</option>
                <option value={ROOM_TYPES.SEMINAR}>Seminar</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '25px', padding: '12px 16px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={formData.hasComputers} onChange={e => setFormData({ ...formData, hasComputers: e.target.checked })} style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }} /> Has Computers
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={formData.hasProjector} onChange={e => setFormData({ ...formData, hasProjector: e.target.checked })} style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }} /> Has Projector
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 18px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: 'var(--text-muted)' }}>Cancel</button>
              <button className="btn" onClick={handleSave}>Save Room</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RoomManagement;