import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";

const firebaseConfig = {
  apiKey: "AIzaSyA8-k0LhdhGBkG4KcZiTz9dsCiMRDf_SAE",
  authDomain: "scheduler-app2503.firebaseapp.com",
  databaseURL: "https://scheduler-app2503-default-rtdb.firebaseio.com",
  projectId: "scheduler-app2503",
  storageBucket: "scheduler-app2503.firebasestorage.app",
  messagingSenderId: "125166548137",
  appId: "1:125166548137:web:9af20b6a36bcadbb2e65b8",
  measurementId: "G-2L97MG6SJW"
};

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