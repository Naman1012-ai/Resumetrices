import { auth, isMockMode } from './firebase-config.js';
import { FirebaseService } from './api.js';
import { escapeHTML, showToast } from './utils.js';

const categoryMetadata = {
  contact: { name: 'Contact Info & Profile Details', max: 10, color: 'blue' },
  formatting: { name: 'Formatting & Structural Design', max: 10, color: 'blue' },
  skills: { name: 'Skills & Match Quality', max: 20, color: 'green' },
  experience: { name: 'Experience & Impact Metrics', max: 20, color: 'green' },
  projects: { name: 'Projects & Core Stack Presence', max: 15, color: 'blue' },
  education: { name: 'Education & Academic Alignment', max: 10, color: 'blue' },
  keywords: { name: 'Keywords Density & Gaps', max: 10, color: 'purple' },
  achievements: { name: 'Achievements & Leadership Credentials', max: 5, color: 'purple' }
};

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

async function renderAnalysisReport(analysis) {
  // 1. Populate Dedicated Report Header Bar
  const rhName = document.getElementById('report-header-name');
  const rhRole = document.getElementById('report-header-role');
  const rhDate = document.getElementById('report-header-date');
  const rhScore = document.getElementById('report-header-score');
  const rhBadge = document.getElementById('report-header-badge');

  const resFilename = document.getElementById('res-filename');
  const resAtsBadge = document.getElementById('res-ats-badge');
  const resScore = document.getElementById('res-score');
  const fillCircle = document.getElementById('score-fill-circle');
  const resFeedbackText = document.getElementById('res-feedback-text');
  const breakdownGrid = document.getElementById('breakdown-grid');
  const resStrengthsList = document.getElementById('res-strengths-list');
  const resWeaknessesList = document.getElementById('res-weaknesses-list');
  const resRewriteList = document.getElementById('res-rewrite-list');
  const resAtsTipsList = document.getElementById('res-ats-tips-list');
  const resMissingKeywordsTags = document.getElementById('res-missing-keywords-tags');
  const resMissingSectionsTags = document.getElementById('res-missing-sections-tags');

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

  if (resFilename) resFilename.textContent = analysis.resumeName;
  if (resAtsBadge) {
    resAtsBadge.textContent = statusText;
    resAtsBadge.style.color = color;
    resAtsBadge.style.backgroundColor = bg;
    resAtsBadge.style.borderColor = borderColor;
  }

  // Circular gauge and animated score counter
  if (resScore) {
    animateValue(resScore, 0, score, 1000);
  }
  if (fillCircle) {
    fillCircle.style.stroke = color;
    const radius = fillCircle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    fillCircle.style.strokeDasharray = `${circumference}`;
    const offset = circumference - (score / 100) * circumference;
    setTimeout(() => {
      fillCircle.style.strokeDashoffset = offset;
    }, 100);
  }
  if (rhScore) rhScore.style.color = color;

  // Recruiter feedback
  if (resFeedbackText) {
    resFeedbackText.textContent = analysis.recruiterFeedback || 'No feedback paragraph generated.';
  }

  // Score Breakdown Grid
  if (breakdownGrid) {
    breakdownGrid.innerHTML = '';
    const breakdown = analysis.breakdown || {};
    const explanations = analysis.explanations || {};
    
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

  // Strengths
  if (resStrengthsList) {
    resStrengthsList.innerHTML = '';
    const strengths = analysis.strengths || [];
    strengths.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      resStrengthsList.appendChild(li);
    });
  }

  // Weaknesses
  if (resWeaknessesList) {
    resWeaknessesList.innerHTML = '';
    const weaknesses = analysis.weaknesses || [];
    weaknesses.forEach(w => {
      const li = document.createElement('li');
      li.textContent = w;
      resWeaknessesList.appendChild(li);
    });
  }

  // Rewrite suggestions
  if (resRewriteList) {
    resRewriteList.innerHTML = '';
    const rewriteSuggestions = analysis.rewriteSuggestions || [];
    rewriteSuggestions.forEach(r => {
      const li = document.createElement('li');
      li.textContent = typeof r === 'string' ? r : `${r.original} -> ${r.suggestion}`;
      resRewriteList.appendChild(li);
    });
  }

  // ATS Optimization Tips
  if (resAtsTipsList) {
    resAtsTipsList.innerHTML = '';
    const atsTips = analysis.atsTips || [];
    atsTips.forEach(t => {
      const li = document.createElement('li');
      li.textContent = t;
      resAtsTipsList.appendChild(li);
    });
  }

  // Missing keywords tags
  if (resMissingKeywordsTags) {
    resMissingKeywordsTags.innerHTML = '';
    const missingKeywords = analysis.missingKeywords || [];
    if (missingKeywords.length > 0) {
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
    const missingSections = analysis.missingSections || [];
    if (missingSections.length > 0) {
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
}

async function initReportPage() {
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
    await renderAnalysisReport(analysis);
  } catch (err) {
    console.error('Failed to load analysis report:', err);
    showToast('Failed to load analysis report.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  auth.onAuthStateChanged((user) => {
    if (user || isMockMode) {
      initReportPage();
    }
  });

  // Floating Sidebar Section Index Scroll Spy & Click Handling & link re-mapping
  const sidebarLinks = document.querySelectorAll('.report-section-index-sidebar .index-link');
  sidebarLinks.forEach(link => {
    const href = link.getAttribute('href');
    const urlParams = new URLSearchParams(window.location.search);
    const activeId = urlParams.get('id') || sessionStorage.getItem('activeAnalysisId');
    const mockParam = urlParams.get('mock') === 'true' ? '&mock=true' : '';
    
    if (activeId && !href.startsWith('analysis.html#')) {
      link.href = `${href}?id=${activeId}${mockParam}`;
    }

    if (href.startsWith('analysis.html#')) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = href.split('#')[1];
        const section = document.getElementById(targetId);
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  });
});
