import React, { useState } from 'react';
import { db } from './firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { ROOM_TYPES } from './index';

const RoomManagement = ({ rooms }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState({
    id: '', name: '', capacity: 30, type: ROOM_TYPES.LECTURE, hasComputers: false, hasProjector: true
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', capacity: 30, type: ROOM_TYPES.LECTURE, hasComputers: false, hasProjector: true });
    setEditMode(false);
    setShowModal(true);
  };

  const handleOpenEdit = (room) => {
    setFormData(room);
    setCurrentId(room.id);
    setEditMode(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (editMode) {
      await updateDoc(doc(db, 'rooms', currentId.toString()), formData);
    } else {
      const newId = formData.id || `R${Date.now().toString().slice(-4)}`;
      await addDoc(collection(db, 'rooms'), { ...formData, id: newId });
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this room?')) {
      await deleteDoc(doc(db, 'rooms', id.toString()));
    }
  };

  const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box', marginTop: '5px', backgroundColor: 'white' };
  const labelStyle = { display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '500' };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            Manage Rooms
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Configure campus facilities and capacities</p>
        </div>
        <button className="btn" onClick={handleOpenAdd}>+ Add Room</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Capacity</th><th>Actions</th></tr></thead>
        <tbody>
          {rooms.map(r => (
            <tr key={r.id}>
              <td style={{ color: 'var(--text-muted)' }}>{r.id}</td>
              <td><strong style={{ color: 'var(--text-main)' }}>{r.name}</strong></td>
              <td>
                <span style={{
                  background: r.type === 'lab' ? 'var(--warning-bg)' : 'var(--success-bg)',
                  color: r.type === 'lab' ? 'var(--warning)' : 'var(--success)',
                  padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase'
                }}>
                  {r.type} {r.hasComputers && '💻'}
                </span>
              </td>
              <td>{r.capacity} pax</td>
              <td>
                <button style={{ color: 'var(--accent-primary)', border: 'none', background: 'none', cursor: 'pointer', marginRight: '15px', fontWeight: '500' }} onClick={() => handleOpenEdit(r)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Edit</button>
                <button style={{ color: 'var(--danger)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: '500' }} onClick={() => handleDelete(r.id)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ backgroundColor: 'var(--card-bg)', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-dark)', marginBottom: '20px' }}>{editMode ? 'Edit Room' : 'Add New Room'}</h3>

            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>Room Code</label><input style={inputStyle} value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} disabled={editMode} placeholder="e.g. R101" /></div>
            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>Room Name</label><input style={inputStyle} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Room 101" /></div>
            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>Capacity</label><input type="number" style={inputStyle} value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })} /></div>
            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>Room Type</label>
              <select style={inputStyle} value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                <option value={ROOM_TYPES.LECTURE}>Lecture</option>
                <option value={ROOM_TYPES.LAB}>Laboratory</option>
                <option value={ROOM_TYPES.SEMINAR}>Seminar</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '25px', padding: '10px', background: 'var(--bg-main)', borderRadius: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={formData.hasComputers} onChange={e => setFormData({ ...formData, hasComputers: e.target.checked })} style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }} /> Has Computers
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={formData.hasProjector} onChange={e => setFormData({ ...formData, hasProjector: e.target.checked })} style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }} /> Has Projector
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>Cancel</button>
              <button className="btn" onClick={handleSave}>Save Room</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomManagement;