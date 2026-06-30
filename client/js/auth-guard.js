import { auth, isMockMode } from './firebase-config.js';

// Prevent layout flash before authentication verification resolves
document.documentElement.style.visibility = 'hidden';

export function initAuthGuard() {
  auth.onAuthStateChanged((user) => {
    if (isMockMode) {
      document.documentElement.style.visibility = 'visible';
      return;
    }
    if (!user) {
      const mockParam = isMockMode ? '?mock=true' : '';
      window.location.href = `index.html${mockParam}`;
      return;
    }
    
    // Check if email address verification is pending
    const adminEmail = window.process?.env?.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';
    if (user.email !== adminEmail && !user.emailVerified) {
      window.location.href = `verify-email.html${isMockMode ? '?mock=true' : ''}`;
    } else {
      document.documentElement.style.visibility = 'visible';
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
