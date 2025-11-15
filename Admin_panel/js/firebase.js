// admin-panel/js/firebase.js
// সব Import একই Firebase ভার্সন থেকে (10.14.1)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCaEBz1pw-TmuAe3spqUQv6YCiraLSiPoo",
  authDomain: "royal-event-admin-74d4c.web.app",
  databaseURL: "https://royal-event-admin-74d4c-default-rtdb.firebaseio.com",
  projectId: "royal-event-admin-74d4c",
  storageBucket: "royal-event-admin-74d4c.appspot.com",
  messagingSenderId: "237293686255",
  appId: "1:237293686255:web:e6aae8ae0eb07e9aa07a1a",
  measurementId: "G-LHTZ535RHB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
