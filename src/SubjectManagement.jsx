import React, { useState } from 'react';
import { db } from './firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

const SubjectManagement = ({ subjects }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  
  const [formData, setFormData] = useState({
    id: '', code: '', name: '', department: 'Computer Science', credits: 3, capacity: 40, requiredLab: false, hoursPerWeek: 3
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', code: '', name: '', department: 'Computer Science', credits: 3, capacity: 40, requiredLab: false, hoursPerWeek: 3 });
    setEditMode(false);
    setShowModal(true);
  };

  const handleOpenEdit = (subject) => {
    setFormData(subject);
    setCurrentId(subject.id);
    setEditMode(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (editMode) {
      await updateDoc(doc(db, 'subjects', currentId.toString()), formData);
    } else {
      const newId = formData.id || `S${Date.now().toString().slice(-4)}`;
      await addDoc(collection(db, 'subjects'), { ...formData, id: newId });
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if(window.confirm('Are you sure you want to delete this subject?')) {
      await deleteDoc(doc(db, 'subjects', id.toString()));
    }
  };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 className="card-title" style={{ margin: 0 }}>Subject Constraints</h3>
        <button className="btn" onClick={handleOpenAdd}>+ Add Subject</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Code</th><th>Name</th><th>Lab Required</th><th>Capacity</th><th>Actions</th></tr></thead>
        <tbody>
          {subjects.map(s => (
            <tr key={s.id}>
              <td><strong>{s.code}</strong></td>
              <td>{s.name}</td>
              <td>{s.requiredLab ? 'Yes 💻' : 'No'}</td>
              <td>{s.capacity} pax</td>
              <td>
                <button style={{ color: '#0288d1', border: 'none', background: 'none', cursor: 'pointer', marginRight: '10px' }} onClick={() => handleOpenEdit(s)}>Edit</button>
                <button style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => handleDelete(s.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'left' }}>
            <h3>{editMode ? 'Edit Subject' : 'Add New Subject'}</h3>
            <div className="form-group">
              <label>Subject Code</label>
              <input className="form-control" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Subject Name</label>
              <input className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Capacity</label>
              <input type="number" className="form-control" value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '15px' }}>
              <label><input type="checkbox" checked={formData.requiredLab} onChange={e => setFormData({ ...formData, requiredLab: e.target.checked })} /> Requires Lab</label>
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

export default SubjectManagement;
