import { db } from './src/config/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

// mock window
global.window = { navigator: {}, document: {} };
global.document = global.window.document;
global.navigator = global.window.navigator;

async function run() {
  const roomsSnap = await getDocs(collection(db, 'rooms'));
  const rooms = roomsSnap.docs.map(d => d.data());
  const compLabs = rooms.filter(r => r.hasComputers);
  console.log('Total rooms:', rooms.length);
  console.log('Computer labs:', compLabs.length, compLabs.map(r => r.name));
  process.exit(0);
}

run().catch(console.error);
