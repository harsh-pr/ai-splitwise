/**
 * SplitWise AI - Firebase Configuration & Multi-Device Real-Time Cloud Sync
 * Dynamically retrieves configuration from /api/config
 * Supports Firestore real-time cloud sync across Mobile & PC for authenticated accounts,
 * subcollection architecture (users/{uid}/bills/{billId}), and offline localStorage persistence.
 */

let auth = null;
let db = null;
let googleProvider = null;
let isFirebaseReady = false;

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
        isFirebaseReady = true;
        updateCloudSyncBadge('synced');
        return { auth, db };
      }
    }
  } catch (e) {
    console.warn("[Firebase] Could not load config from /api/config:", e);
    updateCloudSyncBadge('offline');
  }
  return null;
})();

// Helper to reliably get the authenticated Firebase user with minimal latency
async function getAuthenticatedFirebaseUser() {
  await firebaseInitPromise;
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;
  
  return new Promise((resolve) => {
    let resolved = false;
    const unsub = auth.onAuthStateChanged((u) => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve(u);
      }
    });
    // Fallback: don't hang UI
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(auth.currentUser || null);
      }
    }, 1500);
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
    return {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "User",
      email: auth.currentUser.email,
      photoURL: auth.currentUser.photoURL
    };
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

// ─── UI CLOUD SYNC BADGE & INDICATORS ──────────────────────────────────────────

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
    console.warn("[LocalCache] Error reading local bills:", e);
  }
  return [];
}

/**
 * Save active bills to local device storage & notify components
 */
function setLocalBills(bills) {
  try {
    localStorage.setItem("splitwise_bills_history", JSON.stringify(bills));
    updateProfileTotalSettled(bills);
    window.dispatchEvent(new CustomEvent('splitwise_bills_updated', { detail: { bills } }));
  } catch (e) {
    console.warn("[LocalCache] Error writing local bills:", e);
  }
}

/**
 * Helper to normalize and merge bills lists avoiding duplicates, keeping newest records
 */
function mergeBillsLists(primaryList = [], secondaryList = []) {
  const map = new Map();

  // Add primary list first
  primaryList.forEach(b => {
    if (b && b.id) map.set(b.id, { ...b });
  });

  // Merge secondary list
  secondaryList.forEach(b => {
    if (!b || !b.id) return;
    if (!map.has(b.id)) {
      map.set(b.id, { ...b });
    } else {
      const existing = map.get(b.id);
      const existingTime = existing.updatedAt || existing.createdAt || 0;
      const incomingTime = b.updatedAt || b.createdAt || 0;
      if (incomingTime >= existingTime) {
        map.set(b.id, { ...existing, ...b });
      }
    }
  });

  const merged = Array.from(map.values());
  merged.sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));
  return merged;
}

/**
 * Load user bills: Queries Firestore subcollection `users/{uid}/bills`,
 * merges local cache with cloud records, keeps PC and Mobile in sync,
 * and uploads any pending offline local bills.
 */
async function loadUserBills() {
  const local = getLocalBills();
  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";
  if (isGuest) {
    updateProfileTotalSettled(local);
    updateCloudSyncBadge('demo');
    return local;
  }

  updateCloudSyncBadge('syncing');

  try {
    await firebaseInitPromise;
    const user = (await getAuthenticatedFirebaseUser()) || getCurrentUser();

    if (user && user.uid && !user.isGuest) {
      let cloudBills = [];

      // 1. Fetch from Firestore subcollection `users/{uid}/bills`
      if (db) {
        try {
          const snapshot = await db.collection("users").doc(user.uid).collection("bills").get();
          snapshot.forEach(doc => {
            const data = doc.data();
            if (data) {
              cloudBills.push({ id: doc.id, ...data });
            }
          });
          console.log(`[Firestore] Loaded ${cloudBills.length} bills from users/${user.uid}/bills`);
        } catch (subErr) {
          console.warn("[Firestore] Subcollection fetch note:", subErr.message);
        }

        // Fallback: check legacy bundle users/{uid}/bills/data if subcollection was empty
        if (cloudBills.length === 0) {
          try {
            const legacyDoc = await db.collection("users").doc(user.uid).collection("bills").doc("data").get();
            if (legacyDoc.exists && Array.isArray(legacyDoc.data()?.list)) {
              cloudBills = legacyDoc.data().list;
            }
          } catch (legErr) {}
        }
      }

      // 2. Dual-channel fallback: Fetch from server sync if cloudBills is empty
      if (cloudBills.length === 0) {
        try {
          const srvRes = await fetch(`/api/sync-bills?userId=${encodeURIComponent(user.uid)}`);
          if (srvRes.ok) {
            const srvData = await srvRes.json();
            if (Array.isArray(srvData.bills) && srvData.bills.length > 0) {
              cloudBills = srvData.bills;
            }
          }
        } catch (srvErr) {}
      }

      // 3. Merge Cloud + Local bills
      const merged = mergeBillsLists(cloudBills, local);
      setLocalBills(merged);
      updateProfileTotalSettled(merged);
      updateCloudSyncBadge('synced');

      // 4. If there were local bills missing from cloud, upload them to cloud
      if (db && local.length > 0) {
        const missingFromCloud = local.filter(l => !cloudBills.some(c => c.id === l.id));
        for (const mb of missingFromCloud) {
          try {
            await db.collection("users").doc(user.uid).collection("bills").doc(mb.id).set({
              ...mb,
              userId: user.uid,
              userEmail: user.email || ""
            }, { merge: true });
          } catch (upErr) {}
        }
      }

      return merged;
    }
  } catch (outerErr) {
    console.warn("[CloudSync] Load error, preserving local bills:", outerErr);
    updateCloudSyncBadge('offline');
  }

  updateProfileTotalSettled(local);
  return local;
}

