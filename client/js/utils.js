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

// getCompatibilityDetails helper
export function getCompatibilityDetails(score) {
  let label = '';
  let color = '';
  let borderColor = '';
  let bg = '';
  let ratingClass = '';

  if (score >= 90) {
    label = 'Excellent Match';
    ratingClass = 'extreme';
    color = '#10b981'; // Emerald
    borderColor = 'rgba(16, 185, 129, 0.3)';
    bg = 'rgba(16, 185, 129, 0.04)';
  } else if (score >= 80) {
    label = 'Strong Match';
    ratingClass = 'strong';
    color = '#06b6d4'; // Cyan
    borderColor = 'rgba(6, 182, 212, 0.3)';
    bg = 'rgba(6, 182, 212, 0.04)';
  } else if (score >= 70) {
    label = 'Good Match';
    ratingClass = 'medium'; // Blue
    color = '#3b82f6'; // Blue
    borderColor = 'rgba(59, 130, 246, 0.3)';
    bg = 'rgba(59, 130, 246, 0.04)';
  } else if (score >= 60) {
    label = 'Moderate Match';
    ratingClass = 'moderate';
    color = '#f59e0b'; // Amber
    borderColor = 'rgba(245, 158, 11, 0.3)';
    bg = 'rgba(245, 158, 11, 0.04)';
  } else if (score >= 50) {
    label = 'Weak Match';
    ratingClass = 'low'; // Red-orange (low class uses rose)
    color = '#f97316'; // Orange
    borderColor = 'rgba(249, 115, 22, 0.3)';
    bg = 'rgba(249, 115, 22, 0.04)';
  } else {
    label = 'Low Match';
    ratingClass = 'critical';
    color = '#f43f5e'; // Rose
    borderColor = 'rgba(244, 63, 94, 0.3)';
    bg = 'rgba(244, 63, 94, 0.04)';
  }

  return { label, ratingClass, color, borderColor, bg };
}

// getStatusBadge helper
export function getStatusBadge(score) {
  const details = getCompatibilityDetails(score);
  return `<span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.75rem;font-weight:700;background:${details.bg.replace('0.04', '0.12')};color:${details.color};">Compatibility: ${details.label}</span>`;
}

