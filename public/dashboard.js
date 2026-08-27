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
  totalAmount: 3450,
  taxAmount: 400,
  payer: 'You (Harsh)',
  participants: ['You (Harsh)', 'Aarav', 'Neha', 'Rohan'],
  items: [
    { id: 1, name: 'Woodfired Truffle Pizza', price: 850, assigned: ['You (Harsh)', 'Aarav'] },
    { id: 2, name: 'Creamy Pesto Penne', price: 650, assigned: ['Neha'] },
    { id: 3, name: 'Peri Peri Loaded Fries', price: 420, assigned: ['You (Harsh)', 'Aarav', 'Neha', 'Rohan'] },
    { id: 4, name: 'Sizzling Brownie Sundae', price: 380, assigned: ['Rohan', 'Neha'] },
    { id: 5, name: 'Craft Mocktails (x3)', price: 750, assigned: ['You (Harsh)', 'Aarav', 'Rohan'] }
  ],
  upiId: 'harsh@okhdfcbank',
  settlements: [
    { from: 'Aarav', to: 'You (Harsh)', amount: 1005, paid: false },
    { from: 'Neha', to: 'You (Harsh)', amount: 1105, paid: false },
    { from: 'Rohan', to: 'You (Harsh)', amount: 940, paid: false }
  ]
};

