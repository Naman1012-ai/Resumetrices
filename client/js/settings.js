import { auth, isMockMode } from './firebase-config.js';
import { 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider,
  GoogleAuthProvider,
  GithubAuthProvider,
  reauthenticateWithPopup,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { FirebaseService } from './api.js';
import { showToast } from './utils.js';

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

  // Delete Account — Modal Elements
  const btnDeleteAccountTrigger = document.getElementById('btn-delete-account-trigger');
  const deleteConfirmModal = document.getElementById('delete-confirm-modal');
  const deleteConfirmEmailPlaceholder = document.getElementById('delete-confirm-email-placeholder');
  const deleteConfirmEmailInput = document.getElementById('delete-confirm-email-input');
  const emailMatchHint = document.getElementById('email-match-hint');
  const deleteReauthPasswordGroup = document.getElementById('delete-reauth-password-group');
  const deleteReauthPassword = document.getElementById('delete-reauth-password');
  const deleteOauthInfo = document.getElementById('delete-oauth-info');
  const deleteErrorDisplay = document.getElementById('delete-error-display');
  const deleteErrorText = document.getElementById('delete-error-text');
  const deleteConfirmLabel = document.getElementById('delete-confirm-label');

  // Step containers & buttons
  const deleteStep1 = document.getElementById('delete-step-1');
  const deleteStep2 = document.getElementById('delete-step-2');
  const stepDot1 = document.getElementById('step-dot-1');
  const stepDot2 = document.getElementById('step-dot-2');
  const btnDeleteCancel = document.getElementById('btn-delete-cancel');
  const btnDeleteNext = document.getElementById('btn-delete-next');
  const btnDeleteBack = document.getElementById('btn-delete-back');
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

    if (deleteConfirmEmailPlaceholder) {
      deleteConfirmEmailPlaceholder.textContent = userEmail;
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
  //  TWO-STEP ACCOUNT DELETION MODAL
  // =========================================================

  /** Reset the modal to its initial Step 1 state */
  function resetDeleteModal() {
    // Clear inputs
    if (deleteConfirmEmailInput) deleteConfirmEmailInput.value = '';
    if (deleteReauthPassword) deleteReauthPassword.value = '';
    if (emailMatchHint) { emailMatchHint.textContent = ''; emailMatchHint.style.color = 'var(--text-muted)'; }

    // Show Step 1, hide Step 2
    if (deleteStep1) deleteStep1.style.display = 'block';
    if (deleteStep2) deleteStep2.style.display = 'none';

    // Reset step dots
    if (stepDot1) stepDot1.style.background = 'var(--rose, #f43f5e)';
    if (stepDot2) stepDot2.style.background = 'rgba(255,255,255,0.1)';

    // Disable Next button
    if (btnDeleteNext) {
      btnDeleteNext.setAttribute('disabled', 'true');
      btnDeleteNext.style.opacity = '0.4';
      btnDeleteNext.style.cursor = 'not-allowed';
    }

    // Reset confirm button
    if (btnDeleteConfirm) {
      btnDeleteConfirm.removeAttribute('disabled');
      if (deleteConfirmLabel) deleteConfirmLabel.textContent = 'Permanently Purge & Delete';
    }

    // Hide error display
    if (deleteErrorDisplay) deleteErrorDisplay.style.display = 'none';
  }

  /** Transition from Step 1 to Step 2 */
  function goToStep2() {
    if (deleteStep1) deleteStep1.style.display = 'none';
    if (deleteStep2) deleteStep2.style.display = 'block';

    // Update step dots
    if (stepDot1) stepDot1.style.background = 'var(--emerald, #10b981)';
    if (stepDot2) stepDot2.style.background = 'var(--rose, #f43f5e)';

    // Configure step 2 fields based on provider
    if (primaryProvider === 'password') {
      if (deleteReauthPasswordGroup) deleteReauthPasswordGroup.style.display = 'flex';
      if (deleteOauthInfo) deleteOauthInfo.style.display = 'none';
      if (deleteReauthPassword) deleteReauthPassword.focus();
    } else {
      if (deleteReauthPasswordGroup) deleteReauthPasswordGroup.style.display = 'none';
      if (deleteOauthInfo) deleteOauthInfo.style.display = 'block';
    }

    // Hide any previous error
    if (deleteErrorDisplay) deleteErrorDisplay.style.display = 'none';
  }

  /** Show inline error inside the modal */
  function showDeleteError(msg) {
    if (deleteErrorDisplay && deleteErrorText) {
      deleteErrorText.textContent = msg;
      deleteErrorDisplay.style.display = 'block';
    }
  }

  // --- Trigger: Open Modal ---
  if (btnDeleteAccountTrigger) {
    btnDeleteAccountTrigger.addEventListener('click', () => {
      if (!deleteConfirmModal) return;

      // Refresh email from live auth state
      const user = auth.currentUser;
      if (user && !isMockMode) {
        authenticatedEmail = user.email || '';
      }
      if (deleteConfirmEmailPlaceholder) {
        deleteConfirmEmailPlaceholder.textContent = authenticatedEmail;
      }

      resetDeleteModal();
      deleteConfirmModal.style.display = 'flex';
    });
  }

  // --- Cancel: Close Modal ---
  if (btnDeleteCancel) {
    btnDeleteCancel.addEventListener('click', () => {
      if (deleteConfirmModal) deleteConfirmModal.style.display = 'none';
    });
  }

  // --- Step 1: Email Input Validation (real-time keypress matching) ---
  if (deleteConfirmEmailInput) {
    deleteConfirmEmailInput.addEventListener('input', () => {
      const entered = deleteConfirmEmailInput.value.trim();
      const target = authenticatedEmail;

      if (!entered) {
        // Empty — neutral
        if (emailMatchHint) { emailMatchHint.textContent = ''; emailMatchHint.style.color = 'var(--text-muted)'; }
        if (btnDeleteNext) { btnDeleteNext.setAttribute('disabled', 'true'); btnDeleteNext.style.opacity = '0.4'; btnDeleteNext.style.cursor = 'not-allowed'; }
        if (deleteConfirmEmailInput) deleteConfirmEmailInput.style.borderColor = 'var(--border-color, #334155)';
        return;
      }

      if (entered === target) {
        // Exact match — unlock
        if (emailMatchHint) { emailMatchHint.textContent = '✓ Email verified'; emailMatchHint.style.color = 'var(--emerald, #10b981)'; }
        if (btnDeleteNext) { btnDeleteNext.removeAttribute('disabled'); btnDeleteNext.style.opacity = '1'; btnDeleteNext.style.cursor = 'pointer'; }
        if (deleteConfirmEmailInput) deleteConfirmEmailInput.style.borderColor = 'var(--emerald, #10b981)';
      } else {
        // Mismatch — keep locked
        const isPartialMatch = target.startsWith(entered);
        if (emailMatchHint) {
          emailMatchHint.textContent = isPartialMatch ? 'Keep typing...' : '✗ Email does not match';
          emailMatchHint.style.color = isPartialMatch ? 'var(--text-muted, #94a3b8)' : 'var(--rose, #f43f5e)';
        }
        if (btnDeleteNext) { btnDeleteNext.setAttribute('disabled', 'true'); btnDeleteNext.style.opacity = '0.4'; btnDeleteNext.style.cursor = 'not-allowed'; }
        if (deleteConfirmEmailInput) deleteConfirmEmailInput.style.borderColor = isPartialMatch ? 'var(--border-color, #334155)' : 'var(--rose, #f43f5e)';
      }
    });
  }

  // --- Step 1 → Step 2: Next Button ---
  if (btnDeleteNext) {
    btnDeleteNext.addEventListener('click', () => {
      // Double-check match before advancing
      if (deleteConfirmEmailInput.value.trim() !== authenticatedEmail) return;
      goToStep2();
    });
  }

  // --- Step 2 → Step 1: Back Button ---
  if (btnDeleteBack) {
    btnDeleteBack.addEventListener('click', () => {
      if (deleteStep2) deleteStep2.style.display = 'none';
      if (deleteStep1) deleteStep1.style.display = 'block';

      // Revert step dots
      if (stepDot1) stepDot1.style.background = 'var(--rose, #f43f5e)';
      if (stepDot2) stepDot2.style.background = 'rgba(255,255,255,0.1)';
    });
  }

  // --- Step 2: Final Confirm — Re-Auth + Purge + Delete ---
  if (btnDeleteConfirm) {
    btnDeleteConfirm.addEventListener('click', async () => {
      btnDeleteConfirm.setAttribute('disabled', 'true');
      if (deleteConfirmLabel) deleteConfirmLabel.textContent = 'Verifying & Deleting...';
      if (deleteErrorDisplay) deleteErrorDisplay.style.display = 'none';

      try {
        // === Mock Mode Shortcut ===
        if (isMockMode) {
          showToast('Account deleted (Mock Mode)!');
          sessionStorage.clear();
          localStorage.clear();
          window.location.href = 'index.html?mock=true';
          return;
        }

        const user = auth.currentUser;
        if (!user) throw new Error('No authenticated session found. Please log in again.');

        // ---- STAGE 1: Security Re-authentication ----
        if (primaryProvider === 'password') {
          const pass = deleteReauthPassword ? deleteReauthPassword.value : '';
          if (!pass || pass.length < 6) {
            throw new Error('Please enter your current password (minimum 6 characters).');
          }
          const credential = EmailAuthProvider.credential(user.email, pass);
          await reauthenticateWithCredential(user, credential);
        } else if (primaryProvider === 'google.com') {
          const provider = new GoogleAuthProvider();
          await reauthenticateWithPopup(user, provider);
        } else if (primaryProvider === 'github.com') {
          const provider = new GithubAuthProvider();
          await reauthenticateWithPopup(user, provider);
        }

        // ---- STAGE 2: Database Purge ----
        // Wipes all user sub-documents, analyses, profile data under users/{uid}/
        if (deleteConfirmLabel) deleteConfirmLabel.textContent = 'Purging data...';
        await FirebaseService.purgeUserData();

        // ---- STAGE 3: Auth Account Destruction ----
        if (deleteConfirmLabel) deleteConfirmLabel.textContent = 'Removing credentials...';
        await deleteUser(user);

        // ---- STAGE 4: Session Tear-Down & Eviction ----
        showToast('Your account and all associated data have been permanently purged.', 'success');
        sessionStorage.clear();
        localStorage.clear();
        window.location.href = 'index.html';

      } catch (err) {
        console.error('Account deletion failure:', err);

        // Map Firebase error codes to user-friendly messages
        let userMsg = err.message || 'Deletion failed. Please try again.';
        if (err.code === 'auth/wrong-password') {
          userMsg = 'Incorrect password. Please re-enter your current password.';
        } else if (err.code === 'auth/too-many-requests') {
          userMsg = 'Too many attempts. Please wait a few minutes before trying again.';
        } else if (err.code === 'auth/popup-closed-by-user') {
          userMsg = 'Re-authentication popup was closed. Please try again.';
        } else if (err.code === 'auth/requires-recent-login') {
          userMsg = 'Session expired. Please log out, log back in, and try again.';
        }

        showDeleteError(userMsg);
        btnDeleteConfirm.removeAttribute('disabled');
        if (deleteConfirmLabel) deleteConfirmLabel.textContent = 'Permanently Purge & Delete';
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
