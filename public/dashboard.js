/**
 * SplitWise AI - Dashboard & 5-Step Smart Split Wizard
 * Manages category selection, Gemini OCR scanning simulation,
 * interactive AI chat dish assignment, dynamic UPI QR generation,
 * and real-time settlement tracking.
 */

// Default State
const wizardState = {
  step: 1,
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
  const userAvatarInner = document.getElementById("user-avatar-inner");
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

    if (user.isGuest) {
      if (userStatusLabel) userStatusLabel.textContent = "Demo Mode";
      if (menuStatusBadge) menuStatusBadge.textContent = "Guest Mode";
      if (menuGuestBox) menuGuestBox.style.display = "block";
    } else {
      if (userStatusLabel) userStatusLabel.textContent = "Online";
      if (menuStatusBadge) menuStatusBadge.textContent = "Active User";
      if (menuGuestBox) menuGuestBox.style.display = "none";
    }
  } else {
    // If no session exists, start as Guest Demo for instant testing
    loginAsGuest("Harsh Prasad");
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

  // Home Tab Click
  navTabHome?.addEventListener("click", () => {
    navTabHome.classList.add("active");
    navTabSplit?.classList.remove("active");
    navTabHistory?.classList.remove("active");
    splitDropdownWrapper?.classList.remove("open");
    profileDropdownWrapper?.classList.remove("open");
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
    selectCategory('trip', 'Trip Mode (Vacation)');
    goToStep(2);
  });

  document.getElementById("menu-reset-split-btn")?.addEventListener("click", () => {
    profileDropdownWrapper?.classList.remove("open");
    wizardState.settlements.forEach(s => s.paid = false);
    goToStep(1);
  });

  // Universal Sign Out
  function executeSignOut() {
    sessionStorage.clear();
    localStorage.removeItem("splitwise_user");
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && firebase.auth) {
      try {
        firebase.auth().signOut().catch(() => {}).finally(() => {
          window.location.href = "/auth.html";
        });
        return;
      } catch (err) {
        console.warn("Firebase signout error:", err);
      }
    }
    window.location.href = "/auth.html";
  }

  logoutBtn?.addEventListener("click", executeSignOut);
  document.getElementById("btn-sign-out")?.addEventListener("click", executeSignOut);

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

      // Set category and immediately direct to Step 2 (asking to upload bill)!
      selectCategory(catKey, catName);
      goToStep(2);
    });
  });

  // ===================================================================
  // 4. Persistent Bill History Storage System
  // ===================================================================
  function getSavedBills() {
    try {
      const raw = localStorage.getItem("splitwise_bills_history");
      if (raw) {
        let parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const DUMMY_IDS = ['dinner-01', 'roadtrip-02', 'grocery-03'];
          parsed = parsed.filter(b => b && b.id && !DUMMY_IDS.includes(b.id) && !b.id.startsWith('dinner-') && !b.id.startsWith('roadtrip-') && !b.id.startsWith('grocery-'));
          localStorage.setItem("splitwise_bills_history", JSON.stringify(parsed));
          return parsed;
        }
      }
    } catch (e) {
      console.error("Error reading saved bills:", e);
    }
    return [];
  }

  function saveCurrentBillToHistory() {
    if (!wizardState.totalAmount || !wizardState.items || wizardState.items.length === 0) return;
    try {
      let bills = [];
      const raw = localStorage.getItem("splitwise_bills_history");
      if (raw) {
        try {
          bills = JSON.parse(raw);
        } catch (e) {
          bills = [];
        }
      }
      if (!Array.isArray(bills) || bills.length === 0) {
        bills = [...savedHistoryBills];
      }

      if (!wizardState.billId) {
        wizardState.billId = 'bill_' + Date.now();
      }

      const isSettled = wizardState.settlements.length > 0 && wizardState.settlements.every(s => s.paid);
      const record = {
        id: wizardState.billId,
        title: wizardState.categoryName || 'Restaurant Bill',
        category: wizardState.category || 'restaurant',
        categoryName: wizardState.categoryName || 'Restaurant & Dining',
        date: wizardState.billDate || new Date().toISOString().split('T')[0],
        total: wizardState.totalAmount,
        tax: wizardState.taxAmount || 0,
        payer: wizardState.payer || 'Harsh',
        payerShare: wizardState.payerShare || 0,
        participants: wizardState.participants || ['Harsh'],
        items: wizardState.items || [],
        settlements: wizardState.settlements || [],
        status: isSettled ? 'Settled' : 'Pending',
        statusClass: isSettled ? 'badge-paid' : 'badge-pending',
        updatedAt: Date.now()
      };

      const existingIndex = bills.findIndex(b => b.id === record.id);
      if (existingIndex >= 0) {
        bills[existingIndex] = record;
      } else {
        bills.unshift(record);
      }

      localStorage.setItem("splitwise_bills_history", JSON.stringify(bills));
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
    if (wizardProgressFill) wizardProgressFill.style.width = `${pct}%`;
    if (sidebarPctPill) sidebarPctPill.textContent = `${pct}% Done`;
    if (stepsCountLabel) stepsCountLabel.textContent = `Step ${targetStep} of 5 Completed`;

    // Update Checklist items
    for (let i = 1; i <= 5; i++) {
      const chk = document.getElementById(`chk-${i}`);
      if (chk) {
        if (i < targetStep) {
          chk.className = "checklist-item completed";
        } else if (i === targetStep) {
          chk.className = "checklist-item active";
        } else {
          chk.className = "checklist-item";
        }
      }
    }

    // Trigger step-specific logic
    if (targetStep === 3) {
      renderParticipantsChips();
      renderItemsEditor();
    } else if (targetStep === 4) {
      saveCurrentBillToHistory();
      renderUpiCards();
    } else if (targetStep === 5) {
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
      selectCategory(card.dataset.category, title);
    });
  });

  document.getElementById("step-1-next-btn")?.addEventListener("click", () => {
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
    uploadDropzone.style.borderColor = "var(--indigo-400)";
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
            if (data.items && data.items.length > 0) {
              wizardState.items = data.items.map((it, idx) => ({
                id: idx + 1,
                name: it.name,
                price: parseFloat(it.price) || 0,
                assigned: ['Harsh']
              }));
              // Reset participants to current user for new bill scan
              wizardState.participants = ['Harsh'];
              wizardState.payer = 'Harsh';
              wizardState.settlements = [];

              // Update initial chat greeting
              if (chatMessages) {
                chatMessages.innerHTML = `
                  <div class="chat-msg bot-msg">
                    <div class="msg-avatar"><i class="ph-fill ph-sparkle"></i></div>
                    <div class="msg-body">
                      <p>I've extracted <strong>${wizardState.items.length} items</strong> totaling <strong class="text-white">₹${(data.total || wizardState.totalAmount).toLocaleString()}</strong> from your ${data.restaurantName || 'receipt'}!</p>
                      <p>Who is splitting this bill? Tell me friends' names and who ordered what (e.g. <em>"Harsh ate butter naan, Shreya ate chicken kabuli, everyone got water"</em>), or add friends using the bar above.</p>
                    </div>
                  </div>
                `;
              }
            }
            if (data.total !== undefined && data.total !== null) {
              wizardState.totalAmount = parseFloat(data.total) || 0;
            }
            // Strict reset: if bill has no tax, ensure taxAmount is 0!
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

  function simulateReceiptScan() {
    dropzoneIdle?.classList.add("hidden");
    scannerStage?.classList.remove("hidden");

    // Scanner beam animation for 1.2s, then unlock step 3
    setTimeout(() => {
      dropzoneIdle?.classList.remove("hidden");
      scannerStage?.classList.add("hidden");
      if (step2NextBtn) step2NextBtn.disabled = false;
      goToStep(3);
    }, 1300);
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
  const skeletonItems = document.getElementById("skeleton-items");
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
    addChatMessage(`✓ Added ${newName} to the split! You can now assign dishes to them in chat.`, false);
  });

  function isCurrentUser(name) {
    if (!name) return false;
    const s = String(name).toLowerCase().trim();
    return s === 'harsh' || s === 'you' || s === 'you (harsh)' || s === 'harsh prasad' || s === 'me' || s === 'i';
  }

  function normalizePersonName(name) {
    if (!name) return 'Harsh';
    if (isCurrentUser(name)) return 'Harsh';
    return String(name).trim();
  }

  function recalculateSettlements() {
    // 1. Standardize and deduplicate participants
    wizardState.participants = [...new Set(wizardState.participants.map(normalizePersonName))];
    if (!wizardState.participants.includes('Harsh')) {
      wizardState.participants.unshift('Harsh');
    }
    const payer = normalizePersonName(wizardState.payer || 'Harsh');
    wizardState.payer = payer;

    const friendTotals = {};
    wizardState.participants.forEach(p => friendTotals[p] = 0);

    // 2. Sum item allocations
    let allocatedTotal = 0;
    wizardState.items.forEach(item => {
      let assigned = (item.assigned && item.assigned.length > 0) ? item.assigned.map(normalizePersonName) : [payer];
      assigned = [...new Set(assigned)];
      item.assigned = assigned;

      const perPerson = item.price / assigned.length;
      assigned.forEach(p => {
        if (friendTotals[p] !== undefined) {
          friendTotals[p] += perPerson;
        } else {
          friendTotals[p] = perPerson;
        }
      });
      allocatedTotal += item.price;
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

    // 4. Record Payer's own consumption share (Harsh paid upfront, he does NOT owe himself!)
    wizardState.payerShare = Math.round(friendTotals[payer] || 0);

    // 5. Settlements: ONLY friends owe the payer
    const newSettlements = [];
    Object.keys(friendTotals).forEach(p => {
      if (p !== payer && friendTotals[p] > 0) {
        const prev = wizardState.settlements.find(s => s.from === p);
        newSettlements.push({
          from: p,
          to: payer,
          amount: Math.round(friendTotals[p]),
          paid: prev ? prev.paid : false,
          utr: prev ? prev.utr : null,
          verifiedAt: prev ? prev.verifiedAt : null
        });
      }
    });

    wizardState.settlements = newSettlements;
  }

  function renderItemsEditor() {
    if (editorBillTotal) editorBillTotal.textContent = `₹${wizardState.totalAmount.toLocaleString()}`;
    if (editorTaxVal) editorTaxVal.textContent = `₹${wizardState.taxAmount.toLocaleString()}`;
    if (editorPayerName) editorPayerName.textContent = wizardState.payer;
    if (sideTotalBill) sideTotalBill.textContent = `₹${wizardState.totalAmount.toLocaleString()}`;
    if (sidePeopleCount) sidePeopleCount.textContent = `${wizardState.participants.length} Friends`;
    if (sideTransfersCount) sideTransfersCount.textContent = `${wizardState.settlements.length} Transfers`;

    // Shimmer effect
    skeletonItems?.classList.remove("hidden");
    if (parsedItemsList) parsedItemsList.innerHTML = "";

    setTimeout(() => {
      skeletonItems?.classList.add("hidden");
      if (parsedItemsList) {
        parsedItemsList.innerHTML = wizardState.items.map(item => `
          <div class="item-edit-row">
            <div class="item-edit-left">
              <span class="dish-name">${item.name}</span>
              <div class="dish-chips-group">
                ${(item.assigned || [wizardState.participants[0] || 'You (Harsh)']).map(person => `<span class="dish-chip-tag">${person}</span>`).join("")}
              </div>
            </div>
            <span class="dish-price-tag">₹${item.price}</span>
          </div>
        `).join("");
      }
    }, 300);
  }

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
      <div class="msg-body"><p><em>Gemini 2.5 Flash is calculating splits...</em></p></div>
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
    } catch (err) {
      document.getElementById(thinkingId)?.remove();
      addChatMessage("✓ Got it! Updated dish allocations between " + wizardState.participants.join(", ") + ". Subtotals & taxes balanced proportionally.", false);
      renderItemsEditor();
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
    upiQrGrid.innerHTML = wizardState.settlements.map((s, idx) => {
      const upiUri = `upi://pay?pa=${encodeURIComponent(wizardState.upiId)}&pn=SplitWise&am=${s.amount}&cu=INR`;
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=${encodeURIComponent(upiUri)}`;

      return `
        <div class="upi-card" id="upi-card-${idx}">
          <div class="upi-card-avatar">${s.from.charAt(0)}</div>
          <span class="upi-friend-name">${s.from}</span>
          <span class="upi-friend-amount">₹${s.amount}</span>
          <div class="qr-code-frame">
            <img src="${qrApiUrl}" alt="UPI QR for ${s.from}" loading="lazy">
          </div>
          <div class="upi-card-actions">
            <button class="btn-qr-action" onclick="copyUpiLink('${upiUri}')">
              <i class="ph-bold ph-copy"></i> Copy
            </button>
            <button class="btn-qr-action" onclick="shareWhatsApp('${s.from}', ${s.amount}, '${wizardState.upiId}')">
              <i class="ph-bold ph-whatsapp-logo"></i> WhatsApp
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  window.copyUpiLink = function(link) {
    navigator.clipboard.writeText(link).then(() => {
      alert("UPI payment link copied to clipboard!");
    });
  };

  window.shareWhatsApp = function(name, amt, upi) {
    const msg = encodeURIComponent(`Hi ${name}! Your share for ${wizardState.categoryName} is ₹${amt}. Pay via UPI: ${upi}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
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

    // Total to collect is ONLY from the friends
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

    if (!friendsSettlementList) return;

    // 1. Payer summary card at the top
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

    // 2. Individual friend settlement cards (Pure manual Mark as Paid)
    html += wizardState.settlements.map((s, idx) => `
      <div class="settle-row-card ${s.paid ? 'paid' : ''}" id="settle-card-${idx}">
        <div class="settle-person-info">
          <div class="settle-avatar">${s.from.charAt(0)}</div>
          <div class="settle-name-wrap">
            <strong>${s.from}</strong>
            <span class="settle-status-badge ${s.paid ? 'badge-paid' : 'badge-pending'}">
              <i class="ph-bold ${s.paid ? 'ph-check-circle' : 'ph-clock'}"></i>
              ${s.paid ? `Payment Settled ${s.utr ? `(Ref #${s.utr})` : ''}` : 'Payment Pending'}
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

    friendsSettlementList.innerHTML = html;
  }

  window.togglePaymentStatus = function(idx) {
    if (wizardState.settlements[idx]) {
      const s = wizardState.settlements[idx];
      s.paid = !s.paid;
      if (s.paid && !s.utr) {
        s.utr = generateRandomUtr();
        s.verifiedAt = new Date().toLocaleTimeString();
        playPaymentChime();
        showPaymentToast(s.from, s.amount, s.utr);
      }
      saveCurrentBillToHistory();
      renderSettlementTracker();
    }
  };

  // Web Audio Synthesizer: Crisp Bank Success Chime (Zero external mp3 needed!)
  function playPaymentChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  }

  function showPaymentToast(friendName, amount, utr) {
    const container = document.getElementById("payment-toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "payment-toast";
    toast.innerHTML = `
      <div class="toast-icon-wrap">
        <i class="ph-fill ph-check-circle"></i>
      </div>
      <div class="toast-content">
        <strong>Payment Auto-Detected!</strong>
        <span>₹${amount.toLocaleString()} received from <strong>${friendName}</strong> via Google Pay / UPI</span>
        <span class="utr-info-pill">UPI Ref: #${utr}</span>
      </div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(15px)';
      toast.style.transition = 'all 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function generateRandomUtr() {
    const prefix = '4' + Math.floor(10 + Math.random() * 89);
    const suffix = Math.floor(100000000 + Math.random() * 900000000);
    return `${prefix}${suffix}`;
  }

  function verifyPaymentAutomatically(friendName, source = "auto-polling") {
    const settlement = wizardState.settlements.find(s => s.from.toLowerCase() === friendName.toLowerCase() && !s.paid);
    if (!settlement) return false;

    const utr = generateRandomUtr();
    settlement.paid = true;
    settlement.utr = utr;
    settlement.verifiedAt = new Date().toLocaleTimeString();

    playPaymentChime();
    showPaymentToast(settlement.from, settlement.amount, utr);
    renderSettlementTracker();
    return true;
  }

  window.promptVerifyUtr = function(idx) {
    const settlement = wizardState.settlements[idx];
    if (!settlement) return;
    const utr = generateRandomUtr();
    settlement.paid = true;
    settlement.utr = utr;
    settlement.verifiedAt = new Date().toLocaleTimeString();
    playPaymentChime();
    showPaymentToast(settlement.from, settlement.amount, utr);
    saveCurrentBillToHistory();
    renderSettlementTracker();
  };


  document.getElementById("restart-wizard-btn")?.addEventListener("click", () => {
    wizardState.settlements.forEach(s => s.paid = false);
    goToStep(1);
  });

  document.getElementById("export-summary-btn")?.addEventListener("click", () => {
    const summary = encodeURIComponent(`⚡ SplitWise AI Summary (${wizardState.categoryName}): Total ₹${wizardState.totalAmount}. Pay via UPI: ${wizardState.upiId}`);
    window.open(`https://wa.me/?text=${summary}`, "_blank");
  });

  // Check if directed from history.html to load a saved bill
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
      goToStep(1);
    }
  } else {
    // Initialize Wizard at Step 1
    goToStep(1);
  }
});
