/**
 * SplitWise AI - Dedicated History Controller
 * Manages persistent bill records, lifetime metrics, search & filters,
 * line item breakdowns, and dashboard loading.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Category Icons Map
  const categoryIconMap = {
    restaurant: { icon: 'ph-fork-knife', colorClass: 'cat-emerald' },
    hotel: { icon: 'ph-bed', colorClass: 'cat-indigo' },
    grocery: { icon: 'ph-shopping-cart', colorClass: 'cat-cyan' },
    travel: { icon: 'ph-taxi', colorClass: 'cat-amber' },
    entertainment: { icon: 'ph-ticket', colorClass: 'cat-rose' },
    trip: { icon: 'ph-airplane-tilt', colorClass: 'cat-violet' }
  };

  // Default Sample Bills if no history exists yet
  const defaultSampleBills = [
    {
      id: 'dinner-01',
      title: 'Friday Bistro Dinner & Mocktails',
      category: 'restaurant',
      categoryName: 'Restaurant & Dining',
      date: '2026-08-26',
      total: 3450,
      tax: 400,
      payer: 'Harsh',
      payerShare: 1000,
      participants: ['Harsh', 'Aarav', 'Neha', 'Rohan'],
      status: 'Settled',
      statusClass: 'badge-paid',
      items: [
        { id: 1, name: 'Woodfired Truffle Pizza', price: 850, assigned: ['Harsh', 'Aarav'] },
        { id: 2, name: 'Creamy Pesto Penne', price: 650, assigned: ['Neha'] },
        { id: 3, name: 'Peri Peri Loaded Fries', price: 420, assigned: ['Harsh', 'Aarav', 'Neha', 'Rohan'] },
        { id: 4, name: 'Sizzling Brownie Sundae', price: 380, assigned: ['Rohan', 'Neha'] },
        { id: 5, name: 'Craft Mocktails (x3)', price: 750, assigned: ['Harsh', 'Aarav', 'Rohan'] }
      ],
      settlements: [
        { from: 'Aarav', to: 'Harsh', amount: 800, paid: true, utr: '428190283910' },
        { from: 'Neha', to: 'Harsh', amount: 850, paid: true, utr: '491029381029' },
        { from: 'Rohan', to: 'Harsh', amount: 800, paid: true, utr: '419203918204' }
      ]
    },
    {
      id: 'roadtrip-02',
      title: 'Goa Coastal Road Trip Expenses',
      category: 'trip',
      categoryName: 'Trip Mode (Vacation)',
      date: '2026-08-24',
      total: 9800,
      tax: 600,
      payer: 'Harsh',
      payerShare: 3250,
      participants: ['Harsh', 'Siddharth', 'Pooja', 'Ananya'],
      status: 'Pending',
      statusClass: 'badge-pending',
      items: [
        { id: 1, name: 'Highway Tolls & Fuel', price: 4200, assigned: ['Harsh', 'Siddharth', 'Pooja', 'Ananya'] },
        { id: 2, name: 'Beachside Seafood Platter', price: 3200, assigned: ['Harsh', 'Siddharth', 'Pooja'] },
        { id: 3, name: 'Snacks & Cold Drinks', price: 1800, assigned: ['Harsh', 'Siddharth', 'Pooja', 'Ananya'] },
        { id: 4, name: 'Beach Resort Parking', price: 600, assigned: ['Harsh', 'Siddharth', 'Pooja', 'Ananya'] }
      ],
      settlements: [
        { from: 'Siddharth', to: 'Harsh', amount: 2550, paid: true, utr: '419283019284' },
        { from: 'Pooja', to: 'Harsh', amount: 2550, paid: false },
        { from: 'Ananya', to: 'Harsh', amount: 1450, paid: false }
      ]
    }
  ];

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
    try {
      const raw = localStorage.getItem("splitwise_bills_history");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Error reading saved bills:", e);
    }
    // Seed default sample bills into localStorage
    localStorage.setItem("splitwise_bills_history", JSON.stringify(defaultSampleBills));
    return defaultSampleBills;
  }

  function saveBills(bills) {
    localStorage.setItem("splitwise_bills_history", JSON.stringify(bills));
  }

  // 2. Compute Lifetime Statistics
  function updateStats(bills) {
    let totalBills = bills.length;
    let totalSpend = 0;
    let totalSettled = 0;
    let totalPending = 0;

    bills.forEach(bill => {
      totalSpend += (bill.total || 0);
      if (Array.isArray(bill.settlements)) {
        bill.settlements.forEach(s => {
          if (s.paid) {
            totalSettled += (s.amount || 0);
          } else {
            totalPending += (s.amount || 0);
          }
        });
      }
    });

    if (statTotalBills) statTotalBills.textContent = totalBills;
    if (statTotalSpend) statTotalSpend.textContent = `₹${totalSpend.toLocaleString()}`;
    if (statTotalSettled) statTotalSettled.textContent = `₹${totalSettled.toLocaleString()}`;
    if (statTotalPending) statTotalPending.textContent = `₹${totalPending.toLocaleString()}`;
  }

  // 3. Render Bills Cards
  function renderHistory() {
    const allBills = getAllBills();
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
          : "No bills found for the selected category filter.";
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
              <span class="bill-total-price">₹${(bill.total || 0).toLocaleString()}</span>
              <span class="bill-status-pill ${statusClass}">${statusText}</span>
            </div>
          </div>

          <!-- Participants & Payer Row -->
          <div class="bill-participants-row">
            <span class="payer-tag-pill">
              <i class="ph-bold ph-shield-check"></i> Paid by ${bill.payer || 'Harsh'}
            </span>
            ${(bill.participants || []).map(p => {
              const settlement = (bill.settlements || []).find(s => s.from === p);
              const isPaid = settlement ? settlement.paid : (p === bill.payer);
              return `
                <span class="friend-status-chip ${isPaid ? 'is-paid' : 'is-pending'}">
                  <i class="ph-bold ${isPaid ? 'ph-check-circle' : 'ph-clock'}"></i>
                  ${p}
                </span>
              `;
            }).join("")}
          </div>

          <!-- Expandable Breakdown Drawer -->
          <div class="bill-expand-drawer" id="drawer-${bill.id}">
            <div class="drawer-grid">
              <!-- Line Items -->
              <div class="drawer-col">
                <h4>Dish / Line Item Allocations</h4>
                <div class="drawer-items-list">
                  ${(bill.items || []).map(it => `
                    <div class="drawer-row">
                      <span>${it.name} <small style="color: var(--text-muted);">(${(it.assigned || []).join(", ")})</small></span>
                      <strong class="text-white">₹${it.price}</strong>
                    </div>
                  `).join("")}
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
                          ${s.paid ? `(Paid ${s.utr ? `Ref #${s.utr}` : ''})` : '(Pending)'}
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

  // 4. Action Handlers
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

  window.shareBillWhatsApp = function(billId) {
    const bills = getAllBills();
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;

    let text = `⚡ *SplitWise AI Summary: ${bill.title}*\n`;
    text += `💰 Total Bill: ₹${bill.total}\n`;
    text += `👤 Paid Upfront by: ${bill.payer}\n\n`;
    text += `*Settlements Breakdown:*\n`;

    if (bill.settlements && bill.settlements.length > 0) {
      bill.settlements.forEach(s => {
        text += `• ${s.from}: ₹${s.amount} - ${s.paid ? '✅ Paid' : '⏳ Pending'}\n`;
      });
    }

    text += `\nPay your share via UPI!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  window.deleteBill = function(billId) {
    if (!confirm("Are you sure you want to delete this bill from history?")) return;
    const bills = getAllBills().filter(b => b.id !== billId);
    saveBills(bills);
    renderHistory();
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
  const profileDropdownPanel = document.getElementById("profile-dropdown-panel");
  const splitDropdownWrapper = document.getElementById("split-dropdown-wrapper");
  const navTabSplit = document.getElementById("nav-tab-split");

  profilePillTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    splitDropdownWrapper?.classList.remove("open");
    profileDropdownWrapper?.classList.toggle("open");
    profileDropdownPanel?.classList.toggle("hidden");
  });

  navTabSplit?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdownWrapper?.classList.remove("open");
    profileDropdownPanel?.classList.add("hidden");
    splitDropdownWrapper?.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!profileDropdownWrapper?.contains(e.target)) {
      profileDropdownWrapper?.classList.remove("open");
      profileDropdownPanel?.classList.add("hidden");
    }
    if (!splitDropdownWrapper?.contains(e.target)) {
      splitDropdownWrapper?.classList.remove("open");
    }
  });

  // Sign Out
  document.getElementById("btn-sign-out")?.addEventListener("click", () => {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().signOut().then(() => {
        sessionStorage.clear();
        window.location.href = "/auth.html";
      });
    } else {
      sessionStorage.clear();
      window.location.href = "/auth.html";
    }
  });

  // Initial Render
  renderHistory();
});
