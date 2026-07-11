// History Workspace controller logic
const state = {
  currentUser: null,
  history: [],
  firebaseInitialized: false
};

const elements = {
  userDisplayName: document.getElementById('dropdown-user-name'),
  totalSpentEl: document.getElementById('total-spent-amount'),
  
  // Columns lists
  listRestaurant: document.getElementById('list-restaurant'),
  listHotel: document.getElementById('list-hotel'),
  listMovie: document.getElementById('list-movie'),
  listGrocery: document.getElementById('list-grocery'),
  
  // Badges
  badgeRestaurant: document.getElementById('badge-restaurant'),
  badgeHotel: document.getElementById('badge-hotel'),
  badgeMovie: document.getElementById('badge-movie'),
  badgeGrocery: document.getElementById('badge-grocery'),
  
  // Loader
  loadingOverlay: document.getElementById('loading-overlay'),
  loaderText: document.getElementById('loader-text'),
  
  // Modal Elements
  detailsModal: document.getElementById('details-modal'),
  modalRestaurant: document.getElementById('modal-restaurant'),
  modalDate: document.getElementById('modal-date'),
  modalImg: document.getElementById('modal-img'),
  modalTax: document.getElementById('modal-tax'),
  modalTip: document.getElementById('modal-tip'),
  modalTotal: document.getElementById('modal-total'),
  modalSplitsList: document.getElementById('modal-splits-list'),
  modalEditBtn: document.getElementById('modal-edit-btn'),
  profileModal: document.getElementById('profile-modal')
};

document.addEventListener('DOMContentLoaded', () => {
  fetchGoogleConfig().then(() => {
    checkSession();
  });
});

// Authentication session checker
async function checkSession() {
  showLoader('Loading Split directory...');
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      state.currentUser = user;
      elements.userDisplayName.textContent = user.name;
      updateUserAvatar(user.name);
      loadProfileData();
      
      // Load directory history lists
      await fetchHistory();
    } else {
      // Redirect to main login page if unauthenticated
      window.location.href = '/index.html';
    }
  } catch (err) {
    console.error('Session verification error:', err);
    window.location.href = '/index.html';
  } finally {
    hideLoader();
  }
}

// Fetch database history
async function fetchHistory() {
  try {
    const res = await fetch('/api/history');
    if (res.ok) {
      state.history = await res.json();
      renderHistoryDirectory();
    }
  } catch (err) {
    console.error('Failed to load history list:', err);
  }
}

