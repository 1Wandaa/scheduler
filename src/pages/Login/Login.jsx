import React, { useState, useEffect } from 'react';
import { auth, db } from '../../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, onSnapshot } from 'firebase/firestore';

// Department → Courses mapping
const DEPARTMENT_COURSES = {
  'BSCS': [
    'Bachelor of Science in Computer Science',
  ],
  'BAEL': [
    'Bachelor of Arts in English Language',
  ],
  'BSOA': [
    'Bachelor of Science in Office Administration',
  ],
  'BSFT': [
    'Bachelor of Science in Food Technology',
  ],
};

const YEAR_LEVELS = [
  { value: 1, label: '1st Year' },
  { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' },
  { value: 4, label: '4th Year' },
];

const Login = ({ onLogin }) => {
  const LOGO_SRC = '/logo.jpg?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  const [isSignUp, setIsSignUp] = useState(false);

  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Sign-up personal info
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');

  // Academic info
  const [department, setDepartment] = useState('');
  const [course, setCourse] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [section, setSection] = useState('');

  // Sections from Firestore (real-time)
  const [firestoreSections, setFirestoreSections] = useState([]);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  // Available courses based on selected department
  const availableCourses = department ? (DEPARTMENT_COURSES[department] || []) : [];

  // Filter sections based on selected course and year level
  const availableSections = firestoreSections.filter(sec => {
    if (!course) return false;
    const matchesCourse = sec.program === course;
    const matchesYear = yearLevel ? sec.yearLevel === parseInt(yearLevel) : true;
    return matchesCourse && matchesYear;
  });

  // Reset dependent fields when department changes
  const handleDepartmentChange = (val) => {
    setDepartment(val);
    setCourse('');
    setSection('');
  };

  // Reset section when course or year changes
  const handleCourseChange = (val) => {
    setCourse(val);
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
      const dummyEmail = `${cleanUsername}@smartsched.capsu.local`;

      if (isSignUp) {
        // Validate step 2 fields
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
        if (!course) {
          setError('Please select a course.');
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

        // 1. Create user identity in Firebase Auth
        await createUserWithEmailAndPassword(auth, dummyEmail, password);

        // 2. Save user to Firestore with all student info
        await addDoc(collection(db, 'users'), {
          username: username,
          name: fullName,
          role: 'Student',
          studentId: studentId.trim(),
          department: department,
          course: course,
          yearLevel: parseInt(yearLevel),
          section: section,
        });

        // 3. Log them in directly after sign up
        onLogin({
          name: fullName,
          role: 'Student',
          username: username
        });

      } else {
        // LOGIN FLOW (Existing)
        await signInWithEmailAndPassword(auth, dummyEmail, password);

        const q = query(collection(db, 'users'), where('username', '==', username));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          const newProfile = {
            username: username,
            name: cleanUsername,
            role: 'Student'
          };
          await addDoc(collection(db, 'users'), newProfile);
          onLogin(newProfile);
          setLoading(false);
          return;
        }

        const userData = querySnapshot.docs[0].data();
        onLogin({
          name: userData.name || username,
          role: userData.role || 'User',
          username: username
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

      const q = query(collection(db, 'users'), where('username', 'in', [cleanUsername, `@${cleanUsername}`, googleUser.email]));
      const querySnapshot = await getDocs(q);

      let role = 'Student';
      let name = googleUser.displayName || cleanUsername;
      let finalUsername = googleUser.email;

      if (querySnapshot.empty) {
        await addDoc(collection(db, 'users'), {
          username: finalUsername,
          name: name,
          role: role
        });
      } else {
        const userData = querySnapshot.docs[0].data();
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
  const canProceedToStep2 = fullName.trim() && username.trim() && password.trim() && password.length >= 6;

  const handleNextStep = () => {
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
      <p className="step-label">Personal & Account Information</p>

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
        <input
          required
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Create a password (min 6 chars)"
        />
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

      <div className="input-group">
        <label>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
          Department
        </label>
        <select
          required
          value={department}
          onChange={e => handleDepartmentChange(e.target.value)}
        >
          <option value=""> Select Department </option>
          {Object.keys(DEPARTMENT_COURSES).map(dept => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" /></svg>
          Course / Program
        </label>
        <select
          required
          value={course}
          onChange={e => handleCourseChange(e.target.value)}
          disabled={!department}
          className={!department ? 'select-disabled' : ''}
        >
          <option value="">{department ? '— Select Course —' : '— Select a department first —'}</option>
          {availableCourses.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

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
          >
            <option value="">— Select —</option>
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
            disabled={!course}
            className={!course ? 'select-disabled' : ''}
          >
            <option value="">
              {!course ? '— Select course first —' : availableSections.length === 0 ? '— No sections available —' : '— Select Section —'}
            </option>
            {availableSections.map(sec => (
              <option key={sec.id} value={sec.name}>{sec.name}</option>
            ))}
          </select>
          {course && availableSections.length === 0 && (
            <span className="field-hint field-hint-warning">No sections found for this course{yearLevel ? ` (Year ${yearLevel})` : ''}. Contact your admin.</span>
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
    <div className="login-container">
      {/* Animated background orbs */}
      <div className="login-bg-orbs" aria-hidden="true">
        <div className="login-orb login-orb-1"></div>
        <div className="login-orb login-orb-2"></div>
        <div className="login-orb login-orb-3"></div>
        <div className="login-orb login-orb-4"></div>
      </div>

      <div className="login-split-layout">
        {/* LEFT — Branded Hero Panel with campus background */}
        <div className="login-hero-panel">
          <div className="login-hero-bg" aria-hidden="true">
            <img src="/background2.jpg?v=1" alt="" className="login-hero-bg-img" />
          </div>
          <div className="login-hero-overlay" aria-hidden="true"></div>
          <div className="login-hero-content">
            <img
              src={LOGO_SRC}
              alt="CAPSU Logo"
              className="login-hero-logo"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = FALLBACK_LOGO;
              }}
            />
            <h1 className="login-hero-title">SMARTSCHED</h1>
            <p className="login-hero-subtitle">Capiz State University<br />Mambusao Poblacion Campus</p>
            <div className="login-hero-features">
              <div className="login-hero-feature">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <span>Smart Class Scheduling</span>
              </div>
              <div className="login-hero-feature">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                <span>Conflict-free Timetables</span>
              </div>
              <div className="login-hero-feature">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                <span>Multi-role Access Control</span>
              </div>
            </div>
          </div>
          <p className="login-hero-footer">© 2026 Capiz State University</p>
        </div>

        {/* RIGHT — Form Panel */}
        <div className="login-form-panel">
          <div className={`login-box ${isSignUp ? 'login-box-wide' : ''}`}>
            {/* Mobile campus banner — only visible on small screens */}
            <div className="login-mobile-banner">
              <img src="/background2.jpg?v=1" alt="" className="login-mobile-banner-bg" />
              <div className="login-mobile-banner-overlay"></div>
              <div className="login-mobile-banner-content">
                <img
                  src={LOGO_SRC}
                  alt="CAPSU Logo"
                  className="login-mobile-banner-logo"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = FALLBACK_LOGO;
                  }}
                />
                <span className="login-mobile-banner-title">SMARTSCHED</span>
              </div>
            </div>

            <h2 className="login-form-title">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="login-form-subtitle">
              {isSignUp ? 'Register as a student to get started' : 'Sign in to continue to SmartSched'}
            </p>

            {/* Error Alert Box */}
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
                      placeholder="e.g. @admin @jelly123"
                    />
                  </div>

                  <div className="input-group">
                    <label>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      Password
                    </label>
                    <input
                      id="login-password"
                      required
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                    />
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
                  setStudentId('');
                  setDepartment('');
                  setCourse('');
                  setYearLevel('');
                  setSection('');
                }}
                className="login-toggle-link"
              >
                {isSignUp ? 'Log in here' : 'Sign up here'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;