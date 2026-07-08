import { auth, isMockMode } from './firebase-config.js';
import { FirebaseService } from './api.js';
import { escapeHTML, showToast, getCompatibilityDetails } from './utils.js';

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

async function renderSkillGapReport(analysis) {
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

  const details = getCompatibilityDetails(score, analysis, analysis.weights);
  const statusText = `Compatibility: ${details.label}`;
  const bannerText = `COMPATIBILITY: ${details.label.toUpperCase()}`;
  const color = details.color;
  const borderColor = details.borderColor;
  const bg = details.bg;

  if (rhBadge) {
    rhBadge.textContent = bannerText;
    rhBadge.style.color = color;
    rhBadge.style.borderColor = borderColor;
    rhBadge.style.backgroundColor = bg;
  }

  // Populate Skill Gap Elements
  const sgActiveRole = document.getElementById('skillgap-active-role');
  if (sgActiveRole) sgActiveRole.textContent = analysis.targetRole || 'Software Engineer';

  const matchedSkillsTags = document.getElementById('matched-skills-tags');
  const missingSkillsTags = document.getElementById('missing-skills-tags');
  const recommendedSkillsTags = document.getElementById('recommended-skills-tags');

  // Handle skill gap structure. The API has skillGap as an array or object containing arrays.
  // In app.js:
  // matchedSkills = skillGap.matchedSkills (which was calculated by app.js or fetched)
  // Let's parse them from analysis.skillGap!
  // If analysis.skillGap is an array of objects like {skill, gapType, recommendation}:
  // we can map them:
  let matchedList = [];
  let missingList = [];
  let recommendedList = [];

  if (analysis.skillGap) {
    if (Array.isArray(analysis.skillGap)) {
      analysis.skillGap.forEach(item => {
        if (item.gapType === 'Matched') {
          matchedList.push(item.skill);
        } else if (item.gapType === 'Missing') {
          missingList.push(item.skill);
        } else {
          recommendedList.push(item.skill);
        }
      });
      // Fallback if gapTypes are not specifically flagged: split them
      if (missingList.length === 0 && matchedList.length === 0) {
        missingList = analysis.skillGap.map(item => item.skill);
      }
    } else {
      matchedList = analysis.skillGap.matchedSkills || [];
      missingList = analysis.skillGap.missingSkills || [];
      recommendedList = analysis.skillGap.recommendedSkills || [];
    }
  }

  // Fallbacks from missingKeywords
  if (missingList.length === 0 && analysis.missingKeywords) {
    missingList = analysis.missingKeywords;
  }

  renderTagsCloud(matchedSkillsTags, matchedList, 'green');
  renderTagsCloud(missingSkillsTags, missingList, 'red');
  renderTagsCloud(recommendedSkillsTags, recommendedList, 'blue');
}

async function initSkillGapPage() {
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
    await renderSkillGapReport(analysis);
  } catch (err) {
    console.error('Failed to load analysis report:', err);
    showToast('Failed to load analysis report.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  auth.onAuthStateChanged((user) => {
    if (user || isMockMode) {
      initSkillGapPage();
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
