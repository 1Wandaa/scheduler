// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);