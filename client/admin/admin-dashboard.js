// admin-dashboard.js — extracted from inline <script> blocks in dashboard.html
// Loaded as: <script type="module" src="/admin/admin-dashboard.js"></script>

import { auth, isMockMode } from '../js/firebase-config.js';
import { formatTimeAgo } from '../js/utils.js';

// ==========================================
// HEAD SCRIPT: Auth gate + telemetry loader
// ==========================================

// Immediately block the canvas render loop
document.documentElement.style.display = 'none';

auth.onAuthStateChanged(async (user) => {
  const adminEmail = window.process?.env?.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';
  const emailToCheck = isMockMode ? 'admin@resumetrices.com' : (user ? user.email : null);
  
  if (isMockMode || (user && emailToCheck === adminEmail)) {
    // User is authorized - unblock render loop
    document.documentElement.style.display = '';
    
    // Fetch and load initial statistics
    await loadTelemetryData(user);
  } else {
    // Not authorized - eject immediately
    const mockParam = isMockMode ? '?mock=true' : '';
    window.location.href = `../index.html${mockParam}`;
  }
});

async function loadTelemetryData(user) {
  try {
    const idToken = isMockMode ? 'mock_token' : await user.getIdToken();
    const response = await fetch('/api/admin/stats', {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });
    const data = await response.json();
    if (response.ok && data.success) {
      populateStats(data.stats);
    } else {
      console.error('Failed to load stats:', data.message);
      loadMockTelemetry();
    }
  } catch (err) {
    console.error('Error loading telemetry:', err);
    loadMockTelemetry();
  }
}

function populateStats(stats) {
  // General stats
  document.getElementById('total-platform-scans').textContent = stats.totalAnalyses;
  document.getElementById('total-registered-users').textContent = stats.totalUsers;
  
  // Populate scans table
  const scansBody = document.getElementById('platform-scans-list');
  scansBody.innerHTML = '';
  if (stats.recentAnalyses && stats.recentAnalyses.length > 0) {
    stats.recentAnalyses.forEach(analysis => {
      const tr = document.createElement('tr');
      tr.className = 'admin-table-row';
      tr.style.borderBottom = '1px solid var(--border-color)';
      tr.innerHTML = `
        <td style="padding: 1rem; color: var(--text-main); font-weight: 500;">${escapeHTML(analysis.resumeName)}</td>
        <td style="padding: 1rem; color: var(--text-muted);">${escapeHTML(analysis.targetRole)}</td>
        <td style="padding: 1rem; text-align: center;">
          <span class="score-badge ${getScoreClass(analysis.score)}" style="padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 700;">
            ${analysis.score}/100
          </span>
        </td>
        <td style="padding: 1rem; color: var(--text-muted); text-align: right;">${new Date(analysis.createdAt).toLocaleString()}</td>
      `;
      scansBody.appendChild(tr);
    });
  } else {
    scansBody.innerHTML = `<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">No recent scans recorded on the platform.</td></tr>`;
  }
}

function loadMockTelemetry() {
  // Mock data fallback
  const mockStats = {
    totalAnalyses: 124,
    totalUsers: 48,
    recentAnalyses: [
      { resumeName: 'Naman_PM_Resume.pdf', targetRole: 'Product Manager', score: 92, createdAt: Date.now() - 3600000 },
      { resumeName: 'Alice_SDE3_Backend.pdf', targetRole: 'Software Engineer', score: 81, createdAt: Date.now() - 7200000 },
      { resumeName: 'Bob_DevOps_Specialist.pdf', targetRole: 'DevOps Architect', score: 74, createdAt: Date.now() - 86400000 },
      { resumeName: 'Carol_UI_UX_Designer.pdf', targetRole: 'Product Designer', score: 88, createdAt: Date.now() - 172800000 }
    ]
  };
  populateStats(mockStats);
}

function getScoreClass(score) {
  if (score >= 85) return 'gold';
  if (score >= 70) return 'emerald';
  return 'blue';
}

