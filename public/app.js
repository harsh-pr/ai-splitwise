/* ==========================================================================
   Splitwise AI - Frontend Application Core
   Single Page Application Architecture
   ========================================================================== */

// Global Application State
const state = {
  currentUser: null,
  currentBill: null,       // Current active bill object (extracted or manual)
  currentBillImageBase64: null, // Temporary store for the uploaded/previewed image in base64
  members: [],             // Names of people sharing the bill
  assignments: {},         // { [itemName]: string[] } -> maps items to people who consumed them
  splits: [],              // Calculated splits per person
  history: [],             // User's bill scan history list (max 10)
  geminiApiKey: '',
  firebaseInitialized: false
};

// UI Section Elements
const elements = {
  authSection: document.getElementById('auth-section'),
  workspaceSection: document.getElementById('workspace-section'),
  userDisplayName: document.getElementById('dropdown-user-name'),
  authErrorMsg: document.getElementById('auth-error-msg'),
  loginForm: document.getElementById('login-form'),
  signupForm: document.getElementById('signup-form'),
  tabLoginBtn: document.getElementById('tab-login-btn'),
  tabSignupBtn: document.getElementById('tab-signup-btn'),
  
  // Loading Overlay
  loadingOverlay: document.getElementById('loading-overlay'),
  loaderText: document.getElementById('loader-text'),
  
  // Sidebar History
  historyList: document.getElementById('history-list'),
  
  // Wizard Wizard Steps
  steps: [
    document.getElementById('wizard-step-1'),
    document.getElementById('wizard-step-2'),
    document.getElementById('wizard-step-3'),
    document.getElementById('wizard-step-4'),
    document.getElementById('wizard-step-5'),
    document.getElementById('wizard-step-6')
  ],
  stepIndicators: [
    document.getElementById('step-nav-1'),
    document.getElementById('step-nav-2'),
    document.getElementById('step-nav-3'),
    document.getElementById('step-nav-4'),
    document.getElementById('step-nav-5'),
    document.getElementById('step-nav-6')
  ],

  // Step 2: Upload
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  uploadPreviewContainer: document.getElementById('upload-preview-container'),
  uploadPreview: document.getElementById('upload-preview'),
  proceedUploadBtn: document.getElementById('proceed-upload-btn'),

  // Step 3: Review
  reviewRestaurant: document.getElementById('review-restaurant'),
  reviewDate: document.getElementById('review-date'),
  extractedItemsList: document.getElementById('extracted-items-list'),
  reviewTax: document.getElementById('review-tax'),
  reviewTip: document.getElementById('review-tip'),
  reviewTotal: document.getElementById('review-total'),

  // Step 4: Members
  memberNameInput: document.getElementById('member-name-input'),
  membersListTags: document.getElementById('members-list-tags'),
  memberCount: document.getElementById('member-count'),
  membersNextBtn: document.getElementById('members-next-btn'),

  // Step 5: Split Board
  splitItemsAssignmentList: document.getElementById('split-items-assignment-list'),

  // Step 6: Calculations
  splitResultsCards: document.getElementById('split-results-cards'),
  resSubtotal: document.getElementById('res-subtotal'),
  resTax: document.getElementById('res-tax'),
  resTip: document.getElementById('res-tip'),
  resTotal: document.getElementById('res-total'),

  // Details Modal
  detailsModal: document.getElementById('details-modal'),
  modalRestaurant: document.getElementById('modal-restaurant'),
  modalDate: document.getElementById('modal-date'),
  modalImg: document.getElementById('modal-img'),
  modalSplitsList: document.getElementById('modal-splits-list'),
  modalTax: document.getElementById('modal-tax'),
  modalTip: document.getElementById('modal-tip'),
  modalTotal: document.getElementById('modal-total'),
  modalEditBtn: document.getElementById('modal-edit-btn')
};

// --------------------------------------------------------------------------
// Initialization & Authentication Logic
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Setup Upload Dropzone Event Listeners
  setupDropzone();
  
  // Track 2-minute tab-close session logout
  initTabCloseLogoutTracker();
  
  // Initialize hover + click user dropdown menu
  initUserDropdownMenu();
  
  // Fetch Google Client config
  fetchGoogleConfig();
  
  // Check for session cookie
  checkSession();
});

