/**
 * SplitWise AI - Firebase Configuration & Real-Time Cloud Sync
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
    } catch (e) { }
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
    } catch (e) { }
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
    try { auth.signOut().catch(() => { }); } catch (e) { }
  }
  sessionStorage.setItem("is_guest_session", "true");
  sessionStorage.setItem("guest_display_name", customName);
  localStorage.setItem("is_guest_mode", "true");
  localStorage.setItem("splitwise_user", JSON.stringify({ ...GUEST_USER, displayName: customName }));
  recordActiveTimestamp();
  window.location.href = "/dashboard.html";
}

function logoutUser() {
  sessionStorage.clear();
  localStorage.removeItem("splitwise_user");
  localStorage.removeItem("is_guest_mode");
  localStorage.removeItem("is_guest_session");
  localStorage.removeItem("guest_display_name");
  localStorage.removeItem("splitwise_active_bill_id");
  localStorage.removeItem(LAST_ACTIVE_KEY);

  if (auth) {
    auth.signOut().catch(() => { }).finally(() => {
      window.location.href = "/auth.html";
    });
    return;
  }
  window.location.href = "/auth.html";
}

// ─── 15-MINUTE INACTIVITY ON WEBSITE CLOSE AUTO-LOGOUT SYSTEM ─────────────────
// Closes website > 15 mins -> auto logout on next open.
// Active, idle, or background open tabs -> STAY logged in.

const AUTO_LOGOUT_DURATION_MS = 15 * 60 * 1000; // 15 Minutes (900,000 ms)
const LAST_ACTIVE_KEY = "splitwise_last_active_timestamp";

function checkSessionTimeoutOnLoad() {
  const isAuthPage = window.location.pathname.endsWith("auth.html") || window.location.pathname === "/auth.html";
  if (isAuthPage) return false;

  const user = getCurrentUser();
  if (!user) return false;

  const lastActiveStr = localStorage.getItem(LAST_ACTIVE_KEY);
  if (lastActiveStr) {
    const lastActive = parseInt(lastActiveStr, 10);
    const now = Date.now();
    if (!isNaN(lastActive) && (now - lastActive) > AUTO_LOGOUT_DURATION_MS) {
      console.warn("[Session Security] Website was closed for over 15 minutes. Automatically logging out.");
      localStorage.removeItem(LAST_ACTIVE_KEY);
      logoutUser();
      return true;
    }
  }

  // Update last active timestamp immediately
  recordActiveTimestamp();
  return false;
}

function recordActiveTimestamp() {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
  } catch (e) { }
}

// Continuous Heartbeat: keeps session alive as long as ANY tab of the website is open (even idle or background)
function initSessionHeartbeat() {
  recordActiveTimestamp();

  // Heartbeat every 5 seconds while page exists
  setInterval(recordActiveTimestamp, 5000);

  // Also record on user interaction and visibility change
  window.addEventListener("focus", recordActiveTimestamp, { passive: true });
  window.addEventListener("click", recordActiveTimestamp, { passive: true });
  window.addEventListener("keydown", recordActiveTimestamp, { passive: true });
  window.addEventListener("touchstart", recordActiveTimestamp, { passive: true });
  document.addEventListener("visibilitychange", recordActiveTimestamp, { passive: true });

  // Record precise timestamp when tab is being closed or unloaded
  window.addEventListener("pagehide", recordActiveTimestamp, { passive: true });
  window.addEventListener("beforeunload", recordActiveTimestamp, { passive: true });
}

// Run the timeout check immediately upon script evaluation
if (typeof window !== "undefined") {
  const timedOut = checkSessionTimeoutOnLoad();
  if (!timedOut) {
    initSessionHeartbeat();
  }
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

// Deleted Bill IDs Tombstones to prevent zombie bill resurrection
function getDeletedBillIds() {
  try {
    const raw = localStorage.getItem("splitwise_deleted_bill_ids");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function addDeletedBillId(billId) {
  if (!billId) return;
  try {
    const deleted = getDeletedBillIds();
    if (!deleted.includes(billId)) {
      deleted.push(billId);
      // Keep up to last 100 deleted IDs
      if (deleted.length > 100) deleted.shift();
      localStorage.setItem("splitwise_deleted_bill_ids", JSON.stringify(deleted));
    }
  } catch (e) { }
}

function removeDeletedBillId(billId) {
  if (!billId) return;
  try {
    const deleted = getDeletedBillIds().filter(id => id !== billId);
    localStorage.setItem("splitwise_deleted_bill_ids", JSON.stringify(deleted));
  } catch (e) { }
}

function getLocalBills() {
  try {
    const raw = localStorage.getItem("splitwise_bills_history");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const DUMMY_IDS = ['dinner-01', 'roadtrip-02', 'grocery-03'];
        const deletedIds = getDeletedBillIds();
        return parsed.filter(b => b && b.id && !DUMMY_IDS.includes(b.id) && !b.id.startsWith('dinner-') && !b.id.startsWith('roadtrip-') && !b.id.startsWith('grocery-') && !deletedIds.includes(b.id));
      }
    }
  } catch (e) { }
  return [];
}

function setLocalBills(bills) {
  try {
    const deletedIds = getDeletedBillIds();
    const filtered = (Array.isArray(bills) ? bills : []).filter(b => b && b.id && !deletedIds.includes(b.id));
    localStorage.setItem("splitwise_bills_history", JSON.stringify(filtered));
    updateProfileTotalSettled(filtered);
    window.dispatchEvent(new CustomEvent('splitwise_bills_updated', { detail: { bills: filtered } }));
  } catch (e) { }
}

function mergeBills(primary = [], secondary = []) {
  const map = new Map();
  const deletedIds = getDeletedBillIds();

  primary.forEach(b => {
    if (b && b.id && !deletedIds.includes(b.id)) map.set(b.id, { ...b });
  });

  secondary.forEach(b => {
    if (!b || !b.id || deletedIds.includes(b.id)) return;
    if (!map.has(b.id)) {
      map.set(b.id, { ...b });
    } else {
      const ex = map.get(b.id);
      const exT = ex.updatedAt || ex.createdAt || 0;
      const inT = b.updatedAt || b.createdAt || 0;
      if (inT >= exT) map.set(b.id, { ...ex, ...b });
    }
  });

  const result = Array.from(map.values()).filter(b => b && b.id && !deletedIds.includes(b.id));
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
  const uid = getUserId();
  const isGuest = uid === "guest_demo_user" || !uid;

  if (isGuest) {
    const local = getLocalBills();
    updateProfileTotalSettled(local);
    updateCloudSyncBadge('demo');
    return local;
  }

  updateCloudSyncBadge('syncing');

  if (db && uid) {
    try {
      // 1. Direct document read (Firestore as Single Source of Truth)
      const docSnap = await billsDataDoc(uid).get();

      if (docSnap.exists && Array.isArray(docSnap.data()?.list)) {
        const cloudBills = docSnap.data().list;
        setLocalBills(cloudBills);
        updateProfileTotalSettled(cloudBills);
        updateCloudSyncBadge('synced');
        return cloudBills;
      }

      // 2. Check individual bill docs in subcollection if bundle doc is not created yet
      const colSnap = await db.collection("users").doc(uid).collection("bills").get();
      const cloudBills = [];
      colSnap.forEach(d => {
        if (d.id !== 'data') {
          const data = d.data();
          if (data) cloudBills.push({ id: d.id, ...data });
        }
      });

      if (cloudBills.length > 0) {
        cloudBills.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setLocalBills(cloudBills);
        updateProfileTotalSettled(cloudBills);
        updateCloudSyncBadge('synced');
        await billsDataDoc(uid).set({ list: cloudBills, updatedAt: Date.now() }, { merge: true });
        return cloudBills;
      }

      // If Firestore is empty (e.g. all bills deleted), sync local cache to empty array
      setLocalBills([]);
      updateProfileTotalSettled([]);
      updateCloudSyncBadge('synced');
      return [];
    } catch (err) {
      console.warn("[Firestore] Load notice:", err.message);
      updateCloudSyncBadge('offline');
    }
  }

  const local = getLocalBills();
  updateProfileTotalSettled(local);
  return local;
}

/**
 * Save Bill Record (Direct parallel write to users/{uid}/bills/data and users/{uid}/bills/{id})
 */
