import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";

// ─── Firebase Configuration (from environment variables) ────────────
const firebaseConfig = {
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

export const db = getFirestore(app);
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