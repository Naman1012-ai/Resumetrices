import { auth, db, isMockMode } from './firebase-config.js';
import { signInWithEmailAndPassword, signInWithRedirect, getRedirectResult, GoogleAuthProvider, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { showToast, getFriendlyAuthErrorMessage, showPersistentNotice } from './utils.js';

const googleProvider = new GoogleAuthProvider();

document.addEventListener('DOMContentLoaded', () => {
  let isRedirectProcessing = true;

  // Handle Google redirect result
  getRedirectResult(auth).then(async (result) => {
    if (result && result.user) {
      const user = result.user;
      try {
        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);
        if (!snapshot.exists()) {
          await set(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            createdAt: new Date().toISOString()
          });
        }
      } catch (dbError) {
        console.error('Database user profile creation failed:', dbError);
      }
      showToast('Signed in with Google!');
      redirectUser();
    } else {
      isRedirectProcessing = false;
      if (auth.currentUser) {
        redirectUser();
      }
    }
  }).catch((error) => {
    isRedirectProcessing = false;
    console.error("OAuth Error Context:", error);
    showToast(`Google Sign-In Error: ${error.code} - ${error.message}`, 'error');
  });

  const loginForm = document.getElementById('login-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const btnGoogle = document.getElementById('btn-google');
  const btnSubmit = loginForm.querySelector('button[type="submit"]');
  const authErrorMsg = document.getElementById('auth-error-msg');

  // Clear warning when user re-focuses or edits
  const clearError = () => {
    if (authErrorMsg) {
      authErrorMsg.textContent = '';
      authErrorMsg.style.display = 'none';
    }
  };
  if (emailInput) {
    emailInput.addEventListener('focus', clearError);
    emailInput.addEventListener('input', clearError);
  }
  if (passwordInput) {
    passwordInput.addEventListener('focus', clearError);
    passwordInput.addEventListener('input', clearError);
  }

  // Handle redirect pathing post-auth
  function redirectUser() {
    const user = auth.currentUser;
    const adminEmail = window.process?.env?.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';
    const mockParam = isMockMode ? '?mock=true' : '';
    const mockQuery = mockParam ? (mockParam.startsWith('?') ? mockParam : '?' + mockParam) : '';

    if (user && user.email === adminEmail) {
      window.location.href = `/admin/dashboard${mockQuery}`;
      return;
    }

    const pendingFile = sessionStorage.getItem('pendingFileBase64');
    if (pendingFile) {
      window.location.href = `new-analysis.html${mockQuery}`;
    } else {
      window.location.href = `/dashboard${mockQuery}`;
    }
  }

  // Already logged in?
  auth.onAuthStateChanged((user) => {
    if (user && !isRedirectProcessing) {
      redirectUser();
    }
  });

  // Handle email login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    btnSubmit.setAttribute('disabled', 'true');
    btnSubmit.textContent = 'Signing In...';

    try {
      if (isMockMode) {
        showToast('Login successful (Mock Mode)!');
        const adminEmail = window.process?.env?.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';
        if (email === adminEmail) {
          Object.defineProperty(auth, 'currentUser', {
            get() {
              return {
                uid: 'mock-admin-uid',
                email: email,
                displayName: 'Admin User',
                photoURL: null,
                metadata: { creationTime: 'Wed, 25 Jun 2026 00:00:00 GMT' },
                providerData: [{ providerId: 'google.com', email: email }],
                getIdToken: async () => 'mock_token'
              };
            },
            configurable: true
          });
        }
        setTimeout(redirectUser, 500);
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
      showToast('Login successful!');
      // auth state listener will handle redirect
    } catch (error) {
      const errorMsg = getFriendlyAuthErrorMessage(error);
      if (authErrorMsg) {
        authErrorMsg.textContent = errorMsg;
        authErrorMsg.style.display = 'block';
      } else {
        showToast(errorMsg, 'error');
      }
      btnSubmit.removeAttribute('disabled');
      btnSubmit.textContent = 'Sign In';
    }
  });

  // Handle Google OAuth
  btnGoogle.addEventListener('click', async () => {
    btnGoogle.setAttribute('disabled', 'true');
    btnGoogle.textContent = 'Signing In...';

    try {
      if (isMockMode) {
        showToast('Signed in with Google (Mock Mode)!');
        setTimeout(redirectUser, 500);
        return;
      }

      await signInWithRedirect(auth, googleProvider);
      return; // Redirect will handle the rest
    } catch (error) {
      console.error("OAuth Error Context:", error);
      showToast(`Google Sign-In Error: ${error.code} - ${error.message}`, 'error');
      btnGoogle.removeAttribute('disabled');
      btnGoogle.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.3 0.64 4.5 1.84l2.5-2.5C17.3 1.57 14.86 1 12.24 1 6.48 1 2 5.48 2 11.24s4.48 10.24 10.24 10.24c5.76 0 10.24-4.48 10.24-10.24 0-.64-.08-1.28-.24-1.96H12.24z"/>
        </svg>
        Continue with Google
      `;
    }
  });

  // Preserve mock param on signup link
  const signupLink = document.getElementById('link-signup-redirect');
  if (signupLink && isMockMode) {
    signupLink.href = 'signup.html?mock=true';
  }

  // --- Password Reset View Controls ---
  const linkForgot = document.getElementById('link-forgot-password');
  const btnBackToLogin = document.getElementById('btn-back-to-login');
  const loginView = document.getElementById('login-view');
  const resetView = document.getElementById('reset-view');
  const forgotForm = document.getElementById('forgot-password-form');
  const resetEmailInput = document.getElementById('reset-email');
  const resetErrorMsg = document.getElementById('reset-error-msg');

  if (linkForgot && loginView && resetView) {
    linkForgot.addEventListener('click', (e) => {
      e.preventDefault();
      loginView.style.display = 'none';
      resetView.style.display = 'block';
      if (resetErrorMsg) {
        resetErrorMsg.style.display = 'none';
        resetErrorMsg.textContent = '';
      }
    });
  }

  if (btnBackToLogin && loginView && resetView) {
    btnBackToLogin.addEventListener('click', () => {
      resetView.style.display = 'none';
      loginView.style.display = 'block';
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = resetEmailInput.value.trim();
      const btnResetSubmit = forgotForm.querySelector('button[type="submit"]');

      btnResetSubmit.disabled = true;
      btnResetSubmit.textContent = 'Sending link...';

      try {
        if (isMockMode) {
          resetEmailInput.value = '';
          if (resetErrorMsg) {
            resetErrorMsg.style.display = 'block';
            resetErrorMsg.style.background = 'transparent';
            resetErrorMsg.style.border = 'none';
            resetErrorMsg.style.padding = '0';
            showPersistentNotice(
              "Password reset link dispatched successfully! ⚠️ Crucial: Check your Spam or Junk folder if the recovery link does not arrive in your primary inbox shortly.",
              resetErrorMsg
            );
          } else {
            showPersistentNotice(
              "Password reset link dispatched successfully! ⚠️ Crucial: Check your Spam or Junk folder if the recovery link does not arrive in your primary inbox shortly."
            );
          }
          return;
        }

        await sendPasswordResetEmail(auth, email);
        resetEmailInput.value = '';
        if (resetErrorMsg) {
          resetErrorMsg.style.display = 'block';
          resetErrorMsg.style.background = 'transparent';
          resetErrorMsg.style.border = 'none';
          resetErrorMsg.style.padding = '0';
          showPersistentNotice(
            "Password reset link dispatched successfully! ⚠️ Crucial: Check your Spam or Junk folder if the recovery link does not arrive in your primary inbox shortly.",
            resetErrorMsg
          );
        } else {
          showPersistentNotice(
            "Password reset link dispatched successfully! ⚠️ Crucial: Check your Spam or Junk folder if the recovery link does not arrive in your primary inbox shortly."
          );
        }
      } catch (error) {
        const errorMsg = getFriendlyAuthErrorMessage(error);
        if (resetErrorMsg) {
          resetErrorMsg.textContent = errorMsg;
          resetErrorMsg.style.display = 'block';
        } else {
          showToast(errorMsg, 'error');
        }
      } finally {
        btnResetSubmit.disabled = false;
        btnResetSubmit.textContent = 'Send Reset Link';
      }
    });
  }
});

