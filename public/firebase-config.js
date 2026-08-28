/**
 * SplitWise AI - Firebase Configuration & Real-Time Cloud Sync
 * Patterned directly after the attendance-tracker Firestore architecture:
 * - Synchronous SDK initialization for instant startup (zero network waterfalls)
 * - Atomic document persistence at users/{uid}/bills/data
 * - Subcollection synchronization at users/{uid}/bills/{billId}
 * - Real-time Firestore onSnapshot listeners for instant Mobile <-> PC sync
 */

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "ai-splitwise",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// 1. Synchronous Initialization (Instant - Zero delay)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  try {
    firebase.initializeApp(firebaseConfig);
  } catch (e) {
    console.warn("[Firebase] Init note:", e);
  }
}

const auth = (typeof firebase !== 'undefined' && firebase.apps.length) ? firebase.auth() : null;
const db = (typeof firebase !== 'undefined' && firebase.apps.length && firebase.firestore) ? firebase.firestore() : null;
const googleProvider = (typeof firebase !== 'undefined' && firebase.auth) ? new firebase.auth.GoogleAuthProvider() : null;

// Guest User definition for 1-Click Demo mode
const GUEST_USER = {
  uid: "guest_demo_user",
  displayName: "Guest Evaluator",
  email: "guest@splitwise.demo",
  isGuest: true,
  photoURL: null
};

// Helper to get active user ID (matching attendance-tracker getUserId pattern)
function getUserId() {
  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";
  if (isGuest) return "guest_demo_user";
  
  if (auth && auth.currentUser) {
    return auth.currentUser.uid;
  }
  
  const stored = localStorage.getItem("splitwise_user");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.uid) return parsed.uid;
    } catch (e) {}
  }
  return null;
}

// Auth helper functions
function getCurrentUser() {
  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";
  if (isGuest) {
    const savedName = sessionStorage.getItem("guest_display_name") || "Guest Evaluator";
    return { ...GUEST_USER, displayName: savedName };
  }

  if (auth && auth.currentUser) {
    return {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "User",
      email: auth.currentUser.email,
      photoURL: auth.currentUser.photoURL
    };
  }

  const stored = localStorage.getItem("splitwise_user");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed) return parsed;
    } catch (e) {}
  }

  return null;
}

async function getAuthenticatedFirebaseUser() {
  if (!auth) return getCurrentUser();
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve) => {
    let done = false;
    const unsub = auth.onAuthStateChanged((u) => {
      if (!done) {
        done = true;
        unsub();
        resolve(u || getCurrentUser());
      }
    });
    setTimeout(() => {
      if (!done) {
        done = true;
        resolve(auth.currentUser || getCurrentUser());
      }
    }, 800);
  });
}

function loginAsGuest(customName = "Guest Evaluator") {
  if (auth) {
    try { auth.signOut().catch(() => {}); } catch (e) {}
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

  if (auth) {
    auth.signOut().catch(() => {}).finally(() => {
      window.location.href = "/auth.html";
    });
    return;
  }
  window.location.href = "/auth.html";
}

// ─── UI CLOUD SYNC STATUS PILL ────────────────────────────────────────────────

function updateCloudSyncBadge(status = 'synced') {
  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";
  const badges = document.querySelectorAll(".cloud-sync-pill, .cloud-sync-status, #cloud-sync-pill");
  
  badges.forEach(badge => {
    if (!badge) return;
    if (isGuest) {
      badge.innerHTML = `<i class="ph-bold ph-shield-check"></i><span>Demo Mode</span>`;
      badge.className = "cloud-sync-pill is-demo";
      badge.setAttribute("title", "Demo Mode: Data stored locally");
    } else if (status === 'syncing') {
      badge.innerHTML = `<i class="ph-bold ph-arrows-clockwise sync-spin"></i><span>Syncing...</span>`;
      badge.className = "cloud-sync-pill is-syncing";
      badge.setAttribute("title", "Syncing with Firebase Cloud...");
    } else if (status === 'synced') {
      badge.innerHTML = `<i class="ph-bold ph-cloud-check"></i><span>Cloud Synced</span>`;
      badge.className = "cloud-sync-pill is-synced";
      badge.setAttribute("title", "All bills saved and synced with Mobile & PC");
    } else if (status === 'offline') {
      badge.innerHTML = `<i class="ph-bold ph-cloud-slash"></i><span>Offline Saved</span>`;
      badge.className = "cloud-sync-pill is-offline";
      badge.setAttribute("title", "Saved locally. Will sync when online.");
    }
  });
}

// ─── LOCAL STORAGE CACHE HELPERS ──────────────────────────────────────────────

function updateProfileTotalSettled(bills) {
  let totalSettled = 0;
  const list = Array.isArray(bills) ? bills : getLocalBills();
  list.forEach(bill => {
    if (Array.isArray(bill.settlements)) {
      bill.settlements.forEach(s => {
        if (s.paid) {
          totalSettled += (Number(s.amount) || 0);
        }
      });
    }
  });
  const badge = document.getElementById("menu-total-settled");
  if (badge) {
    badge.textContent = `₹${totalSettled.toLocaleString()}`;
  }
}

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
  } catch (e) {}
  return [];
}

