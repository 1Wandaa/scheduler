import React, { useState, useEffect } from 'react';
import { auth, db } from '../../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, onSnapshot } from 'firebase/firestore';

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

const findUserDocument = async (rawUsername) => {
  if (!rawUsername) return undefined;
  const cleanU = rawUsername.replace('@', '').toLowerCase().trim();
  
  // 1. Try common variations first (fast)
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
  
  let match = snap.docs.find(doc => {
    const docU = doc.data().username || '';
    return docU.replace('@', '').toLowerCase().trim() === cleanU;
  });

  if (match) return match;

  // 2. Fallback: Full collection scan (slow but robust)
  const allUsersSnap = await getDocs(collection(db, 'users'));
  match = allUsersSnap.docs.find(doc => {
    const docU = doc.data().username || '';
    return docU.replace('@', '').toLowerCase().trim() === cleanU;
  });

  return match;
};

const Login = ({ onLogin }) => {
  const LOGO_SRC = '/logo.png?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  const [isSignUp, setIsSignUp] = useState(false);

  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Sign-up personal info
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [studentId, setStudentId] = useState('');

  // Academic info
  const [department, setDepartment] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [section, setSection] = useState('');

  // Sections from Firestore (real-time)
  const [firestoreSections, setFirestoreSections] = useState([]);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signUpStep, setSignUpStep] = useState(1); // 1 = personal, 2 = academic

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
    setError('');
    setLoading(true);

    try {
      const cleanUsername = username.replace('@', '').toLowerCase();
      const dummyEmail = `${cleanUsername}@gmail.com`;

      if (isSignUp) {
        // Validate step 2 fields
        if (!age || parseInt(age) <= 0) {
          setError('Please enter a valid age.');
          setLoading(false);
          return;
        }
        if (!gender) {
          setError('Please select a gender.');
          setLoading(false);
          return;
        }
        if (!studentId.trim()) {
          setError('Student ID is required.');
          setLoading(false);
          return;
        }
        if (!department) {
          setError('Please select a department.');
          setLoading(false);
          return;
        }
        if (!yearLevel) {
          setError('Please select a year level.');
          setLoading(false);
          return;
        }
        if (!section) {
          setError('Please select a section.');
          setLoading(false);
          return;
        }

        // 0. Check if username already exists in Firestore (case-insensitive)
        const existingDoc = await findUserDocument(username);
        if (existingDoc) {
          setError('That username is already taken in our database. Please choose another.');
          setLoading(false);
          return;
        }

        // 0.5. Check if Student ID already exists
        const studentIdQuery = query(collection(db, 'users'), where('studentId', '==', studentId.trim()));
        const studentIdSnap = await getDocs(studentIdQuery);
        if (!studentIdSnap.empty) {
          setError('An account with this Student ID already exists.');
          setLoading(false);
          return;
        }

        // 1. Create user identity in Firebase Auth
        await createUserWithEmailAndPassword(auth, dummyEmail, password);

        // 2. Save user to Firestore with all student info
        await addDoc(collection(db, 'users'), {
          username: cleanUsername,
          name: fullName,
          age: parseInt(age) || null,
          gender: gender,
          role: 'Student',
          studentId: studentId.trim(),
          department: department,
          program: derivedProgram,
          yearLevel: parseInt(yearLevel),
          section: section,
        });

        // 3. Log them in directly after sign up
        onLogin({
          username: cleanUsername,
          name: fullName,
          role: 'Student',
          age: parseInt(age) || null,
          gender: gender,
          studentId: studentId.trim(),
          department: department,
          program: derivedProgram,
          yearLevel: parseInt(yearLevel),
          section: section
        });

      } else {
        // LOGIN FLOW (Existing)
        let firestoreUserDoc = null;

        try {
          await signInWithEmailAndPassword(auth, dummyEmail, password);
        } catch (signInErr) {
          // Fallback: If auth fails, check if there's a user manually created in Firestore with a plain-text password
          if (signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/wrong-password') {
            
            firestoreUserDoc = await findUserDocument(username);
            
            if (firestoreUserDoc) {
              const firestoreUserData = firestoreUserDoc.data();
              
              // Verify if the password matches the one set in Firestore manually
              if (firestoreUserData.password && firestoreUserData.password.trim() === password.trim()) {
                if (password.length < 6) {
                   throw new Error('Firebase requires passwords to be at least 6 characters long. Please change it in Firestore.');
                }
                try {
                  // Create the Auth account behind the scenes so future logins are fully secure
                  await createUserWithEmailAndPassword(auth, dummyEmail, password);
                } catch (createErr) {
                  if (createErr.code === 'auth/email-already-in-use') {
                    // Account already existed, meaning they just typed the wrong password for their actual Auth account
                    throw new Error('Invalid password. Please try again.');
                  }
                  throw createErr;
                }
              } else {
                throw new Error('The password does not match what is in Firestore.');
              }
            } else {
              throw new Error(`Username "${username}" not found in Firestore Database. Check your spelling.`);
            }
          } else {
            throw signInErr;
          }
        }

        // After successful auth, fetch the user doc if not already fetched from fallback
        if (!firestoreUserDoc) {
          firestoreUserDoc = await findUserDocument(username);
        }

        if (!firestoreUserDoc) {
          // Edge case: They have an Auth account but no Firestore doc.
          // Create the profile to avoid breaking their login.
          const newProfile = {
            username: username,
            name: cleanUsername,
            role: username.toLowerCase().includes('admin') ? 'Admin' : 'Student'
          };
          await addDoc(collection(db, 'users'), newProfile);
          onLogin(newProfile);
          setLoading(false);
          return;
        }

        const userData = firestoreUserDoc.data();
        onLogin({
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
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      const cleanUsername = googleUser.email.split('@')[0];

      let firestoreUserDoc = await findUserDocument(cleanUsername);
      if (!firestoreUserDoc) {
        firestoreUserDoc = await findUserDocument(googleUser.email);
      }

      let role = 'Student';
      let name = googleUser.displayName || cleanUsername;
      let finalUsername = googleUser.email;

      if (!firestoreUserDoc) {
        await addDoc(collection(db, 'users'), {
          username: finalUsername,
          name: name,
          role: role
        });
      } else {
        const userData = firestoreUserDoc.data();
        role = userData.role || 'Student';
        name = userData.name || name;
        finalUsername = userData.username || finalUsername;
      }

      onLogin({
        name: name,
        role: role,
        username: finalUsername
      });

    } catch (err) {
      console.error(err);
      setError('Google Sign-In failed: ' + err.message);
    }
    setLoading(false);
  };

  // Validate step 1 before moving to step 2
  const canProceedToStep2 = fullName.trim() && age && gender && username.trim() && password.trim() && password.length >= 6;

  const handleNextStep = () => {
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!age || parseInt(age) <= 0) {
      setError('Age is required.');
      return;
    }
    if (!gender) {
      setError('Gender is required.');
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
    setError('');
    setSignUpStep(2);
  };

  const renderSignUpStep1 = () => (
    <>
      <div className="signup-step-indicator">
        <div className="step-dot active">1</div>
        <div className="step-line"></div>
        <div className="step-dot">2</div>
      </div>
      <p className="step-label">Personal &amp; Account Information</p>

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
          placeholder="e.g. Ryan James Mora"
        />
      </div>

      <div className="signup-row">
        <div className="input-group" style={{ flex: 1 }}>
          <label>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            Age
          </label>
          <input
            required
            type="number"
            min="1"
            value={age}
            onChange={e => setAge(e.target.value)}
            placeholder="e.g. 20"
          />
        </div>

        <div className="input-group" style={{ flex: 1 }}>
          <label>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            Gender
          </label>
          <select
            required
            value={gender}
            onChange={e => setGender(e.target.value)}
          >
            <option value="">Select Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <div className="input-group">
        <label>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M15.5 7.5l-7 7" /><circle cx="9.5" cy="9.5" r="2.5" /><circle cx="14.5" cy="14.5" r="2.5" /></svg>
          Username
        </label>
        <input
          required
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="e.g. rayenn2506"
        />
      </div>

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
        type="button"
        className="btn-login"
        style={{ marginTop: '10px' }}
        onClick={handleNextStep}
        disabled={!canProceedToStep2}
      >
        Next — Academic Info
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '8px', verticalAlign: 'middle' }}><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </>
  );

  const renderSignUpStep2 = () => (
    <>
      <div className="signup-step-indicator">
        <div className="step-dot completed">✓</div>
        <div className="step-line active"></div>
        <div className="step-dot active">2</div>
      </div>
      <p className="step-label">Academic Information</p>

      {/* Student ID */}
      <div className="input-group">
        <label>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><rect x="2" y="3" width="20" height="18" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="12" y2="15" /></svg>
          Student ID
        </label>
        <input
          required
          type="text"
          value={studentId}
          onChange={e => setStudentId(e.target.value)}
          placeholder="e.g. 2023-131151"
        />
      </div>

      {/* Department */}
      <div className="input-group">
        <label>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
          Department / Program
        </label>
        <select
          required
          value={department}
          onChange={e => handleDepartmentChange(e.target.value)}
        >
          <option value="">Select your program</option>
          {Object.keys(DEPARTMENT_PROGRAM).map(dept => (
            <option key={dept} value={dept}>{DEPARTMENT_LABELS[dept] || dept}</option>
          ))}
        </select>
        {department && (
          <span className="field-hint field-hint-success">✓ Program: {derivedProgram}</span>
        )}
      </div>

      {/* Year Level + Section side by side */}
      <div className="signup-row">
        <div className="input-group" style={{ flex: 1 }}>
          <label>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            Year Level
          </label>
          <select
            required
            value={yearLevel}
            onChange={e => handleYearLevelChange(e.target.value)}
            disabled={!department}
            className={!department ? 'select-disabled' : ''}
          >
            <option value="">Select</option>
            {YEAR_LEVELS.map(yl => (
              <option key={yl.value} value={yl.value}>{yl.label}</option>
            ))}
          </select>
        </div>

        <div className="input-group" style={{ flex: 1 }}>
          <label>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            Section
          </label>
          <select
            required
            value={section}
            onChange={e => setSection(e.target.value)}
            disabled={!department || !yearLevel}
            className={(!department || !yearLevel) ? 'select-disabled' : ''}
          >
            <option value="">
              {!department
                ? 'Select dept first'
                : !yearLevel
                  ? 'Select year first'
                  : availableSections.length === 0
                    ? 'No sections available'
                    : 'Select Section'}
            </option>
            {availableSections.map(sec => (
              <option key={sec.id} value={sec.name}>{sec.name}</option>
            ))}
          </select>
          {department && yearLevel && availableSections.length === 0 && (
            <span className="field-hint field-hint-warning">No sections found for Year {yearLevel}. Contact your admin.</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <button
          type="button"
          className="btn-login btn-back-step"
          onClick={() => { setSignUpStep(1); setError(''); }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="m15 18-6-6 6-6" /></svg>
          Back
        </button>
        <button type="submit" className="btn-login" disabled={loading} style={{ flex: 1 }}>
          {loading ? (
            <>
              <span className="btn-spinner"></span>
              Creating Account...
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </div>
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
            <p className="login-school-name">Capiz State University<br />Mambusao Poblacion Campus</p>
          </div>

          {isSignUp ? (
            <>
              <h2 className="login-card-title">Create Account</h2>
              <p className="login-card-subtitle">Register as a student to get started</p>
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

          <form onSubmit={handleSubmit}>
            {isSignUp ? (
              signUpStep === 1 ? renderSignUpStep1() : renderSignUpStep2()
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

          {/* Divider — only show on login or step 1 */}
          {(!isSignUp || signUpStep === 1) && (
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
                setError('');
                setSignUpStep(1);
                setFullName('');
                setAge('');
                setGender('');
                setStudentId('');
                setDepartment('');
                setYearLevel('');
                setSection('');
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
