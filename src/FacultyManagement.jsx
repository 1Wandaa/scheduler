import React, { useState } from 'react';
import { db } from './firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

const FacultyManagement = ({ professors, subjects = [], rooms = [] }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  const [formData, setFormData] = useState({
    id: '', name: '', department: 'Computer Science', maxUnits: 12, specialization: [], preferredRooms: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', department: 'Computer Science', maxUnits: 12, specialization: [], preferredRooms: [] });
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
    setFormData({
      ...prof,
      preferredRooms: prof.preferredRooms || [] // Ensure array exists
    });
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
    if (window.confirm('Are you sure you want to delete this faculty member?')) {
      try {
        await deleteDoc(doc(db, 'professors', id.toString()));
      } catch (error) {
        console.error("Error deleting faculty: ", error);
        alert('Failed to delete faculty member. Please check your connection.');
      }
    }
  };

  const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box', marginTop: '5px' };
  const labelStyle = { display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '500' };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            Faculty Database
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage instructor details, teaching load, and room preferences</p>
        </div>
        <button className="btn" onClick={handleOpenAdd}>+ Add Faculty</button>
      </div>

      <table className="data-table">
        <thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Max Load</th><th>Subjects</th><th>Rooms</th><th>Actions</th></tr></thead>
        <tbody>
          {professors.map(p => (
            <tr key={p.id}>
              <td style={{ color: 'var(--text-muted)' }}>{p.id}</td>
              <td><strong style={{ color: 'var(--text-main)' }}>{p.name}</strong></td>
              <td>{p.department}</td>
              <td><span style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '600' }}>{p.maxUnits || p.maxHours || 12} units</span></td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {(p.specialization || []).length} subject{(p.specialization || []).length !== 1 ? 's' : ''}
              </td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {(p.preferredRooms || []).length} room{(p.preferredRooms || []).length !== 1 ? 's' : ''}
              </td>
              <td>
                <button style={{ color: 'var(--accent-primary)', border: 'none', background: 'none', cursor: 'pointer', marginRight: '15px', fontWeight: '500' }} onClick={() => handleOpenEdit(p)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Edit</button>
                <button style={{ color: 'var(--danger)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: '500' }} onClick={() => handleDelete(p.id)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ backgroundColor: 'var(--card-bg)', padding: '30px', borderRadius: '12px', width: '500px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-dark)', marginBottom: '20px' }}>{editMode ? 'Edit Faculty' : 'Add New Faculty'}</h3>

            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>Faculty ID</label><input style={inputStyle} value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} disabled={editMode} placeholder="e.g. P001" /></div>
            <div style={{ marginBottom: '15px' }}><label style={labelStyle}>Full Name</label><input style={inputStyle} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Dr. John Smith" /></div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Department</label>
                <input style={inputStyle} value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} placeholder="e.g. Computer Science" />
              </div>
              <div style={{ width: '120px' }}>
                <label style={labelStyle}>Max Units</label>
                <input type="number" style={inputStyle} value={formData.maxUnits} onChange={e => setFormData({ ...formData, maxUnits: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={labelStyle}>Assigned Subjects</label>
              <div style={{ marginTop: '8px', maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px' }}>
                {subjects.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No subjects available.</p>}
                {subjects.map(sub => (
                  <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.88rem', borderBottom: '1px solid var(--bg-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.specialization || []).includes(sub.id)}
                      onChange={() => handleSubjectToggle(sub.id)}
                      style={{ accentColor: 'var(--accent-primary)', width: '15px', height: '15px' }}
                    />
                    <span style={{ fontWeight: '600', color: 'var(--accent-primary)' }}>{sub.code}</span>
                    <span>{sub.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={labelStyle}>Preferred Rooms (Optional)</label>
              <div style={{ marginTop: '8px', maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px' }}>
                {rooms.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No rooms available.</p>}
                {rooms.map(room => (
                  <label key={room.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.88rem', borderBottom: '1px solid var(--bg-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.preferredRooms || []).includes(room.id)}
                      onChange={() => handleRoomToggle(room.id)}
                      style={{ accentColor: 'var(--accent-primary)', width: '15px', height: '15px' }}
                    />
                    <span style={{ fontWeight: '600', color: 'var(--accent-primary)' }}>{room.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>Cancel</button>
              <button className="btn" onClick={handleSave}>Save Faculty</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacultyManagement;