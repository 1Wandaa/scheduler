import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db, auth, firebaseConfig } from '../../config/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, updateEmail, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { collection, onSnapshot, doc, getDocs, writeBatch, setDoc, deleteDoc, updateDoc, deleteField, query, where } from 'firebase/firestore';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import UserTable from '../../components/UserTable/UserTable';
import BatchActionBar from '../../components/common/BatchActionBar';
import { deleteUserBatch } from '../../services/cascadeDeleteService';
import { Icon, NAV_ICONS } from '../Dashboard/components/Icon';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';

// Mock data to initialize database
const initialUsers = [
  { id: 1, username: '@admin', name: 'Dr. Jelly L. Paredes', role: 'Admin' },
  { id: 2, username: '@olga', name: 'Prof. Olga Llanera', role: 'Faculty' },
  { id: 3, username: '@ryan', name: 'Ryan James Mora', role: 'User' },
];

const UserManagement = ({ user, onBack }) => {
  const { confirm } = useGlobalDialog();
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [activeTab, setActiveTab] = useState('staff'); // 'staff' or 'student'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', username: '', role: 'Admin', password: '', oldPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const isSubmittingRef = useRef(false);

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

    const unsub = onSnapshot(collection(db, 'users'), async (snap) => {
      const rawUsers = snap.docs.map(d => ({ ...d.data(), id: d.id }));

      // Group users by clean username to prevent and eradicate duplicate dummy rows
      const grouped = new Map();
      rawUsers.forEach(u => {
        const cleanU = (u.username || '').replace(/^@+/, '').toLowerCase().trim();
        if (!cleanU) return;
        if (!grouped.has(cleanU)) {
          grouped.set(cleanU, []);
        }
        grouped.get(cleanU).push(u);
      });

      const uniqueUsers = [];
      const duplicatesToDelete = [];

      grouped.forEach((group) => {
        if (group.length === 1) {
          uniqueUsers.push(group[0]);
        } else {
          // Identify the canonical user document:
          // 1. Current logged-in user if matches
          // 2. Firebase Auth UID (long string) over legacy numeric IDs ("1", "2")
          // 3. Document with richest data/settings
          const currentUid = auth.currentUser?.uid;
          let canonical = group.find(u => currentUid && u.id === currentUid);
          if (!canonical) {
            canonical = group.find(u => typeof u.id === 'string' && u.id.length > 20 && !/^\d+$/.test(u.id));
          }
          if (!canonical) {
            canonical = group.reduce((best, curr) => {
              const bestScore = Object.keys(best).length + (best.settings ? 5 : 0) + (best.email ? 3 : 0);
              const currScore = Object.keys(curr).length + (curr.settings ? 5 : 0) + (curr.email ? 3 : 0);
              return currScore > bestScore ? curr : best;
            }, group[0]);
          }

          uniqueUsers.push(canonical);

          // Mark obsolete dummy duplicates for automatic deletion
          group.forEach(u => {
            if (u.id !== canonical.id) {
              duplicatesToDelete.push(u);
            }
          });
        }
      });

      // Render only unique users in the table immediately
      setUsers(uniqueUsers);

      // Clean up duplicate dummy documents from Firestore in the background
      if (duplicatesToDelete.length > 0) {
        for (const dup of duplicatesToDelete) {
          try {
            await deleteDoc(doc(db, 'users', String(dup.id)));
          } catch (delErr) {
            console.warn('[UserManagement] Purging duplicate user doc:', dup.id, delErr);
          }
        }
      }
    });

    return () => unsub();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return users.filter(u => {
      // Tab filter
      const isStudent = (u.role || '').toLowerCase() === 'student' || (u.role || '').toLowerCase() === 'user';
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
        
        // 1. Delete user (and any duplicate documents with the same username)
        batch.delete(doc(db, 'users', id.toString()));
        const cleanDelUsername = (userToDelete?.username || '').replace(/^@+/, '').toLowerCase().trim();
        if (cleanDelUsername) {
          try {
            const dupSnap = await getDocs(query(collection(db, 'users'), where('username', '==', cleanDelUsername)));
            dupSnap.docs.forEach(d => {
              if (d.id !== id.toString()) {
                batch.delete(doc(db, 'users', d.id));
              }
            });
          } catch (e) {}
        }
        
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
        setSelectedIds(prev => prev.filter(item => item !== id));
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

  const handleToggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = (idsInView) => {
    const allInViewSelected = idsInView.length > 0 && idsInView.every(id => selectedIds.includes(id));
    if (allInViewSelected) {
      setSelectedIds(prev => prev.filter(id => !idsInView.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...idsInView])));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds(filteredUsers.map(u => u.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleExitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const handleDeleteSelected = async () => {
    const selectedInView = selectedIds.filter(id => filteredUsers.some(u => u.id === id));
    if (selectedInView.length === 0) return;
    const count = selectedInView.length;

    const isConfirmed = await confirm({
      title: `Delete ${count} User${count > 1 ? 's' : ''}?`,
      text: `Are you sure you want to delete ${count} selected users? Their profiles will be moved to the Recycle Bin. Remember to also delete their accounts from Firebase Authentication if needed.`,
      icon: 'warning',
      confirmButtonText: `Delete ${count} Selected`,
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting ${count} users...`);
      try {
        const usersToDelete = users.filter(u => selectedInView.includes(u.id));
        await deleteUserBatch(usersToDelete);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_USERS,
          details: `Batch deleted ${count} users: ${usersToDelete.map(u => u.name || u.username || u.id).join(', ')}`
        });
        toast.success(`Successfully deleted ${count} users`, { id: toastId });
        setSelectedIds(prev => prev.filter(id => !selectedInView.includes(id)));
      } catch (error) {
        console.error("Error batch deleting users: ", error);
        toast.error('Failed to delete selected users', { id: toastId });
      }
    }
  };

  const handleDeleteAll = async () => {
    const count = filteredUsers.length;
    if (count === 0) return;

    const isConfirmed = await confirm({
      title: `Delete All ${count} Users?`,
      text: `Are you sure you want to delete ALL ${count} users matching your current filter?`,
      icon: 'warning',
      confirmButtonText: 'Delete All',
      isDestructive: true
    });

    if (isConfirmed) {
      const toastId = toast.loading(`Deleting all ${count} users...`);
      try {
        await deleteUserBatch(filteredUsers);
        logActivity({
          user,
          action: LOG_ACTIONS.BATCH_DELETE_USERS,
          details: `Deleted all ${count} users in view (${activeTab})`
        });
        toast.success(`Successfully deleted all ${count} users`, { id: toastId });
        setSelectedIds([]);
      } catch (error) {
        console.error("Error deleting all users: ", error);
        toast.error('Failed to delete users', { id: toastId });
      }
    }
  };

  const resetForm = () => {
    if (isSaving) return;
    setFormData({ name: '', username: '', role: 'Admin', password: '', oldPassword: '' });
    setShowPassword(false);
    setShowOldPassword(false);
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
      role: user.role || 'Admin', 
      password: '',
      oldPassword: ''
    });
    setShowPassword(false);
    setShowOldPassword(false);
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const cleanUsername = (formData.username || '').replace(/^@+/, '').toLowerCase().trim();
  const isUsernameDuplicate = Boolean(
    !isSaving && isModalOpen && cleanUsername && users.some(u =>
      (!editingUser || u.id !== editingUser.id) &&
      (u.username || '').replace(/^@+/, '').toLowerCase().trim() === cleanUsername
    )
  );

  const handleSaveUser = async () => {
    if (isSubmittingRef.current || isSaving) return;

    if (!formData.name?.trim() || !formData.username?.trim() || !formData.role?.trim() || (!editingUser && !formData.password?.trim())) {
      toast.warning('Please fill in all required fields.');
      return;
    }

    if (!editingUser && formData.password.trim().length < 6) {
      toast.warning('Password must be at least 6 characters.');
      return;
    }

    if (editingUser) {
      if (formData.password?.trim() && !formData.oldPassword?.trim()) {
        toast.warning('Please enter the Current Password first before setting a new password.');
        return;
      }
      if (formData.oldPassword?.trim() && !formData.password?.trim()) {
        toast.warning('Please enter the New Password to complete changing the password.');
        return;
      }
      if (formData.password?.trim() && formData.password.trim().length < 6) {
        toast.warning('New password must be at least 6 characters.');
        return;
      }
    }

    isSubmittingRef.current = true;
    setIsSaving(true);
    let secondaryApp = null;
    const toastId = toast.loading(editingUser ? 'Updating user...' : 'Saving user...');

    try {
      let id = editingUser ? editingUser.id : null;
      const cleanUsername = formData.username.replace('@', '').toLowerCase().trim();
      const dummyEmail = `${cleanUsername}@smartsched.capsu.edu.ph`;

      const allUsersSnap = await getDocs(collection(db, 'users'));

      if (!editingUser) {
        // Pre-check if username already exists in Firestore (thorough case & @ check)
        const duplicate = allUsersSnap.docs.find(d => {
          const docU = (d.data().username || '').replace(/^@+/, '').toLowerCase().trim();
          return docU === cleanUsername;
        });
        if (duplicate) {
          const existingRole = duplicate.data().role || 'User';
          throw new Error(`The username '${formData.username}' is already registered as '${existingRole}'. Please use a different username or edit the existing account.`);
        }

        // Adding a new user via collision-proof secondary app name
        const secondaryAppName = `SecondaryApp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, dummyEmail, formData.password.trim());
          id = userCredential.user.uid;
        } catch (authErr) {
          throw new Error("Failed to create auth account: " + authErr.message);
        }
      } else {
        // Check if new username conflicts with a different user
        const duplicate = allUsersSnap.docs.find(d => {
          if (d.id === editingUser.id) return false;
          const docU = (d.data().username || '').replace(/^@+/, '').toLowerCase().trim();
          return docU === cleanUsername;
        });
        if (duplicate) {
          throw new Error(`The username '${formData.username}' is already in use by another account.`);
        }

        // Determine what changed
        const usernameChanged = (formData.username || '').replace(/^@+/, '').toLowerCase().trim() !== (editingUser.username || '').replace(/^@+/, '').toLowerCase().trim();
        const passwordChanged = formData.password && formData.password.trim().length > 0;

        if (passwordChanged && formData.password.trim().length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        if (usernameChanged || passwordChanged) {
          const secondaryAppName = `SecondaryApp_edit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
          const secondaryAuth = getAuth(secondaryApp);
          
          const oldCleanUsername = (editingUser.username || '').replace('@', '').toLowerCase().trim();
          const possibleOldEmails = [
            `${oldCleanUsername}@smartsched.capsu.edu.ph`,
            `${oldCleanUsername}@gmail.com`,
          ];
          
          let userCredential = null;
          let authUpdateSucceeded = false;

          // --- Strategy 1: If admin is editing their OWN account, use the primary auth session ---
          const currentUser = auth.currentUser;
          const editingOwnAccount = Boolean(
            currentUser && (
              currentUser.uid === editingUser.id ||
              possibleOldEmails.some(e => e === currentUser.email?.toLowerCase()) ||
              (cleanUsername && currentUser.email?.toLowerCase().startsWith(`${cleanUsername}@`))
            )
          );

          if (editingOwnAccount && currentUser) {
            id = currentUser.uid;
            try {
              if (formData.oldPassword && formData.oldPassword.trim()) {
                const cred = EmailAuthProvider.credential(currentUser.email, formData.oldPassword.trim());
                await reauthenticateWithCredential(currentUser, cred);
              }
              if (passwordChanged) {
                await updatePassword(currentUser, formData.password.trim());
                authUpdateSucceeded = true;
              }
              if (usernameChanged) {
                await updateEmail(currentUser, dummyEmail);
                authUpdateSucceeded = true;
              }
            } catch (selfUpdateErr) {
              if (selfUpdateErr.code === 'auth/wrong-password' || selfUpdateErr.code === 'auth/invalid-credential') {
                throw new Error('Current password is incorrect. Please check the current password and try again.');
              }
              console.warn('Could not update own auth credentials:', selfUpdateErr.message);
            }
          }

          // --- Strategy 2: Try to sign in via secondary app with known passwords ---
          if (!authUpdateSucceeded) {
            // Collect possible passwords to try for re-authentication
            const passwordCandidates = [];
            if (formData.oldPassword && formData.oldPassword.trim()) passwordCandidates.push(formData.oldPassword.trim()); // Admin-provided old password
            if (editingUser.password) passwordCandidates.push(editingUser.password); // Legacy stored password
            
            for (const email of possibleOldEmails) {
              if (userCredential) break;
              for (const pwd of passwordCandidates) {
                if (userCredential) break;
                try {
                  userCredential = await signInWithEmailAndPassword(secondaryAuth, email, pwd);
                } catch (err) {
                  // Try next combination
                }
              }
            }
            
            if (userCredential) {
              try {
                id = userCredential.user.uid;
                if (passwordChanged) {
                  await updatePassword(userCredential.user, formData.password.trim());
                }
                if (usernameChanged) {
                  await updateEmail(userCredential.user, dummyEmail);
                }
                authUpdateSucceeded = true;

                // Also clean up any alternate legacy duplicate Auth account
                for (const altEmail of possibleOldEmails) {
                  if (altEmail !== userCredential.user.email) {
                    for (const pwd of passwordCandidates) {
                      try {
                        const altCred = await signInWithEmailAndPassword(secondaryAuth, altEmail, pwd);
                        if (altCred?.user) {
                          await deleteUser(altCred.user);
                        }
                      } catch (e) {}
                    }
                  }
                }
              } catch (authErr) {
                console.warn("Could not update auth credentials via secondary sign-in:", authErr.message);
              }
            }
          }

          // --- Strategy 3: Create a brand new Auth account and migrate ---
          if (!authUpdateSucceeded && passwordChanged) {
            try {
              // If username changed, the new email is different, so we can create a new account
              // If username is the same, the email already exists — we can't create a duplicate
              const newCredential = await createUserWithEmailAndPassword(secondaryAuth, dummyEmail, formData.password.trim());
              id = newCredential.user.uid;
              authUpdateSucceeded = true;
            } catch (createErr) {
              if (createErr.code === 'auth/email-already-in-use') {
                // Can't create new account with same email — old auth account exists
                // This happens when changing password without changing username
                // and we couldn't sign in to the old account
                toast.warning(
                  'Password could not be updated in Firebase Auth because the current password was not verified. The user can change their password from Settings → Security → Change Password.',
                  { duration: 8000 }
                );
              } else {
                console.warn("Could not create replacement auth account:", createErr.message);
              }
            }
          }
        }

        // Clean up legacy document if ID has migrated to canonical Auth UID
        if (editingUser.id && String(editingUser.id) !== String(id)) {
          try {
            await deleteDoc(doc(db, 'users', String(editingUser.id)));
          } catch (delErr) {
            console.warn('[UserManagement] Could not remove old user doc:', delErr);
          }
        }
      }

      await setDoc(doc(db, 'users', String(id)), {
        id: String(id),
        name: formData.name.trim(),
        username: formData.username.trim(),
        role: formData.role
      }, { merge: true });

      // Clean up any legacy plaintext password field so it never remains in Firestore
      try {
        await updateDoc(doc(db, 'users', String(id)), {
          password: deleteField()
        });
      } catch (cleanErr) {}

      // DELETE all duplicate dummy documents sharing this clean username (PREVENT DUPLICATION!)
      const otherDuplicates = allUsersSnap.docs.filter(d => {
        if (d.id === String(id) || (editingUser && d.id === String(editingUser.id))) return false;
        const docU = (d.data().username || '').replace(/^@+/, '').toLowerCase().trim();
        return docU === cleanUsername;
      });
      for (const dupDoc of otherDuplicates) {
        try {
          await deleteDoc(doc(db, 'users', dupDoc.id));
        } catch (cleanDupErr) {
          console.warn('[UserManagement] Could not delete duplicate user doc:', cleanDupErr);
        }
      }

      if (editingUser) {
        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_USER,
          details: `Updated user: ${formData.name.trim()} (${formData.username.trim()}) as ${formData.role}`
        });
      } else {
        logActivity({
          user,
          action: LOG_ACTIONS.ADD_USER,
          details: `Added new user: ${formData.name.trim()} (${formData.username.trim()}) as ${formData.role}`
        });
      }

      toast.success('Saved!', { id: toastId });
      setFormData({ name: '', username: '', role: 'Admin', password: '', oldPassword: '' });
      setEditingUser(null);
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving user: ", err);
      toast.error(err.message, { id: toastId });
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (delErr) {
          console.warn('Error deleting secondary app:', delErr);
        }
      }
      setIsSaving(false);
      isSubmittingRef.current = false;
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
          <div className="mgmt-header-actions">
            <button
              className={`select-mode-btn${selectionMode ? ' active' : ''}`}
              onClick={() => selectionMode ? handleExitSelectionMode() : setSelectionMode(true)}
              title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              {selectionMode ? 'Cancel' : 'Select'}
            </button>
            <button className="btn" onClick={handleOpenAdd}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
              Add User
            </button>
          </div>
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
            Administrators & Staff
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
            Users & Students
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
        {selectionMode && (
          <BatchActionBar
            selectedCount={selectedIds.filter(id => filteredUsers.some(u => u.id === id)).length}
            totalCount={filteredUsers.length}
            itemName="user"
            onSelectAll={handleSelectAllFiltered}
            onDeselectAll={handleDeselectAll}
            onDeleteSelected={handleDeleteSelected}
            onDeleteAll={handleDeleteAll}
            onExitSelectionMode={handleExitSelectionMode}
          />
        )}

        {/* --- DATA TABLE --- */}
        <UserTable
          users={filteredUsers}
          onDeleteUser={handleDeleteUser}
          onEditUser={handleOpenEdit}
          selectedIds={selectionMode ? selectedIds : []}
          onToggleSelect={selectionMode ? handleToggleSelect : undefined}
          onToggleSelectAll={selectionMode ? handleToggleSelectAll : undefined}
        />
      </div>

      {isModalOpen && createPortal(
        <div className="modal-overlay">
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
                    className={`form-input${isUsernameDuplicate ? ' mgmt-input-duplicate' : ''}`}
                    placeholder="Enter username"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                  />
                  {isUsernameDuplicate && (
                    <div className="mgmt-field-duplicate-msg">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                      Already exists: Username "@{cleanUsername}" is already registered.
                    </div>
                  )}
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
                    <option value="User">User</option>
                    <option value="Faculty">Faculty</option>
                  </select>
                </div>
              </div>

              {editingUser ? (
                <>
                  {/* Current Password - FIRST */}
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Current Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type={showOldPassword ? 'text' : 'password'} 
                        className="form-input"
                        placeholder="Enter current password"
                        value={formData.oldPassword}
                        onChange={e => setFormData({ ...formData, oldPassword: e.target.value })}
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowOldPassword(v => !v)}
                        aria-label={showOldPassword ? 'Hide password' : 'Show password'}
                        style={{
                          position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                          color: 'var(--text-muted)', display: 'flex', alignItems: 'center'
                        }}
                      >
                        {showOldPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* New Password - SECOND */}
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      New Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        className="form-input"
                        placeholder="Enter new password"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        disabled={!formData.oldPassword.trim()}
                        style={{ 
                          paddingRight: '40px',
                          opacity: !formData.oldPassword.trim() ? 0.6 : 1,
                          cursor: !formData.oldPassword.trim() ? 'not-allowed' : 'text'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        disabled={!formData.oldPassword.trim()}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        style={{
                          position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: !formData.oldPassword.trim() ? 'not-allowed' : 'pointer', padding: '4px',
                          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', opacity: !formData.oldPassword.trim() ? 0.4 : 1
                        }}
                      >
                        {showPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Add New User Password */
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      className="form-input"
                      placeholder="Enter password"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                        color: 'var(--text-muted)', display: 'flex', alignItems: 'center'
                      }}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mgmt-modal-actions">
              <button 
                type="button"
                onClick={resetForm} 
                className="mgmt-cancel-btn"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSaveUser} 
                className="btn"
                disabled={isSaving}
                style={{ opacity: isSaving ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {isSaving ? (
                  <>
                    <span className="btn-spinner" style={{ width: '14px', height: '14px' }}></span>
                    {editingUser ? 'Updating...' : 'Saving...'}
                  </>
                ) : (
                  editingUser ? 'Update User' : 'Save User'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default UserManagement;