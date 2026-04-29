import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // Add this line

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
const analytics = getAnalytics(app);

export const db = getFirestore(app);
export const auth = getAuth(app); // Export the auth instance