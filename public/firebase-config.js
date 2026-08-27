/**
 * SplitWise AI - Firebase Configuration & Auth Helpers
 * Configured with Firebase Auth (Email/Password & Google Sign-In)
 * and Guest Evaluator Demo session support.
 */

const firebaseConfig = {
  apiKey: "",
  authDomain: "attendance-hvpp.firebaseapp.com",
  projectId: "attendance-hvpp",
  storageBucket: "attendance-hvpp.firebasestorage.app",
  messagingSenderId: "1052095327914",
  appId: "1:1052095327914:web:f6c526dfe3dc9526eaaad3"
};

// Initialize Firebase if loaded
let auth = null;
let googleProvider = null;

if (typeof firebase !== 'undefined') {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  auth = firebase.auth();
  googleProvider = new firebase.auth.GoogleAuthProvider();
}

// Guest User definition for 1-Click Demo mode
const GUEST_USER = {
  uid: "guest_demo_" + Math.random().toString(36).substring(2, 9),
  displayName: "Guest Demo Evaluator",
  email: "guest@splitwise.demo",
  isGuest: true,
  photoURL: null
};

// Auth helper functions
function getCurrentUser() {
  const isGuest = sessionStorage.getItem("is_guest_session") === "true";
  if (isGuest) {
    const savedName = sessionStorage.getItem("guest_display_name") || "Guest Evaluator";
    return { ...GUEST_USER, displayName: savedName };
  }
  if (auth && auth.currentUser) {
    return auth.currentUser;
  }
  // Check localStorage for persisted user profile
  const stored = localStorage.getItem("splitwise_user");
  if (stored) {
    try { return JSON.parse(stored); } catch (e) { return null; }
  }
  return null;
}

function loginAsGuest(customName = "Guest Evaluator") {
  sessionStorage.setItem("is_guest_session", "true");
  sessionStorage.setItem("guest_display_name", customName);
  localStorage.setItem("splitwise_user", JSON.stringify({ ...GUEST_USER, displayName: customName }));
  window.location.href = "/dashboard.html";
}

function logoutUser() {
  sessionStorage.removeItem("is_guest_session");
  sessionStorage.removeItem("guest_display_name");
  localStorage.removeItem("splitwise_user");
  if (auth) {
    auth.signOut().finally(() => {
      window.location.href = "/auth.html";
    });
  } else {
    window.location.href = "/auth.html";
  }
}
