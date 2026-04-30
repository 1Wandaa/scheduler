import React, { useState } from 'react';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // THE TRICK: Clean the username and append a dummy domain for Firebase Auth
      // If a user types "@admin", Firebase checks "admin@smartsched.capsu.local"
      const cleanUsername = username.replace('@', '').toLowerCase();
      const dummyEmail = `${cleanUsername}@smartsched.capsu.local`;

      // 1. Authenticate identity with Firebase Auth
      await signInWithEmailAndPassword(auth, dummyEmail, password);

      // 2. Fetch Authorization (Role) from Firestore 'users' collection using the original username
      const q = query(collection(db, 'users'), where('username', '==', username));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('Account found, but role data is missing. Contact an Administrator.');
        auth.signOut();
        setLoading(false);
        return;
      }

      // 3. Extract user data and log them into the app
      const userData = querySnapshot.docs[0].data();

      onLogin({
        name: userData.name || username,
        role: userData.role || 'User',
        username: username
      });

    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid username or password. Please try again.');
      } else {
        setError('Failed to log in: ' + err.message);
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
        <p style={{color: '#666', marginBottom: '25px', fontSize: '0.9rem'}}>Capiz State University Room Scheduler</p>

        {/* Error Alert Box */}
        {error && (
          <div style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '0.85rem', borderLeft: '4px solid var(--danger)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Username</label>
            <input
              required
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. @admin or ryan"
            />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input
              required
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>

          <button type="submit" className="btn-login" style={{ marginTop: '10px' }} disabled={loading}>
            {loading ? 'Authenticating...' : 'Secure Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;