// Secure 2-minute tab-close session tracker
function initTabCloseLogoutTracker() {
  const lastActive = localStorage.getItem('last_active_heartbeat');
  const now = Date.now();
  
  if (lastActive) {
    const elapsed = now - parseInt(lastActive, 10);
    if (elapsed > 120000) { // 2 minutes
      console.log('Session was closed for more than 2 minutes. Logging out.');
      localStorage.removeItem('last_active_heartbeat');
      handleLogoutQuietly();
      return;
    }
  }
  
  // Update heartbeat immediately
  localStorage.setItem('last_active_heartbeat', Date.now().toString());
  
  // Continuously update heartbeat every 5 seconds
  setInterval(() => {
    localStorage.setItem('last_active_heartbeat', Date.now().toString());
  }, 5000);
}

function initUserDropdownMenu() {
  const container = document.querySelector('.user-menu-container');
  const trigger = document.querySelector('.user-menu-trigger');
  
  if (!container || !trigger) return;
  
  trigger.addEventListener('click', (e) => {
    e.stopPropagation(); // Avoid triggering document click close handler
    container.classList.toggle('active');
  });
  
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      container.classList.remove('active');
    }
  });

  // Also close menu when clicking inside links
  const dropdownItems = container.querySelectorAll('.dropdown-item');
  dropdownItems.forEach(item => {
    item.addEventListener('click', () => {
      container.classList.remove('active');
    });
  });
}

async function handleLogoutQuietly() {
  try {
    if (state.firebaseInitialized) {
      await firebase.auth().signOut();
    }
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // Fail silently
  } finally {
    showAuthSection();
  }
}

// Check if user has active session
async function checkSession() {
  showLoader('Checking user authentication...');
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      onLoginSuccess(user);
    } else {
      showAuthSection();
    }
  } catch (err) {
    showAuthSection();
  } finally {
    hideLoader();
  }
}

function showAuthSection() {
  state.currentUser = null;
  elements.authSection.classList.remove('hidden');
  elements.workspaceSection.classList.add('hidden');
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

function onLoginSuccess(user) {
  state.currentUser = user;
  elements.userDisplayName.textContent = user.name;
  updateUserAvatar(user.name);
  elements.authSection.classList.add('hidden');
  elements.workspaceSection.classList.remove('hidden');
  
  // Load profile variables into dropdown menu
  loadProfileData();
  
  // Fetch split scans history
  fetchHistory();
  
  // Default to step 1
  goToStep(1);
}

// Switch between Login and Signup tabs
function switchAuthTab(tab) {
  elements.authErrorMsg.classList.add('hidden');
  if (tab === 'login') {
    elements.tabLoginBtn.classList.add('active');
    elements.tabSignupBtn.classList.remove('active');
    elements.loginForm.classList.remove('hidden');
    elements.signupForm.classList.add('hidden');
  } else {
    elements.tabLoginBtn.classList.remove('active');
    elements.tabSignupBtn.classList.add('active');
    elements.loginForm.classList.add('hidden');
    elements.signupForm.classList.remove('hidden');
  }
}

// Email & Password Authentication handlers
async function handleEmailLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  showLoader('Signing in...');
  elements.authErrorMsg.classList.add('hidden');
  
  try {
    if (!state.firebaseInitialized) {
      throw new Error('Firebase Auth is not initialized. Please verify backend configurations.');
    }
    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    const idToken = await userCredential.user.getIdToken();
    await handleFirebaseLoginBackend(idToken);
  } catch (err) {
    console.error('Login error:', err);
    showAuthError(err.message || 'Login failed. Please check credentials.');
  } finally {
    hideLoader();
  }
}

async function handleEmailSignup(e) {
  e.preventDefault();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  
  showLoader('Creating account...');
  elements.authErrorMsg.classList.add('hidden');
  
  try {
    if (!state.firebaseInitialized) {
      throw new Error('Firebase Auth is not initialized. Please verify backend configurations.');
    }
    
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    if (name) {
      await userCredential.user.updateProfile({ displayName: name });
    }
    const idToken = await userCredential.user.getIdToken();
    await handleFirebaseLoginBackend(idToken);
  } catch (err) {
    console.error('Signup error:', err);
    showAuthError(err.message || 'Signup failed. Email may already be in use.');
  } finally {
    hideLoader();
  }
}

