/**
 * SplitWise AI - Firebase Configuration & Multi-Device Cloud Sync
 * Dynamically retrieves configuration from /api/config
 * Supports Firestore real-time cloud sync across Mobile & PC for authenticated accounts,
 * and offline localStorage persistence for Guest Evaluator Demo mode.
 */

let auth = null;
let db = null;
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
        if (firebase.firestore) {
          db = firebase.firestore();
        }
        googleProvider = new firebase.auth.GoogleAuthProvider();
        return { auth, db };
      }
    }
  } catch (e) {
    console.warn("Could not load Firebase config from /api/config:", e);
  }
  return null;
})();

// Guest User definition for 1-Click Demo mode
const GUEST_USER = {
  uid: "guest_demo_user",
  displayName: "Guest Evaluator",
  email: "guest@splitwise.demo",
  isGuest: true,
  photoURL: null
};

// Auth helper functions
function getCurrentUser() {
  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";
  if (isGuest) {
    const savedName = sessionStorage.getItem("guest_display_name") || "Guest Evaluator";
    return { ...GUEST_USER, displayName: savedName };
  }
  
  // Check localStorage for persisted user profile
  const stored = localStorage.getItem("splitwise_user");
  if (stored) {
    try { 
      const parsed = JSON.parse(stored);
      if (parsed && !parsed.isGuest) return parsed;
      if (parsed && isGuest) return parsed;
    } catch (e) { return null; }
  }

  if (auth && auth.currentUser) {
    return auth.currentUser;
  }

  return null;
}

function loginAsGuest(customName = "Guest Evaluator") {
  // Ensure previous Firebase session is completely cleared so it won't bleed into demo mode
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && firebase.auth) {
    try { firebase.auth().signOut().catch(() => {}); } catch (e) {}
  }
  sessionStorage.setItem("is_guest_session", "true");
  sessionStorage.setItem("guest_display_name", customName);
  localStorage.setItem("is_guest_mode", "true");
  localStorage.setItem("splitwise_user", JSON.stringify({ ...GUEST_USER, displayName: customName }));
  window.location.href = "/dashboard.html";
}

function logoutUser() {
  sessionStorage.clear();
  localStorage.removeItem("splitwise_user");
  localStorage.removeItem("is_guest_mode");
  localStorage.removeItem("is_guest_session");
  localStorage.removeItem("guest_display_name");
  localStorage.removeItem("splitwise_active_bill_id");

  if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && firebase.auth) {
    try {
      firebase.auth().signOut().catch(() => {}).finally(() => {
        window.location.href = "/auth.html";
      });
      return;
    } catch (e) {}
  }
  window.location.href = "/auth.html";
}

// ─── FIRESTORE MULTI-DEVICE CLOUD SYNC & LOCAL CACHE ──────────────────────────

/**
 * Get active bills from local device storage
 */
function getLocalBills() {
  try {
    const raw = localStorage.getItem("splitwise_bills_history");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const DUMMY_IDS = ['dinner-01', 'roadtrip-02', 'grocery-03'];
        return parsed.filter(b => b && b.id && !DUMMY_IDS.includes(b.id) && !b.id.startsWith('dinner-') && !b.id.startsWith('roadtrip-') && !b.id.startsWith('grocery-'));
      }
    }
  } catch (e) {
    console.warn("Error reading local bills:", e);
  }
  return [];
}

/**
 * Save active bills to local device storage
 */
function setLocalBills(bills) {
  try {
    localStorage.setItem("splitwise_bills_history", JSON.stringify(bills));
  } catch (e) {
    console.warn("Error writing local bills:", e);
  }
}

/**
 * Load user bills: Fetches from Firebase Firestore if authenticated AND not in guest mode,
 * and seamlessly synchronizes with local storage cache.
 */
async function loadUserBills() {
  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";
  if (isGuest) {
    return getLocalBills();
  }

  await firebaseInitPromise;
  const user = auth?.currentUser;

  // If user is authenticated in Firebase and NOT in guest mode, load from Firestore
  if (user && db && !isGuest) {
    try {
      const snapshot = await db.collection("users").doc(user.uid).collection("bills").orderBy("createdAt", "desc").get();
      const cloudBills = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        cloudBills.push({ id: doc.id, ...data });
      });

      // Update local storage cache
      setLocalBills(cloudBills);
      return cloudBills;
    } catch (err) {
      console.warn("[Firestore] Failed to fetch bills from cloud, falling back to local cache:", err);
      return getLocalBills();
    }
  }

  // Fallback to local storage
  return getLocalBills();
}

/**
 * Save a new bill or update an existing bill in Cloud (Firestore) and Local Cache
 */
async function saveBillRecord(bill) {
  if (!bill || !bill.id) return;

  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";

  // 1. Update local cache first for instant UI response
  const localBills = getLocalBills();
  const index = localBills.findIndex(b => b.id === bill.id);
  if (index >= 0) {
    localBills[index] = { ...localBills[index], ...bill };
  } else {
    localBills.unshift(bill);
  }
  setLocalBills(localBills);

  // 2. Only if authenticated and NOT guest, persist to Firebase Firestore
  if (!isGuest) {
    await firebaseInitPromise;
    const user = auth?.currentUser;
    if (user && db) {
      try {
        const billData = {
          title: bill.title || "Bill Split",
          category: bill.category || "restaurant",
          categoryName: bill.categoryName || "Restaurant & Dining",
          total: bill.total || 0,
          tax: bill.tax || 0,
          payer: bill.payer || "Harsh",
          payerShare: bill.payerShare || 0,
          participants: bill.participants || ["Harsh"],
          items: bill.items || [],
          settlements: bill.settlements || [],
          date: bill.date || new Date().toISOString().split("T")[0],
          createdAt: bill.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        await db.collection("users").doc(user.uid).collection("bills").doc(bill.id).set(billData, { merge: true });
        console.log(`[Firestore] Bill ${bill.id} successfully synced to cloud for user ${user.uid}`);
      } catch (err) {
        console.warn("[Firestore] Could not sync bill to cloud:", err);
      }
    }
  }
}

/**
 * Delete a bill from Cloud (Firestore) and Local Cache
 */
async function deleteBillRecord(billId) {
  if (!billId) return;

  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";

  // 1. Remove from local cache
  const localBills = getLocalBills().filter(b => b.id !== billId);
  setLocalBills(localBills);

  // 2. Only if authenticated and NOT guest, delete from Firebase Firestore
  if (!isGuest) {
    await firebaseInitPromise;
    const user = auth?.currentUser;
    if (user && db) {
      try {
        await db.collection("users").doc(user.uid).collection("bills").doc(billId).delete();
        console.log(`[Firestore] Bill ${billId} deleted from cloud for user ${user.uid}`);
      } catch (err) {
        console.warn("[Firestore] Could not delete bill from cloud:", err);
      }
    }
  }
}

/**
 * Update settlement status for a bill
 */
async function updateBillSettlement(billId, settlements) {
  if (!billId || !settlements) return;

  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";

  // 1. Update local cache
  const localBills = getLocalBills();
  const target = localBills.find(b => b.id === billId);
  if (target) {
    target.settlements = settlements;
    setLocalBills(localBills);
  }

  // 2. Only if authenticated and NOT guest, update in Firestore
  if (!isGuest) {
    await firebaseInitPromise;
    const user = auth?.currentUser;
    if (user && db) {
      try {
        await db.collection("users").doc(user.uid).collection("bills").doc(billId).update({
          settlements: settlements,
          updatedAt: Date.now()
        });
      } catch (err) {
        console.warn("[Firestore] Could not update settlement status:", err);
      }
    }
  }
}
