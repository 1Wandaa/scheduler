import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";

// ─── Firebase Configuration (from environment variables) ────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA8-k0LhdhGBkG4KcZiTz9dsCiMRDf_SAE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "scheduler-app2503.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://scheduler-app2503-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "scheduler-app2503",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "scheduler-app2503.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "125166548137",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:125166548137:web:9af20b6a36bcadbb2e65b8",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-2L97MG6SJW",
};

// Validate required config at startup
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
for (const key of requiredKeys) {
  if (!firebaseConfig[key]) {
    console.error(`Missing required Firebase config: ${key}. Check your .env file.`);
  }
}

const app = initializeApp(firebaseConfig);
getAnalytics(app);

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