async function handleFirebaseLoginBackend(idToken) {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  const data = await res.json();
  if (res.ok) {
    onLoginSuccess(data);
  } else {
    throw new Error(data.error || 'Authentication verification failed.');
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const emailInput = document.getElementById('login-email');
  const email = emailInput.value.trim();
  if (!email) {
    showAuthError('Please enter your email address in the field above first.');
    emailInput.focus();
    return;
  }
  
  showLoader('Sending password reset...');
  try {
    if (!state.firebaseInitialized) {
      throw new Error('Firebase Auth is not initialized.');
    }
    await firebase.auth().sendPasswordResetEmail(email);
    alert('Password reset email sent! Please check your inbox. 📧');
  } catch (err) {
    console.error('Password reset error:', err);
    showAuthError(err.message || 'Failed to send password reset email.');
  } finally {
    hideLoader();
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
      // Also sign out from client-side Firebase Auth
      if (state.firebaseInitialized) {
        try {
          await firebase.auth().signOut();
        } catch (firebaseErr) {
          console.warn('Firebase signout during deletion bypassed:', firebaseErr);
        }
      }
      hideLoader();
      alert('Your account and all associated data have been permanently deleted.');
      closeProfileModal();
      showAuthSection();
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
    showAuthSection();
  }
}

function showAuthError(msg) {
  elements.authErrorMsg.textContent = msg;
  elements.authErrorMsg.classList.remove('hidden');
}



// --------------------------------------------------------------------------
// History Database Logic
// --------------------------------------------------------------------------
async function fetchHistory() {
  try {
    const res = await fetch('/api/history');
    if (res.ok) {
      state.history = await res.json();
      renderHistorySidebar();
      
      // Check if we need to load a bill for editing from history page redirect
      const editId = localStorage.getItem('edit_bill_on_load');
      if (editId) {
        localStorage.removeItem('edit_bill_on_load');
        const entry = state.history.find(h => h.id === editId);
        if (entry) {
          loadBillForEditing(entry);
        }
      }
    }
  } catch (err) {
    console.error('Error fetching history:', err);
  }
}

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

function renderHistorySidebar() {
  // Update total spent amount
  const totalSpent = state.history.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
  const totalSpentEl = document.getElementById('total-spent-amount') || document.getElementById('dropdown-spent-amount');
  if (totalSpentEl) {
    totalSpentEl.textContent = `₹${totalSpent.toFixed(2)}`;
  }

  if (!elements.historyList) return;
  elements.historyList.innerHTML = '';
  if (state.history.length === 0) {
    elements.historyList.innerHTML = '<p class="empty-text">No scans yet. Start splitting!</p>';
    return;
  }
  
  // Group history entries
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
  
  const categoryMetadata = {
    'Restaurant Bill': { title: 'Restaurant Bills', icon: '🍽️' },
    'Hotel Bill': { title: 'Hotel Bills', icon: '🏨' },
    'Movie Bill': { title: 'Movie Bills', icon: '🎬' },
    'Grocery Bill': { title: 'Grocery Bills', icon: '🛒' }
  };
  
  Object.entries(groups).forEach(([category, bills]) => {
    const meta = categoryMetadata[category] || { title: category, icon: '📁' };
    const count = bills.length;
    
    const accordion = document.createElement('div');
    accordion.className = 'history-accordion';
    
    // Accordion Header
    const header = document.createElement('div');
    header.className = `accordion-header ${count > 0 ? '' : 'disabled'}`;
    
    const isOpenKey = `accordion_open_${category}`;
    const isExpanded = localStorage.getItem(isOpenKey) !== 'false'; // default to open if not set
    
    header.innerHTML = `
      <span class="accordion-title">${meta.icon} ${meta.title}</span>
      <div class="accordion-header-right">
        <span class="badge count-badge">${count}</span>
        <span class="chevron-icon">${isExpanded && count > 0 ? '▼' : '▶'}</span>
      </div>
    `;
    
    const body = document.createElement('div');
    body.className = `accordion-body ${isExpanded && count > 0 ? '' : 'collapsed'}`;
    
    if (count === 0) {
      body.innerHTML = '<p class="empty-category-text">No bills in this category</p>';
    } else {
      bills.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'history-item-card';
        card.onclick = () => showHistoryDetails(entry.id);
        
        const formattedDate = formatDateSafe(entry.date);
        
        card.innerHTML = `
          <div class="history-item-top">
            <span class="history-restaurant" title="${entry.restaurantName}">${entry.restaurantName}</span>
            <span class="history-total">₹${entry.total.toFixed(2)}</span>
          </div>
          <div class="history-item-bottom">
            <span>${formattedDate}</span>
            <span>${entry.people.length} people</span>
          </div>
        `;
        body.appendChild(card);
      });
    }
    
    header.onclick = () => {
      if (count === 0) return;
      const currentlyCollapsed = body.classList.toggle('collapsed');
      header.querySelector('.chevron-icon').textContent = currentlyCollapsed ? '▶' : '▼';
      localStorage.setItem(isOpenKey, !currentlyCollapsed);
    };
    
    accordion.appendChild(header);
    accordion.appendChild(body);
    elements.historyList.appendChild(accordion);
  });
}

