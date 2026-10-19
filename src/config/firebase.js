import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { 
  initializeAppCheck, 
  ReCaptchaEnterpriseProvider, 
  ReCaptchaV3Provider 
} from "firebase/app-check";

// Firebase Configuration (from environment variables)
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Validate required config at startup
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
for (const key of requiredKeys) {
  if (!firebaseConfig[key]) {
    console.error(`Missing required Firebase config: ${key}. Check your .env file.`);
  }
}

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (e) { console.warn('Firebase Analytics unavailable:', e.message); }

// Initialize Firebase App Check to protect Firebase AI Logic & Gemini API calls
export let appCheck = null;
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || import.meta.env.VITE_FIREBASE_APPCHECK_KEY;

if (typeof window !== "undefined") {
  // In development, enable debug token to allow localhost API requests
  if (import.meta.env.DEV) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
  }

  if (recaptchaSiteKey) {
    try {
      const isV3 = import.meta.env.VITE_RECAPTCHA_PROVIDER === 'v3';
      const provider = isV3 
        ? new ReCaptchaV3Provider(recaptchaSiteKey)
        : new ReCaptchaEnterpriseProvider(recaptchaSiteKey);

      appCheck = initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
      console.info(`[Firebase App Check] Initialized successfully using ${isV3 ? 'reCAPTCHA v3' : 'reCAPTCHA Enterprise'}.`);
    } catch (e) {
      console.warn('[Firebase App Check] Initialization failed:', e);
    }
  } else {
    console.info(
      '[Firebase App Check] Note: VITE_RECAPTCHA_SITE_KEY not provided. ' +
      'Required by Firebase AI Logic starting November 2, 2026.'
    );
  }
}

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const auth = getAuth(app);

// Initialize AI Logic service
export const ai = getAI(app, { backend: new GoogleAIBackend() });

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
};

export const generativeModel = getGenerativeModel(ai, { 
  model: "gemini-2.5-flash", 
  generationConfig 
});