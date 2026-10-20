/**
 * useAuthUser.js - Firebase Authentication state management.
 *
 * Extracts auth observer, user profile resolution, and favicon
 * generation from App.jsx into a focused custom hook.
 *
 * Robustly preserves admin/staff roles across page loads, network timeouts,
 * offline states, and transient Firestore errors using multi-layer session caching.
 */

import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  getDocFromCache,
  doc,
} from 'firebase/firestore';
import { logActivity, LOG_ACTIONS } from '../utils/activityLogger';

const STORAGE_KEY_USER = 'smartsched_user_profile';
const STORAGE_KEY_USERNAME = 'smartsched_username';
const STORAGE_KEY_ROLE = 'smartsched_user_role';

/**
 * Timeout (ms) for network Firestore profile fetches before falling
 * back to cached session data. Prevents indefinite loading hangs on dead networks.
 */
const PROFILE_FETCH_TIMEOUT = 10000;

export const isAdminRole = (role) => {
  const r = (role || '').toLowerCase().trim();
  return r === 'admin' || r === 'department head';
};

export const isStaffRole = (role) => {
  const r = (role || '').toLowerCase().trim();
  return r === 'admin' || r === 'department head' || r === 'faculty';
};

const cleanStoredUsername = (u) => (u || '').replace(/^@+/, '').toLowerCase().trim();

/**
 * Safely retrieves cached user profile from localStorage.
 */
const getCachedUser = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    console.warn('[useAuthUser] Failed to parse cached user:', err);
    return null;
  }
};

/**
 * Persists user profile and role to localStorage for instant offline access
 * and resilience against network timeouts.
 */
const persistUserSession = (userProfile) => {
  if (!userProfile) return;
  try {
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userProfile));
    if (userProfile.username) {
      localStorage.setItem(STORAGE_KEY_USERNAME, userProfile.username);
    }
    if (userProfile.role) {
      localStorage.setItem(STORAGE_KEY_ROLE, userProfile.role);
    }
  } catch (err) {
    console.warn('[useAuthUser] Failed to persist user session to localStorage:', err);
  }
};

/**
 * Completely clears all user session data upon logout.
 */
const clearUserSession = () => {
  try {
    const username = localStorage.getItem(STORAGE_KEY_USERNAME);
    if (username) {
      sessionStorage.removeItem(`smartsched_login_logged_${username}`);
    }
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_USERNAME);
    localStorage.removeItem(STORAGE_KEY_ROLE);
  } catch (err) {
    console.warn('[useAuthUser] Failed to clear user session from localStorage:', err);
  }
};

/**
 * Resolves the Firestore user profile for an authenticated Firebase user.
 * Tries local cache first, then server fetch. Prioritizes Admin/Staff
 * records over regular/stale records to avoid accidental role downgrades.
 */
async function resolveUserProfile(firebaseUser, storedUsername, cachedRole, cachedUser) {
  const emailPrefix = firebaseUser.email ? firebaseUser.email.split('@')[0] : 'user';
  const cleanEmailPrefix = emailPrefix.replace(/^@+/, '').toLowerCase().trim();
  const cleanStored = cleanStoredUsername(storedUsername);

  // Search variations for username
  const searchTargets = Array.from(
    new Set([
      emailPrefix,
      `@${emailPrefix}`,
      cleanEmailPrefix,
      `@${cleanEmailPrefix}`,
      firebaseUser.email,
      storedUsername,
      cleanStored ? `@${cleanStored}` : '',
      cleanStored,
    ])
  )
    .filter(Boolean)
    .slice(0, 10);

  const candidateDocs = [];

  // 1. Check Firestore local cache first (instant, works offline)
  try {
    const cachedSnap = await getDocFromCache(doc(db, 'users', firebaseUser.uid));
    if (cachedSnap && cachedSnap.exists()) {
      candidateDocs.push(cachedSnap);
    }
  } catch (_) {
    // Expected when no local IndexedDB cache entry exists yet
  }

  // 2. Fetch from Firestore network with timeout protection
  try {
    const uidFetchPromise = getDoc(doc(db, 'users', firebaseUser.uid))
      .then((snap) => (snap && snap.exists() ? snap : null))
      .catch(() => null);

    const usernameFetchPromise =
      searchTargets.length > 0
        ? getDocs(query(collection(db, 'users'), where('username', 'in', searchTargets))).catch(() => null)
        : Promise.resolve(null);

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve('timeout'), PROFILE_FETCH_TIMEOUT);
    });

    const [uidResult, usernameResult] = await Promise.all([
      Promise.race([uidFetchPromise, timeoutPromise]),
      Promise.race([usernameFetchPromise, timeoutPromise]),
    ]);

    if (uidResult && uidResult !== 'timeout' && !candidateDocs.some((d) => d.id === uidResult.id)) {
      candidateDocs.push(uidResult);
    }

    if (usernameResult && usernameResult !== 'timeout' && !usernameResult.empty) {
      usernameResult.docs.forEach((docSnap) => {
        if (!candidateDocs.some((d) => d.id === docSnap.id)) {
          candidateDocs.push(docSnap);
        }
      });
    }
  } catch (fetchErr) {
    console.warn('[useAuthUser] Error fetching profile candidates from Firestore:', fetchErr);
  }

  if (candidateDocs.length === 0) {
    return null;
  }

  // Determine whether this account was previously known as an Admin / Staff
  const wasAdmin =
    isAdminRole(cachedRole) ||
    isAdminRole(cachedUser?.role) ||
    cleanStored === 'admin';

  const wasStaff =
    isStaffRole(cachedRole) ||
    isStaffRole(cachedUser?.role);

  let chosenDoc = null;

  // 1. If account is known as Admin, prioritize candidate doc with Admin role
  if (wasAdmin) {
    chosenDoc = candidateDocs.find((d) => isAdminRole(d.data()?.role));
  }

  // 2. Prioritize any Staff/Admin doc if duplicates exist
  if (!chosenDoc) {
    chosenDoc = candidateDocs.find((d) => isStaffRole(d.data()?.role));
  }

  // 3. Prioritize UID match
  if (!chosenDoc) {
    chosenDoc = candidateDocs.find((d) => d.id === firebaseUser.uid || d.data()?.id === firebaseUser.uid);
  }

  // 4. Default to first candidate
  if (!chosenDoc) {
    chosenDoc = candidateDocs[0];
  }

  const userData = chosenDoc.data() || {};
  let finalRole = userData.role;

  // CRITICAL SAFEGUARD:
  // An account that was logged in as Admin must NEVER be downgraded
  // to a regular 'User' due to partial doc data or temporary timeout!
  if (wasAdmin && (!finalRole || finalRole.toLowerCase() === 'user')) {
    finalRole = cachedRole || cachedUser?.role || 'Admin';
  } else if (!finalRole) {
    finalRole = cachedRole || cachedUser?.role || (wasStaff ? 'Faculty' : 'User');
  }

  return {
    ...userData,
    id: chosenDoc.id || firebaseUser.uid,
    name: userData.name || cachedUser?.name || firebaseUser.displayName || emailPrefix,
    username: userData.username || cachedUser?.username || storedUsername || emailPrefix,
    role: finalRole,
    email: firebaseUser.email || userData.email || cachedUser?.email,
  };
}