// ==========================================
// SHARED UTILITIES
// ==========================================

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeHTMLDir(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Helper to escape JavaScript strings for data attributes
function escapeJSString(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

// ==========================================
// BODY SCRIPT: Sidebar, tabs, audit logs, users, guardrails, simulation, issue reports
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Sidebar tab switching engine
  const sidebarLinks = document.querySelectorAll('.admin-menu-link');
  const viewPanes = document.querySelectorAll('.admin-view-pane');
  const navbarTitle = document.getElementById('navbar-view-title');

  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = link.getAttribute('data-tab');

      // Toggle link active class
      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // Toggle view pane active class
      viewPanes.forEach(pane => {
        if (pane.id === `view-${targetTab}`) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });

      // Hot refresh telemetry / data tables on active tab transitions
      if (targetTab === 'report-audit-logs') {
        loadReportAuditLogs();
      } else if (targetTab === 'user-directory') {
        loadUserDirectory();
      } else if (targetTab === 'security-guardrails') {
        loadGuardrailsConfig();
      } else if (targetTab === 'platform-operations') {
        if (auth.currentUser) loadTelemetryData(auth.currentUser);
      } else if (targetTab === 'user-issue-reports') {
        loadUserIssueReports();
      }

      // Update Top Control Navbar Title
      navbarTitle.textContent = link.textContent.trim();

      // Close mobile sidebar if open
      closeMobileSidebar();
    });
  });

  // 2. Responsive Mobile Hamburger triggers
  const hamburgerBtn = document.getElementById('admin-hamburger-btn');
  const sidebar = document.getElementById('admin-sidebar');
  const overlay = document.getElementById('admin-sidebar-overlay');

  if (hamburgerBtn && sidebar && overlay) {
    hamburgerBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('mobile-open');
    });

    overlay.addEventListener('click', closeMobileSidebar);
  }

  function closeMobileSidebar() {
    if (sidebar && overlay) {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('mobile-open');
    }
  }

  // 3. Bind admin logout
  const logoutBtn = document.getElementById('btn-admin-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (!isMockMode) {
          await auth.signOut();
        }
        sessionStorage.clear();
        const mockParam = isMockMode ? '?mock=true' : '';
        window.location.href = `../index.html${mockParam}`;
      } catch (err) {
        console.error('Logout error:', err);
      }
    });
  }

  // 4. Report Run Audit Logs Controller — fetch, render, search, slide-out inspector
  let reportAuditData = []; // cache for filtering

  async function loadReportAuditLogs() {
    try {
      const idToken = isMockMode ? 'mock-token' : await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/scan-reports', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          renderReportTableFallback('Admin access required. Verify your account permissions.');
        } else {
          renderReportTableFallback('Server error loading reports. Try refreshing.');
        }
        return;
      }

      const data = await res.json();
      if (data && data.success) {
        reportAuditData = data.reports || [];
        renderReportTable(reportAuditData);
      } else {
        renderReportTableFallback('Server error loading reports. Try refreshing.');
      }
    } catch (err) {
      console.error('Report audit fetch error:', err);
      renderReportTableFallback('Cannot reach server. Check your connection.');
    }
  }

  function renderReportTableFallback(message = 'Unable to load platform report runs. Check server connectivity.') {
    const tbody = document.getElementById('report-audit-list');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="padding: 3rem; text-align: center; color: var(--text-muted);">${escapeHTML(message)}</td></tr>`;
    const countLabel = document.getElementById('report-count-label');
    if (countLabel) countLabel.textContent = 'Error loading reports';
  }

  function renderReportTable(reports) {
    const tbody = document.getElementById('report-audit-list');
    const countLabel = document.getElementById('report-count-label');
    if (!tbody) return;

    if (countLabel) countLabel.textContent = `${reports.length} report run${reports.length !== 1 ? 's' : ''} recorded`;

    if (reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding: 3rem; text-align: center; color: var(--text-muted);">No recent scans recorded on the platform.</td></tr>`;
      return;
    }

    tbody.innerHTML = reports.map(r => {
      let scoreColor = 'var(--rose)';
      if (r.score >= 70) {
        scoreColor = 'var(--emerald)';
      } else if (r.score >= 40) {
        scoreColor = '#f59e0b';
      }

      const identityHTML = r.userId === 'anonymous'
        ? `<span>anonymous</span>`
        : `<span>${escapeHTML(r.userId)}</span>
           <br>
           <span class="muted">${escapeHTML(r.userEmail || 'email unavailable')}</span>`;

      return `
        <tr style="border-bottom: 1px solid var(--border-color);" class="admin-table-row">
          <td style="padding: 1rem; font-family: 'Fira Code', monospace; font-size: 0.85rem; font-weight: 700; color: var(--rose);">${escapeHTML(r.analysisId)}</td>
          <td style="padding: 1rem; color: var(--text-main); font-weight: 500;">
            ${identityHTML}
          </td>
          <td style="padding: 1rem; color: var(--text-muted);">${escapeHTML(r.targetRole || '')}</td>
          <td style="padding: 1rem; text-align: center;">
            <span style="color: ${scoreColor}; font-weight: 700;">${r.score || 0}/100</span>
          </td>
          <td style="padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">${formatTimeAgo(r.createdAt)}</td>
          <td style="padding: 1rem; text-align: right;">
            <button class="inspect-report-btn" data-id="${escapeHTML(r.analysisId)}">View Full Report</button>
          </td>
        </tr>`;
    }).join('');

    // Bind View Output buttons
    tbody.querySelectorAll('.inspect-report-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const reportId = btn.getAttribute('data-id');
        openReportInspector(reportId);
      });
    });
  }

  // Live search filter for reports
  const reportSearch = document.getElementById('report-search');
  if (reportSearch) {
    reportSearch.addEventListener('input', () => {
      const query = reportSearch.value.toLowerCase().trim();
      if (!query) {
        renderReportTable(reportAuditData);
        return;
      }
      const filtered = reportAuditData.filter(r =>
        (r.analysisId || '').toLowerCase().includes(query) ||
        (r.userEmail || '').toLowerCase().includes(query) ||
        (r.userDisplayName || '').toLowerCase().includes(query) ||
        (r.targetRole || '').toLowerCase().includes(query)
      );
      renderReportTable(filtered);
    });
  }

  // Report Inspector Controller
  const inspectorOverlay = document.getElementById('report-inspector-overlay');
  const inspectorClose = document.getElementById('report-inspector-close');
  const inspectorBody = document.getElementById('inspector-body-content');

  async function openReportInspector(id) {
    if (inspectorOverlay) inspectorOverlay.classList.add('open');
    
    // Show loading spinner in drawer
    if (inspectorBody) {
      inspectorBody.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; color: var(--text-muted);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1.5s linear infinite; color: var(--rose);"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
          <span>Fetching report analysis payload...</span>
        </div>`;
    }

    try {
      const idToken = isMockMode ? 'mock-token' : await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/scan-reports/${id}`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        renderInspectorContent(data.report);
      } else {
        inspectorBody.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--danger);">Failed to load report: ${escapeHTML(data.message)}</div>`;
      }
    } catch (err) {
      console.error('Inspector load error:', err);
      inspectorBody.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--danger);">Network error fetching report details.</div>`;
    }
  }

  function closeReportInspector() {
    if (inspectorOverlay) inspectorOverlay.classList.remove('open');
  }

  if (inspectorClose) {
    inspectorClose.addEventListener('click', closeReportInspector);
  }
  if (inspectorOverlay) {
    inspectorOverlay.addEventListener('click', (e) => {
      if (e.target === inspectorOverlay) closeReportInspector();
    });
  }

  function renderInspectorContent(report) {
    const titleEl = document.getElementById('inspector-resume-name');
    const subtitleEl = document.getElementById('inspector-meta-subtitle');
    if (titleEl) titleEl.textContent = report.resumeName || 'Resume Report';
    if (subtitleEl) {
      subtitleEl.textContent = `Uploaded by: ${report.email} | Target: ${report.targetRole} | Run ID: ${report.analysisId}`;
    }

    // Section A: Skill Gaps
    const missing = report.skillGap ? (report.skillGap.missingSkills || []) : [];
    let skillGapsHTML = '';
    if (missing.length > 0) {
      skillGapsHTML = `<div class="skill-gaps-grid">` + 
        missing.map(skill => `
          <div class="skill-gap-card">
            <svg class="skill-gap-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span class="skill-gap-name">${escapeHTML(skill)}</span>
          </div>
        `).join('') + `</div>`;
    } else {
      skillGapsHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; margin: 0; font-style: italic;">No core competency mismatches identified.</p>`;
    }

    // Section B: Interview Prep Questions
    let prep = report.interviewPrep || {};
    // If nested or alternative format
    if (report.interviewPrepList) prep = report.interviewPrepList;

    const categories = {
      'Technical Questions': prep.technical || [],
      'Project-Based Evaluation': prep.projectBased || [],
      'Domain & Skill Gaps': prep.skillGap || prep.domainKnowledge || [],
      'Behavioral Prompts': prep.behavioral || [],
      'HR & Career Path': prep.hrQuestions || []
    };

    let questionsHTML = '<div class="inspector-category-group">';
    let totalQuestions = 0;

    for (const [catName, list] of Object.entries(categories)) {
      if (list && list.length > 0) {
        totalQuestions += list.length;
        questionsHTML += `
          <div style="margin-top: 1rem;">
            <h4 class="inspector-category-title">${catName}</h4>
            <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem;">
              ${list.map((item, idx) => {
                let qText = '';
                let evidence = '';
                if (typeof item === 'string') {
                  qText = item;
                } else if (item && typeof item === 'object') {
                  qText = item.question || '';
                  evidence = item.source_evidence ? `Source justification: "${item.source_evidence}"` : '';
                }
                if (!qText) return '';

                return `
                  <div class="question-block-card">
                    <div class="question-block-content">
                      <span class="question-text-readOnly">${escapeHTML(qText)}</span>
                      ${evidence ? `<span class="question-meta-evidence">${escapeHTML(evidence)}</span>` : ''}
                    </div>
                    <button class="btn-copy-clipboard" title="Copy to clipboard" data-text="${escapeHTML(qText)}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      }
    }
    questionsHTML += '</div>';

    if (totalQuestions === 0) {
      questionsHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; margin: 0; font-style: italic;">No evaluation questions generated for this report.</p>`;
    }

    const scoreClass = (report.score || 0) < 80 ? 'bad' : '';

    // Render full layout inside drawer body
    inspectorBody.innerHTML = `
      <!-- Score Banner -->
      <div class="score-banner ${scoreClass}">
        <div class="score-banner-value">${report.score || 0}%</div>
        <div class="score-banner-label">
          Overall ATS Compatibility Score<br>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Evaluated via Gemini Prompt grounding parameters.</span>
        </div>
      </div>

      <!-- Section A: Skill Gaps Grid -->
      <div class="inspector-section">
        <h4 class="inspector-section-title">Section A: Identified Competency Skill Gaps</h4>
        ${skillGapsHTML}
      </div>

      <!-- Section B: Mirrored Interview Prep Questions -->
      <div class="inspector-section">
        <h4 class="inspector-section-title">Section B: Evaluation Interview Questions</h4>
        ${questionsHTML}
      </div>
    `;

    // Bind copy-to-clipboard buttons programmatically (CSP-safe, no inline onclick)
    inspectorBody.querySelectorAll('.btn-copy-clipboard').forEach(btn => {
      btn.addEventListener('click', () => {
        copyQuestionText(btn, btn.dataset.text);
      });
    });
  }

  // Clipboard logic
  function copyQuestionText(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('copied');
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--emerald);"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      }, 2000);
    }).catch(err => {
      console.error('Could not copy question text: ', err);
    });
  }

  // Expose globally for any remaining usage
  window.copyQuestionText = copyQuestionText;

  // Load report audit logs on init (deferred until auth state resolved)

  // 5. User Directory Controller — fetch, render, search, manage access
  let userDirectoryData = []; // cache for filtering

  async function loadUserDirectory() {
    try {
      const idToken = isMockMode ? 'mock-token' : await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        userDirectoryData = data.users;
        renderUserTable(userDirectoryData);
      } else {
        console.error('Failed to load users:', data.message);
        renderUserTableFallback();
      }
    } catch (err) {
      console.error('User directory fetch error:', err);
      renderUserTableFallback();
    }
  }

  function renderUserTableFallback() {
    // If the API call fails, show empty state
    const tbody = document.getElementById('user-directory-list');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="padding: 3rem; text-align: center; color: var(--text-muted);">Unable to load user directory. Check server connectivity.</td></tr>`;
    const countLabel = document.getElementById('user-count-label');
    if (countLabel) countLabel.textContent = '0 accounts registered';
  }

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ');
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }

  function formatJoinDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    const formatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    if (diff === 0) return `${formatted} (today)`;
    if (diff === 1) return `${formatted} (yesterday)`;
    return `${formatted} (${diff}d ago)`;
  }

  function renderUserTable(users) {
    const tbody = document.getElementById('user-directory-list');
    const countLabel = document.getElementById('user-count-label');
    if (!tbody) return;

    if (countLabel) countLabel.textContent = `${users.length} account${users.length !== 1 ? 's' : ''} registered`;

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding: 3rem; text-align: center; color: var(--text-muted);">No user accounts found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const initials = getInitials(u.displayName);
      const avatarContent = u.photoURL
        ? `<img src="${escapeHTMLDir(u.photoURL)}" alt="${escapeHTMLDir(u.displayName)}">`
        : initials;
      const tierClass = u.tier || 'free';
      
      const totalReportsVal = u.totalReports ?? 0;
      const highestScoreVal = u.highestScore;

      let reportsCellContent = '';
      if (totalReportsVal === 0) {
        reportsCellContent = `<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">No analyses run</span>`;
      } else {
        reportsCellContent = `<span style="font-weight: 700; color: var(--emerald); font-size: 0.95rem;">${totalReportsVal}</span>`;
      }

      let scoreCellContent = '';
      if (totalReportsVal === 0 || highestScoreVal === undefined || highestScoreVal === null) {
        scoreCellContent = `<span style="color: var(--text-muted); font-size: 0.85rem;">N/A</span>`;
      } else {
        const scoreColor = highestScoreVal >= 70 ? 'var(--emerald)' : (highestScoreVal >= 45 ? 'var(--warning)' : 'var(--text-muted)');
        scoreCellContent = `<span style="font-weight: 800; color: ${scoreColor}; font-size: 0.95rem;">${highestScoreVal}%</span>`;
      }

      return `
        <tr style="border-bottom: 1px solid var(--border-color);" class="admin-table-row"
            data-uid="${escapeHTMLDir(u.uid)}"
            data-name="${escapeHTMLDir(u.displayName)}"
            data-email="${escapeHTMLDir(u.email)}"
            data-tier="${escapeHTMLDir(tierClass)}"
            data-quota="${u.quota ?? 25}"
            data-domain="${escapeHTMLDir(u.domain || '')}">
          <td style="padding: 0.85rem 1rem;">
            <div class="user-identity-cell">
              <div class="user-avatar">${avatarContent}</div>
              <div class="user-identity-info">
                <span class="user-identity-name">${escapeHTMLDir(u.displayName)}</span>
                <span class="user-identity-email">${escapeHTMLDir(u.email)}</span>
              </div>
            </div>
          </td>
          <td style="padding: 0.85rem 1rem; vertical-align: middle;">
            <div style="display: inline-flex; align-items: center; gap: 0.35rem; background: rgba(0,0,0,0.25); padding: 0.3rem 0.5rem; border: 1px solid var(--border-color); border-radius: 6px;">
              <span style="color: var(--text-main); font-family: 'Fira Code', monospace; font-size: 0.75rem; letter-spacing: -0.01em;">${escapeHTMLDir(u.uid.substring(0, 8))}...</span>
              <button class="copy-uid-btn" data-copy="${escapeHTMLDir(u.uid)}" title="Copy Full UID" style="background: transparent; border: none; padding: 2px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; transition: color 0.15s ease;">
                <svg class="copy-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
          </td>
          <td style="padding: 0.85rem 1rem; color: var(--text-muted); font-size: 0.85rem; vertical-align: middle;">${formatJoinDate(u.createdAt)}</td>
          <td style="padding: 0.85rem 1rem; vertical-align: middle;">
            <span style="color: var(--text-main); font-size: 0.85rem;">${escapeHTMLDir(u.domain || '—')}</span>
            <span class="tier-badge ${tierClass}" style="margin-left: 0.5rem;">${tierClass}</span>
          </td>
          <td style="padding: 0.85rem 1rem; text-align: center; vertical-align: middle;">
            ${reportsCellContent}
          </td>
          <td style="padding: 0.85rem 1rem; text-align: center; vertical-align: middle;">
            ${scoreCellContent}
          </td>
          <td style="padding: 0.85rem 1rem; text-align: right; vertical-align: middle;">
            <button class="manage-access-btn" data-uid="${escapeHTMLDir(u.uid)}">Manage Access</button>
          </td>
        </tr>`;
    }).join('');

    // Bind Manage Access buttons
    tbody.querySelectorAll('.manage-access-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr');
        openQuotaDrawer({
          uid: row.dataset.uid,
          name: row.dataset.name,
          email: row.dataset.email,
          tier: row.dataset.tier,
          quota: parseInt(row.dataset.quota, 10),
          domain: row.dataset.domain
        });
      });
    });

    // Bind Copy UID buttons
    tbody.querySelectorAll('.copy-uid-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const textToCopy = btn.dataset.copy;
        navigator.clipboard.writeText(textToCopy).then(() => {
          // Micro checkmark feedback animation
          const origSVG = btn.innerHTML;
          btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          btn.style.color = 'var(--emerald)';
          setTimeout(() => {
            btn.innerHTML = origSVG;
            btn.style.color = 'var(--text-muted)';
          }, 1500);
        }).catch(err => {
          console.error('Failed to copy UID:', err);
        });
      });
    });
  }

  // Live search filter
  const userSearch = document.getElementById('user-search');
  if (userSearch) {
    userSearch.addEventListener('input', () => {
      const query = userSearch.value.toLowerCase().trim();
      if (!query) {
        renderUserTable(userDirectoryData);
        return;
      }
      const filtered = userDirectoryData.filter(u =>
        (u.displayName || '').toLowerCase().includes(query) ||
        (u.email || '').toLowerCase().includes(query) ||
        (u.uid || '').toLowerCase().includes(query) ||
        (u.domain || '').toLowerCase().includes(query)
      );
      renderUserTable(filtered);
    });
  }

  // Quota Drawer Controller
  const quotaOverlay = document.getElementById('quota-drawer-overlay');
  const quotaClose = document.getElementById('quota-drawer-close');
  const quotaCancel = document.getElementById('quota-drawer-cancel');
  const quotaSlider = document.getElementById('drawer-quota-slider');
  const quotaReadout = document.getElementById('quota-slider-readout');
  const applyBtn = document.getElementById('btn-apply-quota');

  function openQuotaDrawer(userData) {
    document.getElementById('drawer-user-uid').value = userData.uid;
    document.getElementById('drawer-user-name').textContent = userData.name;
    document.getElementById('drawer-user-email').textContent = userData.email;
    document.getElementById('drawer-user-avatar').textContent = getInitials(userData.name);
    document.getElementById('drawer-domain-input').value = userData.domain || '';

    // Set tier radio
    const tierRadio = document.querySelector(`input[name="drawer-tier"][value="${userData.tier || 'free'}"]`);
    if (tierRadio) tierRadio.checked = true;

    // Set quota slider
    if (quotaSlider) {
      quotaSlider.value = userData.quota || 25;
      if (quotaReadout) quotaReadout.textContent = userData.quota || 25;
    }

    if (quotaOverlay) quotaOverlay.classList.add('open');
  }

  function closeQuotaDrawer() {
    if (quotaOverlay) quotaOverlay.classList.remove('open');
  }

  if (quotaClose) quotaClose.addEventListener('click', closeQuotaDrawer);
  if (quotaCancel) quotaCancel.addEventListener('click', closeQuotaDrawer);
  if (quotaOverlay) {
    quotaOverlay.addEventListener('click', (e) => {
      if (e.target === quotaOverlay) closeQuotaDrawer();
    });
  }

  // Quota slider readout sync
  if (quotaSlider && quotaReadout) {
    quotaSlider.addEventListener('input', () => {
      quotaReadout.textContent = quotaSlider.value;
    });
  }

  // Apply Changes submission
  if (applyBtn) {
    applyBtn.addEventListener('click', async () => {
      const uid = document.getElementById('drawer-user-uid').value;
      const tierEl = document.querySelector('input[name="drawer-tier"]:checked');
      const tier = tierEl ? tierEl.value : 'free';
      const quota = parseInt(quotaSlider.value, 10);
      const domain = document.getElementById('drawer-domain-input').value.trim();

      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying...';

      try {
        const idToken = isMockMode ? 'mock-token' : await auth.currentUser.getIdToken();
        const res = await fetch(`/api/admin/users/${uid}/quota`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ tier, quota, domain })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          // Update local cache
          const user = userDirectoryData.find(u => u.uid === uid);
          if (user) {
            user.tier = tier;
            user.quota = quota;
            user.domain = domain;
          }
          // Re-render and close
          renderUserTable(userDirectoryData);
          closeQuotaDrawer();
        } else {
          alert(`Error: ${data.message || 'Failed to apply changes.'}`);
        }
      } catch (err) {
        console.error('Quota update error:', err);
        alert('Network error while applying changes.');
      } finally {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply Changes';
      }
    });
  }

  // Load user directory on init (deferred until auth state resolved)

  // 6. Interactive Live Engine Simulation Sandbox Logic
  const uploadsSlider = document.getElementById('sim-active-uploads');
  const coresSlider = document.getElementById('sim-worker-cores');
  const uploadsValue = document.getElementById('slider-uploads-value');
  const coresValue = document.getElementById('slider-cores-value');
  const loadRatioVal = document.getElementById('sim-load-ratio');
  const responseLatencyVal = document.getElementById('sim-response-latency');
  const warningLight = document.getElementById('sim-warning-light');
  const statusTitle = document.getElementById('sim-status-title');
  const coresGrid = document.getElementById('sim-cores-grid');
  const logTerminal = document.getElementById('sim-log-terminal');

  // KPIs elements on Platform Operations
  const kpiPipelineQueue = document.getElementById('kpi-pipeline-queue');
  const kpiActiveNodes = document.getElementById('kpi-active-nodes');

  if (uploadsSlider && coresSlider) {
    const updateSimulation = () => {
      const uploads = parseInt(uploadsSlider.value);
      const cores = parseInt(coresSlider.value);

      // Save to localStorage automatically to persist across page refreshes
      localStorage.setItem('admin_sim_active_uploads', uploads);
      localStorage.setItem('admin_sim_worker_cores', cores);

      // Update sliders label display
      uploadsValue.textContent = uploads;
      coresValue.textContent = `${cores} core${cores > 1 ? 's' : ''}`;

      // Calculation Ratio (Load Index)
      const loadRatio = (uploads / cores).toFixed(2);
      // Latency Calculation (0.5s baseline + 0.15s per ratio unit)
      const latency = (0.5 + 0.15 * parseFloat(loadRatio)).toFixed(2);

      loadRatioVal.textContent = loadRatio;
      responseLatencyVal.textContent = `${latency}s`;

      // Is warning threshold crossed?
      const isWarning = parseFloat(loadRatio) > 6.0;

      // Update light status indicator and title
      if (isWarning) {
        warningLight.className = 'warning-light-saturated';
        statusTitle.textContent = 'Pipeline Status: Saturated (Backpressure)';
        statusTitle.style.color = 'var(--danger)';
      } else {
        warningLight.className = 'warning-light-resting';
        statusTitle.textContent = 'Pipeline Status: Optimal';
        statusTitle.style.color = '#ffffff';
      }

      // Sync KPIs with simulation values for high fidelity dynamic feedback
      if (kpiPipelineQueue) {
        kpiPipelineQueue.textContent = uploads;
      }
      if (kpiActiveNodes) {
        kpiActiveNodes.textContent = `${cores} active`;
      }

      // Render thread cores grid
      coresGrid.innerHTML = '';
      for (let i = 1; i <= 16; i++) {
        const coreDiv = document.createElement('div');
        coreDiv.className = `core-node ${i <= cores ? (isWarning ? 'active-saturated' : 'active-resting') : 'inactive'}`;
        coreDiv.textContent = `C${i}`;
        coresGrid.appendChild(coreDiv);
      }

      // Prepend logs to log terminal
      const now = new Date();
      const timestamp = now.toTimeString().split(' ')[0];
      const logMsg = document.createElement('div');
      
      if (isWarning) {
        logMsg.innerHTML = `<span style="color: var(--text-muted);">[${timestamp}]</span> <span style="color: var(--danger); font-weight: 700;">WARN</span> Ratio: ${loadRatio} | Latency: ${latency}s | Backpressure trigger`;
      } else {
        logMsg.innerHTML = `<span style="color: var(--text-muted);">[${timestamp}]</span> <span style="color: var(--emerald);">OK</span> Ratio: ${loadRatio} | Latency: ${latency}s | Normal operation`;
      }
      
      logTerminal.insertBefore(logMsg, logTerminal.firstChild);

      // Truncate logs to keep it clean (max 15 lines)
      while (logTerminal.children.length > 15) {
        logTerminal.removeChild(logTerminal.lastChild);
      }
    };

    // Bind event listeners to range inputs
    uploadsSlider.addEventListener('input', updateSimulation);
    coresSlider.addEventListener('input', updateSimulation);

    // Load from localStorage if present before running initial simulation population
    const savedUploads = localStorage.getItem('admin_sim_active_uploads');
    const savedCores = localStorage.getItem('admin_sim_worker_cores');
    if (savedUploads !== null) {
      uploadsSlider.value = savedUploads;
    }
    if (savedCores !== null) {
      coresSlider.value = savedCores;
    }

    // Run once initially to populate
    updateSimulation();
  }

  // 7. Security Guardrails Logic — fetch, range slide sync, deploy form submission
  const mModeCheckbox = document.getElementById('guardrail-maintenance');
  const rLimitSlider = document.getElementById('guardrail-rate-limit');
  const rLimitReadout = document.getElementById('rate-limiter-value');
  const fSizeSelector = document.getElementById('guardrail-file-size');
  const deployBtn = document.getElementById('btn-deploy-guardrails');

  async function loadGuardrailsConfig() {
    try {
      const idToken = isMockMode ? 'mock-token' : await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/guardrails', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success && data.config) {
        const config = data.config;
        if (mModeCheckbox) mModeCheckbox.checked = !!config.maintenanceMode;
        if (rLimitSlider) {
          rLimitSlider.value = config.rateLimitMax || 60;
          if (rLimitReadout) rLimitReadout.textContent = `${config.rateLimitMax || 60} req/min`;
        }
        if (fSizeSelector) {
          fSizeSelector.value = config.maxFileSize || 5242880;
        }
      }
    } catch (err) {
      console.error('Failed to load active guardrails configuration:', err);
    }
  }

  // Sync readout when range slider is dragged
  if (rLimitSlider && rLimitReadout) {
    rLimitSlider.addEventListener('input', () => {
      rLimitReadout.textContent = `${rLimitSlider.value} req/min`;
    });
  }

  // Deploy guardrails to server
  if (deployBtn) {
    deployBtn.addEventListener('click', async () => {
      const maintenanceMode = !!mModeCheckbox.checked;
      const rateLimitMax = parseInt(rLimitSlider.value, 10);
      const maxFileSize = parseInt(fSizeSelector.value, 10);

      deployBtn.disabled = true;
      deployBtn.innerHTML = `<span>⚙️</span> Deploying Parameters...`;

      try {
        const idToken = isMockMode ? 'mock-token' : await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/guardrails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ maintenanceMode, rateLimitMax, maxFileSize })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showAdminToast('Security guardrails deployed and active.');
        } else {
          alert(`Error: ${data.message || 'Failed to deploy guardrail parameters.'}`);
        }
      } catch (err) {
        console.error('Guardrails deploy error:', err);
        alert('Network error while deploying parameters.');
      } finally {
        deployBtn.disabled = false;
        deployBtn.innerHTML = `<span>⚡</span> Deploy Guardrail Parameters`;
      }
    });
  }

  // Helper to display toast notifications inside the admin panel
  function showAdminToast(message) {
    const toast = document.getElementById('toast-notification');
    const msgEl = document.getElementById('toast-message');
    if (toast && msgEl) {
      msgEl.textContent = message;
      toast.style.display = 'block';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 3000);
    } else {
      alert(message);
    }
  }

  // User Issue Reports Controller
  let issueReportsData = [];
  let activeIssueFilter = 'all';

  async function loadUserIssueReports() {
    const listDiv = document.getElementById('issue-reports-list');
    if (listDiv) {
      listDiv.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);">Loading user reports...</div>';
    }

    try {
      const idToken = isMockMode ? 'mock-token' : await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/reports', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        issueReportsData = data.reports || [];
        renderIssueReports();
      } else {
        console.error('Failed to load user reports:', data.message);
        renderIssueReportsFallback();
      }
    } catch (err) {
      console.error('User reports fetch error:', err);
      renderIssueReportsFallback();
    }
  }

  function renderIssueReportsFallback() {
    const listDiv = document.getElementById('issue-reports-list');
    if (!listDiv) return;
    listDiv.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--rose); font-weight: 600;">Unable to load reports right now. Try refreshing the page.</div>';
  }

  function renderIssueReports() {
    const listDiv = document.getElementById('issue-reports-list');
    if (!listDiv) return;

    // Filter data client-side
    const filtered = issueReportsData.filter(r => {
      if (activeIssueFilter === 'open') return r.status === 'open';
      if (activeIssueFilter === 'resolved') return r.status === 'resolved';
      return true;
    });

    if (filtered.length === 0) {
      listDiv.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-muted); background: rgba(0,0,0,0.1); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">No ${activeIssueFilter !== 'all' ? activeIssueFilter + ' ' : ''}reports found.</div>`;
      return;
    }

    listDiv.innerHTML = '';
    filtered.forEach(report => {
      const card = document.createElement('div');
      card.className = 'admin-card-glass';
      card.style.cssText = 'padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; border-radius: var(--radius-lg);';
      
      // Prettify timestamp
      let timeStr = 'N/A';
      if (report.createdAt) {
        const date = new Date(report.createdAt);
        const now = Date.now();
        const diffMin = Math.round((now - report.createdAt) / (60 * 1000));
        if (diffMin < 1) timeStr = 'just now';
        else if (diffMin < 60) timeStr = `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
        else {
          const diffHr = Math.round(diffMin / 60);
          if (diffHr < 24) timeStr = `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
          else {
            timeStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + ' at ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          }
        }
      }

      // Prettify type badge style
      let typeColor = 'var(--text-muted)';
      if (report.issueType === 'Bug') typeColor = '#f43f5e';
      else if (report.issueType === 'Wrong Analysis') typeColor = '#f59e0b';
      else if (report.issueType === 'UI Problem') typeColor = '#3b82f6';
      else if (report.issueType === 'Account Issue') typeColor = '#10b981';

      // Status badge
      const statusBadge = report.status === 'open' 
        ? `<span style="padding: 0.25rem 0.5rem; background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Open</span>`
        : `<span style="padding: 0.25rem 0.5rem; background: rgba(255,255,255,0.03); color: var(--text-muted); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Resolved</span>`;

      const resolveBtn = report.status === 'open'
        ? `<button class="btn-resolve-report btn-cta-secondary" data-id="${report.reportId}" style="padding: 0.5rem 1rem; border-radius: var(--radius-md); font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">Mark Resolved</button>`
        : '';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: #fff;">${escapeHTML(report.userName || 'Anonymous')}</h4>
            <p style="margin: 0.15rem 0 0 0; font-size: 0.8rem; color: var(--text-muted);">${escapeHTML(report.userEmail)} • <span style="font-family: monospace; font-size: 0.75rem;">${report.uid}</span></p>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="padding: 0.25rem 0.5rem; background: ${typeColor}15; color: ${typeColor}; border: 1px solid ${typeColor}25; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">${escapeHTML(report.issueType)}</span>
            ${statusBadge}
          </div>
        </div>
        
        <p style="margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--text-main); white-space: pre-wrap; background: rgba(0,0,0,0.15); padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md);">${escapeHTML(report.issueDescription)}</p>
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: 0.25rem;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">Submitted ${timeStr}</span>
          ${resolveBtn}
        </div>
      `;
      
      listDiv.appendChild(card);
    });

    // Attach event listeners to Mark Resolved buttons
    document.querySelectorAll('.btn-resolve-report').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const reportId = btn.getAttribute('data-id');
        await resolveIssueReport(reportId, btn);
      });
    });
  }

  async function resolveIssueReport(reportId, buttonEl) {
    if (!reportId) return;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Resolving...';

    try {
      const idToken = isMockMode ? 'mock-token' : await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/reports/${reportId}/resolve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Find and update in cache list
        const foundIdx = issueReportsData.findIndex(r => r.reportId === reportId);
        if (foundIdx !== -1) {
          issueReportsData[foundIdx].status = 'resolved';
        }
        renderIssueReports();
      } else {
        console.error('Failed to resolve report:', data.message);
        buttonEl.disabled = false;
        buttonEl.textContent = 'Mark Resolved';
      }
    } catch (err) {
      console.error('Resolve error:', err);
      buttonEl.disabled = false;
      buttonEl.textContent = 'Mark Resolved';
    }
  }

  // Attach filter buttons click event
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
        b.style.color = 'var(--text-muted)';
        b.style.background = 'none';
      });
      btn.classList.add('active');
      btn.style.color = 'var(--text-main)';
      btn.style.background = 'rgba(255,255,255,0.05)';
      
      activeIssueFilter = btn.getAttribute('data-filter');
      renderIssueReports();
    });
  });

  // Defer loading active config and initial dashboard data until auth state resolved
  auth.onAuthStateChanged((user) => {
    if (user || isMockMode) {
      loadReportAuditLogs();
      loadUserDirectory();
      loadGuardrailsConfig();
    }
  });
});
