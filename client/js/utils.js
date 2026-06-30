// escapeHTML helper
export function escapeHTML(str) {
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
}

// formatTimeAgo helper
export function formatTimeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// getStatusBadge helper
export function getStatusBadge(score) {
  if (score < 40) {
    return '<span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.75rem;font-weight:700;background:rgba(244,63,94,0.12);color:#f43f5e;">Compatibility: Critical</span>';
  } else if (score >= 40 && score <= 59) {
    return '<span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.75rem;font-weight:700;background:rgba(245,158,11,0.12);color:#f59e0b;">Compatibility: Moderate</span>';
  } else if (score >= 60 && score <= 79) {
    return '<span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.75rem;font-weight:700;background:rgba(6,182,212,0.12);color:#06b6d4;">Compatibility: Strong</span>';
  } else {
    return '<span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.75rem;font-weight:700;background:rgba(16,185,129,0.12);color:#10b981;">Compatibility: Extreme</span>';
  }
}

// mapFriendlyErrorMessage helper to sanitize raw backend Exceptions, stack traces, and HTTP codes into empathetic action-oriented statements
export function mapFriendlyErrorMessage(error) {
  if (!error) return "We couldn't complete your request due to a temporary issue. Please try again.";
  const msg = (error.message || String(error)).toLowerCase();
  
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('fetch')) {
    return "We couldn't connect to our servers right now. Please check your internet connection and try again.";
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429')) {
    return "You're sending requests faster than our system can process them. Please wait a moment before trying again.";
  }
  if (msg.includes('timeout') || msg.includes('abort') || msg.includes('timed out')) {
    return "The server request took too long to respond. Please check your network stability and try again in a few moments.";
  }
  if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('401') || msg.includes('403') || msg.includes('auth')) {
    return "Your authorization credentials could not be verified. Please try signing out and signing in again.";
  }
  if (msg.includes('not found') || msg.includes('404') || msg.includes('endpoint')) {
    return "We couldn't find the requested page or analysis record. Please check the address or return to your dashboard.";
  }
  if (msg.includes('invalid_document_type') || msg.includes('not a resume') || msg.includes('document type') || msg.includes('format') || msg.includes('pdf')) {
    return "The uploaded file doesn't seem to be a valid PDF resume. Please make sure the file is in PDF format and try again.";
  }
  if (msg.includes('too large') || msg.includes('limit') || msg.includes('5mb') || msg.includes('oversized')) {
    return "The uploaded resume file exceeds our 5MB size limit. Please compress your PDF file and try uploading it again.";
  }
  if (msg.includes('openrouter') || msg.includes('ai_analysis_failed') || msg.includes('analysis could not be generated') || msg.includes('completions') || msg.includes('ai engine')) {
    return "Our resume scanning engine is currently processing a high volume of requests. Please wait a few moments and try your scan again.";
  }
  if (msg.includes('database') || msg.includes('firebase') || msg.includes('save') || msg.includes('store')) {
    return "We couldn't save your analysis results to our database. Please check your connection and try saving again.";
  }

  return "We couldn't process your request right now because our server is experiencing heavy traffic. Please try again in a few moments, or check your internet connection.";
}

// showToast helper
let toastTimeout = null;
export function showToast(message, type = 'success') {
  let displayMessage = message;
  if (type === 'error') {
    if (message instanceof Error) {
      displayMessage = mapFriendlyErrorMessage(message);
    } else {
      displayMessage = mapFriendlyErrorMessage({ message: String(message) });
    }
  }

  const toastNotification = document.getElementById('toast-notification');
  const toastMessage = document.getElementById('toast-message');

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  if (toastMessage) {
    toastMessage.textContent = displayMessage;
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

// getFriendlyAuthErrorMessage helper
export function getFriendlyAuthErrorMessage(error) {
  if (!error) return 'An unknown error occurred during authentication.';
  
  const code = error.code;
  if (code) {
    switch (code) {
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
  return msg || 'An unknown error occurred during authentication.';
}

/**
 * Renders a persistent UI notification block for transactional email triggers.
 * Includes a Success message part (green background theme) and a Spam/Junk warning part (amber box theme).
 * Stays visible until the user explicitly clicks the Dismiss button.
 * 
 * @param {string} message - Message containing ⚠️ warning divider.
 * @param {HTMLElement} [container] - Optional parent container to render inside.
 */
export function showPersistentNotice(message, container = null) {
  const noticeDiv = document.createElement('div');
  noticeDiv.className = 'persistent-notice-banner';
  noticeDiv.style.cssText = `
    position: relative;
    padding: 1.15rem 1.35rem;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.25);
    border-radius: 12px;
    color: #f1f5f9;
    font-size: 0.85rem;
    line-height: 1.5;
    margin: 1.25rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
    animation: slideInDown 0.3s ease-out;
    text-align: left;
  `;

  let formattedMessage = message;
  if (message.includes('⚠️')) {
    const parts = message.split('⚠️');
    formattedMessage = `
      <div style="display: flex; align-items: flex-start; gap: 0.6rem; color: var(--emerald, #10b981); font-weight: 600;">
        <span style="font-size: 1.15rem; line-height: 1; margin-top: 1px;">✓</span>
        <span>${parts[0].trim()}</span>
      </div>
      <div style="display: flex; align-items: flex-start; gap: 0.6rem; color: #f59e0b; background: rgba(245, 158, 11, 0.06); padding: 0.75rem 0.9rem; border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px; font-size: 0.8rem; font-weight: 500; margin-top: 0.15rem; line-height: 1.45;">
        <span style="font-size: 1.15rem; line-height: 1; margin-top: 1px;">⚠️</span>
        <span>${parts[1].trim()}</span>
      </div>
    `;
  } else {
    formattedMessage = `
      <div style="display: flex; align-items: flex-start; gap: 0.6rem; color: var(--emerald, #10b981); font-weight: 600;">
        <span style="font-size: 1.15rem; line-height: 1; margin-top: 1px;">✓</span>
        <span>${message}</span>
      </div>
    `;
  }

  noticeDiv.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      ${formattedMessage}
    </div>
    <button class="notice-dismiss-btn" style="
      align-self: flex-end;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      color: #ffffff;
      padding: 0.35rem 1rem;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
    ">Dismiss</button>
  `;

  // Dismiss action with fade-out
  const dismissBtn = noticeDiv.querySelector('.notice-dismiss-btn');
  dismissBtn.addEventListener('click', (e) => {
    e.preventDefault();
    noticeDiv.style.opacity = '0';
    noticeDiv.style.transform = 'translateY(-10px)';
    noticeDiv.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
    setTimeout(() => {
      // If it's a child of a styled error container, hide the container too
      if (container && (container.id === 'auth-error-msg' || container.id === 'reset-error-msg')) {
        container.style.display = 'none';
        container.innerHTML = '';
      }
      noticeDiv.remove();
    }, 250);
  });

  // Hover styles for dismiss button
  dismissBtn.addEventListener('mouseenter', () => {
    dismissBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    dismissBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
  });
  dismissBtn.addEventListener('mouseleave', () => {
    dismissBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    dismissBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  });

  if (container) {
    container.innerHTML = '';
    container.appendChild(noticeDiv);
  } else {
    // Pin to top right corner of viewport
    noticeDiv.style.position = 'fixed';
    noticeDiv.style.top = '1.5rem';
    noticeDiv.style.right = '1.5rem';
    noticeDiv.style.zIndex = '9999';
    noticeDiv.style.maxWidth = '380px';
    document.body.appendChild(noticeDiv);
  }
}