/**
 * Custom hook that manages Firebase Auth state and user profile
 * resolution from Firestore.
 *
 * @returns {{ user, loading, isOffline, handleLogin, handleLogout }}
 */
export function useAuthUser() {
  const [user, setUser] = useState(() => getCachedUser());
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const faviconSet = useRef(false);
  const activeUserRef = useRef(user);
  activeUserRef.current = user;

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
    let isSubscribed = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isSubscribed) return;

      if (!firebaseUser) {
        // Completely logged out
        clearUserSession();
        setUser(null);
        setLoading(false);
        return;
      }

      const cached = getCachedUser();
      const storedUsername = localStorage.getItem(STORAGE_KEY_USERNAME) || cached?.username || '';
      const cachedRole = localStorage.getItem(STORAGE_KEY_ROLE) || cached?.role || '';
      const emailPrefix = firebaseUser.email ? firebaseUser.email.split('@')[0] : 'user';

      // Fast-path: If matching cached session is available, activate it immediately so
      // user never experiences blocked UI or role flashing on load/offline.
      if (
        cached &&
        (cached.id === firebaseUser.uid ||
          cached.email === firebaseUser.email ||
          (storedUsername && cached.username === storedUsername))
      ) {
        setUser(cached);
        setLoading(false);
      }

      try {
        const resolved = await resolveUserProfile(
          firebaseUser,
          storedUsername,
          cachedRole,
          cached || activeUserRef.current
        );

        if (!isSubscribed) return;

        if (resolved) {
          persistUserSession(resolved);
          setUser(resolved);
        } else if (cached) {
          // If Firestore query timed out or offline, PRESERVE the cached admin session!
          console.warn('[useAuthUser] Retaining cached user profile as Firestore returned no candidates.');
          setUser(cached);
        } else {
          // No cached profile existed (brand new device or cleared cache).
          // Check if stored username or role indicates Admin.
          const isProbablyAdmin =
            isAdminRole(cachedRole) ||
            cleanStoredUsername(storedUsername) === 'admin';

          const fallbackRole = isProbablyAdmin ? 'Admin' : (cachedRole || 'User');
          const fallbackProfile = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || storedUsername || emailPrefix,
            username: storedUsername || emailPrefix,
            role: fallbackRole,
            email: firebaseUser.email,
          };
          persistUserSession(fallbackProfile);
          setUser(fallbackProfile);
        }
      } catch (error) {
        console.error('[useAuthUser] Error resolving user profile:', error);
        if (!isSubscribed) return;

        // If an unexpected error or network drop occurs, NEVER downgrade an admin account!
        const currentCached = getCachedUser() || activeUserRef.current;
        if (currentCached) {
          setUser(currentCached);
        } else {
          const isProbablyAdmin =
            isAdminRole(cachedRole) ||
            cleanStoredUsername(storedUsername) === 'admin';

          const fallbackRole = isProbablyAdmin ? 'Admin' : (cachedRole || 'User');
          const fallbackProfile = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || storedUsername || emailPrefix,
            username: storedUsername || emailPrefix,
            role: fallbackRole,
            email: firebaseUser.email,
          };
          persistUserSession(fallbackProfile);
          setUser(fallbackProfile);
        }
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    });

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, []);

  // Public actions
  const handleLogin = (userProfile) => {
    if (!userProfile) return;
    persistUserSession(userProfile);
    setUser(userProfile);
  };

  const handleLogout = async () => {
    if (user) {
      logActivity({
        user,
        action: LOG_ACTIONS.LOGOUT,
        details: `${user.name || user.username} logged out`,
      });
    }
    clearUserSession();
    try {
      await auth.signOut();
    } catch (e) {
      console.warn('[useAuthUser] Sign out error:', e.message);
    }
    setUser(null);
  };

  return { user, loading, isOffline, handleLogin, handleLogout };
}

