import React, { useState, useRef, useEffect, useCallback } from 'react';
import './AutocompleteMultiSelect.css';
import { Search, ChevronDown, X, CheckSquare, Square, Check } from 'lucide-react';

const AutocompleteMultiSelect = ({ 
  options = [], 
  selectedIds = [], 
  onToggle, 
  onBatchSelect,
  onBatchDeselect,
  placeholder = "Search...", 
  renderOption,
  renderChip,
  searchQuery,
  setSearchQuery,
  noOptionsMessage = "No options found.",
  inputId,
  allOptions,
  allowBatchActions = true,
  matchIdOnly = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [internalQuery, setInternalQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const optionsListRef = useRef(null);

  const actualQuery = searchQuery !== undefined ? searchQuery : internalQuery;
  const updateQuery = (val) => {
    if (setSearchQuery) setSearchQuery(val);
    else setInternalQuery(val);
  };

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
    return selectedIds.some(sid => {
      if (String(sid).toLowerCase() === String(opt.id).toLowerCase()) return true;
      if (matchIdOnly) return false;
      return (
        (opt.code && String(sid).toLowerCase() === String(opt.code).toLowerCase()) || 
        (opt.name && String(sid).toLowerCase() === String(opt.name).toLowerCase())
      );
    });
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

  // Internal filtering for options based on actualQuery
  const displayedOptions = options.filter(opt => {
    if (!actualQuery.trim()) return true;
    
    // Make search space and hyphen insensitive
    const cleanStr = (s) => String(s || '').toLowerCase().replace(/[\s\-_]/g, '');
    const q = cleanStr(actualQuery);
    
    const idMatch = cleanStr(opt.id).includes(q);
    const codeMatch = cleanStr(opt.code).includes(q);
    const nameMatch = cleanStr(opt.name).includes(q);
    
    return idMatch || codeMatch || nameMatch;
  });

  const availableOptionsToSelect = displayedOptions.filter(opt => {
    const isSelected = selectedIds.some(sid => 
      String(sid).toLowerCase() === String(opt.id).toLowerCase() || 
      String(sid).toLowerCase() === String(opt.code).toLowerCase() || 
      String(sid).toLowerCase() === String(opt.name).toLowerCase()
    );
    return !isSelected && !opt.disabled;
  });

  const visibleSelectedOptions = displayedOptions.filter(opt => {
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
        const next = prev < displayedOptions.length - 1 ? prev + 1 : 0;
        scrollOptionIntoView(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => {
        const next = prev > 0 ? prev - 1 : displayedOptions.length - 1;
        scrollOptionIntoView(next);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < displayedOptions.length) {
        const opt = displayedOptions[activeIndex];
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
                <div className="autocomplete-default-chip">
                  <span className="autocomplete-chip-label">
                    {opt.code || opt.courseCode || opt.subjectCode || opt.name || opt.id}
                  </span>
                  {opt.name && (opt.code || opt.courseCode || opt.subjectCode) && (opt.code || opt.courseCode || opt.subjectCode) !== opt.name && (
                    <span className="autocomplete-chip-sublabel">
                      ({opt.name})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggle(opt); }}
                    className="autocomplete-chip-remove-btn"
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
              <div className="autocomplete-orphan-chip">
                <span title="Unmatched/Legacy item not found in registered records">⚠️ {orphanId}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggle(orphanId); }}
                  className="autocomplete-orphan-remove-btn"
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
          value={actualQuery}
          onChange={(e) => {
            updateQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setActiveIndex(0);
          }}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
        />

        {/* Clear query button */}
        {actualQuery && (
          <button
            type="button"
            className="autocomplete-clear-btn"
            onClick={(e) => {
              e.stopPropagation();
              updateQuery('');
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
          {allowBatchActions && displayedOptions.length > 0 && (
            <div className="autocomplete-dropdown-header">
              <span className="autocomplete-count-label">
                {displayedOptions.length} option{displayedOptions.length !== 1 ? 's' : ''} ({visibleSelectedOptions.length} checked)
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

          {displayedOptions.length === 0 ? (
            <div className="autocomplete-empty">{noOptionsMessage}</div>
          ) : (
            <div className="autocomplete-options-list" ref={optionsListRef}>
              {displayedOptions.map((opt, idx) => {
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
                      {renderOption ? renderOption(opt) : (() => {
                        const codeVal = opt.code || opt.courseCode || opt.subjectCode;
                        const nameVal = opt.name || opt.title || opt.label;
                        const hasDistinctCode = codeVal && nameVal && String(codeVal).trim().toLowerCase() !== String(nameVal).trim().toLowerCase();

                        return (
                          <div className="autocomplete-default-row">
                            {hasDistinctCode ? (
                              <>
                                <span className="autocomplete-code-badge">{codeVal}</span>
                                <span className="autocomplete-name-text" title={nameVal}>{nameVal}</span>
                              </>
                            ) : (
                              <span className="autocomplete-name-text" title={nameVal || codeVal || opt.id}>
                                {nameVal || codeVal || opt.id}
                              </span>
                            )}
                            {opt.credits && (
                              <span className="autocomplete-credits-badge">{opt.credits}u</span>
                            )}
                            {opt.department && (
                              <span className="autocomplete-dept-badge">{opt.department}</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {isSelected && (
                      <div className="autocomplete-check-indicator" title="Selected">
                        <Check size={12} strokeWidth={2.8} />
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

