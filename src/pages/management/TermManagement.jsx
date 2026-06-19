import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';

function TermManagement({ availableSemesters, availableSchoolYears, onBack, publishedTerms = {}, setPublishedTerms }) {
    const [newSemester, setNewSemester] = useState('');
    const [newSchoolYear, setNewSchoolYear] = useState('');

    const [publishSemester, setPublishSemester] = useState(availableSemesters.length > 0 ? availableSemesters[availableSemesters.length - 1] : '');
    const [publishYear, setPublishYear] = useState(availableSchoolYears.length > 0 ? availableSchoolYears[availableSchoolYears.length - 1] : '');

    const handleTogglePublish = async () => {
        if (!publishSemester || !publishYear) return;
        const termKey = `${publishSemester}_${publishYear}`;
        const isCurrentlyPublished = publishedTerms[termKey] === true;
        const action = isCurrentlyPublished ? 'Unpublish' : 'Publish';

        const result = await Swal.fire({
            title: `${action} Schedule?`,
            text: isCurrentlyPublished 
                ? "Students will no longer be able to see the schedules for this term."
                : "This will make the schedules for this term visible to students.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: `Yes, ${action}`,
            cancelButtonText: 'Cancel',
            customClass: { popup: 'minimal-swal', confirmButton: isCurrentlyPublished ? 'btn-delete' : 'btn-primary', cancelButton: 'back-btn' },
            buttonsStyling: false
        });

        if (result.isConfirmed) {
            try {
                const newPublishedTerms = { ...publishedTerms, [termKey]: !isCurrentlyPublished };
                await handleUpdateSettings({ publishedTerms: newPublishedTerms });
                if (setPublishedTerms) setPublishedTerms(newPublishedTerms);
                Swal.fire({ title: 'Success', text: `Schedule has been ${action.toLowerCase()}ed.`, icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, customClass: { popup: 'minimal-toast' } });
            } catch (e) {
                console.error(e);
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
            Swal.fire({
                title: 'Error',
                text: 'Could not update terms.',
                icon: 'error',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                customClass: { popup: 'minimal-toast' }
            });
        }
    };

    const handleAddSemester = async () => {
        const { value: term } = await Swal.fire({
            title: 'Add New Semester',
            input: 'text',
            inputPlaceholder: 'e.g. 1st Semester',
            showCancelButton: true,
            confirmButtonText: 'Add',
            customClass: { popup: 'minimal-swal', title: 'minimal-title', confirmButton: 'btn-primary', cancelButton: 'back-btn' },
            buttonsStyling: false
        });

        if (!term) return;
        const trimmed = term.trim();
        if (!trimmed) return;
        if (availableSemesters.includes(trimmed)) {
            Swal.fire({ title: 'Duplicate', text: 'This semester already exists.', icon: 'warning', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
            return;
        }
        
        const updated = [...availableSemesters, trimmed];
        await handleUpdateSettings({ semesters: updated });
        
        Swal.fire({ title: 'Added', text: `Semester "${trimmed}" added.`, icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
    };

    const handleAddYear = async () => {
        const { value: term } = await Swal.fire({
            title: 'Add School Year',
            input: 'text',
            inputPlaceholder: 'e.g. 2028-2029',
            showCancelButton: true,
            confirmButtonText: 'Add',
            customClass: { popup: 'minimal-swal', title: 'minimal-title', confirmButton: 'btn-primary', cancelButton: 'back-btn' },
            buttonsStyling: false
        });

        if (!term) return;
        const trimmed = term.trim();
        if (!trimmed) return;
        if (availableSchoolYears.includes(trimmed)) {
            Swal.fire({ title: 'Duplicate', text: 'This school year already exists.', icon: 'warning', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
            return;
        }
        
        const updated = [...availableSchoolYears, trimmed];
        await handleUpdateSettings({ schoolYears: updated });
        
        Swal.fire({ title: 'Added', text: `School Year "${trimmed}" added.`, icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
    };

    const handleEditSemester = async (oldTerm) => {
        const { value: term } = await Swal.fire({
            title: 'Edit Semester',
            input: 'text',
            inputValue: oldTerm,
            showCancelButton: true,
            confirmButtonText: 'Save',
            customClass: { popup: 'minimal-swal', title: 'minimal-title', confirmButton: 'btn-primary', cancelButton: 'back-btn' },
            buttonsStyling: false
        });

        if (!term) return;
        const trimmed = term.trim();
        if (!trimmed || trimmed === oldTerm) return;
        if (availableSemesters.includes(trimmed)) {
            Swal.fire({ title: 'Duplicate', text: 'This semester already exists.', icon: 'warning', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
            return;
        }
        
        const updated = availableSemesters.map(s => s === oldTerm ? trimmed : s);
        await handleUpdateSettings({ semesters: updated });
        
        Swal.fire({ title: 'Updated', text: `Semester updated to "${trimmed}".`, icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
    };

    const handleEditYear = async (oldTerm) => {
        const { value: term } = await Swal.fire({
            title: 'Edit School Year',
            input: 'text',
            inputValue: oldTerm,
            showCancelButton: true,
            confirmButtonText: 'Save',
            customClass: { popup: 'minimal-swal', title: 'minimal-title', confirmButton: 'btn-primary', cancelButton: 'back-btn' },
            buttonsStyling: false
        });

        if (!term) return;
        const trimmed = term.trim();
        if (!trimmed || trimmed === oldTerm) return;
        if (availableSchoolYears.includes(trimmed)) {
            Swal.fire({ title: 'Duplicate', text: 'This school year already exists.', icon: 'warning', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
            return;
        }
        
        const updated = availableSchoolYears.map(y => y === oldTerm ? trimmed : y);
        await handleUpdateSettings({ schoolYears: updated });
        
        Swal.fire({ title: 'Updated', text: `School Year updated to "${trimmed}".`, icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
    };

    const handleDeleteSemester = async (sem) => {
        const result = await Swal.fire({
            title: 'Delete Semester?',
            text: `Remove "${sem}" from predefined options?`,
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
            const updated = availableSemesters.filter(s => s !== sem);
            await handleUpdateSettings({ semesters: updated });
            Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, customClass: { popup: 'minimal-toast' } });
        }
    };

    const handleDeleteYear = async (year) => {
        const result = await Swal.fire({
            title: 'Delete School Year?',
            text: `Remove "${year}" from predefined options?`,
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
            const updated = availableSchoolYears.filter(y => y !== year);
            await handleUpdateSettings({ schoolYears: updated });
            Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, customClass: { popup: 'minimal-toast' } });
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
                    <button className="btn" onClick={handleAddSemester}>+ Add Semester</button>
                    <button className="btn" onClick={handleAddYear}>+ Add Year</button>
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
                                                    <button className="btn-edit" onClick={() => handleEditSemester(sem)}>Edit</button>
                                                    <button className="btn-delete" onClick={() => handleDeleteSemester(sem)}>Delete</button>
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
                                                    <button className="btn-edit" onClick={() => handleEditYear(year)}>Edit</button>
                                                    <button className="btn-delete" onClick={() => handleDeleteYear(year)}>Delete</button>
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
                            <button className="btn btn-delete" onClick={handleTogglePublish} style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                Unpublish Schedule
                            </button>
                        ) : (
                            <button className="btn btn-primary" onClick={handleTogglePublish} style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                Publish Schedule
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TermManagement;
