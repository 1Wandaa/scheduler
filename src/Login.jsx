import React, { useState } from 'react';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';

const Login = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Clean the username and append a dummy domain for Firebase Auth
      const cleanUsername = username.replace('@', '').toLowerCase();
      const dummyEmail = `${cleanUsername}@smartsched.capsu.local`;

      if (isSignUp) {
        // ==========================================
        // SIGN UP FLOW (For Regular Users Only)
        // ==========================================

        // 1. Create user identity in Firebase Auth
        await createUserWithEmailAndPassword(auth, dummyEmail, password);

        // 2. Save user to Firestore with a forced 'Student' role
        await addDoc(collection(db, 'users'), {
          username: username,
          name: fullName,
          role: 'Student' // Admin accounts cannot be created here!
        });

        // 3. Log them in directly after sign up
        onLogin({
          name: fullName,
          role: 'Student',
          username: username
        });

      } else {
        // ==========================================
        // LOGIN FLOW (Existing)
        // ==========================================
        await signInWithEmailAndPassword(auth, dummyEmail, password);

        // Fetch Authorization (Role) from Firestore
        const q = query(collection(db, 'users'), where('username', '==', username));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setError('Account found, but role data is missing. Contact an Administrator.');
          auth.signOut();
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

  return (
    <div className="login-container">
      <div className="login-box">
        {/* --- OFFICIAL CAPSU LOGO --- */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
          <img
            src="logo.jpg"
            alt="CAPSU Logo"
            style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid #0288d1',
              boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
            }}
            onError={(e) => { e.target.src = "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Capiz_State_University_logo.png/220px-Capiz_State_University_logo.png"; }}
          />
        </div>

        <h2 style={{ marginTop: '0' }}>SMARTSCHED</h2>
        <p style={{ color: '#666', marginBottom: '25px', fontSize: '0.9rem' }}>Capiz State University Room Scheduler</p>

        {/* Error Alert Box */}
        {error && (
          <div style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '0.85rem', borderLeft: '4px solid var(--danger)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="input-group">
              <label>Full Name</label>
              <input
                required
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Juan Dela Cruz"
              />
            </div>
          )}

          <div className="input-group">
            <label>Username</label>
            <input
              required
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. @admin @jelly123"
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input
              required
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isSignUp ? "Create a password (min 6 chars)" : "Enter your password"}
            />
          </div>

          <button type="submit" className="btn-login" style={{ marginTop: '10px' }} disabled={loading}>
            {loading ? 'Authenticating...' : (isSignUp ? 'Create Account' : 'Secure Sign In')}
          </button>
        </form>

        {/* Toggle between Login and Sign Up */}
        <div style={{ marginTop: '20px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          {isSignUp ? "Already have an account? " : "Don't have an account? "}
          <span
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(''); // Clear errors when switching modes
            }}
            style={{
              color: 'var(--accent-primary)',
              fontWeight: '600',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {isSignUp ? 'Log in here' : 'Sign up here'}
          </span>
        </div>

      </div>
    </div>
  );
};

export default Login;