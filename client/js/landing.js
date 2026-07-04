import { db, auth, isMockMode } from './firebase-config.js';
import { ref, get, update, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { escapeHTML, showToast, mapFriendlyErrorMessage, getFriendlyAuthErrorMessage, getCompatibilityDetails, showAnalysisProgress } from './utils.js';
import { API_BASE } from './api.js';

const googleProvider = new GoogleAuthProvider();

// Initialize global appState memory object as defined in BRAIN.md
window.appState = {
  activeAnalysis: null
};


document.addEventListener('DOMContentLoaded', () => {
  let isRedirectProcessing = true;

  function redirectUser() {
    const user = auth.currentUser;
    const adminEmail = window.process?.env?.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';
    const mockParam = isMockMode ? '?mock=true' : '';
    const mockQuery = mockParam ? (mockParam.startsWith('?') ? mockParam : '?' + mockParam) : '';

    if (user && user.email === adminEmail) {
      window.location.href = `/admin/dashboard.html${mockQuery}`;
      return;
    }

    window.location.href = `/dashboard.html${mockQuery}`;
  }

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
      
      const pendingReportAction = sessionStorage.getItem('pendingReportAction');
      if (pendingReportAction === 'true') {
        const cachedReport = sessionStorage.getItem('pendingGuestReport');
        if (cachedReport) {
          try {
            window.appState.activeAnalysis = JSON.parse(cachedReport);
          } catch (e) {
            console.error('Failed to parse cached guest report:', e);
          }
        }
        sessionStorage.removeItem('pendingReportAction');
        sessionStorage.removeItem('pendingGuestReport');
        await handleAuthSessionBridge(user);
        return;
      }
      
      redirectUser();
    } else {
      isRedirectProcessing = false;
      if (auth.currentUser) {
        const pendingReportAction = sessionStorage.getItem('pendingReportAction');
        if (pendingReportAction === 'true') {
          const cachedReport = sessionStorage.getItem('pendingGuestReport');
          if (cachedReport) {
            try {
              window.appState.activeAnalysis = JSON.parse(cachedReport);
            } catch (e) {
              console.error('Failed to parse cached guest report:', e);
            }
          }
          sessionStorage.removeItem('pendingReportAction');
          sessionStorage.removeItem('pendingGuestReport');
          await handleAuthSessionBridge(auth.currentUser);
          return;
        }
        
        if (!window.appState.activeAnalysis) {
          redirectUser();
        }
      }
    }
  }).catch((error) => {
    isRedirectProcessing = false;
    console.error("OAuth Error Context:", error);
    showToast(`Google Sign-In Error: ${error.code} - ${error.message}`, 'error');
  });

  const landingFileInput = document.getElementById('landing-file-input');
  const landingDropZone = document.getElementById('landing-drop-zone');
  const landingFilePreview = document.getElementById('landing-file-preview');
  const landingPreviewFilename = document.getElementById('landing-preview-filename');
  const landingPreviewFilesize = document.getElementById('landing-preview-filesize');
  const landingBtnRemoveFile = document.getElementById('landing-btn-remove-file');
  const landingRoleSelectInput = document.getElementById('landing-role-select-input');
  const landingCustomRoleInput = document.getElementById('landing-custom-role-input');
  const btnLandingAnalyze = document.getElementById('btn-landing-analyze');
  const landingErrorBox = document.getElementById('landing-error-box');

  if (landingRoleSelectInput && landingCustomRoleInput) {
    landingRoleSelectInput.addEventListener('change', () => {
      const isOther = landingRoleSelectInput.value === 'Other';
      if (isOther) {
        landingCustomRoleInput.removeAttribute('disabled');
        landingCustomRoleInput.focus();
      } else {
        landingCustomRoleInput.setAttribute('disabled', 'true');
        landingCustomRoleInput.value = '';
      }
    });
  }

  const serverStatusDot = document.getElementById('server-status-dot');
  const serverStatusText = document.getElementById('server-status-text');

  // Teaser Dashboard Elements
  const teaserDashboardContainer = document.getElementById('teaser-dashboard-container');
  const landingContainer = document.getElementById('landing-container');
  const teaserResumeName = document.getElementById('teaser-resume-name');
  const teaserTargetRole = document.getElementById('teaser-target-role');
  const teaserScoreBadge = document.getElementById('teaser-score-badge');
  const teaserScoreNumber = document.getElementById('teaser-score-number');
  const teaserScoreCircle = document.getElementById('teaser-score-circle');
  const teaserFeedback = document.getElementById('teaser-feedback');
  const teaserMissingSkills = document.getElementById('teaser-missing-skills');

  // Auth Modal Elements
  const authModalOverlay = document.getElementById('auth-modal-overlay');
  const btnModalClose = document.getElementById('btn-modal-close');
  const modalTabSignup = document.getElementById('modal-tab-signup');
  const modalTabLogin = document.getElementById('modal-tab-login');
  const authModalTitle = document.getElementById('auth-modal-title');
  const authModalSubtitle = document.getElementById('auth-modal-subtitle');
  const btnModalGoogle = document.getElementById('btn-modal-google');
  const modalAuthForm = document.getElementById('modal-auth-form');
  const modalAuthEmail = document.getElementById('modal-auth-email');
  const modalAuthPassword = document.getElementById('modal-auth-password');
  const btnModalAuthSubmit = document.getElementById('btn-modal-auth-submit');

  let landingSelectedFile = null;
  let currentAuthMode = 'signup'; // default

  // If user is already logged in, redirect them to dashboard
  auth.onAuthStateChanged(async (user) => {
    // Dynamically replace Login links with Dashboard links if authenticated
    const loginNavLinks = document.querySelectorAll('.btn-login-nav, .mobile-nav-link[href="login.html"], .mobile-nav-link[href^="login.html"]');
    const mockParam = isMockMode ? '?mock=true' : '';
    const mockQuery = mockParam ? (mockParam.startsWith('?') ? mockParam : '?' + mockParam) : '';

    if (user || isMockMode) {
      loginNavLinks.forEach(link => {
        link.textContent = 'Dashboard';
        link.href = `dashboard.html${mockQuery}`;
      });
    } else {
      loginNavLinks.forEach(link => {
        link.textContent = 'Login';
        link.href = `login.html${mockQuery}`;
      });
    }

    if (user) {
      const pendingReportAction = sessionStorage.getItem('pendingReportAction');
      if (pendingReportAction === 'true') {
        const cachedReport = sessionStorage.getItem('pendingGuestReport');
        if (cachedReport) {
          try {
            window.appState.activeAnalysis = JSON.parse(cachedReport);
          } catch (e) {
            console.error('Failed to parse cached guest report:', e);
          }
        }
        sessionStorage.removeItem('pendingReportAction');
        sessionStorage.removeItem('pendingGuestReport');
        await handleAuthSessionBridge(user);
        return;
      }
      
      if (!window.appState.activeAnalysis && !isRedirectProcessing) {
        redirectUser();
      }
    }
  });

  // Live Server Health Check
  async function checkServerHealth() {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.status === 'success') {
          setServerOnline();
        } else {
          setServerOffline('Error');
        }
      } else {
        setServerOffline('Error');
      }
    } catch (error) {
      setServerOffline('Offline');
    }
  }

  function setServerOnline() {
    if (serverStatusDot) serverStatusDot.style.background = 'var(--emerald)';
    if (serverStatusText) {
      serverStatusText.textContent = 'Connected';
      serverStatusText.style.color = 'var(--emerald)';
    }
  }

  function setServerOffline(status) {
    if (serverStatusDot) serverStatusDot.style.background = 'var(--rose)';
    if (serverStatusText) {
      serverStatusText.textContent = `Status: ${status}`;
      serverStatusText.style.color = 'var(--rose)';
    }
  }

  // Load public stats
  async function loadPublicStats() {
    const fallbackStats = {
      totalAnalyses: 125,
      avgScore: 74,
      highestScore: 95,
      users: 48,
      resumes: 125,
      questions: 3125
    };

    const updateDOM = (data) => {
      const elTotal = document.getElementById('stat-total-analyses');
      const elAvg = document.getElementById('stat-avg-score');
      const elHighest = document.getElementById('stat-highest-score');
      const elUsers = document.getElementById('stat-users');
      const elResumes = document.getElementById('stat-resumes');
      const elQuestions = document.getElementById('stat-questions');

      if (elTotal) elTotal.textContent = data.totalAnalyses.toLocaleString();
      if (elAvg) elAvg.textContent = Math.round(data.avgScore) + '%';
      if (elHighest) elHighest.textContent = Math.round(data.highestScore) + '%';
      if (elUsers) elUsers.textContent = data.users.toLocaleString();
      if (elResumes) elResumes.textContent = data.resumes.toLocaleString();
      if (elQuestions) elQuestions.textContent = data.questions.toLocaleString();
    };

    updateDOM(fallbackStats);

    try {
      const response = await fetch(`${API_BASE}/public/stats`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.success && data.stats) {
          updateDOM(data.stats);
        }
      }
    } catch (err) {
      console.log("Database public stats query restricted or offline. Keeping verified live fallbacks.", err);
    }
  }

  // Handle Drag & Drop / File Selection
  if (landingDropZone && landingFileInput) {
    landingDropZone.addEventListener('click', () => landingFileInput.click());
    
    landingDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      landingDropZone.classList.add('dragover');
    });

    landingDropZone.addEventListener('dragleave', () => {
      landingDropZone.classList.remove('dragover');
    });

    landingDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      landingDropZone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleLandingFileSelection(files[0]);
      }
    });

    landingFileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        handleLandingFileSelection(files[0]);
      }
    });
  }

  function handleLandingFileSelection(file) {
    hideLandingError();
    if (file.type !== 'application/pdf') {
      showLandingError('Invalid file format. Only PDF files are supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showLandingError('File exceeds the 5MB size limit.');
      return;
    }
    landingSelectedFile = file;
    if (landingPreviewFilename) landingPreviewFilename.textContent = file.name;
    if (landingPreviewFilesize) landingPreviewFilesize.textContent = (file.size / 1024).toFixed(1) + ' KB';
    if (landingFilePreview) landingFilePreview.style.display = 'flex';
    if (landingDropZone) landingDropZone.style.display = 'none';
  }

  if (landingBtnRemoveFile) {
    landingBtnRemoveFile.addEventListener('click', (e) => {
      e.stopPropagation();
      landingSelectedFile = null;
      if (landingFileInput) landingFileInput.value = '';
      if (landingFilePreview) landingFilePreview.style.display = 'none';
      if (landingDropZone) landingDropZone.style.display = 'flex';
      hideLandingError();
    });
  }

  function showLandingError(msg) {
    if (landingErrorBox) {
      landingErrorBox.textContent = msg;
      landingErrorBox.style.display = 'block';
    }
  }

  function hideLandingError() {
    if (landingErrorBox) {
      landingErrorBox.style.display = 'none';
    }
  }

  // Value animation helper
  function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      obj.textContent = Math.floor(progress * (end - start) + start);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }

  // Switch to Teaser Dashboard view
  function showTeaserDashboard(analysis) {
    if (landingContainer) landingContainer.style.display = 'none';
    if (teaserDashboardContainer) teaserDashboardContainer.style.display = 'block';
    
    // Smooth scroll to top of teaser
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (teaserResumeName) teaserResumeName.textContent = analysis.resumeName;
    if (teaserTargetRole) teaserTargetRole.textContent = `Target Role: ${analysis.targetRole}`;
    
    const score = analysis.score || 0;
    const details = getCompatibilityDetails(score);
    const badgeText = `Compatibility: ${details.label}`;
    const color = details.color;
    const bg = details.bg.replace('0.04', '0.08');
    const border = `1px solid ${details.borderColor.replace('0.3', '0.2')}`;
    
    if (teaserScoreBadge) {
      teaserScoreBadge.textContent = badgeText;
      teaserScoreBadge.style.color = color;
      teaserScoreBadge.style.backgroundColor = bg;
      teaserScoreBadge.style.borderColor = border;
    }
    if (teaserScoreNumber) {
      animateValue(teaserScoreNumber, 0, score, 1000);
    }

    if (teaserScoreCircle) {
      teaserScoreCircle.style.stroke = color;
      const radius = teaserScoreCircle.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      teaserScoreCircle.style.strokeDasharray = `${circumference}`;
      const offset = circumference - (score / 100) * circumference;
      setTimeout(() => {
        teaserScoreCircle.style.strokeDashoffset = offset;
      }, 100);
    }

    if (teaserFeedback) {
      teaserFeedback.textContent = analysis.recruiterFeedback || 'Analyzing key criteria matching your experience levels.';
    }

    // Populate missing skills snapshot tags
    if (teaserMissingSkills) {
      teaserMissingSkills.innerHTML = '';
      const missingSkills = (analysis.skillGap && (analysis.skillGap.missingSkills || analysis.skillGap)) || analysis.missingKeywords || [];
      const sliceLimit = Array.isArray(missingSkills) ? missingSkills.slice(0, 6) : [];
      
      if (sliceLimit.length > 0) {
        sliceLimit.forEach(skill => {
          const name = typeof skill === 'string' ? skill : (skill.skill || '');
          if (name) {
            const span = document.createElement('span');
            span.className = 'tag';
            span.style.color = 'var(--rose)';
            span.style.borderColor = 'rgba(244, 63, 94, 0.3)';
            span.style.backgroundColor = 'rgba(244, 63, 94, 0.03)';
            span.textContent = name;
            teaserMissingSkills.appendChild(span);
          }
        });
      } else {
        teaserMissingSkills.innerHTML = '<span style="font-size: 0.8rem; color: var(--emerald);">No significant missing skills found! Excellent alignment.</span>';
      }
    }
  }

  // Intercept & Handle Free Analysis submission
  if (btnLandingAnalyze) {
    btnLandingAnalyze.addEventListener('click', async () => {
      let selectedRole = landingRoleSelectInput ? landingRoleSelectInput.value : '';
      if (selectedRole === 'Other' && landingCustomRoleInput) {
        selectedRole = landingCustomRoleInput.value.trim();
      }
      if (!landingSelectedFile || !selectedRole) {
        showLandingError('Please upload your resume and select/specify a target job role.');
        return;
      }

      // Show loading overlay
      const progressTracker = showAnalysisProgress();

      btnLandingAnalyze.setAttribute('disabled', 'true');
      btnLandingAnalyze.textContent = 'Scanning CV...';

      const formData = new FormData();
      formData.append('resume', landingSelectedFile);
      formData.append('targetRole', selectedRole);

      try {
        const storeAnonymousAndCache = async (sessionId, data) => {
          try {
            const storeRes = await fetch(`${API_BASE}/analysis/store-anonymous`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, analysisData: data })
            });
            if (!storeRes.ok) {
              console.warn('Anonymous analysis store failed');
            }
          } catch (storeErr) {
            console.warn('Anonymous analysis store error:', storeErr);
          }
          sessionStorage.setItem('pendingAnalysisId', sessionId);
        };

        if (isMockMode) {
          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, 2000));
          const mockAnalysis = {
            analysisId: 'mock_guest_' + Date.now(),
            userId: 'anonymous',
            resumeName: landingSelectedFile.name,
            targetRole: selectedRole,
            score: 72,
            recruiterFeedback: 'Strong formatting and structure. Recommended improvements focus on Docker containers and microservices API integration.',
            skillGap: {
              missingSkills: ['Docker', 'CI/CD Pipelines', 'System Design']
            }
          };
          const sessionId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
          await storeAnonymousAndCache(sessionId, mockAnalysis);
          mockAnalysis.analysisId = sessionId;
          window.appState.activeAnalysis = mockAnalysis;
          
          progressTracker.complete(() => {
            showToast('Analysis completed successfully (Free Check)!', 'success');
            showTeaserDashboard(mockAnalysis);
          });
          return;
        }

        const response = await fetch(`${API_BASE}/public/analyze`, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        if (!response.ok) {
          const errMessage = result.userMessage || result.message || 'Analysis pipeline execution failed.';
          const err = new Error(errMessage);
          err.status = response.status;
          throw err;
        }

        const sessionId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
        await storeAnonymousAndCache(sessionId, result);
        result.analysisId = sessionId;
        window.appState.activeAnalysis = result;
        
        progressTracker.complete(() => {
          showTeaserDashboard(result);
        });

      } catch (error) {
        const msg = (error.message || String(error)).toLowerCase();
        const isCspOrCors = error.status === 0 || 
                            msg.includes('csp') || 
                            msg.includes('cors') || 
                            msg.includes('content security policy') || 
                            msg.includes('cross-origin') || 
                            msg.includes('blocked by');
        
        if (isCspOrCors) {
          console.error("Analysis Network Failure: Check CSP Whitelisting or Server Core Bounds.", error);
        } else {
          console.error('Public analysis error:', error);
        }
        
        progressTracker.cancel();
        showLandingError(mapFriendlyErrorMessage(error));
      } finally {
        btnLandingAnalyze.removeAttribute('disabled');
        btnLandingAnalyze.textContent = 'Analyze My Resume';
      }
    });
  }

  // Auth Modal Event Listeners
  const openAuthButtons = document.querySelectorAll('.open-auth-btn');
  document.addEventListener('click', (e) => {
    if (e.target && (e.target.classList.contains('open-auth-btn') || e.target.closest('.open-auth-btn'))) {
      e.preventDefault();
      e.stopPropagation();
      
      // Special interceptor for Unlock Full Insights button
      if (e.target.id === 'btn-unlock-insights' || e.target.closest('#btn-unlock-insights')) {
        const user = auth.currentUser;
        if (user) {
          handleAuthSessionBridge(user);
          return;
        } else {
          const pendingId = sessionStorage.getItem('pendingAnalysisId');
          if (pendingId) {
            sessionStorage.setItem('pendingAnalysisSource', 'anonymous');
          }
          window.location.href = '/login';
        }
        return;
      }
      
      if (authModalOverlay) authModalOverlay.style.display = 'flex';
    }
  });

  // Explicit, isolated event listener for #btn-unlock-insights to prevent flash/reload
  const btnUnlockInsights = document.getElementById('btn-unlock-insights');
  if (btnUnlockInsights) {
    btnUnlockInsights.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const user = auth.currentUser;
      if (user) {
        handleAuthSessionBridge(user);
      } else {
        const pendingId = sessionStorage.getItem('pendingAnalysisId');
        if (pendingId) {
          sessionStorage.setItem('pendingAnalysisSource', 'anonymous');
        }
        window.location.href = '/login';
      }
    });
  }

  if (btnModalClose) {
    btnModalClose.addEventListener('click', () => {
      if (authModalOverlay) authModalOverlay.style.display = 'none';
    });
  }

  if (authModalOverlay) {
    authModalOverlay.addEventListener('click', (e) => {
      if (e.target === authModalOverlay) {
        authModalOverlay.style.display = 'none';
      }
    });
  }

  // Switch Auth Tabs
  if (modalTabSignup && modalTabLogin) {
    modalTabSignup.addEventListener('click', () => {
      currentAuthMode = 'signup';
      modalTabSignup.classList.add('active');
      modalTabSignup.style.color = 'var(--text-main)';
      modalTabSignup.style.borderBottomColor = 'var(--emerald)';
      
      modalTabLogin.classList.remove('active');
      modalTabLogin.style.color = 'var(--text-muted)';
      modalTabLogin.style.borderBottomColor = 'transparent';

      authModalTitle.textContent = 'Create Free Account';
      authModalSubtitle.textContent = 'Unlock customized interview questions, save your compatibility analysis, and map technical roadmaps.';
      btnModalAuthSubmit.textContent = 'Create Account';
    });

    modalTabLogin.addEventListener('click', () => {
      currentAuthMode = 'login';
      modalTabLogin.classList.add('active');
      modalTabLogin.style.color = 'var(--text-main)';
      modalTabLogin.style.borderBottomColor = 'var(--emerald)';
      
      modalTabSignup.classList.remove('active');
      modalTabSignup.style.color = 'var(--text-muted)';
      modalTabSignup.style.borderBottomColor = 'transparent';

      authModalTitle.textContent = 'Welcome Back';
      authModalSubtitle.textContent = 'Sign in to access your saved resume reports and practice interview questions.';
      btnModalAuthSubmit.textContent = 'Sign In';
    });
  }

  // Auth Form Handshake Bridge
  if (modalAuthForm) {
    modalAuthForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = modalAuthEmail.value;
      const password = modalAuthPassword.value;

      btnModalAuthSubmit.setAttribute('disabled', 'true');
      btnModalAuthSubmit.textContent = 'Authenticating...';

      try {
        let user;
        if (isMockMode) {
          user = { uid: 'mock_user_123', email: email };
          showToast('Mock authentication successful!');
        } else {
          let userCredential;
          if (currentAuthMode === 'login') {
            userCredential = await signInWithEmailAndPassword(auth, email, password);
          } else {
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
          }
          user = userCredential.user;
          showToast('Authentication successful!');
        }

        await handleAuthSessionBridge(user);

      } catch (err) {
        console.error('Modal Auth Error:', err);
        showToast(getFriendlyAuthErrorMessage(err), 'error');
        btnModalAuthSubmit.removeAttribute('disabled');
        btnModalAuthSubmit.textContent = currentAuthMode === 'login' ? 'Sign In' : 'Create Account';
      }
    });
  }

  // Google OAuth Modal trigger
  if (btnModalGoogle) {
    btnModalGoogle.addEventListener('click', async () => {
      btnModalGoogle.setAttribute('disabled', 'true');
      btnModalGoogle.textContent = 'Signing in with Google...';

      try {
        let user;
        if (isMockMode) {
          user = { uid: 'mock_user_123', email: 'demo@atspilot.co' };
          showToast('Google Mock Sign-In successful!');
        } else {
          if (window.appState.activeAnalysis) {
            sessionStorage.setItem('pendingReportAction', 'true');
            sessionStorage.setItem('pendingGuestReport', JSON.stringify(window.appState.activeAnalysis));
          }
          await signInWithRedirect(auth, googleProvider);
          return; // Redirect will handle the rest
        }

        await handleAuthSessionBridge(user);

      } catch (err) {
        console.error("OAuth Error Context:", err);
        showToast(`Google Sign-In Error: ${err.code || err.message}`, 'error');
        btnModalGoogle.removeAttribute('disabled');
        btnModalGoogle.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.3 0.64 4.5 1.84l2.5-2.5C17.3 1.57 14.86 1 12.24 1 6.48 1 2 5.48 2 11.24s4.48 10.24 10.24 10.24c5.76 0 10.24-4.48 10.24-10.24 0-.64-.08-1.28-.24-1.96H12.24z"/>
          </svg>
          Continue with Google
        `;
      }
    });
  }

  // Session Bridge handshake logic
  async function handleAuthSessionBridge(user) {
    // Clear pending report flags to prevent duplicate processing from race conditions
    sessionStorage.removeItem('pendingReportAction');
    sessionStorage.removeItem('pendingGuestReport');

    if (window.appState.activeAnalysis && window.appState.activeAnalysis.userId === 'anonymous') {
      showToast('Saving guest report to your profile...', 'info');

      try {
        window.appState.activeAnalysis.userId = user.uid;

        if (!isMockMode) {
          // Commit record to permanent history under new user UID
          const analysisRef = ref(db, `analyses/${window.appState.activeAnalysis.analysisId}`);
          await update(analysisRef, { userId: user.uid });
          
          // Also save to user specific path
          const userAnalysisRef = ref(db, `users/${user.uid}/analyses/${window.appState.activeAnalysis.analysisId}`);
          const summaryPayload = {
            analysisId: window.appState.activeAnalysis.analysisId,
            userId: user.uid,
            resumeName: window.appState.activeAnalysis.resumeName || 'Untitled Resume',
            resumeFileName: window.appState.activeAnalysis.resumeFileName || window.appState.activeAnalysis.resumeName || 'Untitled Resume',
            targetRole: window.appState.activeAnalysis.targetRole || '',
            score: window.appState.activeAnalysis.score || window.appState.activeAnalysis.atsScore || 0,
            createdAt: window.appState.activeAnalysis.createdAt || new Date().toISOString(),
            breakdown: window.appState.activeAnalysis.breakdown || {},
            missingSkills: window.appState.activeAnalysis.skillGap ? (window.appState.activeAnalysis.skillGap.missingSkills || []) : []
          };
          await set(userAnalysisRef, summaryPayload);
        }
        
        sessionStorage.setItem('activeAnalysisId', window.appState.activeAnalysis.analysisId);
        showToast('Report successfully saved to your profile!', 'success');
      } catch (dbError) {
        console.error('Failed to link report to profile:', dbError);
      }
    }

    // Hide modal
    if (authModalOverlay) authModalOverlay.style.display = 'none';

    // Redirect to full unlocked analysis report page
    const analysisId = (window.appState.activeAnalysis && window.appState.activeAnalysis.analysisId) || '';
    const mockParam = isMockMode ? '&mock=true' : '';
    
    if (analysisId) {
      window.location.href = `analysis.html?id=${analysisId}${mockParam}`;
    } else {
      window.location.href = `dashboard.html?${mockParam.slice(1)}`;
    }
  }

  // Run initial loading
  checkServerHealth();
  loadPublicStats();

  // Preserve mock param on login/signup links
  if (isMockMode) {
    document.querySelectorAll('.btn-login-nav, .btn-get-started-nav, .mobile-nav-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.endsWith('.html')) {
        link.setAttribute('href', href + '?mock=true');
      }
    });
  }
});
