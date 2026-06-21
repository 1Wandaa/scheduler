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
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen for Firebase Auth state changes (persists across reloads)
  useEffect(() => {
    // --- ADD THIS BLOCK TO UPDATE THE FAVICON ---
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    
    const img = new Image();
    img.src = '/logo.png?v=1';
    img.onload = () => {
      // Create a square canvas based on the smaller dimension to prevent stretching
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      // Draw a circular clipping mask in the center of the square canvas
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      
      // Calculate offset to center the image if it's not perfectly square
      const offsetX = (img.width - size) / 2;
      const offsetY = (img.height - size) / 2;
      
      // Draw the image onto the canvas, cropping out the excess
      ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);
      
      link.href = canvas.toDataURL('image/png');
    };
    // --------------------------------------------

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // ... existing auth code ...
      if (firebaseUser) {
        // User is signed in — fetch their role from Firestore
        try {
          // Get stored username first to preserve exact casing
          const storedUsername = localStorage.getItem('smartsched_username');
          const emailPrefix = firebaseUser.email.split('@')[0];
          
          // Use storedUsername if available, otherwise fallback to emailPrefix
          const searchTargets = [emailPrefix, `@${emailPrefix}`, firebaseUser.email];
          if (storedUsername && !searchTargets.includes(storedUsername)) {
            searchTargets.push(storedUsername);
          }

          const q = query(collection(db, 'users'), where('username', 'in', searchTargets));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            let targetDoc = snapshot.docs[0];
            const storedUsername = localStorage.getItem('smartsched_username');
            
            if (storedUsername) {
              const exactMatches = snapshot.docs.filter(doc => doc.data().username === storedUsername);
              if (exactMatches.length > 0) {
                // If there are duplicate exact matches, prefer the Admin profile
                const adminMatch = exactMatches.find(doc => {
                  const role = doc.data().role || '';
                  return role === 'Admin' || role === 'Department Head';
                });
                targetDoc = adminMatch || exactMatches[0];
              }
            }
            
            let userData = targetDoc.data();

            setUser({
              name: userData.name || emailPrefix,
              role: userData.role || 'User',
              username: userData.username || emailPrefix
            });
          } else {
            // Auth exists but no Firestore profile — create one
            const newProfile = {
              username: emailPrefix,
              name: emailPrefix,
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
    localStorage.removeItem('smartsched_username');
    auth.signOut();
    setUser(null);
  };

  const handleLogin = (userProfile) => {
    if (userProfile && userProfile.username) {
      localStorage.setItem('smartsched_username', userProfile.username);
    }
    setUser(userProfile);
  };

  // Show a loading spinner while checking auth state
  if (loading) {
    return (
      <div className="app-loading-container">
        <div className="app-loading-spinner"></div>
        <p className="app-loading-text">Loading SMARTSCHED...</p>
      </div>
    );
  }

  // If there is no user logged in, show the Login screen
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // If logged in, show the SMARTSCHED Dashboard
  return (
    <>
      {isOffline && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          background: 'var(--danger, #ef4444)', color: 'white',
          textAlign: 'center', padding: '6px', fontSize: '0.85rem',
          fontWeight: 600, zIndex: 999999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: '8px'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M5 12.55a11.61 11.61 0 0 1 5.08-2.32M1 1l22 22"/></svg>
          You are currently offline. Viewing cached schedule.
        </div>
      )}
      <Dashboard user={user} onLogout={handleLogout} />
    </>
  );
}

export default App;