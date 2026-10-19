/**
 * useAuthUser.js - Firebase Authentication state management.
 *
 * Extracts auth observer, user profile resolution, and favicon
 * generation from App.jsx into a focused custom hook.
 */

import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, getDoc, doc, setDoc } from 'firebase/firestore';
import { logActivity, LOG_ACTIONS } from '../utils/activityLogger';

/** Timeout (ms) for the initial Firestore profile fetch. */
const PROFILE_FETCH_TIMEOUT = 3000;

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

 // Online/offline detection
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

 // One-time favicon generation
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

 // Auth state observer & profile resolution
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const emailPrefix = firebaseUser.email ? firebaseUser.email.split('@')[0] : 'user';
          let targetDoc = null;

          // Build username search targets
          const storedUsername = localStorage.getItem('smartsched_username');
          const searchTargets = [emailPrefix, `@${emailPrefix}`, firebaseUser.email];
          if (storedUsername && !searchTargets.includes(storedUsername)) {
            searchTargets.push(storedUsername);
          }

          // Race: UID doc fetch vs username query — whichever resolves first
          const uidFetchPromise = getDoc(doc(db, 'users', firebaseUser.uid))
            .then(snap => snap.exists() ? snap : null)
            .catch(() => null);

          const usernameFetchPromise = getDocs(
            query(collection(db, 'users'), where('username', 'in', searchTargets))
          ).catch(() => null);

          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve('timeout'), PROFILE_FETCH_TIMEOUT);
          });

          // Wait for both to settle (with a timeout safety net)
          const [uidResult, usernameResult] = await Promise.all([
            Promise.race([uidFetchPromise, timeoutPromise]),
            Promise.race([usernameFetchPromise, timeoutPromise]),
          ]);

          // 1. Prefer direct UID match
          if (uidResult && uidResult !== 'timeout') {
            targetDoc = uidResult;
          }

          // 2. Fallback to username search if UID lookup returned nothing
          if (!targetDoc && usernameResult && usernameResult !== 'timeout' && !usernameResult.empty) {
            const snapshot = usernameResult;
            const cleanEmailPrefix = emailPrefix.replace(/^@+/, '').toLowerCase().trim();
            const cleanStored = (storedUsername || '').replace(/^@+/, '').toLowerCase().trim();

            const matchingDocs = snapshot.docs.filter((d) => {
              const u = (d.data().username || '').replace(/^@+/, '').toLowerCase().trim();
              return u === cleanEmailPrefix || (cleanStored && u === cleanStored);
            });

            const pool = matchingDocs.length > 0 ? matchingDocs : snapshot.docs;

            // Prefer doc with matching auth UID
            const uidMatch = pool.find((d) => d.id === firebaseUser.uid || d.data().id === firebaseUser.uid);

            // Prefer Admin / Staff role if duplicates exist
            const adminMatch = pool.find((d) => {
              const role = (d.data().role || '').toLowerCase();
              return role === 'admin' || role === 'department head' || role === 'faculty';
            });

            targetDoc = uidMatch || adminMatch || pool[0];
          }

          if (targetDoc) {
            const userData = targetDoc.data();
            setUser({
              ...userData,
              id: targetDoc.id,
              name: userData.name || emailPrefix,
              role: userData.role || 'User',
              username: userData.username || emailPrefix,
            });
          } else {
            // Check if this is a Google provider login needing an initial profile
            const isGoogleUser = firebaseUser.providerData?.some((p) => p.providerId === 'google.com');
            if (isGoogleUser) {
              const newProfile = {
                id: firebaseUser.uid,
                username: firebaseUser.email || emailPrefix,
                name: firebaseUser.displayName || emailPrefix,
                role: 'Student'
              };
              await setDoc(doc(db, 'users', firebaseUser.uid), newProfile, { merge: true });
              setUser(newProfile);
            } else {
              // For password auth where doc might still be writing, set safe state without overwriting Firestore
              const stored = localStorage.getItem('smartsched_username') || emailPrefix;
              setUser({
                id: firebaseUser.uid,
                name: firebaseUser.displayName || stored,
                username: stored,
                role: 'User',
                email: firebaseUser.email,
              });
            }
          }
        } catch (error) {
          console.error('Error restoring session:', error);
          const emailPrefix = firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User';
          const stored = localStorage.getItem('smartsched_username') || emailPrefix;
          setUser({
            id: firebaseUser.uid,
            name: firebaseUser.displayName || stored,
            username: stored,
            role: 'User',
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

 // Public actions

  const handleLogin = (userProfile) => {
    if (userProfile && userProfile.username) {
      localStorage.setItem('smartsched_username', userProfile.username);
    }
    setUser(userProfile);
  };

  const handleLogout = async () => {
    if (user) {
      logActivity({
        user,
        action: LOG_ACTIONS.LOGOUT,
        details: `${user.name || user.username} logged out`
      });
    }
    const username = localStorage.getItem('smartsched_username');
    if (username) {
      sessionStorage.removeItem(`smartsched_login_logged_${username}`);
    }
    localStorage.removeItem('smartsched_username');
    try {
      await auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e.message);
    }
    setUser(null);
  };

  return { user, loading, isOffline, handleLogin, handleLogout };
}
