import React, { useState } from 'react';
import { db } from '../../config/firebase';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';

function TermManagement({ availableSemesters, availableSchoolYears, onBack }) {
    const [newSemester, setNewSemester] = useState('');
    const [newSchoolYear, setNewSchoolYear] = useState('');

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
                                                    <button className="icon-btn edit" onClick={() => handleEditSemester(sem)} title="Edit Semester">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                    </button>
                                                    <button className="icon-btn delete" onClick={() => handleDeleteSemester(sem)} title="Delete Semester">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                                    </button>
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
                                                    <button className="icon-btn edit" onClick={() => handleEditYear(year)} title="Edit School Year">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                    </button>
                                                    <button className="icon-btn delete" onClick={() => handleDeleteYear(year)} title="Delete School Year">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                                    </button>
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
        </div>
    );
}

export default TermManagement;
