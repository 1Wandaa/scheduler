import React, { useState, useMemo, useCallback } from 'react';
import { db } from '../../config/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { deleteSectionCascade } from '../../services/cascadeDeleteService';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { DEPARTMENTS, PROGRAM_DEPARTMENTS, getDeptColor } from '../../config/constants';
import SectionTable from '../../components/SectionTable/SectionTable';
import SubjectSelector from '../../components/SubjectSelector/SubjectSelector';

const SectionManagement = ({ sections, professors, schedules, subjects, activeSemester, departments = [], courses = [], onBack }) => {
  const { confirm } = useGlobalDialog();
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '', name: '', program: '', yearLevel: 1, subjects: [], adviser: ''
  });

  // Memoize sorted professors for the adviser dropdown
  const sortedProfessors = useMemo(() => {
    return [...professors].sort((a, b) => {
      const nameA = a.name || `${a.lastName || ''}, ${a.firstName || ''}`;
      const nameB = b.name || `${b.lastName || ''}, ${b.firstName || ''}`;
      return nameA.localeCompare(nameB);
    });
  }, [professors]);

  const handleOpenAdd = () => {
    setFormData({ id: '', name: '', program: '', yearLevel: 1, subjects: [], adviser: '' });
    setEditMode(false);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (section) => {
    setFormData({ ...section, adviser: section.adviser || '' });
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
      const isConfirmed = await confirm({
        title: 'No Subjects Enrolled',
        text: 'Are you sure you want to create a section with no subjects?',
        icon: 'warning',
        confirmButtonText: 'Yes, save it'
      });
      if (!isConfirmed) return;
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
    const isConfirmed = await confirm({
      title: 'Delete Section?',
      text: "This action cannot be undone. Proceed?",
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });

    if (isConfirmed) {
      try {
        const sectionToDelete = sections.find(s => String(s.id) === String(id));
        await deleteSectionCascade(sectionToDelete, professors, schedules);
        toast.success('Section deleted successfully');
      } catch (err) {
        console.error("Error deleting section:", err);
        toast.error('Failed to delete section');
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
      <div className="card" style={{  position: 'relative' }}>
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
                <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                Section Management
              </h3>
              <p>Manage student sections and their enrolled subjects</p>
            </div>
          </div>
          <button className="btn" onClick={handleOpenAdd}>+ Add Section</button>
        </div>

        {/* Department Filter and Search Bar */}
        <div className="mgmt-toolbar">
          <div className="mgmt-toolbar-row">
            <span className="mgmt-toolbar-label">Filter by Department:</span>
            <div className="mgmt-filter-pills">
              {['All', ...(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)].map(dept => {
                const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
                const isActive = departmentFilter === dept;
                return (
                  <button
                    key={dept}
                    className={`mgmt-filter-pill${isActive ? ' active' : ''}`}
                    onClick={() => setDepartmentFilter(dept)}
                    style={isActive ? { background: deptColor, borderColor: deptColor } : undefined}
                  >
                    {dept === 'All' ? 'All Departments' : dept}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mgmt-search-wrapper">
            <span className="mgmt-search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input
              type="text"
              className="mgmt-search-input"
              placeholder="Search section name or program..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Render sections grouped by their Department */}
        {(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => {
          if (departmentFilter !== 'All' && departmentFilter !== dept) return null;

          const isDeptSection = (sec) => {
            if (sec.program === dept) return true; // Direct match
            // Try matching course
            const course = courses.find(c => c.code === sec.program || c.id === sec.program);
            if (course && course.departmentId === dept) return true;
            // Fallback to legacy
            if (PROGRAM_DEPARTMENTS[sec.program] === dept) return true;
            return false;
          };

          const deptSections = filteredSections.filter(isDeptSection);
          const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);

          return (
            <SectionTable
              key={dept}
              sectionList={deptSections}
              title={`${dept} Sections`}
              titleColor={deptColor}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
              subjects={subjects}
              professors={professors}
              departments={departments}
              courses={courses}
            />
          );
        })}

        {/* Render any sections that do not match the standard program list */}
        {(departmentFilter === 'All') && (
          <SectionTable
            sectionList={filteredSections.filter(sec => {
              const allDepts = departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS;
              const hasCourseMatch = courses.some(c => c.code === sec.program || c.id === sec.program);
              return !hasCourseMatch && !allDepts.includes(sec.program) && !allDepts.includes(PROGRAM_DEPARTMENTS[sec.program]);
            })}
            title="Other / Unassigned Sections"
            titleColor="var(--text-muted)"
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            subjects={subjects}
            professors={professors}
            departments={departments}
            courses={courses}
          />
        )}

        {sections.length === 0 && (
          <div className="mgmt-empty-state">
            <h4>No sections yet</h4>
            <p>Add sections to enable the Auto-Scheduler</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '500px' }} onKeyDown={handleKeyDown}>
            <h3>{editMode ? 'Edit Section' : 'Add New Section'}</h3>
            {error && (
              <div className="mgmt-modal-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {error}
              </div>
            )}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                Section Name
              </label>
              <input className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. BSCS 1A" />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                Program
              </label>
              <select className="form-select" value={formData.program} onChange={e => setFormData({ ...formData, program: e.target.value })} style={{ color: !formData.program ? '#757575' : 'inherit' }}>
                <option value="" disabled hidden>Select Program / Department</option>
                {courses.length > 0 ? courses.map(c => (
                  <option key={c.id} value={c.code} style={{ color: '#000' }}>{c.code} ({c.title})</option>
                )) : (departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS).map(dept => (
                  <option key={dept} value={dept} style={{ color: '#000' }}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                Year Level
              </label>
              <select className="form-select" value={formData.yearLevel} onChange={e => setFormData({ ...formData, yearLevel: parseInt(e.target.value) })}>
                <option value={1}>1st Year</option>
                <option value={2}>2nd Year</option>
                <option value={3}>3rd Year</option>
                <option value={4}>4th Year</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                Adviser
              </label>
              <select className="form-select" value={formData.adviser} onChange={e => setFormData({ ...formData, adviser: e.target.value })}>
                <option value="">No Adviser</option>
                {sortedProfessors.map(prof => (
                  <option key={prof.id} value={prof.id}>
                    {prof.name || `${prof.lastName || ''}, ${prof.firstName || ''}`}
                  </option>
                ))}
              </select>
            </div>
            <SubjectSelector
              subjects={subjects}
              activeSemester={activeSemester}
              selectedSubjects={formData.subjects}
              departments={departments}
              onToggleSubject={handleSubjectToggle}
            />
            <div className="mgmt-modal-actions">
              <button className="mgmt-cancel-btn" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
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