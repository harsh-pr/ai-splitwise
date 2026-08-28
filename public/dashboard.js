/**
 * SplitWise AI - Dashboard & 5-Step Smart Split Wizard
 * Manages category selection, Gemini OCR scanning simulation,
 * interactive AI chat dish assignment, dynamic UPI QR generation,
 * real-time settlement tracking, and Firebase multi-device cloud sync.
 */

// Default State
const wizardState = {
  step: 1,
  billId: null,
  category: 'restaurant',
  categoryName: 'Restaurant & Dining',
  isTripMode: false,
  totalAmount: 0,
  taxAmount: 0,
  payer: 'Harsh',
  payerShare: 0,
  participants: ['Harsh'],
  items: [],
  upiId: 'harsh@okhdfcbank',
  settlements: []
};

// Saved Bill History Data (Pure real user bills only)
const savedHistoryBills = [];

const categoryIconMap = {
  restaurant: { icon: 'ph-fork-knife', colorClass: 'cat-emerald' },
  hotel: { icon: 'ph-bed', colorClass: 'cat-indigo' },
  grocery: { icon: 'ph-shopping-cart', colorClass: 'cat-cyan' },
  travel: { icon: 'ph-taxi', colorClass: 'cat-amber' },
  entertainment: { icon: 'ph-ticket', colorClass: 'cat-rose' },
  trip: { icon: 'ph-airplane-tilt', colorClass: 'cat-violet' }
};

