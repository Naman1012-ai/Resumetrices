import { auth, isMockMode } from './firebase-config.js';
import { FirebaseService } from './api.js';
import { escapeHTML, formatTimeAgo, getStatusBadge, showToast } from './utils.js';

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
    const x = trends.length === 1 ? (xStart + chartWidth / 2) : (xStart + (index / (trends.length - 1)) * chartWidth);
    const y = yEnd - (item.score / 100) * chartHeight;
    
    if (index === 0) {
      pathD = `M ${x} ${y}`;
      areaD = `M ${x} ${yEnd} L ${x} ${y}`;
    } else {
      pathD += ` L ${x} ${y}`;
      areaD += ` L ${x} ${y}`;
    }
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '5');
    circle.setAttribute('class', 'chart-point');
    
    circle.addEventListener('mouseenter', () => {
      showChartTooltip(x, y - 12, `${item.score}%`);
    });
    circle.addEventListener('mouseleave', () => {
      hideChartTooltip();
    });
    
    chartPoints.appendChild(circle);
    
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
  
  const lastX = trends.length === 1 ? (xStart + chartWidth / 2) : (xStart + chartWidth);
  areaD += ` L ${lastX} ${yEnd} Z`;
  
  chartLine.setAttribute('d', pathD);
  chartArea.setAttribute('d', areaD);
}

// Global hook for inline onclick actions in dynamically injected table rows
window.viewHistoryItemFromDashboard = function(analysisId) {
  const mockParam = isMockMode ? '&mock=true' : '';
  window.location.href = `analysis.html?id=${analysisId}${mockParam}`;
};

