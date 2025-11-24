// user_view/js/firebase.js
// Copy of firebase config used by admin panel. Keep in sync with Admin_panel/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  reload,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const firebaseConfigExport = firebaseConfig;

// Storage export for client-side download URL resolution
export const storage = getStorage(app);

// Initialize Auth.
export const auth = getAuth(app);

async function configureAuthPersistence() {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.warn('Local persistence not available, falling back to session storage.', err && err.message);
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch (sessionErr) {
      console.warn('Session persistence not available, using in-memory storage.', sessionErr && sessionErr.message);
      await setPersistence(auth, inMemoryPersistence);
    }
  }
}

const authPersistenceReady = configureAuthPersistence();

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let authResolved = false;
export const authReady = authPersistenceReady.then(() => new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (!authResolved) {
      authResolved = true;
      resolve(user);
    }
  });
}));

export const onAuthStateChange = (callback) => onAuthStateChanged(auth, callback);

export async function signInWithGooglePopup() {
  const current = auth.currentUser;
  if (current && current.isAnonymous) {
    const result = await linkWithPopup(current, googleProvider);
    return result.user;
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function createAccountWithEmail(displayName, email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    try {
      await updateProfile(credential.user, { displayName });
    } catch (err) {
      console.warn('Profile update failed', err && err.message);
    }
  }
  try {
    const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : null;
    if (origin) {
      await sendEmailVerification(credential.user, { url: origin });
    } else {
      await sendEmailVerification(credential.user);
    }
  } catch (err) {
    console.warn('Email verification failed', err && err.message);
  }
  return credential.user;
}

export async function signInWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export function sendPasswordReset(email) {
  const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : null;
  if (origin) {
    return sendPasswordResetEmail(auth, email, { url: origin });
  }
  return sendPasswordResetEmail(auth, email);
}

export function signOutUser() {
  return signOut(auth);
}

export async function updateDisplayName(displayName) {
  if (!auth.currentUser) throw new Error('No authenticated user found.');
  await updateProfile(auth.currentUser, { displayName: displayName || null });
  return auth.currentUser;
}

export async function reloadCurrentUser() {
  if (!auth.currentUser) throw new Error('No authenticated user found.');
  await reload(auth.currentUser);
  return auth.currentUser;
}

export async function sendCurrentUserVerification() {
  if (!auth.currentUser) throw new Error('No authenticated user found.');
  const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : null;
  if (origin) {
    return sendEmailVerification(auth.currentUser, { url: origin });
  }
  return sendEmailVerification(auth.currentUser);
}

export async function ensureVisitorSession() {
  const existing = auth.currentUser;
  if (existing) {
    return existing;
  }
  try {
    const credential = await signInAnonymously(auth);
    return credential.user;
  } catch (err) {
    const code = err && err.code;
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      console.warn('Anonymous sign-in is disabled. Enable it in Firebase Auth or relax Firestore rules for public reads.');
      return null;
    }
    console.error('Failed to establish visitor session', err);
    return null;
  }
}
