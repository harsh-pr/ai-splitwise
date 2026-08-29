/**
 * SplitWise AI - Dedicated History Controller
 * Manages persistent bill records, lifetime metrics, search & filters,
 * line item breakdowns, and real-time Firestore multi-device sync.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Auth Guard: If not logged in and not guest, redirect to /auth.html
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "/auth.html";
    return;
  }

  // Populate User Profile Header and Dropdown
  const userAvatarInner = document.getElementById("user-avatar-initial");
  const userDisplayName = document.getElementById("user-display-name");
  const userStatusLabel = document.getElementById("user-status-label");
  const menuAvatarLg = document.getElementById("menu-avatar-lg");
  const menuUserName = document.getElementById("menu-user-name");
  const menuUserEmail = document.getElementById("menu-user-email");
  const menuStatusBadge = document.getElementById("menu-status-badge");
  const menuGuestBox = document.getElementById("menu-guest-box");

  if (user) {
    const name = user.displayName || (user.isGuest ? "Guest Evaluator" : "Harsh Prasad");
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
      if (menuGuestBox) menuGuestBox.classList.remove("hidden");
    } else {
      if (userStatusLabel) userStatusLabel.textContent = "Online";
      if (menuStatusBadge) menuStatusBadge.textContent = "Active User";
      if (menuGuestBox) menuGuestBox.classList.add("hidden");
    }
  }

  // Category Icons Map
  const categoryIconMap = {
    restaurant: { icon: 'ph-fork-knife', colorClass: 'cat-emerald' },
    hotel: { icon: 'ph-bed', colorClass: 'cat-indigo' },
    grocery: { icon: 'ph-shopping-cart', colorClass: 'cat-cyan' },
    travel: { icon: 'ph-taxi', colorClass: 'cat-amber' },
    entertainment: { icon: 'ph-ticket', colorClass: 'cat-rose' },
    trip: { icon: 'ph-airplane-tilt', colorClass: 'cat-violet' }
  };

  // DOM Elements
  const statTotalBills = document.getElementById("stat-total-bills");
  const statTotalSpend = document.getElementById("stat-total-spend");
  const statTotalSettled = document.getElementById("stat-total-settled");
  const statTotalPending = document.getElementById("stat-total-pending");

  const historySearchInput = document.getElementById("history-search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  const categoryFilterPills = document.querySelectorAll("#category-filter-pills .filter-pill");
  const statusFilterSelect = document.getElementById("status-filter-select");
  const historyBillsList = document.getElementById("history-bills-list");
  const historyEmptyState = document.getElementById("history-empty-state");
  const emptyStateMessage = document.getElementById("empty-state-message");

  let activeCategory = "all";
  let activeStatus = "all";
  let activeSearchTerm = "";

  // 1. Data Retrieval
  function getAllBills() {
    return typeof getLocalBills === "function" ? getLocalBills() : [];
  }

  // 2. Compute Lifetime Statistics
  function updateStats(bills) {
    let totalBills = bills.length;
    let totalSpend = 0;
    let totalSettled = 0;
    let totalPending = 0;

    bills.forEach(bill => {
      totalSpend += (Number(bill.total) || 0);
      if (Array.isArray(bill.settlements)) {
        bill.settlements.forEach(s => {
          if (s.paid) {
            totalSettled += (Number(s.amount) || 0);
          } else {
            totalPending += (Number(s.amount) || 0);
          }
        });
      }
    });

    if (statTotalBills) statTotalBills.textContent = totalBills;
    if (statTotalSpend) statTotalSpend.textContent = `₹${totalSpend.toLocaleString()}`;
    if (statTotalSettled) statTotalSettled.textContent = `₹${totalSettled.toLocaleString()}`;
    if (statTotalPending) statTotalPending.textContent = `₹${totalPending.toLocaleString()}`;

    if (typeof updateProfileTotalSettled === "function") {
      updateProfileTotalSettled(bills);
    }
  }

  // 3. Render Bills Cards
  async function renderHistory(syncFromCloud = false) {
    let allBills = getAllBills();

    if (syncFromCloud && typeof loadUserBills === "function") {
      try {
        allBills = await loadUserBills();
      } catch (err) {
        console.warn("Could not sync bills from cloud:", err);
      }
    }

    updateStats(allBills);

    // Apply Filter & Search
    const filtered = allBills.filter(bill => {
      // Category Filter
      if (activeCategory !== "all" && bill.category !== activeCategory) return false;

      // Status Filter
      const isSettled = bill.settlements && bill.settlements.length > 0 && bill.settlements.every(s => s.paid);
      if (activeStatus === "settled" && !isSettled) return false;
      if (activeStatus === "pending" && isSettled) return false;

      // Search Term Filter
      if (activeSearchTerm) {
        const term = activeSearchTerm.toLowerCase();
        const titleMatch = (bill.title || "").toLowerCase().includes(term);
        const catMatch = (bill.categoryName || "").toLowerCase().includes(term);
        const friendsMatch = Array.isArray(bill.participants) && bill.participants.some(p => p.toLowerCase().includes(term));
        const itemsMatch = Array.isArray(bill.items) && bill.items.some(i => i.name.toLowerCase().includes(term));
        if (!titleMatch && !catMatch && !friendsMatch && !itemsMatch) return false;
      }

      return true;
    });

    if (!historyBillsList) return;

    if (filtered.length === 0) {
      historyBillsList.innerHTML = "";
      historyEmptyState?.classList.remove("hidden");
      if (emptyStateMessage) {
        emptyStateMessage.textContent = activeSearchTerm
          ? `No bills found matching "${activeSearchTerm}". Try a different keyword.`
          : "No bills saved yet. Create a new split on the Dashboard to start!";
      }
      return;
    }

    historyEmptyState?.classList.add("hidden");

    historyBillsList.innerHTML = filtered.map((bill) => {
      const catConfig = categoryIconMap[bill.category] || { icon: 'ph-receipt', colorClass: 'cat-emerald' };
      const isSettled = bill.settlements && bill.settlements.length > 0 && bill.settlements.every(s => s.paid);
      const statusClass = isSettled ? 'badge-paid' : 'badge-pending';
      const statusText = isSettled ? 'Settled' : 'Pending';

      return `
        <div class="history-bill-card" id="card-${bill.id}">
          <div class="bill-card-top">
            <div class="bill-title-group">
              <div class="bill-cat-icon ${catConfig.colorClass}">
                <i class="ph-bold ${catConfig.icon}"></i>
              </div>
              <div class="bill-header-info">
                <h3>${bill.title}</h3>
                <div class="bill-sub-meta">
                  <span>📅 ${bill.date || 'Recent'}</span>
                  <span>•</span>
                  <span>${bill.categoryName || 'General Split'}</span>
                  <span>•</span>
                  <span>${(bill.items || []).length} Line Items</span>
                </div>
              </div>
            </div>

            <div class="bill-amount-badge-group">
              <span class="bill-total-price">₹${(Number(bill.total) || 0).toLocaleString()}</span>
              <span class="bill-status-pill ${statusClass}">${statusText}</span>
            </div>
          </div>

          <!-- Participants & Payer Row (Click any name to expand user-wise breakdown) -->
          <div class="bill-participants-row">
            <span class="payer-tag-pill" onclick="toggleHistoryUserBreakdown('${bill.id}', '${bill.payer || 'Harsh'}', event)" style="cursor: pointer;" title="Click to view what ${bill.payer || 'Harsh'} ordered">
              <i class="ph-bold ph-shield-check"></i> Paid by ${bill.payer || 'Harsh'} <i class="ph-bold ph-caret-down" style="font-size: 0.65rem; margin-left: 2px;"></i>
            </span>
            ${(bill.participants || []).map(p => {
              const settlement = (bill.settlements || []).find(s => s.from === p);
              const isPaid = settlement ? settlement.paid : (p === bill.payer);
              return `
                <span class="friend-status-chip ${isPaid ? 'is-paid' : 'is-pending'}" onclick="toggleHistoryUserBreakdown('${bill.id}', '${p}', event)" style="cursor: pointer;" title="Click to view what ${p} ordered">
                  <i class="ph-bold ${isPaid ? 'ph-check-circle' : 'ph-clock'}"></i>
                  ${p} <i class="ph-bold ph-caret-down" style="font-size: 0.65rem; margin-left: 2px;"></i>
                </span>
              `;
            }).join("")}
          </div>

          <!-- Dynamic User-Wise Itemized Breakdown Box -->
          <div class="history-user-breakdown-box hidden" id="user-breakdown-box-${bill.id}"></div>

          <!-- Expandable Breakdown Drawer -->
          <div class="bill-expand-drawer" id="drawer-${bill.id}">
            <div class="drawer-grid">
              <!-- Line Items -->
              <div class="drawer-col">
                <h4>Dish / Line Item Allocations</h4>
                <div class="drawer-items-list">
                  ${(bill.items && bill.items.length > 0) ? bill.items.map(it => `
                    <div class="drawer-row">
                      <span>${it.name} <small style="color: var(--text-muted);">(${(it.assigned || []).join(", ")})</small></span>
                      <strong class="text-white">₹${it.price}</strong>
                    </div>
                  `).join("") : '<div class="drawer-row text-muted"><span>No line items specified.</span></div>'}
                </div>
              </div>

              <!-- Debts Breakdown -->
              <div class="drawer-col">
                <h4>Settlement Balances</h4>
                <div class="drawer-settlements-list">
                  ${(bill.settlements && bill.settlements.length > 0) ? bill.settlements.map(s => `
                    <div class="drawer-row">
                      <span><strong>${s.from}</strong> owes ${s.to || bill.payer}</span>
                      <div class="flex-align-center gap-2">
                        <strong class="${s.paid ? 'text-emerald' : 'text-rose'}">₹${s.amount}</strong>
                        <span style="font-size: 0.72rem; color: ${s.paid ? 'var(--emerald-400)' : 'var(--rose-400)'};">
                          ${s.paid ? '(Paid)' : '(Pending)'}
                        </span>
                      </div>
                    </div>
                  `).join("") : '<div class="drawer-row"><span>All settled upfront.</span></div>'}
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="bill-card-bottom">
            <button class="btn-toggle-expand" onclick="toggleBillDrawer('${bill.id}')" id="expand-btn-${bill.id}">
              <i class="ph-bold ph-caret-down"></i>
              <span>View Line Items & Settlements</span>
            </button>

            <div class="bill-actions-right">
              <button class="btn-card-action btn-open-dash" onclick="openBillInDashboard('${bill.id}')">
                <i class="ph-bold ph-arrow-square-out"></i>
                <span>Open in Dashboard</span>
              </button>
              <button class="btn-card-action btn-share-wa" onclick="shareBillWhatsApp('${bill.id}')">
                <i class="ph-bold ph-whatsapp-logo"></i>
                <span>Share</span>
              </button>
              <button class="btn-card-action btn-delete-bill" onclick="deleteBill('${bill.id}')" title="Delete from history">
                <i class="ph-bold ph-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  // 4. User-Wise Breakdown on Name Click
  window.toggleHistoryUserBreakdown = function(billId, personName, event) {
    if (event) event.stopPropagation();
    const box = document.getElementById(`user-breakdown-box-${billId}`);
    if (!box) return;

    // If already showing this person, toggle off
    if (!box.classList.contains("hidden") && box.getAttribute("data-person") === personName) {
      box.classList.add("hidden");
      return;
    }

    const allBills = getAllBills();
    const bill = allBills.find(b => b.id === billId);
    if (!bill) return;

    const assignedItems = [];
    let itemsSubtotal = 0;
    let allItemsTotal = 0;

    (bill.items || []).forEach(it => {
      const assigned = (it.assigned && it.assigned.length > 0) ? it.assigned : [bill.payer || 'Harsh'];
      allItemsTotal += (Number(it.price) || 0);
      if (assigned.includes(personName)) {
        const share = Math.round(((Number(it.price) || 0) / assigned.length) * 100) / 100;
        itemsSubtotal += share;
        assignedItems.push({
          name: it.name,
          totalPrice: it.price,
          sharedWith: assigned,
          shareAmount: share
        });
      }
    });

    const taxAmount = Number(bill.tax) || 0;
    let taxShare = 0;
    if (allItemsTotal > 0 && taxAmount > 0) {
      taxShare = Math.round((itemsSubtotal / allItemsTotal) * taxAmount);
    }
    const grandTotal = Math.round(itemsSubtotal + taxShare);
    const settlement = (bill.settlements || []).find(s => s.from === personName);
    const isPaid = settlement ? settlement.paid : (personName === bill.payer);

    box.setAttribute("data-person", personName);
    box.innerHTML = `
      <div class="user-breakdown-header">
        <div class="flex-align-center gap-2">
          <div class="breakdown-avatar">${personName.charAt(0)}</div>
          <div>
            <strong>${personName} ${personName === bill.payer ? '(Payer)' : ''}</strong>
            <span class="breakdown-status-tag ${isPaid ? 'paid' : 'pending'}">
              ${isPaid ? '✓ Paid / Settled' : '⏳ Pending Payment'}
            </span>
          </div>
        </div>
        <button class="btn-close-breakdown" onclick="closeHistoryBreakdown('${billId}')">
          <i class="ph-bold ph-x"></i>
        </button>
      </div>

      <div class="breakdown-items-table">
        ${assignedItems.length > 0 ? assignedItems.map(it => `
          <div class="breakdown-item-row">
            <div>
              <span class="item-name-text">${it.name}</span>
              <small class="item-shared-info">${it.sharedWith.length > 1 ? `Shared with ${it.sharedWith.filter(p => p !== personName).join(', ')} (${it.sharedWith.length} people)` : 'Sole order'}</small>
            </div>
            <strong>₹${it.shareAmount.toLocaleString()}</strong>
          </div>
        `).join('') : '<div class="breakdown-item-row"><span>Split equally across general bill.</span><strong>₹' + grandTotal + '</strong></div>'}

        ${taxShare > 0 ? `
          <div class="breakdown-item-row tax-row">
            <span>Proportional GST & Taxes</span>
            <strong>₹${taxShare.toLocaleString()}</strong>
          </div>
        ` : ''}

        <div class="breakdown-item-row total-row">
          <span>Total Individual Share</span>
          <strong class="text-emerald">₹${grandTotal.toLocaleString()}</strong>
        </div>
      </div>
    `;

    box.classList.remove("hidden");
  };

  window.closeHistoryBreakdown = function(billId) {
    const box = document.getElementById(`user-breakdown-box-${billId}`);
    if (box) box.classList.add("hidden");
  };

  // 5. Action Handlers
  window.toggleBillDrawer = function(billId) {
    const drawer = document.getElementById(`drawer-${billId}`);
    const btn = document.getElementById(`expand-btn-${billId}`);
    if (!drawer) return;

    const isOpen = drawer.classList.contains("open");
    if (isOpen) {
      drawer.classList.remove("open");
      btn.innerHTML = `<i class="ph-bold ph-caret-down"></i><span>View Line Items & Settlements</span>`;
    } else {
      drawer.classList.add("open");
      btn.innerHTML = `<i class="ph-bold ph-caret-up"></i><span>Hide Line Items & Settlements</span>`;
    }
  };

  window.openBillInDashboard = function(billId) {
    localStorage.setItem("splitwise_active_bill_id", billId);
    window.location.href = "/dashboard.html";
  };

  async function generateSinglePersonQrCardBlob(name, amount, upiId, payerName, billTitle) {
    const upi = upiId || getDefaultUpiId();
    const payer = payerName || 'SplitWise';
    const title = (billTitle || 'Bill Split').toUpperCase();
    const amt = Number(amount) || 0;

    const width = 360;
    const height = 480;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // 1. Draw Obsidian Background & Glow
    ctx.fillStyle = "#0d0d12";
    ctx.fillRect(0, 0, width, height);

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "rgba(16, 185, 129, 0.14)");
    bgGrad.addColorStop(1, "rgba(6, 182, 212, 0.04)");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Card Container Border
    roundRect(14, 14, width - 28, height - 28, 20);
    ctx.fillStyle = "#181822";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.stroke();

    // 2. Header
    ctx.textAlign = "center";
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("SPLITWISE AI • PAYMENT QR", width / 2, 42);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(`Expense: ${title}`, width / 2, 60);

    // 3. QR Image in White Rounded Box
    const qrBoxSize = 200;
    const qrBoxX = (width - qrBoxSize) / 2;
    const qrBoxY = 74;

    roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    const upiUri = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(payer)}&am=${amt}&cu=INR`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=0&data=${encodeURIComponent(upiUri)}`;

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = qrUrl;
      });
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, qrBoxX + 10, qrBoxY + 10, qrBoxSize - 20, qrBoxSize - 20);
      }
    } catch (e) {
      console.warn("QR draw error", e);
    }

    // 4. Friend Name Under QR
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(name, width / 2, qrBoxY + qrBoxSize + 36);

    // 5. Amount to Pay
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(`Pay ₹${amt}`, width / 2, qrBoxY + qrBoxSize + 68);

    // 6. Pending Status Label
    ctx.fillStyle = "#f43f5e";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("⏳ PENDING PAYMENT", width / 2, qrBoxY + qrBoxSize + 88);

    // 7. Footer Subtitle
    ctx.fillStyle = "#71717a";
    ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(`Payer: ${payer} • UPI: ${upi}`, width / 2, height - 22);

    return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  }

  window.shareBillWhatsApp = async function(billId) {
    const bills = getAllBills();
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;

    let text = `🧾 *SPLITWISE AI - DETAILED BILL BREAKDOWN*\n`;
    text += `📌 *Expense:* ${bill.title || 'Bill Split'}\n`;
    text += `📅 *Date:* ${bill.date || new Date().toLocaleDateString()}\n`;
    text += `💰 *Total Bill:* ₹${bill.total}\n`;
    text += `👑 *Payer:* ${bill.payer} (Paid Full Bill Upfront)\n\n`;

    // 1. Detailed Dish Allocations (Who ate what)
    if (Array.isArray(bill.items) && bill.items.length > 0) {
      text += `🍽️ *ITEMIZED DISHES & ALLOCATIONS:*\n`;
      bill.items.forEach(it => {
        const assignedNames = Array.isArray(it.assigned) && it.assigned.length > 0 ? it.assigned.join(", ") : "Everyone";
        text += `• *${it.name}* — ₹${it.price}\n  ↳ Shared with: ${assignedNames}\n`;
      });
      text += `\n`;
    }

    const unpaidSettlements = (bill.settlements || []).filter(s => !s.paid && Number(s.amount) > 0);

    // 2. Individual Settlements Breakdown
    if (Array.isArray(bill.settlements) && bill.settlements.length > 0) {
      text += `👥 *INDIVIDUAL SHARES & BALANCES:*\n`;
      bill.settlements.forEach(s => {
        text += `• *${s.from}:* owes ${s.to || bill.payer}: *₹${s.amount}* [${s.paid ? '✅ Settled' : '⏳ Pending'}]\n`;
      });
      text += `\n`;
    }

    if (bill.upiId) {
      text += `💳 *Payer UPI ID:* \`${bill.upiId}\`\n\n`;
    }

    text += `✨ _Calculated with SplitWise AI_`;

    // Only generate & attach separate images if there are UNPAID friends!
    if (unpaidSettlements.length > 0) {
      const files = await Promise.all(unpaidSettlements.map(async s => {
        const blob = await generateSinglePersonQrCardBlob(s.from, s.amount, bill.upiId, bill.payer, bill.title);
        return new File([blob], `UPI_QR_${s.from}_Rs${s.amount}.png`, { type: "image/png" });
      }));

      if (files.length > 0 && navigator.canShare) {
        try {
          if (navigator.canShare({ files })) {
            await navigator.share({ title: bill.title || 'Bill Summary', text, files });
            return;
          }
        } catch (e) {
          console.warn("[Web Share API]", e);
        }
      }

      if (files.length > 0 && navigator.clipboard && window.ClipboardItem) {
        try {
          const firstBlob = await generateSinglePersonQrCardBlob(unpaidSettlements[0].from, unpaidSettlements[0].amount, bill.upiId, bill.payer, bill.title);
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': firstBlob })]);
        } catch (e) {
          console.warn("[Clipboard Copy Error]", e);
        }
      }
    }

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  window.deleteBill = async function(billId) {
    if (!confirm("Are you sure you want to delete this bill from history?")) return;
    const card = document.getElementById(`card-${billId}`);
    if (card) {
      card.style.opacity = '0.3';
      card.style.pointerEvents = 'none';
    }
    if (typeof deleteBillRecord === "function") {
      await deleteBillRecord(billId);
    }
    renderHistory(false);
  };

  // 5. Search & Filter Listeners
  historySearchInput?.addEventListener("input", (e) => {
    activeSearchTerm = e.target.value.trim();
    if (clearSearchBtn) {
      if (activeSearchTerm) {
        clearSearchBtn.classList.remove("hidden");
      } else {
        clearSearchBtn.classList.add("hidden");
      }
    }
    renderHistory();
  });

  clearSearchBtn?.addEventListener("click", () => {
    if (historySearchInput) historySearchInput.value = "";
    activeSearchTerm = "";
    clearSearchBtn.classList.add("hidden");
    renderHistory();
  });

  categoryFilterPills.forEach(pill => {
    pill.addEventListener("click", () => {
      categoryFilterPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      activeCategory = pill.dataset.cat;
      renderHistory();
    });
  });

  statusFilterSelect?.addEventListener("change", (e) => {
    activeStatus = e.target.value;
    renderHistory();
  });

  // 6. Profile Dropdown Navigation
  const profileDropdownWrapper = document.getElementById("profile-dropdown-wrapper");
  const profilePillTrigger = document.getElementById("profile-pill-trigger");
  const splitDropdownWrapper = document.getElementById("split-dropdown-wrapper");
  const navTabSplit = document.getElementById("nav-tab-split");

  profilePillTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    splitDropdownWrapper?.classList.remove("open");
    profileDropdownWrapper?.classList.toggle("open");
  });

  navTabSplit?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdownWrapper?.classList.remove("open");
    splitDropdownWrapper?.classList.toggle("open");
  });

  // Default UPI ID System
  function getDefaultUpiId() {
    return localStorage.getItem("splitwise_default_upi") || "harsh@okhdfcbank";
  }

  function setDefaultUpiId(newUpi) {
    if (!newUpi || !newUpi.includes("@")) {
      alert("Please enter a valid UPI ID (e.g. yourname@okhdfcbank or 9876543210@paytm)");
      return false;
    }
    const cleanUpi = newUpi.trim().toLowerCase();
    localStorage.setItem("splitwise_default_upi", cleanUpi);
    const menuUpiVal = document.getElementById("menu-upi-val");
    if (menuUpiVal) menuUpiVal.textContent = cleanUpi;
    return true;
  }

  // UPI Edit Modal Listeners
  const upiModal = document.getElementById("upi-edit-modal-overlay");
  const btnEditUpi = document.getElementById("btn-edit-upi");
  const closeUpiModalBtn = document.getElementById("close-upi-modal-btn");
  const cancelUpiModalBtn = document.getElementById("cancel-upi-modal-btn");
  const saveUpiModalBtn = document.getElementById("save-upi-modal-btn");
  const customUpiInput = document.getElementById("custom-upi-input");
  const menuUpiVal = document.getElementById("menu-upi-val");

  // Load saved default UPI on startup
  const initialUpi = getDefaultUpiId();
  if (menuUpiVal) menuUpiVal.textContent = initialUpi;

  btnEditUpi?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdownWrapper?.classList.remove("open");
    if (customUpiInput) customUpiInput.value = getDefaultUpiId();
    upiModal?.classList.remove("hidden");
    customUpiInput?.focus();
  });

  const closeUpiModal = () => upiModal?.classList.add("hidden");
  closeUpiModalBtn?.addEventListener("click", closeUpiModal);
  cancelUpiModalBtn?.addEventListener("click", closeUpiModal);

  saveUpiModalBtn?.addEventListener("click", () => {
    const val = customUpiInput?.value;
    if (setDefaultUpiId(val)) {
      closeUpiModal();
    }
  });

  document.addEventListener("click", (e) => {
    if (!profileDropdownWrapper?.contains(e.target)) {
      profileDropdownWrapper?.classList.remove("open");
    }
    if (!splitDropdownWrapper?.contains(e.target)) {
      splitDropdownWrapper?.classList.remove("open");
    }
  });

  // Sign Out Handler
  document.getElementById("btn-sign-out")?.addEventListener("click", () => {
    if (typeof logoutUser === "function") logoutUser();
  });
  document.getElementById("logout-btn")?.addEventListener("click", () => {
    if (typeof logoutUser === "function") logoutUser();
  });

  // 7. Event listeners for local updates
  window.addEventListener('splitwise_bills_updated', (e) => {
    renderHistory(false);
  });

  // Initial Render from local cache
  renderHistory(false);

  // Sync with Firestore Cloud when Auth resolves
  if (typeof loadUserBills === "function") {
    loadUserBills().then(() => {
      renderHistory(false);
    }).catch(() => {});
  }

  // Subscribe to real-time updates from Mobile & PC
  if (typeof subscribeToUserBills === "function") {
    subscribeToUserBills(() => {
      renderHistory(false);
    });
  }
});