async function loadDashboardData() {
  const statsTotalResumes = document.getElementById('stats-total-resumes');
  const statsHighestScore = document.getElementById('stats-highest-score');
  const statsAverageScore = document.getElementById('stats-average-score');
  const statsLastAnalysisName = document.getElementById('stats-last-analysis-name');
  const statsLastAnalysisTime = document.getElementById('stats-last-analysis-time');

  if (statsTotalResumes) statsTotalResumes.innerHTML = '<span class="skeleton-inline animate-pulse" style="width: 2rem;"></span>';
  if (statsHighestScore) statsHighestScore.innerHTML = '<span class="skeleton-inline animate-pulse" style="width: 4rem;"></span>';
  if (statsAverageScore) statsAverageScore.innerHTML = '<span class="skeleton-inline animate-pulse" style="width: 3rem;"></span>';
  if (statsLastAnalysisName) statsLastAnalysisName.innerHTML = '<span class="skeleton-inline animate-pulse" style="width: 5rem;"></span>';

  try {
    const stats = await FirebaseService.getDashboardStats();
    
    if (statsTotalResumes) statsTotalResumes.textContent = stats.totalAnalyses;
    if (statsHighestScore) statsHighestScore.textContent = `${stats.highestScore}/100`;
    if (statsAverageScore) statsAverageScore.textContent = `${stats.averageScore}%`;

    const statsMostTargetedRole = document.getElementById('stats-most-targeted-role');
    if (statsMostTargetedRole) {
      statsMostTargetedRole.textContent = stats.mostTargetedRole || 'None';
    }

    if (stats.recentAnalysis) {
      if (statsLastAnalysisName) {
        statsLastAnalysisName.textContent = stats.recentAnalysis.resumeName || 'Unknown';
      }
      if (statsLastAnalysisTime) {
        statsLastAnalysisTime.textContent = formatTimeAgo(stats.recentAnalysis.createdAt);
      }
      
      const lastAnalysisLink = document.getElementById('kpi-last-analysis-link');
      if (lastAnalysisLink && stats.recentAnalysis.analysisId) {
        const mockParam = isMockMode ? '&mock=true' : '';
        lastAnalysisLink.href = `analysis.html?id=${stats.recentAnalysis.analysisId}${mockParam}`;
      }
    } else {
      if (statsLastAnalysisName) statsLastAnalysisName.textContent = 'None';
      if (statsLastAnalysisTime) statsLastAnalysisTime.textContent = 'No analyses yet';
    }

    const avgLink = document.getElementById('kpi-average-score-link');
    if (avgLink) {
      avgLink.addEventListener('click', (e) => {
        e.preventDefault();
        const chartPanel = document.getElementById('trend-panel-ref');
        if (chartPanel) chartPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    const elEmptyStateBanner = document.getElementById('dashboard-empty-state-banner');
    const elDashboardMainContent = document.getElementById('dashboard-main-content');

    if (stats.totalAnalyses === 0) {
      if (elEmptyStateBanner) elEmptyStateBanner.style.display = 'block';
      if (elDashboardMainContent) elDashboardMainContent.style.display = 'none';
    } else {
      if (elEmptyStateBanner) elEmptyStateBanner.style.display = 'none';
      if (elDashboardMainContent) elDashboardMainContent.style.display = 'block';
    }

    // Populate History Table
    const summaryBody = document.getElementById('dashboard-history-summary-body');
    if (summaryBody) {
      summaryBody.innerHTML = '';
      if (stats.historySummary && stats.historySummary.length > 0) {
        stats.historySummary.slice(0, 5).forEach(item => {
          const tr = document.createElement('tr');
          const dateStr = formatTimeAgo(item.createdAt);
          
          tr.innerHTML = `
            <td style="padding: 0.85rem 0.5rem; border-bottom: 1px solid var(--border-color); font-weight: 500;">${escapeHTML(item.resumeName)}</td>
            <td style="padding: 0.85rem 0.5rem; border-bottom: 1px solid var(--border-color); color: var(--emerald); font-weight: 600;">${escapeHTML(item.targetRole)}</td>
            <td style="padding: 0.85rem 0.5rem; border-bottom: 1px solid var(--border-color); color: var(--text-muted);">${dateStr}</td>
            <td style="padding: 0.85rem 0.5rem; border-bottom: 1px solid var(--border-color); font-weight: 700;">${item.score}/100</td>
            <td style="padding: 0.85rem 0.5rem; border-bottom: 1px solid var(--border-color);">${getStatusBadge(item.score, item, item.weights)}</td>
          `;
          summaryBody.appendChild(tr);
        });
      } else {
        summaryBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted); font-style: italic;">No analyses processed yet.</td></tr>';
      }
    }

    // Populate Activity Feed
    const activityList = document.getElementById('dashboard-activity-feed-list');
    if (activityList) {
      activityList.innerHTML = '';
      if (stats.recentAnalysis) {
        const timeAgo = formatTimeAgo(stats.recentAnalysis.createdAt);
        const events = [
          { dot: 'blue', text: `Uploaded resume: <strong>${escapeHTML(stats.recentAnalysis.resumeName)}</strong>`, time: timeAgo },
          { dot: 'emerald', text: `ATS Score of <strong>${stats.recentAnalysis.score}/100</strong> processed`, time: timeAgo },
          { dot: 'purple', text: `Skill Gap analysis for <strong>${escapeHTML(stats.recentAnalysis.targetRole)}</strong>`, time: timeAgo },
          { dot: 'amber', text: `Interview Prep questions generated`, time: timeAgo }
        ];

        events.forEach(ev => {
          const div = document.createElement('div');
          div.className = 'activity-item';
          div.innerHTML = `
            <div class="activity-dot ${ev.dot}"></div>
            <div class="activity-content">
              <div>${ev.text}</div>
              <div class="activity-time">${ev.time}</div>
            </div>
          `;
          activityList.appendChild(div);
        });
      } else {
        activityList.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; text-align: center; padding: 1rem 0;">No activity yet.</div>';
      }
    }

    // Set Welcome Display Name
    const welcomeUsername = document.getElementById('welcome-username');
    if (welcomeUsername && auth.currentUser) {
      welcomeUsername.textContent = auth.currentUser.displayName || auth.currentUser.email.split('@')[0];
    }

    // Populate trend charts
    const trends = stats.trends || [];
    drawTrendChart(trends);

  } catch (error) {
    console.error('Error loading dashboard stats:', error);
    showToast('Error loading dashboard statistics.', 'error');
  }
}

function showRecoveryFailureBanner() {
  const container = document.getElementById('recovery-banner-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="recovery-banner" style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; background: rgba(244, 63, 94, 0.08); border: 1px solid rgba(244, 63, 94, 0.2); border-radius: var(--radius-lg, 12px); margin-top: 1.5rem; margin-bottom: 0.5rem; transition: all 0.3s ease;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 1.25rem;">⚠️</span>
        <span style="font-size: 0.9rem; font-weight: 600; color: var(--text-main); line-height: 1.5;">
          We couldn't recover your previous analysis. Please re-upload your resume to run a new scan.
        </span>
      </div>
      <button onclick="this.parentElement.style.display='none'" style="background: none; border: none; color: var(--text-muted); font-size: 1.2rem; cursor: pointer; padding: 0.25rem; display: flex; align-items: center; justify-content: center; transition: color 0.2s;" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'">
        ✕
      </button>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  auth.onAuthStateChanged(async (user) => {
    if (user || isMockMode) {
      const urlParams = new URLSearchParams(window.location.search);
      const isAnonRedirect = urlParams.get('source') === 'anonymous';
      const pendingAnalysisId = sessionStorage.getItem('pendingAnalysisId');

      if (isAnonRedirect || pendingAnalysisId) {
        if (pendingAnalysisId && user) {
          try {
            const idToken = await user.getIdToken();
            const response = await fetch(`${FirebaseService.getApiBase()}/analysis/claim`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
              },
              body: JSON.stringify({ sessionId: pendingAnalysisId })
            });
            const result = await response.json();
            if (response.ok) {
              showToast('Previous analysis recovered successfully!', 'success');
            } else {
              showRecoveryFailureBanner();
            }
          } catch (claimErr) {
            console.error('Failed to claim anonymous analysis:', claimErr);
            showRecoveryFailureBanner();
          } finally {
            sessionStorage.removeItem('pendingAnalysisId');
            sessionStorage.removeItem('pendingAnalysisSource');
          }
        } else {
          // sessionStorage is empty or user is null (different device/browser or expired storage)
          showRecoveryFailureBanner();
        }
      }

      loadDashboardData();
    }
  });

  // Issue Modal logic
  const triggerBtn = document.getElementById('btn-trigger-report-issue');
  const modalOverlay = document.getElementById('issue-modal-overlay');
  const cancelBtn = document.getElementById('btn-cancel-issue');
  const closeSuccessBtn = document.getElementById('btn-close-issue-success');
  const issueForm = document.getElementById('issue-report-form');
  const issueTypeSelect = document.getElementById('issue-type');
  const issueDescTextarea = document.getElementById('issue-description');
  const charCountSpan = document.getElementById('issue-char-count');
  const submitBtn = document.getElementById('btn-submit-issue');
  const errorMsgDiv = document.getElementById('issue-error-msg');
  const formView = document.getElementById('issue-form-view');
  const successView = document.getElementById('issue-success-view');

  let isSubmitting = false;

  const openModal = () => {
    if (modalOverlay) modalOverlay.style.display = 'flex';
    if (issueDescTextarea) {
      issueDescTextarea.value = '';
      issueDescTextarea.focus();
    }
    if (charCountSpan) charCountSpan.textContent = '0';
    if (errorMsgDiv) {
      errorMsgDiv.style.display = 'none';
      errorMsgDiv.textContent = '';
    }
    if (formView) formView.style.display = 'block';
    if (successView) successView.style.display = 'none';
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Report';
    }
    if (cancelBtn) cancelBtn.disabled = false;
  };

  const closeModal = () => {
    if (isSubmitting) return; // Cannot close mid-submission
    if (modalOverlay) modalOverlay.style.display = 'none';
  };

  if (triggerBtn) {
    triggerBtn.addEventListener('click', openModal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  if (closeSuccessBtn) {
    closeSuccessBtn.addEventListener('click', () => {
      if (modalOverlay) modalOverlay.style.display = 'none';
    });
  }

  if (issueDescTextarea) {
    issueDescTextarea.addEventListener('input', () => {
      const len = issueDescTextarea.value.length;
      if (charCountSpan) charCountSpan.textContent = len.toString();
    });
  }

  // Handle escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay && modalOverlay.style.display === 'flex') {
      closeModal();
    }
  });

  if (issueForm) {
    issueForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const issueType = issueTypeSelect ? issueTypeSelect.value : 'Bug';
      const issueDescription = issueDescTextarea ? issueDescTextarea.value : '';

      if (issueDescription.length < 10 || issueDescription.length > 1000) {
        if (errorMsgDiv) {
          errorMsgDiv.textContent = 'Description must be between 10 and 1000 characters.';
          errorMsgDiv.style.display = 'block';
        }
        return;
      }

      isSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }
      if (cancelBtn) cancelBtn.disabled = true;
      if (errorMsgDiv) {
        errorMsgDiv.style.display = 'none';
        errorMsgDiv.textContent = '';
      }

      try {
        const idToken = isMockMode ? 'mock-token' : await auth.currentUser.getIdToken();
        const response = await fetch(`${FirebaseService.getApiBase()}/report-issue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ issueType, issueDescription })
        });

        const result = await response.json();
        if (response.ok && result.success) {
          if (formView) formView.style.display = 'none';
          if (successView) successView.style.display = 'block';
        } else {
          let errorText = 'Something went wrong. Please try again.';
          if (response.status === 429) {
            errorText = "You've already submitted a report recently. Please try again later.";
          }
          if (errorMsgDiv) {
            errorMsgDiv.textContent = errorText;
            errorMsgDiv.style.display = 'block';
          }
        }
      } catch (err) {
        console.error('Issue report error:', err);
        if (errorMsgDiv) {
          errorMsgDiv.textContent = 'Something went wrong. Please try again.';
          errorMsgDiv.style.display = 'block';
        }
      } finally {
        isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Report';
        }
        if (cancelBtn) cancelBtn.disabled = false;
      }
    });
  }
});
