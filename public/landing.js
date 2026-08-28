/**
 * SplitWise AI - Minimalist Landing Page Logic
 * Features 1-click Demo session initialization (matching attendance-tracker pattern)
 * and streamlined auth navigation.
 */

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

// 1-Click Demo Launcher (Matching attendance-tracker guest mode)
function startDemoSession() {
  sessionStorage.setItem("is_guest_session", "true");
  localStorage.setItem("is_guest_mode", "true");
  localStorage.setItem("splitwise_user", JSON.stringify({
    uid: "guest_demo_user",
    email: "guest@demo.mode",
    displayName: "Guest User",
    isGuest: true
  }));
  window.location.href = "/dashboard.html";
}

document.addEventListener("DOMContentLoaded", () => {
  // Wire all Demo triggers
  const demoBtnIds = [
    "nav-demo-btn",
    "mobile-demo-btn",
    "hero-demo-btn",
    "cta-demo-btn"
  ];

  demoBtnIds.forEach(id => {
    const btn = document.getElementById(id);
    btn?.addEventListener("click", (e) => {
      e.preventDefault();
      startDemoSession();
    });
  });

  // Mobile Menu Drawer Toggle
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

  // FAQ Accordion
  const faqQuestions = document.querySelectorAll(".faq-question");
  faqQuestions.forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const isActive = item.classList.contains("active");

      document.querySelectorAll(".faq-item").forEach(el => {
        el.classList.remove("active");
      });

      if (!isActive) {
        item.classList.add("active");
      }
    });
  });
});
