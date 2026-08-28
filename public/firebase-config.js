/**
 * SplitWise AI - Firebase Configuration & Auth Helpers
 * Dynamically retrieves configuration from /api/config
 * and supports Guest Evaluator Demo session support.
 */

let auth = null;
let googleProvider = null;

// Dynamic initialization promise to ensure configuration is loaded from environment
const firebaseInitPromise = (async function() {
  if (typeof firebase === 'undefined') return null;

  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data.firebase && data.firebase.apiKey) {
        if (!firebase.apps.length) {
          firebase.initializeApp(data.firebase);
        }
        auth = firebase.auth();
        googleProvider = new firebase.auth.GoogleAuthProvider();
        return auth;
      }
    }
  } catch (e) {
    console.warn("Could not load Firebase config from /api/config:", e);
  }
  return null;
})();

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
