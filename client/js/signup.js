import { auth, db, isMockMode } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithRedirect, getRedirectResult, GoogleAuthProvider, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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

  const signupForm = document.getElementById('signup-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const btnGoogle = document.getElementById('btn-google');
  const btnSubmit = signupForm.querySelector('button[type="submit"]');
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

  function redirectUser() {
    const user = auth.currentUser;
    const adminEmail = window.process?.env?.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';
    const mockParam = isMockMode ? '?mock=true' : '';
    const mockQuery = mockParam ? (mockParam.startsWith('?') ? mockParam : '?' + mockParam) : '';

    if (user && user.email === adminEmail) {
      window.location.href = `/admin/dashboard.html${mockQuery}`;
      return;
    }

    const pendingFile = sessionStorage.getItem('pendingFileBase64');
    if (pendingFile) {
      window.location.href = `new-analysis.html${mockQuery}`;
    } else {
      window.location.href = `/dashboard.html${mockQuery}`;
    }
  }

  // Already logged in?
  auth.onAuthStateChanged((user) => {
    if (user && !isRedirectProcessing) {
      redirectUser();
    }
  });

  // Handle email registration
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    btnSubmit.setAttribute('disabled', 'true');
    btnSubmit.textContent = 'Registering...';

    try {
      if (isMockMode) {
        showToast('Registration successful (Mock Mode)!');
        setTimeout(redirectUser, 500);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Immediately send email verification link upon new registration
      try {
        await sendEmailVerification(user);
        console.log('Verification email sent to user inbox.');
      } catch (emailErr) {
        console.error('Failed to send verification email:', emailErr);
      }

      try {
        const userRef = ref(db, `users/${user.uid}`);
        await set(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email.split('@')[0],
          createdAt: new Date().toISOString()
        });
      } catch (dbError) {
        console.error("Database user profile creation failed:", dbError);
      }

      if (authErrorMsg) {
        authErrorMsg.style.display = 'block';
        authErrorMsg.style.background = 'transparent';
        authErrorMsg.style.border = 'none';
        authErrorMsg.style.padding = '0';
        showPersistentNotice(
          "Verification email sent! Please check your inbox to activate your account. ⚠️ If you don't see it within a few minutes, please check your Spam or Promotions folder.",
          authErrorMsg
        );
      } else {
        showPersistentNotice(
          "Verification email sent! Please check your inbox to activate your account. ⚠️ If you don't see it within a few minutes, please check your Spam or Promotions folder."
        );
      }
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
      btnSubmit.textContent = 'Register';
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
        SignUp with Google
      `;
    }
  });

  // Preserve mock param on login link
  const loginLink = document.getElementById('link-login-redirect');
  if (loginLink && isMockMode) {
    loginLink.href = 'login.html?mock=true';
  }
});
