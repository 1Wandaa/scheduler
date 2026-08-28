import React, { useState, useEffect, useMemo } from 'react';
import { db, firebaseConfig } from '../../config/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, onSnapshot, doc, getDocs, writeBatch, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import UserTable from '../../components/UserTable/UserTable';
import { Icon, NAV_ICONS } from '../Dashboard/components/Icon';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

// Mock data to initialize database
const initialUsers = [
  { id: 1, username: '@admin', name: 'Dr. Jelly L. Paredes', role: 'Department Head' },
  { id: 2, username: '@olga', name: 'Prof. Olga Llanera', role: 'Faculty' },
  { id: 3, username: '@ryan', name: 'Ryan James Mora', role: 'Student' },
];

const UserManagement = ({ user, onBack }) => {
  const { confirm } = useGlobalDialog();
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
    const isConfirmed = await confirm({
      title: 'Delete User?',
      text: "This action cannot be undone. Proceed?",
      icon: 'warning',
      confirmButtonText: 'Delete',
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading('Deleting user...');
      try {
        const userToDelete = users.find(u => u.id === id);
        
        const batch = writeBatch(db);
        
        // 1. Delete user
        batch.delete(doc(db, 'users', id.toString()));
        
        // 2. Add to trash
        const trashRef = doc(collection(db, 'trash'));
        batch.set(trashRef, {
          id: trashRef.id,
          type: 'user',
          originalId: id.toString(),
          data: userToDelete,
          cascadedSchedules: [],
          modifications: {},
          deletedAt: Date.now()
        });
        
        await batch.commit();
        logActivity({
          user,
          action: LOG_ACTIONS.DELETE_USER,
          details: `Deleted user: ${userToDelete?.name || userToDelete?.username || id} (${userToDelete?.role || 'User'})`
        });
        toast.success('Profile Deleted. Remember to also delete their account in the Firebase Authentication Console!', { id: toastId, duration: 5000 });
      } catch (error) {
        console.error("Error deleting user: ", error);
        toast.error(error.message, { id: toastId });
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
      toast.warning('Please fill in all fields.');
      return;
    }
    let id = editingUser ? editingUser.id : null;
    try {
      const toastId = toast.loading('Saving user...');

      if (!editingUser) {
        // Adding a new user
        const cleanUsername = formData.username.replace('@', '').toLowerCase();
        const dummyEmail = `${cleanUsername}@gmail.com`;
        
        // We use a secondary app so we don't accidentally log out the admin
        const secondaryApp = initializeApp(firebaseConfig, `SecondaryApp_${Date.now()}`);
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, dummyEmail, formData.password);
          id = userCredential.user.uid;
        } catch (authErr) {
          await deleteApp(secondaryApp);
          throw new Error("Failed to create auth account: " + authErr.message);
        }
        await deleteApp(secondaryApp);
      }

      await setDoc(doc(db, 'users', id), {
        id,
        name: formData.name,
        username: formData.username,
        role: formData.role,
        password: formData.password
      });

      if (editingUser) {
        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_USER,
          details: `Updated user: ${formData.name} (@${formData.username}) as ${formData.role}`
        });
      } else {
        logActivity({
          user,
          action: LOG_ACTIONS.ADD_USER,
          details: `Added new user: ${formData.name} (@${formData.username}) as ${formData.role}`
        });
      }

      toast.success('Saved!', { id: toastId });
      resetForm();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="card" style={{  position: 'relative' }}>
        {/* --- HEADER SECTION --- */}
        <div className="mgmt-header">
          <div className="mgmt-header-left">
            {onBack && (
              <button className="back-btn" onClick={onBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Back
              </button>
            )}
            <div className="mgmt-header-info">
              <h3 className="card-title">
                <svg className="mgmt-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                User Management
              </h3>
              <p>Manage system users and permissions</p>
            </div>
          </div>
          <button className="btn" onClick={handleOpenAdd}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
            Add User
          </button>
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
        <div className="mgmt-toolbar">
          <div className="mgmt-search-wrapper" style={{ maxWidth: '300px' }}>
            <span className="mgmt-search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input 
              type="text" 
              className="mgmt-search-input" 
              placeholder="Search user by name, username or role..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
            />
          </div>
        </div>
        {/* --- DATA TABLE --- */}
        <UserTable users={filteredUsers} onDeleteUser={handleDeleteUser} onEditUser={handleOpenEdit} />
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={resetForm}>
          <div 
            className="modal-content" 
            style={{ width: '100%', maxWidth: '500px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon d={NAV_ICONS.users} size={20} />
                {editingUser ? 'Edit User' : 'Add New User'}
              </h2>
              <button onClick={resetForm} className="btn-icon" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '50%', padding: '6px', color: 'var(--text-muted)' }} title="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Full Name
                </label>
                <input 
                  type="text" 
                  className="form-input"
                  placeholder="Enter full name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
                    Username
                  </label>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="Enter username"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                    Role
                  </label>
                  <select 
                    className="form-select"
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="Admin">Admin</option>
                    <option value="Department Head">Department Head</option>
                    <option value="Faculty">Faculty</option>
                    <option value="Student">Student</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Password
                </label>
                <input 
                  type="text" 
                  className="form-input"
                  placeholder="Enter password (min. 6 chars)"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                />

              </div>
            </div>

            <div className="mgmt-modal-actions">
              <button onClick={resetForm} className="mgmt-cancel-btn">
                Cancel
              </button>
              <button onClick={handleSaveUser} className="btn">
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