/**
 * Save a new bill or update an existing bill in Cloud (Firestore) and Local Cache.
 * Stores cleanly in `users/{uid}/bills/{bill.id}`.
 */
async function saveBillRecord(bill) {
  if (!bill || !bill.id) return;

  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";

  // 1. Update local cache immediately for instant, lag-free UI
  const localBills = getLocalBills();
  const index = localBills.findIndex(b => b.id === bill.id);
  if (index >= 0) {
    localBills[index] = { ...localBills[index], ...bill, updatedAt: Date.now() };
  } else {
    localBills.unshift({ ...bill, updatedAt: Date.now(), createdAt: bill.createdAt || Date.now() });
  }
  setLocalBills(localBills);
  updateProfileTotalSettled(localBills);

  if (isGuest) {
    updateCloudSyncBadge('demo');
    return;
  }

  // 2. Persist to Firebase Firestore
  updateCloudSyncBadge('syncing');
  try {
    await firebaseInitPromise;
    if (!db && typeof firebase !== 'undefined' && firebase.firestore) {
      db = firebase.firestore();
    }
    const user = (await getAuthenticatedFirebaseUser()) || getCurrentUser();
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

    // Save individual document in users/{uid}/bills/{bill.id}
    if (db && uid !== 'guest_demo_user') {
      try {
        await db.collection("users").doc(uid).collection("bills").doc(bill.id).set(cleanBill, { merge: true });
        console.log(`[Firestore] Successfully saved bill ${bill.id} to users/${uid}/bills`);
      } catch (fErr) {
        console.warn("[Firestore] Subcollection doc write error:", fErr);
      }

      // Also update user summary metadata
      try {
        await db.collection("users").doc(uid).set({
          lastUpdated: Date.now(),
          email: email,
          displayName: user?.displayName || ""
        }, { merge: true });
      } catch (uErr) {}
    }

    // Backup REST Sync
    try {
      fetch('/api/sync-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, bill: cleanBill })
      }).catch(() => {});
    } catch (e) {}

    updateCloudSyncBadge('synced');
  } catch (err) {
    console.warn("[Firestore] Save failed, stored locally:", err);
    updateCloudSyncBadge('offline');
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

  if (isGuest) return;

  // 2. Delete from Firebase Firestore
  try {
    const user = (await getAuthenticatedFirebaseUser()) || getCurrentUser();
    if (user && user.uid && db) {
      try {
        await db.collection("users").doc(user.uid).collection("bills").doc(billId).delete();
        console.log(`[Firestore] Deleted bill ${billId} from users/${user.uid}/bills`);
      } catch (e) {
        console.warn("[Firestore] Doc delete error:", e);
      }
    }

    // Backup REST delete
    fetch(`/api/sync-bills?userId=${encodeURIComponent(user?.uid || '')}&billId=${encodeURIComponent(billId)}`, {
      method: 'DELETE'
    }).catch(() => {});
  } catch (err) {
    console.warn("[Firestore] Delete cloud error:", err);
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
    target.updatedAt = Date.now();
    setLocalBills(localBills);
    updateProfileTotalSettled(localBills);
  }

  if (isGuest) return;

  // 2. Update in Firestore
  try {
    const user = (await getAuthenticatedFirebaseUser()) || getCurrentUser();
    if (user && user.uid && db) {
      const cleanSettlements = JSON.parse(JSON.stringify(settlements));
      try {
        await db.collection("users").doc(user.uid).collection("bills").doc(billId).update({
          settlements: cleanSettlements,
          updatedAt: Date.now()
        });
        console.log(`[Firestore] Settlements updated for bill ${billId}`);
      } catch (e) {
        // If document doesn't exist, use saveBillRecord fallback
        if (target) saveBillRecord(target);
      }
    }
  } catch (err) {
    console.warn("[Firestore] Settlement update error:", err);
  }
}

/**
 * Real-time Firestore Multi-Device Listener
 * Listens for remote updates on Mobile / PC and notifies the UI immediately
 */
function subscribeToUserBills(callback) {
  if (typeof callback !== 'function') return () => {};

  const isGuest = sessionStorage.getItem("is_guest_session") === "true" || localStorage.getItem("is_guest_mode") === "true";
  if (isGuest) return () => {};

  let unsubscribeFirestore = null;

  firebaseInitPromise.then(async () => {
    const user = (await getAuthenticatedFirebaseUser()) || getCurrentUser();
    if (!user || !user.uid || user.isGuest || !db) return;

    try {
      unsubscribeFirestore = db.collection("users").doc(user.uid).collection("bills")
        .onSnapshot((snapshot) => {
          const cloudBills = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            if (data) cloudBills.push({ id: doc.id, ...data });
          });

          if (cloudBills.length > 0 || snapshot.empty) {
            const local = getLocalBills();
            const merged = mergeBillsLists(cloudBills, local);
            setLocalBills(merged);
            updateProfileTotalSettled(merged);
            updateCloudSyncBadge('synced');
            callback(merged);
          }
        }, (error) => {
          console.warn("[Firestore Snapshot] Notice:", error.message);
        });
    } catch (err) {
      console.warn("[Firestore Listener] Setup note:", err);
    }
  });

  return () => {
    if (typeof unsubscribeFirestore === 'function') {
      unsubscribeFirestore();
    }
  };
}