// --------------------------------------------------------------------------
// Wizard Flow Orchestration
// --------------------------------------------------------------------------
let activeStep = 1;

function toggleMobileSidebar(show) {
  const sidebar = document.getElementById('history-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  
  if (show) {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.remove('hidden');
  } else {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.add('hidden');
  }
}

function goToStep(stepIndex) {
  activeStep = stepIndex;
  
  // Close mobile drawer on step navigation
  toggleMobileSidebar(false);
  
  // Update wizard progress line
  const progressLine = document.getElementById('wizard-progress-bar');
  if (progressLine) {
    const progressWidth = ((stepIndex - 1) / 5) * 100;
    progressLine.style.width = `${progressWidth}%`;
  }
  
  // Toggle Visibility of Step panels
  elements.steps.forEach((step, idx) => {
    if (idx + 1 === stepIndex) {
      step.classList.remove('hidden');
    } else {
      step.classList.add('hidden');
    }
  });

  // Highlight circular step indicators
  elements.stepIndicators.forEach((ind, idx) => {
    const stepNum = idx + 1;
    if (stepNum < stepIndex) {
      ind.classList.remove('active');
      ind.classList.add('completed');
    } else if (stepNum === stepIndex) {
      ind.classList.add('active');
      ind.classList.remove('completed');
    } else {
      ind.classList.remove('active');
      ind.classList.remove('completed');
    }
  });
  
  // Custom hooks per step transition
  if (stepIndex === 4) {
    renderMembersList();
    elements.memberNameInput.focus();
  }
  if (stepIndex === 5) {
    renderSplitBoard();
  }
}

// --------------------------------------------------------------------------
// Step 2: Upload Actions & Listeners
// --------------------------------------------------------------------------
let selectedFile = null;

function setupDropzone() {
  const dropzone = elements.dropzone;
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });
  
  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      setUploadedFile(files[0]);
    }
  }, false);
}

function triggerFileInput() {
  elements.fileInput.click();
}

function triggerCameraInput() {
  const camInput = document.getElementById('camera-input');
  if (camInput) {
    camInput.click();
  }
}

function selectSplitTemplate(type) {
  state.selectedTemplate = type;
  goToStep(2);
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    setUploadedFile(files[0]);
  }
}

function setUploadedFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file (JPG, PNG, WebP).');
    return;
  }
  
  selectedFile = file;
  
  // Show image preview
  const reader = new FileReader();
  reader.onload = (e) => {
    state.currentBillImageBase64 = e.target.result;
    elements.uploadPreview.src = e.target.result;
    
    // Hide upload dropzone and camera containers
    elements.dropzone.classList.add('hidden');
    const mobCam = document.querySelector('.mobile-camera-container');
    if (mobCam) {
      mobCam.classList.add('hidden');
    }
    
    elements.uploadPreviewContainer.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function resetUpload() {
  selectedFile = null;
  state.currentBillImageBase64 = null;
  elements.fileInput.value = '';
  const camInput = document.getElementById('camera-input');
  if (camInput) {
    camInput.value = '';
  }
  elements.uploadPreview.src = '#';
  
  // Show upload dropzone and camera containers
  elements.dropzone.classList.remove('hidden');
  const mobCam = document.querySelector('.mobile-camera-container');
  if (mobCam) {
    mobCam.classList.remove('hidden');
  }
  
  elements.uploadPreviewContainer.classList.add('hidden');
}

// Upload file to Express API for Gemini AI parsing
async function uploadAndAnalyze() {
  if (!selectedFile) return;
  
  showLoader('Uploading and scanning receipt details via AI...');
  
  const formData = new FormData();
  formData.append('billImage', selectedFile);
  
  // Add Gemini API key if present
  if (state.geminiApiKey) {
    formData.append('geminiApiKey', state.geminiApiKey);
  }
  
  try {
    const res = await fetch('/api/analyze-bill', {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    
    if (res.ok) {
      state.currentBill = data;
      state.currentBill.splitType = state.selectedTemplate || 'Restaurant Bill';
      
      // Notify if fallback Mock was used
      if (data.isMock) {
        let msg = 'Receipt analyzed successfully.';
        if (data.error) {
          msg = `Notice: Local receipt parsing was triggered.\n\nDetails: ${data.error}`;
        }
        alert(msg);
      }
      
      // Load values into Review UI
      elements.reviewRestaurant.value = data.restaurantName;
      elements.reviewDate.value = data.date;
      elements.reviewTax.value = data.tax.toFixed(2);
      elements.reviewTip.value = data.tip.toFixed(2);
      elements.reviewTotal.value = data.total.toFixed(2);
      
      const reviewCategory = document.getElementById('review-category');
      if (reviewCategory) {
        reviewCategory.value = state.currentBill.splitType;
      }
      
      renderItemsEditor();
      goToStep(3);
    } else {
      alert(data.error || 'Failed to analyze bill image.');
    }
  } catch (err) {
    alert('Network error. Failed to connect to server.');
    console.error(err);
  } finally {
    hideLoader();
  }
}

// --------------------------------------------------------------------------
// Step 3: Review & Edit Items
// --------------------------------------------------------------------------

function renderItemsEditor() {
  elements.extractedItemsList.innerHTML = '';
  
  if (!state.currentBill || !state.currentBill.items || state.currentBill.items.length === 0) {
    elements.extractedItemsList.innerHTML = '<p class="empty-text">No items found. Add items manually.</p>';
    return;
  }
  
  state.currentBill.items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'item-edit-row';
    row.innerHTML = `
      <input type="text" class="item-name-input" value="${escapeHtml(item.name)}" onchange="updateItemName(${index}, this.value)">
      <input type="number" step="0.01" class="item-price-input" value="${item.price.toFixed(2)}" onchange="updateItemPrice(${index}, this.value)">
      <button class="btn-remove-item" onclick="removeItem(${index})">&times;</button>
    `;
    elements.extractedItemsList.appendChild(row);
  });
}

function updateItemName(index, name) {
  if (state.currentBill && state.currentBill.items[index]) {
    state.currentBill.items[index].name = name.trim();
  }
}

function updateItemPrice(index, value) {
  const price = parseFloat(value) || 0;
  if (state.currentBill && state.currentBill.items[index]) {
    state.currentBill.items[index].price = price;
    recalculateReceiptTotal();
  }
}

function removeItem(index) {
  if (state.currentBill && state.currentBill.items) {
    state.currentBill.items.splice(index, 1);
    renderItemsEditor();
    recalculateReceiptTotal();
  }
}

function addCustomItem() {
  if (!state.currentBill) {
    state.currentBill = {
      restaurantName: 'New Restaurant',
      date: new Date().toISOString().split('T')[0],
      items: [],
      tax: 0,
      tip: 0,
      total: 0
    };
  }
  
  state.currentBill.items.push({
    name: 'New Item',
    price: 0.00
  });
  
  renderItemsEditor();
  
  // Focus name field of last row
  setTimeout(() => {
    const rows = elements.extractedItemsList.querySelectorAll('.item-edit-row');
    if (rows.length > 0) {
      rows[rows.length - 1].querySelector('.item-name-input').focus();
    }
  }, 50);
}

function recalculateReceiptTotal() {
  if (!state.currentBill) return;
  
  const tax = parseFloat(elements.reviewTax.value) || 0;
  const tip = parseFloat(elements.reviewTip.value) || 0;
  
  const subtotal = state.currentBill.items.reduce((sum, item) => sum + item.price, 0);
  const grandTotal = subtotal + tax + tip;
  
  state.currentBill.tax = tax;
  state.currentBill.tip = tip;
  state.currentBill.total = parseFloat(grandTotal.toFixed(2));
  
  elements.reviewTotal.value = state.currentBill.total.toFixed(2);
}

function proceedFromReview() {
  if (!state.currentBill || state.currentBill.items.length === 0) {
    alert('Please add at least one item to proceed.');
    return;
  }
  
  // Sync values
  state.currentBill.restaurantName = elements.reviewRestaurant.value.trim() || 'Unknown Restaurant';
  state.currentBill.date = elements.reviewDate.value.trim() || 'Unavailable';
  
  const reviewCategory = document.getElementById('review-category');
  if (reviewCategory) {
    state.currentBill.splitType = reviewCategory.value;
  } else {
    state.currentBill.splitType = 'Restaurant Bill';
  }
  
  recalculateReceiptTotal();
  
  goToStep(4);
}

// --------------------------------------------------------------------------
// Step 4: Add Members
// --------------------------------------------------------------------------

function handleMemberInputKeypress(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    addMemberFromInput();
  }
}

function addMemberFromInput() {
  const name = elements.memberNameInput.value.trim();
  if (!name) return;
  
  if (state.members.includes(name)) {
    alert('This member name has already been added.');
    return;
  }
  
  state.members.push(name);
  elements.memberNameInput.value = '';
  
  renderMembersList();
  elements.memberNameInput.focus();
}