// Format date securely
function formatDateSafe(dateStr) {
  if (!dateStr || dateStr.toLowerCase() === 'unavailable' || dateStr.toLowerCase() === 'unknown') {
    return 'Unavailable';
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return 'Unavailable';
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatModalDateSafe(dateStr) {
  if (!dateStr || dateStr.toLowerCase() === 'unavailable' || dateStr.toLowerCase() === 'unknown') {
    return 'Date: Unavailable';
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return 'Date: Unavailable';
  }
  return 'Date: ' + d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Render categorized directories
function renderHistoryDirectory() {
  // Calculate total amount spent
  const totalSpent = state.history.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
  elements.totalSpentEl.textContent = `₹${totalSpent.toFixed(2)}`;
  
  // Group details
  const groups = {
    'Restaurant Bill': [],
    'Hotel Bill': [],
    'Movie Bill': [],
    'Grocery Bill': []
  };
  
  state.history.forEach(entry => {
    const category = entry.splitType || 'Restaurant Bill';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(entry);
  });
  
  // Update counts
  elements.badgeRestaurant.textContent = groups['Restaurant Bill'].length;
  elements.badgeHotel.textContent = groups['Hotel Bill'].length;
  elements.badgeMovie.textContent = groups['Movie Bill'].length;
  elements.badgeGrocery.textContent = groups['Grocery Bill'].length;
  
  // Render Restaurant Column
  populateColumnList(elements.listRestaurant, groups['Restaurant Bill'], 'No Restaurant bills found');
  populateColumnList(elements.listHotel, groups['Hotel Bill'], 'No Hotel bills found');
  populateColumnList(elements.listMovie, groups['Movie Bill'], 'No Movie bills found');
  populateColumnList(elements.listGrocery, groups['Grocery Bill'], 'No Grocery bills found');
}

// Populate individual columns
function populateColumnList(containerEl, bills, emptyMsg) {
  containerEl.innerHTML = '';
  
  if (bills.length === 0) {
    containerEl.innerHTML = `<p class="empty-col-text">${emptyMsg}</p>`;
    return;
  }
  
  bills.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'history-item-card';
    card.style.margin = '0'; // align within spacing constraints
    card.onclick = () => showHistoryDetails(entry.id);
    
    const formattedDate = formatDateSafe(entry.date);
    
    card.innerHTML = `
      <div class="history-item-top">
        <span class="history-restaurant" title="${escapeHtml(entry.restaurantName)}" style="max-width: 170px;">${escapeHtml(entry.restaurantName)}</span>
        <span class="history-total">₹${entry.total.toFixed(2)}</span>
      </div>
      <div class="history-item-bottom">
        <span>${formattedDate}</span>
        <span>${entry.people.length} people</span>
      </div>
    `;
    containerEl.appendChild(card);
  });
}

// History split detail display
function showHistoryDetails(id) {
  const entry = state.history.find(h => h.id === id);
  if (!entry) return;
  
  elements.modalRestaurant.textContent = entry.restaurantName;
  elements.modalDate.textContent = formatModalDateSafe(entry.date);
  
  const modalCategory = document.getElementById('modal-category');
  if (modalCategory) {
    const categoryMetadata = {
      'Restaurant Bill': 'Restaurant Bill',
      'Hotel Bill': 'Hotel Bill',
      'Movie Bill': 'Movie Bill',
      'Grocery Bill': 'Grocery Bill'
    };
    modalCategory.textContent = categoryMetadata[entry.splitType] || entry.splitType || 'Restaurant Bill';
  }
  
  if (elements.modalImg) {
    const storedImg = localStorage.getItem(`bill_img_${entry.id}`);
    elements.modalImg.src = storedImg || entry.imagePath || 'placeholder.jpg';
  }
  
  elements.modalTax.textContent = `₹${entry.tax.toFixed(2)}`;
  elements.modalTip.textContent = `₹${entry.tip.toFixed(2)}`;
  elements.modalTotal.textContent = `₹${entry.total.toFixed(2)}`;
  
  elements.modalSplitsList.innerHTML = '';
  entry.splits.forEach(s => {
    const row = document.createElement('div');
    row.className = 'modal-split-item';
    row.innerHTML = `
      <div class="modal-split-name">${escapeHtml(s.name)}</div>
      <div class="modal-split-total">₹${s.total.toFixed(2)}</div>
    `;
    elements.modalSplitsList.appendChild(row);
  });
  
  // Workspace transition redirect bridge
  elements.modalEditBtn.onclick = () => {
    localStorage.setItem('edit_bill_on_load', entry.id);
    window.location.href = '/index.html';
  };
  
  elements.detailsModal.classList.remove('hidden');
}

function closeDetailsModal() {
  elements.detailsModal.classList.add('hidden');
}

// Loader UI helpers
function showLoader(text) {
  elements.loaderText.textContent = text || 'Loading...';
  elements.loadingOverlay.classList.remove('hidden');
}

function hideLoader() {
  elements.loadingOverlay.classList.add('hidden');
}

// HTML escaping helper
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function updateUserAvatar(name) {
  const avatarEl = document.getElementById('user-avatar-circle');
  if (!avatarEl) return;
  
  const firstLetter = name ? name.trim().charAt(0).toUpperCase() : 'U';
  
  let hash = 0;
  const nameStr = name || 'User';
  for (let i = 0; i < nameStr.length; i++) {
    hash = nameStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#7f00ff', // Indigo
    '#ff007f', // Pink
    '#00f2fe', // Cyan
    '#00ff87', // Neon Green
    '#ec4899', // Rosy
    '#f59e0b', // Amber
    '#3b82f6', // Blue
    '#8b5cf6'  // Purple
  ];
  const color = colors[Math.abs(hash) % colors.length];
  
  avatarEl.textContent = firstLetter;
  avatarEl.style.background = color;
  
  if (color === '#00f2fe' || color === '#00ff87') {
    avatarEl.style.color = '#05060f';
  } else {
    avatarEl.style.color = '#ffffff';
  }
}

async function fetchGoogleConfig() {
  try {
    const res = await fetch('/api/auth/config');
    if (res.ok) {
      const data = await res.json();
      if (data.firebaseConfig && data.firebaseConfig.apiKey) {
        firebase.initializeApp(data.firebaseConfig);
        state.firebaseInitialized = true;
        console.log('Firebase initialized successfully on client.');
        
        firebase.auth().onAuthStateChanged((user) => {
          if (user) {
            loadProfileData();
          }
        });
      } else {
        console.warn('Firebase configuration missing from config endpoint.');
      }
    }
  } catch (err) {
    console.error('Error fetching config:', err);
  }
}

async function triggerGoogleLink() {
  const currentUser = firebase.auth().currentUser;
  if (!currentUser) {
    alert('No user is logged in via Firebase client.');
    return;
  }
  showLoader('Linking Google account...');
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await currentUser.linkWithPopup(provider);
    const idToken = await result.user.getIdToken();
    await handleFirebaseLinkBackend(idToken);
  } catch (err) {
    console.error('Link Google error:', err);
    alert('Linking failed: ' + (err.message || 'Unknown error'));
  } finally {
    hideLoader();
  }
}

