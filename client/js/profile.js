import { auth, db, isMockMode } from './firebase-config.js';
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, get, child, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { FirebaseService } from './api.js';
import { showToast, escapeHTML } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const profileDisplayName = document.getElementById('profile-display-name');
  const profileRoleTitle = document.getElementById('profile-role-title');
  const profileEmail = document.getElementById('profile-email');
  const profileCreatedDate = document.getElementById('profile-created-date');
  const profileProvider = document.getElementById('profile-provider');
  const profileAvatarPlaceholder = document.getElementById('profile-avatar-placeholder');
  const profileAvatarImage = document.getElementById('profile-avatar-image');
  const avatarFileInput = document.getElementById('avatar-file-input');

  const btnProfileEdit = document.getElementById('btn-profile-edit');
  const btnProfileSave = document.getElementById('btn-profile-save');
  const btnProfileCancel = document.getElementById('btn-profile-cancel');
  
  const btnRoleEdit = document.getElementById('btn-role-edit');
  const btnRoleSave = document.getElementById('btn-role-save');
  const btnRoleCancel = document.getElementById('btn-role-cancel');

  const profileNameDisplayContainer = document.getElementById('profile-name-display-container');
  const profileNameEditContainer = document.getElementById('profile-name-edit-container');
  const inputProfileName = document.getElementById('input-profile-name');

  const profileRoleDisplayContainer = document.getElementById('profile-role-display-container');
  const profileRoleEditContainer = document.getElementById('profile-role-edit-container');
  const inputProfileRole = document.getElementById('input-profile-role');

  const historyTableBody = document.getElementById('history-table-body');
  const competencyTabContent = document.getElementById('competency-tab-content');
  const compTabBtns = document.querySelectorAll('.comp-tab-btn');

  // Rename Modal Elements
  const renameModal = document.getElementById('rename-modal');
  const renameInput = document.getElementById('rename-input');
  const btnRenameCancel = document.getElementById('btn-rename-cancel');
  const btnRenameConfirm = document.getElementById('btn-rename-confirm');

  // Delete Confirmation Modal Elements
  const deleteConfirmModal = document.getElementById('delete-confirm-modal');
  const btnDeleteCancel = document.getElementById('btn-delete-cancel');
  const btnDeleteConfirmSubmit = document.getElementById('btn-delete-confirm-submit');

  // Inline Save Status Indicators
  const nameSaveStatus = document.getElementById('name-save-status');
  const roleSaveStatus = document.getElementById('role-save-status');

  // State
  let activeRenameId = null;
  let activeRenameRow = null; // Reference to the <tr> element being renamed
  let activeDeleteId = null;
  let activeDeleteRow = null; // Reference to the <tr> element being deleted
  let currentInterviewPrep = null;
  let activeTab = 'technical';
  let isProfileLoaded = false;

  /**
   * Flash an inline save status indicator next to an edit field.
   * Clears itself after a delay.
   */
  function flashStatus(element, status) {
    if (!element) return;
    element.style.opacity = '1';
    if (status === 'saving') {
      element.textContent = 'Saving...';
      element.style.color = 'var(--text-muted)';
    } else if (status === 'saved') {
      element.textContent = '✓ Saved';
      element.style.color = 'var(--emerald)';
      setTimeout(() => { element.style.opacity = '0'; }, 2000);
    } else if (status === 'error') {
      element.textContent = '⚠ Error';
      element.style.color = 'var(--danger)';
      setTimeout(() => { element.style.opacity = '0'; }, 3000);
    }
  }

  // Load User Identity Data
  async function loadProfileData() {
    // 1. Try to read from local memory cache first for instant Zero-Lag rendering
    let cachedRoleTitle = 'Software Engineer';
    let cachedAvatarUrl = '';
    let cachedDisplayName = '';
    
    try {
      const cached = sessionStorage.getItem('profile_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.roleTitle) cachedRoleTitle = parsed.roleTitle;
        if (parsed.avatarUrl) cachedAvatarUrl = parsed.avatarUrl;
        if (parsed.displayName) cachedDisplayName = parsed.displayName;
      }
    } catch (e) {
      console.warn('Failed to parse profile cache:', e);
    }

    // Wait for auth to resolve if currentUser is null (first-load race condition)
    let user = auth.currentUser;
    if (!user && !isMockMode) {
      // Give Firebase Auth up to 3s to resolve the session
      user = await new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((u) => {
          unsubscribe();
          resolve(u);
        });
        setTimeout(() => resolve(null), 3000);
      });
    }
    if (!user && !isMockMode) return;

    let displayName = cachedDisplayName || (user ? (user.displayName || user.email.split('@')[0]) : 'Demo Pilot');
    let email = user ? (user.email || 'N/A') : 'demo@atspilot.co';
    let provider = user ? (user.providerData && user.providerData.length > 0 ? user.providerData[0].providerId : 'password') : 'password';
    let creationTime = user && user.metadata && user.metadata.creationTime 
      ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) 
      : 'June 25, 2026';
    let roleTitle = cachedRoleTitle;
    let avatarUrl = cachedAvatarUrl || (user && user.photoURL ? user.photoURL : '');

    // Optimistically Render all profile fields immediately (Zero-Lag UI)
    if (profileDisplayName) profileDisplayName.textContent = displayName;
    if (profileRoleTitle) profileRoleTitle.textContent = roleTitle;
    if (profileEmail) profileEmail.textContent = email;
    if (profileCreatedDate) profileCreatedDate.textContent = creationTime;
    if (profileProvider) profileProvider.textContent = provider;
    updateAvatarUI(displayName, avatarUrl);

    // Call loadAnalysisHistory immediately after optimistic render so table content loads without lag
    loadAnalysisHistory();

    // 2. Fetch fresh details from RTDB in background without blocking the UI
    if (!isMockMode && user) {
      try {
        const userRef = ref(db, `users/${user.uid}/profile`);
        const snapshot = await Promise.race([
          get(userRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('RTDB fetch timed out')), 5000))
        ]);
        if (snapshot.exists()) {
          const val = snapshot.val();
          let needsUpdate = false;
          
          if (val.roleTitle && val.roleTitle !== roleTitle) {
            roleTitle = val.roleTitle;
            if (profileRoleTitle) profileRoleTitle.textContent = roleTitle;
            needsUpdate = true;
          }
          if (val.displayName && val.displayName !== displayName) {
            displayName = val.displayName;
            if (profileDisplayName) profileDisplayName.textContent = displayName;
            needsUpdate = true;
          }
          if (val.avatarUrl && val.avatarUrl !== avatarUrl) {
            avatarUrl = val.avatarUrl;
            updateAvatarUI(displayName, avatarUrl);
            needsUpdate = true;
          }
          
          // Write to local cache on change
          sessionStorage.setItem('profile_cache', JSON.stringify({ roleTitle, avatarUrl, displayName }));
        }
      } catch (err) {
        console.warn('Background profile sync skipped:', err.message);
      }
    }
  }

  // Helper: Update Avatar Image/Placeholder
  function updateAvatarUI(displayName, avatarUrl) {
    if (avatarUrl) {
      if (profileAvatarImage) {
        profileAvatarImage.src = avatarUrl;
        profileAvatarImage.style.display = 'block';
      }
      if (profileAvatarPlaceholder) {
        profileAvatarPlaceholder.style.display = 'none';
      }
    } else {
      if (profileAvatarImage) {
        profileAvatarImage.style.display = 'none';
        profileAvatarImage.src = '';
      }
      if (profileAvatarPlaceholder) {
        profileAvatarPlaceholder.textContent = displayName.charAt(0).toUpperCase();
        profileAvatarPlaceholder.style.display = 'flex';
      }
    }
  }

  // Avatar Upload Handler
  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Please upload a valid image file.', 'error');
        return;
      }

      if (file.size > 2 * 1024 * 1024) { // 2MB Limit
        showToast('Image size must be less than 2MB.', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target.result;

        // Immediately swap the DOM — don't wait for the write to resolve
        const currentName = profileDisplayName ? profileDisplayName.textContent : 'User';
        updateAvatarUI(currentName, dataUrl);

        try {
          if (isMockMode) {
            showToast('Avatar updated (Mock Mode)!');
            return;
          }

          const user = auth.currentUser;
          if (!user) throw new Error('Authorization required.');

          // Save Base64 to RTDB profile node and root central user document
          await Promise.all([
            set(ref(db, `users/${user.uid}/profile/avatarUrl`), dataUrl),
            set(ref(db, `users/${user.uid}/avatarUrl`), dataUrl),
            set(ref(db, `users/${user.uid}/photoURL`), dataUrl)
          ]);

          // Also update Auth user's photoURL for cross-session persistence
          await updateProfile(user, { photoURL: dataUrl });

          // Update local session storage cache
          try {
            const cached = JSON.parse(sessionStorage.getItem('profile_cache') || '{}');
            cached.avatarUrl = dataUrl;
            sessionStorage.setItem('profile_cache', JSON.stringify(cached));
          } catch (e) {
            console.warn('Failed to update avatar cache:', e);
          }

          showToast('Avatar photo updated successfully!', 'success');
        } catch (err) {
          console.error('Avatar save failure:', err);
          showToast('Failed to save avatar image.', 'error');
          // Revert to placeholder on failure
          updateAvatarUI(profileDisplayName ? profileDisplayName.textContent : 'User', '');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Edit Name Actions
  if (btnProfileEdit) {
    btnProfileEdit.addEventListener('click', () => {
      if (inputProfileName) {
        inputProfileName.value = profileDisplayName.textContent;
      }
      if (profileNameDisplayContainer) profileNameDisplayContainer.style.display = 'none';
      if (profileNameEditContainer) profileNameEditContainer.style.display = 'flex';
      if (inputProfileName) inputProfileName.focus();
    });
  }

  if (btnProfileCancel) {
    btnProfileCancel.addEventListener('click', () => {
      if (profileNameDisplayContainer) profileNameDisplayContainer.style.display = 'flex';
      if (profileNameEditContainer) profileNameEditContainer.style.display = 'none';
    });
  }

  if (btnProfileSave) {
    btnProfileSave.addEventListener('click', async () => {
      if (!inputProfileName) return;
      const newName = inputProfileName.value.trim();
      if (!newName) {
        showToast('Name cannot be empty.', 'error');
        return;
      }

      btnProfileSave.setAttribute('disabled', 'true');
      btnProfileSave.textContent = 'Saving...';
      flashStatus(nameSaveStatus, 'saving');

      try {
        if (isMockMode) {
          if (profileDisplayName) profileDisplayName.textContent = newName;
          if (profileNameDisplayContainer) profileNameDisplayContainer.style.display = 'flex';
          if (profileNameEditContainer) profileNameEditContainer.style.display = 'none';
          flashStatus(nameSaveStatus, 'saved');
          return;
        }

        const user = auth.currentUser;
        if (!user) throw new Error('Authorization required.');

        // Write to Firebase Auth and RTDB in parallel
        await Promise.all([
          updateProfile(user, { displayName: newName }),
          set(ref(db, `users/${user.uid}/profile/displayName`), newName),
          set(ref(db, `users/${user.uid}/displayName`), newName)
        ]);

        // Update DOM directly — zero reload
        if (profileDisplayName) profileDisplayName.textContent = newName;

        // Update local session storage cache
        try {
          const cached = JSON.parse(sessionStorage.getItem('profile_cache') || '{}');
          cached.displayName = newName;
          sessionStorage.setItem('profile_cache', JSON.stringify(cached));
        } catch (e) {
          console.warn('Failed to update name cache:', e);
        }

        if (profileNameDisplayContainer) profileNameDisplayContainer.style.display = 'flex';
        if (profileNameEditContainer) profileNameEditContainer.style.display = 'none';
        flashStatus(nameSaveStatus, 'saved');
      } catch (err) {
        showToast(err.message || 'Failed to update name.', 'error');
        flashStatus(nameSaveStatus, 'error');
      } finally {
        btnProfileSave.removeAttribute('disabled');
        btnProfileSave.textContent = 'Save';
      }
    });
  }

  // Edit Role/Title Actions
  if (btnRoleEdit) {
    btnRoleEdit.addEventListener('click', () => {
      if (inputProfileRole) {
        inputProfileRole.value = profileRoleTitle.textContent;
      }
      if (profileRoleDisplayContainer) profileRoleDisplayContainer.style.display = 'none';
      if (profileRoleEditContainer) profileRoleEditContainer.style.display = 'flex';
      if (inputProfileRole) inputProfileRole.focus();
    });
  }

  if (btnRoleCancel) {
    btnRoleCancel.addEventListener('click', () => {
      if (profileRoleDisplayContainer) profileRoleDisplayContainer.style.display = 'flex';
      if (profileRoleEditContainer) profileRoleEditContainer.style.display = 'none';
    });
  }

  if (btnRoleSave) {
    btnRoleSave.addEventListener('click', async () => {
      if (!inputProfileRole) return;
      const newRole = inputProfileRole.value.trim();
      if (!newRole) {
        showToast('Role cannot be empty.', 'error');
        return;
      }

      btnRoleSave.setAttribute('disabled', 'true');
      btnRoleSave.textContent = 'Saving...';
      flashStatus(roleSaveStatus, 'saving');

      try {
        if (isMockMode) {
          if (profileRoleTitle) profileRoleTitle.textContent = newRole;
          if (profileRoleDisplayContainer) profileRoleDisplayContainer.style.display = 'flex';
          if (profileRoleEditContainer) profileRoleEditContainer.style.display = 'none';
          flashStatus(roleSaveStatus, 'saved');
          return;
        }

        const user = auth.currentUser;
        if (!user) throw new Error('Authorization required.');

        await Promise.all([
          set(ref(db, `users/${user.uid}/profile/roleTitle`), newRole),
          set(ref(db, `users/${user.uid}/roleTitle`), newRole),
          set(ref(db, `users/${user.uid}/domain`), newRole),
          set(ref(db, `users/${user.uid}/domainName`), newRole)
        ]);

        // Update DOM directly — zero reload
        if (profileRoleTitle) profileRoleTitle.textContent = newRole;

        // Update local session storage cache
        try {
          const cached = JSON.parse(sessionStorage.getItem('profile_cache') || '{}');
          cached.roleTitle = newRole;
          sessionStorage.setItem('profile_cache', JSON.stringify(cached));
        } catch (e) {
          console.warn('Failed to update role cache:', e);
        }

        if (profileRoleDisplayContainer) profileRoleDisplayContainer.style.display = 'flex';
        if (profileRoleEditContainer) profileRoleEditContainer.style.display = 'none';
        flashStatus(roleSaveStatus, 'saved');
      } catch (err) {
        showToast(err.message || 'Failed to update professional title.', 'error');
        flashStatus(roleSaveStatus, 'error');
      } finally {
        btnRoleSave.removeAttribute('disabled');
        btnRoleSave.textContent = 'Save';
      }
    });
  }

  // Load Analysis History Table
  async function loadAnalysisHistory() {
    try {
      const history = await FirebaseService.loadAnalysisHistory();
      
      if (!history || history.length === 0) {
        historyTableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No parsed analyses found.</td>
          </tr>
        `;
        renderInterviewPrep(null);
        return;
      }

      historyTableBody.innerHTML = '';
      history.forEach(item => {
        const dateStr = new Date(item.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        const row = document.createElement('tr');
        row.innerHTML = `
          <td style="padding: 1rem; font-weight: 600; color: var(--text-main);">${item.resumeName || 'CV.pdf'}</td>
          <td style="padding: 1rem; color: var(--text-muted);">${item.targetRole || 'N/A'}</td>
          <td style="padding: 1rem;"><span style="color: var(--emerald); font-weight: 700;">${item.score || 0}/100</span></td>
          <td style="padding: 1rem; color: var(--text-muted);">${dateStr}</td>
          <td style="padding: 1rem;">
            <div class="action-btn-row">
              <button class="btn-table-action view view-insights-btn" data-id="${item.analysisId}">View Insights</button>
              <button class="btn-table-action rename-btn" data-id="${item.analysisId}" data-name="${item.resumeName || ''}">Rename</button>
              <button class="btn-table-action delete delete-btn" data-id="${item.analysisId}">Delete</button>
            </div>
          </td>
        `;
        historyTableBody.appendChild(row);
      });

      // Bind dynamic row actions via event delegation
      if (historyTableBody && !historyTableBody.dataset.delegated) {
        historyTableBody.dataset.delegated = 'true';
        historyTableBody.addEventListener('click', async (e) => {
          const viewBtn = e.target.closest('.view-insights-btn');
          const renameBtn = e.target.closest('.rename-btn');
          const deleteBtn = e.target.closest('.delete-btn');
          const inlineSaveBtn = e.target.closest('.inline-save-btn');
          const inlineCancelBtn = e.target.closest('.inline-cancel-btn');

          if (viewBtn) {
            const analysisId = viewBtn.dataset.id;
            const mockParam = isMockMode ? '&mock=true' : '';
            window.location.href = `analysis.html?id=${analysisId}${mockParam}`;
          }

          if (renameBtn) {
            const row = renameBtn.closest('tr');
            if (!row || row.dataset.editing === 'true') return;

            row.dataset.editing = 'true';
            const nameCell = row.querySelector('td:first-child');
            const actionsCell = row.querySelector('td:last-child');
            if (!nameCell || !actionsCell) return;

            const oldName = nameCell.textContent.trim();
            row.dataset.oldName = oldName;
            row.dataset.oldActions = actionsCell.innerHTML;

            nameCell.innerHTML = `
              <input type="text" class="inline-rename-input" placeholder="Enter new report name..." value="${escapeHTML(oldName)}" style="padding: 0.25rem 0.5rem; width: 100%; border-radius: var(--radius-md); border: 1px solid var(--emerald); background: rgba(0,0,0,0.3); color: var(--text-main); font-size: 0.85rem;">
            `;

            actionsCell.innerHTML = `
              <div class="action-btn-row">
                <button class="btn-table-action view inline-save-btn" style="background: var(--emerald); color: #030712; font-weight: 700;">Save</button>
                <button class="btn-table-action delete inline-cancel-btn">Cancel</button>
              </div>
            `;

            const input = nameCell.querySelector('.inline-rename-input');
            input.focus();
            input.select();

            input.addEventListener('keydown', (evt) => {
              if (evt.key === 'Enter') {
                evt.preventDefault();
                actionsCell.querySelector('.inline-save-btn').click();
              }
              if (evt.key === 'Escape') {
                evt.preventDefault();
                actionsCell.querySelector('.inline-cancel-btn').click();
              }
            });
          }

          if (inlineSaveBtn) {
            const row = inlineSaveBtn.closest('tr');
            if (!row) return;
            
            // Find the analysis ID from the dataset of the stored old actions
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = row.dataset.oldActions;
            const refBtn = tempDiv.querySelector('[data-id]');
            const analysisId = refBtn ? refBtn.dataset.id : null;

            const input = row.querySelector('.inline-rename-input');
            const nameCell = row.querySelector('td:first-child');
            const actionsCell = row.querySelector('td:last-child');
            if (!input || !nameCell || !actionsCell || !analysisId) return;

            const newName = input.value.trim();
            if (!newName) {
              showToast('Name cannot be empty.', 'error');
              return;
            }

            input.disabled = true;
            inlineSaveBtn.disabled = true;
            inlineSaveBtn.textContent = 'Saving...';

            try {
              await FirebaseService.renameAnalysis(analysisId, newName);
              nameCell.textContent = newName;
              row.dataset.editing = 'false';

              // Restore actions HTML and update the data-name attribute on rename-btn
              actionsCell.innerHTML = row.dataset.oldActions;
              const newRenameBtn = actionsCell.querySelector('.rename-btn');
              if (newRenameBtn) newRenameBtn.dataset.name = newName;

              showToast('Analysis renamed successfully!', 'success');
            } catch (err) {
              showToast(err.message || 'Failed to rename document.', 'error');
              // Revert
              nameCell.textContent = row.dataset.oldName;
              actionsCell.innerHTML = row.dataset.oldActions;
              row.dataset.editing = 'false';
            }
          }

          if (inlineCancelBtn) {
            const row = inlineCancelBtn.closest('tr');
            if (!row) return;
            const nameCell = row.querySelector('td:first-child');
            const actionsCell = row.querySelector('td:last-child');
            if (!nameCell || !actionsCell) return;

            nameCell.textContent = row.dataset.oldName;
            actionsCell.innerHTML = row.dataset.oldActions;
            row.dataset.editing = 'false';
          }

          if (deleteBtn) {
            activeDeleteId = deleteBtn.dataset.id;
            activeDeleteRow = deleteBtn.closest('tr');
            if (deleteConfirmModal) {
              deleteConfirmModal.style.display = 'flex';
            }
          }
        });
      }

      // Load interview prep suite from the latest analysis report
      if (history.length > 0) {
        try {
          const fullDetail = await FirebaseService.loadAnalysisById(history[0].analysisId);
          // Extract the nested interviewPrep object — the render function expects
          // { technical: [...], projectBased: [...], behavioral: [...], hrQuestions: [...] }
          currentInterviewPrep = fullDetail && fullDetail.interviewPrep ? fullDetail.interviewPrep : null;
        } catch (prepErr) {
          console.warn('Failed to load interview prep data:', prepErr.message);
          currentInterviewPrep = null;
        }
      } else {
        currentInterviewPrep = null;
      }

      renderInterviewPrep(currentInterviewPrep);
    } catch (err) {
      console.error('Failed to load history:', err);
      historyTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load analysis history.</td>
        </tr>
      `;
    }
  }

  // Delete Modal Confirmation Handlers
  if (btnDeleteCancel) {
    btnDeleteCancel.addEventListener('click', () => {
      if (deleteConfirmModal) deleteConfirmModal.style.display = 'none';
      activeDeleteId = null;
      activeDeleteRow = null;
    });
  }

  if (btnDeleteConfirmSubmit) {
    btnDeleteConfirmSubmit.addEventListener('click', async () => {
      if (!activeDeleteId) return;
      
      btnDeleteConfirmSubmit.setAttribute('disabled', 'true');
      btnDeleteConfirmSubmit.textContent = 'Deleting...';

      try {
        await FirebaseService.deleteAnalysis(activeDeleteId);

        // Smoothly animate the row out of the DOM on success
        if (activeDeleteRow) {
          activeDeleteRow.style.transition = 'opacity 300ms ease, transform 300ms ease';
          activeDeleteRow.style.opacity = '0';
          activeDeleteRow.style.transform = 'translateX(20px)';
          
          const rowToRemove = activeDeleteRow;
          setTimeout(() => {
            rowToRemove.remove();
            // If table is now empty, show empty state
            if (historyTableBody && historyTableBody.children.length === 0) {
              historyTableBody.innerHTML = `
                <tr>
                  <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No parsed analyses found.</td>
                </tr>
              `;
            }
          }, 300);
        }

        showToast('Analysis deleted successfully.');
        
        // Close modal
        if (deleteConfirmModal) deleteConfirmModal.style.display = 'none';
        activeDeleteId = null;
        activeDeleteRow = null;

      } catch (err) {
        showToast(err.message || 'Failed to delete analysis.', 'error');
      } finally {
        btnDeleteConfirmSubmit.removeAttribute('disabled');
        btnDeleteConfirmSubmit.textContent = 'Delete';
      }
    });
  }

  // Render Tabbed Competency Suite
  function renderInterviewPrep(prepData) {
    if (!prepData) {
      competencyTabContent.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--text-muted); font-size: 0.85rem;">
          No interview preparation questions found. Please upload a resume or generate questions first.
        </div>
      `;
      return;
    }

    let questions = [];
    if (activeTab === 'technical') {
      questions = prepData.technical || [];
    } else if (activeTab === 'projectBased') {
      questions = prepData.projectBased || [];
    } else if (activeTab === 'domainKnowledge') {
      questions = (prepData.domainKnowledge && prepData.domainKnowledge.length > 0) ? prepData.domainKnowledge : (prepData.skillGap || []);
    } else if (activeTab === 'behavioral') {
      questions = prepData.behavioral || [];
    } else if (activeTab === 'hrQuestions') {
      questions = prepData.hrQuestions || [];
    }

    if (questions.length === 0) {
      competencyTabContent.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem;">
          No questions in this competency tab.
        </div>
      `;
      return;
    }

    competencyTabContent.innerHTML = '';
    questions.forEach((q, index) => {
      const questionText = q.question || q;
      const answerText = q.answer || q.response || 'No sample response suggested yet.';
      
      const card = document.createElement('div');
      card.className = 'q-prep-card';
      card.innerHTML = `
        <div class="q-prep-question">Q${index + 1}: ${questionText}</div>
        <div class="q-prep-answer"><strong>Suggested Response:</strong> ${answerText}</div>
      `;
      competencyTabContent.appendChild(card);
    });
  }

  // Bind Competency Tab Switching
  compTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      compTabBtns.forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = 'transparent';
        b.style.color = 'var(--text-muted)';
      });

      e.target.classList.add('active');
      e.target.style.borderColor = 'var(--emerald)';
      e.target.style.color = 'var(--text-main)';

      activeTab = e.target.dataset.tab;
      renderInterviewPrep(currentInterviewPrep);
    });
  });

  // Init
  auth.onAuthStateChanged((user) => {
    if ((user || isMockMode) && !isProfileLoaded) {
      isProfileLoaded = true;
      loadProfileData();
    }
  });
});