function removeMember(name) {
  state.members = state.members.filter(m => m !== name);
  
  // Also clean up any split assignments for this person
  Object.keys(state.assignments).forEach(itemName => {
    state.assignments[itemName] = state.assignments[itemName].filter(m => m !== name);
  });
  
  renderMembersList();
}

function renderMembersList() {
  elements.membersListTags.innerHTML = '';
  
  if (state.members.length === 0) {
    elements.membersListTags.innerHTML = '<p class="placeholder-tag-text">No members added yet. Add at least one person.</p>';
    elements.memberCount.textContent = '0';
    elements.membersNextBtn.classList.add('disabled');
    return;
  }
  
  elements.memberCount.textContent = state.members.length;
  elements.membersNextBtn.classList.remove('disabled');
  
  state.members.forEach(name => {
    const tag = document.createElement('div');
    tag.className = 'member-tag';
    tag.innerHTML = `
      <span>${escapeHtml(name)}</span>
      <button class="member-tag-remove" onclick="removeMember('${escapeHtml(name)}')">&times;</button>
    `;
    elements.membersListTags.appendChild(tag);
  });
}

function proceedToSplitBoard() {
  if (state.members.length === 0) {
    alert('Please add at least one person to split the bill with.');
    return;
  }
  
  // Set default assignments if not already set (e.g. edit mode preserves assignments)
  state.currentBill.items.forEach(item => {
    if (!state.assignments[item.name] || state.assignments[item.name].length === 0) {
      // Default: Checkmark everyone for this item (very helpful UX default!)
      state.assignments[item.name] = [...state.members];
    } else {
      // Clean up assignments to filter out people who were deleted in step 4
      state.assignments[item.name] = state.assignments[item.name].filter(name => state.members.includes(name));
      // If filtering emptied it, default check everyone
      if (state.assignments[item.name].length === 0) {
        state.assignments[item.name] = [...state.members];
      }
    }
  });
  
  goToStep(5);
}

// --------------------------------------------------------------------------
// Step 5: Interactive Split Assigning
// --------------------------------------------------------------------------

function renderSplitBoard() {
  elements.splitItemsAssignmentList.innerHTML = '';
  
  state.currentBill.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'split-board-item-row';
    
    // Create assignment buttons for each user
    let userButtonsHtml = '';
    state.members.forEach(person => {
      const isAssigned = (state.assignments[item.name] && state.assignments[item.name].includes(person));
      const activeClass = isAssigned ? 'active' : '';
      userButtonsHtml += `
        <button class="assign-pill ${activeClass}" onclick="toggleItemAssignment('${escapeHtml(item.name)}', '${escapeHtml(person)}')">
          <span class="custom-checkbox ${isAssigned ? 'checked' : ''}"></span>
          <span class="assign-pill-name">${escapeHtml(person)}</span>
        </button>
      `;
    });
    
    row.innerHTML = `
      <div class="split-board-item-row-left">
        <div class="assignment-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="assignment-item-price">₹${item.price.toFixed(2)}</div>
      </div>
      <div class="assignment-members-buttons">
        ${userButtonsHtml}
      </div>
    `;
    elements.splitItemsAssignmentList.appendChild(row);
  });
}

function toggleItemAssignment(itemName, personName) {
  if (!state.assignments[itemName]) {
    state.assignments[itemName] = [];
  }
  
  const idx = state.assignments[itemName].indexOf(personName);
  if (idx > -1) {
    // If they are the only person checkmarked, prevent unchecking (at least one person must owe for an item)
    if (state.assignments[itemName].length === 1) {
      alert('At least one member must be assigned to each item.');
      return;
    }
    state.assignments[itemName].splice(idx, 1);
  } else {
    state.assignments[itemName].push(personName);
  }
  
  // Re-render board quickly
  renderSplitBoard();
}

// --------------------------------------------------------------------------
// Step 6: Calculations & Proportional Taxes
// --------------------------------------------------------------------------

