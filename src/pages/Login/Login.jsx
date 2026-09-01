import React, { useState, useEffect, useRef } from 'react';
import { auth, db, firebaseConfig } from '../../config/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, query, where, getDocs, getDoc, setDoc, doc, onSnapshot } from 'firebase/firestore';

// Department → Program mapping (must match the 'program' field stored in Firestore sections)
const DEPARTMENT_PROGRAM = {
  'BSCS': 'BS Computer Science',
  'BAEL': 'BA English Language',
  'BSOA': 'BS Office Administration',
  'BSFT': 'BS Food Technology',
};

// Human-readable department labels
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

const findUserDocument = async (rawUsername, targetUid = null) => {
  if (!rawUsername) return undefined;
  const cleanU = rawUsername.replace(/^@+/, '').toLowerCase().trim();

  // Try common variations via indexed query (max 10 'in' values)
  const variations = Array.from(new Set([
    rawUsername,
    rawUsername.trim(),
    cleanU,
    cleanU.toUpperCase(),
    cleanU.charAt(0).toUpperCase() + cleanU.slice(1),
    `@${cleanU}`,
    `@${cleanU.toUpperCase()}`,
    `@${cleanU.charAt(0).toUpperCase() + cleanU.slice(1)}`
  ])).filter(Boolean).slice(0, 10);

  const q = query(collection(db, 'users'), where('username', 'in', variations));
  const snap = await getDocs(q);

  let matches = snap.docs.filter(d => {
    const docU = (d.data().username || '').replace(/^@+/, '').toLowerCase().trim();
    return docU === cleanU;
  });

  if (matches.length === 0) {
    // Broader fallback
    const allSnap = await getDocs(collection(db, 'users'));
    matches = allSnap.docs.filter(d => {
      const docU = (d.data().username || '').replace(/^@+/, '').toLowerCase().trim();
      return docU === cleanU;
    });
  }

  if (matches.length === 0) return undefined;

  // 1. If targetUid is provided, prioritize the document matching this Auth UID
  if (targetUid) {
    const uidMatch = matches.find(d => d.id === targetUid || d.data().id === targetUid);
    if (uidMatch) return uidMatch;
  }

  // 2. Prioritize Admin / Staff role if duplicates exist with different roles
  const adminMatch = matches.find(d => {
    const role = (d.data().role || '').toLowerCase();
    return role === 'admin' || role === 'department head' || role === 'faculty';
  });

  if (adminMatch) return adminMatch;

  return matches[0];
};

