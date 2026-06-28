/**
 * useAuthUser.js — Firebase Authentication state management.
 *
 * Extracts auth observer, user profile resolution, and favicon
 * generation from App.jsx into a focused custom hook.
 */

import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';

/** Timeout (ms) for the initial Firestore profile fetch. */
const PROFILE_FETCH_TIMEOUT = 5000;

/**
 * Custom hook that manages Firebase Auth state and user profile
 * resolution from Firestore.
 *
 * @returns {{ user, loading, isOffline, handleLogin, handleLogout }}
 */
export function useAuthUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const faviconSet = useRef(false);

  // ─── Online/offline detection ─────────────────────────────────────
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

  // ─── One-time favicon generation ──────────────────────────────────
  useEffect(() => {
    if (faviconSet.current) return;
    faviconSet.current = true;

    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    const img = new Image();
    img.src = '/logo.png?v=1';
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      const offsetX = (img.width - size) / 2;
      const offsetY = (img.height - size) / 2;
      ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size);

      link.href = canvas.toDataURL('image/png');
    };
  }, []);

  // ─── Auth state observer & profile resolution ─────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const storedUsername = localStorage.getItem('smartsched_username');
          const emailPrefix = firebaseUser.email.split('@')[0];

          const searchTargets = [emailPrefix, `@${emailPrefix}`, firebaseUser.email];
          if (storedUsername && !searchTargets.includes(storedUsername)) {
            searchTargets.push(storedUsername);
          }

          const q = query(collection(db, 'users'), where('username', 'in', searchTargets));

          const fetchPromise = getDocs(q);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Firestore request timed out')), PROFILE_FETCH_TIMEOUT);
          });

          const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

          if (!snapshot.empty) {
            let targetDoc = snapshot.docs[0];
            const stored = localStorage.getItem('smartsched_username');

            if (stored) {
              const exactMatches = snapshot.docs.filter((d) => d.data().username === stored);
              if (exactMatches.length > 0) {
                const adminMatch = exactMatches.find((d) => {
                  const role = d.data().role || '';
                  return role === 'Admin' || role === 'Department Head';
                });
                targetDoc = adminMatch || exactMatches[0];
              }
            }

            const userData = targetDoc.data();
            setUser({
              ...userData,
              name: userData.name || emailPrefix,
              role: userData.role || 'User',
              username: userData.username || emailPrefix,
            });
          } else {
            // Auth exists but no Firestore profile — create one
            const newProfile = { username: emailPrefix, name: emailPrefix, role: 'Student' };
            await addDoc(collection(db, 'users'), newProfile);
            setUser(newProfile);
          }
        } catch (error) {
          console.error('Error restoring session:', error);
          const emailPrefix = firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User';
          const stored = localStorage.getItem('smartsched_username') || emailPrefix;
          setUser({
            name: firebaseUser.displayName || stored,
            username: stored,
            role: 'Student',
            email: firebaseUser.email,
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ─── Public actions ───────────────────────────────────────────────

  const handleLogin = (userProfile) => {
    if (userProfile && userProfile.username) {
      localStorage.setItem('smartsched_username', userProfile.username);
    }
    setUser(userProfile);
  };

  const handleLogout = () => {
    localStorage.removeItem('smartsched_username');
    auth.signOut();
    setUser(null);
  };

  return { user, loading, isOffline, handleLogin, handleLogout };
}
