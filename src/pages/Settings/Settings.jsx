import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../config/firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { Icon, NAV_ICONS } from '../Dashboard/components/Icon';
import './Settings.css';

const DEPARTMENT_PROGRAM = {
  'BSCS': 'BS Computer Science',
  'BAEL': 'BA English Language',
  'BSOA': 'BS Office Administration',
  'BSFT': 'BS Food Technology',
};

const DEPARTMENT_LABELS = {
  'BSCS': 'Bachelor of Science in Computer Science (BSCS)',
  'BAEL': 'Bachelor of Arts in English Language (BAEL)',
  'BSOA': 'Bachelor of Science in Office Administration (BSOA)',
  'BSFT': 'Bachelor of Science in Food Technology (BSFT)',
};

const YEAR_LEVELS = [
  { value: 1, label: '1st Year' },
  { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' },
  { value: 4, label: '4th Year' },
];

const Settings = ({ user, onUpdateUser, onBack }) => {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'preferences' | 'security'
  const [docId, setDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Profile Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [studentId, setStudentId] = useState('');
  const [department, setDepartment] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [section, setSection] = useState('');
  const [academicRank, setAcademicRank] = useState('');
  const [officeLocation, setOfficeLocation] = useState('');

  // Password / Security States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // System & Schedule Preferences
  const [timeFormat, setTimeFormat] = useState(() => {
    try {
      return localStorage.getItem('smartsched_time_format') || '12h';
    } catch {
      return '12h';
    }
  });

  const [compactSpacing, setCompactSpacing] = useState(() => {
    try {
      return localStorage.getItem('smartsched_compact_spacing') === 'true';
    } catch {
      return false;
    }
  });

  const [conflictAlerts, setConflictAlerts] = useState(() => {
    try {
      return localStorage.getItem('smartsched_pref_conflict_alerts') !== 'false';
    } catch {
      return true;
    }
  });

  const [soundFeedback, setSoundFeedback] = useState(() => {
    try {
      return localStorage.getItem('smartsched_pref_sound') === 'true';
    } catch {
      return false;
    }
  });

  const [defaultTab, setDefaultTab] = useState(() => {
    try {
      return localStorage.getItem('smartsched_pref_default_tab') || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });

  // Sections from Firestore
  const [firestoreSections, setFirestoreSections] = useState([]);

  const isStudent = useMemo(() => {
    const role = (user?.role || '').toLowerCase();
    return role === 'user' || role === 'student';
  }, [user]);

  const isFaculty = useMemo(() => {
    const role = (user?.role || '').toLowerCase();
    return role === 'faculty';
  }, [user]);

  const isAdmin = useMemo(() => {
    const role = (user?.role || '').toLowerCase();
    return role === 'admin' || role === 'department head';
  }, [user]);

  // Fetch user profile from Firestore
  useEffect(() => {
    let isMounted = true;
    const fetchUserData = async () => {
      try {
        if (!user?.username && !user?.uid && !user?.id) return;
        const cleanUsername = (user.username || '').replace('@', '').toLowerCase().trim();

        let foundDoc = null;
        if (user.uid || user.id) {
          const targetId = user.uid || user.id;
          const snap = await getDocs(query(collection(db, 'users'), where('__name__', '==', targetId)));
          if (!snap.empty) foundDoc = snap.docs[0];
        }

        if (!foundDoc && cleanUsername) {
          const q = query(collection(db, 'users'), where('username', '==', cleanUsername));
          const snap = await getDocs(q);
          if (!snap.empty) foundDoc = snap.docs[0];
        }

        if (!foundDoc && user.username) {
          const q = query(collection(db, 'users'), where('username', '==', user.username));
          const snap = await getDocs(q);
          if (!snap.empty) foundDoc = snap.docs[0];
        }

        if (foundDoc && isMounted) {
          setDocId(foundDoc.id);
          const data = foundDoc.data();
          setName(data.name || user.name || '');
          setEmail(data.email || user.email || '');
          setUsername(data.username || user.username || '');
          setPhone(data.phone || '');
          setAge(data.age ? String(data.age) : '');
          setGender(data.gender || '');
          setStudentId(data.studentId || '');
          setDepartment(data.department || '');
          setYearLevel(data.yearLevel ? String(data.yearLevel) : '');
          setSection(data.section || '');
          setAcademicRank(data.academicRank || data.title || '');
          setOfficeLocation(data.officeLocation || data.office || '');

          if (data.settings) {
            if (data.settings.timeFormat) setTimeFormat(data.settings.timeFormat);
            if (typeof data.settings.compactSpacing === 'boolean') setCompactSpacing(data.settings.compactSpacing);
            if (typeof data.settings.conflictAlerts === 'boolean') setConflictAlerts(data.settings.conflictAlerts);
            if (typeof data.settings.soundFeedback === 'boolean') setSoundFeedback(data.settings.soundFeedback);
            if (data.settings.defaultTab) setDefaultTab(data.settings.defaultTab);
          }
        } else if (isMounted) {
          setName(user.name || '');
          setEmail(user.email || '');
          setUsername(user.username || '');
          setStudentId(user.studentId || '');
          setDepartment(user.department || '');
        }
      } catch (err) {
        console.error('[Settings] Error fetching user profile:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUserData();

    const unsubSections = onSnapshot(collection(db, 'sections'), (snapshot) => {
      const secs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setFirestoreSections(secs);
    });

    return () => {
      isMounted = false;
      unsubSections();
    };
  }, [user]);

  const derivedProgram = department ? DEPARTMENT_PROGRAM[department] || '' : '';

  const availableSections = firestoreSections.filter((sec) => {
    if (!derivedProgram && !department) return false;
    const matchesProgram = sec.program === derivedProgram || sec.program === department;
    const matchesYear = yearLevel ? String(sec.yearLevel) === String(yearLevel) : true;
    return matchesProgram && matchesYear;
  });

  // Calculate password strength
  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, label: '', color: '#cbd5e1', width: '0%' };
    let score = 0;
    if (newPassword.length >= 6) score += 1;
    if (newPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;

    if (score <= 2) return { score, label: 'Weak', color: '#ef4444', width: '33%' };
    if (score <= 4) return { score, label: 'Good', color: '#f59e0b', width: '66%' };
    return { score, label: 'Strong', color: '#10b981', width: '100%' };
  }, [newPassword]);

  // Handle Save Profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!docId && !user?.uid) {
      toast.error('Unable to locate your user document.');
      return;
    }

    setIsSaving(true);
    try {
      if (!name.trim()) throw new Error('Full Name cannot be empty.');

      const updateData = {
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        phone: phone.trim(),
        gender: gender || null,
        department: department || null,
        program: derivedProgram || null,
        ...(age && { age: parseInt(age) || null }),
        ...(studentId.trim() && { studentId: studentId.trim() }),
        ...(yearLevel && { yearLevel: parseInt(yearLevel) }),
        ...(section && { section }),
        ...(academicRank.trim() && { academicRank: academicRank.trim() }),
        ...(officeLocation.trim() && { officeLocation: officeLocation.trim() }),
        settings: {
          timeFormat,
          compactSpacing,
          conflictAlerts,
          soundFeedback,
          defaultTab,
        },
      };

      const targetDocRef = doc(db, 'users', docId || user.uid);
      await updateDoc(targetDocRef, updateData);

      if (onUpdateUser) {
        onUpdateUser(updateData);
      }

      toast.success('Account profile updated successfully!');
    } catch (err) {
      console.error('[Settings] Error saving profile:', err);
      toast.error(err.message || 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  // Sync preferences to Firestore
  const handleSavePreferences = async (newCompact, newFormat, newAlerts, newSound, newDefault) => {
    try {
      const activeDocId = docId || user?.uid;
      if (!activeDocId) return;

      const settingsData = {
        settings: {
          compactSpacing: newCompact !== undefined ? newCompact : compactSpacing,
          timeFormat: newFormat !== undefined ? newFormat : timeFormat,
          conflictAlerts: newAlerts !== undefined ? newAlerts : conflictAlerts,
          soundFeedback: newSound !== undefined ? newSound : soundFeedback,
          defaultTab: newDefault !== undefined ? newDefault : defaultTab,
        },
      };

      await updateDoc(doc(db, 'users', activeDocId), settingsData);
    } catch (err) {
      console.warn('[Settings] Syncing preferences to Firestore:', err);
    }
  };

  // Change Password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('No authenticated user session found. Please log in again.');
      }

      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully! Keep your new credentials safe.');
    } catch (err) {
      console.error('[Settings] Change password error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect.');
      } else if (err.code === 'auth/weak-password') {
        toast.error('Password is too weak. Please use letters, numbers, and symbols.');
      } else {
        toast.error(err.message || 'Failed to update password.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const getInitials = (str) => {
    if (!str) return 'U';
    return str
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  if (loading) {
    return (
      <div className="settings-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '320px', gap: '16px' }}>
        <div className="btn-spinner" style={{ width: '32px', height: '32px' }}></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading user account settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-wrapper tab-entrance-anim">
      {onBack && (
        <button className="settings-back-btn" onClick={onBack} title="Return to Dashboard">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Dashboard
        </button>
      )}

      {/* Hero Header */}
      <div className="settings-hero">
        <div className="settings-hero-left">
          <div className="settings-avatar">{getInitials(name || user?.name || user?.username)}</div>
          <div className="settings-hero-info">
            <h1>Account & System Settings</h1>
            <p>Customize your personal profile, credentials, and scheduling preferences.</p>
            <span className={`settings-role-tag ${(user?.role || '').toLowerCase()}`}>{user?.role || 'User'}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="settings-nav-tabs">
        <button
          className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <Icon d={NAV_ICONS.users} size={18} />
          <span>Profile & Account</span>
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveTab('preferences')}
        >
          <Icon d={NAV_ICONS.calendar} size={18} />
          <span>Scheduler Preferences</span>
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>Security & Password</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: PROFILE & ACCOUNT
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="settings-card tab-entrance-anim">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon">
                <Icon d={NAV_ICONS.users} size={20} />
              </div>
              <div>
                <h2>Personal & Academic Details</h2>
                <p>Update your public account information and contact identifiers.</p>
              </div>
            </div>
          </div>

          <div className="settings-form-grid">
            <div className="settings-field span-2">
              <label>Full Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dr. Jelly L. Paredes"
                required
              />
            </div>

            <div className="settings-field">
              <label>Username / Handle</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@username"
                disabled={!isAdmin && Boolean(username)}
                title={!isAdmin ? 'Contact administrator to change account username' : 'Account username'}
              />
            </div>

            <div className="settings-field">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@capsu.edu.ph"
              />
            </div>

            <div className="settings-field">
              <label>Phone / Contact Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+63 912 345 6789"
              />
            </div>

            <div className="settings-field">
              <label>Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other / Prefer not to say</option>
              </select>
            </div>

            <div className="settings-field">
              <label>Age</label>
              <input
                type="number"
                min="10"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Age"
              />
            </div>

            {/* Student specific fields */}
            {isStudent && (
              <>
                <div className="settings-field">
                  <label>Student ID Number</label>
                  <input
                    type="text"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="e.g. 2024-00123"
                  />
                </div>

                <div className="settings-field">
                  <label>Department / Program</label>
                  <select
                    value={department}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      setSection('');
                    }}
                  >
                    <option value="">Select Program</option>
                    {Object.keys(DEPARTMENT_PROGRAM).map((dept) => (
                      <option key={dept} value={dept}>
                        {DEPARTMENT_LABELS[dept] || dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-field">
                  <label>Year Level</label>
                  <select
                    value={yearLevel}
                    onChange={(e) => {
                      setYearLevel(e.target.value);
                      setSection('');
                    }}
                    disabled={!department}
                  >
                    <option value="">Select Year</option>
                    {YEAR_LEVELS.map((yl) => (
                      <option key={yl.value} value={yl.value}>
                        {yl.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-field">
                  <label>Section</label>
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    disabled={!department || !yearLevel}
                  >
                    <option value="">
                      {!department
                        ? 'Select program first'
                        : !yearLevel
                        ? 'Select year first'
                        : availableSections.length === 0
                        ? 'No sections available'
                        : 'Select Section'}
                    </option>
                    {availableSections.map((sec) => (
                      <option key={sec.id} value={sec.name}>
                        {sec.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Faculty specific fields */}
            {(isFaculty || isAdmin) && (
              <>
                <div className="settings-field">
                  <label>Academic Rank / Title</label>
                  <input
                    type="text"
                    value={academicRank}
                    onChange={(e) => setAcademicRank(e.target.value)}
                    placeholder="e.g. Associate Professor IV"
                  />
                </div>

                <div className="settings-field">
                  <label>Consultation Office / Room</label>
                  <input
                    type="text"
                    value={officeLocation}
                    onChange={(e) => setOfficeLocation(e.target.value)}
                    placeholder="e.g. Faculty Room 204"
                  />
                </div>
              </>
            )}
          </div>

          <div className="settings-actions">
            <button type="submit" className="btn-settings-save" disabled={isSaving}>
              {isSaving ? (
                <>
                  <span className="btn-spinner"></span>
                  Saving Profile...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                  Save Profile Changes
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: SCHEDULER & SYSTEM PREFERENCES
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'preferences' && (
        <div className="settings-card tab-entrance-anim">
          <div className="settings-card-header">
            <div className="settings-card-header-left">
              <div className="settings-card-icon">
                <Icon d={NAV_ICONS.calendar} size={20} />
              </div>
              <div>
                <h2>Scheduler & Display Preferences</h2>
                <p>Customize timetable formatting, default landing view, and system notification alerts.</p>
              </div>
            </div>
          </div>

          {/* Time Format */}
          <div className="settings-pref-row">
            <div className="settings-pref-info">
              <h3>Timetable Time Format</h3>
              <p>Choose between 12-hour (e.g. 7:30 AM – 9:00 AM) or 24-hour military clock (07:30 – 09:00).</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`btn-settings-secondary ${timeFormat === '12h' ? 'active-btn' : ''}`}
                style={{
                  background: timeFormat === '12h' ? 'var(--accent-primary)' : 'transparent',
                  color: timeFormat === '12h' ? '#fff' : 'var(--text-main)',
                  borderColor: timeFormat === '12h' ? 'var(--accent-primary)' : 'var(--border-color)',
                  padding: '6px 14px',
                  fontSize: '0.84rem',
                }}
                onClick={() => {
                  setTimeFormat('12h');
                  try {
                    localStorage.setItem('smartsched_time_format', '12h');
                  } catch (e) {
                    console.warn(e);
                  }
                  handleSavePreferences(undefined, '12h');
                  toast.success('Time format set to 12-Hour (AM/PM)');
                }}
              >
                12-Hour (AM/PM)
              </button>
              <button
                type="button"
                className={`btn-settings-secondary ${timeFormat === '24h' ? 'active-btn' : ''}`}
                style={{
                  background: timeFormat === '24h' ? 'var(--accent-primary)' : 'transparent',
                  color: timeFormat === '24h' ? '#fff' : 'var(--text-main)',
                  borderColor: timeFormat === '24h' ? 'var(--accent-primary)' : 'var(--border-color)',
                  padding: '6px 14px',
                  fontSize: '0.84rem',
                }}
                onClick={() => {
                  setTimeFormat('24h');
                  try {
                    localStorage.setItem('smartsched_time_format', '24h');
                  } catch (e) {
                    console.warn(e);
                  }
                  handleSavePreferences(undefined, '24h');
                  toast.success('Time format set to 24-Hour (Military)');
                }}
              >
                24-Hour (Military)
              </button>
            </div>
          </div>

          {/* Default Start Tab */}
          <div className="settings-pref-row">
            <div className="settings-pref-info">
              <h3>Default Landing Tab</h3>
              <p>Select which tab opens automatically when you sign into your SMARTSCHED session.</p>
            </div>
            <select
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: '#ffffff',
                color: 'var(--text-main)',
                fontSize: '0.88rem',
              }}
              value={defaultTab}
              onChange={(e) => {
                const val = e.target.value;
                setDefaultTab(val);
                try {
                  localStorage.setItem('smartsched_pref_default_tab', val);
                } catch (err) {
                  console.warn(err);
                }
                handleSavePreferences(undefined, undefined, undefined, undefined, val);
                toast.success(`Default start tab updated to "${val}"`);
              }}
            >
              <option value="dashboard">Dashboard Overview</option>
              <option value="view-schedules">Class Schedules</option>
              {isFaculty && <option value="workload">Faculty Workload</option>}
              {isAdmin && <option value="schedule">Schedule Creator</option>}
            </select>
          </div>

          {/* Conflict Alerts Switch */}
          <div className="settings-pref-row">
            <div className="settings-pref-info">
              <h3>Conflict & Overlap Highlighting</h3>
              <p>Show real-time visual warning badges when rooms or faculty members have overlapping slots.</p>
            </div>
            <label className="switch-toggle">
              <input
                type="checkbox"
                checked={conflictAlerts}
                onChange={(e) => {
                  const val = e.target.checked;
                  setConflictAlerts(val);
                  try {
                    localStorage.setItem('smartsched_pref_conflict_alerts', String(val));
                  } catch (err) {
                    console.warn(err);
                  }
                  handleSavePreferences(undefined, undefined, val);
                  toast.success(val ? 'Conflict alerts enabled' : 'Conflict alerts muted');
                }}
              />
              <span className="slider-round"></span>
            </label>
          </div>

          {/* Audio Chime Feedback */}
          <div className="settings-pref-row">
            <div className="settings-pref-info">
              <h3>Audio Feedback</h3>
              <p>Play subtle sound cues upon successful schedule creation and batch updates.</p>
            </div>
            <label className="switch-toggle">
              <input
                type="checkbox"
                checked={soundFeedback}
                onChange={(e) => {
                  const val = e.target.checked;
                  setSoundFeedback(val);
                  try {
                    localStorage.setItem('smartsched_pref_sound', String(val));
                  } catch (err) {
                    console.warn(err);
                  }
                  handleSavePreferences(undefined, undefined, undefined, val);
                  toast.success(val ? 'Audio feedback enabled' : 'Audio feedback muted');
                }}
              />
              <span className="slider-round"></span>
            </label>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: SECURITY & CREDENTIALS
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'security' && (
        <div className="tab-entrance-anim">
          <form onSubmit={handleChangePassword} className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-header-left">
                <div className="settings-card-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
                <div>
                  <h2>Change Password</h2>
                  <p>Protect your account with a strong password. Current password verification is required.</p>
                </div>
              </div>
            </div>

            <div className="settings-form-grid">
              <div className="settings-field span-2">
                <label>Current Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass((p) => !p)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      padding: 0,
                    }}
                  >
                    {showCurrentPass ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="settings-field">
                <label>New Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 6 characters)"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass((p) => !p)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      padding: 0,
                    }}
                  >
                    {showNewPass ? 'Hide' : 'Show'}
                  </button>
                </div>

                {newPassword && (
                  <div className="password-strength-wrapper">
                    <div className="strength-bar-track">
                      <div
                        className="strength-bar-fill"
                        style={{
                          width: passwordStrength.width,
                          backgroundColor: passwordStrength.color,
                        }}
                      ></div>
                    </div>
                    <span className="strength-label" style={{ color: passwordStrength.color }}>
                      Password Strength: {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              <div className="settings-field">
                <label>Confirm New Password *</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  required
                />
              </div>
            </div>

            <div className="settings-actions">
              <button
                type="submit"
                className="btn-settings-save"
                disabled={isChangingPassword || !currentPassword || !newPassword}
              >
                {isChangingPassword ? (
                  <>
                    <span className="btn-spinner"></span> Updating Password...
                  </>
                ) : (
                  <>Update Password</>
                )}
              </button>
            </div>
          </form>

          {/* Security & Audit Info Card */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-header-left">
                <div className="settings-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                  <Icon d={NAV_ICONS.activityLog} size={20} />
                </div>
                <div>
                  <h2>Session & Security Info</h2>
                  <p>Security audit details for this authenticated account session.</p>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--table-header)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Account Role</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>{user?.role || 'User'}</div>
              </div>

              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--table-header)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Auth UID</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '4px', wordBreak: 'break-all' }}>
                  {auth.currentUser?.uid || user?.id || '—'}
                </div>
              </div>

              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--table-header)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Registered Email</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '4px' }}>
                  {auth.currentUser?.email || user?.email || '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
