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
    setCurrentId(room.id); // Firestore document ID
    setEditMode(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (editMode) {
      await updateDoc(doc(db, 'rooms', currentId.toString()), formData);
    } else {
      // Create new
      const newId = formData.id || `R${Date.now().toString().slice(-4)}`;
      await addDoc(collection(db, 'rooms'), { ...formData, id: newId });
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if(window.confirm('Are you sure you want to delete this room?')) {
      await deleteDoc(doc(db, 'rooms', id.toString()));
    }
  };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 className="card-title" style={{ margin: 0 }}>Manage Rooms</h3>
        <button className="btn" onClick={handleOpenAdd}>+ Add Room</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Capacity</th><th>Actions</th></tr></thead>
        <tbody>
          {rooms.map(r => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td><strong>{r.name}</strong></td>
              <td>{r.type.toUpperCase()} {r.hasComputers && '💻'}</td>
              <td>{r.capacity} pax</td>
              <td>
                <button style={{ color: '#0288d1', border: 'none', background: 'none', cursor: 'pointer', marginRight: '10px' }} onClick={() => handleOpenEdit(r)}>Edit</button>
                <button style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => handleDelete(r.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'left' }}>
            <h3>{editMode ? 'Edit Room' : 'Add New Room'}</h3>
            <div className="form-group">
              <label>Room Code (e.g. R101)</label>
              <input className="form-control" value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} disabled={editMode} />
            </div>
            <div className="form-group">
              <label>Room Name</label>
              <input className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Capacity</label>
              <input type="number" className="form-control" value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Room Type</label>
              <select className="form-control" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                <option value={ROOM_TYPES.LECTURE}>Lecture</option>
                <option value={ROOM_TYPES.LAB}>Laboratory</option>
                <option value={ROOM_TYPES.SEMINAR}>Seminar</option>
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '15px' }}>
              <label><input type="checkbox" checked={formData.hasComputers} onChange={e => setFormData({ ...formData, hasComputers: e.target.checked })} /> Has Computers</label>
              <label><input type="checkbox" checked={formData.hasProjector} onChange={e => setFormData({ ...formData, hasProjector: e.target.checked })} /> Has Projector</label>
            </div>
            <div className="modal-actions">
              <button className="btn-submit" onClick={handleSave}>Save</button>
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomManagement;
