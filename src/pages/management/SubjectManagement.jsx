import React, { useState, useMemo } from 'react';
import { db } from '../../config/firebase';
import SubjectTable, { getSubjectDepts } from '../../components/SubjectTable/SubjectTable';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { deleteSubjectCascade } from '../../services/cascadeDeleteService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { DEPARTMENTS, getDeptColor } from '../../config/constants';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

const SubjectManagement = ({ subjects, professors, sections, schedules, availableSemesters = [], activeSemester, departments = [], onBack, user }) => {
  const { confirm } = useGlobalDialog();
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '', code: '', name: '', departments: [], credits: 3, requiredLab: false, isFoodLab: false, hoursPerMeeting: 1.5, category: 'Major', semester: activeSemester || (availableSemesters[0] || '')
  });

  const handleOpenAdd = () => {
    setFormData({ id: '', code: '', name: '', departments: [], credits: 3, requiredLab: false, isFoodLab: false, hoursPerMeeting: 1.5, category: 'Major', semester: activeSemester || (availableSemesters[0] || '') });
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
    normalized.semester = (normalized.semester && normalized.semester !== 'Both') ? normalized.semester : (normalized.category === 'Minor' ? 'Both' : (activeSemester || (availableSemesters[0] || '')));

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

    if (formData.category !== 'Minor' && (!formData.departments || formData.departments.length === 0)) {
      setError("Major subjects must have at least one department assigned.");
      return;
    }
    
    const normalize = str => (str || '').replace(/\s+/g, '').toUpperCase();
    const isDuplicate = subjects.some(s => s.id !== currentId && normalize(s.code) === normalize(formData.code));
    
    if (isDuplicate) {
      setError(`A subject with the code "${formData.code}" already exists.`);
      return;
    }

    setIsSaving(true);
    try {
      if (editMode) {
        await updateDoc(doc(db, 'subjects', currentId.toString()), formData);
        logActivity({ user, action: LOG_ACTIONS.UPDATE_SUBJECT, details: `Updated subject: ${formData.code} - ${formData.name}` });
      } else {
        const newId = formData.id || `S${Date.now().toString().slice(-4)}`;
        await addDoc(collection(db, 'subjects'), { ...formData, id: newId });
        logActivity({ user, action: LOG_ACTIONS.ADD_SUBJECT, details: `Added new subject: ${formData.code} - ${formData.name} (${formData.credits} units)` });
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error saving subject:", err);
      setError("Failed to save subject. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Subject?',
      text: "This action cannot be undone. Proceed?",
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });

    if (isConfirmed) {
      const subjectToDelete = subjects.find(s => s.id === id);
      try {
        await deleteSubjectCascade(subjectToDelete, professors, sections, schedules);
        logActivity({ user, action: LOG_ACTIONS.DELETE_SUBJECT, details: `Deleted subject: ${subjectToDelete?.code || id}` });
        toast.success('Subject deleted successfully');
      } catch (err) {
        console.error("Error deleting subject:", err);
        toast.error('Failed to delete subject');
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

  // Split subjects into categories using useMemo for performance
  const { minorSubjects, majorSubjects } = useMemo(() => {
    const filteredSubjects = subjects.filter(s => {
      const matchesSemester = !s.semester || s.semester === 'Both' || s.semester === activeSemester;
      const searchLowerCode = searchQuery.toLowerCase().replace(/\s+/g, '');
      const codeMatch = (s.code || '').toLowerCase().replace(/\s+/g, '').includes(searchLowerCode);
      const nameMatch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      if (searchQuery.trim() !== '') {
        return codeMatch || nameMatch;
      }
      return matchesSemester;
    }).sort((a, b) => {
      const codeA = (a.code || '').replace(/\s+/g, '').toUpperCase();
      const codeB = (b.code || '').replace(/\s+/g, '').toUpperCase();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    return {
      minorSubjects: filteredSubjects.filter(s => s.category === 'Minor'),
      majorSubjects: filteredSubjects.filter(s => s.category !== 'Minor') // Default to major
    };
  }, [subjects, searchQuery, activeSemester]);

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
        <div className="mgmt-header">
          <div className="mgmt-header-left">
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                Back
              </button>
            )}
            <div className="mgmt-header-info">
              <h3 className="card-title">
                <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                Subject Requirements
              </h3>
              <p>Manage courses and their scheduling constraints</p>
            </div>
          </div>
          <button className="btn" onClick={handleOpenAdd}>+ Add Subject</button>
        </div>

        {/* Department Filter and Search Bar */}
        <div className="mgmt-toolbar">
          <div className="mgmt-toolbar-row">
            <span className="mgmt-toolbar-label">Filter by:</span>
            <div className="mgmt-filter-pills">
              {['All', 'Minor', ...(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)].map(dept => {
                const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
                const isActive = departmentFilter === dept;
                return (
                <button
                  key={dept}
                  className={`mgmt-filter-pill${isActive ? ' active' : ''}`}
                  onClick={() => setDepartmentFilter(dept)}
                  style={isActive ? { background: deptColor, borderColor: deptColor } : undefined}
                >
                  {dept === 'All' ? 'All Subjects' : dept === 'Minor' ? 'Minor Subjects' : dept}
                </button>
              )})}
            </div>
          </div>
          <div className="mgmt-search-wrapper">
            <span className="mgmt-search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input 
              type="text" 
              className="mgmt-search-input" 
              placeholder="Search subject code or name..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ maxWidth: '300px' }}
            />
          </div>
        </div>

        {/* --- DYNAMIC TABLES INSTEAD OF ONE BIG TABLE --- */}

        {/* Render Minor Subjects First */}
        {(departmentFilter === 'All' || departmentFilter === 'Minor') && (
          <SubjectTable 
            subjectList={minorSubjects} 
            title="Minor Subjects" 
            titleColor={getDeptColor('Minor')} 
            onEdit={handleOpenEdit} 
            onDelete={handleDelete} 
            departments={departments}
          />
        )}

        {/* Render Major Subjects grouped by Department */}
        {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => {
          if (departmentFilter !== 'All' && departmentFilter !== dept) return null;
          const deptMajors = majorSubjects.filter(s => getSubjectDepts(s).includes(dept));
          const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
          
          return (
            <SubjectTable 
              key={dept}
              subjectList={deptMajors} 
              title={`${dept} Major Subjects`} 
              titleColor={deptColor} 
              onEdit={handleOpenEdit} 
              onDelete={handleDelete} 
              departments={departments}
            />
          );
        })}

        {/* Fallback for major subjects that don't have a department assigned yet */}
        {(departmentFilter === 'All') && (
          <SubjectTable 
            subjectList={majorSubjects.filter(s => getSubjectDepts(s).length === 0)} 
            title="Unassigned Major Subjects" 
            titleColor="var(--text-muted)" 
            onEdit={handleOpenEdit} 
            onDelete={handleDelete} 
            departments={departments}
          />
        )}

      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '450px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Subject' : 'Add New Subject'}</h3>
            {error && (
              <div className="mgmt-modal-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}
            <div className="form-group"><label className="form-label">Subject Code</label><input className="form-input" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. CS101" /></div>
            <div className="form-group"><label className="form-label">Subject Name</label><input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Intro to Programming" /></div>

            <div style={{ display: 'flex', gap: '15px' }}>
              {/* Added Category Dropdown */}
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Category</label>
                <select className="form-select" value={formData.category || 'Major'} onChange={e => {
                  const newCategory = e.target.value;
                  const updates = { category: newCategory };
                  if (newCategory !== 'Minor' && formData.semester === 'Both') {
                    updates.semester = activeSemester || availableSemesters[0] || '';
                  }
                  setFormData({ ...formData, ...updates });
                }}>
                  <option value="Major">Major Subject</option>
                  <option value="Minor">Minor Subject</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Semester</label>
                <select className="form-select" value={formData.semester || (activeSemester || (availableSemesters[0] || ''))} onChange={e => setFormData({ ...formData, semester: e.target.value })}>
                  {availableSemesters.map(sem => (
                    <option key={sem} value={sem}>{sem}</option>
                  ))}
                  {formData.category === 'Minor' && <option value="Both">Both Semesters</option>}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Departments</label>
              <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: '12px', background: 'var(--bg-main)' }}>
                {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => (
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
                  <option value={2.5}>2.5 Hours</option>
                  <option value={3}>3.0 Hours</option>
                  <option value={4}>4.0 Hours</option>
                  <option value={5}>5.0 Hours</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '25px', padding: '14px 16px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={formData.requiredLab} onChange={e => setFormData({ ...formData, requiredLab: e.target.checked, isFoodLab: e.target.checked ? false : formData.isFoodLab })} style={{ accentColor: 'var(--accent-primary)', width: '18px', height: '18px' }} /> Requires Computer Laboratory
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={formData.isFoodLab} onChange={e => setFormData({ ...formData, isFoodLab: e.target.checked, requiredLab: e.target.checked ? false : formData.requiredLab })} style={{ accentColor: 'var(--accent-primary)', width: '18px', height: '18px' }} /> Requires Food Laboratory
              </label>
            </div>
            <div className="mgmt-modal-actions">
              <button className="mgmt-cancel-btn" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
              <button className="btn" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Subject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SubjectManagement;