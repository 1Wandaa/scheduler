import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, deleteDoc, doc, getDocs, writeBatch, setDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import UserTable from '../../components/UserTable/UserTable';
import { Icon, NAV_ICONS } from '../Dashboard/components/Icon';

// Mock data to initialize database
const initialUsers = [
  { id: 1, username: '@admin', name: 'Dr. Jelly L. Paredes', role: 'Department Head' },
  { id: 2, username: '@olga', name: 'Prof. Olga Llanera', role: 'Faculty' },
  { id: 3, username: '@ryan', name: 'Ryan James Mora', role: 'Student' },
];

const UserManagement = ({ onBack }) => {
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [activeTab, setActiveTab] = useState('staff'); // 'staff' or 'student'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', username: '', role: 'Faculty', password: '' });

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
    return users.filter(u => {
      // Tab filter
      const isStudent = u.role.toLowerCase() === 'student';
      if (activeTab === 'staff' && isStudent) return false;
      if (activeTab === 'student' && !isStudent) return false;

      // Search filter
      return u.name?.toLowerCase().includes(query) || 
             u.username?.toLowerCase().includes(query) ||
             u.role?.toLowerCase().includes(query);
    });
  }, [users, searchQuery, activeTab]);

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

  const resetForm = () => {
    setFormData({ name: '', username: '', role: 'Faculty', password: '' });
    setEditingUser(null);
    setIsModalOpen(false);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setFormData({ 
      name: user.name || '', 
      username: user.username || '', 
      role: user.role || 'Faculty', 
      password: user.password || '' 
    });
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!formData.name || !formData.username || !formData.role || !formData.password) {
      Swal.fire({ title: 'Missing fields', text: 'Please fill in all fields.', icon: 'warning', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
      return;
    }
    const id = editingUser ? editingUser.id : Date.now().toString();
    try {
      Swal.showLoading();
      await setDoc(doc(db, 'users', id), {
        id,
        name: formData.name,
        username: formData.username,
        role: formData.role,
        password: formData.password
      });
      Swal.fire({ title: 'Saved!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      resetForm();
    } catch (err) {
      Swal.fire({ title: 'Error', text: err.message, icon: 'error', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
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
          <button className="btn-primary" onClick={handleOpenAdd} style={{ padding: '8px 16px' }}>+ Add User</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
          <div 
            onClick={() => setActiveTab('staff')}
            style={{ 
              padding: '10px 5px', 
              cursor: 'pointer', 
              fontWeight: activeTab === 'staff' ? 'bold' : 'normal',
              color: activeTab === 'staff' ? 'var(--accent-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'staff' ? '2px solid var(--accent-primary)' : 'none'
            }}>
            Admins & Staff
          </div>
          <div 
            onClick={() => setActiveTab('student')}
            style={{ 
              padding: '10px 5px', 
              cursor: 'pointer', 
              fontWeight: activeTab === 'student' ? 'bold' : 'normal',
              color: activeTab === 'student' ? 'var(--accent-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'student' ? '2px solid var(--accent-primary)' : 'none'
            }}>
            Students
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
        <UserTable users={filteredUsers} onDeleteUser={handleDeleteUser} onEditUser={handleOpenEdit} />
      </div>

      {/* --- ADD / EDIT MODAL --- */}
      {isModalOpen && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(30, 41, 59, 0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="modal-content" style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '420px',
            padding: '28px',
            boxShadow: '0 24px 48px rgba(0,0,0,0.1)',
            animation: 'floatUp 0.3s ease-out',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon d={NAV_ICONS.users} size={20} />
                {editingUser ? 'Edit User' : 'Add New User'}
              </h2>
              <button onClick={resetForm} style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', padding: '6px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s, color 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = 'var(--text-main)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <input 
                    type="text" 
                    placeholder="e.g. John Doe"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 12px 10px 36px',
                      background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.95rem',
                      outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(86, 69, 238, 0.1)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>Username</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
                  </div>
                  <input 
                    type="text" 
                    placeholder="e.g. @johndoe"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 12px 10px 36px',
                      background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.95rem',
                      outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(86, 69, 238, 0.1)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>Role</label>
                  <select 
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 12px',
                      background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.95rem',
                      outline: 'none', cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(86, 69, 238, 0.1)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                  >
                    <option value="Admin">Admin</option>
                    <option value="Department Head">Department Head</option>
                    <option value="Faculty">Faculty</option>
                    <option value="Student">Student</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Min 6 characters"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 12px 10px 36px',
                      background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.95rem',
                      outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(86, 69, 238, 0.1)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4, display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                  Firebase requires minimum 6 characters. The secure Auth account is auto-created on their first login.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' }}>
              <button onClick={resetForm} style={{
                padding: '10px 16px', borderRadius: '8px',
                background: 'transparent', border: '1px solid var(--border-color)',
                color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.2s, border-color 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
              >
                Cancel
              </button>
              <button onClick={handleSaveUser} style={{
                padding: '10px 20px', borderRadius: '8px',
                background: 'var(--accent-primary)', border: 'none',
                color: '#fff', fontSize: '0.9rem', fontWeight: 600,
                cursor: 'pointer', transition: 'opacity 0.2s, transform 0.1s, box-shadow 0.2s',
                boxShadow: '0 4px 12px rgba(86, 69, 238, 0.2)'
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(86, 69, 238, 0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(86, 69, 238, 0.2)'; }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {editingUser ? 'Update User' : 'Save User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserManagement;