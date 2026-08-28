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

// Helper to reliably get the authenticated Firebase user (waits for async token restoration)
async function getAuthenticatedFirebaseUser() {
  await firebaseInitPromise;
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;
  
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      resolve(u);
    });
    setTimeout(() => resolve(auth.currentUser || null), 2000);
  });
}

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
 * Dynamically computes and updates the Total Settled amount in the profile dropdown
 */
function updateProfileTotalSettled(bills) {
  let totalSettled = 0;
  const list = Array.isArray(bills) ? bills : getLocalBills();
  list.forEach(bill => {
    if (Array.isArray(bill.settlements)) {
      bill.settlements.forEach(s => {
        if (s.paid) {
          totalSettled += (s.amount || 0);
        }
      });
    }
  });
  const badge = document.getElementById("menu-total-settled");
  if (badge) {
    badge.textContent = `₹${totalSettled.toLocaleString()}`;
  }
}

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
    updateProfileTotalSettled(bills);
  } catch (e) {
    console.warn("Error writing local bills:", e);
  }
}

/**
 * Load user bills: Safely queries Firestore history and user collections,
 * guarantees local cache is never wiped out, and keeps PC and mobile in sync.
 */
async function loadUserBills() {
  const local = getLocalBills();
  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";
  if (isGuest) {
    updateProfileTotalSettled(local);
    return local;
  }

  const user = await getAuthenticatedFirebaseUser();

  if (user && db && !isGuest) {
    try {
      // 1. Try reading user document bundle (attendance-tracker structure)
      try {
        const snap = await db.collection("users").doc(user.uid).collection("bills").doc("data").get();
        if (snap.exists && Array.isArray(snap.data()?.list) && snap.data().list.length > 0) {
          const cloudList = snap.data().list;
          setLocalBills(cloudList);
          updateProfileTotalSettled(cloudList);
          return cloudList;
        }
      } catch (err1) {
        console.warn("[Firestore] User bills bundle check notice:", err1);
      }

      // 2. Try reading from history collection
      try {
        const histSnap = await db.collection("history").get();
        const cloudBills = [];
        histSnap.forEach(doc => {
          const data = doc.data();
          if (data && (data.userId === user.uid || !data.userId || data.userEmail === user.email)) {
            cloudBills.push({ id: doc.id, ...data });
          }
        });

        if (cloudBills.length > 0) {
          cloudBills.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setLocalBills(cloudBills);
          updateProfileTotalSettled(cloudBills);
          return cloudBills;
        }
      } catch (err2) {
        console.warn("[Firestore] History collection check notice:", err2);
      }

      // 3. If cloud is empty but local device has bills, push them to cloud
      if (local.length > 0) {
        const cleanList = JSON.parse(JSON.stringify(local));
        try {
          await db.collection("users").doc(user.uid).collection("bills").doc("data").set({ list: cleanList, updatedAt: Date.now() }, { merge: true });
        } catch (e) {}

        for (const b of cleanList) {
          try {
            await db.collection("history").doc(b.id).set({ ...b, userId: user.uid }, { merge: true });
          } catch (e) {}
        }
        console.log(`[Firestore] Initial sync: pushed ${cleanList.length} local bills to cloud for ${user.uid}`);
      }
    } catch (outerErr) {
      console.warn("[Firestore] Cloud sync error, using local data:", outerErr);
    }
  }

  // Safe fallback: Always preserve local bills
  updateProfileTotalSettled(local);
  return local;
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
  updateProfileTotalSettled(localBills);

  // 2. Persist to Firebase Firestore
  if (!isGuest) {
    await firebaseInitPromise;
    if (!db && typeof firebase !== 'undefined' && firebase.firestore) {
      db = firebase.firestore();
    }
    const user = (await getAuthenticatedFirebaseUser()) || getCurrentUser();
    if (db) {
      const uid = (user && user.uid) ? user.uid : "user_app";
      const email = (user && user.email) ? user.email : "";

      const billData = {
        id: bill.id,
        userId: uid,
        userEmail: email,
        title: bill.title || "Bill Split",
        category: bill.category || "restaurant",
        categoryName: bill.categoryName || "Restaurant & Dining",
        total: Number(bill.total) || 0,
        tax: Number(bill.tax) || 0,
        payer: bill.payer || "Harsh",
        payerShare: Number(bill.payerShare) || 0,
        participants: Array.isArray(bill.participants) ? bill.participants : ["Harsh"],
        items: Array.isArray(bill.items) ? bill.items : [],
        settlements: Array.isArray(bill.settlements) ? bill.settlements : [],
        date: bill.date || new Date().toISOString().split("T")[0],
        createdAt: bill.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      const cleanBill = JSON.parse(JSON.stringify(billData));
      const cleanList = JSON.parse(JSON.stringify(localBills));

      // Save full list bundle to users/{uid}/bills/data (attendance-tracker structure)
      try {
        await db.collection("users").doc(uid).collection("bills").doc("data").set({ list: cleanList, updatedAt: Date.now() }, { merge: true });
        console.log(`[Firestore] Synced ${cleanList.length} bills to users bundle for ${uid}`);
      } catch (err1) {
        console.warn("[Firestore] User bundle write note:", err1);
      }

      // Save single document to history/{bill.id}
      try {
        await db.collection("history").doc(bill.id).set(cleanBill, { merge: true });
        console.log(`[Firestore] Saved bill ${bill.id} to history collection`);
      } catch (err2) {
        console.warn("[Firestore] History collection write note:", err2);
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
  updateProfileTotalSettled(localBills);

  // 2. Delete from Firebase Firestore
  if (!isGuest) {
    const user = await getAuthenticatedFirebaseUser();
    if (user && db) {
      const cleanList = JSON.parse(JSON.stringify(localBills));
      try {
        await db.collection("users").doc(user.uid).collection("bills").doc("data").set({ list: cleanList, updatedAt: Date.now() });
      } catch (e) {}

      try {
        await db.collection("history").doc(billId).delete();
      } catch (e) {}

      console.log(`[Firestore] Bill ${billId} deleted from cloud`);
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
    updateProfileTotalSettled(localBills);
  }

  // 2. Update in Firestore
  if (!isGuest) {
    const user = await getAuthenticatedFirebaseUser();
    if (user && db) {
      const cleanList = JSON.parse(JSON.stringify(localBills));
      const cleanSettlements = JSON.parse(JSON.stringify(settlements));

      try {
        await db.collection("users").doc(user.uid).collection("bills").doc("data").set({ list: cleanList, updatedAt: Date.now() });
      } catch (e) {}

      try {
        await db.collection("history").doc(billId).update({
          settlements: cleanSettlements,
          updatedAt: Date.now()
        });
      } catch (e) {}

      console.log(`[Firestore] Settlements updated for bill ${billId}`);
    }
  }
}
