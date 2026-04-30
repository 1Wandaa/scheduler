import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';

// Mock data to initialize database
const initialUsers = [
  { id: 1, username: '@admin', name: 'Dr. Jelly L. Paredes', role: 'Department Head' },
  { id: 2, username: '@olga', name: 'Prof. Olga Llanera', role: 'Faculty' },
  { id: 3, username: '@ryan', name: 'Ryan James Mora', role: 'Student' },
];

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', name: '', role: 'Student' });

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

  const handleAddUser = async () => {
    await addDoc(collection(db, 'users'), newUser);
    setShowModal(false);
    setNewUser({ username: '', name: '', role: 'Student' });
  };

  // --- UPDATED FORCED DELETE FUNCTION ---
  const handleDeleteUser = async (id) => {
    console.log("Delete button clicked for ID:", id); // This prints to your Inspect console

    try {
      // Bypassing the window.confirm popup to force the deletion
      await deleteDoc(doc(db, 'users', id.toString()));
      console.log("Firebase deletion successful!");
      alert("User deleted successfully!"); // Simple alert to confirm it worked
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

    if (role === 'Department Head') {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--accent-primary)', color: 'white' };
    } else if (role === 'Faculty') {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)' };
    } else {
      badgeStyle = { ...badgeStyle, backgroundColor: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' };
    }

    return <span style={badgeStyle}>{role}</span>;
  };

  return (
    <div className="card" style={{ animation: 'fadeIn 0.5s', position: 'relative' }}>
      {/* --- HEADER SECTION --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
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
        <button className="btn" onClick={() => setShowModal(true)}>+ Add User</button>
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
          {users.map(u => (
            <tr key={u.id}>
              <td style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>{u.username}</td>
              <td style={{ fontWeight: '500' }}>{u.name}</td>
              <td>{renderRoleBadge(u.role)}</td>
              <td>
                <button
                  style={{
                    color: 'var(--danger)',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '0.85rem'
                  }}
                  onClick={() => handleDeleteUser(u.id)}
                  onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* --- ADD USER MODAL --- */}
      {showModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'var(--card-bg)', padding: '30px',
            borderRadius: '12px', width: '400px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-dark)' }}>Add New User</h3>

            <div className="input-group" style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Username</label>
              <input
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                value={newUser.username}
                onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                placeholder="e.g. @ryan"
              />
            </div>

            <div className="input-group" style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Full Name</label>
              <input
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="e.g. Ryan James Mora"
              />
            </div>

            <div className="input-group" style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Role</label>
              <select
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'white' }}
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option>Student</option>
                <option>Faculty</option>
                <option>Department Head</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ padding: '8px 16px', border: '1px solid var(--border-color)', background: 'transparent', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
              >
                Cancel
              </button>
              <button className="btn" onClick={handleAddUser}>Add User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;