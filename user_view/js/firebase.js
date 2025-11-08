// user_view/js/firebase.js
// Copy of firebase config used by admin panel. Keep in sync with Admin_panel/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCaEBz1pw-TmuAe3spqUQv6YCiraLSiPoo",
  authDomain: "royal-event-admin-74d4c.firebaseapp.com",
  databaseURL: "https://royal-event-admin-74d4c-default-rtdb.firebaseio.com",
  projectId: "royal-event-admin-74d4c",
  storageBucket: "royal-event-admin-74d4c.appspot.com",
  messagingSenderId: "237293686255",
  appId: "1:237293686255:web:e6aae8ae0eb07e9aa07a1a",
  measurementId: "G-LHTZ535RHB"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const firebaseConfigExport = firebaseConfig;

// Storage export for client-side download URL resolution
export const storage = getStorage(app);

// Initialize Auth and sign-in anonymously so client has an auth token for writes.
export const auth = getAuth(app);

// authReady resolves when we have an auth state (signed-in or existing user)
export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('Firebase auth ready. UID:', user.uid);
      resolve(user);
    }
  });
});

// Attempt anonymous sign-in for unauthenticated visitors (safe for bookings flow if rules allow authenticated writes)
signInAnonymously(auth).catch((err) => {
  console.warn('Anonymous sign-in failed:', err && err.message);
});
