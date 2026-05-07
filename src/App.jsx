import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Login from './Login';
import Dashboard from './Dashboard';
import './App.css';


function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Listen for Firebase Auth state changes (persists across reloads)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in — fetch their role from Firestore
        try {
          // Extract the username from the dummy email
          const username = firebaseUser.email.split('@')[0];

          const q = query(collection(db, 'users'), where('username', 'in', [username, `@${username}`]));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            setUser({
              name: userData.name || username,
              role: userData.role || 'User',
              username: userData.username || username
            });
          } else {
            // Auth exists but no Firestore profile — set basic info
            setUser({
              name: username,
              role: 'User',
              username: username
            });
          }
        } catch (error) {
          console.error('Error restoring session:', error);
          setUser(null);
        }
      } else {
        // User is signed out
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    auth.signOut();
    setUser(null);
  };

  // Show a loading spinner while checking auth state
  if (loading) {
    return (
      <div className="login-container">
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{
            width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.3)',
            borderTop: '4px solid white', borderRadius: '50%', margin: '0 auto 15px',
            animation: 'spin 0.8s linear infinite'
          }} />
          <p style={{ fontSize: '0.95rem', opacity: 0.9 }}>Restoring session...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // If there is no user logged in, show the Login screen
  if (!user) {
    return <Login onLogin={setUser} />;
  }

  // If logged in, show the SMARTSCHED Dashboard
  return (
    <Dashboard user={user} onLogout={handleLogout} />
  );
}

export default App;