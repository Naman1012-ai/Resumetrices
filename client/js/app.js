/**
 * @file app.js
 * @description Modern SaaS frontend controller. Coordinates Firebase login,
 * histories sidebar retrieval, bento grid rendering, breakdown tooltips,
 * skill gap timelines, and interview copy buttons.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { initSpeedInsights } from './speed-insights.js';

// Global Error Logging & Unhandled Promise Rejections Catchers
window.addEventListener('error', (event) => {
  console.error('Global Client Error caught:', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Global Client Unhandled Rejection caught:', event.reason);
});

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDfVnkphuA6Z27t0BFHPbgzfAOfNrryJ-U",
  authDomain: "resume-analyser-4f4b3.firebaseapp.com",
  projectId: "resume-analyser-4f4b3",
  storageBucket: "resume-analyser-4f4b3.firebasestorage.app",
  messagingSenderId: "138706729074",
  appId: "1:138706729074:web:2323f40721dda4eeb12aeb",
  measurementId: "G-WTE0RKBH3J"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const db = getDatabase(firebaseApp, "https://resume-analyser-4f4b3-default-rtdb.asia-southeast1.firebasedatabase.app");

const escapeHTML = (str) => {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
};

/**
 * Translates Firebase Auth error codes into polite, human-readable instructions.
 * Supports both standard credential flow and Google popup/redirect oauth flows.
 * @param {Error} error - The Firebase error object.
 * @returns {string} User-friendly error message.
 */
