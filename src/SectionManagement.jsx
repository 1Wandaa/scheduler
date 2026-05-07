import React, { useState } from 'react';
import { db } from './firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

const SectionManagement = ({ sections, subjects }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  const [formData, setFormData] = useState({
    id: '', name: '', program: '', yearLevel: 1, studentCount: 35, subjects: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', program: '', yearLevel: 1, studentCount: 35, subjects: [] });
    setEditMode(false);
    setShowModal(true);
  };

  const handleOpenEdit = (section) => {
    setFormData({ ...section });
    setCurrentId(section.id);
    setEditMode(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (editMode) {
      await updateDoc(doc(db, 'sections', currentId.toString()), formData);
    } else {
      const newId = formData.id || `SEC${Date.now().toString().slice(-4)}`;
      await addDoc(collection(db, 'sections'), { ...formData, id: newId });
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this section?')) {
      try {
        await deleteDoc(doc(db, 'sections', id.toString()));
      } catch (error) {
        console.error("Error deleting section: ", error);
        alert('Failed to delete section.');
      }
    }
  };

  const handleSubjectToggle = (subjectId) => {
    setFormData(prev => {
      const current = prev.subjects || [];
      if (current.includes(subjectId)) {
        return { ...prev, subjects: current.filter(s => s !== subjectId) };
      } else {
        return { ...prev, subjects: [...current, subjectId] };
      }
    });
  };

  const getSubjectName = (subId) => {
    const s = subjects.find(sub => sub.id === subId || sub.code === subId);
    return s ? `${s.code} - ${s.name}` : subId;
  };

  const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', boxSizing: 'border-box', marginTop: '5px' };
  const labelStyle = { display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '500' };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            Section Management
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage student sections and their enrolled subjects</p>
        </div>
        <button className="btn" onClick={handleOpenAdd}>+ Add Section</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Section Name</th>
            <th>Program</th>
            <th>Year</th>
            <th>Students</th>
            <th>Subjects</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sections.map(sec => (
            <tr key={sec.id}>
              <td><strong style={{ color: 'var(--accent-primary)' }}>{sec.name}</strong></td>
              <td style={{ fontWeight: '500' }}>{sec.program}</td>
              <td>
                <span style={{
                  background: 'var(--accent-light)', color: 'var(--accent-dark)',
                  padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600'
                }}>
                  Year {sec.yearLevel}
                </span>
              </td>
              <td style={{ color: 'var(--text-muted)' }}>{sec.studentCount} pax</td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '200px' }}>
                {(sec.subjects || []).length} subject{(sec.subjects || []).length !== 1 ? 's' : ''}
              </td>
              <td>
                <button style={{ color: 'var(--accent-primary)', border: 'none', background: 'none', cursor: 'pointer', marginRight: '15px', fontWeight: '500' }} onClick={() => handleOpenEdit(sec)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Edit</button>
                <button style={{ color: 'var(--danger)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: '500' }} onClick={() => handleDelete(sec.id)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sections.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '5px' }}>No sections yet</p>
          <p style={{ fontSize: '0.85rem' }}>Add sections to enable auto-scheduling with the Genetic Algorithm</p>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ backgroundColor: 'var(--card-bg)', padding: '30px', borderRadius: '12px', width: '500px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-dark)', marginBottom: '20px' }}>{editMode ? 'Edit Section' : 'Add New Section'}</h3>

            <div style={{ marginBottom: '15px' }}>
              <label style={labelStyle}>Section Name</label>
              <input style={inputStyle} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. BSCS 1A" />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={labelStyle}>Program</label>
              <select style={inputStyle} value={formData.program} onChange={e => setFormData({ ...formData, program: e.target.value })}>
                <option value="">Select Program</option>
                <option value="BS Computer Science">BS Computer Science</option>
                <option value="BS Information Technology">BS Information Technology</option>
                <option value="BS Information Systems">BS Information Systems</option>
                <option value="BS Education">BS Education</option>
                <option value="BS Business Administration">BS Business Administration</option>
                <option value="BS Agriculture">BS Agriculture</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Year Level</label>
                <select style={inputStyle} value={formData.yearLevel} onChange={e => setFormData({ ...formData, yearLevel: parseInt(e.target.value) })}>
                  <option value={1}>1st Year</option>
                  <option value={2}>2nd Year</option>
                  <option value={3}>3rd Year</option>
                  <option value={4}>4th Year</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Student Count</label>
                <input type="number" style={inputStyle} value={formData.studentCount} onChange={e => setFormData({ ...formData, studentCount: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={labelStyle}>Enrolled Subjects</label>
              <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px' }}>
                {subjects.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No subjects available. Add subjects first.</p>}
                {subjects.map(sub => (
                  <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.88rem', borderBottom: '1px solid var(--bg-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.subjects || []).includes(sub.id)}
                      onChange={() => handleSubjectToggle(sub.id)}
                      style={{ accentColor: 'var(--accent-primary)', width: '15px', height: '15px' }}
                    />
                    <span style={{ fontWeight: '600', color: 'var(--accent-primary)' }}>{sub.code}</span>
                    <span>{sub.name}</span>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                Selected: {(formData.subjects || []).length} subject(s)
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}>Cancel</button>
              <button className="btn" onClick={handleSave}>Save Section</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SectionManagement;
