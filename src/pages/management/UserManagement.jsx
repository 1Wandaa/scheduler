import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import Swal from 'sweetalert2';
import UserTable from '../../components/UserTable/UserTable';

// Mock data to initialize database
const initialUsers = [
  { id: 1, username: '@admin', name: 'Dr. Jelly L. Paredes', role: 'Department Head' },
  { id: 2, username: '@olga', name: 'Prof. Olga Llanera', role: 'Faculty' },
  { id: 3, username: '@ryan', name: 'Ryan James Mora', role: 'Student' },
];

const UserManagement = ({ onBack }) => {
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const initializeUsers = async () => {
      const usersSnap = await getDocs(collection(db, 'users'));
      if (usersSnap.empty) {
        const batch = writeBatch(db);
        initialUsers.forEach(u => batch.set(doc(db, 'users', u.id.toString()), u));
        await batch.commit();
      }
    };
    initializeUsers();

    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    return () => unsub();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return users.filter(u => 
      u.name.toLowerCase().includes(query) || 
      u.username.toLowerCase().includes(query) ||
      u.role.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const handleDeleteUser = async (id) => {
    const result = await Swal.fire({
      title: 'Delete User?',
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
      Swal.showLoading();
      try {
        await deleteDoc(doc(db, 'users', id.toString()));
        Swal.fire({ 
          title: 'Profile Deleted', 
          text: 'Remember to also delete their account in the Firebase Authentication Console!', 
          icon: 'success', 
          toast: true, 
          position: 'top-end', 
          showConfirmButton: false, 
          timer: 5000, 
          customClass: { popup: 'minimal-toast' } 
        });
      } catch (error) {
        console.error("Error deleting user: ", error);
        Swal.fire({ title: 'Error', text: error.message, icon: 'error', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, customClass: { popup: 'minimal-toast' } });
      }
    }
  };

  return (
    <>
      <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
      {/* --- HEADER SECTION --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {onBack && (
            <button className="back-btn" onClick={onBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Back
            </button>
          )}
          <div>
            <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              User Management
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>Manage system users and permissions</p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <input 
          type="text" 
          className="form-input" 
          placeholder="Search user by name, username or role..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
          style={{ flex: 1, maxWidth: '300px' }}
        />
      </div>

      {/* --- DATA TABLE --- */}
      <UserTable users={filteredUsers} onDeleteUser={handleDeleteUser} />
      
      </div>
    </>
  );
};

export default UserManagement;