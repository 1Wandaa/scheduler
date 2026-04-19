import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAN_6KthtgbGRNq6INNznVs73PH708f5OA",
  authDomain: "scheduler-app2503.firebaseapp.com",
  projectId: "scheduler-app2503",
  storageBucket: "scheduler-app2503.firebasestorage.app",
  messagingSenderId: "1049693325979",
  appId: "1:1049693325979:web:1cb643730fac9e4ae6943e"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app); // <--- This fixes your error!