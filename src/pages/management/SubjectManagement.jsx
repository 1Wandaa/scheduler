import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { DEPARTMENTS } from '../../config/constants';

const SubjectManagement = ({ subjects, onBack }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    id: '', code: '', name: '', departments: [], credits: 3, requiredLab: false, hoursPerMeeting: 1.5, category: 'Major'
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', code: '', name: '', departments: [], credits: 3, requiredLab: false, hoursPerMeeting: 1.5, category: 'Major' });
    setEditMode(false);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (subject) => {
    // Normalize: convert old single `department` string into `departments` array
    const normalized = { ...subject };
    if (!normalized.departments) {
      normalized.departments = normalized.department ? [normalized.department] : [];
    }
    // Set category fallback for older data
    normalized.category = normalized.category || 'Major';

    setFormData(normalized);
    setCurrentId(subject.id);
    setEditMode(true);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!formData.code || !formData.name) {
      setError("Subject code and name are required.");
      return;
    }
    
    const normalize = str => (str || '').replace(/\s+/g, '').toUpperCase();
    const isDuplicate = subjects.some(s => s.id !== currentId && normalize(s.code) === normalize(formData.code));
    
    if (isDuplicate) {
      setError(`A subject with the code "${formData.code}" already exists.`);
      return;
    }

    if (editMode) {
      await updateDoc(doc(db, 'subjects', currentId.toString()), formData);
    } else {
      const newId = formData.id || `S${Date.now().toString().slice(-4)}`;
      await addDoc(collection(db, 'subjects'), { ...formData, id: newId });
    }
    setShowModal(false);
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Subject?',
      text: "This action cannot be undone. Proceed?",
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'minimal-swal',
        title: 'minimal-title',
        htmlContainer: 'minimal-text',
        actions: 'minimal-actions',
        confirmButton: 'btn-delete',
        cancelButton: 'back-btn'
      },
      buttonsStyling: false,
      focusCancel: true
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'subjects', id.toString()));
        Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
      } catch (error) {
        console.error("Error deleting subject: ", error);
        Swal.fire({ title: 'Error', text: 'Failed to delete.', icon: 'error', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
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

  // Split subjects into categories
  const filteredSubjects = subjects.filter(s => 
    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (s.code || '').toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    const codeA = (a.code || '').replace(/\s+/g, '').toUpperCase();
    const codeB = (b.code || '').replace(/\s+/g, '').toUpperCase();
    return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
  });
  const minorSubjects = filteredSubjects.filter(s => s.category === 'Minor');
  const majorSubjects = filteredSubjects.filter(s => s.category !== 'Minor'); // Default to major

  // Helper to render a formatted table
  const renderSubjectTable = (subjectList, title, titleColor = 'var(--accent-primary)') => {
    if (subjectList.length === 0) return null;
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
              <th>Code</th><th>Name</th><th>Department(s)</th><th>Units</th><th>Meeting Time</th><th>Lab Required</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subjectList.map(s => (
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
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn-edit" onClick={() => handleOpenEdit(s)}>Edit</button>
                  <button className="btn-delete" onClick={() => handleDelete(s.id)}>Delete</button>
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

  const getDeptColor = (dept) => {
    switch(dept) {
      case 'BSCS': return '#109EEF'; // Blue
      case 'BAEL': return '#EAB308'; // Yellow
      case 'BSOA': return '#8B5CF6'; // Purple
      case 'BSFT': return '#16A34A'; // Green
      case 'SHARED': return '#64748B'; // Slate
      case 'Minor': return '#F5A623'; // Orange
      default: return 'var(--accent-primary)';
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                Subject Requirements
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage courses and their scheduling constraints</p>
            </div>
          </div>
          <button className="btn" onClick={handleOpenAdd}>+ Add Subject</button>
        </div>

        {/* Department Filter and Search Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Filter by:</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['All', 'Minor', ...DEPARTMENTS].map(dept => (
                <button
                  key={dept}
                  onClick={() => setDepartmentFilter(dept)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: departmentFilter === dept ? `1.5px solid ${getDeptColor(dept)}` : '1px solid var(--border-color)',
                    background: departmentFilter === dept ? getDeptColor(dept) : 'transparent',
                    color: departmentFilter === dept ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { if (departmentFilter !== dept) { e.target.style.borderColor = getDeptColor(dept); e.target.style.color = getDeptColor(dept); } }}
                  onMouseLeave={(e) => { if (departmentFilter !== dept) { e.target.style.borderColor = 'var(--border-color)'; e.target.style.color = 'var(--text-muted)'; } }}
                >
                  {dept === 'All' ? 'All Subjects' : dept === 'Minor' ? 'Minor Subjects' : dept}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search subject code or name..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ flex: 1, maxWidth: '300px' }}
            />
          </div>
        </div>

        {/* --- DYNAMIC TABLES INSTEAD OF ONE BIG TABLE --- */}

        {/* Render Minor Subjects First */}
        {(departmentFilter === 'All' || departmentFilter === 'Minor') && renderSubjectTable(minorSubjects, "Minor / General Education Subjects", "var(--warning)")}

        {/* Render Major Subjects grouped by Department */}
        {DEPARTMENTS.map(dept => {
          if (departmentFilter !== 'All' && departmentFilter !== dept) return null;
          const deptMajors = majorSubjects.filter(s => getSubjectDepts(s).includes(dept));
          return renderSubjectTable(deptMajors, `${dept} Major Subjects`, "var(--accent-primary)");
        })}

        {/* Fallback for major subjects that don't have a department assigned yet */}
        {(departmentFilter === 'All') && renderSubjectTable(
          majorSubjects.filter(s => getSubjectDepts(s).length === 0),
          "Unassigned Major Subjects",
          "var(--text-muted)"
        )}

      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '450px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Subject' : 'Add New Subject'}</h3>
            {error && (
              <div style={{ position: 'sticky', top: '0', zIndex: 10, padding: '10px 15px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.3s', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}
            <div className="form-group"><label className="form-label">Subject Code</label><input className="form-input" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. CS101" /></div>
            <div className="form-group"><label className="form-label">Subject Name</label><input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Intro to Programming" /></div>

            {/* Added Category Dropdown */}
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-select" value={formData.category || 'Major'} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                <option value="Major">Major Subject</option>
                <option value="Minor">Minor Subject</option>
              </select>
            </div>

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
                <input type="number" className="form-input" value={formData.credits === undefined ? 3 : formData.credits} onChange={e => setFormData({ ...formData, credits: e.target.value === '' ? '' : Number(e.target.value) })} />
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
    </>
  );
};

export default SubjectManagement;