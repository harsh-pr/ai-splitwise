/**
 * SplitWise AI - Landing Page Logic
 * Handles 1-Click Live Demo app launch (offline LocalStorage mode),
 * FAQ accordion, mobile navigation drawer, and mobile PWA install toast.
 */

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

// 1-Click Demo App Launcher: Initializes local guest session and opens dashboard
function launchDemoApp() {
  sessionStorage.setItem("is_guest_session", "true");
  sessionStorage.setItem("guest_display_name", "Demo User");
  localStorage.setItem("splitwise_user", JSON.stringify({
    uid: "guest_demo_session",
    displayName: "Demo User",
    email: "demo@splitwise.local",
    isGuest: true
  }));
  window.location.href = "/dashboard.html";
}

document.addEventListener("DOMContentLoaded", () => {
  // Direct Demo Launch Trigger Buttons
  const demoLaunchBtnIds = [
    "one-click-demo-btn",
    "mobile-demo-btn",
    "hero-start-demo-btn",
    "get-started-btn",
    "preview-full-app-btn",
    "bottom-demo-btn",
    "bottom-explore-btn"
  ];

  demoLaunchBtnIds.forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener("click", (e) => {
      e.preventDefault();
      launchDemoApp();
    });
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

  // ===================================================================
  // Animated Mobile Menu Controller
  // ===================================================================
  const mobileToggle = document.getElementById("mobile-menu-toggle");
  const mobileDrawer = document.getElementById("mobile-nav-drawer");

  function setMobileMenu(isOpen) {
    if (isOpen) {
      mobileDrawer?.classList.add("open");
      mobileToggle?.classList.add("active");
      const icon = mobileToggle?.querySelector("i");
      if (icon) icon.className = "ph-bold ph-x";
    } else {
      mobileDrawer?.classList.remove("open");
      mobileToggle?.classList.remove("active");
      const icon = mobileToggle?.querySelector("i");
      if (icon) icon.className = "ph-bold ph-list";
    }
  }

  mobileToggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isCurrentlyOpen = mobileDrawer?.classList.contains("open");
    setMobileMenu(!isCurrentlyOpen);
  });

  // Close mobile drawer when tapping links or outside
  document.querySelectorAll(".mobile-nav-link, #mobile-demo-btn").forEach(link => {
    link.addEventListener("click", () => {
      setMobileMenu(false);
    });
  });

  document.addEventListener("click", (e) => {
    if (mobileDrawer?.classList.contains("open")) {
      if (!mobileDrawer.contains(e.target) && !mobileToggle?.contains(e.target)) {
        setMobileMenu(false);
      }
    }
  });

  // ===================================================================
  // Floating Back to Top Button (Mobile & Desktop)
  // ===================================================================
  const backToTopBtn = document.getElementById("back-to-top-btn");

  window.addEventListener("scroll", () => {
    if (window.scrollY > 280) {
      backToTopBtn?.classList.add("visible");
    } else {
      backToTopBtn?.classList.remove("visible");
    }
  }, { passive: true });

  backToTopBtn?.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });

  // ===================================================================
  // Mobile-Only Add-to-Home-Screen Notification Toast
  // ===================================================================
  const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  const mobilePwaToast = document.getElementById("mobile-pwa-toast");
  const toastAddBtn = document.getElementById("toast-add-btn");
  const toastCloseBtn = document.getElementById("toast-close-btn");
  const iosInstallModal = document.getElementById("ios-install-modal");
  const iosModalClose = document.getElementById("ios-modal-close");

  // Intercept beforeinstallprompt for Android Chrome
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("[SplitWise PWA] beforeinstallprompt captured on mobile");

    if (isMobile && !isStandalone && !sessionStorage.getItem("splitwise_toast_dismissed")) {
      setTimeout(() => {
        mobilePwaToast?.classList.add("active");
      }, 2000);
    }
  });

  if (isMobile && !isStandalone && !sessionStorage.getItem("splitwise_toast_dismissed")) {
    setTimeout(() => {
      mobilePwaToast?.classList.add("active");
    }, 2500);
  }

  toastAddBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[SplitWise PWA] User install choice: ${outcome}`);
      deferredPrompt = null;
      mobilePwaToast?.classList.remove("active");
    } else if (isIos) {
      mobilePwaToast?.classList.remove("active");
      iosInstallModal?.classList.add("open");
    } else {
      mobilePwaToast?.classList.remove("active");
      alert("Tap your mobile browser menu (⋮) and tap 'Add to Home screen'.");
    }
  });

  toastCloseBtn?.addEventListener("click", () => {
    mobilePwaToast?.classList.remove("active");
    sessionStorage.setItem("splitwise_toast_dismissed", "true");
  });

  iosModalClose?.addEventListener("click", () => {
    iosInstallModal?.classList.remove("open");
  });

  iosInstallModal?.addEventListener("click", (e) => {
    if (e.target === iosInstallModal) {
      iosInstallModal.classList.remove("open");
    }
  });

  window.addEventListener("appinstalled", () => {
    console.log("[SplitWise PWA] Installed to home screen!");
    mobilePwaToast?.classList.remove("active");
    deferredPrompt = null;
  });
});
