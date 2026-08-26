import React, { useState, useRef, useEffect } from 'react';

const CustomSelect = ({ options = [], value, onChange, placeholder = 'Select...', name, required, style, allowDeselect = true }) => {
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

  const safeOptions = Array.isArray(options) ? options : [];
  const flatOptions = safeOptions.flatMap(o => (o && o.options) ? o.options : (o ? [o] : []));
  const selectedOption = flatOptions.find(o => o && String(o.value) === String(value));

  useEffect(() => {
    if (!isOpen) setSearch(selectedOption ? selectedOption.label : '');
  }, [isOpen, selectedOption]);

  const query = (search || '').toLowerCase();
  const filteredOptions = safeOptions.map(group => {
    if (!group) return null;
    if (group.options) {
      const groupLabelMatches = (group.label || '').toLowerCase().includes(query);
      return {
        ...group,
        options: group.options.filter(o => 
          groupLabelMatches || (o.label || '').toLowerCase().includes(query)
        )
      };
    }
    return group;
  }).filter(group => {
    if (!group) return false;
    return group.options ? group.options.length > 0 : (group.label || '').toLowerCase().includes(query);
  });

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', ...style }}>
      <input
        type="text"
        className="form-select"
        value={isOpen ? search : (selectedOption ? selectedOption.label : '')}
        onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
        onFocus={() => { setIsOpen(true); setSearch(''); }}
        onClick={() => { if (!isOpen) { setIsOpen(true); setSearch(''); } }}
        placeholder={placeholder}
        required={required && !value}
        style={{ width: '100%', paddingRight: '30px', cursor: 'pointer' }}
      />
      <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>
      {isOpen && (
        <div className="custom-dropdown-menu" style={{
           position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '220px', overflowY: 'auto',
           backgroundColor: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px',
           marginTop: '4px', zIndex: 1000, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column'
        }}>
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No options found</div>
          ) : filteredOptions.map((opt, i) => {
            if (opt.options) {
              return (
                <div key={opt.label || i}>
                  <div style={{ padding: '8px 12px', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary, #f8fafc)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{opt.label}</div>
                  {opt.options.map(child => {
                    const isSelected = String(child.value) === String(value);
                    return (
                      <div
                        key={child.value}
                        onClick={() => {
                          if (!child.disabled) {
                            const nextValue = (allowDeselect && isSelected) ? '' : child.value;
                            onChange({ target: { name, value: nextValue } });
                            setIsOpen(false);
                          }
                        }}
                        style={{
                          padding: '10px 12px', paddingLeft: '20px', cursor: child.disabled ? 'not-allowed' : 'pointer',
                          color: child.disabled ? 'var(--text-muted)' : 'var(--text-main)',
                          textDecoration: child.disabled ? 'line-through' : 'none',
                          borderBottom: '1px solid var(--border-color, #e2e8f0)',
                          backgroundColor: isSelected ? 'var(--accent-primary-light, rgba(99,102,241,0.1))' : 'transparent',
                          fontWeight: isSelected ? '600' : '400',
                          fontSize: '0.88rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                        onMouseEnter={(e) => {
                          if (!child.disabled) e.currentTarget.style.backgroundColor = 'var(--table-header, #f1f5f9)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = isSelected ? 'var(--accent-primary-light, rgba(99,102,241,0.1))' : 'transparent';
                        }}
                      >
                        <span>{child.label}</span>
                        {child.badge && (
                          <span style={{ fontSize: '0.72rem', color: child.badgeColor || '#ef4444', fontWeight: 600, marginLeft: '8px' }}>
                            {child.badge}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            } else {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={opt.value}
                  onClick={() => {
                    if (!opt.disabled) {
                      const nextValue = (allowDeselect && isSelected) ? '' : opt.value;
                      onChange({ target: { name, value: nextValue } });
                      setIsOpen(false);
                    }
                  }}
                  style={{
                    padding: '10px 12px', cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    color: opt.disabled ? 'var(--text-muted)' : 'var(--text-main)',
                    textDecoration: opt.disabled ? 'line-through' : 'none',
                    borderBottom: '1px solid var(--border-color, #e2e8f0)',
                    backgroundColor: isSelected ? 'var(--accent-primary-light, rgba(99,102,241,0.1))' : 'transparent',
                    fontWeight: isSelected ? '600' : '400',
                    fontSize: '0.88rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    if (!opt.disabled) e.currentTarget.style.backgroundColor = 'var(--table-header, #f1f5f9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected ? 'var(--accent-primary-light, rgba(99,102,241,0.1))' : 'transparent';
                  }}
                >
                  <span>{opt.label}</span>
                  {opt.badge && (
                    <span style={{ fontSize: '0.72rem', color: opt.badgeColor || '#ef4444', fontWeight: 600, marginLeft: '8px' }}>
                      {opt.badge}
                    </span>
                  )}
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
