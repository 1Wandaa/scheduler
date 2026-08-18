import React, { useState, useRef, useEffect } from 'react';

const CustomSelect = ({ options, value, onChange, placeholder, name, required, style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const flatOptions = options.flatMap(o => o.options || [o]);
  const selectedOption = flatOptions.find(o => String(o.value) === String(value));

  useEffect(() => {
    if (!isOpen) setSearch(selectedOption ? selectedOption.label : '');
  }, [isOpen, selectedOption]);

  const filteredOptions = options.map(group => {
    if (group.options) {
      return {
        ...group,
        options: group.options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      };
    }
    return group;
  }).filter(group => group.options ? group.options.length > 0 : group.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', ...style }}>
      <input
        type="text"
        className="form-select"
        value={isOpen ? search : (selectedOption ? selectedOption.label : '')}
        onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
        onFocus={() => { setIsOpen(true); setSearch(''); }}
        placeholder={placeholder}
        required={required && !value}
        style={{ width: '100%', paddingRight: '30px' }}
      />
      <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>
      {isOpen && (
        <div className="custom-dropdown-menu" style={{
           position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '220px', overflowY: 'auto',
           backgroundColor: 'var(--bg-main, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px',
           marginTop: '4px', zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column'
        }}>
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>No options found</div>
          ) : filteredOptions.map((opt, i) => {
            if (opt.options) {
              return (
                <div key={opt.label || i}>
                  <div style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary, #f8fafc)' }}>{opt.label}</div>
                  {opt.options.map(child => (
                    <div
                      key={child.value}
                      onClick={() => {
                        if (!child.disabled) {
                           onChange({ target: { name, value: child.value } });
                           setIsOpen(false);
                        }
                      }}
                      style={{
                        padding: '10px 12px', paddingLeft: '20px', cursor: child.disabled ? 'not-allowed' : 'pointer',
                        color: child.disabled ? 'var(--text-muted)' : 'var(--text-main)',
                        textDecoration: child.disabled ? 'line-through' : 'none',
                        borderBottom: '1px solid var(--border-color, #e2e8f0)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = child.disabled ? 'transparent' : 'var(--table-header, #f1f5f9)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {child.label}
                    </div>
                  ))}
                </div>
              );
            } else {
              return (
                <div
                  key={opt.value}
                  onClick={() => {
                    if (!opt.disabled) {
                       onChange({ target: { name, value: opt.value } });
                       setIsOpen(false);
                    }
                  }}
                  style={{
                    padding: '10px 12px', cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    color: opt.disabled ? 'var(--text-muted)' : 'var(--text-main)',
                    textDecoration: opt.disabled ? 'line-through' : 'none',
                    borderBottom: '1px solid var(--border-color, #e2e8f0)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = opt.disabled ? 'transparent' : 'var(--table-header, #f1f5f9)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {opt.label}
                </div>
              );
            }
          })}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