function calculateAndPresentSplit() {
  const items = state.currentBill.items;
  const tax = state.currentBill.tax;
  const tip = state.currentBill.tip;
  const foodSubtotal = items.reduce((sum, item) => sum + item.price, 0);
  
  // Initialize calculations object for each person
  const personalCalculations = {};
  state.members.forEach(person => {
    personalCalculations[person] = {
      name: person,
      subtotal: 0,
      taxShare: 0,
      tipShare: 0,
      total: 0,
      items: [] // List of { itemName, price, fractionText }
    };
  });
  
  // Divide food items
  items.forEach(item => {
    const consumers = state.assignments[item.name] || [];
    
    // Safety check: if no one is selected, default to everyone
    const assignedConsumers = consumers.length > 0 ? consumers : state.members;
    const splitPriceShare = item.price / assignedConsumers.length;
    
    assignedConsumers.forEach(person => {
      if (personalCalculations[person]) {
        personalCalculations[person].subtotal += splitPriceShare;
        personalCalculations[person].items.push({
          name: item.name,
          price: splitPriceShare,
          fraction: assignedConsumers.length > 1 ? `(1/${assignedConsumers.length})` : ''
        });
      }
    });
  });
  
  // Proportional GST/tax and tip sharing
  const taxRatio = foodSubtotal > 0 ? (tax / foodSubtotal) : 0;
  const tipRatio = foodSubtotal > 0 ? (tip / foodSubtotal) : 0;
  
  let roundedTotalSum = 0;
  
  state.members.forEach(person => {
    const calc = personalCalculations[person];
    calc.subtotal = parseFloat(calc.subtotal.toFixed(2));
    calc.taxShare = parseFloat((calc.subtotal * taxRatio).toFixed(2));
    calc.tipShare = parseFloat((calc.subtotal * tipRatio).toFixed(2));
    calc.total = parseFloat((calc.subtotal + calc.taxShare + calc.tipShare).toFixed(2));
    
    // Track total sum to solve rounding issues
    roundedTotalSum += calc.total;
  });
  
  // Adjust minor rounding cent differences (e.g. 1-2 cents discrepancy from grand total)
  const grandTotal = state.currentBill.total;
  let roundingDifference = parseFloat((grandTotal - roundedTotalSum).toFixed(2));
  if (roundingDifference !== 0 && state.members.length > 0) {
    // Add the remaining cents to the first member
    const firstPerson = state.members[0];
    personalCalculations[firstPerson].total += roundingDifference;
  }
  
  // Convert map to array for state and rendering
  state.splits = Object.values(personalCalculations);
  
  // Render results
  renderSplitResults(foodSubtotal);
  goToStep(6);
}

function renderSplitResults(foodSubtotal) {
  elements.splitResultsCards.innerHTML = '';
  
  state.splits.forEach(calc => {
    const card = document.createElement('div');
    card.className = 'split-card';
    
    let itemsListHtml = '';
    calc.items.forEach(it => {
      itemsListHtml += `
        <div class="split-card-item">
          <span class="split-card-item-name" title="${escapeHtml(it.name)}">
            ${escapeHtml(it.name)}
            ${it.fraction ? `<span class="split-card-item-share">${it.fraction}</span>` : ''}
          </span>
          <span class="split-card-item-price">₹${it.price.toFixed(2)}</span>
        </div>
      `;
    });
    
    card.innerHTML = `
      <div class="split-card-header">
        <span class="split-card-name">${escapeHtml(calc.name)}</span>
        <span class="split-card-total">₹${calc.total.toFixed(2)}</span>
      </div>
      <div class="split-card-items-list">
        ${itemsListHtml}
      </div>
      <div class="split-card-breakdown">
        <div class="split-card-breakdown-row">
          <span>Subtotal:</span>
          <span>₹${calc.subtotal.toFixed(2)}</span>
        </div>
        <div class="split-card-breakdown-row">
          <span>Tax/GST:</span>
          <span>₹${calc.taxShare.toFixed(2)}</span>
        </div>
        <div class="split-card-breakdown-row">
          <span>Tip/Service:</span>
          <span>₹${calc.tipShare.toFixed(2)}</span>
        </div>
      </div>
    `;
    elements.splitResultsCards.appendChild(card);
  });
  
  // Global summary values
  elements.resSubtotal.textContent = `₹${foodSubtotal.toFixed(2)}`;
  elements.resTax.textContent = `₹${state.currentBill.tax.toFixed(2)}`;
  elements.resTip.textContent = `₹${state.currentBill.tip.toFixed(2)}`;
  elements.resTotal.textContent = `₹${state.currentBill.total.toFixed(2)}`;
}

