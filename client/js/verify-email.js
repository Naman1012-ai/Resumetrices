import { auth, isMockMode } from './firebase-config.js';
import { sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showToast, showPersistentNotice } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const emailDisplay = document.getElementById('verify-email-display');
  const btnResend = document.getElementById('btn-resend-verification');
  const btnSignout = document.getElementById('btn-verify-signout');

  // Handle Auth State Changes
  auth.onAuthStateChanged((user) => {
    if (isMockMode) {
      if (emailDisplay) emailDisplay.textContent = 'mock-user@resumetrices.com';
      return;
    }

    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    if (emailDisplay) {
      emailDisplay.textContent = user.email;
    }

    // Bypass check if admin
    const adminEmail = window.process?.env?.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';
    if (user.email === adminEmail || user.emailVerified) {
      window.location.href = 'dashboard.html';
    }
  });

  // Resend Handler
  if (btnResend) {
    btnResend.addEventListener('click', async () => {
      if (isMockMode) {
        showPersistentNotice("Verification email sent! Please check your inbox to activate your account. ⚠️ If you don't see it within a few minutes, please check your Spam or Promotions folder.");
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        showToast('No user signed in.', 'error');
        return;
      }

      btnResend.disabled = true;
      btnResend.textContent = 'Sending...';

      try {
        await sendEmailVerification(user);
        showPersistentNotice("Verification email sent! Please check your inbox to activate your account. ⚠️ If you don't see it within a few minutes, please check your Spam or Promotions folder.");
      } catch (err) {
        showToast(err.message || 'Failed to send verification link.', 'error');
      } finally {
        btnResend.disabled = false;
        btnResend.textContent = 'Resend Verification Email';
      }
    });
  }

  // Sign out Handler
  if (btnSignout) {
    btnSignout.addEventListener('click', async () => {
      if (isMockMode) {
        window.location.href = 'login.html?mock=true';
        return;
      }
      try {
        await signOut(auth);
        window.location.href = 'login.html';
      } catch (err) {
        showToast('Failed to sign out.', 'error');
      }
    });
  }

  // Auto-polling verification check
  let pollInterval = setInterval(async () => {
    if (isMockMode) return;
    const user = auth.currentUser;
    if (user) {
      try {
        await user.reload();
        if (user.emailVerified) {
          clearInterval(pollInterval);
          showToast('Email verified successfully! Redirecting...');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 1000);
        }
      } catch (err) {
        console.error('Error reloading user:', err);
      }
    }
  }, 3000);
});
