// History Workspace controller logic
const state = {
  currentUser: null,
  history: []
};

const elements = {
  userDisplayName: document.getElementById('user-display-name'),
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
  modalEditBtn: document.getElementById('modal-edit-btn')
};

document.addEventListener('DOMContentLoaded', () => {
  // Check user session first
  checkSession();
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