const getFriendlyAuthErrorMessage = (error) => {
  if (!error) return 'An unknown error occurred during authentication.';
  
  const code = error.code;
  if (code) {
    switch (code) {
      // Google Sign-In & Popup Errors
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled. Please keep the Google sign-in window open to complete the process.';
      case 'auth/popup-blocked':
        return 'The sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
      case 'auth/cancelled-popup-request':
        return 'The sign-in request was cancelled as another authentication attempt was initiated.';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized for Google Sign-In. Please add localhost/domain to the Authorized Domains in the Firebase Console.';
      case 'auth/operation-not-allowed':
        return 'Google Sign-In is not enabled. Please enable it in the Firebase Console settings.';
      case 'auth/network-request-failed':
        return 'A network error occurred. Please check your internet connection and try again.';
      
      // Email & Password Auth Errors
      case 'auth/email-already-in-use':
        return 'This email address is already registered. Please sign in instead.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Your password is too weak. Please use at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password. Please check your credentials and try again.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact support.';
      case 'auth/too-many-requests':
        return 'Too many sign-in attempts. Access has been temporarily disabled. Please try again later.';
      default:
        break;
    }
  }

  // Fallback pattern matching on the message string if code is not directly available
  const msg = error.message || '';
  if (msg.includes('auth/popup-closed-by-user')) {
    return 'Sign-in was cancelled. Please keep the Google sign-in window open to complete the process.';
  }
  if (msg.includes('auth/popup-blocked')) {
    return 'The sign-in popup was blocked by your browser. Please allow popups for this site.';
  }
  if (msg.includes('auth/unauthorized-domain')) {
    return 'This domain is not authorized for Google Sign-In. Please add localhost/domain to the Authorized Domains in the Firebase Console.';
  }
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }

  // Clean up the Firebase raw prefix if present
  return msg.replace(/^Firebase:\s*/i, '');
};

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Vercel Speed Insights for performance monitoring
  initSpeedInsights();
  
  // DOM Panels
  const authPanel = document.getElementById('auth-panel');
  const dashboardLayout = document.getElementById('dashboard-layout');
  const userProfileHeader = document.getElementById('user-profile-header');
  const headerUsername = document.getElementById('header-username');
  const btnLogout = document.getElementById('btn-logout');
  const navLogout = document.getElementById('nav-logout');
  const btnCollapse = document.getElementById('btn-collapse');
  const appSidebarNav = document.getElementById('app-sidebar-nav');
  const btnHamburger = document.getElementById('btn-hamburger');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  
  const pageDashboard = document.getElementById('page-dashboard');
  const pageNewAnalysis = document.getElementById('page-new-analysis');
  const pageHistory = document.getElementById('page-history');
  const pageCompare = document.getElementById('page-compare');
  const pageProfile = document.getElementById('page-profile');

  // Dashboard Specific Elements
  const welcomeUsername = document.getElementById('welcome-username');
  const statsMonthlyCount = document.getElementById('stats-monthly-count');
  const dashboardRecentEmpty = document.getElementById('dashboard-recent-empty');
  const dashboardRecentContent = document.getElementById('dashboard-recent-content');
  const recentResumeName = document.getElementById('recent-resume-name');
  const recentResumeDate = document.getElementById('recent-resume-date');
  const recentScoreCirclePath = document.getElementById('recent-score-circle-path');
  const recentScoreCircleText = document.getElementById('recent-score-circle-text');
  const recentFeedbackSnippetText = document.getElementById('recent-feedback-snippet-text');
  const btnRecentViewReport = document.getElementById('btn-recent-view-report');
  
  // History Viewport Specific Elements
  const historySearchInput = document.getElementById('history-search-input');
  const historySortSelect = document.getElementById('history-sort-select');
  const historyCardsGrid = document.getElementById('history-cards-grid');
  const historyLoader = document.getElementById('history-loader');
  const historyEmptyState = document.getElementById('history-empty-state');
  const historyPagination = document.getElementById('history-pagination');
  const btnHistoryPrev = document.getElementById('btn-history-prev');
  const btnHistoryNext = document.getElementById('btn-history-next');
  const historyPageInfo = document.getElementById('history-page-info');
  
  const serverStatusDot = document.getElementById('server-status-dot');
  const serverStatusText = document.getElementById('server-status-text');

  const emptyState = document.getElementById('empty-state');
  const loader = document.getElementById('loader');
  const errorStateCard = document.getElementById('error-state-card');
  
  // Dashboard Tabs
  const resultsTabs = document.getElementById('results-tabs');
  const tabReport = document.getElementById('tab-report');
  const tabSkillGap = document.getElementById('tab-skillgap');
  const tabInterview = document.getElementById('tab-interview');
  const tabRawText = document.getElementById('tab-rawtext');
  
  // Tab Containers
  const resultsDashboard = document.getElementById('results-dashboard');
  const skillgapDashboard = document.getElementById('skillgap-dashboard');
  const interviewDashboard = document.getElementById('interview-dashboard');
  const rawTextContainer = document.getElementById('raw-text-container');

  // Auth Elements
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const authForm = document.getElementById('auth-form');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const btnAuthSubmit = document.getElementById('btn-auth-submit');
  const btnGoogle = document.getElementById('btn-google');

  // Upload Elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const filePreview = document.getElementById('file-preview');
  const previewFileName = document.getElementById('preview-file-name');
  const previewFileSize = document.getElementById('preview-file-size');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const btnAnalyze = document.getElementById('btn-analyze');
  const targetRoleSelect = document.getElementById('target-role-select');

  // Results Dashboard Elements
  const resFilename = document.getElementById('res-filename');
  const resAtsBadge = document.getElementById('res-ats-badge');
  const resScore = document.getElementById('res-score');
  const scoreFillCircle = document.getElementById('score-fill-circle');
  const resFeedbackText = document.getElementById('res-feedback-text');
  const breakdownGrid = document.getElementById('breakdown-grid');
  const resStrengthsList = document.getElementById('res-strengths-list');
  const resWeaknessesList = document.getElementById('res-weaknesses-list');
  const resRewriteList = document.getElementById('res-rewrite-list');
  const resAtsTipsList = document.getElementById('res-ats-tips-list');
  const resMissingKeywordsTags = document.getElementById('res-missing-keywords-tags');
  const resMissingSectionsTags = document.getElementById('res-missing-sections-tags');

  // Skill Gap Tools
  const selectTargetRole = document.getElementById('select-target-role');
  const btnRunSkillgap = document.getElementById('btn-run-skillgap');
  const skillgapLoader = document.getElementById('skillgap-loader');
  const skillgapResults = document.getElementById('skillgap-results');
  const matchedSkillsTags = document.getElementById('matched-skills-tags');
  const missingSkillsTags = document.getElementById('missing-skills-tags');
  const recommendedSkillsTags = document.getElementById('recommended-skills-tags');
  const roadmapTimeline = document.getElementById('roadmap-timeline');

  // Interview Prep Tools
  const btnRunInterview = document.getElementById('btn-run-interview');
  const interviewLoader = document.getElementById('interview-loader');
  const interviewResults = document.getElementById('interview-results');
  const technicalQuestionsList = document.getElementById('technical-questions-list');
  const projectQuestionsList = document.getElementById('project-questions-list');
  const skillgapQuestionsList = document.getElementById('skillgap-questions-list');
  const behavioralQuestionsList = document.getElementById('behavioral-questions-list');
  const hrQuestionsList = document.getElementById('hr-questions-list');

  // Raw Text Elements
  const rawFilename = document.getElementById('raw-filename');
  const extractedTextContent = document.getElementById('extracted-text-content');
  const btnCopyText = document.getElementById('btn-copy-text');

  // Sidebar History Elements
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');

  // Toast Notification Elements
  const toastNotification = document.getElementById('toast-notification');
  const toastMessage = document.getElementById('toast-message');

  const API_BASE = '/api';

  const FirebaseService = {
    async getDashboardStats() {
      const user = auth.currentUser;
      if (!user) throw new Error('Authorization required.');
      const idToken = await user.getIdToken();

      const response = await fetch(`${API_BASE}/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to retrieve dashboard stats.');
      return data.stats;
    },
    async deleteAnalysis(analysisId) {
      const user = auth.currentUser;
      if (!user) throw new Error('Authorization required.');
      const idToken = await user.getIdToken();

      const response = await fetch(`${API_BASE}/analysis/${analysisId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to delete analysis.');
      return true;
    }
  };

  let selectedFile = null;
  let activeAnalysis = null; // Stores currently active analysis record
  let activeAnalysisText = ''; // Stores active analysis text to feed skill gap & interview
  let currentAuthMode = 'login';
  let cachedHistory = []; // Stores all fetched user analyses

  // History Viewport Filters State
  let historyCurrentPage = 1;
  const historyItemsPerPage = 6;
  let historySearchQuery = '';
  let historySortOrder = 'date-desc';

  // Initialize Sidebar Collapsed Preference
  if (localStorage.getItem('sidebar-collapsed') === 'true' && appSidebarNav) {
    appSidebarNav.classList.add('collapsed');
  }

  // Category labels and max scales for breakdown visualization
  const categoryMetadata = {
    contact: { name: 'Contact Information', max: 10, color: 'blue' },
    summary: { name: 'Professional Summary', max: 10, color: 'purple' },
    education: { name: 'Education Details', max: 10, color: 'purple' },
    skills: { name: 'Technical Skills', max: 15, color: 'amber' },
    projects: { name: 'Projects & Experience', max: 20, color: 'emerald' },
    experience: { name: 'Work History', max: 15, color: 'emerald' },
    certifications: { name: 'Certifications', max: 5, color: 'purple' },
    portfolio: { name: 'GitHub & Portfolio', max: 5, color: 'blue' },
    keywords: { name: 'ATS Keyword Density', max: 5, color: 'amber' },
    formatting: { name: 'Structure & Formatting', max: 5, color: 'blue' }
  };

  // Toast notifier with cancellation and custom duration
  let toastTimeout = null;
  function showToast(message, type = 'success') {
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    
    if (toastMessage) {
      toastMessage.textContent = message;
      toastMessage.style.whiteSpace = 'pre-line';
    }
    
    if (toastNotification) {
      if (type === 'error') {
        toastNotification.style.borderLeftColor = 'var(--rose)';
        toastNotification.classList.add('toast-error');
      } else {
        toastNotification.style.borderLeftColor = 'var(--emerald)';
        toastNotification.classList.remove('toast-error');
      }
      
      toastNotification.style.display = 'block';
      
      const duration = type === 'error' ? 8000 : 3000;
      toastTimeout = setTimeout(() => {
        toastNotification.style.display = 'none';
      }, duration);
    }
  }

  // 1. Connection Status Health Check
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
    if (serverStatusDot) serverStatusDot.classList.add('online');
    if (serverStatusText) {
      serverStatusText.textContent = 'Connected';
      serverStatusText.style.color = 'var(--emerald)';
    }
  }

  function setServerOffline(status) {
    if (serverStatusDot) serverStatusDot.classList.remove('online');
    if (serverStatusText) {
      serverStatusText.textContent = `Status: ${status}`;
      serverStatusText.style.color = 'var(--rose)';
    }
  }

  // 2. Load Analysis History
  async function loadAnalysisHistory() {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();

      const response = await fetch(`${API_BASE}/history`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Failed to load history.');

      cachedHistory = data.history || [];
      renderHistoryList(cachedHistory);
      
      // Update dynamic page views if active
      const hash = window.location.hash.substring(1);
      if (hash === 'dashboard') {
        loadDashboardData();
      } else if (hash === 'history') {
        loadHistoryCatalog();
      } else if (hash === 'compare') {
        loadCompareData();
      }
    } catch (error) {
      console.error('History load error:', error);
      showToast('Error loading analysis history.', 'error');
    }
  }

  function renderHistoryList(history) {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (history.length === 0) {
      if (historyEmpty) historyEmpty.style.display = 'block';
      return;
    }
    if (historyEmpty) historyEmpty.style.display = 'none';

    history.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.dataset.id = item.analysisId;

      const dateStr = new Date(item.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Score classification
      let ratingClass = 'low';
      if (item.score >= 80) ratingClass = 'high';
      else if (item.score >= 50) ratingClass = 'medium';

      const escapedName = escapeHTML(item.resumeName);
      li.innerHTML = `
        <div class="history-item-details">
          <div class="history-item-name" title="${escapedName}">${escapedName}</div>
          <div class="history-item-date">${dateStr}</div>
        </div>
        <div class="history-item-score-badge ${ratingClass}">${item.score}/100</div>
      `;

      li.addEventListener('click', () => {
        // Toggle active styling
        document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        
        loadAnalysisById(item.analysisId);
      });

      historyList.appendChild(li);
    });
  }

  // 3. Load past analysis details from DB
  async function loadAnalysisById(analysisId) {
    // Show main loading skeleton
    if (emptyState) emptyState.style.display = 'none';
    if (resultsDashboard) resultsDashboard.style.display = 'none';
    if (skillgapDashboard) skillgapDashboard.style.display = 'none';
    if (interviewDashboard) interviewDashboard.style.display = 'none';
    if (rawTextContainer) rawTextContainer.style.display = 'none';
    if (resultsTabs) resultsTabs.style.display = 'none';
    if (loader) loader.style.display = 'flex';

    let success = false;
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Authorization required.');
      const idToken = await user.getIdToken();

      const response = await fetch(`${API_BASE}/analysis/${analysisId}`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Failed to retrieve analysis.');

      const analysis = data.analysis;
      renderAnalysisResults(analysis);
      showToast('Resume analysis loaded successfully!');
      success = true;
    } catch (error) {
      console.error('Analysis retrieval error:', error);
      showToast(error.message, 'error');
    } finally {
      if (loader) loader.style.display = 'none';
      if (!success && emptyState) {
        emptyState.style.display = 'flex';
      }
    }
  }

  // 4. Firebase Authentication Listener & Router
  const routes = {
    dashboard: { viewId: 'page-dashboard', navId: 'nav-dashboard', protected: true },
    'new-analysis': { viewId: 'page-new-analysis', navId: 'nav-new-analysis', protected: true },
    history: { viewId: 'page-history', navId: 'nav-history', protected: true },
    compare: { viewId: 'page-compare', navId: 'nav-compare', protected: true },
    profile: { viewId: 'page-profile', navId: 'nav-profile', protected: true },
    login: { viewId: 'auth-panel', navId: null, protected: false },
    register: { viewId: 'auth-panel', navId: null, protected: false }
  };

  function handleRouting() {
    const hash = window.location.hash.substring(1) || 'dashboard';
    const route = routes[hash] || routes['dashboard'];
    const user = auth.currentUser;

    if (route.protected && !user) {
      window.location.hash = 'login';
      return;
    }

    if (!route.protected && user) {
      window.location.hash = 'dashboard';
      return;
    }

    // Hide all page views
    document.querySelectorAll('.page-view').forEach(view => view.style.display = 'none');
    authPanel.style.display = 'none';

    // Show active view
    const activeView = document.getElementById(route.viewId);
    if (activeView) {
      activeView.style.display = 'block';
    }

    // Update navigation active states
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (route.navId) {
      const activeNav = document.getElementById(route.navId);
      if (activeNav) activeNav.classList.add('active');
    }

    // Call page-specific loaders
    if (hash === 'dashboard') {
      loadDashboardData();
    } else if (hash === 'history') {
      loadAnalysisHistory();
    } else if (hash === 'compare') {
      loadCompareData();
    } else if (hash === 'profile') {
      loadProfileData();
    }
  }

  // Window routing listeners
  window.addEventListener('hashchange', handleRouting);

  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (authPanel) authPanel.style.display = 'none';
      if (dashboardLayout) dashboardLayout.style.display = 'grid'; // Grid instead of contents/flex
      if (headerUsername) headerUsername.textContent = user.displayName || user.email;
      const sidebarUserEmail = document.getElementById('sidebar-user-email');
      if (sidebarUserEmail) sidebarUserEmail.textContent = user.email;
      if (userProfileHeader) userProfileHeader.style.display = 'flex';
      
      // Load user past files list
      loadAnalysisHistory();

      // Handle redirect after login
      const hash = window.location.hash.substring(1);
      if (hash === 'login' || hash === 'register' || !hash) {
        window.location.hash = 'dashboard';
      } else {
        handleRouting();
      }
    } else {
      if (authPanel) authPanel.style.display = 'block';
      if (dashboardLayout) dashboardLayout.style.display = 'none';
      if (userProfileHeader) userProfileHeader.style.display = 'none';
      
      // Clear panel states
      if (emptyState) emptyState.style.display = 'flex';
      if (resultsDashboard) resultsDashboard.style.display = 'none';
      if (rawTextContainer) rawTextContainer.style.display = 'none';
      if (resultsTabs) resultsTabs.style.display = 'none';
      if (loader) loader.style.display = 'none';
      resetFileSelection();
      cachedHistory = [];
      activeAnalysis = null;
      activeAnalysisText = '';

      window.location.hash = 'login';
    }
  });

  // Mock Data for Dashboard (Matches visual categories and trend requirements)
  const mockDashboardData = {
    username: "Alex Morgan",
    totalAnalyses: 6,
    highestScore: 84,
    averageScore: 66,
    analysesThisMonth: 4,
    recentAnalysis: {
      analysisId: "analysis_mock_recent_1",
      resumeName: "Alex_Morgan_Senior_AI_Engineer_Resume.pdf",
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(), // 4 hours ago
      score: 84,
      recruiterFeedback: "This resume shows an exceptional match for AI/ML engineering roles. The professional summary is highly concise, and key projects highlight extensive experience with LLMs and deep learning. Consider adding more certifications and linking portfolio repositories directly to push compatibility to 90%+.",
      breakdown: {
        contact: 10,
        summary: 10,
        education: 10,
        skills: 13,
        projects: 18,
        experience: 12,
        certifications: 3,
        portfolio: 2,
        keywords: 3,
        formatting: 4
      },
      explanations: {
        contact: "Complete contact info provided, including email, phone, and LinkedIn.",
        summary: "Excellent summary defining background and major AI specialties.",
        education: "Completed MS in Computer Science properly formatted.",
        skills: "Strong keyword match for Python, PyTorch, Transformers, but missing Kubernetes.",
        projects: "Projects list major LLM and RAG deployments with quantitative impact details.",
        experience: "Detailed career description with active verbs, though formatting could be slightly enhanced.",
        certifications: "Missing industry-recognized certifications (e.g. AWS ML Specialty).",
        portfolio: "GitHub link included but portfolio website or blog link is missing.",
        keywords: "Strong density of NLP and transformer keywords, missing MLOps keywords.",
        formatting: "Standard clean ATS-compliant template used, though some bullet points are long."
      },
      strengths: [
        "Highly descriptive professional summary tailored for AI Engineering roles.",
        "Quantitative metric callouts in the project section showing business value.",
        "Clear hierarchy of skills (NLP, Transformers, Deep Learning)."
      ],
      weaknesses: [
        "Missing essential certifications segment in the document structure.",
        "Lack of detailed project portfolios link beyond standard GitHub."
      ],
      rewriteSuggestions: [
        "Consolidate two-line bullets under work history to keep it compact.",
        "Add AWS Machine Learning Specialty certification to certify experience."
      ],
      atsTips: [
        "Use simple black bullet points to ensure parsers do not drop texts.",
        "Ensure tables or graphics are not used for layout grids."
      ],
      missingKeywords: ["MLOps", "Kubernetes", "Docker", "TensorRT", "CUDA"],
      missingSections: ["Certifications"],
      text: "Alex Morgan\nSenior AI Engineer\nEmail: alex.morgan@example.com\nPhone: (555) 019-2831\n\nPROFESSIONAL SUMMARY\nResult-driven Senior AI Engineer with 6+ years of experience design and deploying production-grade deep learning systems. Expert in LLMs, Retrieval-Augmented Generation (RAG), and NLP workflows.\n\nTECHNICAL SKILLS\nLanguages: Python, C++, SQL, Go\nFrameworks: PyTorch, TensorFlow, Hugging Face, LangChain, FastAPI\nTools: Git, AWS, GCP, PostgreSQL, Weaviate\n\nEXPERIENCE\nAI Engineering Lead, TechScale Solutions (2023 - Present)\n- Engineered a multi-agent RAG system serving 50k active daily users, boosting response accuracy by 28%.\n- Fine-tuned open-source LLMs (Llama-3, Mistral) reducing inference cost by 40% using quantization.\n\nML Engineer, NeuroAI Labs (2020 - 2023)\n- Implemented real-time computer vision classifiers on edge devices using TensorRT.\n\nEDUCATION\nMS in Computer Science, Stanford University (2020)\nBS in Software Engineering, University of Texas (2018)"
    },
    trends: [
      { name: "v1_draft.pdf", score: 45, date: "Jun 02" },
      { name: "v1_fixed.pdf", score: 58, date: "Jun 05" },
      { name: "v2_updated.pdf", score: 62, date: "Jun 10" },
      { name: "v2_final.pdf", score: 71, date: "Jun 14" },
      { name: "v3_applied.pdf", score: 78, date: "Jun 18" },
      { name: "v3_current.pdf", score: 84, date: "Jun 21" }
    ]
  };

  let currentTooltip = null;

  function showChartTooltip(x, y, textContent) {
    hideChartTooltip();
    const svg = document.getElementById('trend-chart-svg');
    if (!svg) return;
    
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', 'chart-active-tooltip');
    
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', x - 18);
    bg.setAttribute('y', y - 12);
    bg.setAttribute('width', '36');
    bg.setAttribute('height', '16');
    bg.setAttribute('class', 'chart-tooltip-bg');
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y - 1);
    text.setAttribute('class', 'chart-tooltip-text');
    text.textContent = textContent;
    
    group.appendChild(bg);
    group.appendChild(text);
    svg.appendChild(group);
    currentTooltip = group;
  }

  function hideChartTooltip() {
    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
  }

  function drawTrendChart(trends) {
    const chartLine = document.getElementById('chart-line');
    const chartArea = document.getElementById('chart-area');
    const chartPoints = document.getElementById('chart-points');
    const chartXLabels = document.getElementById('chart-x-labels');
    
    if (!chartLine || !chartArea || !chartPoints || !chartXLabels) return;
    
    chartPoints.innerHTML = '';
    chartXLabels.innerHTML = '';
    
    if (!trends || trends.length === 0) return;
    
    const xStart = 40;
    const xEnd = 480;
    const yStart = 20;
    const yEnd = 155;
    const chartWidth = xEnd - xStart;
    const chartHeight = yEnd - yStart;
    
    let pathD = '';
    let areaD = '';
    
    trends.forEach((item, index) => {
      const x = xStart + (index / (trends.length - 1)) * chartWidth;
      const y = yEnd - (item.score / 100) * chartHeight;
      
      if (index === 0) {
        pathD = `M ${x} ${y}`;
        areaD = `M ${x} ${yEnd} L ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
        areaD += ` L ${x} ${y}`;
      }
      
      // Draw point circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '5');
      circle.setAttribute('class', 'chart-point');
      
      // Interactive point tooltip
      circle.addEventListener('mouseenter', () => {
        showChartTooltip(x, y - 12, `${item.score}%`);
      });
      circle.addEventListener('mouseleave', () => {
        hideChartTooltip();
      });
      
      chartPoints.appendChild(circle);
      
      // Draw X Label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', yEnd + 20);
      text.setAttribute('fill', 'var(--text-muted)');
      text.setAttribute('font-size', '8');
      text.setAttribute('font-weight', '600');
      text.setAttribute('text-anchor', 'middle');
      text.textContent = item.date;
      chartXLabels.appendChild(text);
    });
    
    // Close the area path
    const lastX = xStart + chartWidth;
    areaD += ` L ${lastX} ${yEnd} Z`;
    
    chartLine.setAttribute('d', pathD);
    chartArea.setAttribute('d', areaD);
  }

  // Page Specific Loaders and Comparison handlers
  async function loadDashboardData() {
    // 1. Welcome Username Setup (safe fallback)
    const user = auth.currentUser;
    const displayName = user ? (user.displayName || user.email.split('@')[0]) : 'User';
    if (welcomeUsername) welcomeUsername.textContent = displayName;

    // 2. Set Loading States on Stats Cards & Circular Progress
    const statsTotalResumes = document.getElementById('stats-total-resumes');
    const statsHighestScore = document.getElementById('stats-highest-score');
    const statsAverageScore = document.getElementById('stats-average-score');

    if (statsTotalResumes) statsTotalResumes.textContent = '...';
    if (statsHighestScore) statsHighestScore.textContent = '...';
    if (statsAverageScore) statsAverageScore.textContent = '...';
    if (statsMonthlyCount) statsMonthlyCount.textContent = '...';

    if (recentScoreCircleText) recentScoreCircleText.textContent = '...';
    if (recentScoreCirclePath) {
      recentScoreCirclePath.setAttribute('stroke-dasharray', '0, 100');
    }

    try {
      // 3. Fetch Dashboard Stats from Firebase API
      const stats = await FirebaseService.getDashboardStats();
      
      // 4. Populate Real Stats
      if (statsTotalResumes) statsTotalResumes.textContent = stats.totalAnalyses;
      if (statsHighestScore) statsHighestScore.textContent = `${stats.highestScore}/100`;
      if (statsAverageScore) statsAverageScore.textContent = `${stats.averageScore}%`;
      if (statsMonthlyCount) statsMonthlyCount.textContent = stats.analysesThisMonth;

      // 5. Populate Real Recent Analysis Widget
      if (stats.recentAnalysis) {
        if (dashboardRecentEmpty) dashboardRecentEmpty.style.display = 'none';
        if (dashboardRecentContent) dashboardRecentContent.style.display = 'block';

        if (recentResumeName) recentResumeName.textContent = stats.recentAnalysis.resumeName;
        if (recentResumeDate) {
          const dateStr = new Date(stats.recentAnalysis.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
          recentResumeDate.textContent = `Analyzed on ${dateStr}`;
        }
        if (recentScoreCircleText) recentScoreCircleText.textContent = stats.recentAnalysis.score;
        if (recentScoreCirclePath) {
          recentScoreCirclePath.setAttribute('stroke-dasharray', `${stats.recentAnalysis.score}, 100`);
        }
        if (recentFeedbackSnippetText) {
          recentFeedbackSnippetText.textContent = stats.recentAnalysis.recruiterFeedback || 'No feedback details generated.';
        }

        if (btnRecentViewReport && btnRecentViewReport.parentNode) {
          const newBtn = btnRecentViewReport.cloneNode(true);
          btnRecentViewReport.parentNode.replaceChild(newBtn, btnRecentViewReport);
          newBtn.addEventListener('click', () => {
            window.location.hash = 'new-analysis';
            // Render this real analysis in the report dashboard
            renderAnalysisResults(stats.recentAnalysis);
          });
        }
      } else {
        // Empty User Handling
        if (dashboardRecentEmpty) dashboardRecentEmpty.style.display = 'block';
        if (dashboardRecentContent) dashboardRecentContent.style.display = 'none';
      }

      // 6. Draw Real Score Trend SVG Chart
      drawTrendChart(stats.trends);

    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      showToast('Error loading dashboard statistics.', 'error');
      
      // Error Fallback States
      if (statsTotalResumes) statsTotalResumes.textContent = '0';
      if (statsHighestScore) statsHighestScore.textContent = '0/100';
      if (statsAverageScore) statsAverageScore.textContent = '0%';
      if (statsMonthlyCount) statsMonthlyCount.textContent = '0';

      if (dashboardRecentEmpty) dashboardRecentEmpty.style.display = 'block';
      if (dashboardRecentContent) dashboardRecentContent.style.display = 'none';
      
      // Draw empty trend chart
      drawTrendChart([]);
    }
  }

  function loadHistoryCatalog() {
    if (!historyCardsGrid) return;
    
    // Clear grid and show loader
    historyCardsGrid.innerHTML = '';
    if (historyEmptyState) historyEmptyState.style.display = 'none';
    if (historyPagination) historyPagination.style.display = 'none';
    if (historyLoader) historyLoader.style.display = 'grid';

    // Set timeout to simulate loading transition or wait for cached history
    setTimeout(() => {
      if (historyLoader) historyLoader.style.display = 'none';

      // 1. Filter analyses based on Search Input
      let filtered = cachedHistory;
      if (historySearchQuery) {
        const query = historySearchQuery.toLowerCase().trim();
        filtered = filtered.filter(item => 
          item.resumeName.toLowerCase().includes(query)
        );
      }

      // 2. Sort analyses based on Sort Select dropdown
      if (historySortOrder === 'date-desc') {
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } else if (historySortOrder === 'date-asc') {
        filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      } else if (historySortOrder === 'score-desc') {
        filtered.sort((a, b) => b.score - a.score);
      } else if (historySortOrder === 'score-asc') {
        filtered.sort((a, b) => a.score - b.score);
      }

      // If empty after filters
      if (filtered.length === 0) {
        if (historyEmptyState) historyEmptyState.style.display = 'block';
        return;
      }
      if (historyEmptyState) historyEmptyState.style.display = 'none';

      // 3. Paginate analyses (6 items per page)
      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / historyItemsPerPage);
      
      // Safety bounds check
      if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
      if (historyCurrentPage < 1) historyCurrentPage = 1;

      const startIndex = (historyCurrentPage - 1) * historyItemsPerPage;
      const endIndex = Math.min(startIndex + historyItemsPerPage, totalItems);
      const paginatedItems = filtered.slice(startIndex, endIndex);

      // Render cards
      paginatedItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';

        const dateStr = new Date(item.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        let ratingClass = 'medium';
        let levelLabel = 'Medium Compatibility';
        if (item.score >= 80) {
          ratingClass = 'high';
          levelLabel = 'Strong Compatibility';
        } else if (item.score < 50) {
          ratingClass = 'low';
          levelLabel = 'Weak Compatibility';
        }

        const escapedName = escapeHTML(item.resumeName);
        card.innerHTML = `
          <div class="history-card-header">
            <h4 class="history-card-title" title="${escapedName}">${escapedName}</h4>
            <span class="history-card-date">Parsed: ${dateStr}</span>
          </div>
          <div class="history-card-body">
            <div class="history-card-score-info">
              <span class="history-card-score-value ${ratingClass}">${item.score}/100</span>
              <span class="history-card-level ${ratingClass}">${levelLabel}</span>
            </div>
            <span class="history-card-badge ${ratingClass}">${ratingClass}</span>
          </div>
          <div class="history-card-actions">
            <button class="btn-history-card-action view" data-id="${item.analysisId}">Report</button>
            <button class="btn-history-card-action compare" data-id="${item.analysisId}">Compare</button>
            <button class="btn-history-card-action delete" data-id="${item.analysisId}" title="Delete Record">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        `;

        // Bind View Action
        card.querySelector('.btn-history-card-action.view').addEventListener('click', () => {
          window.location.hash = 'new-analysis';
          loadAnalysisById(item.analysisId);
        });

        // Bind Compare Action
        card.querySelector('.btn-history-card-action.compare').addEventListener('click', () => {
          window.location.hash = 'compare';
          // Auto-select this resume A in dropdown
          setTimeout(() => {
            const selectA = document.getElementById('select-resume-a');
            if (selectA) {
              selectA.value = item.analysisId;
              showToast(`Selected "${escapedName}" for Comparison A.`);
            }
          }, 100);
        });

        // Bind Delete Action
        card.querySelector('.btn-history-card-action.delete').addEventListener('click', async () => {
          const confirmDelete = confirm(`Are you sure you want to permanently delete "${item.resumeName}"? This cannot be undone.`);
          if (!confirmDelete) return;

          try {
            showToast('Deleting analysis record...', 'info');
            await FirebaseService.deleteAnalysis(item.analysisId);
            showToast('Analysis deleted successfully!');
            
            // Reload all user history lists
            await loadAnalysisHistory();
          } catch (err) {
            console.error('Delete error:', err);
            showToast('Failed to delete analysis record.', 'error');
          }
        });

        historyCardsGrid.appendChild(card);
      });

      // 4. Update Pagination UI
      if (totalPages > 1) {
        if (historyPagination) historyPagination.style.display = 'flex';
        if (historyPageInfo) historyPageInfo.textContent = `Page ${historyCurrentPage} of ${totalPages}`;
        
        if (btnHistoryPrev) btnHistoryPrev.disabled = (historyCurrentPage === 1);
        if (btnHistoryNext) btnHistoryNext.disabled = (historyCurrentPage === totalPages);
      } else {
        if (historyPagination) historyPagination.style.display = 'none';
      }

    }, 200);
  }

  function getMockComparisonResumes() {
    return [
      {
        analysisId: "mock_compare_a",
        resumeName: "Mock_Resume_Senior_Developer.pdf",
        score: 84,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        breakdown: {
          contact: 10,
          summary: 10,
          education: 10,
          skills: 13,
          projects: 18,
          experience: 12,
          certifications: 3,
          portfolio: 2,
          keywords: 3,
          formatting: 4
        },
        strengths: [
          "Strong technical keyword match for React and Node.js.",
          "Quantitative metrics in experience descriptions.",
          "Clear structure and clean formatting layout."
        ],
        weaknesses: [
          "Lack of direct link to certified portfolios.",
          "Missing specific cloud technology keywords."
        ],
        missingKeywords: ["Docker", "Kubernetes", "AWS Specialist", "CI/CD"],
        missingSections: ["Certifications"]
      },
      {
        analysisId: "mock_compare_b",
        resumeName: "Mock_Resume_Junior_Developer.pdf",
        score: 58,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        breakdown: {
          contact: 10,
          summary: 5,
          education: 10,
          skills: 8,
          projects: 10,
          experience: 5,
          certifications: 0,
          portfolio: 2,
          keywords: 3,
          formatting: 5
        },
        strengths: [
          "Good contact information listed clearly.",
          "Excellent basic education formatting."
        ],
        weaknesses: [
          "No professional summary statement.",
          "Lack of project metrics or achievements details.",
          "No work experience listed beyond internships."
        ],
        missingKeywords: ["React Hooks", "Redux", "SQL", "Unit Testing"],
        missingSections: ["Summary", "Experience"]
      }
    ];
  }

  function loadCompareData() {
    const selectA = document.getElementById('select-resume-a');
    const selectB = document.getElementById('select-resume-b');

    if (!selectA || !selectB) return;

    const prevValA = selectA.value;
    const prevValB = selectB.value;

    selectA.innerHTML = '<option value="">-- Choose first resume --</option>';
    selectB.innerHTML = '<option value="">-- Choose second resume --</option>';

    // 1. Populate real user analyses retrieved from Firebase Realtime Database
    cachedHistory.forEach(item => {
      const escapedName = escapeHTML(item.resumeName);
      const optA = document.createElement('option');
      optA.value = item.analysisId;
      optA.textContent = `${escapedName} (${item.score}/100)`;
      selectA.appendChild(optA);

      const optB = document.createElement('option');
      optB.value = item.analysisId;
      optB.textContent = `${escapedName} (${item.score}/100)`;
      selectB.appendChild(optB);
    });

    // 2. If the user has fewer than 2 analyses in Firebase, always append the high-quality demo mock options
    if (cachedHistory.length < 2) {
      getMockComparisonResumes().forEach(item => {
        const escapedName = escapeHTML(item.resumeName);
        const optA = document.createElement('option');
        optA.value = item.analysisId;
        optA.textContent = `[Demo] ${escapedName} (${item.score}/100)`;
        selectA.appendChild(optA);

        const optB = document.createElement('option');
        optB.value = item.analysisId;
        optB.textContent = `[Demo] ${escapedName} (${item.score}/100)`;
        selectB.appendChild(optB);
      });
    }

    if (prevValA) selectA.value = prevValA;
    if (prevValB) selectB.value = prevValB;
  }

  function loadProfileData() {
    const user = auth.currentUser;
    if (!user) return;

    // 1. Populate basic profile credentials
    const displayName = user.displayName || 'No Name Set';
    const email = user.email || 'N/A';
    const uid = user.uid;
    const provider = user.providerData && user.providerData.length > 0 
      ? user.providerData[0].providerId 
      : 'password';
    
    const creationTime = user.metadata && user.metadata.creationTime
      ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'N/A';

    // Populate display text
    const profileDisplayName = document.getElementById('profile-display-name');
    const profileEmail = document.getElementById('profile-email');
    const profileCreatedDate = document.getElementById('profile-created-date');
    const profileProvider = document.getElementById('profile-provider');
    const profileUid = document.getElementById('profile-uid');

    if (profileDisplayName) profileDisplayName.textContent = displayName;
    if (profileEmail) profileEmail.textContent = email;
    if (profileCreatedDate) profileCreatedDate.textContent = creationTime;
    if (profileProvider) profileProvider.textContent = provider;
    if (profileUid) profileUid.textContent = uid;

    // Avatar Circle placeholder letter
    const avatarPlaceholder = document.getElementById('profile-avatar-placeholder');
    if (avatarPlaceholder) {
      avatarPlaceholder.textContent = user.displayName 
        ? user.displayName.charAt(0).toUpperCase() 
        : (user.email ? user.email.charAt(0).toUpperCase() : 'U');
    }

    // 2. Calculate user resume statistics using real records catalog
    const totalAnalyses = cachedHistory.length;
    const highestScore = totalAnalyses > 0 ? Math.max(...cachedHistory.map(item => item.score)) : 0;
    const averageScore = totalAnalyses > 0 
      ? Math.round(cachedHistory.reduce((sum, item) => sum + item.score, 0) / totalAnalyses) 
      : 0;

    // Calculate Total Improvements Made (score increases chronologically)
    const chronoList = [...cachedHistory].reverse();
    let improvementsCount = 0;
    for (let i = 1; i < chronoList.length; i++) {
      if (chronoList[i].score > chronoList[i - 1].score) {
        improvementsCount++;
      }
    }

    // Populate statistics displays
    const profileStatTotal = document.getElementById('profile-stat-total');
    const profileStatHighest = document.getElementById('profile-stat-highest');
    const profileStatAverage = document.getElementById('profile-stat-average');
    const profileStatImprovements = document.getElementById('profile-stat-improvements');

    if (profileStatTotal) profileStatTotal.textContent = totalAnalyses;
    if (profileStatHighest) profileStatHighest.textContent = `${highestScore}/100`;
    if (profileStatAverage) profileStatAverage.textContent = `${averageScore}%`;
    if (profileStatImprovements) profileStatImprovements.textContent = improvementsCount;
  }

  // Register Profile Action Listeners
  const btnProfileEdit = document.getElementById('btn-profile-edit');
  const btnProfileSave = document.getElementById('btn-profile-save');
  const btnProfileCancel = document.getElementById('btn-profile-cancel');
  const btnProfileLogout = document.getElementById('btn-profile-logout');
  
  const profileNameDisplayContainer = document.getElementById('profile-name-display-container');
  const profileNameEditContainer = document.getElementById('profile-name-edit-container');
  const inputProfileName = document.getElementById('input-profile-name');

  if (btnProfileEdit) {
    btnProfileEdit.addEventListener('click', () => {
      const user = auth.currentUser;
      if (!user) return;
      
      if (inputProfileName) inputProfileName.value = user.displayName || '';
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

      try {
        const user = auth.currentUser;
        if (!user) throw new Error('Authorization required.');

        await updateProfile(user, { displayName: newName });
        
        // Update header and welcome name instantly
        if (headerUsername) headerUsername.textContent = newName;
        const welcomeUserEl = document.getElementById('welcome-username');
        if (welcomeUserEl) welcomeUserEl.textContent = newName;
        
        showToast('Profile name updated successfully!');
        
        // Reload page credentials
        loadProfileData();
        
        // Hide edit inputs
        if (profileNameDisplayContainer) profileNameDisplayContainer.style.display = 'flex';
        if (profileNameEditContainer) profileNameEditContainer.style.display = 'none';
      } catch (err) {
        console.error('Profile update error:', err);
        showToast(err.message || 'Failed to update profile name.', 'error');
      } finally {
        btnProfileSave.removeAttribute('disabled');
        btnProfileSave.textContent = 'Save';
      }
    });
  }

  if (btnProfileLogout) {
    btnProfileLogout.addEventListener('click', handleLogout);
  }

  // Register Comparison Event Listeners
  const btnCompareResumes = document.getElementById('btn-compare-resumes');
  const compareResultsContainer = document.getElementById('compare-results-container');
  const compareLoader = document.getElementById('compare-loader');

  if (btnCompareResumes) {
    btnCompareResumes.addEventListener('click', async () => {
      const selectA = document.getElementById('select-resume-a');
      const selectB = document.getElementById('select-resume-b');
      if (!selectA || !selectB) return;

      const idA = selectA.value;
      const idB = selectB.value;

      if (!idA || !idB) {
        showToast('Please select two resumes to compare.', 'error');
        return;
      }

      if (idA === idB) {
        showToast('Please select two different resumes to compare.', 'error');
        return;
      }

      btnCompareResumes.setAttribute('disabled', 'true');
      btnCompareResumes.textContent = 'Comparing...';
      if (compareResultsContainer) compareResultsContainer.style.display = 'none';
      if (compareLoader) compareLoader.style.display = 'flex';

      try {
        const user = auth.currentUser;
        if (!user) throw new Error('Authorization required.');
        const idToken = await user.getIdToken();

        let dataA, dataB;

        if (idA === 'mock_compare_a' || idA === 'mock_compare_b') {
          dataA = { analysis: getMockComparisonResumes().find(r => r.analysisId === idA) };
        } else {
          const resA = await fetch(`${API_BASE}/analysis/${idA}`, { headers: { 'Authorization': `Bearer ${idToken}` } });
          try {
            dataA = await resA.json();
          } catch (e) {
            throw new Error('Failed to parse Resume A analysis payload.');
          }
          if (!resA.ok) throw new Error(dataA.message || 'Failed to retrieve Resume A.');
        }

        if (idB === 'mock_compare_a' || idB === 'mock_compare_b') {
          dataB = { analysis: getMockComparisonResumes().find(r => r.analysisId === idB) };
        } else {
          const resB = await fetch(`${API_BASE}/analysis/${idB}`, { headers: { 'Authorization': `Bearer ${idToken}` } });
          try {
            dataB = await resB.json();
          } catch (e) {
            throw new Error('Failed to parse Resume B analysis payload.');
          }
          if (!resB.ok) throw new Error(dataB.message || 'Failed to retrieve Resume B.');
        }

        renderComparison(dataA.analysis, dataB.analysis);
        if (compareResultsContainer) compareResultsContainer.style.display = 'block';
      } catch (error) {
        console.error('Comparison load error:', error);
        showToast(error.message, 'error');
      } finally {
        btnCompareResumes.removeAttribute('disabled');
        btnCompareResumes.textContent = 'Compare';
        if (compareLoader) compareLoader.style.display = 'none';
      }
    });
  }

  function renderComparison(a, b) {
    if (!a || !b) {
      throw new Error('Invalid comparison records. One or both resumes could not be loaded.');
    }

    const nameA = a.resumeName || 'Unnamed Resume A';
    const scoreA = typeof a.score === 'number' ? a.score : 0;
    const dateStrA = a.createdAt ? new Date(a.createdAt).toLocaleDateString() : 'N/A';

    const nameB = b.resumeName || 'Unnamed Resume B';
    const scoreB = typeof b.score === 'number' ? b.score : 0;
    const dateStrB = b.createdAt ? new Date(b.createdAt).toLocaleDateString() : 'N/A';

    const compareNameA = document.getElementById('compare-name-a');
    const compareScoreA = document.getElementById('compare-score-a');
    const compareDateA = document.getElementById('compare-date-a');
    const compareNameB = document.getElementById('compare-name-b');
    const compareScoreB = document.getElementById('compare-score-b');
    const compareDateB = document.getElementById('compare-date-b');
    const deltaBadge = document.getElementById('compare-delta-badge');
    const improvedList = document.getElementById('compare-improved-sections');
    const weakerList = document.getElementById('compare-weaker-sections');
    const addedList = document.getElementById('compare-added-skills');
    const removedList = document.getElementById('compare-removed-skills');

    if (compareNameA) compareNameA.textContent = nameA;
    if (compareScoreA) compareScoreA.textContent = `${scoreA}/100`;
    if (compareDateA) compareDateA.textContent = dateStrA;

    if (compareNameB) compareNameB.textContent = nameB;
    if (compareScoreB) compareScoreB.textContent = `${scoreB}/100`;
    if (compareDateB) compareDateB.textContent = dateStrB;

    renderCompareBreakdown('compare-breakdown-a', a.breakdown || {});
    renderCompareBreakdown('compare-breakdown-b', b.breakdown || {});

    renderCompareList('compare-strengths-a', a.strengths || []);
    renderCompareList('compare-strengths-b', b.strengths || []);

    renderCompareList('compare-weaknesses-a', a.weaknesses || []);
    renderCompareList('compare-weaknesses-b', b.weaknesses || []);

    renderCompareTags('compare-keywords-a', a.missingKeywords || []);
    renderCompareTags('compare-keywords-b', b.missingKeywords || []);

    renderCompareTags('compare-missing-a', a.missingSections || []);
    renderCompareTags('compare-missing-b', b.missingSections || []);

    // --- COMPARISON ANALYTICS OVERVIEW LOGIC ---
    
    // 1. Score Difference
    const scoreDiff = scoreB - scoreA;
    if (deltaBadge) {
      if (scoreDiff > 0) {
        deltaBadge.textContent = `+${scoreDiff} ATS Score Improvement`;
        deltaBadge.className = 'compare-delta-badge positive';
      } else if (scoreDiff < 0) {
        deltaBadge.textContent = `${scoreDiff} ATS Score Drop`;
        deltaBadge.className = 'compare-delta-badge negative';
      } else {
        deltaBadge.textContent = 'No Score Change';
        deltaBadge.className = 'compare-delta-badge neutral';
      }
    }

    // 2. Improved and Weaker Sections
    if (improvedList && weakerList) {
      improvedList.innerHTML = '';
      weakerList.innerHTML = '';

      Object.keys(categoryMetadata).forEach(key => {
        const scoreValA = (a.breakdown && a.breakdown[key]) || 0;
        const scoreValB = (b.breakdown && b.breakdown[key]) || 0;
        const name = categoryMetadata[key].name;

        if (scoreValB > scoreValA) {
          const li = document.createElement('li');
          li.textContent = `${name} (+${scoreValB - scoreValA})`;
          improvedList.appendChild(li);
        } else if (scoreValB < scoreValA) {
          const li = document.createElement('li');
          li.textContent = `${name} (-${scoreValA - scoreValB})`;
          weakerList.appendChild(li);
        }
      });

      if (improvedList.children.length === 0) {
        improvedList.innerHTML = '<li style="color: var(--text-muted); list-style: none; padding-left: 0;">None identified.</li>';
      }
      if (weakerList.children.length === 0) {
        weakerList.innerHTML = '<li style="color: var(--text-muted); list-style: none; padding-left: 0;">None identified.</li>';
      }
    }

    // 3. Added and Removed Skills / Keywords
    const missingA = new Set((a.missingKeywords || []).map(k => k.toLowerCase().trim()));
    const missingB = new Set((b.missingKeywords || []).map(k => k.toLowerCase().trim()));

    // Added in B (missing in A but NOT missing in B)
    const added = (a.missingKeywords || []).filter(k => !missingB.has(k.toLowerCase().trim()));
    // Removed in B (missing in B but NOT missing in A)
    const removed = (b.missingKeywords || []).filter(k => !missingA.has(k.toLowerCase().trim()));

    renderCompareTags('compare-added-skills', added);
    renderCompareTags('compare-removed-skills', removed);

    // Apply custom coloring to delta tags
    if (addedList) {
      Array.from(addedList.children).forEach(tag => {
        if (tag.classList.contains('tag')) {
          tag.style.color = 'var(--emerald)';
          tag.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          tag.style.backgroundColor = 'rgba(16, 185, 129, 0.03)';
        }
      });
    }
    if (removedList) {
      Array.from(removedList.children).forEach(tag => {
        if (tag.classList.contains('tag')) {
          tag.style.color = 'var(--rose)';
          tag.style.borderColor = 'rgba(244, 63, 94, 0.3)';
          tag.style.backgroundColor = 'rgba(244, 63, 94, 0.03)';
        }
      });
    }
  }

  function renderCompareBreakdown(containerId, breakdown) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    Object.keys(breakdown).forEach(key => {
      const val = breakdown[key];
      const meta = categoryMetadata[key] || { name: key, max: 10 };
      
      const div = document.createElement('div');
      div.className = 'compare-breakdown-item';
      div.innerHTML = `
        <span>${escapeHTML(meta.name)}</span>
        <strong>${val}/${meta.max}</strong>
      `;
      container.appendChild(div);
    });
  }

  function renderCompareList(containerId, list) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    list.slice(0, 4).forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      container.appendChild(li);
    });
    
    if (list.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'None identified.';
      li.style.color = 'var(--text-muted)';
      container.appendChild(li);
    }
  }

  function renderCompareTags(containerId, tags) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    tags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = tag;
      if (containerId.includes('missing')) {
        span.style.color = 'var(--rose)';
        span.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        span.style.backgroundColor = 'rgba(244, 63, 94, 0.03)';
      }
      container.appendChild(span);
    });

    if (tags.length === 0) {
      container.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">None missing.</span>';
    }
  }

  // Auth Form actions
  tabLogin.addEventListener('click', () => {
    currentAuthMode = 'login';
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    btnAuthSubmit.textContent = 'Sign In';
  });

  tabSignup.addEventListener('click', () => {
    currentAuthMode = 'signup';
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    btnAuthSubmit.textContent = 'Register';
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;

    btnAuthSubmit.setAttribute('disabled', 'true');
    btnAuthSubmit.textContent = currentAuthMode === 'login' ? 'Signing In...' : 'Registering...';

    try {
      if (currentAuthMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Login successful!');
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("User created");

        console.log("Attempting profile creation");
        try {
          const userRef = ref(db, `users/${user.uid}`);
          await set(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            createdAt: new Date().toISOString()
          });
          console.log("Profile creation successful");
        } catch (dbError) {
          console.log("Profile creation failed");
          console.error(dbError);
        }

        showToast('Account registered successfully!');
      }
      authForm.reset();
    } catch (error) {
      showToast(getFriendlyAuthErrorMessage(error), 'error');
    } finally {
      btnAuthSubmit.removeAttribute('disabled');
      btnAuthSubmit.textContent = currentAuthMode === 'login' ? 'Sign In' : 'Register';
    }
  });

  btnGoogle.addEventListener('click', async () => {
    btnGoogle.setAttribute('disabled', 'true');
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const user = userCredential.user;
      console.log("User created");

      console.log("Attempting profile creation");
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
        console.log("Profile creation successful");
      } catch (dbError) {
        console.log("Profile creation failed");
        console.error(dbError);
      }

      showToast('Signed in with Google!');
    } catch (error) {
      showToast(getFriendlyAuthErrorMessage(error), 'error');
    } finally {
      btnGoogle.removeAttribute('disabled');
    }
  });

  async function handleLogout() {
    try {
      await signOut(auth);
      showToast('Signed out successfully.');
    } catch (error) {
      showToast('Failed to sign out.', 'error');
    }
  }

  btnLogout.addEventListener('click', handleLogout);
  if (navLogout) {
    navLogout.addEventListener('click', handleLogout);
  }

  // 5. Tabs Navigation Switches
  const tabs = [
    { button: tabReport, container: resultsDashboard },
    { button: tabSkillGap, container: skillgapDashboard },
    { button: tabInterview, container: interviewDashboard }
  ];

  tabs.forEach(tab => {
    if (tab.button && tab.container) {
      tab.button.addEventListener('click', () => {
        tabs.forEach(t => {
          if (t.button) t.button.classList.remove('active');
          if (t.container) t.container.style.display = 'none';
        });
        tab.button.classList.add('active');
        tab.container.style.display = 'flex';
      });
    }
  });

  // 6. Drag & Drop File Upload Handlers
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(name => {
      dropZone.addEventListener(name, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(name => {
      dropZone.addEventListener(name, () => dropZone.classList.remove('dragover'), false);
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
      dropZone.addEventListener(name, e => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt.files.length > 0) handleFileSelection(dt.files[0]);
    });

    dropZone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', e => {
      if (e.target.files.length > 0) handleFileSelection(e.target.files[0]);
    });
  }

  function handleFileSelection(file) {
    if (file.name.split('.').pop().toLowerCase() !== 'pdf') {
      showToast('Only PDF files are supported.', 'error');
      resetFileSelection();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File exceeds 5MB size limit.', 'error');
      resetFileSelection();
      return;
    }

    selectedFile = file;
    if (previewFileName) previewFileName.textContent = file.name;
    if (previewFileSize) previewFileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
    if (filePreview) filePreview.style.display = 'flex';
    if (dropZone) dropZone.style.display = 'none';
    checkAnalyzeButtonState();
  }

  if (targetRoleSelect) {
    targetRoleSelect.addEventListener('change', () => {
      checkAnalyzeButtonState();
    });
  }

  function checkAnalyzeButtonState() {
    if (!btnAnalyze) return;
    const hasFile = selectedFile !== null;
    const hasRole = targetRoleSelect && targetRoleSelect.value !== '';
    if (hasFile && hasRole) {
      btnAnalyze.removeAttribute('disabled');
    } else {
      btnAnalyze.setAttribute('disabled', 'true');
    }
  }

  if (btnRemoveFile) {
    btnRemoveFile.addEventListener('click', (e) => {
      e.stopPropagation();
      resetFileSelection();
    });
  }

  function resetFileSelection() {
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    if (filePreview) filePreview.style.display = 'none';
    if (dropZone) dropZone.style.display = 'flex';
    if (targetRoleSelect) targetRoleSelect.value = '';
    checkAnalyzeButtonState();
  }

  const btnErrorUploadAnother = document.getElementById('btn-error-upload-another');
  if (btnErrorUploadAnother) {
    btnErrorUploadAnother.addEventListener('click', () => {
      if (errorStateCard) errorStateCard.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      if (fileInput) fileInput.click();
    });
  }

  function showErrorStateCard(documentType, errorCode) {
    if (emptyState) emptyState.style.display = 'none';
    if (resultsDashboard) resultsDashboard.style.display = 'none';
    if (skillgapDashboard) skillgapDashboard.style.display = 'none';
    if (interviewDashboard) interviewDashboard.style.display = 'none';
    if (rawTextContainer) rawTextContainer.style.display = 'none';
    if (resultsTabs) resultsTabs.style.display = 'none';
    
    if (errorStateCard) {
      const errorIntro = document.getElementById('error-intro');
      const errorDetectedTypeContainer = document.getElementById('error-detected-type-container');
      const errorDetectedType = document.getElementById('error-detected-type');
      
      if (errorCode === 'EXTRACTION_FAILED' || documentType === 'Unknown' || !documentType) {
        if (errorIntro) errorIntro.textContent = 'Unable to determine document type. Please upload a valid resume.';
        if (errorDetectedTypeContainer) errorDetectedTypeContainer.style.display = 'none';
      } else {
        if (errorIntro) errorIntro.textContent = 'The uploaded file was detected as a non-resume document.';
        if (errorDetectedTypeContainer) errorDetectedTypeContainer.style.display = 'block';
        if (errorDetectedType) errorDetectedType.textContent = documentType;
      }
      
      errorStateCard.style.display = 'flex';
    }
  }

  // 7. Analyze Trigger
  if (btnAnalyze) {
    btnAnalyze.addEventListener('click', async () => {
      const selectedRole = targetRoleSelect ? targetRoleSelect.value : '';
      if (!selectedFile || !selectedRole) {
        showToast('Please upload your resume and select a target job role before starting the analysis.', 'error');
        return;
      }

      if (emptyState) emptyState.style.display = 'none';
      if (resultsDashboard) resultsDashboard.style.display = 'none';
      if (skillgapDashboard) skillgapDashboard.style.display = 'none';
      if (interviewDashboard) interviewDashboard.style.display = 'none';
      if (rawTextContainer) rawTextContainer.style.display = 'none';
      if (resultsTabs) resultsTabs.style.display = 'none';
      if (errorStateCard) errorStateCard.style.display = 'none';
      if (loader) loader.style.display = 'flex';
      btnAnalyze.setAttribute('disabled', 'true');
      if (btnRemoveFile) btnRemoveFile.setAttribute('disabled', 'true');

      const formData = new FormData();
      formData.append('resume', selectedFile);
      formData.append('targetRole', selectedRole);

      let success = false;
      try {
        const user = auth.currentUser;
        if (!user) throw new Error('Authorization required.');
        const idToken = await user.getIdToken();

        const response = await fetch(`${API_BASE}/analyze`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${idToken}` },
          body: formData
        });

        const result = await response.json();
        if (!response.ok) {
          const err = new Error(result.message || 'Analysis pipeline execution failed.');
          err.code = result.code;
          err.documentType = result.documentType;
          throw err;
        }

        // Render Dashboard
        renderAnalysisResults(result);
        showToast('Analysis completed successfully!');
        
        // Reset upload cards and refresh history
        resetFileSelection();
        loadAnalysisHistory();
        success = true;
      } catch (error) {
        console.error('Analysis error:', error);
        showToast(error.message, 'error');
        if (error.code === 'INVALID_DOCUMENT_TYPE' || error.code === 'EXTRACTION_FAILED') {
          showErrorStateCard(error.documentType || 'Unknown', error.code);
          resetFileSelection();
          success = true; // Prevents showing empty state
        }
      } finally {
        if (loader) loader.style.display = 'none';
        if (!success && emptyState) {
          emptyState.style.display = 'flex';
        }
        checkAnalyzeButtonState();
        if (btnRemoveFile) btnRemoveFile.removeAttribute('disabled');
      }
    });
  }

  // 8. Render Results to Bento Layout
  function renderAnalysisResults(analysis) {
    console.log("Rendering analysis results:", analysis);
    if (errorStateCard) errorStateCard.style.display = 'none';
    
    // Set active analysis session
    activeAnalysis = analysis;
    activeAnalysisText = analysis.extractedResumeText || analysis.extractedText || analysis.text || '';

    // Restore target role dropdown selections
    if (analysis.targetRole) {
      if (targetRoleSelect) targetRoleSelect.value = analysis.targetRole;
      if (selectTargetRole) selectTargetRole.value = analysis.targetRole;
    }

    // Set active target role labels in Skill Gap and Interview dashboards
    const activeRoleLabel = analysis.targetRole || 'Software Engineer';
    const sgActiveRole = document.getElementById('skillgap-active-role');
    const ipActiveRole = document.getElementById('interview-active-role');
    if (sgActiveRole) sgActiveRole.textContent = activeRoleLabel;
    if (ipActiveRole) ipActiveRole.textContent = activeRoleLabel;
    
    const { 
      resumeName, score, breakdown, explanations, strengths, 
      weaknesses, atsTips, rewriteSuggestions, 
      missingKeywords, missingSections 
    } = analysis;

    // Show Report Tab default
    tabs.forEach(t => {
      if (t.button) t.button.classList.remove('active');
      if (t.container) t.container.style.display = 'none';
    });
    if (tabReport) tabReport.classList.add('active');
    if (resultsDashboard) resultsDashboard.style.display = 'flex';
    if (resultsTabs) resultsTabs.style.display = 'flex';
    if (loader) loader.style.display = 'none';

    // Headers
    if (resFilename) resFilename.textContent = resumeName;
    let badgeText = 'Low Compatibility';
    if (score >= 85) badgeText = 'High Compatibility';
    else if (score >= 60) badgeText = 'Medium Compatibility';
    if (resAtsBadge) resAtsBadge.textContent = `ATS Compatibility: ${badgeText}`;

    // Circular gauge animation
    if (resScore) resScore.textContent = score;
    const fillCircle = document.getElementById('score-fill-circle');
    if (fillCircle) {
      const radius = fillCircle.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      fillCircle.style.strokeDasharray = `${circumference}`;
      const offset = circumference - (score / 100) * circumference;
      setTimeout(() => {
        fillCircle.style.strokeDashoffset = offset;
      }, 100);
    }

    // Recruiter feedback
    if (resFeedbackText) resFeedbackText.textContent = analysis.recruiterFeedback || 'No feedback paragraph generated.';

    // Score Breakdown Grid
    if (breakdownGrid) {
      breakdownGrid.innerHTML = '';
      if (breakdown) {
        Object.keys(breakdown).forEach(key => {
          const value = breakdown[key];
          const meta = categoryMetadata[key] || { name: key, max: 10, color: 'blue' };
          const exp = explanations[key] || 'Detailed score explanation.';
          
          const card = document.createElement('div');
          card.className = 'breakdown-card';
          
          const percentage = (value / meta.max) * 100;
          
          card.innerHTML = `
            <div class="breakdown-card-header">
              <span class="breakdown-card-title">${escapeHTML(meta.name)}</span>
              <span class="breakdown-card-score">${value}/${meta.max}</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill ${meta.color}" style="width: ${percentage}%"></div>
            </div>
            <div class="breakdown-card-desc" style="display: none;">${escapeHTML(exp)}</div>
          `;

          // Interactive Click Description Toggle
          card.addEventListener('click', () => {
            const desc = card.querySelector('.breakdown-card-desc');
            if (desc) {
              const isHidden = desc.style.display === 'none';
              desc.style.display = isHidden ? 'block' : 'none';
            }
          });

          breakdownGrid.appendChild(card);
        });
      }
    }

    // Key Lists: Strengths
    if (resStrengthsList) {
      resStrengthsList.innerHTML = '';
      if (strengths) {
        strengths.forEach(s => {
          const li = document.createElement('li');
          li.textContent = s;
          resStrengthsList.appendChild(li);
        });
      }
    }

    // Weaknesses
    if (resWeaknessesList) {
      resWeaknessesList.innerHTML = '';
      if (weaknesses) {
        weaknesses.forEach(w => {
          const li = document.createElement('li');
          li.textContent = w;
          resWeaknessesList.appendChild(li);
        });
      }
    }

    // Rewrite suggestions
    if (resRewriteList) {
      resRewriteList.innerHTML = '';
      if (rewriteSuggestions) {
        rewriteSuggestions.forEach(r => {
          const li = document.createElement('li');
          li.textContent = r;
          resRewriteList.appendChild(li);
        });
      }
    }

    // ATS Optimization Tips
    if (resAtsTipsList) {
      resAtsTipsList.innerHTML = '';
      if (atsTips) {
        atsTips.forEach(t => {
          const li = document.createElement('li');
          li.textContent = t;
          resAtsTipsList.appendChild(li);
        });
      }
    }

    // Missing keywords tags
    if (resMissingKeywordsTags) {
      resMissingKeywordsTags.innerHTML = '';
      if (missingKeywords && missingKeywords.length > 0) {
        missingKeywords.forEach(word => {
          const span = document.createElement('span');
          span.className = 'tag';
          span.textContent = word;
          resMissingKeywordsTags.appendChild(span);
        });
      } else {
        resMissingKeywordsTags.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">Excellent keyword density! No gaps found.</span>';
      }
    }

    // Missing essential sections
    if (resMissingSectionsTags) {
      resMissingSectionsTags.innerHTML = '';
      if (missingSections && missingSections.length > 0) {
        missingSections.forEach(section => {
          const span = document.createElement('span');
          span.className = 'tag';
          span.style.color = 'var(--rose)';
          span.style.borderColor = 'rgba(244, 63, 94, 0.3)';
          span.style.backgroundColor = 'rgba(244, 63, 94, 0.03)';
          span.textContent = section;
          resMissingSectionsTags.appendChild(span);
        });
      } else {
        resMissingSectionsTags.innerHTML = '<span style="font-size: 0.8rem; color: var(--emerald);">All essential sections are present.</span>';
      }
    }

    // Raw Text panel
    if (rawFilename) rawFilename.textContent = resumeName;
    if (extractedTextContent) extractedTextContent.textContent = activeAnalysisText || '(No text extracted)';

    // Copy to clipboard
    if (btnCopyText) {
      btnCopyText.onclick = async () => {
        try {
          await navigator.clipboard.writeText(activeAnalysisText);
          const originalHTML = btnCopyText.innerHTML;
          btnCopyText.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
          `;
          btnCopyText.style.color = 'var(--emerald)';
          btnCopyText.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          
          setTimeout(() => {
            btnCopyText.innerHTML = originalHTML;
            btnCopyText.style.color = '';
            btnCopyText.style.borderColor = '';
          }, 2000);
        } catch (err) {
          showToast('Failed to copy text.', 'error');
        }
      };
    }

    // Render stored Skill Gap and Interview Prep if available
    if (analysis.skillGap) {
      displaySkillGap(analysis.skillGap);
    } else {
      if (skillgapResults) skillgapResults.style.display = 'none';
    }

    if (analysis.interviewPrep) {
      displayInterviewPrep(analysis.interviewPrep);
    } else {
      if (interviewResults) interviewResults.style.display = 'none';
    }
  }

  function displaySkillGap(skillGap) {
    if (!skillGap || !skillgapResults) return;
    
    if (selectTargetRole && skillGap.targetRole) {
      selectTargetRole.value = skillGap.targetRole;
    }
    
    renderTagsCloud(matchedSkillsTags, skillGap.matchedSkills, 'green');
    renderTagsCloud(missingSkillsTags, skillGap.missingSkills, 'red');
    renderTagsCloud(recommendedSkillsTags, skillGap.recommendedSkills, 'blue');

    if (roadmapTimeline) {
      roadmapTimeline.innerHTML = '';
      (skillGap.learningRoadmap || []).forEach((milestone, idx) => {
        const node = document.createElement('div');
        node.className = 'timeline-node';
        
        const parts = milestone.split(':');
        const phaseTitle = parts[0] || `Phase ${idx + 1}`;
        const phaseDesc = parts.slice(1).join(':') || 'Bridge technical competencies.';

        node.innerHTML = `
          <div class="timeline-node-title">${escapeHTML(phaseTitle)}</div>
          <div class="timeline-node-desc">${escapeHTML(phaseDesc)}</div>
        `;
        roadmapTimeline.appendChild(node);
      });
    }

    skillgapResults.style.display = 'block';
  }

  function displayInterviewPrep(interviewPrep) {
    if (!interviewPrep || !interviewResults) return;
    
    renderQuestionsList(technicalQuestionsList, interviewPrep.technical);
    renderQuestionsList(projectQuestionsList, interviewPrep.projectBased);
    renderQuestionsList(skillgapQuestionsList, interviewPrep.skillGap);
    renderQuestionsList(behavioralQuestionsList, interviewPrep.behavioral);
    renderQuestionsList(hrQuestionsList, interviewPrep.hrQuestions);

    interviewResults.style.display = 'block';
  }

  // 9. Skill Gap compare trigger has been unified and is now automatic

  function renderTagsCloud(container, list, colorClass) {
    if (!container) return;
    container.innerHTML = '';
    if (!list || list.length === 0) {
      if (colorClass === 'green') {
        container.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; display: block; width: 100%;">No matched skills detected for this target role.</span>';
      } else {
        container.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">None detected.</span>';
      }
      return;
    }
    
    list.forEach(item => {
      const span = document.createElement('span');
      span.className = 'tag';
      if (colorClass === 'green') {
        span.style.color = 'var(--emerald)';
        span.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        span.style.backgroundColor = 'rgba(16, 185, 129, 0.03)';
      } else if (colorClass === 'red') {
        span.style.color = 'var(--rose)';
        span.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        span.style.backgroundColor = 'rgba(244, 63, 94, 0.03)';
      } else {
        span.style.color = 'var(--blue)';
        span.style.borderColor = 'rgba(59, 130, 246, 0.3)';
        span.style.backgroundColor = 'rgba(59, 130, 246, 0.03)';
      }
      span.textContent = item;
      container.appendChild(span);
    });
  }

  // 10. Generate Interview Questions trigger has been unified and is now automatic

  function renderQuestionsList(container, list) {
    if (!container) return;
    container.innerHTML = '';
    if (!list || list.length === 0) {
      container.innerHTML = '<li class="q-item"><span class="q-item-text" style="color: var(--text-muted);">None generated.</span></li>';
      return;
    }

    list.forEach(q => {
      const li = document.createElement('li');
      li.className = 'q-item';
      
      li.innerHTML = `
        <span class="q-item-text">${escapeHTML(q)}</span>
        <button class="btn-copy-q" title="Copy Flashcard Question">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      `;

      const copyBtn = li.querySelector('.btn-copy-q');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(q);
          showToast('Flashcard question copied to clipboard!');
          
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
          copyBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          copyBtn.style.background = 'rgba(16, 185, 129, 0.1)';

          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.style.borderColor = '';
            copyBtn.style.background = '';
          }, 1500);
        } catch (e) {
          showToast('Failed to copy question.', 'error');
        }
      });

      container.appendChild(li);
    });
  }

  // History Page Event Listeners
  if (historySearchInput) {
    historySearchInput.addEventListener('input', (e) => {
      historySearchQuery = e.target.value;
      historyCurrentPage = 1;
      loadHistoryCatalog();
    });
  }

  if (historySortSelect) {
    historySortSelect.addEventListener('change', (e) => {
      historySortOrder = e.target.value;
      historyCurrentPage = 1;
      loadHistoryCatalog();
    });
  }

  if (btnHistoryPrev) {
    btnHistoryPrev.addEventListener('click', () => {
      if (historyCurrentPage > 1) {
        historyCurrentPage--;
        loadHistoryCatalog();
      }
    });
  }

  if (btnHistoryNext) {
    btnHistoryNext.addEventListener('click', () => {
      let filtered = cachedHistory;
      if (historySearchQuery) {
        const query = historySearchQuery.toLowerCase().trim();
        filtered = filtered.filter(item => 
          item.resumeName.toLowerCase().includes(query)
        );
      }
      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / historyItemsPerPage);
      if (historyCurrentPage < totalPages) {
        historyCurrentPage++;
        loadHistoryCatalog();
      }
    });
  }

  // Sidebar Collapse & Mobile Hamburger Toggle Logic
  if (btnCollapse && appSidebarNav) {
    btnCollapse.addEventListener('click', () => {
      appSidebarNav.classList.toggle('collapsed');
      localStorage.setItem('sidebar-collapsed', appSidebarNav.classList.contains('collapsed'));
    });
  }

  function closeMobileSidebar() {
    if (appSidebarNav) appSidebarNav.classList.remove('sidebar-open');
    if (btnHamburger) btnHamburger.classList.remove('active');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  }

  if (btnHamburger) {
    btnHamburger.addEventListener('click', () => {
      if (appSidebarNav) appSidebarNav.classList.toggle('sidebar-open');
      btnHamburger.classList.toggle('active');
      if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeMobileSidebar);
  }

  // Close sidebar on mobile when nav links are clicked
  if (appSidebarNav) {
    const navLinks = appSidebarNav.querySelectorAll('.nav-item');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          closeMobileSidebar();
        }
      });
    });
  }

  // Start connection checks and route initialization
  checkServerHealth();
  handleRouting();
});