async function saveBillRecord(bill) {
  if (!bill || !bill.id) return;

  removeDeletedBillId(bill.id);

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
 * Delete Bill Record (Permanent multi-path delete with tombstone protection)
 */
async function deleteBillRecord(billId) {
  if (!billId) return;

  addDeletedBillId(billId);

  const uid = getUserId();
  const isGuest = uid === "guest_demo_user" || !uid;

  // 1. Remove from local cache immediately
  const localBills = getLocalBills().filter(b => b.id !== billId);
  setLocalBills(localBills);
  updateProfileTotalSettled(localBills);

  if (isGuest) return;

  // 2. Delete across all Firestore paths
  if (db && uid) {
    try {
      const cleanList = JSON.parse(JSON.stringify(localBills));
      await Promise.all([
        billsDataDoc(uid).set({ list: cleanList, updatedAt: Date.now() }),
        billItemDoc(uid, billId).delete(),
        db.collection("history").doc(billId).delete().catch(() => { }),
        db.collection("bills").doc(billId).delete().catch(() => { })
      ]);
      console.log(`[Firestore] Permanently deleted bill ${billId}`);
    } catch (e) {
      console.warn("[Firestore] Delete note:", e);
    }
  }

  // 3. Backup server delete
  try {
    fetch(`/api/sync-bills?userId=${encodeURIComponent(uid || '')}&billId=${encodeURIComponent(billId)}`, {
      method: 'DELETE'
    }).catch(() => { });
  } catch (e) { }
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
  if (typeof callback !== 'function' || !db) return () => { };

  const uid = getUserId();
  if (!uid || uid === 'guest_demo_user') return () => { };

  try {
    const unsub = billsDataDoc(uid).onSnapshot((docSnap) => {
      if (docSnap.exists && Array.isArray(docSnap.data()?.list)) {
        const cloudBills = docSnap.data().list;
        setLocalBills(cloudBills);
        updateProfileTotalSettled(cloudBills);
        updateCloudSyncBadge('synced');
        callback(cloudBills);
      } else if (docSnap.exists && (!docSnap.data()?.list || docSnap.data().list.length === 0)) {
        setLocalBills([]);
        updateProfileTotalSettled([]);
        updateCloudSyncBadge('synced');
        callback([]);
      }
    }, (err) => {
      console.warn("[Firestore Listener] Notice:", err.message);
    });

    return unsub;
  } catch (err) {
    return () => { };
  }
}

// Initial Sync Status Badge on script load
updateCloudSyncBadge('synced');