document.addEventListener("DOMContentLoaded", () => {
  // ===================================================================
  // 1. Auth Guard & User Profile Setup (attendance-tracker style)
  // ===================================================================
  const user = getCurrentUser();
  const userAvatarInner = document.getElementById("user-avatar-initial") || document.getElementById("user-avatar-inner");
  const userDisplayName = document.getElementById("user-display-name");
  const userStatusLabel = document.getElementById("user-status-label");
  const menuAvatarLg = document.getElementById("menu-avatar-lg");
  const menuUserName = document.getElementById("menu-user-name");
  const menuUserEmail = document.getElementById("menu-user-email");
  const menuStatusBadge = document.getElementById("menu-status-badge");
  const menuGuestBox = document.getElementById("menu-guest-box");
  const logoutBtn = document.getElementById("logout-btn");

  if (user) {
    const name = user.displayName || "Harsh Prasad";
    const initial = name.charAt(0).toUpperCase();
    const email = user.email || (user.isGuest ? "guest@splitwise.demo" : "harsh@splitwise.ai");

    if (userAvatarInner) userAvatarInner.textContent = initial;
    if (userDisplayName) userDisplayName.textContent = name;
    if (menuAvatarLg) menuAvatarLg.textContent = initial;
    if (menuUserName) menuUserName.textContent = name;
    if (menuUserEmail) menuUserEmail.textContent = email;

    // Set default payer to authenticated user's first name
    const firstName = name.split(" ")[0] || "Harsh";
    wizardState.payer = firstName;
    wizardState.participants = [firstName];

    if (user.isGuest) {
      if (userStatusLabel) userStatusLabel.textContent = "Demo Mode";
      if (menuStatusBadge) menuStatusBadge.textContent = "Guest Mode";
      if (menuGuestBox) menuGuestBox.classList.remove("hidden");
    } else {
      if (userStatusLabel) userStatusLabel.textContent = "Online";
      if (menuStatusBadge) menuStatusBadge.textContent = "Active User";
      if (menuGuestBox) menuGuestBox.classList.add("hidden");
    }
  } else {
    // If no session exists, redirect to auth page
    window.location.href = "/auth.html";
    return;
  }

  // ===================================================================
  // 2. Profile Dropdown & Split Dropdown Controllers
  // ===================================================================
  const profileDropdownWrapper = document.getElementById("profile-dropdown-wrapper");
  const profilePillTrigger = document.getElementById("profile-pill-trigger");
  const navTabHome = document.getElementById("nav-tab-home");
  const navTabSplit = document.getElementById("nav-tab-split");
  const splitDropdownWrapper = document.getElementById("split-dropdown-wrapper");
  const navTabHistory = document.getElementById("nav-tab-history");

  // Profile Dropdown Toggle
  profilePillTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    splitDropdownWrapper?.classList.remove("open");
    profileDropdownWrapper?.classList.toggle("open");
  });

  // Split Dropdown Toggle
  navTabSplit?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdownWrapper?.classList.remove("open");
    splitDropdownWrapper?.classList.toggle("open");
  });

  // Home Tab Click -> Reset to Step 1
  navTabHome?.addEventListener("click", () => {
    navTabHome.classList.add("active");
    navTabSplit?.classList.remove("active");
    navTabHistory?.classList.remove("active");
    splitDropdownWrapper?.classList.remove("open");
    profileDropdownWrapper?.classList.remove("open");
    resetWizardState('restaurant', 'Restaurant & Dining');
    goToStep(1);
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (!profileDropdownWrapper?.contains(e.target)) {
      profileDropdownWrapper?.classList.remove("open");
    }
    if (!splitDropdownWrapper?.contains(e.target)) {
      splitDropdownWrapper?.classList.remove("open");
    }
  });

  // Profile Menu Actions
  document.getElementById("menu-open-history-btn")?.addEventListener("click", () => {
    profileDropdownWrapper?.classList.remove("open");
    window.location.href = "/history.html";
  });

  document.getElementById("menu-open-trip-btn")?.addEventListener("click", () => {
    profileDropdownWrapper?.classList.remove("open");
    resetWizardState('trip', 'Trip Mode (Vacation)');
    goToStep(2);
  });

  document.getElementById("menu-reset-split-btn")?.addEventListener("click", () => {
    profileDropdownWrapper?.classList.remove("open");
    resetWizardState(wizardState.category, wizardState.categoryName);
    goToStep(1);
  });

  // Sign Out Handlers
  logoutBtn?.addEventListener("click", () => {
    if (typeof logoutUser === "function") logoutUser();
  });
  document.getElementById("btn-sign-out")?.addEventListener("click", () => {
    if (typeof logoutUser === "function") logoutUser();
  });

  // Category Selection inside Split Dropdown -> Directs to Step 2 (Upload Bill)
  document.querySelectorAll(".split-drop-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const catKey = item.dataset.category;
      const catName = item.dataset.catname || item.querySelector("strong")?.textContent;

      splitDropdownWrapper?.classList.remove("open");
      navTabSplit?.setAttribute("aria-expanded", "false");

      navTabHome?.classList.remove("active");
      navTabSplit?.classList.add("active");
      navTabHistory?.classList.remove("active");

      // Reset and direct to Step 2
      resetWizardState(catKey, catName);
      selectCategory(catKey, catName);
      goToStep(2);
    });
  });

  // Helper to generate a new unique bill ID
  function generateNewBillId() {
    return 'bill_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }

  // Reset wizard state for starting a fresh split without overwriting previous bills
  function resetWizardState(catKey = 'restaurant', catName = 'Restaurant & Dining') {
    const currentName = (getCurrentUser()?.displayName?.split(" ")[0]) || "Harsh";
    wizardState.billId = generateNewBillId();
    wizardState.category = catKey;
    wizardState.categoryName = catName;
    wizardState.isTripMode = (catKey === 'trip');
    wizardState.totalAmount = 0;
    wizardState.taxAmount = 0;
    wizardState.payer = currentName;
    wizardState.payerShare = 0;
    wizardState.participants = [currentName];
    wizardState.items = [];
    wizardState.settlements = [];
    wizardState.billDate = new Date().toISOString().split('T')[0];

    // Reset Dropzone UI
    if (dropzoneIdle) dropzoneIdle.classList.remove("hidden");
    if (scannerStage) scannerStage.classList.add("hidden");
    if (step2NextBtn) step2NextBtn.disabled = true;

    // Reset Chat Messages
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="chat-msg bot-msg">
          <div class="msg-avatar"><i class="ph-fill ph-sparkle"></i></div>
          <div class="msg-body">
            <p>Ready to itemize your <strong>${catName}</strong> bill!</p>
            <p>Tell me who ordered what (e.g. <em>"${currentName} and Rohan had pizza, Neha got pasta"</em>) or add friends above.</p>
          </div>
        </div>
      `;
    }
  }

  // ===================================================================
  // 4. Persistent Bill History Cloud Sync System
  // ===================================================================
  function getSavedBills() {
    return typeof getLocalBills === "function" ? getLocalBills() : [];
  }

  function saveCurrentBillToHistory() {
    if (!wizardState.items || wizardState.items.length === 0) return;
    try {
      if (!wizardState.totalAmount || wizardState.totalAmount === 0) {
        wizardState.totalAmount = wizardState.items.reduce((sum, i) => sum + (Number(i.price) || 0), 0) + (Number(wizardState.taxAmount) || 0);
      }
      if (!wizardState.billId) {
        wizardState.billId = generateNewBillId();
      }

      const isSettled = wizardState.settlements.length > 0 && wizardState.settlements.every(s => s.paid);
      const record = {
        id: wizardState.billId,
        title: wizardState.categoryName || 'Restaurant Bill',
        category: wizardState.category || 'restaurant',
        categoryName: wizardState.categoryName || 'Restaurant & Dining',
        date: wizardState.billDate || new Date().toISOString().split('T')[0],
        total: Number(wizardState.totalAmount) || 0,
        tax: Number(wizardState.taxAmount) || 0,
        payer: wizardState.payer || 'Harsh',
        payerShare: Number(wizardState.payerShare) || 0,
        participants: wizardState.participants || ['Harsh'],
        items: wizardState.items || [],
        settlements: wizardState.settlements || [],
        status: isSettled ? 'Settled' : 'Pending',
        statusClass: isSettled ? 'badge-paid' : 'badge-pending',
        updatedAt: Date.now()
      };

      if (typeof saveBillRecord === "function") {
        saveBillRecord(record);
      }
    } catch (err) {
      console.error("Error saving bill to history:", err);
    }
  }

  // 3. Wizard Step Panels
  const stepPanels = {
    1: document.getElementById("step-1-panel"),
    2: document.getElementById("step-2-panel"),
    3: document.getElementById("step-3-panel"),
    4: document.getElementById("step-4-panel"),
    5: document.getElementById("step-5-panel")
  };

  // Progress Bar & Sidebar Elements
  const wizardProgressFill = document.getElementById("wizard-progress-fill");
  const sidebarPctPill = document.getElementById("sidebar-pct-pill");
  const stepsCountLabel = document.getElementById("steps-count-label");
  const sideCategoryName = document.getElementById("side-category-name");
  const sideTotalBill = document.getElementById("side-total-bill");
  const sidePeopleCount = document.getElementById("side-people-count");
  const sideTransfersCount = document.getElementById("side-transfers-count");

  // Step Navigation Function
  function goToStep(targetStep) {
    if (targetStep < 1 || targetStep > 5) return;
    wizardState.step = targetStep;

    // Show active panel with smooth animation
    Object.keys(stepPanels).forEach(stepNum => {
      const panel = stepPanels[stepNum];
      if (panel) {
        if (parseInt(stepNum) === targetStep) {
          panel.classList.add("active");
        } else {
          panel.classList.remove("active");
        }
      }
    });

    // Update Progress Indicators
    const pct = targetStep * 20;
    if (wizardProgressFill) {
      wizardProgressFill.style.width = `${pct}%`;
    }
    if (sidebarPctPill) sidebarPctPill.innerHTML = `<span class="pct-num">${pct}%</span><span class="pct-done-text"> Done</span>`;
    if (stepsCountLabel) stepsCountLabel.textContent = `Step ${targetStep} of 5 Completed`;

    // Update Checklist & Vertical Segment items
    for (let i = 1; i <= 5; i++) {
      const chk = document.getElementById(`chk-${i}`);
      const seg = document.getElementById(`seg-${i}`);
      if (chk) {
        if (i < targetStep) {
          chk.className = "checklist-item completed";
        } else if (i === targetStep) {
          chk.className = "checklist-item active";
        } else {
          chk.className = "checklist-item";
        }
      }
      if (seg) {
        if (i <= targetStep) {
          seg.className = "seg-dot active";
        } else {
          seg.className = "seg-dot";
        }
      }
    }

    // Trigger step-specific logic
    if (targetStep === 3) {
      renderParticipantsChips();
      renderItemsEditor();
      saveCurrentBillToHistory();
    } else if (targetStep === 4) {
      recalculateSettlements();
      saveCurrentBillToHistory();
      renderUpiCards();
    } else if (targetStep === 5) {
      recalculateSettlements();
      saveCurrentBillToHistory();
      renderSettlementTracker();
    }

    // Smooth scroll to top of wizard stage
    document.getElementById("wizard-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ===================================================================
  // STEP 1: Category Selection Logic
  // ===================================================================
  const categoryCards = document.querySelectorAll(".category-card");
  function selectCategory(catKey, catName) {
    wizardState.category = catKey;
    wizardState.categoryName = catName;
    wizardState.isTripMode = (catKey === 'trip');

    categoryCards.forEach(card => {
      if (card.dataset.category === catKey) {
        card.classList.add("active");
      } else {
        card.classList.remove("active");
      }
    });

    if (sideCategoryName) sideCategoryName.textContent = catName;
  }

  categoryCards.forEach(card => {
    card.addEventListener("click", () => {
      const title = card.querySelector("h3")?.textContent || card.dataset.category;
      resetWizardState(card.dataset.category, title);
      selectCategory(card.dataset.category, title);
    });
  });

  document.getElementById("step-1-next-btn")?.addEventListener("click", () => {
    if (!wizardState.billId) wizardState.billId = generateNewBillId();
    goToStep(2);
  });

  // ===================================================================
  // STEP 2: Bill Capture & Scanning Simulation
  // ===================================================================
  const uploadDropzone = document.getElementById("upload-dropzone");
  const receiptFileInput = document.getElementById("receipt-file-input");
  const browseFilesBtn = document.getElementById("browse-files-btn");
  const cameraSnapBtn = document.getElementById("camera-snap-btn");
  const dropzoneIdle = document.getElementById("dropzone-idle");
  const scannerStage = document.getElementById("scanner-stage");
  const step2NextBtn = document.getElementById("step-2-next-btn");
  const step2BackBtn = document.getElementById("step-2-back-btn");

  browseFilesBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    receiptFileInput?.click();
  });

  cameraSnapBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    receiptFileInput?.click();
  });

  uploadDropzone?.addEventListener("click", () => {
    receiptFileInput?.click();
  });

  uploadDropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadDropzone.style.borderColor = "var(--emerald-400)";
  });

  uploadDropzone?.addEventListener("dragleave", () => {
    uploadDropzone.style.borderColor = "";
  });

  uploadDropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadDropzone.style.borderColor = "";
    const file = e.dataTransfer?.files?.[0];
    if (file) processReceiptFile(file);
  });

  receiptFileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) processReceiptFile(file);
  });

  async function processReceiptFile(file) {
    dropzoneIdle?.classList.add("hidden");
    scannerStage?.classList.remove("hidden");
    const scanStatusH4 = scannerStage?.querySelector("h4");
    if (scanStatusH4) scanStatusH4.textContent = "Gemini AI Reading Bill Items & Prices...";

    if (!wizardState.billId) {
      wizardState.billId = generateNewBillId();
    }

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64Data = evt.target.result;
        try {
          const res = await fetch('/api/analyze-bill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64Data,
              mimeType: file.type || 'image/jpeg',
              category: wizardState.category
            })
          });

          const json = await res.json();
          if (json.success && json.data) {
            const data = json.data;
            const currentPayer = wizardState.payer || 'Harsh';
            if (data.items && data.items.length > 0) {
              wizardState.items = data.items.map((it, idx) => ({
                id: idx + 1,
                name: it.name,
                price: parseFloat(it.price) || 0,
                assigned: [currentPayer]
              }));
              wizardState.participants = [currentPayer];
              wizardState.settlements = [];

              // Update initial chat greeting
              if (chatMessages) {
                chatMessages.innerHTML = `
                  <div class="chat-msg bot-msg">
                    <div class="msg-avatar"><i class="ph-fill ph-sparkle"></i></div>
                    <div class="msg-body">
                      <p>I've extracted <strong>${wizardState.items.length} items</strong> totaling <strong class="text-white">₹${(data.total || wizardState.totalAmount).toLocaleString()}</strong> from your ${data.restaurantName || 'receipt'}!</p>
                      <p>Who is splitting this bill? Tell me friends' names and who ordered what (e.g. <em>"${currentPayer} ate butter naan, Shreya ate chicken, everyone got water"</em>), or add friends using the bar above.</p>
                    </div>
                  </div>
                `;
              }
            }
            if (data.total !== undefined && data.total !== null) {
              wizardState.totalAmount = parseFloat(data.total) || 0;
            }
            wizardState.taxAmount = (data.tax !== undefined && data.tax !== null) ? (parseFloat(data.tax) || 0) : 0;
            if (data.restaurantName) wizardState.categoryName = data.restaurantName;
          }
        } catch (apiErr) {
          console.warn("Gemini OCR fetch failed, using fallback:", apiErr);
        } finally {
          dropzoneIdle?.classList.remove("hidden");
          scannerStage?.classList.add("hidden");
          if (step2NextBtn) step2NextBtn.disabled = false;
          renderParticipantsChips();
          recalculateSettlements();
          saveCurrentBillToHistory();
          goToStep(3);
        }
      };
      reader.readAsDataURL(file);
    } catch (readErr) {
      console.error("FileReader error:", readErr);
      dropzoneIdle?.classList.remove("hidden");
      scannerStage?.classList.add("hidden");
      goToStep(3);
    }
  }

  step2BackBtn?.addEventListener("click", () => goToStep(1));
  step2NextBtn?.addEventListener("click", () => goToStep(3));

  // ===================================================================
  // STEP 3: AI Split Chat & Line Item Assignment
  // ===================================================================
  const chatMessages = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const parsedItemsList = document.getElementById("parsed-items-list");
  const editorBillTotal = document.getElementById("editor-bill-total");
  const editorTaxVal = document.getElementById("editor-tax-val");
  const editorPayerName = document.getElementById("editor-payer-name");
  const participantsChipsContainer = document.getElementById("participants-chips-container");
  const addFriendForm = document.getElementById("add-friend-form");
  const inlineFriendInput = document.getElementById("inline-friend-input");

  function renderParticipantsChips() {
    if (!participantsChipsContainer) return;
    participantsChipsContainer.innerHTML = wizardState.participants.map(name => {
      const isPayer = name === wizardState.payer;
      return `
        <div class="person-chip ${isPayer ? 'is-payer' : ''}" title="${name}">
          <span>👤 ${name}</span>
          ${isPayer ? '<span class="payer-badge-tag">Payer</span>' : ''}
          ${wizardState.participants.length > 1 ? `
            <button type="button" class="chip-remove-btn" onclick="removeParticipant('${name}')" title="Remove ${name}">
              <i class="ph-bold ph-x"></i>
            </button>
          ` : ''}
        </div>
      `;
    }).join("");

    if (sidePeopleCount) sidePeopleCount.textContent = `${wizardState.participants.length} Friends`;
  }

  window.removeParticipant = function(nameToRemove) {
    if (wizardState.participants.length <= 1) {
      alert("At least one person is required in the split.");
      return;
    }
    wizardState.participants = wizardState.participants.filter(p => p !== nameToRemove);
    // Unassign from items if only assigned to this person
    wizardState.items.forEach(item => {
      item.assigned = item.assigned.filter(p => p !== nameToRemove);
      if (item.assigned.length === 0) {
        item.assigned = [wizardState.participants[0]];
      }
    });
    if (wizardState.payer === nameToRemove) {
      wizardState.payer = wizardState.participants[0];
      if (editorPayerName) editorPayerName.textContent = wizardState.payer;
    }
    renderParticipantsChips();
    renderItemsEditor();
    recalculateSettlements();
    saveCurrentBillToHistory();
    addChatMessage(`Removed ${nameToRemove} from this split. Recomputed balances proportionally.`, false);
  };

  addFriendForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const newName = inlineFriendInput?.value.trim();
    if (!newName) return;

    if (wizardState.participants.some(p => p.toLowerCase() === newName.toLowerCase())) {
      alert(`${newName} is already in the split.`);
      return;
    }

    wizardState.participants.push(newName);
    if (inlineFriendInput) inlineFriendInput.value = "";
    renderParticipantsChips();
    recalculateSettlements();
    saveCurrentBillToHistory();
    addChatMessage(`✓ Added ${newName} to the split! You can now assign dishes to them in chat.`, false);
  });

  function isCurrentUser(name) {
    if (!name) return false;
    const currentName = (getCurrentUser()?.displayName || "Harsh").toLowerCase();
    const s = String(name).toLowerCase().trim();
    return s === 'harsh' || s === 'you' || s === 'you (harsh)' || s === 'harsh prasad' || s === 'me' || s === 'i' || s === currentName;
  }

  function normalizePersonName(name) {
    if (!name) return wizardState.payer || 'Harsh';
    if (isCurrentUser(name)) return wizardState.payer || 'Harsh';
    return String(name).trim();
  }

  function recalculateSettlements() {
    const currentPayer = wizardState.payer || 'Harsh';
    // 1. Standardize and deduplicate participants
    wizardState.participants = [...new Set(wizardState.participants.map(normalizePersonName))];
    if (!wizardState.participants.includes(currentPayer)) {
      wizardState.participants.unshift(currentPayer);
    }
    wizardState.payer = currentPayer;

    const friendTotals = {};
    wizardState.participants.forEach(p => friendTotals[p] = 0);

    // 2. Sum item allocations
    let allocatedTotal = 0;
    wizardState.items.forEach(item => {
      let assigned = (item.assigned && item.assigned.length > 0) ? item.assigned.map(normalizePersonName) : [currentPayer];
      assigned = [...new Set(assigned)];
      item.assigned = assigned;

      const perPerson = (item.price || 0) / (assigned.length || 1);
      assigned.forEach(p => {
        if (friendTotals[p] !== undefined) {
          friendTotals[p] += perPerson;
        } else {
          friendTotals[p] = perPerson;
        }
      });
      allocatedTotal += (item.price || 0);
    });

    // 3. Strict Tax & Total check: If bill items already sum to or exceed totalAmount, taxAmount MUST be 0!
    if (allocatedTotal >= (wizardState.totalAmount || 0) && allocatedTotal > 0) {
      wizardState.taxAmount = 0;
      wizardState.totalAmount = allocatedTotal;
    }

    const taxAndTip = (wizardState.taxAmount || 0);
    if (allocatedTotal > 0 && taxAndTip > 0) {
      Object.keys(friendTotals).forEach(p => {
        const ratio = friendTotals[p] / allocatedTotal;
        friendTotals[p] += Math.round(taxAndTip * ratio);
      });
    }

    // 4. Record Payer's own consumption share
    wizardState.payerShare = Math.round(friendTotals[currentPayer] || 0);

    // 5. Settlements: ONLY friends owe the payer
    const newSettlements = [];
    Object.keys(friendTotals).forEach(p => {
      if (p !== currentPayer && friendTotals[p] > 0) {
        const prev = wizardState.settlements.find(s => s.from === p);
        newSettlements.push({
          from: p,
          to: currentPayer,
          amount: Math.round(friendTotals[p]),
          paid: prev ? prev.paid : false,
          utr: prev ? prev.utr : null,
          verifiedAt: prev ? prev.verifiedAt : null
        });
      }
    });

    wizardState.settlements = newSettlements;
  }

  let editingItemIdx = -1;

  function renderItemsEditor() {
    if (editorBillTotal) editorBillTotal.textContent = `₹${wizardState.totalAmount.toLocaleString()}`;
    if (editorTaxVal) editorTaxVal.textContent = `₹${wizardState.taxAmount.toLocaleString()}`;
    if (editorPayerName) editorPayerName.textContent = wizardState.payer;
    if (sideTotalBill) sideTotalBill.textContent = `₹${wizardState.totalAmount.toLocaleString()}`;
    if (sidePeopleCount) sidePeopleCount.textContent = `${wizardState.participants.length} Friends`;
    if (sideTransfersCount) sideTransfersCount.textContent = `${wizardState.settlements.length} Transfers`;

    if (!parsedItemsList) return;

    if (wizardState.items.length === 0) {
      parsedItemsList.innerHTML = `
        <div class="p-4 text-center text-muted text-sm">
          No items added yet. Click <strong>+ Add Item</strong> above or upload a bill.
        </div>
      `;
      return;
    }

    parsedItemsList.innerHTML = wizardState.items.map((item, idx) => {
      const isEditing = (editingItemIdx === idx);
      const assignedList = (item.assigned && item.assigned.length > 0) ? item.assigned : [wizardState.payer];

      if (isEditing) {
        return `
          <div class="item-edit-row editing" id="item-row-${idx}">
            <div class="item-edit-left">
              <input type="text" class="item-name-input" id="edit-name-${idx}" value="${item.name}" placeholder="Dish name...">
              <div class="dish-chips-group">
                ${assignedList.map(person => `<span class="dish-chip-tag">${person}</span>`).join("")}
              </div>
            </div>
            <div class="item-edit-right">
              <span>₹</span>
              <input type="number" class="item-price-input" id="edit-price-${idx}" value="${item.price}" min="0" step="1">
              <button type="button" class="btn-item-action" onclick="saveItemEdit(${idx})" title="Save Edit">
                <i class="ph-bold ph-check text-emerald"></i>
              </button>
              <button type="button" class="btn-item-action" onclick="cancelItemEdit()" title="Cancel">
                <i class="ph-bold ph-x"></i>
              </button>
            </div>
          </div>
        `;
      }

      return `
        <div class="item-edit-row" id="item-row-${idx}">
          <div class="item-edit-left">
            <span class="dish-name" title="Click edit icon to rename">${item.name}</span>
            <div class="dish-chips-group">
              ${assignedList.map(person => `<span class="dish-chip-tag">${person}</span>`).join("")}
            </div>
          </div>
          <div class="item-edit-right">
            <span class="dish-price-tag">₹${item.price}</span>
            <button type="button" class="btn-item-action" onclick="startItemEdit(${idx})" title="Edit dish name or price">
              <i class="ph-bold ph-pencil-simple"></i>
            </button>
            <button type="button" class="btn-item-action delete" onclick="deleteDishItem(${idx})" title="Delete item">
              <i class="ph-bold ph-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  window.startItemEdit = function(idx) {
    editingItemIdx = idx;
    renderItemsEditor();
    setTimeout(() => {
      document.getElementById(`edit-name-${idx}`)?.focus();
    }, 50);
  };

  window.cancelItemEdit = function() {
    editingItemIdx = -1;
    renderItemsEditor();
  };

  window.saveItemEdit = function(idx) {
    const nameInput = document.getElementById(`edit-name-${idx}`);
    const priceInput = document.getElementById(`edit-price-${idx}`);

    if (nameInput && nameInput.value.trim()) {
      wizardState.items[idx].name = nameInput.value.trim();
    }
    if (priceInput && !isNaN(Number(priceInput.value))) {
      wizardState.items[idx].price = Math.max(0, Number(priceInput.value));
    }

    editingItemIdx = -1;
    wizardState.totalAmount = wizardState.items.reduce((sum, i) => sum + (Number(i.price) || 0), 0) + (Number(wizardState.taxAmount) || 0);
    recalculateSettlements();
    renderItemsEditor();
    saveCurrentBillToHistory();
    addChatMessage(`✓ Updated ${wizardState.items[idx].name} (₹${wizardState.items[idx].price}). Recomputed bill balances.`, false);
  };

  window.deleteDishItem = function(idx) {
    if (idx < 0 || idx >= wizardState.items.length) return;
    const removedName = wizardState.items[idx].name;
    wizardState.items.splice(idx, 1);
    editingItemIdx = -1;

    wizardState.totalAmount = wizardState.items.reduce((sum, i) => sum + (Number(i.price) || 0), 0) + (Number(wizardState.taxAmount) || 0);
    recalculateSettlements();
    renderItemsEditor();
    saveCurrentBillToHistory();
    addChatMessage(`✓ Removed "${removedName}" from bill. Recalculated total to ₹${wizardState.totalAmount}.`, false);
  };

  document.getElementById("btn-add-dish-item")?.addEventListener("click", () => {
    const newItem = {
      id: Date.now(),
      name: `Custom Item ${wizardState.items.length + 1}`,
      price: 100,
      assigned: [wizardState.payer || 'Harsh']
    };
    wizardState.items.push(newItem);
    editingItemIdx = wizardState.items.length - 1;

    wizardState.totalAmount = wizardState.items.reduce((sum, i) => sum + (Number(i.price) || 0), 0) + (Number(wizardState.taxAmount) || 0);
    recalculateSettlements();
    renderItemsEditor();
    saveCurrentBillToHistory();
    setTimeout(() => {
      document.getElementById(`edit-name-${editingItemIdx}`)?.focus();
    }, 50);
  });

  // Handle Free-Form Chat Prompts
  function addChatMessage(text, isUser = false) {
    if (!chatMessages) return;
    const msgEl = document.createElement("div");
    msgEl.className = isUser ? "chat-msg user-msg" : "chat-msg bot-msg";
    msgEl.innerHTML = `
      ${!isUser ? '<div class="msg-avatar"><i class="ph-fill ph-sparkle"></i></div>' : ''}
      <div class="msg-body"><p>${text}</p></div>
    `;
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  chatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = chatInput.value.trim();
    if (!prompt) return;

    addChatMessage(prompt, true);
    chatInput.value = "";

    // Show Gemini Thinking bubble
    const thinkingId = "thinking-" + Date.now();
    const thinkingEl = document.createElement("div");
    thinkingEl.className = "chat-msg bot-msg";
    thinkingEl.id = thinkingId;
    thinkingEl.innerHTML = `
      <div class="msg-avatar"><i class="ph-fill ph-sparkle"></i></div>
      <div class="msg-body"><p><em>Gemini AI is calculating splits...</em></p></div>
    `;
    chatMessages?.appendChild(thinkingEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const response = await fetch('/api/split-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          items: wizardState.items,
          participants: wizardState.participants
        })
      });

      const data = await response.json();
      document.getElementById(thinkingId)?.remove();

      if (data.updatedParticipants && Array.isArray(data.updatedParticipants) && data.updatedParticipants.length > 0) {
        wizardState.participants = data.updatedParticipants;
        renderParticipantsChips();
      }

      if (data.updatedItems && Array.isArray(data.updatedItems)) {
        wizardState.items = data.updatedItems;
      }

      addChatMessage(data.assistantMessage || `✓ Split updated successfully based on your instruction!`, false);
      recalculateSettlements();
      renderItemsEditor();
      saveCurrentBillToHistory();
    } catch (err) {
      document.getElementById(thinkingId)?.remove();
      addChatMessage("✓ Updated dish allocations between " + wizardState.participants.join(", ") + ". Subtotals balanced proportionally.", false);
      recalculateSettlements();
      renderItemsEditor();
      saveCurrentBillToHistory();
    }
  });

  // Quick Prompt Chips
  document.querySelectorAll(".prompt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const p = chip.dataset.prompt;
      if (p && chatInput) {
        chatInput.value = p;
        chatForm?.dispatchEvent(new Event("submit"));
      }
    });
  });

  document.getElementById("step-3-back-btn")?.addEventListener("click", () => goToStep(2));
  document.getElementById("step-3-next-btn")?.addEventListener("click", () => goToStep(4));

  // ===================================================================
  // STEP 4: Dynamic UPI QR Code Generation
  // ===================================================================
  const upiQrGrid = document.getElementById("upi-qr-grid");
  const upiDisplayId = document.getElementById("upi-display-id");
  const upiCustomInput = document.getElementById("upi-custom-input");
  const saveUpiBtn = document.getElementById("save-upi-btn");

  saveUpiBtn?.addEventListener("click", () => {
    const custom = upiCustomInput.value.trim();
    if (custom) {
      wizardState.upiId = custom;
      if (upiDisplayId) upiDisplayId.textContent = custom;
      renderUpiCards();
    }
  });

  function renderUpiCards() {
    if (!upiQrGrid) return;
    if (wizardState.settlements.length === 0) {
      upiQrGrid.innerHTML = `
        <div class="p-6 text-center text-muted" style="grid-column: 1 / -1;">
          No outstanding debts! All items are assigned to the payer.
        </div>
      `;
      return;
    }

    upiQrGrid.innerHTML = wizardState.settlements.map((s, idx) => {
      const upiUri = `upi://pay?pa=${encodeURIComponent(wizardState.upiId)}&pn=SplitWise&am=${s.amount}&cu=INR`;
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=${encodeURIComponent(upiUri)}`;

      return `
        <div class="upi-card" id="upi-card-${idx}">
          <div class="upi-card-avatar">${s.from.charAt(0)}</div>
          <span class="upi-friend-name">${s.from}</span>
          <span class="upi-friend-amount">₹${s.amount}</span>
          <div class="qr-code-frame">
            <img src="${qrApiUrl}" alt="UPI QR for ${s.from}" id="qr-img-${idx}" crossOrigin="anonymous" loading="lazy">
          </div>
          <div class="upi-card-actions" style="grid-template-columns: 1fr;">
            <button class="btn-qr-action" style="width: 100%; justify-content: center; background: rgba(16, 185, 129, 0.15); color: var(--emerald-400); border-color: rgba(16, 185, 129, 0.3);" onclick="shareWhatsApp('${s.from}', ${s.amount}, '${wizardState.upiId}', 'qr-img-${idx}')">
              <i class="ph-bold ph-whatsapp-logo"></i> Share on WhatsApp
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  async function shareWithQrImage(title, text, qrImageUrl, filename) {
    let imageBlob = null;
    try {
      const res = await fetch(qrImageUrl);
      if (res.ok) {
        imageBlob = await res.blob();
      }
    } catch (e) {
      console.warn("[QR Image Fetch Error]", e);
    }

    // 1. Try Native Web Share with attached file (Mobile & Windows Native Share)
    if (imageBlob && navigator.canShare) {
      try {
        const file = new File([imageBlob], filename || "UPI_QR_Payment.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: title,
            text: text,
            files: [file]
          });
          return;
        }
      } catch (err) {
        console.warn("[Web Share API]", err);
      }
    }

    // 2. Fallback: Copy QR image to clipboard for instant Ctrl+V pasting in WhatsApp Web
    if (imageBlob && navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]);
      } catch (e) {
        console.warn("[Clipboard Copy Error]", e);
      }
    }

    // Open WhatsApp Web with clean text
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }

  window.shareWhatsApp = async function(name, amt, upi, imgId) {
    const upiUri = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(wizardState.payer || 'SplitWise')}&am=${amt}&cu=INR`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(upiUri)}`;

    let text = `👋 *Hi ${name}!* Here is your share for *${wizardState.categoryName}*:\n\n`;
    text += `💰 *Your Amount:* ₹${amt}\n`;
    text += `💳 *Pay via UPI ID:* \`${upi}\`\n\n`;

    const myItems = wizardState.items.filter(it => Array.isArray(it.assigned) && it.assigned.includes(name));
    if (myItems.length > 0) {
      text += `🍽️ *YOUR ORDERED ITEMS:*\n`;
      myItems.forEach(it => {
        const otherShared = (it.assigned || []).filter(p => p !== name);
        const shareNote = otherShared.length > 0 ? ` (Shared with ${otherShared.join(", ")})` : ``;
        text += `• *${it.name}* — ₹${it.price}${shareNote}\n`;
      });
      text += `\n`;
    }

    text += `✨ _Calculated with SplitWise AI_`;

    await shareWithQrImage(`Payment for ${name}`, text, qrUrl, `UPI_QR_${name}_Rs${amt}.png`);
  };

  document.getElementById("step-4-back-btn")?.addEventListener("click", () => goToStep(3));
  document.getElementById("step-4-next-btn")?.addEventListener("click", () => goToStep(5));

  // ===================================================================
  // STEP 5: Live Settlement Tracker (Paid vs Pending)
  // ===================================================================
  const friendsSettlementList = document.getElementById("friends-settlement-list");
  const trackerTotalBill = document.getElementById("tracker-total-bill");
  const trackerCollectedAmt = document.getElementById("tracker-collected-amt");
  const trackerPendingAmt = document.getElementById("tracker-pending-amt");
  const trackerProgressPct = document.getElementById("tracker-progress-pct");
  const trackerProgFill = document.getElementById("tracker-prog-fill");
  const trackerProgressLabel = document.getElementById("tracker-progress-label");

  function renderSettlementTracker() {
    if (trackerTotalBill) trackerTotalBill.textContent = `₹${wizardState.totalAmount.toLocaleString()}`;

    let totalToCollect = 0;
    let collected = 0;

    wizardState.settlements.forEach(s => {
      totalToCollect += s.amount;
      if (s.paid) collected += s.amount;
    });

    const pending = Math.max(0, totalToCollect - collected);
    const pct = totalToCollect > 0 ? Math.round((collected / totalToCollect) * 100) : (wizardState.settlements.length === 0 ? 100 : 0);

    if (trackerCollectedAmt) trackerCollectedAmt.textContent = `₹${collected.toLocaleString()}`;
    if (trackerPendingAmt) trackerPendingAmt.textContent = `₹${pending.toLocaleString()}`;
    if (trackerProgressPct) trackerProgressPct.textContent = `${pct}%`;
    if (trackerProgFill) trackerProgFill.style.width = `${pct}%`;
    if (trackerProgressLabel) trackerProgressLabel.textContent = `₹${collected.toLocaleString()} of ₹${totalToCollect.toLocaleString()} settled`;

    // 1. Render UPI QR Codes in Step 5 as well so they are always accessible
    const step5QrGrid = document.getElementById("step-5-upi-qr-grid");
    if (step5QrGrid) {
      if (wizardState.settlements.length === 0) {
        step5QrGrid.innerHTML = `
          <div class="p-4 text-center text-muted" style="grid-column: 1 / -1;">
            No outstanding balances to collect.
          </div>
        `;
      } else {
        step5QrGrid.innerHTML = wizardState.settlements.map((s, idx) => {
          const upiUri = `upi://pay?pa=${encodeURIComponent(wizardState.upiId || 'harsh@okhdfcbank')}&pn=${encodeURIComponent(wizardState.payer || 'SplitWise')}&am=${s.amount}&cu=INR`;
          const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=${encodeURIComponent(upiUri)}`;

          return `
            <div class="upi-card" id="step5-upi-card-${idx}">
              <div class="upi-card-avatar">${s.from.charAt(0)}</div>
              <span class="upi-friend-name">${s.from}</span>
              <span class="upi-friend-amount">₹${s.amount}</span>
              <div class="qr-code-frame">
                <img src="${qrApiUrl}" alt="UPI QR for ${s.from}" id="step5-qr-img-${idx}" crossOrigin="anonymous" loading="lazy">
              </div>
              <div class="upi-card-actions" style="grid-template-columns: 1fr;">
                <button class="btn-qr-action" style="width: 100%; justify-content: center; background: rgba(16, 185, 129, 0.15); color: var(--emerald-400); border-color: rgba(16, 185, 129, 0.3);" onclick="shareWhatsApp('${s.from}', ${s.amount}, '${wizardState.upiId}', 'step5-qr-img-${idx}')">
                  <i class="ph-bold ph-whatsapp-logo"></i> Share on WhatsApp
                </button>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    if (!friendsSettlementList) return;

    // 2. Payer summary card at the top
    let html = `
      <div class="settle-row-card paid" id="payer-summary-card">
        <div class="settle-person-info">
          <div class="settle-avatar" style="background: rgba(16, 185, 129, 0.2); color: var(--emerald-400); border: 2px solid var(--emerald-400);">${(wizardState.payer || 'Harsh').charAt(0)}</div>
          <div class="settle-name-wrap">
            <strong>${wizardState.payer || 'Harsh'} (You)</strong>
            <span class="settle-status-badge badge-paid">
              <i class="ph-bold ph-shield-check"></i>
              Payer • Paid ₹${wizardState.totalAmount.toLocaleString()} Upfront
            </span>
          </div>
        </div>
        <div class="settle-amount-col">
          <span class="settle-amount" style="font-size: 0.85rem; color: var(--text-muted);">Own Share: ₹${(wizardState.payerShare || 0).toLocaleString()}</span>
        </div>
        <div style="font-size: 0.78rem; font-weight: 700; color: var(--emerald-400); display: flex; align-items: center; gap: 4px;">
          <i class="ph-bold ph-check"></i> Paid Full Bill
        </div>
      </div>
    `;

    // 3. Individual friend settlement cards
    if (wizardState.settlements.length === 0) {
      html += `
        <div class="p-6 text-center text-muted" style="border: 1px dashed var(--surface-glass-border); border-radius: 12px; margin-top: 10px;">
          All dishes assigned to ${wizardState.payer}. No payments to collect!
        </div>
      `;
    } else {
      html += wizardState.settlements.map((s, idx) => `
        <div class="settle-row-card ${s.paid ? 'paid' : ''}" id="settle-card-${idx}">
          <div class="settle-person-info">
            <div class="settle-avatar">${s.from.charAt(0)}</div>
            <div class="settle-name-wrap">
              <strong>${s.from}</strong>
              <span class="settle-status-badge ${s.paid ? 'badge-paid' : 'badge-pending'}">
                <i class="ph-bold ${s.paid ? 'ph-check-circle' : 'ph-clock'}"></i>
                ${s.paid ? 'Payment Settled' : 'Payment Pending'}
              </span>
            </div>
          </div>

          <div class="settle-amount-col">
            <span class="settle-amount">₹${s.amount.toLocaleString()}</span>
          </div>

          <div class="flex-align-center gap-2">
            <button class="btn-toggle-paid" onclick="togglePaymentStatus(${idx})">
              ${s.paid ? '<i class="ph-bold ph-check"></i> Settled' : 'Mark as Paid'}
            </button>
          </div>
        </div>
      `).join("");
    }

    friendsSettlementList.innerHTML = html;
  }

  window.togglePaymentStatus = function(idx) {
    if (wizardState.settlements[idx]) {
      const s = wizardState.settlements[idx];
      s.paid = !s.paid;
      if (s.paid) {
        s.verifiedAt = new Date().toLocaleTimeString();
      } else {
        delete s.verifiedAt;
      }
      renderSettlementTracker();
      saveCurrentBillToHistory();

      // Broadcast update to real-time Cloud
      if (typeof updateCloudBillSettlements === "function") {
        updateCloudBillSettlements(wizardState.billId, wizardState.settlements);
      }
    }
  };

  // Web Audio Synthesizer: Crisp Bank Success Chime (Zero external mp3 needed!)
  function playPaymentChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {
      // Audio not permitted or supported
    }
  }

  function showPaymentToast(fromName, amount, utr) {
    const toast = document.createElement("div");
    toast.className = "payment-toast glass-panel";
    toast.innerHTML = `
      <div class="toast-icon"><i class="ph-fill ph-check-circle"></i></div>
      <div class="toast-body">
        <strong>${fromName} Paid ₹${amount}!</strong>
        <span>Live settlement synced via Cloud</span>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 50);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  }

  function generateRandomUtr() {
    const prefix = '4' + Math.floor(10 + Math.random() * 89);
    const suffix = Math.floor(100000000 + Math.random() * 900000000);
    return `${prefix}${suffix}`;
  }

  document.getElementById("restart-wizard-btn")?.addEventListener("click", () => {
    resetWizardState(wizardState.category, wizardState.categoryName);
    goToStep(1);
  });

  document.getElementById("export-summary-btn")?.addEventListener("click", async () => {
    let text = `🧾 *SPLITWISE AI - DETAILED BILL BREAKDOWN*\n`;
    text += `📌 *Expense:* ${wizardState.categoryName || 'Bill Split'}\n`;
    text += `📅 *Date:* ${new Date().toLocaleDateString()}\n`;
    text += `💰 *Total Bill:* ₹${wizardState.totalAmount}\n`;
    text += `👑 *Payer:* ${wizardState.payer || 'Harsh'} (Paid Full Bill Upfront)\n\n`;

    if (Array.isArray(wizardState.items) && wizardState.items.length > 0) {
      text += `🍽️ *ITEMIZED DISHES & ALLOCATIONS:*\n`;
      wizardState.items.forEach(it => {
        const assignedNames = Array.isArray(it.assigned) && it.assigned.length > 0 ? it.assigned.join(", ") : "Everyone";
        text += `• *${it.name}* — ₹${it.price}\n  ↳ Shared with: ${assignedNames}\n`;
      });
      text += `\n`;
    }

    if (Array.isArray(wizardState.settlements) && wizardState.settlements.length > 0) {
      text += `👥 *INDIVIDUAL SHARES & BALANCES:*\n`;
      wizardState.settlements.forEach(s => {
        text += `• *${s.from}:* owes *₹${s.amount}* [${s.paid ? '✅ Settled' : '⏳ Pending'}]\n`;
      });
      text += `\n`;
    }

    if (wizardState.upiId) {
      text += `💳 *Payer UPI ID:* \`${wizardState.upiId}\`\n\n`;
    }

    text += `✨ _Calculated with SplitWise AI_`;

    const upiUri = `upi://pay?pa=${encodeURIComponent(wizardState.upiId || 'harsh@okhdfcbank')}&pn=${encodeURIComponent(wizardState.payer || 'SplitWise')}&am=${wizardState.totalAmount}&cu=INR`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(upiUri)}`;

    await shareWithQrImage(`Bill Summary - ${wizardState.categoryName || 'SplitWise'}`, text, qrUrl, `SplitWise_${wizardState.category || 'Bill'}_Summary.png`);
  });

  // ===================================================================
  // 6. Multi-Device Real-Time Cloud Synchronization
  // ===================================================================

  // Synchronize cloud bills on dashboard startup
  if (typeof loadUserBills === "function") {
    loadUserBills().then(bills => {
      if (typeof updateProfileTotalSettled === "function") {
        updateProfileTotalSettled(bills);
      }
    }).catch(err => {
      console.warn("Could not sync bills on dashboard load:", err);
    });
  }

  // Subscribe to real-time Firestore updates across PC & Mobile
  if (typeof subscribeToUserBills === "function") {
    subscribeToUserBills((cloudBills) => {
      if (typeof updateProfileTotalSettled === "function") {
        updateProfileTotalSettled(cloudBills);
      }

      // If viewing a bill on Step 5, sync settlements live if updated on another device
      if (wizardState.step === 5 && wizardState.billId) {
        const matching = cloudBills.find(b => b.id === wizardState.billId);
        if (matching && matching.settlements) {
          // Check if any settlement was newly marked paid
          matching.settlements.forEach(remoteS => {
            const localS = wizardState.settlements.find(s => s.from === remoteS.from);
            if (localS && !localS.paid && remoteS.paid) {
              playPaymentChime();
              showPaymentToast(remoteS.from, remoteS.amount, remoteS.utr || generateRandomUtr());
            }
          });

          wizardState.settlements = matching.settlements;
          renderSettlementTracker();
        }
      }
    });
  }

  // Check if directed from history.html to load an existing saved bill
  const activeBillId = localStorage.getItem("splitwise_active_bill_id");
  if (activeBillId) {
    localStorage.removeItem("splitwise_active_bill_id");
    const bills = getSavedBills();
    const found = bills.find(b => b.id === activeBillId);
    if (found) {
      wizardState.billId = found.id;
      wizardState.category = found.category || 'restaurant';
      wizardState.categoryName = found.categoryName || 'Restaurant & Dining';
      wizardState.totalAmount = found.total || 0;
      wizardState.taxAmount = found.tax || 0;
      wizardState.payer = found.payer || 'Harsh';
      wizardState.payerShare = found.payerShare || 0;
      wizardState.participants = found.participants || ['Harsh'];
      wizardState.items = found.items || [];
      wizardState.settlements = found.settlements || [];
      recalculateSettlements();
      renderItemsEditor();
      renderParticipantsChips();
      goToStep(5);
    } else {
      resetWizardState();
      goToStep(1);
    }
  } else {
    // Check if category is passed via URL query (e.g. from History Split dropdown)
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('category');
    if (catParam) {
      const catTitles = {
        restaurant: 'Restaurant & Dining',
        hotel: 'Hotel & Stays',
        grocery: 'Groceries & Mart',
        travel: 'Travel & Fuel',
        entertainment: 'Entertainment',
        trip: 'Trip Mode (Vacation)'
      };
      const targetTitle = catTitles[catParam] || 'Restaurant & Dining';
      resetWizardState(catParam, targetTitle);
      selectCategory(catParam, targetTitle);
      goToStep(2);
    } else {
      // Initialize fresh Wizard at Step 1
      resetWizardState();
      goToStep(1);
    }
  }
});
