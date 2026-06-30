import { auth, isMockMode } from './firebase-config.js';
import { FirebaseService } from './api.js';
import { escapeHTML, showToast } from './utils.js';

async function renderRoadmapReport(analysis) {
  // 1. Populate Dedicated Report Header Bar
  const rhName = document.getElementById('report-header-name');
  const rhRole = document.getElementById('report-header-role');
  const rhDate = document.getElementById('report-header-date');
  const rhScore = document.getElementById('report-header-score');
  const rhBadge = document.getElementById('report-header-badge');

  const score = analysis.score || 0;

  if (rhName) rhName.textContent = analysis.resumeName || 'Resume';
  if (rhRole) rhRole.textContent = `Target Role: ${analysis.targetRole || 'Not Specified'}`;
  if (rhDate) {
    const dateVal = analysis.createdAt ? new Date(analysis.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
    rhDate.textContent = `Parsed ${dateVal}`;
  }
  if (rhScore) rhScore.textContent = `${score}/100`;

  let state = '';
  let statusText = '';
  let bannerText = '';
  let color = '';
  let borderColor = '';
  let bg = '';

  if (score < 40) {
    state = 'CRITICAL_GAP';
    statusText = 'Compatibility: Critical';
    bannerText = 'COMPATIBILITY: CRITICAL';
    color = '#f43f5e';
    borderColor = 'rgba(244, 63, 94, 0.3)';
    bg = 'rgba(244, 63, 94, 0.04)';
  } else if (score >= 40 && score <= 59) {
    state = 'MODERATE_MATCH';
    statusText = 'Compatibility: Moderate';
    bannerText = 'COMPATIBILITY: MODERATE';
    color = '#f59e0b';
    borderColor = 'rgba(245, 158, 11, 0.3)';
    bg = 'rgba(245, 158, 11, 0.04)';
  } else if (score >= 60 && score <= 79) {
    state = 'STRONG_ALIGNMENT';
    statusText = 'Compatibility: Strong';
    bannerText = 'COMPATIBILITY: STRONG';
    color = '#06b6d4';
    borderColor = 'rgba(6, 182, 212, 0.3)';
    bg = 'rgba(6, 182, 212, 0.04)';
  } else {
    state = 'EXCEPTIONAL_MATCH';
    statusText = 'Compatibility: Extreme';
    bannerText = 'COMPATIBILITY: EXTREME';
    color = '#10b981';
    borderColor = 'rgba(16, 185, 129, 0.3)';
    bg = 'rgba(16, 185, 129, 0.04)';
  }

  if (rhBadge) {
    rhBadge.textContent = bannerText;
    rhBadge.style.color = color;
    rhBadge.style.borderColor = borderColor;
    rhBadge.style.backgroundColor = bg;
  }

  // Populate Roadmap Timeline Node Items
  const roadmapTimeline = document.getElementById('roadmap-timeline');
  if (roadmapTimeline) {
    roadmapTimeline.innerHTML = '';
    
    // We can pull the learningRoadmap from skillGap object or calculate milestone phases
    let milestones = [];
    if (analysis.skillGap && analysis.skillGap.learningRoadmap) {
      milestones = analysis.skillGap.learningRoadmap;
    } else if (analysis.learningRoadmap) {
      milestones = analysis.learningRoadmap;
    } else {
      // Build dummy fallback milestones if missing from raw analysis
      const target = analysis.targetRole || 'Software Engineer';
      milestones = [
        { title: 'Phase 1: Foundation Gaps', duration: 'Weeks 1-3', topics: ['Study missing core languages & environments.', 'Implement containerized environments (Docker).'] },
        { title: 'Phase 2: Project Work', duration: 'Weeks 4-6', topics: ['Develop cloud serverless API microservices.', 'Implement CI/CD automated pipeline workflows.'] },
        { title: 'Phase 3: Deep Dive Prep', duration: 'Weeks 7-9', topics: ['Answer role specific practice cards.', 'Schedule system design mock interviews.'] }
      ];
    }

    milestones.forEach((milestone, idx) => {
      const node = document.createElement('div');
      node.className = 'timeline-node';
      
      let phaseTitle = '';
      let phaseDesc = '';
      
      if (milestone && typeof milestone === 'object') {
        const title = milestone.title || `Phase ${idx + 1}`;
        const duration = milestone.duration ? ` (${milestone.duration})` : '';
        phaseTitle = `${title}${duration}`;
        phaseDesc = Array.isArray(milestone.topics) ? milestone.topics.join(', ') : (milestone.topics || '');
      } else if (typeof milestone === 'string') {
        const parts = milestone.split(':');
        phaseTitle = parts[0] || `Phase ${idx + 1}`;
        phaseDesc = parts.slice(1).join(':') || 'Bridge technical competencies.';
      }

      node.innerHTML = `
        <div class="timeline-node-title">${escapeHTML(phaseTitle)}</div>
        <div class="timeline-node-desc">${escapeHTML(phaseDesc)}</div>
      `;
      roadmapTimeline.appendChild(node);
    });
  }
}

async function initRoadmapPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const analysisId = urlParams.get('id') || sessionStorage.getItem('activeAnalysisId');

  if (!analysisId) {
    showToast('No active analysis selected. Redirecting...', 'warning');
    const mockParam = isMockMode ? '?mock=true' : '';
    setTimeout(() => { window.location.href = `dashboard.html${mockParam}`; }, 1500);
    return;
  }

  try {
    const analysis = await FirebaseService.loadAnalysisById(analysisId);
    await renderRoadmapReport(analysis);
  } catch (err) {
    console.error('Failed to load analysis report:', err);
    showToast('Failed to load analysis report.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  auth.onAuthStateChanged((user) => {
    if (user || isMockMode) {
      initRoadmapPage();
    }
  });

  // Re-map sidebar links to correct report pages
  const sidebarLinks = document.querySelectorAll('.report-section-index-sidebar .index-link');
  sidebarLinks.forEach(link => {
    const href = link.getAttribute('href');
    const urlParams = new URLSearchParams(window.location.search);
    const activeId = urlParams.get('id') || sessionStorage.getItem('activeAnalysisId');
    const mockParam = urlParams.get('mock') === 'true' ? '&mock=true' : '';
    if (activeId) {
      link.href = `${href}?id=${activeId}${mockParam}`;
    }
  });
});
