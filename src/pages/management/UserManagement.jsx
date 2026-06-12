import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';

// Mock data to initialize database
const initialUsers = [
  { id: 1, username: '@admin', name: 'Dr. Jelly L. Paredes', role: 'Department Head' },
  { id: 2, username: '@olga', name: 'Prof. Olga Llanera', role: 'Faculty' },
  { id: 3, username: '@ryan', name: 'Ryan James Mora', role: 'Student' },
];



const UserManagement = ({ onBack }) => {
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

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



  // --- UPDATED FORCED DELETE FUNCTION ---
  const handleDeleteUser = async (id) => {
    console.log("Delete button clicked for ID:", id);

    try {
      await deleteDoc(doc(db, 'users', id.toString()));
      console.log("Firebase deletion successful!");
      alert("User deleted successfully!");
    } catch (error) {
      console.error("Error deleting user: ", error);
      alert("Error: " + error.message);
    }
  };

  // Helper function to render colored badges based on role
  const renderRoleBadge = (role) => {
    let badgeStyle = {
      padding: '4px 10px',
      borderRadius: '20px',
      fontSize: '0.75rem',
      fontWeight: '600',
      display: 'inline-block'
    };

    if (role === 'Admin') {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--danger)', color: 'white' };
    } else if (role === 'Department Head') {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--accent-primary)', color: 'white' };
    } else if (role === 'Faculty') {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)' };
    } else {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' };
    }

    return <span style={badgeStyle}>{role}</span>;
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
      <table className="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Full Name</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.filter(u => 
            u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.role.toLowerCase().includes(searchQuery.toLowerCase())
          ).map(u => (
            <tr key={u.id}>
              <td style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>{u.username}</td>
              <td style={{ fontWeight: '500' }}>{u.name}</td>
              <td>{renderRoleBadge(u.role)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn-delete" onClick={() => handleDeleteUser(u.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>


    </>
  );
};

export default UserManagement;