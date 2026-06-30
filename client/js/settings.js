import { auth, db, isMockMode } from './firebase-config.js';
import { 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider,
  GoogleAuthProvider,
  GithubAuthProvider,
  reauthenticateWithPopup,
  deleteUser,
  verifyBeforeUpdateEmail,
  sendEmailVerification,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { FirebaseService } from './api.js';
import { showToast, showPersistentNotice } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  // Accordion Logic
  const accordionItems = document.querySelectorAll('.accordion-item');
  
  // Expand first section by default
  if (accordionItems.length > 0) {
    accordionItems[0].classList.add('active');
  }

  accordionItems.forEach(item => {
    const trigger = item.querySelector('.accordion-trigger');
    if (trigger) {
      trigger.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        
        // Collapse all sections
        accordionItems.forEach(i => i.classList.remove('active'));
        
        // Toggle clicked section
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // Account Security Form
  const securityForm = document.getElementById('security-form');
  const currentPasswordInput = document.getElementById('current-password');
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const btnUpdatePassword = document.getElementById('btn-update-password');



  // Preferences
  const themeToggle = document.getElementById('theme-toggle');
  const prefWeeklyStats = document.getElementById('pref-weekly-stats');

  // Wipe Account — Modal Elements
  const deleteAccountBtn = document.getElementById('delete-account-btn');
  const deleteConfirmModal = document.getElementById('delete-confirm-modal');
  const deleteConfirmVerbatimInput = document.getElementById('delete-confirm-verbatim-input');
  const deleteErrorDisplay = document.getElementById('delete-error-display');
  const deleteErrorText = document.getElementById('delete-error-text');
  const deleteConfirmLabel = document.getElementById('delete-confirm-label');
  const btnDeleteCancel = document.getElementById('btn-delete-cancel');
  const btnDeleteConfirm = document.getElementById('btn-delete-confirm');

  // Local State
  let primaryProvider = 'password';
  let authenticatedEmail = '';

  // Load Settings Information
  function loadSettings() {
    const user = auth.currentUser;
    if (!user && !isMockMode) return;

    let providers = [];
    let userEmail = 'demo@atspilot.co';

    if (isMockMode) {
      providers = [{ providerId: 'google.com', email: 'demo@atspilot.co' }];
      primaryProvider = 'google.com';
    } else if (user) {
      providers = user.providerData || [];
      userEmail = user.email || '';
      
      // Determine primary provider for re-authentication
      const hasPassword = providers.some(p => p.providerId === 'password');
      primaryProvider = hasPassword ? 'password' : (providers[0]?.providerId || 'password');
    }

    // Store email for exact comparison
    authenticatedEmail = userEmail;

    // Verification Status Badge display
    const vBadge = document.getElementById('verification-badge');
    const vBtn = document.getElementById('btn-trigger-verification');
    
    if (vBadge) {
      if (isMockMode) {
        vBadge.textContent = 'Verified';
        vBadge.style.background = 'rgba(16, 185, 129, 0.1)';
        vBadge.style.color = 'var(--emerald)';
        vBadge.style.border = '1px solid rgba(16, 185, 129, 0.2)';
        if (vBtn) vBtn.style.display = 'none';
      } else if (user) {
        if (user.emailVerified) {
          vBadge.textContent = 'Verified';
          vBadge.style.background = 'rgba(16, 185, 129, 0.1)';
          vBadge.style.color = 'var(--emerald)';
          vBadge.style.border = '1px solid rgba(16, 185, 129, 0.2)';
          if (vBtn) vBtn.style.display = 'none';
        } else {
          vBadge.textContent = 'Unverified';
          vBadge.style.background = 'rgba(244, 63, 94, 0.1)';
          vBadge.style.color = 'var(--rose)';
          vBadge.style.border = '1px solid rgba(244, 63, 94, 0.2)';
          if (vBtn) vBtn.style.display = 'inline-block';
        }
      }
    }

    // Verify & synchronize profile email identity row on verification success
    if (user && !isMockMode) {
      const userRef = ref(db, `users/${user.uid}`);
      get(userRef).then(async (snap) => {
        if (snap.exists()) {
          const data = snap.val();
          if (data.email !== user.email) {
            // User email changed/verified! Update primary database profile identity row
            console.log(`Synchronizing database profile email identity row for ${user.uid} to verified email: ${user.email}`);
            await update(userRef, { email: user.email });
            
            // Also update users/${uid}/profile/email if it exists
            const profileRef = ref(db, `users/${user.uid}/profile`);
            const profileSnap = await get(profileRef);
            if (profileSnap.exists()) {
              await update(profileRef, { email: user.email });
            }
          }
        }
      }).catch(err => {
        console.error('Error synchronizing database profile email:', err);
      });
    }

    // Load theme setting
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (themeToggle) {
      themeToggle.checked = savedTheme === 'light';
    }

    // Load notification preferences
    if (prefWeeklyStats) {
      prefWeeklyStats.checked = localStorage.getItem('pref-weekly-stats') === 'true';
    }
  }

  // Password Update Form Submission
  if (securityForm) {
    securityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const currentPassword = currentPasswordInput.value;
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (newPassword !== confirmPassword) {
        showToast('New passwords do not match.', 'error');
        return;
      }

      if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        return;
      }

      btnUpdatePassword.setAttribute('disabled', 'true');
      btnUpdatePassword.textContent = 'Updating...';

      try {
        if (isMockMode) {
          showToast('Password updated (Mock Mode)!');
          securityForm.reset();
          return;
        }

        const user = auth.currentUser;
        if (!user) throw new Error('Authorization required.');

        // Reauthenticate
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);

        // Update password
        await updatePassword(user, newPassword);
        showToast('Password updated successfully!', 'success');
        securityForm.reset();
      } catch (err) {
        console.error('Password update failure:', err);
        showToast(err.message || 'Failed to update password. Verify current password.', 'error');
      } finally {
        btnUpdatePassword.removeAttribute('disabled');
        btnUpdatePassword.textContent = 'Update Password';
      }
    });
  }

  // Color Theme Switcher
  if (themeToggle) {
    themeToggle.addEventListener('change', (e) => {
      const isLight = e.target.checked;
      if (isLight) {
        document.documentElement.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
      }
      showToast(`App theme set to ${isLight ? 'Light' : 'Dark'} Mode.`);
    });
  }

  // Notification Preferences
  if (prefWeeklyStats) {
    prefWeeklyStats.addEventListener('change', (e) => {
      localStorage.setItem('pref-weekly-stats', e.target.checked);
      showToast('Weekly statistics preference saved.');
    });
  }

  // =========================================================
  //  WIPE PLATFORM IDENTITY PROFILE DATA MODAL
  // =========================================================

  /** Reset the modal to its initial state */
  function resetDeleteModal() {
    if (deleteConfirmVerbatimInput) {
      deleteConfirmVerbatimInput.value = '';
      deleteConfirmVerbatimInput.style.borderColor = 'var(--border-color, #334155)';
    }

    if (btnDeleteConfirm) {
      btnDeleteConfirm.setAttribute('disabled', 'true');
      btnDeleteConfirm.style.opacity = '0.4';
      btnDeleteConfirm.style.cursor = 'not-allowed';
      if (deleteConfirmLabel) deleteConfirmLabel.textContent = 'Permanently Wipe';
    }

    if (deleteErrorDisplay) deleteErrorDisplay.style.display = 'none';
  }

  /** Show inline error inside the modal */
  function showDeleteError(msg) {
    if (deleteErrorDisplay && deleteErrorText) {
      deleteErrorText.textContent = msg;
      deleteErrorDisplay.style.display = 'block';
    }
  }

  function openDeleteConfirmationModal() {
    if (!deleteConfirmModal) return;
    resetDeleteModal();
    deleteConfirmModal.style.display = 'flex';
  }

  // --- Trigger: Open Modal ---
  const delAccBtn = document.getElementById('delete-account-btn');
  if (delAccBtn) {
    delAccBtn.addEventListener('click', function(e) {
      e.preventDefault();
      openDeleteConfirmationModal();
    });
  }

  // --- Cancel: Close Modal ---
  if (btnDeleteCancel) {
    btnDeleteCancel.addEventListener('click', () => {
      if (deleteConfirmModal) deleteConfirmModal.style.display = 'none';
    });
  }

  // --- Verbatim Input Verification ---
  if (deleteConfirmVerbatimInput) {
    deleteConfirmVerbatimInput.addEventListener('input', () => {
      const entered = deleteConfirmVerbatimInput.value.trim();
      if (entered === 'DELETE') {
        if (btnDeleteConfirm) {
          btnDeleteConfirm.removeAttribute('disabled');
          btnDeleteConfirm.style.opacity = '1';
          btnDeleteConfirm.style.cursor = 'pointer';
        }
        deleteConfirmVerbatimInput.style.borderColor = 'var(--emerald, #10b981)';
      } else {
        if (btnDeleteConfirm) {
          btnDeleteConfirm.setAttribute('disabled', 'true');
          btnDeleteConfirm.style.opacity = '0.4';
          btnDeleteConfirm.style.cursor = 'not-allowed';
        }
        deleteConfirmVerbatimInput.style.borderColor = entered ? 'var(--rose, #f43f5e)' : 'var(--border-color, #334155)';
      }
    });
  }

  // --- Final Confirm: Purge + Delete ---
  if (btnDeleteConfirm) {
    btnDeleteConfirm.addEventListener('click', async () => {
      if (deleteConfirmVerbatimInput.value.trim() !== 'DELETE') return;

      btnDeleteConfirm.setAttribute('disabled', 'true');
      btnDeleteConfirm.style.cursor = 'not-allowed';
      if (deleteConfirmLabel) {
        deleteConfirmLabel.innerHTML = `<span class="spinner-border" style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-radius:50%; border-top-color:transparent; animation:spin 1s linear infinite; margin-right:6px; vertical-align:middle;"></span> Wiping...`;
      }
      if (deleteErrorDisplay) deleteErrorDisplay.style.display = 'none';

      try {
        // === Mock Mode Shortcut ===
        if (isMockMode) {
          showToast('Your account has been deleted permanently', 'success');
          sessionStorage.clear();
          localStorage.clear();
          window.location.href = 'index.html?mock=true';
          return;
        }

        const user = auth.currentUser;
        if (!user) throw new Error('No authenticated session found. Please log in again.');

        // ---- STAGE 1: Database Purge ----
        await FirebaseService.purgeUserData();

        // ---- STAGE 2: Auth Account Destruction ----
        await deleteUser(user);

        // ---- STAGE 3: Session Tear-Down & Eviction ----
        showToast('Your account has been deleted permanently', 'success');
        sessionStorage.clear();
        localStorage.clear();
        window.location.href = 'index.html';

      } catch (err) {
        console.error('Account deletion failure:', err);
        let userMsg = err.message || 'Deletion failed. Please try again.';
        if (err.code === 'auth/requires-recent-login') {
          userMsg = 'Security requirement: Please sign out and sign back in to delete your account.';
        }
        showDeleteError(userMsg);
        btnDeleteConfirm.removeAttribute('disabled');
        btnDeleteConfirm.style.cursor = 'pointer';
        if (deleteConfirmLabel) deleteConfirmLabel.textContent = 'Permanently Wipe';
      }
    });
  }

  // --- Section 3: Identity & Email Lifecycle Controllers ---
  
  // Resend Email Verification from Settings
  const btnTriggerVerification = document.getElementById('btn-trigger-verification');
  if (btnTriggerVerification) {
    btnTriggerVerification.addEventListener('click', async () => {
      if (isMockMode) {
        showPersistentNotice("Verification email sent! Please check your inbox to activate your account. ⚠️ If you don't see it within a few minutes, please check your Spam or Promotions folder.");
        return;
      }
      const user = auth.currentUser;
      if (!user) {
        showToast('Authentication required.', 'error');
        return;
      }
      btnTriggerVerification.disabled = true;
      btnTriggerVerification.textContent = 'Sending...';
      try {
        await sendEmailVerification(user);
        showPersistentNotice("Verification email sent! Please check your inbox to activate your account. ⚠️ If you don't see it within a few minutes, please check your Spam or Promotions folder.");
      } catch (err) {
        showToast(err.message || 'Failed to send verification link.', 'error');
      } finally {
        btnTriggerVerification.disabled = false;
        btnTriggerVerification.textContent = 'Send Link';
      }
    });
  }

  // Request Password Reset from Settings
  const btnRequestResetEmail = document.getElementById('btn-request-reset-email');
  if (btnRequestResetEmail) {
    btnRequestResetEmail.addEventListener('click', async () => {
      const user = auth.currentUser;
      const email = user ? user.email : 'demo@atspilot.co';
      
      btnRequestResetEmail.disabled = true;
      btnRequestResetEmail.textContent = 'Sending...';
      
      try {
        if (isMockMode) {
          showPersistentNotice("Password reset link dispatched successfully! ⚠️ Crucial: Check your Spam or Junk folder if the recovery link does not arrive in your primary inbox shortly.");
          return;
        }
        await sendPasswordResetEmail(auth, email);
        showPersistentNotice("Password reset link dispatched successfully! ⚠️ Crucial: Check your Spam or Junk folder if the recovery link does not arrive in your primary inbox shortly.");
      } catch (err) {
        showToast(err.message || 'Failed to send reset link.', 'error');
      } finally {
        btnRequestResetEmail.disabled = false;
        btnRequestResetEmail.textContent = 'Send Reset Link';
      }
    });
  }

  // Initiate Email Address Change Form
  const emailChangeForm = document.getElementById('email-change-form');
  const newEmailInput = document.getElementById('new-email-address');
  const btnChangeEmail = document.getElementById('btn-change-email');

  if (emailChangeForm) {
    emailChangeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newEmail = newEmailInput.value.trim();
      const user = auth.currentUser;

      if (!user && !isMockMode) {
        showToast('Authentication required.', 'error');
        return;
      }

      btnChangeEmail.disabled = true;
      btnChangeEmail.textContent = 'Initiating...';

      try {
        if (isMockMode) {
          showPersistentNotice("Verification link sent! Check your new inbox to complete the update. ⚠️ Crucial: Check your Spam or Promotions folder if the verification message does not arrive shortly.");
          emailChangeForm.reset();
          return;
        }

        // Trigger verifyBeforeUpdateEmail
        await verifyBeforeUpdateEmail(user, newEmail);
        showPersistentNotice("Verification link sent! Check your new inbox to complete the update. ⚠️ Crucial: Check your Spam or Promotions folder if the verification message does not arrive shortly.");
        emailChangeForm.reset();
      } catch (err) {
        showToast(err.message || 'Failed to initiate email change. Re-authentication might be required.', 'error');
      } finally {
        btnChangeEmail.disabled = false;
        btnChangeEmail.textContent = 'Initiate Change';
      }
    });
  }

  // Initialize
  auth.onAuthStateChanged((user) => {
    if (user || isMockMode) {
      loadSettings();
    }
  });
});