// Save split info to history on server side
async function saveAndFinishSplit() {
  showLoader('Saving split details...');
  
  const payload = {
    id: state.currentBill.id,
    restaurantName: state.currentBill.restaurantName,
    splitType: state.currentBill.splitType || 'Restaurant Bill',
    date: state.currentBill.date,
    imagePath: state.currentBill.imagePath,
    items: state.currentBill.items,
    tax: state.currentBill.tax,
    tip: state.currentBill.tip,
    total: state.currentBill.total,
    people: state.members,
    itemAssignments: state.assignments,
    splits: state.splits.map(s => ({
      name: s.name,
      subtotal: s.subtotal,
      taxShare: s.taxShare,
      tipShare: s.tipShare,
      total: s.total,
      items: s.items.map(it => `${it.name} ${it.fraction}`)
    }))
  };
  
  try {
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      const savedEntry = await res.json();
      const billId = savedEntry.id;
      if (state.currentBillImageBase64) {
        try {
          localStorage.setItem(`bill_img_${billId}`, state.currentBillImageBase64);
        } catch (storageErr) {
          console.warn('Failed to save image to localStorage:', storageErr);
        }
      }
      await fetchHistory(); // Refresh sidebar list
      resetWizard();
      goToStep(1);
    } else {
      const err = await res.json();
      alert('Error saving split: ' + (err.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to connect to server to save split.');
  } finally {
    hideLoader();
  }
}

function resetWizard() {
  state.currentBill = null;
  state.members = [];
  state.assignments = {};
  state.splits = [];
  selectedFile = null;
  resetUpload();
}

// --------------------------------------------------------------------------
// History Details View & Modal
// --------------------------------------------------------------------------
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
  
  const storedImg = localStorage.getItem(`bill_img_${entry.id}`);
  elements.modalImg.src = storedImg || entry.imagePath || 'placeholder.jpg';
  
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
  
  // Set up edit button on details modal
  elements.modalEditBtn.onclick = () => {
    closeDetailsModal();
    loadBillForEditing(entry);
  };
  
  elements.detailsModal.classList.remove('hidden');
}

function closeDetailsModal() {
  elements.detailsModal.classList.add('hidden');
}

// Edit option to load history item and jump straight back to Step 5 (Split Board)
function loadBillForEditing(historyEntry) {
  // Deep clone to prevent modifying reference directly
  state.currentBill = {
    id: historyEntry.id,
    restaurantName: historyEntry.restaurantName,
    splitType: historyEntry.splitType || 'Restaurant Bill',
    date: historyEntry.date,
    imagePath: historyEntry.imagePath,
    items: JSON.parse(JSON.stringify(historyEntry.items)),
    tax: historyEntry.tax,
    tip: historyEntry.tip,
    total: historyEntry.total
  };
  
  state.members = [...historyEntry.people];
  
  // Load previous item assignments
  state.assignments = JSON.parse(JSON.stringify(historyEntry.itemAssignments || {}));
  
  // Sync inputs on review step in case they go back
  elements.reviewRestaurant.value = state.currentBill.restaurantName;
  elements.reviewDate.value = state.currentBill.date;
  const reviewCategory = document.getElementById('review-category');
  if (reviewCategory) {
    reviewCategory.value = state.currentBill.splitType;
  }
  elements.reviewTax.value = state.currentBill.tax.toFixed(2);
  elements.reviewTip.value = state.currentBill.tip.toFixed(2);
  elements.reviewTotal.value = state.currentBill.total.toFixed(2);
  renderItemsEditor();
  
  // Set upload file preview
  const storedImg = localStorage.getItem(`bill_img_${historyEntry.id}`);
  state.currentBillImageBase64 = storedImg;
  if (storedImg || state.currentBill.imagePath) {
    elements.uploadPreview.src = storedImg || state.currentBill.imagePath;
    elements.dropzone.classList.add('hidden');
    elements.uploadPreviewContainer.classList.remove('hidden');
  }
  
  // Proceed directly to Split Assignment board!
  goToStep(5);
}

// --------------------------------------------------------------------------
// UI Helpers
// --------------------------------------------------------------------------
function showLoader(text) {
  elements.loaderText.textContent = text || 'Processing...';
  elements.loadingOverlay.classList.remove('hidden');
}

function hideLoader() {
  elements.loadingOverlay.classList.add('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// --------------------------------------------------------------------------
// Firebase Authentication & Profile Integration
// --------------------------------------------------------------------------

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

async function triggerGoogleAuth(type) {
  elements.authErrorMsg.classList.add('hidden');
  showLoader('Signing in with Google...');
  try {
    if (!state.firebaseInitialized) {
      throw new Error('Firebase Auth is not initialized. Please verify your environment configurations.');
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    const userCredential = await firebase.auth().signInWithPopup(provider);
    const idToken = await userCredential.user.getIdToken();
    await handleFirebaseLoginBackend(idToken);
  } catch (err) {
    console.error('Google Sign-In error:', err);
    showAuthError(err.message || 'Google Authentication failed.');
  } finally {
    hideLoader();
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
      
      // Calculate total amount spent
      const totalSpent = state.history.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
      if (dropdownSpent) dropdownSpent.textContent = `₹${totalSpent.toFixed(2)}`;
    }
  } catch (err) {
    console.error('Failed to load profile details:', err);
  }
}