const Login = ({ onLogin }) => {
  const LOGO_SRC = '/logo.png?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpRole, setSignUpRole] = useState('User'); // 'User' | 'Admin'

  // Login & Shared fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // User / Student fields
  const [studentId, setStudentId] = useState('');
  const [department, setDepartment] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [section, setSection] = useState('');

  // Admin security fields
  const [adminPasscode, setAdminPasscode] = useState('');
  const [showAdminPasscode, setShowAdminPasscode] = useState(false);

  // Sections from Firestore (real-time)
  const [firestoreSections, setFirestoreSections] = useState([]);

  // UI state
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isSubmittingRef = useRef(false);

  const resetFormFields = () => {
    setUsername('');
    setPassword('');
    setFullName('');
    setStudentId('');
    setDepartment('');
    setYearLevel('');
    setSection('');
    setAdminPasscode('');
    setError('');
  };

  // Real-time listener for sections from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'sections'), (snapshot) => {
      const secs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFirestoreSections(secs);
    });
    return () => unsubscribe();
  }, []);

  // Auto-derive program from selected department
  const derivedProgram = department ? (DEPARTMENT_PROGRAM[department] || '') : '';

  // Filter sections based on derived program and year level
  const availableSections = firestoreSections.filter(sec => {
    if (!derivedProgram && !department) return false;
    const matchesProgram = sec.program === derivedProgram || sec.program === department;
    const matchesYear = yearLevel ? String(sec.yearLevel) === String(yearLevel) : true;
    return matchesProgram && matchesYear;
  });

  // Reset dependent fields when department changes
  const handleDepartmentChange = (val) => {
    setDepartment(val);
    setSection('');
  };

  const handleYearLevelChange = (val) => {
    setYearLevel(val);
    setSection('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError('');
    setSuccessMsg('');
    setLoading(true);

    let secondaryApp = null;
    try {
      const cleanUsername = username.replace('@', '').toLowerCase().trim();
      const dummyEmail = `${cleanUsername}@gmail.com`;

      if (isSignUp) {
        const selectedRole = signUpRole === 'Admin' ? 'Admin' : 'User';

        if (selectedRole === 'Admin') {
          if (!fullName.trim()) {
            setError('Full name is required.');
            return;
          }
          if (!username.trim()) {
            setError('Username is required.');
            return;
          }
          if (!password.trim() || password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
          }

          // Validate Admin Security Passcode
          const validAdminKey = (import.meta.env.VITE_ADMIN_SECRET_KEY || 'Raien2506').trim();
          if (!adminPasscode.trim()) {
            setError('Admin Security Passcode is required to create an administrator account.');
            return;
          }
          if (adminPasscode.trim() !== validAdminKey) {
            setError('Invalid Admin Security Passcode. Authorization is required.');
            return;
          }

          // Check if username already exists in Firestore (case-insensitive)
          const existingDoc = await findUserDocument(username);
          if (existingDoc) {
            setError('That username is already taken in our database. Please choose another.');
            return;
          }

          // Use a secondary Firebase app so we do not trigger onAuthStateChanged
          // on the primary auth instance before writing the Firestore document.
          const secondaryAppName = `SecondaryApp_signup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
          const secondaryAuth = getAuth(secondaryApp);

          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, dummyEmail, password);

          // Save Admin user to Firestore using auth UID
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            id: userCredential.user.uid,
            username: cleanUsername,
            name: fullName.trim(),
            role: 'Admin',
          });

          setIsSignUp(false);
          resetFormFields();
          setSuccessMsg('Admin account created successfully! You can now log in.');
          return;
        }

        // USER / STUDENT SIGNUP FLOW (Single clean step)
        if (!fullName.trim()) {
          setError('Full name is required.');
          return;
        }
        if (!studentId.trim()) {
          setError('Student ID is required.');
          return;
        }
        if (!department) {
          setError('Please select a department.');
          return;
        }
        if (!yearLevel) {
          setError('Please select a year level.');
          return;
        }
        if (!section) {
          setError('Please select a section.');
          return;
        }
        if (!username.trim()) {
          setError('Username is required.');
          return;
        }
        if (!password.trim() || password.length < 6) {
          setError('Password must be at least 6 characters.');
          return;
        }

        // Check if username already exists in Firestore (case-insensitive)
        const existingDoc = await findUserDocument(username);
        if (existingDoc) {
          setError('That username is already taken in our database. Please choose another.');
          return;
        }

        // Check if Student ID already exists
        const studentIdQuery = query(collection(db, 'users'), where('studentId', '==', studentId.trim()));
        const studentIdSnap = await getDocs(studentIdQuery);
        if (!studentIdSnap.empty) {
          setError('An account with this Student ID already exists.');
          return;
        }

        // Use a secondary Firebase app for clean sign-up without observer clobbering
        const secondaryAppName = `SecondaryApp_signup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);

        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, dummyEmail, password);

        // Save user to Firestore using auth UID as doc ID
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          id: userCredential.user.uid,
          username: cleanUsername,
          name: fullName.trim(),
          role: 'User',
          studentId: studentId.trim(),
          department: department,
          program: derivedProgram,
          yearLevel: parseInt(yearLevel),
          section: section,
        });

        // Switch to login view and show success message
        setIsSignUp(false);
        resetFormFields();
        setSuccessMsg('User account created successfully! You can now log in.');

      } else {
        // LOGIN FLOW
        let firestoreUserDoc = null;

        // Authenticate via Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, dummyEmail, password);

        // After successful auth, fetch user doc by UID first (with short retry for replication lag)
        if (userCredential?.user?.uid) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const userDocSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
              if (userDocSnap.exists()) {
                firestoreUserDoc = userDocSnap;
                break;
              }
            } catch (fetchErr) {
              console.warn('Could not fetch user by uid:', fetchErr);
            }
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        }

        // Fallback to username query if not found by UID
        if (!firestoreUserDoc) {
          for (let attempt = 0; attempt < 3; attempt++) {
            firestoreUserDoc = await findUserDocument(username, userCredential?.user?.uid);
            if (firestoreUserDoc) break;
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        }

        if (!firestoreUserDoc) {
          setError('Account profile not found in database. Please contact the administrator.');
          return;
        }

        const userData = firestoreUserDoc.data();
        onLogin({
          ...userData,
          name: userData.name || username,
          role: userData.role || 'User',
          username: userData.username || username
        });
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid username or password. Please try again.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('That username is already taken. Please choose another.');
      } else {
        setError(`Failed to ${isSignUp ? 'sign up' : 'log in'}: ` + err.message);
      }
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (delErr) {
          console.warn('Error deleting secondary app:', delErr);
        }
      }
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      const cleanUsername = googleUser.email.split('@')[0];

      let firestoreUserDoc = null;
      if (googleUser.uid) {
        try {
          const uSnap = await getDoc(doc(db, 'users', googleUser.uid));
          if (uSnap.exists()) firestoreUserDoc = uSnap;
        } catch (e) {
          console.warn('Google user UID fetch error:', e);
        }
      }

      if (!firestoreUserDoc) {
        firestoreUserDoc = await findUserDocument(cleanUsername);
      }
      if (!firestoreUserDoc) {
        firestoreUserDoc = await findUserDocument(googleUser.email);
      }

      let role = 'Student';
      let name = googleUser.displayName || cleanUsername;
      let finalUsername = googleUser.email;

      if (!firestoreUserDoc) {
        const newProfile = {
          username: finalUsername,
          name: name,
          role: role
        };
        await setDoc(doc(db, 'users', googleUser.uid), newProfile);
        onLogin(newProfile);
      } else {
        const userData = firestoreUserDoc.data();
        role = userData.role || 'Student';
        name = userData.name || name;
        finalUsername = userData.username || finalUsername;

        onLogin({
          ...userData,
          name: name,
          role: role,
          username: finalUsername
        });
      }

    } catch (err) {
      console.error(err);
      setError('Google Sign-In failed: ' + err.message);
    }
    setLoading(false);
  };

  const renderSignUp = () => (
    <>
      {/* Role Selection */}
      <div className="role-selector-container">
        <label className="role-selector-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Select Role
        </label>
        <div className="role-options-grid">
          <button
            type="button"
            className={`role-option-card ${signUpRole === 'User' ? 'selected' : ''}`}
            onClick={() => { setSignUpRole('User'); setError(''); }}
          >
            <div className="role-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="role-text">
              <span className="role-title">User</span>
              <span className="role-desc">Student / Viewer</span>
            </div>
          </button>

          <button
            type="button"
            className={`role-option-card admin ${signUpRole === 'Admin' ? 'selected' : ''}`}
            onClick={() => { setSignUpRole('Admin'); setError(''); }}
          >
            <div className="role-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="role-text">
              <span className="role-title">Admin</span>
              <span className="role-desc">Passcode Protected</span>
            </div>
          </button>
        </div>
      </div>

      {signUpRole === 'Admin' ? (
        <>
          {/* Admin Full Name */}
          <div className="input-group">
            <label>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Full Name
            </label>
            <input
              required
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Enter administrator full name"
            />
          </div>

          {/* Admin Username */}
          <div className="input-group">
            <label>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>
              Username
            </label>
            <input
              required
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Choose an admin username"
            />
          </div>

          {/* Admin Password */}
          <div className="input-group">
            <label>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a password (min 6 chars)"
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  color: 'inherit', opacity: 0.6, display: 'flex', alignItems: 'center'
                }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
            {password && password.length < 6 && (
              <span className="field-hint field-hint-error">Password must be at least 6 characters</span>
            )}
            {password && password.length >= 6 && (
              <span className="field-hint field-hint-success">✓ Password strength OK</span>
            )}
          </div>

          {/* Admin Security Passcode */}
          <div className="input-group">
            <label style={{ color: '#dc2626', fontWeight: 600 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Admin Security Passcode
            </label>
            <div style={{ position: 'relative' }}>
              <input
                required
                type={showAdminPasscode ? 'text' : 'password'}
                value={adminPasscode}
                onChange={e => setAdminPasscode(e.target.value)}
                placeholder="Enter Admin Passcode"
                style={{ paddingRight: '40px', borderColor: '#fca5a5' }}
              />
              <button
                type="button"
                onClick={() => setShowAdminPasscode(v => !v)}
                aria-label={showAdminPasscode ? 'Hide passcode' : 'Show passcode'}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  color: 'inherit', opacity: 0.6, display: 'flex', alignItems: 'center'
                }}
              >
                {showAdminPasscode ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
            <span className="field-hint" style={{ color: '#64748b' }}>
              🔒 Institutional authorization key required to create administrator accounts
            </span>
          </div>

          <button
            type="submit"
            className="btn-login"
            style={{ marginTop: '10px', background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
            disabled={loading || !fullName.trim() || !username.trim() || !password.trim() || password.length < 6 || !adminPasscode.trim()}
          >
            {loading ? (
              <>
                <span className="btn-spinner"></span>
                Creating Admin Account...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                Create Admin Account
              </>
            )}
          </button>
        </>
      ) : (
        <>
          {/* User Full Name */}
          <div className="input-group">
            <label>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Full Name
            </label>
            <input
              required
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Enter your full name"
            />
          </div>

          {/* Student ID & Department side by side */}
          <div className="signup-row">
            <div className="input-group" style={{ flex: 1 }}>
              <label>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><circle cx="9" cy="10" r="4"></circle><line x1="15" y1="10" x2="19" y2="10"></line><line x1="15" y1="14" x2="19" y2="14"></line><line x1="9" y1="18" x2="19" y2="18"></line></svg>
                Student ID
              </label>
              <input
                required
                type="text"
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                placeholder="Student ID"
              />
            </div>

            <div className="input-group" style={{ flex: 1 }}>
              <label>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                Department
              </label>
              <select
                required
                value={department}
                onChange={e => handleDepartmentChange(e.target.value)}
              >
                <option value="" disabled hidden>Program</option>
                {Object.keys(DEPARTMENT_PROGRAM).map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Year Level + Section side by side */}
          <div className="signup-row">
            <div className="input-group" style={{ flex: 1 }}>
              <label>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 12 12 17 22 12"></polyline><polyline points="2 17 12 22 22 17"></polyline></svg>
                Year Level
              </label>
              <select
                required
                value={yearLevel}
                onChange={e => handleYearLevelChange(e.target.value)}
                disabled={!department}
                className={!department ? 'select-disabled' : ''}
              >
                <option value="" disabled hidden>Year</option>
                {YEAR_LEVELS.map(yl => (
                  <option key={yl.value} value={yl.value}>{yl.label}</option>
                ))}
              </select>
            </div>

            <div className="input-group" style={{ flex: 1 }}>
              <label>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                Section
              </label>
              <select
                required
                value={section}
                onChange={e => setSection(e.target.value)}
                disabled={!department || !yearLevel}
                className={(!department || !yearLevel) ? 'select-disabled' : ''}
              >
                <option value="" disabled hidden>
                  {!department
                    ? 'Dept first'
                    : !yearLevel
                      ? 'Year first'
                      : availableSections.length === 0
                        ? 'No sections'
                        : 'Section'}
                </option>
                {availableSections.map(sec => (
                  <option key={sec.id} value={sec.name}>{sec.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Username */}
          <div className="input-group">
            <label>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>
              Username
            </label>
            <input
              required
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Choose a username"
            />
          </div>

          {/* Password */}
          <div className="input-group">
            <label>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a password (min 6 chars)"
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  color: 'inherit', opacity: 0.6, display: 'flex', alignItems: 'center'
                }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>
            {password && password.length < 6 && (
              <span className="field-hint field-hint-error">Password must be at least 6 characters</span>
            )}
            {password && password.length >= 6 && (
              <span className="field-hint field-hint-success">✓ Password strength OK</span>
            )}
          </div>

          <button
            type="submit"
            className="btn-login"
            style={{ marginTop: '10px' }}
            disabled={loading || !fullName.trim() || !username.trim() || !password.trim() || password.length < 6 || !studentId.trim() || !department || !yearLevel || !section}
          >
            {loading ? (
              <>
                <span className="btn-spinner"></span>
                Creating User Account...
              </>
            ) : (
              'Create User Account'
            )}
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="login-fullscreen">
      {/* Fullscreen campus background */}
      <div className="login-bg" aria-hidden="true">
        <img src="/background2.jpg?v=1" alt="" className="login-bg-img" />
      </div>
      <div className="login-bg-overlay" aria-hidden="true"></div>

      {/* Centered content */}
      <div className="login-center-wrapper">
        {/* Form card */}
        <div className={`login-card ${isSignUp ? 'login-card-wide' : ''}`}>
          {/* Branding inside card */}
          <div className="login-branding">
            <img
              src={LOGO_SRC}
              alt="CAPSU Logo"
              className="login-logo"
              onError={(e) => {
                if (e.currentTarget.src !== FALLBACK_LOGO) {
                  e.currentTarget.src = FALLBACK_LOGO;
                }
              }}
            />
            <h1 className="login-system-title">SMARTSCHED</h1>
            <p className="login-school-name">Capiz State University<br />Mambusao Satellite College</p>
          </div>

          {isSignUp ? (
            <>
              <h2 className="login-card-title">Create Account</h2>
              <p className="login-card-subtitle">
                {signUpRole === 'Admin'
                  ? 'Register as an Administrator for full system access'
                  : 'Register as a User to view schedules & classes'}
              </p>
            </>
          ) : (
            <div style={{ height: '12px' }}></div>
          )}

          {/* Error */}
          {error && (
            <div className="login-error-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              {error}
            </div>
          )}

          {/* Success */}
          {successMsg && (
            <div className="login-error-box" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10b981' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {isSignUp ? (
              renderSignUp()
            ) : (
              <>
                <div className="input-group">
                  <label>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    Username
                  </label>
                  <input
                    id="login-username"
                    required
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Enter your username"
                  />
                </div>

                <div className="input-group">
                  <label>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="login-password"
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                        color: 'inherit', opacity: 0.6, display: 'flex', alignItems: 'center'
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

                <button type="submit" id="login-submit" className="btn-login" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="btn-spinner"></span>
                      Authenticating...
                    </>
                  ) : (
                    <>
                      Sign In
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '6px' }}><path d="m9 18 6-6-6-6" /></svg>
                    </>
                  )}
                </button>
              </>
            )}
          </form>

          {/* Divider - only show on login */}
          {!isSignUp && (
            <>
              <div className="login-divider">
                <span>OR</span>
              </div>

              <button
                onClick={handleGoogleLogin}
                className="btn-login btn-google"
                disabled={loading}
                id="login-google"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '18px', height: '18px' }} />
                Sign in with Google
              </button>
            </>
          )}

          {/* Toggle between Login and Sign Up */}
          <div className="login-toggle">
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <span
              onClick={() => {
                setIsSignUp(!isSignUp);
                setSignUpRole('User');
                resetFormFields();
              }}
              className="login-toggle-link"
            >
              {isSignUp ? 'Log in here' : 'Sign up here'}
            </span>
          </div>
        </div>

        <p className="login-footer">© 2026 Capiz State University</p>
      </div>
    </div>
  );
};

export default Login;
