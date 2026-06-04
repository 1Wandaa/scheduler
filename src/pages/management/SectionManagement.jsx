import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

const SectionManagement = ({ sections, subjects, onBack }) => {
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              Section Management
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage student sections and their enrolled subjects</p>
          </div>
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
              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '280px' }}>
                {(sec.subjects || []).length === 0 ? (
                  <span style={{ fontStyle: 'italic' }}>None</span>
                ) : (
                  <span title={(sec.subjects || []).map(getSubjectName).join(', ')}>
                    {(sec.subjects || []).slice(0, 3).map(getSubjectName).join('; ')}
                    {(sec.subjects || []).length > 3 ? ` +${(sec.subjects || []).length - 3}` : ''}
                  </span>
                )}
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
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '500px' }}>
            <h3>{editMode ? 'Edit Section' : 'Add New Section'}</h3>

            <div className="form-group">
              <label className="form-label">Section Name</label>
              <input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. BSCS 1A" />
            </div>

            <div className="form-group">
              <label className="form-label">Program</label>
              <select className="form-select" value={formData.program} onChange={e => setFormData({ ...formData, program: e.target.value })}>
                <option value="">Select Program</option>
                <option value="Bachelor of Science in Computer Science">Bachelor of Science in Computer Science</option>
                <option value="Bachelor of Science in Food Technology">Bachelor of Science in Food Technology</option>
                <option value="Bachelor of Science in Office Administration">Bachelor of Science in Office Administration</option>
                <option value="Bachelor of Arts in English Language">Bachelor of Arts in English Language</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Year Level</label>
                <select className="form-select" value={formData.yearLevel} onChange={e => setFormData({ ...formData, yearLevel: parseInt(e.target.value) })}>
                  <option value={1}>1st Year</option>
                  <option value={2}>2nd Year</option>
                  <option value={3}>3rd Year</option>
                  <option value={4}>4th Year</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Student Count</label>
                <input type="number" className="form-input" value={formData.studentCount} onChange={e => setFormData({ ...formData, studentCount: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '25px' }}>
              <label className="form-label">Enrolled Subjects</label>
              <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: 'var(--bg-main)' }}>
                {subjects.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No subjects available. Add subjects first.</p>}
                {subjects.map(sub => (
                  <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={(formData.subjects || []).includes(sub.id)}
                      onChange={() => handleSubjectToggle(sub.id)}
                      style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: '600', color: 'var(--accent-dark)' }}>{sub.code}</span>
                    <span>{sub.name}</span>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: '500' }}>
                Selected: {(formData.subjects || []).length} subject(s)
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 18px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: 'var(--text-muted)' }}>Cancel</button>
              <button className="btn" onClick={handleSave}>Save Section</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SectionManagement;