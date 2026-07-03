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
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { FirebaseService } from './api.js';
import { showToast, showPersistentNotice, showCustomModal } from './utils.js';

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
  let verificationPollInterval = null;

  // Helper to sync email in database
  async function syncDatabaseEmail(currentUser) {
    if (!currentUser || isMockMode) return;
    try {
      const userRef = ref(db, `users/${currentUser.uid}`);
      const snap = await get(userRef);
      if (snap.exists()) {
        const data = snap.val();
        if (data.email !== currentUser.email) {
          console.log(`Synchronizing database profile email identity row for ${currentUser.uid} to verified email: ${currentUser.email}`);
          await update(userRef, { email: currentUser.email });
          
          const profileRef = ref(db, `users/${currentUser.uid}/profile`);
          const profileSnap = await get(profileRef);
          if (profileSnap.exists()) {
            await update(profileRef, { email: currentUser.email });
          }
        }
      }
    } catch (err) {
      console.error('Error synchronizing database profile email:', err);
    }
  }

  // Load Settings Information
  async function loadSettings() {
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

    // Load Profile fields
    const profileNameInput = document.getElementById('profile-name');
    const profileRoleInput = document.getElementById('profile-role');
    const profilePhotoPreview = document.getElementById('profile-photo-preview');
    const profilePhotoFallback = document.getElementById('profile-photo-fallback');

    let displayName = isMockMode ? 'John Doe' : (user ? (user.displayName || '') : '');
    let roleTitle = '';

    const getAvatarUrl = (name) => {
      const fallbackChar = user?.email?.charAt(0) || 'U';
      const nameParam = name || fallbackChar;
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(nameParam)}&background=10b981&color=ffffff&size=128&bold=true`;
    };

    // Attempt to load from cache first
    try {
      let cached = sessionStorage.getItem(`profile_cache_${user.uid}`);
      if (!cached) {
        cached = localStorage.getItem(`profile_cache_${user.uid}`);
      }
      if (!cached) {
        cached = sessionStorage.getItem('profile_cache');
      }
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.displayName) displayName = parsed.displayName;
        if (parsed.roleTitle) roleTitle = parsed.roleTitle;
      }
    } catch (e) {
      console.warn('Failed to parse cache in settings:', e);
    }

    // Populate inputs and avatar immediately (Zero-Lag UI)
    if (profileNameInput) profileNameInput.value = displayName;
    if (profileRoleInput) profileRoleInput.value = roleTitle;

    const currentAvatarUrl = getAvatarUrl(displayName);
    if (profilePhotoPreview) {
      profilePhotoPreview.src = currentAvatarUrl;
      profilePhotoPreview.style.display = 'block';
    }
    if (profilePhotoFallback) profilePhotoFallback.style.display = 'none';

    // Populate email display under Identity
    const settingsEmailDisplay = document.getElementById('settings-email-display');
    if (settingsEmailDisplay) {
      settingsEmailDisplay.textContent = userEmail;
    }

    // Verification Status Badge & Message display
    const vBadge = document.getElementById('verification-badge');
    const vBtn = document.getElementById('btn-trigger-verification');
    const vMsg = document.getElementById('email-verification-message');

    function updateVerificationUI(verifiedStatus) {
      if (!vBadge) return;
      if (verifiedStatus) {
        vBadge.textContent = 'Verified';
        vBadge.style.background = 'rgba(16, 185, 129, 0.1)';
        vBadge.style.color = 'var(--emerald)';
        vBadge.style.border = '1px solid rgba(16, 185, 129, 0.2)';
        if (vBtn) vBtn.style.display = 'none';
        if (vMsg) vMsg.style.display = 'none';
      } else {
        vBadge.textContent = 'Unverified';
        vBadge.style.background = 'rgba(244, 63, 94, 0.1)';
        vBadge.style.color = 'var(--rose)';
        vBadge.style.border = '1px solid rgba(244, 63, 94, 0.2)';
        if (vBtn) vBtn.style.display = 'inline-block';
        if (vMsg) vMsg.style.display = 'block';
      }
    }

    // Clear any existing polling interval
    if (verificationPollInterval) {
      clearInterval(verificationPollInterval);
      verificationPollInterval = null;
    }

    // 1. Render current verification status immediately
    let isVerified = isMockMode ? true : (user ? user.emailVerified : false);
    updateVerificationUI(isVerified);

    // Sync database email if verified on start
    if (isVerified && user && !isMockMode) {
      syncDatabaseEmail(user);
    }

    // 2. Start polling for verification status in the background if not verified
    if (!isVerified && user && !isMockMode) {
      verificationPollInterval = setInterval(async () => {
        try {
          const currentUser = auth.currentUser;
          if (currentUser) {
            await currentUser.reload();
            const refreshedUser = auth.currentUser;
            if (refreshedUser.emailVerified) {
              clearInterval(verificationPollInterval);
              verificationPollInterval = null;
              updateVerificationUI(true);
              showToast('Email verified successfully!', 'success');
              syncDatabaseEmail(refreshedUser);
            }
          }
        } catch (err) {
          console.error('Error in verification polling:', err);
        }
      }, 3000);
    }

    // 3. Do an immediate background reload check in case local cache is stale
    if (user && !isMockMode) {
      user.reload().then(() => {
        const refreshedUser = auth.currentUser;
        if (refreshedUser && refreshedUser.emailVerified !== isVerified) {
          isVerified = refreshedUser.emailVerified;
          updateVerificationUI(isVerified);
          if (isVerified) {
            if (verificationPollInterval) {
              clearInterval(verificationPollInterval);
              verificationPollInterval = null;
            }
            syncDatabaseEmail(refreshedUser);
          }
        }
      }).catch((err) => {
        console.warn('Failed to do initial user verification reload:', err);
      });
    }

    // 4. Fetch fresh details from RTDB in background without blocking the UI
    if (user && !isMockMode) {
      get(ref(db, `users/${user.uid}/profile`)).then((profileSnap) => {
        if (profileSnap.exists()) {
          const val = profileSnap.val();
          let needsUpdate = false;
          if (val.displayName !== undefined && val.displayName !== displayName) {
            displayName = val.displayName;
            if (profileNameInput) profileNameInput.value = displayName;
            needsUpdate = true;
          }
          if (val.targetDomain !== undefined && val.targetDomain !== roleTitle) {
            roleTitle = val.targetDomain;
            if (profileRoleInput) profileRoleInput.value = roleTitle;
            needsUpdate = true;
          }
          if (needsUpdate) {
            const currentAvatarUrl = getAvatarUrl(displayName);
            if (profilePhotoPreview) {
              profilePhotoPreview.src = currentAvatarUrl;
            }
          }
        }
      }).catch((err) => {
        console.warn('Failed to load profile details from RTDB:', err);
      });
    }

    // Load theme setting
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (themeToggle) {
      themeToggle.checked = savedTheme === 'light';
    }

    // Load language preference
    const prefLanguageSelect = document.getElementById('pref-language');
    if (prefLanguageSelect) {
      prefLanguageSelect.value = localStorage.getItem('pref-language') || 'en';
    }

    // Load notification preferences
    if (prefWeeklyStats) {
      prefWeeklyStats.checked = localStorage.getItem('pref-weekly-stats') === 'true';
    }
  }

  // Profile Save Event Handlers
  const btnSaveProfile = document.getElementById('btn-save-profile');
  const profileNameInput = document.getElementById('profile-name');
  const profileRoleInput = document.getElementById('profile-role');
  const profilePhotoPreview = document.getElementById('profile-photo-preview');
  const profilePhotoFallback = document.getElementById('profile-photo-fallback');

  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', async () => {
      const displayName = profileNameInput ? profileNameInput.value.trim() : '';
      const roleTitle = profileRoleInput ? profileRoleInput.value.trim() : '';

      const payload = {};
      if (displayName) payload.displayName = displayName;
      if (roleTitle) payload.targetDomain = roleTitle;
      if (Object.keys(payload).length === 0) return; // nothing to save

      btnSaveProfile.disabled = true;
      btnSaveProfile.textContent = 'Saving...';

      const statusSpan = document.getElementById('profile-save-status');
      if (statusSpan) {
        statusSpan.textContent = '';
        statusSpan.style.display = 'none';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const getAvatarUrl = (name) => {
          const user = auth.currentUser;
          const fallbackChar = user?.email?.charAt(0) || 'U';
          const nameParam = name || fallbackChar;
          return `https://ui-avatars.com/api/?name=${encodeURIComponent(nameParam)}&background=10b981&color=ffffff&size=128&bold=true`;
        };

        if (isMockMode) {
          await new Promise(resolve => setTimeout(resolve, 500)); // simulate latency
          
          if (statusSpan) {
            statusSpan.textContent = 'Saved';
            statusSpan.style.color = 'var(--emerald)';
            statusSpan.style.display = 'inline';
            setTimeout(() => {
              statusSpan.style.display = 'none';
            }, 3000);
          }
          
          // Update live preview
          const updatedAvatarUrl = getAvatarUrl(displayName);
          if (profilePhotoPreview) {
            profilePhotoPreview.src = updatedAvatarUrl;
            profilePhotoPreview.style.display = 'block';
          }
          if (profilePhotoFallback) profilePhotoFallback.style.display = 'none';

          // Trigger state sync reactively
          const cacheObj = { displayName, roleTitle, avatarUrl: updatedAvatarUrl };
          sessionStorage.setItem('profile_cache', JSON.stringify(cacheObj));
          localStorage.setItem('profile_cache', JSON.stringify(cacheObj));
          if (auth.currentUser) {
            const uid = auth.currentUser.uid;
            sessionStorage.setItem(`profile_cache_${uid}`, JSON.stringify(cacheObj));
            localStorage.setItem(`profile_cache_${uid}`, JSON.stringify(cacheObj));
          }
          window.dispatchEvent(new CustomEvent('profile-updated', { detail: cacheObj }));
          return;
        }

        const user = auth.currentUser;
        if (!user) throw new Error('Authorization required.');
        const idToken = await user.getIdToken();

        const response = await fetch(`${FirebaseService.getApiBase()}/user/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to update profile.');
        }

        const resData = await response.json();

        if (statusSpan) {
          statusSpan.textContent = 'Saved';
          statusSpan.style.color = 'var(--emerald)';
          statusSpan.style.display = 'inline';
          setTimeout(() => {
            statusSpan.style.display = 'none';
          }, 3000);
        }

        const updatedName = resData.displayName !== undefined ? resData.displayName : displayName;
        const updatedDomain = resData.targetDomain !== undefined ? resData.targetDomain : roleTitle;
        const updatedAvatarUrl = getAvatarUrl(updatedName);

        // Live preview updates
        if (profilePhotoPreview) {
          profilePhotoPreview.src = updatedAvatarUrl;
          profilePhotoPreview.style.display = 'block';
        }
        if (profilePhotoFallback) profilePhotoFallback.style.display = 'none';

        // Update inputs to match clean server response
        if (profileNameInput && resData.displayName) {
          profileNameInput.value = resData.displayName;
        }
        if (profileRoleInput && resData.targetDomain) {
          profileRoleInput.value = resData.targetDomain;
        }

        showToast('Profile updated successfully!', 'success');

        // Trigger state sync reactively across sessions/tabs/pages
        const cacheObj = { displayName: updatedName, roleTitle: updatedDomain, avatarUrl: updatedAvatarUrl };
        sessionStorage.setItem('profile_cache', JSON.stringify(cacheObj));
        localStorage.setItem('profile_cache', JSON.stringify(cacheObj));
        if (user) {
          sessionStorage.setItem(`profile_cache_${user.uid}`, JSON.stringify(cacheObj));
          localStorage.setItem(`profile_cache_${user.uid}`, JSON.stringify(cacheObj));
        }
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: cacheObj }));

      } catch (err) {
        console.error('Profile update failure:', err);
        const errorMsg = err.name === 'AbortError' ? 'Save request timed out. Please try again.' : (err.message || 'Failed to update profile.');
        if (statusSpan) {
          statusSpan.textContent = errorMsg;
          statusSpan.style.color = 'var(--rose)';
          statusSpan.style.display = 'inline';
        }
        showToast(errorMsg, 'error');
      } finally {
        clearTimeout(timeoutId);
        btnSaveProfile.disabled = false;
        btnSaveProfile.textContent = 'Save Profile';
      }
    });
  }

  // Dynamic preview update as Display Name is typed
  if (profileNameInput) {
    profileNameInput.addEventListener('input', () => {
      const nameVal = profileNameInput.value.trim();
      const user = auth.currentUser;
      const fallbackChar = user?.email?.charAt(0) || 'U';
      const nameParam = nameVal || fallbackChar;
      const updatedUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameParam)}&background=10b981&color=ffffff&size=128&bold=true`;
      if (profilePhotoPreview) {
        profilePhotoPreview.src = updatedUrl;
        profilePhotoPreview.style.display = 'block';
      }
      if (profilePhotoFallback) profilePhotoFallback.style.display = 'none';
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

  // --- Section 2: Delete Account Double Verification ---
  const delAccBtn = document.getElementById('delete-account-btn');
  if (delAccBtn) {
    delAccBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const step1Result = await showCustomModal({
        title: 'Delete Account',
        body: 'Are you sure? This action cannot be reversed. You will immediately lose access to all your analysis reports, settings, and documents.',
        buttons: [
          { text: 'Cancel', type: 'cancel', value: false },
          { text: 'Confirm', type: 'danger', value: true }
        ],
        closeOnBackdropClick: false
      });
      if (step1Result !== true) return;

      const step2Body = document.createElement('div');
      step2Body.style.display = 'flex';
      step2Body.style.flexDirection = 'column';
      step2Body.style.gap = '0.75rem';

      const label = document.createElement('label');
      label.innerHTML = 'To confirm this action, please type <strong style="color: #ffffff;">DELETE</strong> verbatim:';
      label.style.fontSize = '0.85rem';
      label.style.color = '#94a3b8';

      const input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = 'Type DELETE here...';
      input.style.padding = '0.75rem 1rem';
      input.style.borderRadius = '8px';
      input.style.border = '1px solid rgba(255,255,255,0.15)';
      input.style.background = 'rgba(0,0,0,0.3)';
      input.style.color = '#fff';
      input.style.fontSize = '0.9rem';
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';

      step2Body.appendChild(label);
      step2Body.appendChild(input);

      input.addEventListener('input', () => {
        if (input.value.trim() === 'DELETE') {
          input.style.borderColor = '#10b981';
        } else {
          input.style.borderColor = 'rgba(255,255,255,0.15)';
        }
      });

      await showCustomModal({
        title: 'Confirm Deletion',
        body: step2Body,
        buttons: [
          { text: 'Cancel', type: 'cancel', value: false },
          {
            text: 'Permanently Wipe',
            type: 'danger',
            onClick: async (btn, cleanUp, resolve) => {
              if (input.value.trim() !== 'DELETE') {
                input.style.borderColor = '#f43f5e';
                return;
              }

              btn.disabled = true;
              btn.style.opacity = '0.5';
              btn.textContent = 'Wiping...';

              try {
                if (isMockMode) {
                  showToast('Your account has been deleted permanently', 'success');
                  sessionStorage.clear();
                  localStorage.clear();
                  cleanUp();
                  resolve(true);
                  window.location.href = 'index.html?mock=true';
                  return;
                }

                const user = auth.currentUser;
                if (!user) throw new Error('No authenticated session found. Please log in again.');

                await FirebaseService.purgeUserData();
                await deleteUser(user);

                showToast('Your account has been deleted permanently', 'success');
                sessionStorage.clear();
                localStorage.clear();
                cleanUp();
                resolve(true);
                window.location.href = 'index.html';
              } catch (err) {
                console.error('Account deletion failure:', err);
                let userMsg = err.message || 'Deletion failed. Please try again.';
                if (err.code === 'auth/requires-recent-login') {
                  userMsg = 'Security requirement: Please sign out and sign back in to delete your account.';
                }
                showCustomModal({
                  title: 'Deletion Failed',
                  body: userMsg,
                  buttons: [
                    { text: 'OK', type: 'primary', value: true }
                  ],
                  closeOnBackdropClick: true
                });
                cleanUp();
                resolve(false);
              }
            }
          }
        ],
        closeOnBackdropClick: false
      });
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

  // Resume Language preference switcher
  const prefLanguageSelect = document.getElementById('pref-language');
  if (prefLanguageSelect) {
    prefLanguageSelect.addEventListener('change', (e) => {
      const lang = e.target.value;
      localStorage.setItem('pref-language', lang);
      
      // Save to Firebase database too
      const user = auth.currentUser;
      if (user && !isMockMode) {
        const prefRef = ref(db, `users/${user.uid}/preferences`);
        update(prefRef, { language: lang }).catch(err => console.error('Failed to sync language preference:', err));
      }
      showToast(`Default resume language set to: ${prefLanguageSelect.options[prefLanguageSelect.selectedIndex].text}`);
    });
  }

  // Export Profile Data
  const btnExportData = document.getElementById('btn-export-data');
  if (btnExportData) {
    btnExportData.addEventListener('click', async () => {
      console.log('Export JSON click handler triggered.');
      btnExportData.disabled = true;
      const originalText = btnExportData.innerHTML;
      btnExportData.textContent = 'Exporting...';

      try {
        const exportData = await FirebaseService.exportUserData();

        // Programmatically trigger the file download using a Blob + anchor element approach
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'profile-export.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        showToast('Profile data exported successfully!', 'success');
      } catch (err) {
        console.error('Data export failure:', err);
        showCustomModal({
          title: 'Export Failed',
          body: err.message || 'We could not export your profile data right now.',
          buttons: [
            { text: 'OK', type: 'primary', value: true }
          ],
          closeOnBackdropClick: true
        });
      } finally {
        btnExportData.disabled = false;
        btnExportData.innerHTML = originalText;
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
