import React, { useState, useEffect } from 'react';
import { auth, db } from './config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import './styles/App.css';


function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Listen for Firebase Auth state changes (persists across reloads)
  useEffect(() => {
    // --- ADD THIS BLOCK TO UPDATE THE FAVICON ---
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = '/logo.jpg?v=1';
    // --------------------------------------------

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // ... existing auth code ...
      if (firebaseUser) {
        // User is signed in — fetch their role from Firestore
        try {
          // Extract the username from the dummy email
          const username = firebaseUser.email.split('@')[0];

          const q = query(collection(db, 'users'), where('username', 'in', [username, `@${username}`, firebaseUser.email]));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            const userData = snapshot.docs[0].data();
            setUser({
              name: userData.name || username,
              role: userData.role || 'User',
              username: userData.username || username
            });
          } else {
            // Auth exists but no Firestore profile — create one
            const newProfile = {
              username: username,
              name: username,
              role: 'Student'
            };
            await addDoc(collection(db, 'users'), newProfile);
            setUser(newProfile);
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
    return <div className="login-container"></div>;
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