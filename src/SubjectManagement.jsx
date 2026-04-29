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
    if (window.confirm('Are you sure you want to delete this subject?')) {
      await deleteDoc(doc(db, 'subjects', id.toString()));
    }
  };

  const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box', marginTop: '5px' };
  const labelStyle = { display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '500' };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            Subject Requirements
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage courses and their scheduling constraints</p>
        </div>
        <button className="btn" onClick={handleOpenAdd}>+ Add Subject</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Code</th><th>Name</th><th>Lab Required</th><th>Capacity</th><th>Actions</th></tr></thead>
        <tbody>
          {subjects.map(s => (
            <tr key={s.id}>
              <td><strong style={{ color: 'var(--accent-primary)' }}>{s.code}</strong></td>
              <td style={{ fontWeight: '500' }}>{s.name}</td>
              <td>
                <span style={{
                  background: s.requiredLab ? 'var(--danger-bg)' : 'var(--success-bg)',
                  color: s.requiredLab ? 'var(--danger)' : 'var(--success)',
                  padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600'
                }}>
                  {s.requiredLab ? 'Yes' : 'No'}
                </span>
              </td>
              <td style={{ color: 'var(--text-muted)' }}>{s.capacity} pax</td>
              <td>
                <button style={{ color: 'var(--accent-primary)', border: 'none', background: 'none', cursor: 'pointer', marginRight: '15px', fontWeight: '500' }} onClick={() => handleOpenEdit(s)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Edit</button>
                <button style={{ color: 'var(--danger)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: '500' }} onClick={() => handleDelete(s.id)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ backgroundColor: 'var(--card-bg)', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-dark)', marginBottom: '20px' }}>{editMode ? 'Edit Subject' : 'Add New Subject'}</h3>

            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>Subject Code</label><input style={inputStyle} value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. CS101" /></div>
            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>Subject Name</label><input style={inputStyle} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Intro to Programming" /></div>
            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>Student Capacity</label><input type="number" style={inputStyle} value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })} /></div>

            <div style={{ marginBottom: '25px', padding: '10px', background: 'var(--bg-main)', borderRadius: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input type="checkbox" checked={formData.requiredLab} onChange={e => setFormData({ ...formData, requiredLab: e.target.checked })} style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }} /> Requires Computer Laboratory
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>Cancel</button>
              <button className="btn" onClick={handleSave}>Save Subject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubjectManagement;