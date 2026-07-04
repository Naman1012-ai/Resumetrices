/* js/footer.js - Unified Footer Template & Navigation Injection */

import { auth } from './firebase-config.js';

const SUPPORT_EMAIL = 'support.resumetrices@gmail.com';

// Setup search parameters for query param tracking (e.g. active analysis id, mock mode)
const urlParams = new URLSearchParams(window.location.search);
const activeId = urlParams.get('id') || sessionStorage.getItem('activeAnalysisId');
const mockParam = urlParams.get('mock') === 'true' ? 'mock=true' : '';

function getLinkUrl(basePage, includeId = false) {
  let prefix = '';
  // Check if we are inside the /admin/ directory
  if (window.location.pathname.includes('/admin/')) {
    prefix = '../';
  }
  const params = [];
  if (includeId && activeId) params.push(`id=${activeId}`);
  if (mockParam) params.push(mockParam);
  const queryString = params.length > 0 ? '?' + params.join('&') : '';
  return prefix + basePage + queryString;
}

function getLogoUrl() {
  return window.location.pathname.includes('/admin/') ? '../logo.png' : 'logo.png';
}

function initFooter() {
  let footer = document.querySelector('footer.enterprise-footer');

  // If no static footer is defined in HTML, check if we're on a dashboard layout container
  if (!footer) {
    const mainContainer = document.querySelector('.main-page-container');
    if (mainContainer) {
      footer = document.createElement('footer');
      footer.className = 'enterprise-footer';
      const pageView = mainContainer.querySelector('.page-view') || mainContainer;
      pageView.appendChild(footer);
    }
  }

  // Handle support email replacement inside any contact page placeholders on load
  const contactField = document.getElementById('support-email-field');
  if (contactField && contactField.textContent.includes('{{ SUPPORT_EMAIL }}')) {
    contactField.textContent = SUPPORT_EMAIL;
  }

  if (!footer) return;

  // Render the unified footer template
  footer.innerHTML = `
    <div class="footer-grid">
      <div class="footer-col brand-col">
        <div class="footer-logo">
          <img src="${getLogoUrl()}" alt="Resumetrices Logo" style="height: 32px; width: 32px; object-fit: contain;">
          <span class="brand-name">Resumetrices</span>
        </div>
        <p class="brand-desc">
          AI-powered ATS Resume Intelligence Platform helping candidates optimize resumes, identify skill gaps, and prepare for interviews.
        </p>
        <div class="copyright">
          © 2026 Resumetrices. All Rights Reserved.
        </div>
      </div>
      <div class="footer-col">
        <h4>Product</h4>
        <ul>
          <li><a href="${getLinkUrl('login.html')}" id="footer-link-analysis">Resume Analysis</a></li>
          <li><a href="${getLinkUrl('login.html')}" id="footer-link-interview">Interview Preparation</a></li>
          <li><a href="${getLinkUrl('login.html')}" id="footer-link-dashboard">Dashboard</a></li>
        </ul>
      </div>
      
      <div class="footer-col">
        <h4>Company</h4>
        <ul>
          <li><a href="${getLinkUrl('about.html')}">About</a></li>
          <li><a href="${getLinkUrl('contact.html')}">Contact</a></li>
          <li><a href="${getLinkUrl('faq.html')}">FAQ</a></li>
        </ul>
      </div>
      
      <div class="footer-col">
        <h4>Legal</h4>
        <ul>
          <li><a href="${getLinkUrl('privacy.html')}">Privacy Policy</a></li>
          <li><a href="${getLinkUrl('terms.html')}">Terms of Service</a></li>
          <li><a href="${getLinkUrl('security.html')}">Data Security</a></li>
        </ul>
      </div>
    </div>
    
    <div class="footer-bottom">
      <div class="footer-bottom-left">
        <span>Made with ❤️ for job seekers.</span>
        <span class="divider">•</span>
        <span class="version-tag">Version 1.2.0</span>
      </div>
      <div class="footer-bottom-middle">
        <a href="mailto:${SUPPORT_EMAIL}" class="support-email">${SUPPORT_EMAIL}</a>
      </div>
      <div class="footer-bottom-right social-links">
        <a href="https://github.com" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
        </a>
        <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
        </a>
        <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter/X">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path></svg>
        </a>
      </div>
    </div>
  `;

  // Setup back button navigation if present
  const btnBackNav = document.getElementById('btn-back-nav');
  const isMockUser = mockParam === 'mock=true';

  if (btnBackNav) {
    const hasHistory = document.referrer && document.referrer.includes(window.location.host);

    // Initialize button text based on history
    if (hasHistory) {
      if (document.referrer.includes('/admin/')) {
        btnBackNav.textContent = '← Back to Admin Dashboard';
      } else if (document.referrer.includes('/dashboard')) {
        btnBackNav.textContent = '← Back to Dashboard';
      } else {
        btnBackNav.textContent = '← Back';
      }
    } else {
      btnBackNav.textContent = '← Back';
    }

    btnBackNav.addEventListener('click', (e) => {
      e.preventDefault();
      if (document.referrer && document.referrer.includes(window.location.host)) {
        window.history.back();
      } else {
        const isAuth = auth.currentUser || isMockUser;
        if (isAuth) {
          window.location.href = getLinkUrl('dashboard.html');
        } else {
          window.location.href = getLinkUrl('index.html');
        }
      }
    });
  }

  // Dynamically configure auth-dependent state updates
  auth.onAuthStateChanged((user) => {
    const analysisLink = document.getElementById('footer-link-analysis');
    const interviewLink = document.getElementById('footer-link-interview');
    const dashboardLink = document.getElementById('footer-link-dashboard');

    if (user || isMockUser) {
      if (analysisLink) analysisLink.href = getLinkUrl('new-analysis.html');
      if (interviewLink) interviewLink.href = getLinkUrl('interview.html');
      if (dashboardLink) dashboardLink.href = getLinkUrl('dashboard.html');
      
      // Update back button if no referrer history exists
      if (btnBackNav && !(document.referrer && document.referrer.includes(window.location.host))) {
        btnBackNav.textContent = '← Back to Dashboard';
      }
    } else {
      if (analysisLink) analysisLink.href = getLinkUrl('login.html');
      if (interviewLink) interviewLink.href = getLinkUrl('login.html');
      if (dashboardLink) dashboardLink.href = getLinkUrl('login.html');

      // Update back button if no referrer history exists
      if (btnBackNav && !(document.referrer && document.referrer.includes(window.location.host))) {
        btnBackNav.textContent = '← Back to Home';
      }
    }
  });
}

// Initialize footer loading
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFooter);
} else {
  initFooter();
}
