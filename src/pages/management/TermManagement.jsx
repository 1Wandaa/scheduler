import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';

function TermManagement({ availableSemesters, availableSchoolYears, onBack, publishedTerms = {}, setPublishedTerms }) {
    const { confirm, prompt } = useGlobalDialog();
    const [isSaving, setIsSaving] = useState(false);

    const [publishSemester, setPublishSemester] = useState(availableSemesters.length > 0 ? availableSemesters[availableSemesters.length - 1] : '');
    const [publishYear, setPublishYear] = useState(availableSchoolYears.length > 0 ? availableSchoolYears[availableSchoolYears.length - 1] : '');

    const handleTogglePublish = async () => {
        if (!publishSemester || !publishYear) return;
        const termKey = `${publishSemester}_${publishYear}`;
        const isCurrentlyPublished = publishedTerms[termKey] === true;
        const action = isCurrentlyPublished ? 'Unpublish' : 'Publish';

        const isConfirmed = await confirm({
            title: `${action} Schedule?`,
            text: isCurrentlyPublished 
                ? "Students will no longer be able to see the schedules for this term."
                : "This will make the schedules for this term visible to students.",
            icon: 'info',
            confirmButtonText: `Yes, ${action}`,
            isDestructive: isCurrentlyPublished
        });

        if (isConfirmed) {
            setIsSaving(true);
            try {
                const newPublishedTerms = { ...publishedTerms, [termKey]: !isCurrentlyPublished };
                await handleUpdateSettings({ publishedTerms: newPublishedTerms });
                if (setPublishedTerms) setPublishedTerms(newPublishedTerms);
                toast.success(`Schedule has been ${action.toLowerCase()}ed.`);
            } catch (e) {
                console.error(e);
                toast.error('Failed to change publish status');
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleUpdateSettings = async (newData) => {
        try {
            const docRef = doc(db, 'meta', 'settings');
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
                await setDoc(docRef, { ...newData });
            } else {
                await updateDoc(docRef, newData);
            }
        } catch (error) {
            console.error("Error updating terms: ", error);
            toast.error('Could not update terms.');
        }
    };

    const handleAddTerm = async (type) => {
        const isSem = type === 'semester';
        const list = isSem ? availableSemesters : availableSchoolYears;
        const typeName = isSem ? 'Semester' : 'School Year';
        const fieldName = isSem ? 'semesters' : 'schoolYears';

        const term = await prompt({
            title: `Add New ${typeName}`,
            inputPlaceholder: isSem ? 'e.g. 1st Semester' : 'e.g. 2028-2029',
            confirmButtonText: 'Add'
        });

        if (!term) return;
        const trimmed = term.trim();
        if (!trimmed) return;

        const isDuplicate = list.some(item => item.toLowerCase() === trimmed.toLowerCase());
        if (isDuplicate) {
            toast.warning(`This ${typeName.toLowerCase()} already exists.`);
            return;
        }

        const toastId = toast.loading(`Adding ${typeName.toLowerCase()}...`);
        const updated = [...list, trimmed];
        await handleUpdateSettings({ [fieldName]: updated });
        
        toast.success(`${typeName} "${trimmed}" added.`, { id: toastId });
    };

    const handleEditTerm = async (type, oldTerm) => {
        const isSem = type === 'semester';
        const list = isSem ? availableSemesters : availableSchoolYears;
        const typeName = isSem ? 'Semester' : 'School Year';
        const fieldName = isSem ? 'semesters' : 'schoolYears';

        const term = await prompt({
            title: `Edit ${typeName}`,
            inputValue: oldTerm,
            confirmButtonText: 'Save'
        });

        if (!term) return;
        const trimmed = term.trim();
        if (!trimmed || trimmed === oldTerm) return;

        const isDuplicate = list.some(item => item !== oldTerm && item.toLowerCase() === trimmed.toLowerCase());
        if (isDuplicate) {
            toast.warning(`This ${typeName.toLowerCase()} already exists.`);
            return;
        }

        const toastId = toast.loading(`Updating ${typeName.toLowerCase()}...`);
        const updated = list.map(item => item === oldTerm ? trimmed : item);
        await handleUpdateSettings({ [fieldName]: updated });
        
        toast.success(`${typeName} updated to "${trimmed}".`, { id: toastId });
    };

    const handleDeleteTerm = async (type, term) => {
        const isSem = type === 'semester';
        const list = isSem ? availableSemesters : availableSchoolYears;
        const typeName = isSem ? 'Semester' : 'School Year';
        const fieldName = isSem ? 'semesters' : 'schoolYears';

        const isConfirmed = await confirm({
            title: `Delete ${typeName}?`,
            text: `Remove "${term}" from predefined options?`,
            icon: 'warning',
            confirmButtonText: 'Delete',
            isDestructive: true
        });
        
        if (isConfirmed) {
            const toastId = toast.loading(`Deleting ${typeName.toLowerCase()}...`);
            const updated = list.filter(item => item !== term);
            await handleUpdateSettings({ [fieldName]: updated });
            toast.success(`${typeName} deleted`, { id: toastId });
        }
    };

    return (
        <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
            {/* --- HEADER SECTION --- */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '25px' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    {onBack && (
                        <button className="back-btn" onClick={onBack}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                            Back
                        </button>
                    )}
                    <div>
                        <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            Semesters & Years Management
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage the predefined options available in the global term selector</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn" onClick={() => handleAddTerm('semester')}>+ Add Semester</button>
                    <button className="btn" onClick={() => handleAddTerm('schoolYear')}>+ Add Year</button>
                </div>
            </div>

            {/* --- CONTENT SECTION --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '25px' }}>
                
                {/* Semesters Table */}
                <div>
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Semester</th>
                                    <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {availableSemesters.length === 0 ? (
                                    <tr>
                                        <td colSpan="2" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No semesters found.</td>
                                    </tr>
                                ) : (
                                    availableSemesters.map((sem, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontWeight: 500 }}>{sem}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                    <button className="btn-edit" onClick={() => handleEditTerm('semester', sem)}>Edit</button>
                                                    <button className="btn-delete" onClick={() => handleDeleteTerm('semester', sem)}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* School Years Table */}
                <div>
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>School Year</th>
                                    <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {availableSchoolYears.length === 0 ? (
                                    <tr>
                                        <td colSpan="2" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No school years found.</td>
                                    </tr>
                                ) : (
                                    availableSchoolYears.map((year, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontWeight: 500 }}>{year}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                    <button className="btn-edit" onClick={() => handleEditTerm('schoolYear', year)}>Edit</button>
                                                    <button className="btn-delete" onClick={() => handleDeleteTerm('schoolYear', year)}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            {/* --- PUBLISH SCHEDULES SECTION --- */}
            <div style={{ marginTop: '40px', paddingTop: '25px', borderTop: '1px solid var(--border-color)' }}>
                <h3 className="card-title" style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    Publish Final Schedules
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
                    Select a term and publish its schedules to make them visible to students in the User Mode.
                </p>

                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--bg-main)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', minWidth: '200px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>Semester</label>
                        <select className="form-select" value={publishSemester} onChange={(e) => setPublishSemester(e.target.value)} style={{ padding: '10px 14px' }}>
                            {availableSemesters.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', minWidth: '200px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted)' }}>School Year</label>
                        <select className="form-select" value={publishYear} onChange={(e) => setPublishYear(e.target.value)} style={{ padding: '10px 14px' }}>
                            {availableSchoolYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    <div style={{ flex: '1', minWidth: '200px', display: 'flex', alignItems: 'center' }}>
                        {publishedTerms[`${publishSemester}_${publishYear}`] === true ? (
                            <button className="btn btn-delete" onClick={handleTogglePublish} disabled={isSaving} style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                {isSaving ? 'Unpublishing...' : 'Unpublish Schedule'}
                            </button>
                        ) : (
                            <button className="btn btn-primary" onClick={handleTogglePublish} disabled={isSaving} style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                {isSaving ? 'Publishing...' : 'Publish Schedule'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TermManagement;
