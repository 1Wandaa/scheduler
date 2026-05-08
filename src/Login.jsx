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
        // SIGN UP FLOW (For Demo/Admin creation)
        // ==========================================

        // 1. Check if username already exists in Firestore
        const q = query(collection(db, "users"), where("username", "==", cleanUsername));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          setError("Username already exists.");
          setLoading(false);
          return;
        }

        // 2. Create the user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, dummyEmail, password);
        const user = userCredential.user;

        // 3. Save additional user details to Firestore
        await addDoc(collection(db, "users"), {
          uid: user.uid,
          fullName: fullName,
          username: cleanUsername,
          role: 'admin', // Defaulting to admin for this system
          createdAt: new Date().toISOString()
        });

      } else {
        // ==========================================
        // SIGN IN FLOW
        // ==========================================
        await signInWithEmailAndPassword(auth, dummyEmail, password);
        // onAuthStateChanged in App.jsx will catch the login
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid username or password.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else {
        setError('Failed to authenticate. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', margin: '0 20px', padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              background: 'var(--accent-primary)',
              width: '60px', height: '60px',
              borderRadius: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem'
            }}>SS</div>
            <h2 style={{ margin: 0, color: 'var(--accent-dark)' }}>SmartSched</h2>
            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>{isSignUp ? 'Create an admin account' : 'Sign in to manage schedules'}</p>
          </div>

          {error && <div className="badge danger" style={{ display: 'block', marginBottom: '1rem', textAlign: 'center', padding: '0.75rem' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {isSignUp && (
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="e.g. Juan Dela Cruz"
                />
              </div>
            )}

            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="e.g. admin"
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
              {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
            {isSignUp ? "Already have an account? " : "Need an account? "}
            <span
              style={{ color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: '600' }}
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;