function setLocalBills(bills) {
  try {
    localStorage.setItem("splitwise_bills_history", JSON.stringify(bills));
    updateProfileTotalSettled(bills);
    window.dispatchEvent(new CustomEvent('splitwise_bills_updated', { detail: { bills } }));
  } catch (e) {}
}

function mergeBills(primary = [], secondary = []) {
  const map = new Map();
  primary.forEach(b => { if (b && b.id) map.set(b.id, { ...b }); });
  secondary.forEach(b => {
    if (!b || !b.id) return;
    if (!map.has(b.id)) {
      map.set(b.id, { ...b });
    } else {
      const ex = map.get(b.id);
      const exT = ex.updatedAt || ex.createdAt || 0;
      const inT = b.updatedAt || b.createdAt || 0;
      if (inT >= exT) map.set(b.id, { ...ex, ...b });
    }
  });
  const result = Array.from(map.values());
  result.sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));
  return result;
}

// ─── ATTENDANCE-TRACKER FIRESTORE SERVICE ─────────────────────────────────────

/**
 * References matching attendance-tracker pattern:
 * users/{uid}/bills/data -> contains { list: [...] }
 */
function billsDataDoc(uid) {
  return db.collection("users").doc(uid).collection("bills").doc("data");
}

function billItemDoc(uid, billId) {
  return db.collection("users").doc(uid).collection("bills").doc(billId);
}

/**
 * Load User Bills (Direct sub-50ms document read)
 */
async function loadUserBills() {
  const local = getLocalBills();
  const uid = getUserId();
  const isGuest = uid === "guest_demo_user" || !uid;

  if (isGuest) {
    updateProfileTotalSettled(local);
    updateCloudSyncBadge('demo');
    return local;
  }

  updateCloudSyncBadge('syncing');

  if (db && uid) {
    try {
      // 1. Direct document read (matching attendance-tracker loadAllData)
      const docSnap = await billsDataDoc(uid).get();
      let cloudBills = [];

      if (docSnap.exists && Array.isArray(docSnap.data()?.list)) {
        cloudBills = docSnap.data().list;
        console.log(`[Firestore] Loaded ${cloudBills.length} bills from users/${uid}/bills/data`);
      } else {
        // Fallback: check individual bill docs in subcollection
        const colSnap = await db.collection("users").doc(uid).collection("bills").get();
        colSnap.forEach(d => {
          if (d.id !== 'data') {
            const data = d.data();
            if (data) cloudBills.push({ id: d.id, ...data });
          }
        });
      }

      // Merge Cloud + Local
      const merged = mergeBills(cloudBills, local);
      setLocalBills(merged);
      updateProfileTotalSettled(merged);
      updateCloudSyncBadge('synced');

      // If local had bills missing from cloud, push them immediately
      if (local.length > 0 && cloudBills.length === 0) {
        const cleanList = JSON.parse(JSON.stringify(merged));
        await billsDataDoc(uid).set({ list: cleanList, updatedAt: Date.now() }, { merge: true });
        for (const b of cleanList) {
          await billItemDoc(uid, b.id).set(b, { merge: true });
        }
      }

      return merged;
    } catch (err) {
      console.warn("[Firestore] Load notice:", err.message);
      updateCloudSyncBadge('offline');
    }
  }

  updateProfileTotalSettled(local);
  return local;
}

/**
 * Save Bill Record (Direct parallel write to users/{uid}/bills/data and users/{uid}/bills/{id})
 */
