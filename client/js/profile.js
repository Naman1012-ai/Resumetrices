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
  // State
  let activeRenameId = null;
  let activeRenameRow = null; // Reference to the <tr> element being renamed
  let activeDeleteId = null;
  let activeDeleteRow = null; // Reference to the <tr> element being deleted
  let currentInterviewPrep = null;
  let activeTab = 'technical';
  let isProfileLoaded = false;

  // Load User Identity Data
  // Load User Identity Data
  async function loadProfileData() {
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

    let cachedRoleTitle = '';
    let cachedDisplayName = '';
    
    if (user) {
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
          if (parsed.roleTitle) cachedRoleTitle = parsed.roleTitle;
          if (parsed.displayName) cachedDisplayName = parsed.displayName;
        }
      } catch (e) {
        console.warn('Failed to parse profile cache:', e);
      }
    }

    let displayName = cachedDisplayName || (user ? (user.displayName || user.email.split('@')[0]) : 'Demo Pilot');
    let email = user ? (user.email || 'N/A') : 'demo@atspilot.co';
    let provider = user ? (user.providerData && user.providerData.length > 0 ? user.providerData[0].providerId : 'password') : 'password';
    let creationTime = user && user.metadata && user.metadata.creationTime 
      ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) 
      : 'June 25, 2026';
    let roleTitle = cachedRoleTitle;

    // Optimistically Render all profile fields immediately (Zero-Lag UI)
    if (profileDisplayName) profileDisplayName.textContent = displayName;
    updateRoleTitleUI(roleTitle);
    if (profileEmail) profileEmail.textContent = email;
    if (profileCreatedDate) profileCreatedDate.textContent = creationTime;
    if (profileProvider) profileProvider.textContent = provider;
    updateAvatarUI(displayName);

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
          
          const dbRole = val.targetDomain || '';
          if (dbRole !== roleTitle) {
            roleTitle = dbRole;
            updateRoleTitleUI(roleTitle);
            needsUpdate = true;
          }
          if (val.displayName && val.displayName !== displayName) {
            displayName = val.displayName;
            if (profileDisplayName) profileDisplayName.textContent = displayName;
            needsUpdate = true;
          }
          
          // Write to local cache on change
          if (needsUpdate) {
            const fallbackChar = user?.email?.charAt(0) || 'U';
            const calculatedAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || fallbackChar)}&background=10b981&color=ffffff&size=128&bold=true`;
            const cacheObj = { displayName, roleTitle, avatarUrl: calculatedAvatarUrl };
            sessionStorage.setItem('profile_cache', JSON.stringify(cacheObj));
            localStorage.setItem('profile_cache', JSON.stringify(cacheObj));
            sessionStorage.setItem(`profile_cache_${user.uid}`, JSON.stringify(cacheObj));
            localStorage.setItem(`profile_cache_${user.uid}`, JSON.stringify(cacheObj));
          }
        }
      } catch (err) {
        console.warn('Background profile sync skipped:', err.message);
      }
    }
  }

  // Helper: Update Role Title UI
  function updateRoleTitleUI(title) {
    if (!profileRoleTitle) return;
    if (title && title.trim() !== '') {
      profileRoleTitle.textContent = title;
      profileRoleTitle.style.color = 'var(--emerald)';
    } else {
      profileRoleTitle.innerHTML = `<a href="settings.html" style="color: var(--text-muted); text-decoration: underline; font-size: 0.8rem; font-weight: 500; transition: color var(--transition-fast);" onmouseover="this.style.color='var(--emerald)'" onmouseout="this.style.color='var(--text-muted)'">No target domain set. Please set in Settings.</a>`;
    }
  }

  // Helper: Update Avatar Image/Placeholder
  function updateAvatarUI(displayName) {
    const user = auth.currentUser;
    const fallbackChar = user?.email?.charAt(0) || 'U';
    const nameParam = displayName || fallbackChar;
    const calculatedAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameParam)}&background=10b981&color=ffffff&size=128&bold=true`;

    if (profileAvatarImage) {
      profileAvatarImage.src = calculatedAvatarUrl;
      profileAvatarImage.style.display = 'block';
    }
    if (profileAvatarPlaceholder) {
      profileAvatarPlaceholder.style.display = 'none';
    }
  }

  window.addEventListener('profile-updated', (e) => {
    const { displayName, roleTitle } = e.detail;
    if (profileDisplayName) profileDisplayName.textContent = displayName;
    updateRoleTitleUI(roleTitle);
    updateAvatarUI(displayName);
  });

  window.addEventListener('storage', (e) => {
    if (e.key === 'profile_cache') {
      loadProfileData();
    }
  });

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
