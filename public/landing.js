/**
 * SplitWise AI - Landing Page & PWA Logic
 * Handles receipt presets simulator, demo modal, FAQ accordion,
 * Service Worker registration, and mobile "Add to Home Screen" installation.
 */

// Receipt Demonstration Presets
const PRESET_RECEIPTS = {
  dinner: {
    title: "Friday Bistro Dinner & Mocktails",
    payer: "You (Harsh)",
    participants: ["You (Harsh)", "Aarav", "Neha", "Rohan"],
    currency: "₹",
    total: "₹3,450",
    confidence: "98.6%",
    itemCountText: "5 Items Extracted",
    reducedText: "Reduced to 3 direct transfers",
    items: [
      { name: "Woodfired Truffle Pizza", price: "₹850", assigned: ["You", "Aarav"] },
      { name: "Creamy Pesto Penne", price: "₹650", assigned: ["Neha"] },
      { name: "Peri Peri Loaded Fries", price: "₹420", assigned: ["All 4"] },
      { name: "Sizzling Brownie Sundae", price: "₹380", assigned: ["Rohan", "Neha"] },
      { name: "Craft Mocktails (x3)", price: "₹750", assigned: ["You", "Aarav", "Rohan"] },
      { name: "GST & Service (Proportional)", price: "₹400", assigned: ["Auto Split"] }
    ],
    transfers: [
      { from: "Aarav", to: "You (Harsh)", amount: "₹1,005" },
      { from: "Neha", to: "You (Harsh)", amount: "₹1,105" },
      { from: "Rohan", to: "You (Harsh)", amount: "₹940" }
    ]
  },
  roadtrip: {
    title: "Goa Coastal Road Trip Expenses",
    payer: "Siddharth",
    participants: ["You (Harsh)", "Siddharth", "Pooja", "Ananya"],
    currency: "₹",
    total: "₹9,800",
    confidence: "99.1%",
    itemCountText: "4 Categories Extracted",
    reducedText: "Reduced to 3 direct transfers",
    items: [
      { name: "Highway Tolls & Fuel", price: "₹4,200", assigned: ["All 4"] },
      { name: "Beachside Seafood Platter", price: "₹3,200", assigned: ["Harsh", "Siddharth", "Pooja"] },
      { name: "Snacks & Cold Drinks", price: "₹1,800", assigned: ["All 4"] },
      { name: "Beach Resort Parking", price: "₹600", assigned: ["All 4"] }
    ],
    transfers: [
      { from: "You (Harsh)", to: "Siddharth", amount: "₹2,550" },
      { from: "Pooja", to: "Siddharth", amount: "₹2,550" },
      { from: "Ananya", to: "Siddharth", amount: "₹1,500" }
    ]
  }
};

