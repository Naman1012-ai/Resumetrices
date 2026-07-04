import { auth, isMockMode } from './firebase-config.js';
import './footer.js';

// Central Navigation & Layout Injector
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const activeId = urlParams.get('id') || sessionStorage.getItem('activeAnalysisId');
  const mockParam = urlParams.get('mock') === 'true' ? 'mock=true' : '';

  if (urlParams.get('id')) {
    sessionStorage.setItem('activeAnalysisId', urlParams.get('id'));
  }

  function getLinkUrl(basePage, includeId = false) {
    const params = [];
    if (includeId && activeId) params.push(`id=${activeId}`);
    if (mockParam) params.push(mockParam);
    const queryString = params.length > 0 ? '?' + params.join('&') : '';
    return basePage + queryString;
  }

  // 1. Inject Toast Notification Container if missing
  if (!document.getElementById('toast-notification')) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.id = 'toast-notification';
    toast.style.display = 'none';
    toast.innerHTML = `
      <div class="toast-content" style="display: flex; align-items: center; gap: 0.75rem;">
        <span class="toast-icon" style="font-size: 1.25rem;">ℹ️</span>
        <p class="toast-message" id="toast-message" style="margin: 0; font-size: 0.85rem; font-weight: 500;"></p>
      </div>
    `;
    document.body.appendChild(toast);
  }

  // 2. Inject Header
  const headerPlaceholder = document.getElementById('app-header-placeholder');
  if (headerPlaceholder) {
    const temp = document.createElement('div');
    temp.innerHTML = `
      <header class="app-header">
        <div class="header-container">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <button class="btn-hamburger" id="btn-hamburger" aria-expanded="false" aria-controls="app-sidebar-nav" aria-label="Toggle side navigation menu">
              <span></span>
              <span></span>
              <span></span>
            </button>
            <a href="${getLinkUrl('dashboard.html')}" class="logo-link" id="logo-home">
              <img src="logo.png" alt="Resumetrices Logo" class="logo-img" style="height: 32px; width: 32px; object-fit: contain;">
              <span class="logo-text">Resumetrices</span>
            </a>
          </div>
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <div class="user-profile" id="user-profile-header" style="position: relative;">
              <button class="avatar-btn" id="avatar-dropdown-btn" aria-expanded="false" aria-haspopup="true" aria-label="User menu" style="width: 36px; height: 36px; border-radius: 50%; background: var(--grad-primary); color: #030712; font-weight: 700; font-size: 1rem; border: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-card); transition: var(--transition-fast);">
                U
              </button>
              <div class="dropdown-menu" id="avatar-dropdown-menu" style="display: none; position: absolute; top: 44px; right: 0; width: 220px; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--spacing-8); box-shadow: var(--shadow-dropdown); z-index: 150; backdrop-filter: blur(12px);">
                <div class="dropdown-header" style="padding: var(--spacing-8) var(--spacing-12); border-bottom: 1px solid var(--border-color); margin-bottom: var(--spacing-4);">
                  <div class="dropdown-user-name" id="dropdown-username" style="font-weight: 600; font-size: 0.9rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">User</div>
                </div>
                <a href="${getLinkUrl('profile.html')}" class="dropdown-item" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.75rem; color: var(--text-muted); text-decoration: none; font-size: 0.85rem; font-weight: 500; border-radius: var(--radius-md); transition: var(--transition-fast);">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  Profile
                </a>
                <a href="${getLinkUrl('settings.html')}" class="dropdown-item" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.75rem; color: var(--text-muted); text-decoration: none; font-size: 0.85rem; font-weight: 500; border-radius: var(--radius-md); transition: var(--transition-fast);">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                  Settings
                </a>
                <button class="dropdown-item btn-logout" id="btn-logout" style="border: none; background: transparent; width: 100%; text-align: left; display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.75rem; color: var(--danger); cursor: pointer; font-size: 0.85rem; font-weight: 500; border-radius: var(--radius-md); transition: var(--transition-fast);">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
    `;
    headerPlaceholder.replaceWith(temp.firstElementChild);

    // Bind dropdown toggle
    const avatarDropdownBtn = document.getElementById('avatar-dropdown-btn');
    const avatarDropdownMenu = document.getElementById('avatar-dropdown-menu');
    if (avatarDropdownBtn && avatarDropdownMenu) {
      avatarDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const shown = avatarDropdownMenu.style.display === 'block';
        avatarDropdownMenu.style.display = shown ? 'none' : 'block';
        avatarDropdownBtn.setAttribute('aria-expanded', !shown);
      });
      document.addEventListener('click', () => {
        avatarDropdownMenu.style.display = 'none';
        avatarDropdownBtn.setAttribute('aria-expanded', 'false');
      });
    }

    // Populate user profile info in header
    auth.onAuthStateChanged((user) => {
      let displayName = user ? (user.displayName || user.email.split('@')[0]) : 'User';
      let avatarUrl = '';
      
      if (user) {
        try {
          let cached = sessionStorage.getItem(`profile_cache_${user.uid}`);
          if (!cached) {
            cached = localStorage.getItem(`profile_cache_${user.uid}`);
          }
          if (!cached) {
            cached = sessionStorage.getItem('profile_cache') || localStorage.getItem('profile_cache');
          }
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.displayName) displayName = parsed.displayName;
          }
        } catch (e) {}
      }
      
      updateHeaderUI(displayName, avatarUrl);

      // Dynamically add Admin Console link and back button for administrators
      const adminEmail = window.process?.env?.VITE_ADMIN_EMAIL || 'admin@resumetrices.com';
      if (user && user.email === adminEmail) {
        // 1. Dropdown Link
        let adminLink = document.getElementById('dropdown-admin-link');
        if (!adminLink && avatarDropdownMenu) {
          adminLink = document.createElement('a');
          adminLink.id = 'dropdown-admin-link';
          adminLink.href = `/admin/dashboard.html${mockParam ? '?' + mockParam : ''}`;
          adminLink.className = 'dropdown-item';
          adminLink.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.75rem; color: var(--rose, #f43f5e); text-decoration: none; font-size: 0.85rem; font-weight: 700; border-radius: var(--radius-md); transition: var(--transition-fast);';
          adminLink.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
            Admin Console
          `;
          
          const dropdownHeader = avatarDropdownMenu.querySelector('.dropdown-header');
          if (dropdownHeader) {
            dropdownHeader.after(adminLink);
          }
        }

        // 2. Visible Header Back Button
        const profileHeader = document.getElementById('user-profile-header');
        if (profileHeader) {
          let adminBackButton = document.getElementById('admin-back-button');
          if (!adminBackButton) {
            adminBackButton = document.createElement('a');
            adminBackButton.id = 'admin-back-button';
            adminBackButton.href = `/admin/dashboard.html${mockParam ? '?' + mockParam : ''}`;
            adminBackButton.className = 'btn-cta-secondary';
            adminBackButton.style.cssText = 'padding: 0.45rem 1.05rem; border-radius: var(--radius-md); font-size: 0.85rem; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; border: 1px solid var(--rose, #f43f5e); color: var(--rose, #f43f5e); background: rgba(244, 63, 94, 0.05); transition: all 0.2s ease; margin-right: 0.5rem;';
            adminBackButton.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              Back to Admin
            `;
            adminBackButton.addEventListener('mouseenter', () => {
              adminBackButton.style.background = 'rgba(244, 63, 94, 0.12)';
            });
            adminBackButton.addEventListener('mouseleave', () => {
              adminBackButton.style.background = 'rgba(244, 63, 94, 0.05)';
            });
            profileHeader.before(adminBackButton);
          }
        }
      }
    });
  }

  // 3. Inject Sidebar
  const sidebarPlaceholder = document.getElementById('app-sidebar-placeholder');
  if (sidebarPlaceholder) {
    const temp = document.createElement('div');
    temp.innerHTML = `
      <aside class="sidebar-column app-sidebar-nav" id="app-sidebar-nav">
        <button class="btn-collapse" id="btn-collapse" title="Collapse Menu" aria-expanded="false" aria-label="Collapse side navigation menu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6" id="collapse-arrow-pts"></polyline>
          </svg>
        </button>
        
        <div class="sidebar-nav-title">Navigation</div>
        <nav class="sidebar-nav-menu">
          <a href="${getLinkUrl('dashboard.html')}" class="nav-item" id="nav-dashboard">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="9"></rect>
              <rect x="14" y="3" width="7" height="5"></rect>
              <rect x="14" y="12" width="7" height="9"></rect>
              <rect x="3" y="16" width="7" height="5"></rect>
            </svg>
            <span class="nav-label">Dashboard</span>
          </a>
          <a href="${getLinkUrl('new-analysis.html')}" class="nav-item nav-item-cta" id="nav-new-analysis" style="margin-bottom: var(--spacing-16); background: var(--emerald); color: #030712; font-weight: 700; border: none; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #030712;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span class="nav-label">New Analysis</span>
          </a>
          <a href="${getLinkUrl('history.html')}" class="nav-item" id="nav-history">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 8v4l3 3"></path>
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
            <span class="nav-label">My Analyses</span>
          </a>
          <a href="${getLinkUrl('interview.html', false)}" class="nav-item" id="nav-interview-prep">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="nav-label">Interview Prep</span>
          </a>
          <a href="${getLinkUrl('reports.html')}" class="nav-item" id="nav-reports">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span class="nav-label">My Reports</span>
          </a>
        </nav>
      </aside>
    `;
    sidebarPlaceholder.replaceWith(temp.firstElementChild);

    // Collapsible sidebar functionality
    const btnCollapse = document.getElementById('btn-collapse');
    const appSidebarNav = document.getElementById('app-sidebar-nav');
    if (btnCollapse && appSidebarNav) {
      if (localStorage.getItem('sidebar-collapsed') === 'true') {
        appSidebarNav.classList.add('collapsed');
      }
      btnCollapse.addEventListener('click', () => {
        const collapsed = appSidebarNav.classList.toggle('collapsed');
        localStorage.setItem('sidebar-collapsed', collapsed);
      });
    }

    // Set active link in sidebar menu based on current page
    const filename = window.location.pathname.split('/').pop() || 'index.html';
    let activeNavId = '';
    if (filename.includes('dashboard')) activeNavId = 'nav-dashboard';
    else if (filename.includes('new-analysis')) activeNavId = 'nav-new-analysis';
    else if (filename.includes('history')) activeNavId = 'nav-history';
    else if (filename.includes('analysis.html')) activeNavId = 'nav-dashboard'; // Analysis report counts as dashboard context
    else if (filename.includes('interview')) activeNavId = 'nav-interview-prep';
    else if (filename.includes('profile')) activeNavId = 'nav-profile';
    else if (filename.includes('reports.html')) activeNavId = 'nav-reports';
    else if (filename.includes('settings')) activeNavId = 'nav-settings';

    if (activeNavId) {
      const activeNavEl = document.getElementById(activeNavId);
      if (activeNavEl) activeNavEl.classList.add('active');
    }
  }

  // Dynamically inject report sub-navigation tabs if on a report page
  const reportHeader = document.querySelector('.report-header-bar');
  if (reportHeader) {
    const activeReportId = urlParams.get('id');
    const hasActiveReportContext = !!activeReportId;
    
    if (hasActiveReportContext) {
      const activeIdVal = activeReportId || sessionStorage.getItem('activeAnalysisId');
      const isMock = urlParams.get('mock') === 'true';
      const mockQuery = isMock ? '&mock=true' : '';
      
      const subTabs = document.createElement('div');
      subTabs.className = 'report-sub-tabs';
      subTabs.style.cssText = 'display: flex; gap: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 2rem; padding-bottom: 0.5rem; overflow-x: auto; white-space: nowrap; width: 100%;';
      
      const currentFile = window.location.pathname.split('/').pop() || 'analysis.html';
      
      const tabsConfig = [
        { id: 'overview', name: 'Analysis Overview', file: 'analysis.html' },
        { id: 'skillgap', name: 'Skill Gaps', file: 'skill-gap.html' },
        { id: 'interview', name: 'Interview Prep', file: 'interview.html' },
        { id: 'roadmap', name: 'Career Roadmap', file: 'roadmap.html' }
      ];
      
      tabsConfig.forEach(tab => {
        const link = document.createElement('a');
        link.className = 'report-sub-tab';
        link.href = activeIdVal ? `${tab.file}?id=${activeIdVal}${mockQuery}` : `${tab.file}${isMock ? '?mock=true' : ''}`;
        link.textContent = tab.name;
        
        link.style.cssText = 'padding: 0.5rem 1rem; color: var(--text-muted); text-decoration: none; font-weight: 600; font-size: 0.9rem; border-bottom: 2px solid transparent; transition: all 0.2s; cursor: pointer;';
        
        link.addEventListener('mouseenter', () => {
          if (!link.classList.contains('active')) {
            link.style.color = 'var(--text-main)';
            link.style.borderBottomColor = 'rgba(16, 185, 129, 0.3)';
          }
        });
        link.addEventListener('mouseleave', () => {
          if (!link.classList.contains('active')) {
            link.style.color = 'var(--text-muted)';
            link.style.borderBottomColor = 'transparent';
          }
        });
        
        if (currentFile.includes(tab.file)) {
          link.classList.add('active');
          link.style.color = 'var(--emerald)';
          link.style.borderBottomColor = 'var(--emerald)';
        }
        
        subTabs.appendChild(link);
      });
      
      reportHeader.after(subTabs);
    }
  }

  // Hamburger toggles for mobile menu drawer with mobile-open/sidebar-open classes & overlay
  const btnHamburger = document.getElementById('btn-hamburger');
  if (btnHamburger) {
    let overlay = document.getElementById('sidebar-mobile-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebar-mobile-overlay';
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }

    btnHamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const appSidebarNav = document.getElementById('app-sidebar-nav');
      if (appSidebarNav) {
        const isOpen = appSidebarNav.classList.toggle('sidebar-open');
        appSidebarNav.classList.toggle('mobile-open', isOpen);
        btnHamburger.classList.toggle('active', isOpen);
        btnHamburger.setAttribute('aria-expanded', isOpen);
        overlay.classList.toggle('active', isOpen);
      }
    });

    overlay.addEventListener('click', () => {
      const appSidebarNav = document.getElementById('app-sidebar-nav');
      if (appSidebarNav) {
        appSidebarNav.classList.remove('sidebar-open');
        appSidebarNav.classList.remove('mobile-open');
        btnHamburger.classList.remove('active');
        btnHamburger.setAttribute('aria-expanded', 'false');
        overlay.classList.remove('active');
      }
    });
  }

  // Bind Logout
  document.addEventListener('click', async (e) => {
    if (e.target && (e.target.id === 'btn-logout' || e.target.closest('#btn-logout'))) {
      e.preventDefault();
      try {
        if (!isMockMode) {
          await auth.signOut();
        }
        sessionStorage.clear();
        const mockParam = isMockMode ? '?mock=true' : '';
        window.location.href = `index.html${mockParam}`;
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
  });

  // Reactive header synchronizer
  function updateHeaderUI(displayName, avatarUrl) {
    const dropdownUsername = document.getElementById('dropdown-username');
    const avatarDropdownBtn = document.getElementById('avatar-dropdown-btn');
    if (dropdownUsername) dropdownUsername.textContent = displayName;
    if (avatarDropdownBtn) {
      const user = auth.currentUser;
      const fallbackChar = user?.email?.charAt(0) || 'U';
      const nameParam = displayName || fallbackChar;
      const calculatedAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameParam)}&background=10b981&color=ffffff&size=128&bold=true`;
      
      avatarDropdownBtn.innerHTML = `<img src="${calculatedAvatarUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      avatarDropdownBtn.style.padding = '0';
    }
  }

  window.addEventListener('profile-updated', (e) => {
    const { displayName, avatarUrl } = e.detail;
    updateHeaderUI(displayName, avatarUrl);
  });

  window.addEventListener('storage', (e) => {
    if (e.key === 'profile_cache') {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed.displayName) {
          updateHeaderUI(parsed.displayName, parsed.avatarUrl || '');
        }
      } catch (err) {}
    }
  });

  // Check cache immediately on navigation load
  try {
    const cached = sessionStorage.getItem('profile_cache') || localStorage.getItem('profile_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.displayName) {
        // Run after DOM has resolved
        setTimeout(() => updateHeaderUI(parsed.displayName, parsed.avatarUrl || ''), 100);
      }
    }
  } catch (err) {}
});
