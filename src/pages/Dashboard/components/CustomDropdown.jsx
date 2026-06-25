import React, { useState, useEffect, useRef } from 'react';

const CustomDropdown = ({ options, value, onChange, title, alignRight = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }} title={title}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          cursor: 'pointer', color: '#ffffff', fontSize: '0.88rem', fontWeight: 600, letterSpacing: '0.01em',
          padding: '4px 6px', borderRadius: '6px',
          background: isOpen ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
          transition: 'all 0.2s ease',
          userSelect: 'none',
          whiteSpace: 'nowrap'
        }}
      >
        <span>{value}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      
      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', 
          left: alignRight ? 'auto' : 0,
          right: alignRight ? 0 : 'auto',
          background: 'rgba(15, 20, 35, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          padding: '6px',
          minWidth: '200px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          zIndex: 9999,
          animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex', flexDirection: 'column', gap: '2px'
        }} className="custom-dropdown-menu">
          {options.map(opt => (
            <div 
              key={opt}
              onClick={() => { onChange(opt); setIsOpen(false); }}
              onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = opt === value ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.8)';
              }}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.86rem',
                color: opt === value ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.8)',
                fontWeight: opt === value ? 600 : 500,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {opt}
              {opt === value && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;
