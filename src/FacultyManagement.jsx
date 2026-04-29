import React, { useState } from 'react';
import { db } from './firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

const FacultyManagement = ({ professors }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  
  const [formData, setFormData] = useState({
    id: '', name: '', department: 'Computer Science', maxHours: 12, specialization: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', department: 'Computer Science', maxHours: 12, specialization: [] });
    setEditMode(false);
    setShowModal(true);
  };

  const handleOpenEdit = (prof) => {
    setFormData(prof);
    setCurrentId(prof.id);
    setEditMode(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (editMode) {
      await updateDoc(doc(db, 'professors', currentId.toString()), formData);
    } else {
      const newId = formData.id || `P${Date.now().toString().slice(-4)}`;
      await addDoc(collection(db, 'professors'), { ...formData, id: newId });
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if(window.confirm('Are you sure you want to delete this faculty member?')) {
      await deleteDoc(doc(db, 'professors', id.toString()));
    }
  };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 className="card-title" style={{ margin: 0 }}>Faculty Database</h3>
        <button className="btn" onClick={handleOpenAdd}>+ Add Faculty</button>
      </div>

      <table className="data-table">
        <thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Max Load</th><th>Actions</th></tr></thead>
        <tbody>
          {professors.map(p => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td><strong>{p.name}</strong></td>
              <td>{p.department}</td>
              <td>{p.maxHours} hrs</td>
              <td>
                <button style={{ color: '#0288d1', border: 'none', background: 'none', cursor: 'pointer', marginRight: '10px' }} onClick={() => handleOpenEdit(p)}>Edit</button>
                <button style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => handleDelete(p.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'left' }}>
            <h3>{editMode ? 'Edit Faculty' : 'Add New Faculty'}</h3>
            <div className="form-group">
              <label>Faculty ID</label>
              <input className="form-control" value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} disabled={editMode} />
            </div>
            <div className="form-group">
              <label>Full Name</label>
              <input className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Department</label>
              <input className="form-control" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Max Hours</label>
              <input type="number" className="form-control" value={formData.maxHours} onChange={e => setFormData({ ...formData, maxHours: parseInt(e.target.value) || 0 })} />
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

export default FacultyManagement;