// Global PWA prompt variable
let deferredPrompt = null;

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[SplitWise PWA] ServiceWorker registered with scope:', reg.scope);
      })
      .catch(err => {
        console.warn('[SplitWise PWA] ServiceWorker registration failed:', err);
      });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements for Hero Simulator
  const receiptTitle = document.getElementById("receipt-title");
  const receiptPayer = document.getElementById("receipt-payer");
  const receiptTotal = document.getElementById("receipt-total");
  const receiptConfidence = document.getElementById("receipt-confidence");
  const receiptItemsCount = document.getElementById("receipt-items-count");
  const receiptItemsList = document.getElementById("receipt-items-list");
  const settlementTransfersList = document.getElementById("settlement-transfers-list");
  const pillDinner = document.getElementById("pill-dinner");
  const pillRoadtrip = document.getElementById("pill-roadtrip");

  // Render Preset Function
  function renderPreset(presetKey) {
    const data = PRESET_RECEIPTS[presetKey];
    if (!data) return;

    if (receiptTitle) receiptTitle.textContent = data.title;
    if (receiptPayer) receiptPayer.textContent = data.payer;
    if (receiptTotal) receiptTotal.textContent = data.total;
    if (receiptConfidence) receiptConfidence.textContent = data.confidence;
    if (receiptItemsCount) receiptItemsCount.textContent = data.itemCountText;

    if (receiptItemsList) {
      receiptItemsList.innerHTML = data.items
        .map(
          item => `
          <div class="item-row">
            <div class="item-name-group">
              <span class="item-name">${item.name}</span>
              <div class="item-assigned-chips">
                ${item.assigned.map(tag => `<span class="chip">${tag}</span>`).join("")}
              </div>
            </div>
            <span class="item-price">${item.price}</span>
          </div>
        `
        )
        .join("");
    }

    if (settlementTransfersList) {
      settlementTransfersList.innerHTML = data.transfers
        .map(
          t => `
          <div class="transfer-pill">
            <div class="transfer-parties">
              <strong>${t.from}</strong>
              <i class="ph-bold ph-arrow-right transfer-arrow"></i>
              <span>${t.to}</span>
            </div>
            <span class="transfer-amount">${t.amount}</span>
          </div>
        `
        )
        .join("");
    }

    if (presetKey === "dinner") {
      pillDinner?.classList.add("active");
      pillRoadtrip?.classList.remove("active");
    } else {
      pillRoadtrip?.classList.add("active");
      pillDinner?.classList.remove("active");
    }
  }

  // Preset Button Event Listeners
  pillDinner?.addEventListener("click", () => renderPreset("dinner"));
  pillRoadtrip?.addEventListener("click", () => renderPreset("roadtrip"));

  // Initialize with Dinner preset
  renderPreset("dinner");

  // Demo Modal Logic
  const demoModal = document.getElementById("demo-modal");
  const demoModalClose = document.getElementById("demo-modal-close");
  const openDemoBtns = [
    document.getElementById("one-click-demo-btn"),
    document.getElementById("mobile-demo-btn"),
    document.getElementById("hero-start-demo-btn"),
    document.getElementById("bottom-demo-btn")
  ];

  openDemoBtns.forEach(btn => {
    btn?.addEventListener("click", e => {
      e.preventDefault();
      demoModal?.classList.add("open");
    });
  });

  demoModalClose?.addEventListener("click", () => {
    demoModal?.classList.remove("open");
  });

  demoModal?.addEventListener("click", e => {
    if (e.target === demoModal) {
      demoModal.classList.remove("open");
    }
  });

  document.getElementById("demo-option-dinner")?.addEventListener("click", () => {
    demoModal?.classList.remove("open");
    renderPreset("dinner");
    document.getElementById("hero-preview")?.scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("demo-option-roadtrip")?.addEventListener("click", () => {
    demoModal?.classList.remove("open");
    renderPreset("roadtrip");
    document.getElementById("hero-preview")?.scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("preview-full-app-btn")?.addEventListener("click", () => {
    demoModal?.classList.add("open");
  });

  // FAQ Accordion Toggle
  const faqQuestions = document.querySelectorAll(".faq-question");
  faqQuestions.forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const isActive = item.classList.contains("active");

      document.querySelectorAll(".faq-item").forEach(el => {
        el.classList.remove("active");
        el.querySelector(".faq-question")?.setAttribute("aria-expanded", "false");
      });

      if (!isActive) {
        item.classList.add("active");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  // Mobile Menu Toggle
  const mobileToggle = document.getElementById("mobile-menu-toggle");
  const mobileDrawer = document.getElementById("mobile-nav-drawer");

  mobileToggle?.addEventListener("click", () => {
    mobileDrawer?.classList.toggle("open");
  });

  document.querySelectorAll(".mobile-nav-link").forEach(link => {
    link.addEventListener("click", () => {
      mobileDrawer?.classList.remove("open");
    });
  });

  // ===================================================================
  // PWA ("Add to Home Screen") Installation Handling
  // ===================================================================
  const headerInstallBtn = document.getElementById("header-install-btn");
  const mobileDrawerInstallBtn = document.getElementById("mobile-drawer-install-btn");
  const bottomInstallBtn = document.getElementById("bottom-install-btn");
  const pwaInstallBanner = document.getElementById("pwa-install-banner");
  const pwaBannerInstallBtn = document.getElementById("pwa-banner-install-btn");
  const pwaBannerCloseBtn = document.getElementById("pwa-banner-close-btn");
  const iosInstallModal = document.getElementById("ios-install-modal");
  const iosModalClose = document.getElementById("ios-modal-close");

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  // Show install triggers if not already installed as standalone
  if (!isStandalone) {
    // Reveal buttons on header & drawer
    headerInstallBtn?.classList.remove("hidden");
    
    // Display banner after 2.5 seconds on mobile if not dismissed
    const bannerDismissed = sessionStorage.getItem("splitwise_pwa_dismissed");
    if (!bannerDismissed && window.innerWidth <= 768) {
      setTimeout(() => {
        pwaInstallBanner?.classList.add("visible");
      }, 2500);
    }
  }

  // Intercept beforeinstallprompt for Android Chrome / Chromium
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("[SplitWise PWA] beforeinstallprompt captured");
    headerInstallBtn?.classList.remove("hidden");
    if (!sessionStorage.getItem("splitwise_pwa_dismissed")) {
      pwaInstallBanner?.classList.add("visible");
    }
  });

  // Trigger installation flow
  async function triggerPwaInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[SplitWise PWA] User install choice: ${outcome}`);
      deferredPrompt = null;
      pwaInstallBanner?.classList.remove("visible");
      headerInstallBtn?.classList.add("hidden");
    } else if (isIos) {
      // iOS doesn't support programmatic install, show step-by-step visual modal
      iosInstallModal?.classList.add("open");
      mobileDrawer?.classList.remove("open");
    } else {
      // General fallback or instructions
      alert("To install SplitWise AI, tap your browser's menu (⋮ or Share) and select 'Install app' or 'Add to Home screen'.");
    }
  }

  // Attach install event to all install buttons
  [headerInstallBtn, mobileDrawerInstallBtn, bottomInstallBtn, pwaBannerInstallBtn].forEach(btn => {
    btn?.addEventListener("click", (e) => {
      e.preventDefault();
      triggerPwaInstall();
    });
  });

  // Dismiss PWA Banner
  pwaBannerCloseBtn?.addEventListener("click", () => {
    pwaInstallBanner?.classList.remove("visible");
    sessionStorage.setItem("splitwise_pwa_dismissed", "true");
  });

  // Close iOS Guide Modal
  iosModalClose?.addEventListener("click", () => {
    iosInstallModal?.classList.remove("open");
  });
  iosInstallModal?.addEventListener("click", (e) => {
    if (e.target === iosInstallModal) {
      iosInstallModal.classList.remove("open");
    }
  });

  // Listen for successful installation
  window.addEventListener("appinstalled", () => {
    console.log("[SplitWise PWA] App was successfully installed!");
    pwaInstallBanner?.classList.remove("visible");
    headerInstallBtn?.classList.add("hidden");
    deferredPrompt = null;
  });
});
