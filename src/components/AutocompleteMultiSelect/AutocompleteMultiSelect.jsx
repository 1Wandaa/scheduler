import React, { useState, useRef, useEffect } from 'react';
import './AutocompleteMultiSelect.css';
import { Search, ChevronDown } from 'lucide-react';

const AutocompleteMultiSelect = ({ 
  options = [], 
  selectedIds = [], 
  onToggle, 
  placeholder = "Search...", 
  renderOption,
  renderChip,
  searchQuery = '',
  setSearchQuery,
  noOptionsMessage = "No options found.",
  inputId,
  allOptions
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter out options that are already selected
  const unselectedOptions = options.filter(opt => {
    // Check by ID or fallback properties
    return !selectedIds.includes(opt.id) && !selectedIds.includes(opt.name) && !selectedIds.includes(opt.code);
  });

  const baseOptionsForSelection = allOptions || options;
  const selectedOptions = baseOptionsForSelection.filter(opt => {
    return selectedIds.includes(opt.id) || selectedIds.includes(opt.name) || selectedIds.includes(opt.code);
  });

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleOptionClick = (option) => {
    onToggle(option);
    setSearchQuery('');
    // Keep focus on input for fast multi-selection
    inputRef.current?.focus();
  };

  return (
    <div className={`autocomplete-container ${isOpen ? 'is-open' : ''}`} ref={containerRef}>
      
      {/* Selected Chips Area */}
      {selectedOptions.length > 0 && (
        <div className="autocomplete-chips-area">
          {selectedOptions.map(opt => (
            <div key={opt.id} className="autocomplete-chip-wrapper">
              {renderChip(opt, () => onToggle(opt))}
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className={`autocomplete-input-wrapper ${isOpen ? 'focused' : ''}`} onClick={() => inputRef.current?.focus()}>
        <Search size={16} className="autocomplete-search-icon" />
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          className="autocomplete-input"
          placeholder={selectedOptions.length > 0 ? "Search to add more..." : placeholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={handleInputFocus}
        />
        <ChevronDown size={16} className={`autocomplete-chevron ${isOpen ? 'open' : ''}`} />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="autocomplete-dropdown">
          {options.length === 0 ? (
            <div className="autocomplete-empty">{noOptionsMessage}</div>
          ) : (
            <div className="autocomplete-options-list">
              {options.map(opt => {
                const isSelected = selectedIds.includes(opt.id) || selectedIds.includes(opt.name) || selectedIds.includes(opt.code);
                return (
                  <div 
                    key={opt.id} 
                    className={`autocomplete-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleOptionClick(opt)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: isSelected ? 0.7 : 1, background: isSelected ? 'var(--bg-main)' : '' }}
                  >
                    <div style={{ flex: 1 }}>
                      {renderOption ? renderOption(opt) : <span className="default-option">{opt.name || opt.code || opt.id}</span>}
                    </div>
                    {isSelected && (
                      <div style={{ marginLeft: '10px', color: 'var(--accent-primary)', fontSize: '1.2rem', fontWeight: 'bold' }}>
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
