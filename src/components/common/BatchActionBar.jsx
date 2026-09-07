import React from 'react';

/**
 * Reusable Batch Action Bar for multi-selection across Data Management modules.
 * Only rendered when the parent enters "selection mode" manually.
 */
const BatchActionBar = ({
  selectedCount = 0,
  totalCount = 0,
  itemName = 'item',
  onSelectAll,
  onDeselectAll,
  onDeleteSelected,
  onDeleteAll,
  onExitSelectionMode,
  extraActions = null,
  disabled = false,
}) => {
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <div className={`batch-action-bar ${selectedCount > 0 ? 'active' : ''}`}>
      <div className="batch-action-left">
        <div className="batch-count-badge">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>
            <strong>{selectedCount}</strong> {selectedCount === 1 ? itemName : `${itemName}s`} selected
          </span>
        </div>

        {totalCount > 0 && (
          <span className="batch-total-hint">
            (of {totalCount} total)
          </span>
        )}

        <div className="batch-selection-toggles">
          {!isAllSelected && onSelectAll && totalCount > 0 && (
            <button
              type="button"
              className="batch-btn batch-btn-text"
              onClick={onSelectAll}
              disabled={disabled}
            >
              Select All ({totalCount})
            </button>
          )}

          {selectedCount > 0 && onDeselectAll && (
            <button
              type="button"
              className="batch-btn batch-btn-text text-muted"
              onClick={onDeselectAll}
              disabled={disabled}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="batch-action-right">
        {extraActions}

        {selectedCount > 0 && onDeleteSelected && (
          <button
            type="button"
            className="batch-btn batch-btn-danger"
            onClick={onDeleteSelected}
            disabled={disabled}
            title={`Delete ${selectedCount} selected ${selectedCount === 1 ? itemName : `${itemName}s`}`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            <span>Delete Selected ({selectedCount})</span>
          </button>
        )}

        {selectedCount === 0 && onDeleteAll && totalCount > 0 && (
          <button
            type="button"
            className="batch-btn batch-btn-outline-danger"
            onClick={onDeleteAll}
            disabled={disabled}
            title={`Delete all ${totalCount} ${itemName}s`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Delete All ({totalCount})</span>
          </button>
        )}

        {onExitSelectionMode && (
          <button
            type="button"
            className="batch-btn batch-btn-ghost"
            onClick={onExitSelectionMode}
            title="Exit selection mode"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>Done</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default BatchActionBar;
