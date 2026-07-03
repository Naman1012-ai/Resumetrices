import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDfVnkphuA6Z27t0BFHPbgzfAOfNrryJ-U",
  authDomain: "resume-analyser-4f4b3.firebaseapp.com",
  projectId: "resume-analyser-4f4b3",
  storageBucket: "resume-analyser-4f4b3.firebasestorage.app",
  messagingSenderId: "138706729074",
  appId: "1:138706729074:web:2323f40721dda4eeb12aeb",
  measurementId: "G-WTE0RKBH3J"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp, "https://resume-analyser-4f4b3-default-rtdb.asia-southeast1.firebasedatabase.app");

const isMockMode = window.location.search.includes('mock=true');
if (isMockMode) {
  Object.defineProperty(auth, 'currentUser', {
    get() {
      return {
        uid: 'demo_user_123',
        email: 'demo@atspilot.co',
        displayName: 'Demo Pilot',
        photoURL: null,
        emailVerified: true,
        metadata: { creationTime: 'Wed, 25 Jun 2026 00:00:00 GMT' },
        providerData: [{ providerId: 'google.com', email: 'demo@atspilot.co' }],
        getIdToken: async () => 'mock_token'
      };
    }
  });
}

export { firebaseApp, auth, db, isMockMode };
