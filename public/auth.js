/**
 * SplitWise AI - Client Authentication Logic
 * Supports Firebase Email/Password, Google Sign-In, and 1-Click Guest Evaluator Demo.
 * Matches password safety rules from attendance-tracker.
 */

document.addEventListener("DOMContentLoaded", () => {
  // If user is already authenticated or active guest, navigate directly to dashboard
  if (getCurrentUser()) {
    window.location.href = "/dashboard.html";
    return;
  }

  // DOM Elements
  const tabLoginBtn = document.getElementById("tab-login-btn");
  const tabRegisterBtn = document.getElementById("tab-register-btn");
  const nameGroup = document.getElementById("name-group");
  const authName = document.getElementById("auth-name");
  const authEmail = document.getElementById("auth-email");
  const authPassword = document.getElementById("auth-password");
  const forgotPasswordBtn = document.getElementById("forgot-password-btn");
  const pwdToggleBtn = document.getElementById("pwd-toggle-btn");
  const pwdEyeIcon = document.getElementById("pwd-eye-icon");
  const pwdReqBox = document.getElementById("pwd-requirements-box");
  const submitBtnText = document.getElementById("submit-btn-text");
  const authForm = document.getElementById("auth-form");
  const authErrorBox = document.getElementById("auth-error-box");
  const authErrorText = document.getElementById("auth-error-text");
  const googleAuthBtn = document.getElementById("google-auth-btn");
  const guestLoginBtn = document.getElementById("guest-login-btn");

  // Checklist items
  const reqLen = document.getElementById("req-len");
  const reqUpper = document.getElementById("req-upper");
  const reqLower = document.getElementById("req-lower");
  const reqDigit = document.getElementById("req-digit");
  const reqSpecial = document.getElementById("req-special");

  let isLoginMode = true;

  // Toggle Tab: Show/hide fields & Forgot Password button
  function setTab(isLogin) {
    isLoginMode = isLogin;
    clearError();

    if (isLogin) {
      tabLoginBtn.classList.add("active");
      tabRegisterBtn.classList.remove("active");
      nameGroup.classList.add("hidden");
      pwdReqBox.classList.add("hidden");
      forgotPasswordBtn?.classList.remove("hidden");
      submitBtnText.textContent = "Sign In";
    } else {
      tabRegisterBtn.classList.add("active");
      tabLoginBtn.classList.remove("active");
      nameGroup.classList.remove("hidden");
      pwdReqBox.classList.remove("hidden");
      forgotPasswordBtn?.classList.add("hidden");
      submitBtnText.textContent = "Create Account";
    }
  }

  tabLoginBtn.addEventListener("click", () => setTab(true));
  tabRegisterBtn.addEventListener("click", () => setTab(false));

  // Forgot Password Action
  forgotPasswordBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    clearError();

    const email = authEmail?.value.trim();
    if (!email) {
      showError("Please enter your email address above, then click 'Forgot?' to receive a reset link.");
      authEmail?.focus();
      return;
    }

    try {
      if (auth) {
        await auth.sendPasswordResetEmail(email);
        showSuccess(`Password reset email sent to ${email}! Please check your inbox.`);
      } else {
        showError("Firebase authentication service is currently offline.");
      }
    } catch (err) {
      showError(mapFirebaseError(err));
    }
  });

  // Show / Hide Password
  pwdToggleBtn.addEventListener("click", () => {
    const isPassword = authPassword.type === "password";
    authPassword.type = isPassword ? "text" : "password";
    pwdEyeIcon.className = isPassword ? "ph-bold ph-eye-slash" : "ph-bold ph-eye";
  });

  // Real-time password validation (Matching attendance-tracker)
  function validatePassword(pwd) {
    const hasLen = pwd.length >= 8;
    const hasUp = /[A-Z]/.test(pwd);
    const hasLow = /[a-z]/.test(pwd);
    const hasDig = /[0-9]/.test(pwd);
    const hasSpec = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);

    updateReqItem(reqLen, hasLen);
    updateReqItem(reqUpper, hasUp);
    updateReqItem(reqLower, hasLow);
    updateReqItem(reqDigit, hasDig);
    updateReqItem(reqSpecial, hasSpec);

    return hasLen && hasUp && hasLow && hasDig && hasSpec;
  }

  function updateReqItem(el, isValid) {
    if (!el) return;
    const icon = el.querySelector("i");
    if (isValid) {
      el.classList.add("valid");
      if (icon) icon.className = "ph-bold ph-check-circle";
    } else {
      el.classList.remove("valid");
      if (icon) icon.className = "ph-bold ph-circle";
    }
  }

  authPassword.addEventListener("input", (e) => {
    if (!isLoginMode) {
      validatePassword(e.target.value);
    }
  });

  // Error & Success Banner Helpers
  function showError(msg) {
    if (authErrorBox && authErrorText) {
      authErrorBox.className = "auth-alert";
      const icon = authErrorBox.querySelector("i");
      if (icon) icon.className = "ph-bold ph-warning-circle";
      authErrorText.textContent = msg;
    }
  }

  function showSuccess(msg) {
    if (authErrorBox && authErrorText) {
      authErrorBox.className = "auth-alert success";
      const icon = authErrorBox.querySelector("i");
      if (icon) icon.className = "ph-bold ph-check-circle";
      authErrorText.textContent = msg;
    }
  }

  function clearError() {
    if (authErrorBox) {
      authErrorBox.className = "auth-alert hidden";
    }
  }

  // Friendly Firebase Error Messages
  function mapFirebaseError(err) {
    const code = err.code || "";
    if (code === "auth/email-already-in-use") return "This email address is already registered.";
    if (code === "auth/wrong-password") return "Incorrect password. Please try again.";
    if (code === "auth/user-not-found") return "No account found with this email.";
    if (code === "auth/invalid-credential") return "Invalid email or password combination.";
    if (code === "auth/invalid-email") return "Please provide a valid email format.";
    if (code === "auth/popup-closed-by-user") return "Google Sign-In window was closed before finishing.";
    if (code === "auth/network-request-failed") return "Network connection error. Check your internet.";
    return err.message || "Authentication failed. Please verify credentials.";
  }

  // Form Submit: Email & Password
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const email = authEmail.value.trim();
    const password = authPassword.value;
    const name = authName.value.trim();

    if (!email || !password) {
      showError("Please enter both email and password.");
      return;
    }

    if (!isLoginMode) {
      if (!name) {
        showError("Please enter your display name.");
        return;
      }
      if (!validatePassword(password)) {
        showError("Please satisfy all password safety requirements listed below.");
        return;
      }
    }

    submitBtnText.textContent = isLoginMode ? "Signing In..." : "Creating Account...";

    try {
      if (typeof firebaseInitPromise !== 'undefined' && !auth) {
        await firebaseInitPromise;
      }

      if (isLoginMode) {
        // Sign In
        if (auth) {
          const cred = await auth.signInWithEmailAndPassword(email, password);
          localStorage.setItem("splitwise_user", JSON.stringify({
            uid: cred.user.uid,
            displayName: cred.user.displayName || email.split("@")[0],
            email: cred.user.email
          }));
        } else {
          // Fallback simulation if Firebase offline
          localStorage.setItem("splitwise_user", JSON.stringify({
            uid: "local_" + Date.now(),
            displayName: email.split("@")[0],
            email: email
          }));
        }
      } else {
        // Register
        if (auth) {
          const cred = await auth.createUserWithEmailAndPassword(email, password);
          await cred.user.updateProfile({ displayName: name });
          localStorage.setItem("splitwise_user", JSON.stringify({
            uid: cred.user.uid,
            displayName: name,
            email: cred.user.email
          }));
        } else {
          // Fallback simulation if Firebase offline
          localStorage.setItem("splitwise_user", JSON.stringify({
            uid: "local_" + Date.now(),
            displayName: name,
            email: email
          }));
        }
      }

      window.location.href = "/dashboard.html";
    } catch (err) {
      showError(mapFirebaseError(err));
      submitBtnText.textContent = isLoginMode ? "Sign In" : "Create Account";
    }
  });

  // Google Sign-In with Popup
  googleAuthBtn.addEventListener("click", async () => {
    clearError();
    if (typeof firebaseInitPromise !== 'undefined' && (!auth || !googleProvider)) {
      await firebaseInitPromise;
    }
    if (!auth || !googleProvider) {
      showError("Firebase service is initializing. Please try again or use Guest Demo.");
      return;
    }

    try {
      const result = await auth.signInWithPopup(googleProvider);
      const user = result.user;
      localStorage.setItem("splitwise_user", JSON.stringify({
        uid: user.uid,
        displayName: user.displayName || user.email.split("@")[0],
        email: user.email,
        photoURL: user.photoURL
      }));
      window.location.href = "/dashboard.html";
    } catch (err) {
      showError(mapFirebaseError(err));
    }
  });

  // 1-Click Guest / Evaluator Demo Mode
  guestLoginBtn.addEventListener("click", () => {
    loginAsGuest("College Evaluator");
  });
});
