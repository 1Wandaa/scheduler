import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { DEPARTMENTS, PROGRAM_DEPARTMENTS, getDeptColor } from '../../config/constants';
import SectionTable from '../../components/SectionTable/SectionTable';
import SubjectSelector from '../../components/SubjectSelector/SubjectSelector';

const SectionManagement = ({ sections, subjects, activeSemester, onBack }) => {
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '', name: '', program: '', yearLevel: 1, subjects: []
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', program: '', yearLevel: 1, subjects: [] });
    setEditMode(false);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (section) => {
    setFormData({ ...section });
    setCurrentId(section.id);
    setEditMode(true);
    setError(null);
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

    if (!formData.subjects || formData.subjects.length === 0) {
      const result = await Swal.fire({
        title: 'No Subjects Enrolled',
        text: 'Are you sure you want to create a section with no subjects?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, save it',
        cancelButtonText: 'Cancel'
      });
      if (!result.isConfirmed) return;
    }

    setIsSaving(true);
    try {
      if (editMode) {
        await updateDoc(doc(db, 'sections', currentId.toString()), formData);
      } else {
        const newId = formData.id || `SEC${Date.now().toString().slice(-4)}`;
        await addDoc(collection(db, 'sections'), { ...formData, id: newId });
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error saving section:", err);
      setError("Failed to save section. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Section?',
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
        await deleteDoc(doc(db, 'sections', id.toString()));
        Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
      } catch (error) {
        console.error("Error deleting section: ", error);
        Swal.fire({ title: 'Error', text: 'Failed to delete.', icon: 'error', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
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

  // Filter sections globally via useMemo for performance
  const filteredSections = useMemo(() => {
    return sections
      .filter(sec => sec.name.toLowerCase().includes(searchQuery.toLowerCase()) || sec.program.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (a.yearLevel !== b.yearLevel) return a.yearLevel - b.yearLevel;
        return a.name.localeCompare(b.name);
      });
  }, [sections, searchQuery]);

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

        {/* Department Filter and Search Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>Filter by Department:</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['All', ...DEPARTMENTS].map(dept => (
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
                  {dept === 'All' ? 'All Departments' : dept}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Search section name or program..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ flex: 1, maxWidth: '300px' }}
            />
          </div>
        </div>

        {/* Render sections grouped by their Department */}
        {DEPARTMENTS.map(dept => {
          if (departmentFilter !== 'All' && departmentFilter !== dept) return null;
          const deptSections = filteredSections.filter(sec => sec.program === dept || PROGRAM_DEPARTMENTS[sec.program] === dept);
          return (
            <SectionTable 
              key={dept}
              sectionList={deptSections} 
              title={`${dept} Sections`} 
              titleColor="var(--accent-primary)" 
              onEdit={handleOpenEdit} 
              onDelete={handleDelete}
              subjects={subjects}
            />
          );
        })}

        {/* Render any sections that do not match the standard program list */}
        {(departmentFilter === 'All') && (
          <SectionTable 
            sectionList={filteredSections.filter(sec => !DEPARTMENTS.includes(sec.program) && !DEPARTMENTS.includes(PROGRAM_DEPARTMENTS[sec.program]))} 
            title="Other / Unassigned Sections" 
            titleColor="var(--text-muted)" 
            onEdit={handleOpenEdit} 
            onDelete={handleDelete}
            subjects={subjects}
          />
        )}

        {sections.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '5px' }}>No sections yet</p>
            <p style={{ fontSize: '0.85rem' }}>Add sections to enable the Auto-Scheduler</p>
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
            <SubjectSelector
              subjects={subjects}
              activeSemester={activeSemester}
              selectedSubjects={formData.subjects}
              onToggleSubject={handleSubjectToggle}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 18px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: 'var(--text-muted)' }} disabled={isSaving}>Cancel</button>
              <button className="btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Section'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SectionManagement;