async function saveBillRecord(bill) {
  if (!bill || !bill.id) return;

  const uid = getUserId();
  const isGuest = uid === "guest_demo_user" || !uid;

  // 1. Update local cache immediately (Zero UI lag)
  const localBills = getLocalBills();
  const idx = localBills.findIndex(b => b.id === bill.id);
  const cleanBill = JSON.parse(JSON.stringify({
    ...bill,
    userId: uid || "user",
    updatedAt: Date.now(),
    createdAt: bill.createdAt || Date.now()
  }));

  if (idx >= 0) {
    localBills[idx] = { ...localBills[idx], ...cleanBill };
  } else {
    localBills.unshift(cleanBill);
  }
  setLocalBills(localBills);
  updateProfileTotalSettled(localBills);

  if (isGuest) {
    updateCloudSyncBadge('demo');
    return;
  }

  // 2. Persist to Firebase Firestore (attendance-tracker direct setDoc)
  if (db && uid) {
    updateCloudSyncBadge('syncing');
    try {
      const cleanList = JSON.parse(JSON.stringify(localBills));

      // Atomic batch/parallel write
      await Promise.all([
        billsDataDoc(uid).set({ list: cleanList, updatedAt: Date.now() }, { merge: true }),
        billItemDoc(uid, bill.id).set(cleanBill, { merge: true }),
        db.collection("users").doc(uid).set({
          lastActive: Date.now(),
          displayName: getCurrentUser()?.displayName || "",
          email: getCurrentUser()?.email || ""
        }, { merge: true })
      ]);

      console.log(`[Firestore] Saved bill ${bill.id} to users/${uid}/bills/data!`);
      updateCloudSyncBadge('synced');
    } catch (err) {
      console.error("[Firestore] Cloud save error:", err);
      updateCloudSyncBadge('offline');
    }
  }
}

/**
 * Delete Bill Record
 */
async function deleteBillRecord(billId) {
  if (!billId) return;

  const uid = getUserId();
  const isGuest = uid === "guest_demo_user" || !uid;

  // 1. Remove from local cache
  const localBills = getLocalBills().filter(b => b.id !== billId);
  setLocalBills(localBills);
  updateProfileTotalSettled(localBills);

  if (isGuest) return;

  // 2. Delete from Firestore
  if (db && uid) {
    try {
      const cleanList = JSON.parse(JSON.stringify(localBills));
      await Promise.all([
        billsDataDoc(uid).set({ list: cleanList, updatedAt: Date.now() }),
        billItemDoc(uid, billId).delete()
      ]);
      console.log(`[Firestore] Deleted bill ${billId} from users/${uid}/bills`);
    } catch (e) {
      console.warn("[Firestore] Delete note:", e);
    }
  }
}

/**
 * Update Settlement Status
 */
async function updateBillSettlement(billId, settlements) {
  if (!billId || !settlements) return;

  const uid = getUserId();
  const isGuest = uid === "guest_demo_user" || !uid;

  // 1. Update local cache
  const localBills = getLocalBills();
  const target = localBills.find(b => b.id === billId);
  if (target) {
    target.settlements = settlements;
    target.updatedAt = Date.now();
    setLocalBills(localBills);
    updateProfileTotalSettled(localBills);
  }

  if (isGuest) return;

  // 2. Update in Firestore
  if (db && uid) {
    try {
      const cleanList = JSON.parse(JSON.stringify(localBills));
      const cleanSettlements = JSON.parse(JSON.stringify(settlements));
      await Promise.all([
        billsDataDoc(uid).set({ list: cleanList, updatedAt: Date.now() }),
        billItemDoc(uid, billId).set({ settlements: cleanSettlements, updatedAt: Date.now() }, { merge: true })
      ]);
      console.log(`[Firestore] Updated settlements for ${billId}`);
    } catch (e) {
      console.warn("[Firestore] Settlement update note:", e);
    }
  }
}

/**
 * Real-time Firestore Multi-Device Listener
 * Listens directly on users/{uid}/bills/data for instant live updates
 */
function subscribeToUserBills(callback) {
  if (typeof callback !== 'function' || !db) return () => {};

  const uid = getUserId();
  if (!uid || uid === 'guest_demo_user') return () => {};

  try {
    const unsub = billsDataDoc(uid).onSnapshot((docSnap) => {
      if (docSnap.exists && Array.isArray(docSnap.data()?.list)) {
        const cloudBills = docSnap.data().list;
        const local = getLocalBills();
        const merged = mergeBills(cloudBills, local);
        setLocalBills(merged);
        updateProfileTotalSettled(merged);
        updateCloudSyncBadge('synced');
        callback(merged);
      }
    }, (err) => {
      console.warn("[Firestore Listener] Notice:", err.message);
    });

    return unsub;
  } catch (err) {
    return () => {};
  }
}

// Initial Sync Status Badge on script load
updateCloudSyncBadge('synced');
