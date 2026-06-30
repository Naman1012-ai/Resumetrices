import { auth, isMockMode } from './firebase-config.js';
import { FirebaseService } from './api.js';
import { escapeHTML, showToast } from './utils.js';

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
    
    // Check if question is an object or string
    const questionText = typeof q === 'string' ? q : (q.question || '');

    li.innerHTML = `
      <span class="q-item-text">${escapeHTML(questionText)}</span>
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
        await navigator.clipboard.writeText(questionText);
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

async function renderInterviewReport(analysis) {
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

  // Populate Interview Elements
  const ipActiveRole = document.getElementById('interview-active-role');
  if (ipActiveRole) ipActiveRole.textContent = analysis.targetRole || 'Software Engineer';

  const technicalQuestionsList = document.getElementById('technical-questions-list');
  const projectQuestionsList = document.getElementById('project-questions-list');
  const skillgapQuestionsList = document.getElementById('skillgap-questions-list');
  const behavioralQuestionsList = document.getElementById('behavioral-questions-list');
  const hrQuestionsList = document.getElementById('hr-questions-list');

  const prep = analysis.interviewPrep || {};
  let tech = [];
  let proj = [];
  let gap = [];
  let beh = [];
  let hr = [];

  if (Array.isArray(prep)) {
    // If it's a flat list of questions, distribute them
    prep.forEach((item, idx) => {
      const qText = typeof item === 'string' ? item : item.question;
      if (idx % 5 === 0) tech.push(qText);
      else if (idx % 5 === 1) proj.push(qText);
      else if (idx % 5 === 2) gap.push(qText);
      else if (idx % 5 === 3) beh.push(qText);
      else hr.push(qText);
    });
  } else {
    tech = prep.technical || [];
    proj = prep.projectBased || [];
    gap = (prep.domainKnowledge && prep.domainKnowledge.length > 0) ? prep.domainKnowledge : (prep.skillGap || []);
    beh = prep.behavioral || [];
    hr = prep.hrQuestions || [];
  }

  // Update card header text dynamically
  const skillGapHeader = document.querySelector('.q-header.skillgap span');
  if (skillGapHeader) {
    const hasDomainKnowledge = (prep.domainKnowledge && prep.domainKnowledge.length > 0) || (analysis.domainKnowledge && analysis.domainKnowledge.length > 0);
    skillGapHeader.textContent = hasDomainKnowledge ? 'Domain Knowledge Benchmarks' : 'Skill Gap Questions';
  }

  renderQuestionsList(technicalQuestionsList, tech);
  renderQuestionsList(projectQuestionsList, proj);
  renderQuestionsList(skillgapQuestionsList, gap);
  renderQuestionsList(behavioralQuestionsList, beh);
  renderQuestionsList(hrQuestionsList, hr);

  // Render Grading Rubrics
  const gradingRubricsContainer = document.getElementById('grading-rubrics-container');
  const gradingRubricsList = document.getElementById('grading-rubrics-list');
  const rubrics = prep.gradingRubric || analysis.gradingRubric || null;
  if (rubrics && Array.isArray(rubrics) && rubrics.length > 0 && gradingRubricsContainer && gradingRubricsList) {
    gradingRubricsList.innerHTML = '';
    rubrics.forEach(rubric => {
      const entry = document.createElement('div');
      entry.style.background = 'rgba(255,255,255,0.02)';
      entry.style.border = '1px solid var(--border-color)';
      entry.style.borderRadius = 'var(--radius-md)';
      entry.style.padding = '1rem';
      entry.style.display = 'flex';
      entry.style.flexDirection = 'column';
      entry.style.gap = '0.25rem';
      
      entry.innerHTML = `
        <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHTML(rubric.category || '')}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted);"><strong style="color: var(--text-main);">Evaluation Criteria:</strong> ${escapeHTML(rubric.criteria || '')}</div>
        <div style="font-size: 0.85rem; color: var(--emerald);"><strong style="color: var(--emerald);">Excellent Answer Guideline:</strong> ${escapeHTML(rubric.excellentScoreGuidelines || '')}</div>
      `;
      gradingRubricsList.appendChild(entry);
    });
    gradingRubricsContainer.style.display = 'block';
  } else if (gradingRubricsContainer) {
    gradingRubricsContainer.style.display = 'none';
  }
}

function setupStandaloneView(isStandalone) {
  const reportHeaderBar = document.querySelector('.report-header-bar');
  const reportLayoutGrid = document.querySelector('.report-layout-grid');
  const reportIndexSidebar = document.querySelector('.report-section-index-sidebar');
  const activeRoleSubtitle = document.getElementById('active-role-subtitle-container');
  const standaloneSelector = document.getElementById('standalone-selector-container');
  
  if (isStandalone) {
    if (reportHeaderBar) reportHeaderBar.style.display = 'none';
    if (reportIndexSidebar) reportIndexSidebar.style.display = 'none';
    if (reportLayoutGrid) reportLayoutGrid.style.gridTemplateColumns = '1fr';
    if (activeRoleSubtitle) activeRoleSubtitle.style.display = 'none';
    if (standaloneSelector) standaloneSelector.style.display = 'block';
  } else {
    if (reportHeaderBar) reportHeaderBar.style.display = 'flex';
    if (reportIndexSidebar) reportIndexSidebar.style.display = 'flex';
    if (reportLayoutGrid) reportLayoutGrid.style.gridTemplateColumns = '240px 1fr';
    if (activeRoleSubtitle) activeRoleSubtitle.style.display = 'block';
    if (standaloneSelector) standaloneSelector.style.display = 'none';
  }
}

async function initInterviewPage() {
  const urlParams = new URLSearchParams(window.location.search);
  // Clear context by only resolving id parameter directly from URL for report mode
  const analysisId = urlParams.get('id');

  if (!analysisId) {
    // Enable standalone selector mode with a clean state where activeReportId is null
    setupStandaloneView(true);
    const interviewEmptyState = document.getElementById('interview-empty-state');
    const interviewResults = document.getElementById('interview-results');
    if (interviewEmptyState) interviewEmptyState.style.display = 'block';
    if (interviewResults) interviewResults.style.display = 'none';
    return;
  }

  // Loaded with resume analysis context
  setupStandaloneView(false);
  try {
    const analysis = await FirebaseService.loadAnalysisById(analysisId);
    await renderInterviewReport(analysis);
  } catch (err) {
    console.error('Failed to load analysis report:', err);
    showToast('Failed to load analysis report.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  auth.onAuthStateChanged((user) => {
    if (user || isMockMode) {
      initInterviewPage();
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

  // Standalone Selector interactions
  const standaloneRoleSelect = document.getElementById('standalone-role-select');
  const standaloneCustomRole = document.getElementById('standalone-custom-role');
  const customRoleInputGroup = document.getElementById('custom-role-input-group');
  const btnGenerateStandalone = document.getElementById('btn-generate-standalone');
  const interviewLoader = document.getElementById('interview-loader');
  const interviewResults = document.getElementById('interview-results');
  const interviewEmptyState = document.getElementById('interview-empty-state');

  if (standaloneRoleSelect && customRoleInputGroup) {
    standaloneRoleSelect.addEventListener('change', () => {
      if (standaloneRoleSelect.value === 'Other') {
        customRoleInputGroup.style.opacity = '1';
        customRoleInputGroup.style.pointerEvents = 'auto';
      } else {
        customRoleInputGroup.style.opacity = '0.5';
        customRoleInputGroup.style.pointerEvents = 'none';
        if (standaloneCustomRole) standaloneCustomRole.value = '';
      }
    });
  }

  if (btnGenerateStandalone) {
    btnGenerateStandalone.addEventListener('click', async () => {
      let role = standaloneRoleSelect.value;
      if (role === 'Other') {
        role = standaloneCustomRole.value.trim();
        if (!role) {
          showToast('Please enter a custom job title.', 'warning');
          return;
        }
      }

      // Show loader, hide empty state and results
      if (interviewLoader) interviewLoader.style.display = 'block';
      if (interviewResults) interviewResults.style.display = 'none';
      if (interviewEmptyState) interviewEmptyState.style.display = 'none';
      btnGenerateStandalone.disabled = true;

      try {
        let payload = { targetRole: role };
        
        let responseData;
        if (isMockMode) {
          // Simulated mock delay
          await new Promise(resolve => setTimeout(resolve, 1500));
          responseData = {
            success: true,
            technical: [
              `Core competencies, lifecycle behaviors, and runtime paradigms in ${role} applications.`,
              `Standard state synchronization, concurrency locks, and memory optimization guidelines for ${role}.`,
              `Data caching policies, indexing lookups, and load distribution benchmarks used in ${role} systems.`,
              `Unit/Integration testing pipelines, test-driven mock flows, and coverage verification for ${role}.`,
              `Best practice API contract versioning, request serialization, and security strategies for ${role}.`
            ],
            projectBased: [
              `Describe the architecture, component encapsulation, and schema mapping for a recent project you delivered as a ${role}.`,
              `How did you handle telemetry logs, error boundaries, and trace diagnostic instrumentation on your ${role} codebase?`,
              `Detail the deploy workflow, container images configuration, and release automation strategies you integrated for that project.`,
              `What scaling limits or database locks did you discover under stress testing, and how did you resolve them?`,
              `Explain the security audit, secret management variables, and permission checks implemented on that system.`
            ],
            domainKnowledge: [
              `Explain how advanced caching layers (e.g. Redis) improve response times in high-throughput ${role} environments.`,
              `What design patterns (e.g. Factory, Observer) solve scalability hurdles typically faced in ${role} architectures?`,
              `How do database partitioning, read-replicas, and query optimization alleviate lock contention under heavy loads?`,
              `Describe the trade-offs of microservices vs monolithic builds for this specific role profile.`,
              `How do container orchestration tools (e.g. Kubernetes) optimize lifecycle availability for these applications?`
            ],
            behavioral: [
              `Tell me about a time you had to align technical debt refactoring with business deadline expectations as a ${role}.`,
              `Describe a scenario where you resolved a time management bottleneck with another engineer on a complex feature.`,
              `How do you organize your work tasks and communicate progress to non-technical partners during rapid sprints?`,
              `Tell me about a project target you missed. What did you learn, and how did you adjust your timeline estimates next time?`,
              `Describe how you review pull requests to promote high-quality coding standards and mentor junior team members.`
            ],
            hrQuestions: [
              `What attracted you to apply for this target role: "${role}"?`,
              `Where do you plan to grow your technical expertise and career focus over the next 3 to 5 years?`,
              `What do you find most challenging about working in distributed or cross-functional developer teams?`,
              `What are your expectations for onboarding, technical mentorship, and developer support in our organization?`,
              `Why are you looking to start a new project engagement or transition roles at this point in your career?`
            ],
            gradingRubric: [
              { category: "Technical questions", criteria: `Shows depth of understanding in ${role} technologies.`, excellentScoreGuidelines: `Mentions specific state synchronization or runtime paradigms for ${role}.` },
              { category: "Project-based questions", criteria: `Explains project architectures and scaling limits.`, excellentScoreGuidelines: `Provides concrete telemetry or database optimization details.` },
              { category: "Domain Knowledge Benchmarks", criteria: `Demonstrates knowledge of core tools like Redis, database structures, or message queues.`, excellentScoreGuidelines: `Contrasts architectural choices and maps concrete scaling benchmarks.` },
              { category: "Behavioral questions", criteria: `Communicates collaboration, ownership, and conflict resolution.`, excellentScoreGuidelines: `Highlights concrete outcomes using the STAR framework.` },
              { category: "HR questions", criteria: `Articulates career progression goals for ${role}.`, excellentScoreGuidelines: `Aligns growth with long-term leadership or technical milestones.` }
            ]
          };
        } else {
          const user = auth.currentUser;
          const headers = { 'Content-Type': 'application/json' };
          if (user) {
            const idToken = await user.getIdToken();
            headers['Authorization'] = `Bearer ${idToken}`;
          }
          const response = await fetch(`${FirebaseService.getApiBase()}/interview/questions`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
          });
          responseData = await response.json();
          if (!response.ok) throw new Error(responseData.message || 'Failed to generate questions.');
        }

        // Render questions
        const technicalQuestionsList = document.getElementById('technical-questions-list');
        const projectQuestionsList = document.getElementById('project-questions-list');
        const skillgapQuestionsList = document.getElementById('skillgap-questions-list');
        const behavioralQuestionsList = document.getElementById('behavioral-questions-list');
        const hrQuestionsList = document.getElementById('hr-questions-list');

        // Update card header text dynamically
        const skillGapHeader = document.querySelector('.q-header.skillgap span');
        if (skillGapHeader) {
          const hasDomainKnowledge = responseData.domainKnowledge && responseData.domainKnowledge.length > 0;
          skillGapHeader.textContent = hasDomainKnowledge ? 'Domain Knowledge Benchmarks' : 'Skill Gap Questions';
        }

        renderQuestionsList(technicalQuestionsList, responseData.technical);
        renderQuestionsList(projectQuestionsList, responseData.projectBased);
        
        const gapData = (responseData.domainKnowledge && responseData.domainKnowledge.length > 0) ? responseData.domainKnowledge : (responseData.skillGap || []);
        renderQuestionsList(skillgapQuestionsList, gapData);
        
        renderQuestionsList(behavioralQuestionsList, responseData.behavioral);
        renderQuestionsList(hrQuestionsList, responseData.hrQuestions);

        // Render Grading Rubrics
        const gradingRubricsContainer = document.getElementById('grading-rubrics-container');
        const gradingRubricsList = document.getElementById('grading-rubrics-list');
        const rubrics = responseData.gradingRubric || null;
        if (rubrics && Array.isArray(rubrics) && rubrics.length > 0 && gradingRubricsContainer && gradingRubricsList) {
          gradingRubricsList.innerHTML = '';
          rubrics.forEach(rubric => {
            const entry = document.createElement('div');
            entry.style.background = 'rgba(255,255,255,0.02)';
            entry.style.border = '1px solid var(--border-color)';
            entry.style.borderRadius = 'var(--radius-md)';
            entry.style.padding = '1rem';
            entry.style.display = 'flex';
            entry.style.flexDirection = 'column';
            entry.style.gap = '0.25rem';
            
            entry.innerHTML = `
              <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHTML(rubric.category || '')}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);"><strong style="color: var(--text-main);">Evaluation Criteria:</strong> ${escapeHTML(rubric.criteria || '')}</div>
              <div style="font-size: 0.85rem; color: var(--emerald);"><strong style="color: var(--emerald);">Excellent Answer Guideline:</strong> ${escapeHTML(rubric.excellentScoreGuidelines || '')}</div>
            `;
            gradingRubricsList.appendChild(entry);
          });
          gradingRubricsContainer.style.display = 'block';
        } else if (gradingRubricsContainer) {
          gradingRubricsContainer.style.display = 'none';
        }

        // Update active role subtitle if present
        const ipActiveRole = document.getElementById('interview-active-role');
        const activeRoleSubtitle = document.getElementById('active-role-subtitle-container');
        if (ipActiveRole) ipActiveRole.textContent = role;
        if (activeRoleSubtitle) activeRoleSubtitle.style.display = 'block';

        if (interviewResults) interviewResults.style.display = 'block';
        showToast('Successfully generated 25 practice questions!', 'success');
      } catch (err) {
        console.error('Failed to generate standalone interview prep:', err);
        showToast(err.message || 'Failed to generate standalone questions.', 'error');
        if (interviewEmptyState) interviewEmptyState.style.display = 'block';
      } finally {
        if (interviewLoader) interviewLoader.style.display = 'none';
        btnGenerateStandalone.disabled = false;
      }
    });
  }
});