document.addEventListener("DOMContentLoaded", () => {
  // 1. Auth Guard
  const user = getCurrentUser();
  const userNameEl = document.getElementById("user-name");
  const userAvatarEl = document.getElementById("user-avatar");
  const userStatusTag = document.getElementById("user-status-tag");
  const logoutBtn = document.getElementById("logout-btn");

  if (user) {
    if (userNameEl) userNameEl.textContent = user.displayName || "User";
    if (userAvatarEl) {
      userAvatarEl.textContent = (user.displayName || "U").charAt(0).toUpperCase();
    }
    if (userStatusTag) {
      userStatusTag.textContent = user.isGuest ? "Demo Mode" : "Online";
    }
  } else {
    // If no user found, initialize as Guest Demo automatically for seamless evaluation
    loginAsGuest("College Evaluator");
    return;
  }

  logoutBtn?.addEventListener("click", () => {
    logoutUser();
  });

  // 2. Navigation Tabs
  const dashTabs = document.querySelectorAll(".dash-tab");
  dashTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      dashTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const view = tab.dataset.view;
      if (view === "trips") {
        selectCategory('trip', 'Trip Mode (Vacation)');
        goToStep(1);
      } else if (view === "settlements") {
        goToStep(4);
      } else if (view === "wizard") {
        goToStep(wizardState.step);
      } else if (view === "engine") {
        goToStep(5);
      }
    });
  });

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
      renderItemsEditor();
    } else if (targetStep === 4) {
      renderUpiCards();
    } else if (targetStep === 5) {
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

  receiptFileInput?.addEventListener("change", () => {
    simulateReceiptScan();
  });

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

  // Quick Preset Sample Bills
  document.getElementById("load-sample-dinner")?.addEventListener("click", () => {
    wizardState.totalAmount = 3450;
    wizardState.taxAmount = 400;
    wizardState.participants = ['You (Harsh)', 'Aarav', 'Neha', 'Rohan'];
    wizardState.payer = 'You (Harsh)';
    wizardState.items = [
      { id: 1, name: 'Woodfired Truffle Pizza', price: 850, assigned: ['You (Harsh)', 'Aarav'] },
      { id: 2, name: 'Creamy Pesto Penne', price: 650, assigned: ['Neha'] },
      { id: 3, name: 'Peri Peri Loaded Fries', price: 420, assigned: ['You (Harsh)', 'Aarav', 'Neha', 'Rohan'] },
      { id: 4, name: 'Sizzling Brownie Sundae', price: 380, assigned: ['Rohan', 'Neha'] },
      { id: 5, name: 'Craft Mocktails (x3)', price: 750, assigned: ['You (Harsh)', 'Aarav', 'Rohan'] }
    ];
    wizardState.settlements = [
      { from: 'Aarav', to: 'You (Harsh)', amount: 1005, paid: false },
      { from: 'Neha', to: 'You (Harsh)', amount: 1105, paid: false },
      { from: 'Rohan', to: 'You (Harsh)', amount: 940, paid: false }
    ];
    simulateReceiptScan();
  });

  document.getElementById("load-sample-roadtrip")?.addEventListener("click", () => {
    wizardState.totalAmount = 9800;
    wizardState.taxAmount = 600;
    wizardState.participants = ['You (Harsh)', 'Siddharth', 'Pooja', 'Ananya'];
    wizardState.payer = 'Siddharth';
    wizardState.items = [
      { id: 1, name: 'Highway Tolls & Fuel', price: 4200, assigned: ['All 4'] },
      { id: 2, name: 'Beachside Seafood Platter', price: 3200, assigned: ['Harsh', 'Siddharth', 'Pooja'] },
      { id: 3, name: 'Snacks & Cold Drinks', price: 1800, assigned: ['All 4'] },
      { id: 4, name: 'Beach Resort Parking', price: 600, assigned: ['All 4'] }
    ];
    wizardState.settlements = [
      { from: 'You (Harsh)', to: 'Siddharth', amount: 2550, paid: false },
      { from: 'Pooja', to: 'Siddharth', amount: 2550, paid: false },
      { from: 'Ananya', to: 'Siddharth', amount: 1500, paid: false }
    ];
    simulateReceiptScan();
  });

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
                ${item.assigned.map(person => `<span class="dish-chip-tag">${person}</span>`).join("")}
              </div>
            </div>
            <span class="dish-price-tag">₹${item.price}</span>
          </div>
        `).join("");
      }
    }, 400);
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

  chatForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const prompt = chatInput.value.trim();
    if (!prompt) return;

    addChatMessage(prompt, true);
    chatInput.value = "";

    // Simulated AI response
    setTimeout(() => {
      addChatMessage("✓ Got it! Updated dish allocations between " + wizardState.participants.join(", ") + ". Subtotals & taxes balanced proportionally.", false);
      renderItemsEditor();
    }, 600);
  });

  // Quick Prompt Chips
  document.querySelectorAll(".prompt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const p = chip.dataset.prompt;
      if (p) {
        addChatMessage(p, true);
        setTimeout(() => {
          addChatMessage("✓ Smart Prompt Applied: Proportional item assignment updated.", false);
          renderItemsEditor();
        }, 500);
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

    // Compute collected vs pending
    let totalToCollect = 0;
    let collected = 0;

    wizardState.settlements.forEach(s => {
      totalToCollect += s.amount;
      if (s.paid) collected += s.amount;
    });

    const pending = totalToCollect - collected;
    const pct = totalToCollect > 0 ? Math.round((collected / totalToCollect) * 100) : 0;

    if (trackerCollectedAmt) trackerCollectedAmt.textContent = `₹${collected.toLocaleString()}`;
    if (trackerPendingAmt) trackerPendingAmt.textContent = `₹${pending.toLocaleString()}`;
    if (trackerProgressPct) trackerProgressPct.textContent = `${pct}%`;
    if (trackerProgFill) trackerProgFill.style.width = `${pct}%`;
    if (trackerProgressLabel) trackerProgressLabel.textContent = `₹${collected.toLocaleString()} of ₹${totalToCollect.toLocaleString()} settled`;

    if (!friendsSettlementList) return;
    friendsSettlementList.innerHTML = wizardState.settlements.map((s, idx) => `
      <div class="settle-row-card ${s.paid ? 'paid' : ''}" id="settle-card-${idx}">
        <div class="settle-person-info">
          <div class="settle-avatar">${s.from.charAt(0)}</div>
          <div class="settle-name-wrap">
            <strong>${s.from}</strong>
            <span class="settle-status-badge ${s.paid ? 'badge-paid' : 'badge-pending'}">
              <i class="ph-bold ${s.paid ? 'ph-check-circle' : 'ph-clock'}"></i>
              ${s.paid ? 'Payment Verified' : 'Payment Pending'}
            </span>
          </div>
        </div>

        <div class="settle-amount-col">
          <span class="settle-amount">₹${s.amount.toLocaleString()}</span>
        </div>

        <button class="btn-toggle-paid" onclick="togglePaymentStatus(${idx})">
          ${s.paid ? '<i class="ph-bold ph-check"></i> Paid' : 'Mark as Paid'}
        </button>
      </div>
    `).join("");
  }

  window.togglePaymentStatus = function(idx) {
    if (wizardState.settlements[idx]) {
      wizardState.settlements[idx].paid = !wizardState.settlements[idx].paid;
      renderSettlementTracker();
    }
  };

  document.getElementById("restart-wizard-btn")?.addEventListener("click", () => {
    wizardState.settlements.forEach(s => s.paid = false);
    goToStep(1);
  });

  document.getElementById("export-summary-btn")?.addEventListener("click", () => {
    const summary = encodeURIComponent(`⚡ SplitWise AI Summary (${wizardState.categoryName}): Total ₹${wizardState.totalAmount}. Pay via UPI: ${wizardState.upiId}`);
    window.open(`https://wa.me/?text=${summary}`, "_blank");
  });

  // Initialize Wizard at Step 1
  goToStep(1);
});
