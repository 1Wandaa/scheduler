import React, { useState } from 'react';

// Mock data (since we aren't using real Auth for this demo)
const initialUsers = [
  { id: 1, username: '@admin', name: 'Engr. Pablo Asi', role: 'Department Head' },
  { id: 2, username: '@juan', name: 'Prof. Juan Dela Cruz', role: 'Faculty' },
  { id: 3, username: '@maria', name: 'Maria Clara', role: 'Student' },
];

const UserManagement = () => {
  const [users, setUsers] = useState(initialUsers);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', name: '', role: 'Student' });

  const handleAddUser = () => {
    setUsers([...users, { ...newUser, id: Date.now() }]);
    setShowModal(false);
    setNewUser({ username: '', name: '', role: 'Student' });
  };

  return (
    <div className="main-container">
      <div className="section-title">👥 User Management</div>
      <p style={{color: '#666'}}>Manage system users and permissions</p>

      <table className="user-table">
        <thead>
          <tr style={{background: '#f8f9fa'}}>
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
                <button style={{color: 'red', border:'none', background:'none'}}>Delete</button>
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
          <div className="modal-content" style={{textAlign: 'left'}}>
            <h3>Add New User</h3>
            <div className="form-group">
              <label>Username</label>
              <input className="form-control" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Full Name</label>
              <input className="form-control" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select className="form-control" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
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