// mapFriendlyErrorMessage helper to sanitize raw backend Exceptions, stack traces, and HTTP codes into empathetic action-oriented statements
export function mapFriendlyErrorMessage(error) {
  if (!error) return "We couldn't complete your request due to a temporary issue. Please try again.";
  const msg = (error.message || String(error)).toLowerCase();
  
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('fetch')) {
    return "We couldn't connect to our servers right now. Please check your internet connection and try again.";
  }
  // OpenRouter Rate Limit / Model Down
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429') || msg.includes('503') || msg.includes('overloaded') || msg.includes('down') || msg.includes('ai_analysis_failed') || msg.includes('analysis could not be generated') || msg.includes('completions') || msg.includes('ai engine')) {
    return "Analysis temporarily unavailable — please try again in a few seconds.";
  }
  if (msg.includes('timeout') || msg.includes('abort') || msg.includes('timed out')) {
    return "The server request took too long to respond. Please check your network stability and try again in a few moments.";
  }
  // OpenRouter Key/Auth errors or Bad Requests
  if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('401') || msg.includes('403') || msg.includes('auth') || msg.includes('400') || msg.includes('bad request') || msg.includes('malformed')) {
    return "Analysis unavailable — please contact support.";
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
  if (msg.includes('database') || msg.includes('firebase') || msg.includes('save') || msg.includes('store')) {
    return "We couldn't save your analysis results to our database. Please check your connection and try saving again.";
  }

  return "We couldn't process your request right now because our server is experiencing a temporary issue. Please try again in a few moments, or check your internet connection.";
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

// showAnalysisProgress helper
export function showAnalysisProgress() {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loading-overlay';
  overlay.style.display = 'flex';

  const card = document.createElement('div');
  card.className = 'analysis-progress-card';

  card.innerHTML = `
    <div class="progress-header">
      <div class="processing-pulse"></div>
      <h3 class="progress-title">Analyzing Resume</h3>
    </div>
    
    <div class="progress-container">
      <div class="progress-bar-label">
        <span class="progress-status-text" id="progress-status-text">Uploading Resume...</span>
        <span class="progress-percent" id="progress-percent">0%</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="progress-bar-fill" style="width: 0%"></div>
      </div>
    </div>
    
    <ul class="analysis-stages-list" id="analysis-stages-list"></ul>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const stages = [
    'Uploading Resume',
    'Parsing PDF',
    'Extracting Resume Content',
    'Detecting Skills',
    'Calculating ATS Score',
    'Running AI Resume Analysis',
    'Generating Skill Gap',
    'Preparing Interview Questions',
    'Building Learning Roadmap',
    'Saving Analysis',
    'Finalizing Report'
  ];

  const listContainer = overlay.querySelector('#analysis-stages-list');
  stages.forEach((stage, idx) => {
    const li = document.createElement('li');
    li.className = 'stage-item pending';
    li.id = `stage-item-${idx}`;
    li.innerHTML = `
      <span class="stage-icon pending"></span>
      <span class="stage-name">${stage}</span>
    `;
    listContainer.appendChild(li);
  });

  const progressBarFill = overlay.querySelector('#progress-bar-fill');
  const progressPercentText = overlay.querySelector('#progress-percent');
  const progressStatusText = overlay.querySelector('#progress-status-text');

  let currentPercent = 0;
  let activeStageIdx = 0;
  let timer = null;

  // Function to set a stage state
  function updateStageUI(idx, state) {
    const li = overlay.querySelector(`#stage-item-${idx}`);
    if (!li) return;
    
    const icon = li.querySelector('.stage-icon');
    li.className = `stage-item ${state}`;
    if (icon) {
      icon.className = `stage-icon ${state}`;
    }

    // Auto scroll the list if needed to keep active stage in view
    if (state === 'active') {
      li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Set the first stage as active
  updateStageUI(0, 'active');

  // Starts the progress bar crawl
  function startCrawl() {
    timer = setInterval(() => {
      if (currentPercent < 95) {
        // Slow down increments as we approach 95%
        let increment = 0;
        if (currentPercent < 30) {
          increment = Math.random() * 2 + 1; // 1-3%
        } else if (currentPercent < 60) {
          increment = Math.random() * 1.5 + 0.5; // 0.5-2%
        } else if (currentPercent < 85) {
          increment = Math.random() * 1 + 0.2; // 0.2-1.2%
        } else {
          increment = Math.random() * 0.3 + 0.05; // very slow crawl (0.05-0.35%)
        }
        
        currentPercent = Math.min(95, currentPercent + increment);
        progressBarFill.style.width = `${currentPercent}%`;
        progressPercentText.textContent = `${Math.floor(currentPercent)}%`;

        // Resolve stage index based on progress
        const targetStageIdx = Math.min(
          stages.length - 2, // crawl up to Saving Analysis
          Math.floor((currentPercent / 95) * (stages.length - 1))
        );

        if (targetStageIdx !== activeStageIdx) {
          // Complete previous stages
          for (let i = activeStageIdx; i < targetStageIdx; i++) {
            updateStageUI(i, 'completed');
          }
          activeStageIdx = targetStageIdx;
          updateStageUI(activeStageIdx, 'active');
          progressStatusText.textContent = `${stages[activeStageIdx]}...`;
        }
      }
    }, 200);
  }

  startCrawl();

  // Complete function to call when backend completes
  function complete(callback) {
    if (timer) clearInterval(timer);
    
    // Set active stage to Finalizing Report
    for (let i = activeStageIdx; i < stages.length - 1; i++) {
      updateStageUI(i, 'completed');
    }
    
    activeStageIdx = stages.length - 1;
    updateStageUI(activeStageIdx, 'active');
    progressStatusText.textContent = `${stages[activeStageIdx]}...`;

    // Move progress bar to 100%
    progressBarFill.style.transition = 'width 0.4s cubic-bezier(0.1, 0.8, 0.3, 1)';
    progressBarFill.style.width = '100%';
    progressPercentText.textContent = '100%';

    setTimeout(() => {
      updateStageUI(activeStageIdx, 'completed');
      progressStatusText.textContent = 'Analysis Completed';
      
      // Animate card out
      card.style.transition = 'all 0.3s ease';
      card.style.transform = 'translateY(-15px)';
      card.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      overlay.style.opacity = '0';

      setTimeout(() => {
        overlay.remove();
        if (callback) callback();
      }, 300);
    }, 800); // Allow user to see completed state
  }

  // Cancel/Error function
  function cancel() {
    if (timer) clearInterval(timer);
    overlay.remove();
  }

  return { complete, cancel };
}

/**
 * Reusable Custom Modal Component
 * Renders as a fixed-position overlay covering the full viewport,
 * centering a solid dark background card.
 */
export function showCustomModal({ title, body, buttons = [], closeOnBackdropClick = true }) {
  return new Promise((resolve) => {
    // Overlay backdrop
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.backgroundColor = 'rgba(3, 7, 18, 0.85)';
    overlay.style.backdropFilter = 'blur(10px)';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '1.5rem';

    // Modal Card (solid background, centered)
    const card = document.createElement('div');
    card.className = 'custom-modal-card';
    card.style.width = '100%';
    card.style.maxWidth = '480px';
    card.style.borderRadius = '16px';
    card.style.padding = '2rem';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '1.25rem';
    card.style.position = 'relative';

    // Modal Title
    const titleEl = document.createElement('h3');
    titleEl.className = 'custom-modal-title';
    titleEl.textContent = title;
    titleEl.style.fontSize = '1.2rem';
    titleEl.style.fontWeight = '700';
    titleEl.style.margin = '0';

    // Modal Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'custom-modal-body';
    if (typeof body === 'string') {
      bodyEl.textContent = body;
    } else {
      bodyEl.appendChild(body);
    }
    bodyEl.style.fontSize = '0.85rem';
    bodyEl.style.lineHeight = '1.6';
    bodyEl.style.margin = '0';

    // Action Footer
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.justifyContent = 'flex-end';
    btnContainer.style.gap = '0.75rem';
    btnContainer.style.marginTop = '0.5rem';

    const cleanUp = () => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      window.removeEventListener('keydown', handleEscape);
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        cleanUp();
        resolve(null);
      }
    };

    window.addEventListener('keydown', handleEscape);

    if (closeOnBackdropClick) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanUp();
          resolve(null);
        }
      });
    }

    buttons.forEach(btnConfig => {
      const btn = document.createElement('button');
      btn.textContent = btnConfig.text;
      btn.style.padding = '0.65rem 1.25rem';
      btn.style.fontSize = '0.85rem';
      btn.style.borderRadius = '8px';
      btn.style.fontWeight = '600';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'all 200ms ease';
      btn.style.fontFamily = 'inherit';

      if (btnConfig.type === 'danger') {
        btn.style.background = '#e11d48';
        btn.style.color = '#fff';
        btn.style.border = '2px solid rgba(244, 63, 94, 0.5)';
      } else if (btnConfig.type === 'primary') {
        btn.style.background = 'rgba(255, 255, 255, 0.08)';
        btn.style.color = '#fff';
        btn.style.border = '1px solid rgba(255, 255, 255, 0.15)';
      } else {
        btn.style.background = 'rgba(255, 255, 255, 0.03)';
        btn.style.color = '#94a3b8';
        btn.style.border = '1px solid rgba(255, 255, 255, 0.05)';
      }

      btn.addEventListener('click', () => {
        if (btnConfig.onClick) {
          btnConfig.onClick(btn, cleanUp, resolve);
        } else {
          cleanUp();
          resolve(btnConfig.value);
        }
      });

      btnContainer.appendChild(btn);
    });

    card.appendChild(titleEl);
    card.appendChild(bodyEl);
    card.appendChild(btnContainer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}


