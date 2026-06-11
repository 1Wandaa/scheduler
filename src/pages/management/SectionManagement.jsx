import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { DEPARTMENTS } from '../../config/constants';

// Map full program names to their short department codes for grouping
const PROGRAM_DEPARTMENTS = {
  'Bachelor of Science in Computer Science': 'BSCS',
  'BS Computer Science': 'BSCS',
  'Bachelor of Science in Food Technology': 'BSFT',
  'BS Food Technology': 'BSFT',
  'Bachelor of Science in Office Administration': 'BSOA',
  'BS Office Administration': 'BSOA',
  'Bachelor of Arts in English Language': 'BAEL',
  'BA English Language': 'BAEL',
  'BS Information Technology': 'BSIT',
};

const SectionManagement = ({ sections, subjects, onBack }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    id: '', name: '', program: '', yearLevel: 1, subjects: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', program: '', yearLevel: 1, subjects: [] });
    setEditMode(false);
    setError(null);
    setSubjectSearchQuery('');
    setShowModal(true);
  };

  const handleOpenEdit = (section) => {
    setFormData({ ...section });
    setCurrentId(section.id);
    setEditMode(true);
    setError(null);
    setSubjectSearchQuery('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!formData.name || !formData.program) {
      setError("Section name and program are required.");
      return;
    }

    const normalize = str => (str || '').replace(/\s+/g, '').toUpperCase();
    const isDuplicate = sections.some(s => s.id !== currentId && normalize(s.name) === normalize(formData.name));

    if (isDuplicate) {
      setError(`A section named "${formData.name}" already exists.`);
      return;
    }

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

  // Helper function to render a formatted table for each department group
  const renderSectionTable = (sectionList, title, titleColor = 'var(--accent-primary)') => {
    if (sectionList.length === 0) return null;
    return (
      <div style={{ marginBottom: '30px' }}>
        <h4 style={{
          color: titleColor,
          marginBottom: '12px',
          borderBottom: `2px solid ${titleColor}`,
          paddingBottom: '5px',
          display: 'inline-block',
          marginTop: '10px'
        }}>
          {title}
        </h4>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Section Name</th>
              <th style={{ textAlign: 'center' }}>Program</th>
              <th style={{ textAlign: 'center' }}>Year</th>
              <th style={{ textAlign: 'center' }}>Subjects</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sectionList.map(sec => (
              <tr key={sec.id}>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}><strong style={{ color: 'var(--accent-primary)' }}>{sec.name}</strong></td>
                <td style={{ fontWeight: '500', textAlign: 'center', verticalAlign: 'middle' }}>{PROGRAM_DEPARTMENTS[sec.program] || sec.program}</td>
                {/* Added whiteSpace: 'nowrap' to fix the text wrapping issue */}
                <td style={{ whiteSpace: 'nowrap', textAlign: 'center', verticalAlign: 'middle' }}>
                  <span style={{
                    background: '#EEF2FF', color: '#5645EE',
                    padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600',
                    display: 'inline-block', whiteSpace: 'nowrap'
                  }}>
                    Year {sec.yearLevel}
                  </span>
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '280px', textAlign: 'center', verticalAlign: 'middle' }}>
                  {(sec.subjects || []).length === 0 ? (
                    <span style={{ fontStyle: 'italic' }}>None</span>
                  ) : (
                    <span title={(sec.subjects || []).map(getSubjectName).join(', ')}>
                      {(sec.subjects || []).slice(0, 3).map(getSubjectName).join('; ')}
                      {(sec.subjects || []).length > 3 ? ` +${(sec.subjects || []).length - 3}` : ''}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  <button className="btn-edit" onClick={() => handleOpenEdit(sec)}>Edit</button>
                  <button className="btn-delete" onClick={() => handleDelete(sec.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.placeholder && e.target.placeholder.toLowerCase().includes('search')) return;
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <>
      <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
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

        {/* Search Bar */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Search section name or program..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            style={{ flex: 1, maxWidth: '300px' }}
          />
        </div>

        {/* Render sections grouped by their Department */}
        {DEPARTMENTS.map(dept => {
          const deptSections = sections
            .filter(sec => sec.name.toLowerCase().includes(searchQuery.toLowerCase()) || sec.program.toLowerCase().includes(searchQuery.toLowerCase()))
            .filter(sec => sec.program === dept || PROGRAM_DEPARTMENTS[sec.program] === dept)
            .sort((a, b) => {
              if (a.yearLevel !== b.yearLevel) return a.yearLevel - b.yearLevel;
              return a.name.localeCompare(b.name);
            });
          return renderSectionTable(deptSections, `${dept} Sections`, "var(--accent-primary)");
        })}

        {/* Render any sections that do not match the standard program list */}
        {renderSectionTable(
          sections
            .filter(sec => sec.name.toLowerCase().includes(searchQuery.toLowerCase()) || sec.program.toLowerCase().includes(searchQuery.toLowerCase()))
            .filter(sec => !DEPARTMENTS.includes(sec.program) && !DEPARTMENTS.includes(PROGRAM_DEPARTMENTS[sec.program]))
            .sort((a, b) => {
              if (a.yearLevel !== b.yearLevel) return a.yearLevel - b.yearLevel;
              return a.name.localeCompare(b.name);
            }),
          "Other / Unassigned Sections",
          "var(--text-muted)"
        )}

        {sections.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '5px' }}>No sections yet</p>
            <p style={{ fontSize: '0.85rem' }}>Add sections to enable auto-scheduling with the Genetic Algorithm</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '500px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Section' : 'Add New Section'}</h3>
            {error && (
              <div style={{ position: 'sticky', top: '0', zIndex: 10, padding: '10px 15px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.3s', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Section Name</label>
              <input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. BSCS 1A" />
            </div>
            <div className="form-group">
              <label className="form-label">Program</label>
              <select className="form-select" value={formData.program} onChange={e => setFormData({ ...formData, program: e.target.value })}>
                <option value="">Select Program</option>
                {DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Year Level</label>
              <select className="form-select" value={formData.yearLevel} onChange={e => setFormData({ ...formData, yearLevel: parseInt(e.target.value) })}>
                <option value={1}>1st Year</option>
                <option value={2}>2nd Year</option>
                <option value={3}>3rd Year</option>
                <option value={4}>4th Year</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '25px' }}>
              <label className="form-label">Enrolled Subjects</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search subject code or name..." 
                value={subjectSearchQuery} 
                onChange={(e) => setSubjectSearchQuery(e.target.value)}
                style={{ marginBottom: '10px', marginTop: '5px' }}
              />
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: 'var(--bg-main)' }}>
                {subjects.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>No subjects available. Add subjects first.</p>}
                {[...subjects]
                  .filter(sub => 
                    (sub.code || '').toLowerCase().includes(subjectSearchQuery.toLowerCase()) || 
                    (sub.name || '').toLowerCase().includes(subjectSearchQuery.toLowerCase())
                  )
                  .sort((a, b) => ((a.code || '').replace(/\s+/g, '').toUpperCase()).localeCompare(((b.code || '').replace(/\s+/g, '').toUpperCase()), undefined, { numeric: true, sensitivity: 'base' })).map(sub => (
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
    </>
  );
};

export default SectionManagement;