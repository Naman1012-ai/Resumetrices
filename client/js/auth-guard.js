import { auth, isMockMode } from './firebase-config.js';

// Prevent layout flash before authentication verification resolves
document.documentElement.style.visibility = 'hidden';

function showMinSpinner() {
  let spinner = document.getElementById('auth-loading-spinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.id = 'auth-loading-spinner';
    spinner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: #030712;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: 'Outfit', sans-serif;
      gap: 1.5rem;
    `;
    spinner.innerHTML = `
      <div style="width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.05); border-top-color: var(--emerald, #10b981); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      <span style="color: var(--text-muted, #94a3b8); font-size: 0.8rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Securing Session...</span>
      <style>
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(spinner);
  }
}

function hideMinSpinner() {
  const spinner = document.getElementById('auth-loading-spinner');
  if (spinner) {
    spinner.remove();
  }
  document.documentElement.style.visibility = 'visible';
}

export function initAuthGuard() {
  showMinSpinner();

  auth.onAuthStateChanged((user) => {
    if (isMockMode) {
      hideMinSpinner();
      return;
    }

    const oauthInProgress = sessionStorage.getItem('oauth_in_progress') === 'true';
    if (oauthInProgress) {
      // Actively resolving OAuth credentials, freeze navigation
      return;
    }

    if (!user) {
      const mockParam = isMockMode ? '?mock=true' : '';
      window.location.href = `/index.html${mockParam}`;
      return;
    }
    
    // Check if email address verification is pending
    // Google OAuth users are inherently email-verified by Google;
    // Firebase's emailVerified flag can be unreliable for OAuth providers.
    const adminEmail = window.process?.env?.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';
    const isGoogleUser = user.providerData?.some(p => p.providerId === 'google.com');
    if (user.email !== adminEmail && !user.emailVerified && !isGoogleUser) {
      window.location.href = `/verify-email.html${isMockMode ? '?mock=true' : ''}`;
    } else {
      hideMinSpinner();
    }
  });
}

initAuthGuard();

// Apply color theme globally on page load
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
  document.documentElement.classList.add('light-theme');
} else {
  document.documentElement.classList.remove('light-theme');
}
