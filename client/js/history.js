import { auth, isMockMode } from './firebase-config.js';
import { FirebaseService } from './api.js';
import { escapeHTML, showToast, getCompatibilityDetails } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const historySearchInput = document.getElementById('history-search-input');
  const historySortSelect = document.getElementById('history-sort-select');
  const historyCardsGrid = document.getElementById('history-cards-grid');
  const historyLoader = document.getElementById('history-loader');
  const historyEmptyState = document.getElementById('history-empty-state');
  const historyPagination = document.getElementById('history-pagination');
  const btnHistoryPrev = document.getElementById('btn-history-prev');
  const btnHistoryNext = document.getElementById('btn-history-next');
  const historyPageInfo = document.getElementById('history-page-info');

  let cachedHistory = [];
  let historySearchQuery = '';
  let historySortOrder = 'date-desc';
  let historyCurrentPage = 1;
  const historyItemsPerPage = 6;

  // Active deletion properties & modal targets
  let activeDeleteId = null;
  const deleteModal = document.getElementById('delete-confirm-modal');
  const deleteModalReportName = document.getElementById('delete-modal-report-name');
  const deleteModalCancel = document.getElementById('delete-modal-cancel');
  const deleteModalConfirm = document.getElementById('delete-modal-confirm');

  async function loadHistoryCatalog() {
    if (!historyCardsGrid) return;
    
    historyCardsGrid.innerHTML = '';
    if (historyEmptyState) historyEmptyState.style.display = 'none';
    if (historyPagination) historyPagination.style.display = 'none';
    if (historyLoader) historyLoader.style.display = 'grid';

    try {
      if (cachedHistory.length === 0) {
        cachedHistory = await FirebaseService.loadAnalysisHistory();
      }

      if (historyLoader) historyLoader.style.display = 'none';

      let filtered = cachedHistory;
      if (historySearchQuery) {
        const query = historySearchQuery.toLowerCase().trim();
        filtered = filtered.filter(item => 
          item.resumeName.toLowerCase().includes(query)
        );
      }

      if (historySortOrder === 'date-desc') {
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } else if (historySortOrder === 'date-asc') {
        filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      } else if (historySortOrder === 'score-desc') {
        filtered.sort((a, b) => b.score - a.score);
      } else if (historySortOrder === 'score-asc') {
        filtered.sort((a, b) => a.score - b.score);
      }

      if (filtered.length === 0) {
        if (historyEmptyState) historyEmptyState.style.display = 'block';
        return;
      }
      if (historyEmptyState) historyEmptyState.style.display = 'none';

      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / historyItemsPerPage);
      
      if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
      if (historyCurrentPage < 1) historyCurrentPage = 1;

      const startIndex = (historyCurrentPage - 1) * historyItemsPerPage;
      const endIndex = Math.min(startIndex + historyItemsPerPage, totalItems);
      const paginatedItems = filtered.slice(startIndex, endIndex);

      paginatedItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';

        const dateStr = new Date(item.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const details = getCompatibilityDetails(item.score, item, item.weights);
        const ratingClass = details.ratingClass;
        const levelLabel = `Compatibility: ${details.label}`;

        const escapedName = escapeHTML(item.resumeName);
        card.innerHTML = `
          <div class="history-card-header">
            <h4 class="history-card-title" title="${escapedName}">${escapedName}</h4>
            <span class="history-card-date">Parsed: ${dateStr}</span>
          </div>
          <div class="history-card-body">
            <div class="history-card-score-info">
              <span class="history-card-score-value ${ratingClass}">${item.score}/100</span>
              <span class="history-card-level ${ratingClass}">${levelLabel}</span>
            </div>
            <span class="history-card-badge ${ratingClass}">${ratingClass}</span>
          </div>
          <div class="history-card-actions">
            <button class="btn-history-card-action view" data-id="${item.analysisId}" aria-label="View analysis report for ${escapedName}">Report</button>
            <button class="btn-history-card-action delete" data-id="${item.analysisId}" title="Delete Record" aria-label="Delete analysis record for ${escapedName}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        `;

        // Bind View Action
        card.querySelector('.btn-history-card-action.view').addEventListener('click', () => {
          const mockParam = isMockMode ? '&mock=true' : '';
          window.location.href = `analysis.html?id=${item.analysisId}${mockParam}`;
        });

        // Bind Delete Action
        card.querySelector('.btn-history-card-action.delete').addEventListener('click', () => {
          activeDeleteId = item.analysisId;
          if (deleteModalReportName) {
            deleteModalReportName.textContent = `"${item.resumeName}"`;
          }
          if (deleteModal) {
            deleteModal.style.display = 'flex';
          }
        });

        historyCardsGrid.appendChild(card);
      });

      // Update Pagination UI
      if (totalPages > 1) {
        if (historyPagination) historyPagination.style.display = 'flex';
        if (historyPageInfo) historyPageInfo.textContent = `Page ${historyCurrentPage} of ${totalPages}`;
        
        if (btnHistoryPrev) btnHistoryPrev.disabled = (historyCurrentPage === 1);
        if (btnHistoryNext) btnHistoryNext.disabled = (historyCurrentPage === totalPages);
      } else {
        if (historyPagination) historyPagination.style.display = 'none';
      }

    } catch (err) {
      console.error('Error loading history catalog:', err);
      showToast('Error loading history catalog.', 'error');
      if (historyLoader) historyLoader.style.display = 'none';
    }
  }

  // Bind Event Listeners
  if (historySearchInput) {
    historySearchInput.addEventListener('input', (e) => {
      historySearchQuery = e.target.value;
      historyCurrentPage = 1;
      loadHistoryCatalog();
    });
  }

  if (historySortSelect) {
    historySortSelect.addEventListener('change', (e) => {
      historySortOrder = e.target.value;
      historyCurrentPage = 1;
      loadHistoryCatalog();
    });
  }

  if (btnHistoryPrev) {
    btnHistoryPrev.addEventListener('click', () => {
      if (historyCurrentPage > 1) {
        historyCurrentPage--;
        loadHistoryCatalog();
      }
    });
  }

  if (btnHistoryNext) {
    btnHistoryNext.addEventListener('click', () => {
      historyCurrentPage++;
      loadHistoryCatalog();
    });
  }

  // --- Deletion Confirmation Modal Handlers ---
  if (deleteModalCancel && deleteModal) {
    deleteModalCancel.addEventListener('click', (e) => {
      e.preventDefault();
      deleteModal.style.display = 'none';
      activeDeleteId = null;
    });
  }

  if (deleteModalConfirm && deleteModal) {
    deleteModalConfirm.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!activeDeleteId) return;

      deleteModalConfirm.disabled = true;
      deleteModalConfirm.textContent = 'Deleting...';

      try {
        showToast('Deleting analysis record...', 'info');
        await FirebaseService.deleteAnalysis(activeDeleteId);
        cachedHistory = []; // Reset cache to trigger reload
        showToast('Analysis deleted successfully!');
        deleteModal.style.display = 'none';
        loadHistoryCatalog();
      } catch (err) {
        console.error('Delete error:', err);
        showToast('Failed to delete analysis record.', 'error');
      } finally {
        deleteModalConfirm.disabled = false;
        deleteModalConfirm.textContent = 'Yes, Delete Report';
        activeDeleteId = null;
      }
    });
  }

  if (deleteModal) {
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) {
        deleteModal.style.display = 'none';
        activeDeleteId = null;
      }
    });
  }

  auth.onAuthStateChanged((user) => {
    if (user || isMockMode) {
      loadHistoryCatalog();
    }
  });
});
