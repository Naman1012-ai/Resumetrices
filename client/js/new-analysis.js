import { auth, isMockMode } from './firebase-config.js';
import { FirebaseService } from './api.js';
import { escapeHTML, formatTimeAgo, showToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const filePreview = document.getElementById('file-preview');
  const previewFileName = document.getElementById('preview-file-name');
  const previewFileSize = document.getElementById('preview-file-size');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const btnAnalyze = document.getElementById('btn-analyze');
  const targetRoleSelect = document.getElementById('target-role-select');

  let selectedFile = null;

  function checkAnalyzeButtonState() {
    if (selectedFile && targetRoleSelect.value) {
      btnAnalyze.removeAttribute('disabled');
    } else {
      btnAnalyze.setAttribute('disabled', 'true');
    }
  }

  // Handle Drag & Drop / File Selection
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelection(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        handleFileSelection(files[0]);
      }
    });
  }

  function handleFileSelection(file) {
    if (file.type !== 'application/pdf') {
      showToast('Invalid file format. Only PDF files are supported.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File exceeds the 5MB size limit.', 'error');
      return;
    }
    selectedFile = file;
    if (previewFileName) previewFileName.textContent = file.name;
    if (previewFileSize) previewFileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
    if (filePreview) filePreview.style.display = 'flex';
    if (dropZone) dropZone.style.display = 'none';
    checkAnalyzeButtonState();
  }

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFile = null;
      if (fileInput) fileInput.value = '';
      if (filePreview) filePreview.style.display = 'none';
      if (dropZone) dropZone.style.display = 'flex';
      checkAnalyzeButtonState();
    });
  }

  if (targetRoleSelect) {
    targetRoleSelect.addEventListener('change', checkAnalyzeButtonState);
  }

  // Load mini uploads list
  async function loadRecentMiniList() {
    try {
      const history = await FirebaseService.loadAnalysisHistory();
      const miniPanel = document.getElementById('recent-analyses-mini-panel');
      const miniList = document.getElementById('recent-analyses-mini-list');
      
      if (!miniList || !miniPanel) return;

      if (!history || history.length === 0) {
        miniPanel.style.display = 'none';
        return;
      }

      miniPanel.style.display = 'block';
      miniList.innerHTML = '';

      const recent3 = history.slice(0, 3);
      recent3.forEach(item => {
        const card = document.createElement('div');
        card.style.display = 'flex';
        card.style.justifyContent = 'space-between';
        card.style.alignItems = 'center';
        card.style.padding = '0.75rem 1rem';
        card.style.border = '1px solid var(--border-color)';
        card.style.borderRadius = 'var(--radius-md)';
        card.style.background = 'rgba(255,255,255,0.02)';
        card.style.gap = '1rem';

        let scoreColor = 'var(--rose)';
        if (item.score >= 85) scoreColor = 'var(--emerald)';
        else if (item.score >= 60) scoreColor = 'var(--blue)';

        card.innerHTML = `
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;">
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(item.resumeName)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem;">
              <span style="color: var(--emerald); font-weight: 600;">${escapeHTML(item.targetRole)}</span>
              <span>•</span>
              <span>${formatTimeAgo(item.createdAt)}</span>
            </div>
          </div>
          <span style="font-size: 0.9rem; font-weight: 800; color: ${scoreColor}; flex-shrink: 0;">${item.score}/100</span>
        `;
        miniList.appendChild(card);
      });
    } catch (err) {
      console.error('Error loading mini uploads list:', err);
    }
  }

  // Handle run analysis click
  if (btnAnalyze) {
    btnAnalyze.addEventListener('click', async () => {
      const selectedRole = targetRoleSelect ? targetRoleSelect.value : '';
      if (!selectedFile || !selectedRole) {
        showToast('Please upload your resume and select a target job role before starting the analysis.', 'error');
        return;
      }

      // Show loader
      const loader = document.createElement('div');
      loader.className = 'loading-overlay';
      loader.id = 'loading-overlay';
      loader.innerHTML = `
        <div class="spinner"></div>
        <p style="margin-top: 1rem; font-weight: 600;">Running ATS analysis pipeline...</p>
      `;
      document.body.appendChild(loader);
      loader.style.display = 'flex';

      btnAnalyze.setAttribute('disabled', 'true');
      btnAnalyze.textContent = 'Analyzing Resume...';
      if (btnRemoveFile) btnRemoveFile.setAttribute('disabled', 'true');

      const formData = new FormData();
      formData.append('resume', selectedFile);
      formData.append('targetRole', selectedRole);

      try {
        if (isMockMode) {
          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, 2000));
          const mockId = 'mock_' + Date.now();
          showToast('Analysis completed (Mock Mode)!', 'success');
          
          sessionStorage.setItem('activeAnalysisId', mockId);
          const mockParam = isMockMode ? '&mock=true' : '';
          window.location.href = `analysis.html?id=${mockId}${mockParam}`;
          return;
        }

        const user = auth.currentUser;
        if (!user) throw new Error('Authorization required.');
        const idToken = await user.getIdToken();

        const response = await fetch(`${FirebaseService.getApiBase()}/analyze`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${idToken}` },
          body: formData
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || 'Analysis pipeline execution failed.');
        }

        FirebaseService.clearCache();
        sessionStorage.setItem('activeAnalysisId', result.analysisId);
        
        showToast('Analysis completed successfully!', 'success');
        const mockParam = isMockMode ? '&mock=true' : '';
        window.location.href = `analysis.html?id=${result.analysisId}${mockParam}`;

      } catch (error) {
        console.error('Analysis error:', error);
        showToast(error.message || 'Failed to analyze resume.', 'error');
        btnAnalyze.removeAttribute('disabled');
        btnAnalyze.textContent = 'Run Pipeline Analysis';
      } finally {
        loader.remove();
        if (btnRemoveFile) btnRemoveFile.removeAttribute('disabled');
      }
    });
  }

  // Check for pending landing page file
  const pendingBase64 = sessionStorage.getItem('pendingFileBase64');
  const pendingName = sessionStorage.getItem('pendingFileName');
  const pendingSize = parseInt(sessionStorage.getItem('pendingFileSize'), 10);
  const pendingRole = sessionStorage.getItem('pendingTargetRole');

  if (pendingBase64 && pendingName) {
    fetch(pendingBase64)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], pendingName, { type: 'application/pdf' });
        selectedFile = file;
        
        if (previewFileName) previewFileName.textContent = pendingName;
        if (previewFileSize) previewFileSize.textContent = (pendingSize / 1024).toFixed(1) + ' KB';
        if (filePreview) filePreview.style.display = 'flex';
        if (dropZone) dropZone.style.display = 'none';
        
        if (pendingRole && targetRoleSelect) {
          targetRoleSelect.value = pendingRole;
        }
        
        checkAnalyzeButtonState();

        sessionStorage.removeItem('pendingFileBase64');
        sessionStorage.removeItem('pendingFileName');
        sessionStorage.removeItem('pendingFileSize');
        sessionStorage.removeItem('pendingTargetRole');
      })
      .catch(err => {
        console.error('Failed to restore landing page upload:', err);
      });
  }

  auth.onAuthStateChanged((user) => {
    if (user || isMockMode) {
      loadRecentMiniList();
    }
  });
});
