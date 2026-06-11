import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { firebaseConfig } from "../src/config/firebase.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateSchedules() {
  console.log("Starting migration to add semesterId to schedules...");
  const schedulesRef = collection(db, "schedules");
  const snapshot = await getDocs(schedulesRef);
  
  let updatedCount = 0;
  for (const document of snapshot.docs) {
    const data = document.data();
    if (!data.semesterId) {
      await updateDoc(doc(db, "schedules", document.id), {
        semesterId: "sem_1" // Default to 1st Semester 2026-2027
      });
      updatedCount++;
    }
  }
  
  console.log(`Migration complete! Updated ${updatedCount} schedules.`);
}

migrateSchedules().catch(console.error);
