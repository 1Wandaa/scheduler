import React, { useState, useRef, useEffect, useCallback } from 'react';
import './AutocompleteMultiSelect.css';
import { Search, ChevronDown, X, CheckSquare, Square } from 'lucide-react';

const AutocompleteMultiSelect = ({ 
  options = [], 
  selectedIds = [], 
  onToggle, 
  onBatchSelect,
  onBatchDeselect,
  placeholder = "Search...", 
  renderOption,
  renderChip,
  searchQuery = '',
  setSearchQuery,
  noOptionsMessage = "No options found.",
  inputId,
  allOptions,
  allowBatchActions = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const optionsListRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const baseOptionsForSelection = allOptions || options;
  const selectedOptions = baseOptionsForSelection.filter(opt => {
    return selectedIds.some(sid => 
      String(sid).toLowerCase() === String(opt.id).toLowerCase() || 
      String(sid).toLowerCase() === String(opt.code).toLowerCase() || 
      String(sid).toLowerCase() === String(opt.name).toLowerCase()
    );
  });

  // Track tokens matched by available options
  const matchedTokens = new Set();
  selectedOptions.forEach(opt => {
    if (opt.id) matchedTokens.add(String(opt.id).toLowerCase());
    if (opt.code) matchedTokens.add(String(opt.code).toLowerCase());
    if (opt.name) matchedTokens.add(String(opt.name).toLowerCase());
  });

  // Any ID in selectedIds that doesn't correspond to any known option object
  const unmatchedIds = selectedIds.filter(id => !matchedTokens.has(String(id).toLowerCase()));

  const availableOptionsToSelect = options.filter(opt => {
    const isSelected = selectedIds.some(sid => 
      String(sid).toLowerCase() === String(opt.id).toLowerCase() || 
      String(sid).toLowerCase() === String(opt.code).toLowerCase() || 
      String(sid).toLowerCase() === String(opt.name).toLowerCase()
    );
    return !isSelected && !opt.disabled;
  });

  const visibleSelectedOptions = options.filter(opt => {
    return selectedIds.some(sid => 
      String(sid).toLowerCase() === String(opt.id).toLowerCase() || 
      String(sid).toLowerCase() === String(opt.code).toLowerCase() || 
      String(sid).toLowerCase() === String(opt.name).toLowerCase()
    );
  });

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleOptionClick = (option) => {
    if (option.disabled) return;
    onToggle(option);
    // Keep focus on input for fast multi-selection
    inputRef.current?.focus();
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
        setActiveIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => {
        const next = prev < options.length - 1 ? prev + 1 : 0;
        scrollOptionIntoView(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => {
        const next = prev > 0 ? prev - 1 : options.length - 1;
        scrollOptionIntoView(next);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < options.length) {
        const opt = options[activeIndex];
        if (opt && !opt.disabled) {
          handleOptionClick(opt);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const scrollOptionIntoView = (index) => {
    if (!optionsListRef.current) return;
    const items = optionsListRef.current.querySelectorAll('.autocomplete-option');
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  // Select all visible options
  const handleSelectAllVisible = (e) => {
    e.stopPropagation();
    if (onBatchSelect && availableOptionsToSelect.length > 0) {
      onBatchSelect(availableOptionsToSelect);
    } else {
      availableOptionsToSelect.forEach(opt => onToggle(opt));
    }
    inputRef.current?.focus();
  };

  // Deselect all visible options
  const handleDeselectAllVisible = (e) => {
    e.stopPropagation();
    if (onBatchDeselect && visibleSelectedOptions.length > 0) {
      onBatchDeselect(visibleSelectedOptions);
    } else {
      visibleSelectedOptions.forEach(opt => onToggle(opt));
    }
    inputRef.current?.focus();
  };

  return (
    <div className={`autocomplete-container ${isOpen ? 'is-open' : ''}`} ref={containerRef}>
      
      {/* Selected Chips Area */}
      {(selectedOptions.length > 0 || unmatchedIds.length > 0) && (
        <div className="autocomplete-chips-area">
          {selectedOptions.map(opt => (
            <div key={opt.id} className="autocomplete-chip-wrapper">
              {renderChip ? (
                renderChip(opt, () => onToggle(opt))
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '3px 10px', borderRadius: '16px',
                  background: 'rgba(86, 69, 238, 0.1)', border: '1px solid rgba(86, 69, 238, 0.25)',
                  fontSize: '0.78rem', fontWeight: '600', color: 'var(--accent-primary, #5645ee)'
                }}>
                  <span>{opt.code || opt.name || opt.id}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggle(opt); }}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7 }}
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Unmatched / Legacy Orphan IDs (like S18) rendered with clear warning and working remove button */}
          {unmatchedIds.map(orphanId => (
            <div key={orphanId} className="autocomplete-chip-wrapper">
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '3px 10px', borderRadius: '16px',
                background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)',
                fontSize: '0.78rem', fontWeight: '700', color: '#dc2626'
              }}>
                <span title="Unmatched/Legacy subject not found in subjects list">⚠️ {orphanId}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggle(orphanId); }}
                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.85 }}
                  title={`Remove ${orphanId}`}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div 
        className={`autocomplete-input-wrapper ${isOpen ? 'focused' : ''}`} 
        onClick={() => inputRef.current?.focus()}
      >
        <Search size={16} className="autocomplete-search-icon" />
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          className="autocomplete-input"
          placeholder={selectedOptions.length > 0 ? `Add more... (${selectedOptions.length} selected)` : placeholder}
          value={searchQuery}
          onChange={(e) => {
            if (setSearchQuery) setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setActiveIndex(0);
          }}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
        />

        {/* Clear query button */}
        {searchQuery && (
          <button
            type="button"
            className="autocomplete-clear-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (setSearchQuery) setSearchQuery('');
              inputRef.current?.focus();
            }}
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}

        {/* Count badge */}
        {selectedOptions.length > 0 && (
          <span className="autocomplete-selected-badge">
            {selectedOptions.length} selected
          </span>
        )}

        <button 
          type="button" 
          className="autocomplete-chevron-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(prev => !prev);
          }}
        >
          <ChevronDown size={16} className={`autocomplete-chevron ${isOpen ? 'open' : ''}`} />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="autocomplete-dropdown">
          {/* Header Bar with Batch Actions */}
          {allowBatchActions && options.length > 0 && (
            <div className="autocomplete-dropdown-header">
              <span className="autocomplete-count-label">
                {options.length} option{options.length !== 1 ? 's' : ''} ({visibleSelectedOptions.length} checked)
              </span>

              <div className="autocomplete-batch-actions">
                {availableOptionsToSelect.length > 0 && (
                  <button
                    type="button"
                    className="autocomplete-batch-btn"
                    onClick={handleSelectAllVisible}
                  >
                    Select All ({availableOptionsToSelect.length})
                  </button>
                )}
                {visibleSelectedOptions.length > 0 && (
                  <button
                    type="button"
                    className="autocomplete-batch-btn deselect"
                    onClick={handleDeselectAllVisible}
                  >
                    Deselect All
                  </button>
                )}
              </div>
            </div>
          )}

          {options.length === 0 ? (
            <div className="autocomplete-empty">{noOptionsMessage}</div>
          ) : (
            <div className="autocomplete-options-list" ref={optionsListRef}>
              {options.map((opt, idx) => {
                const isSelected = selectedIds.includes(opt.id) || selectedIds.includes(opt.name) || selectedIds.includes(opt.code);
                const isDisabled = !!opt.disabled;
                const isItemActive = idx === activeIndex;

                return (
                  <div 
                    key={opt.id} 
                    className={`autocomplete-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''} ${isItemActive ? 'keyboard-active' : ''}`}
                    onClick={() => handleOptionClick(opt)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    title={opt.disabledReason || ''}
                  >
                    <div className="autocomplete-checkbox-col">
                      {isSelected ? (
                        <CheckSquare size={16} className="autocomplete-checkbox checked" />
                      ) : (
                        <Square size={16} className="autocomplete-checkbox unchecked" />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renderOption ? renderOption(opt) : <span className="default-option">{opt.name || opt.code || opt.id}</span>}
                    </div>

                    {isSelected && (
                      <div className="autocomplete-check-indicator">
                        ✓
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default AutocompleteMultiSelect;
