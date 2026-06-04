import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { DEPARTMENTS } from '../../config/constants';

const SubjectManagement = ({ subjects, onBack }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  const [formData, setFormData] = useState({
    id: '', code: '', name: '', departments: [], credits: 3, requiredLab: false, hoursPerMeeting: 1.5
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', code: '', name: '', departments: [], credits: 3, requiredLab: false, hoursPerMeeting: 1.5 });
    setEditMode(false);
    setShowModal(true);
  };

  const handleOpenEdit = (subject) => {
    // Normalize: convert old single `department` string into `departments` array
    const normalized = { ...subject };
    if (!normalized.departments) {
      normalized.departments = normalized.department ? [normalized.department] : [];
    }
    setFormData(normalized);
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
      try {
        await deleteDoc(doc(db, 'subjects', id.toString()));
      } catch (error) {
        console.error("Error deleting subject: ", error);
        alert('Failed to delete subject. Please check your connection.');
      }
    }
  };

  const handleDeptToggle = (dept) => {
    setFormData(prev => {
      const current = prev.departments || [];
      if (current.includes(dept)) {
        return { ...prev, departments: current.filter(d => d !== dept) };
      } else {
        return { ...prev, departments: [...current, dept] };
      }
    });
  };

  // Helper to display departments (handles both old string and new array format)
  const getSubjectDepts = (subject) => {
    if (Array.isArray(subject.departments) && subject.departments.length > 0) return subject.departments;
    if (subject.department) return [subject.department];
    return [];
  };



  return (
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
              Subject Requirements
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage courses and their scheduling constraints</p>
          </div>
        </div>
        <button className="btn" onClick={handleOpenAdd}>+ Add Subject</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Code</th><th>Name</th><th>Department(s)</th><th>Units</th><th>Meeting Time</th><th>Lab Required</th><th>Actions</th></tr></thead>
        <tbody>
          {subjects.map(s => (
            <tr key={s.id}>
              <td><strong style={{ color: 'var(--accent-primary)' }}>{s.code}</strong></td>
              <td style={{ fontWeight: '500' }}>{s.name}</td>
              <td>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {getSubjectDepts(s).length > 0 ? getSubjectDepts(s).map(dept => (
                    <span key={dept} style={{ background: 'var(--bg-main)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600', color: 'var(--accent-primary)' }}>{dept}</span>
                  )) : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>None</span>}
                </div>
              </td>
              <td style={{ fontWeight: '500', textAlign: 'center' }}>{s.credits || 3}</td>
              <td style={{ fontWeight: '500', color: 'var(--text-muted)' }}>{s.hoursPerMeeting || 1.5} hrs</td>
              <td>
                <span style={{
                  background: s.requiredLab ? 'var(--danger-bg)' : 'var(--success-bg)',
                  color: s.requiredLab ? 'var(--danger)' : 'var(--success)',
                  padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600'
                }}>
                  {s.requiredLab ? 'Yes' : 'No'}
                </span>
              </td>
              <td>
                <button style={{ color: 'var(--accent-primary)', border: 'none', background: 'none', cursor: 'pointer', marginRight: '15px', fontWeight: '500' }} onClick={() => handleOpenEdit(s)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Edit</button>
                <button style={{ color: 'var(--danger)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: '500' }} onClick={() => handleDelete(s.id)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '450px' }}>
            <h3>{editMode ? 'Edit Subject' : 'Add New Subject'}</h3>

            <div className="form-group"><label className="form-label">Subject Code</label><input className="form-input" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. CS101" /></div>
            <div className="form-group"><label className="form-label">Subject Name</label><input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Intro to Programming" /></div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Departments</label>
              <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: '12px', background: 'var(--bg-main)' }}>
                {DEPARTMENTS.map(dept => (
                  <label key={dept} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: '500', color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.departments || []).includes(dept)}
                      onChange={() => handleDeptToggle(dept)}
                      style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                    />
                    {dept}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '6px 0 0', fontWeight: '500' }}>Select all departments that offer this subject</p>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Total Units (Credits)</label>
                <input type="number" className="form-input" value={formData.credits || 3} onChange={e => setFormData({ ...formData, credits: Number(e.target.value) })} />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Hours per Meeting</label>
                <select className="form-select" value={formData.hoursPerMeeting || 1.5} onChange={e => setFormData({ ...formData, hoursPerMeeting: Number(e.target.value) })}>
                  <option value={1}>1.0 Hours</option>
                  <option value={1.5}>1.5 Hours</option>
                  <option value={2}>2.0 Hours</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '25px', padding: '14px 16px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={formData.requiredLab} onChange={e => setFormData({ ...formData, requiredLab: e.target.checked })} style={{ accentColor: 'var(--accent-primary)', width: '18px', height: '18px' }} /> Requires Computer Laboratory
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 18px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: 'var(--text-muted)' }}>Cancel</button>
              <button className="btn" onClick={handleSave}>Save Subject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubjectManagement;