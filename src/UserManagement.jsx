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

  const handleDeleteUser = async (id) => {
    await deleteDoc(doc(db, 'users', id.toString()));
  };

  return (
    <div className="main-container card">
      <div className="section-title" style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '10px' }}>👥 User Management</div>
      <p style={{ color: '#666', marginBottom: '20px' }}>Manage system users and permissions</p>

      <table className="user-table">
        <thead>
          <tr style={{ background: '#f8f9fa' }}>
            <th>User</th>
            <th>Full Name</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td><strong>{u.username}</strong></td>
              <td>{u.name}</td>
              <td>
                <span className={`badge ${u.role === 'Department Head' ? 'badge-admin' : 'badge-student'}`}>
                  {u.role}
                </span>
              </td>
              <td>
                <button 
                  style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}
                  onClick={() => handleDeleteUser(u.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Floating Add Button */}
      <button className="fab-add" onClick={() => setShowModal(true)}>+</button>

      {/* Add User Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'left' }}>
            <h3>Add New User</h3>
            <div className="form-group">
              <label>Username</label>
              <input className="form-control" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Full Name</label>
              <input className="form-control" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select className="form-control" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                <option>Student</option>
                <option>Faculty</option>
                <option>Department Head</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-submit" onClick={handleAddUser}>Add User</button>
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