async function handleFirebaseLinkBackend(idToken) {
  try {
    const res = await fetch('/api/auth/link-google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Google account linked successfully! 🎉');
      await loadProfileData();
    } else {
      alert('Linking failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Connection error linking Google account.');
  }
}

async function loadProfileData() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      
      const dropdownName = document.getElementById('dropdown-user-name');
      const dropdownEmail = document.getElementById('dropdown-user-email');
      const dropdownSpent = document.getElementById('dropdown-spent-amount');
      
      if (dropdownName) dropdownName.textContent = user.name;
      if (dropdownEmail) dropdownEmail.textContent = user.email;
      
      const linkStatusContainer = document.getElementById('google-link-status-container');
      const linkBtn = document.getElementById('google-link-btn');
      
      const firebaseUser = firebase.auth().currentUser;
      const isLinkedWithGoogle = firebaseUser && firebaseUser.providerData.some(p => p.providerId === 'google.com');
      
      if (isLinkedWithGoogle) {
        const googleProvider = firebaseUser.providerData.find(p => p.providerId === 'google.com');
        const googleEmail = googleProvider ? googleProvider.email : (user.googleEmail || user.email);
        if (linkStatusContainer) {
          linkStatusContainer.className = '';
          linkStatusContainer.style.color = '#00ff87'; // Vibrant neon green
          linkStatusContainer.innerHTML = `Linked with Google (${escapeHtml(googleEmail)}) ✅`;
        }
        if (linkBtn) linkBtn.classList.add('hidden');
      } else {
        if (linkStatusContainer) {
          linkStatusContainer.className = '';
          linkStatusContainer.style.color = '#ff6b6b'; // Coral red
          linkStatusContainer.innerHTML = 'Not Linked ❌';
        }
        if (linkBtn) linkBtn.classList.remove('hidden');
      }
      
      const totalSpent = state.history.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
      if (dropdownSpent) dropdownSpent.textContent = `₹${totalSpent.toFixed(2)}`;
    }
  } catch (err) {
    console.error('Failed to load profile details:', err);
  }
}

async function handleDeleteAccount() {
  const confirmFirst = confirm("ARE YOU ABSOLUTELY SURE?\n\nThis will permanently delete your profile, all receipt scans, expense splits, and credentials. This action CANNOT be undone.");
  if (!confirmFirst) return;
  
  const confirmSecond = confirm("LAST WARNING!\n\nAll your data will be permanently wiped from both authentication and database systems. Confirm deletion?");
  if (!confirmSecond) return;
  
  showLoader('Deleting your account...');
  try {
    const res = await fetch('/api/auth/delete-account', {
      method: 'DELETE'
    });
    
    if (res.ok) {
      if (state.firebaseInitialized) {
        try {
          await firebase.auth().signOut();
        } catch (firebaseErr) {
          console.warn('Firebase signout during deletion bypassed:', firebaseErr);
        }
      }
      hideLoader();
      alert('Your account and all associated data have been permanently deleted.');
      window.location.href = '/index.html';
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete account.');
    }
  } catch (err) {
    console.error('Account deletion error:', err);
    alert(err.message || 'An error occurred during account deletion.');
    hideLoader();
  }
}

async function handleLogout() {
  showLoader('Signing out...');
  try {
    if (state.firebaseInitialized) {
      await firebase.auth().signOut();
    }
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // Fail silently
  } finally {
    hideLoader();
    window.location.href = '/index.html';
  }
}
