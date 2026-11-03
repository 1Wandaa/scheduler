import React, { useState, useEffect, useRef } from 'react';

const DraggableSpeedDial = ({ onAddSchedule, onAutoScheduleAction, isHidden }) => {
  const [position, setPosition] = useState({ 
    x: window.innerWidth - 76, 
    y: window.innerWidth <= 768 ? window.innerHeight - 146 : window.innerHeight - 136 
  });
  const [isOpen, setIsOpen] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0, dragged: false, isDragging: false });

  useEffect(() => {
    const handleResize = () => {
      const bottomLimit = window.innerWidth <= 768 ? 130 : 66;
      setPosition(prev => ({
        x: Math.max(10, Math.min(prev.x, window.innerWidth - 66)),
        y: Math.max(10, Math.min(prev.y, window.innerHeight - bottomLimit))
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use passive touch listeners on the document to avoid React's synthetic event issues
  const handleStart = (clientX, clientY) => {
    dragRef.current.startX = clientX;
    dragRef.current.startY = clientY;
    dragRef.current.initialX = position.x;
    dragRef.current.initialY = position.y;
    dragRef.current.dragged = false;
    dragRef.current.isDragging = true;
  };

  const handleMove = (clientX, clientY) => {
    if (!dragRef.current.isDragging) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      dragRef.current.dragged = true;
      const bottomLimit = window.innerWidth <= 768 ? 130 : 66;
      setPosition({
        x: Math.max(10, Math.min(dragRef.current.initialX + dx, window.innerWidth - 66)),
        y: Math.max(10, Math.min(dragRef.current.initialY + dy, window.innerHeight - bottomLimit))
      });
    }
  };

  const handleEnd = (e) => {
    if (e && e.cancelable) e.preventDefault(); // Prevent ghost mouse events on mobile
    if (!dragRef.current.isDragging) return;
    dragRef.current.isDragging = false;
    if (!dragRef.current.dragged) {
      setIsOpen(prev => !prev);
    }
  };

  const openDownwards = position.y < 320;
  const alignLeft = position.x < 220;

  const actions = [
    {
      label: 'Full Timetable (GA)',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>,
      color: '#6366f1',
      action: () => onAutoScheduleAction('ga')
    },
    {
      label: 'Gen. by Faculty',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
      color: '#10b981',
      action: () => onAutoScheduleAction('faculty')
    },
    {
      label: 'Gen. by Room',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>,
      color: '#f59e0b',
      action: () => onAutoScheduleAction('room')
    },
    {
      label: 'Gen. by Section',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
      color: '#8b5cf6',
      action: () => onAutoScheduleAction('section')
    },
    {
      label: 'Manual Schedule',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>,
      color: 'var(--accent-primary)',
      action: () => onAddSchedule()
    }
  ];

  return (
    <>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setIsOpen(false)} />
      )}
      <div 
        className="speed-dial-wrapper"
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: '56px',
          height: '56px',
          zIndex: 9999,
          touchAction: 'none',
          display: isHidden ? 'none' : 'block'
        }}
      >
        {/* Speed Dial Menu Items */}
        <div style={{ 
          position: 'absolute',
          top: openDownwards ? '68px' : 'auto',
          bottom: openDownwards ? 'auto' : '68px',
          left: alignLeft ? '0px' : 'auto',
          right: alignLeft ? 'auto' : '0px',
          display: 'flex', 
          flexDirection: openDownwards ? 'column-reverse' : 'column', 
          gap: '10px', 
          alignItems: alignLeft ? 'flex-start' : 'flex-end',
          opacity: isOpen ? 1 : 0, 
          pointerEvents: isOpen ? 'auto' : 'none',
          transform: isOpen 
            ? 'translateY(0) scale(1)' 
            : `${openDownwards ? 'translateY(-20px)' : 'translateY(20px)'} scale(0.8)`,
          transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          {actions.map((act, idx) => (
            <div 
              key={idx} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                flexDirection: alignLeft ? 'row-reverse' : 'row'
              }}
            >
              <span style={{ 
                background: '#fff', 
                padding: '6px 12px', 
                borderRadius: '8px', 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                color: 'var(--text-main)', 
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)', 
                whiteSpace: 'nowrap',
                maxWidth: 'calc(100vw - 80px)',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {act.label}
              </span>
              <button 
                onClick={() => { setIsOpen(false); act.action(); }} 
                style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '50%', 
                  background: '#fff', 
                  color: act.color, 
                  border: 'none', 
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {act.icon}
              </button>
            </div>
          ))}
        </div>

        {/* Main FAB */}
        <button
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          
          onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleEnd}
          style={{
            width: '100%', height: '100%', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-primary), #7c3aed)',
            color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(86,69,238,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab',
            transform: isOpen ? 'rotate(45deg)' : 'none',
            transition: 'transform 0.2s ease',
            touchAction: 'none',
            position: 'absolute', top: 0, left: 0
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
      <style>{`
        /* Scale down the entire speed dial on mobile devices to look clean and uniform */
        @media (max-width: 768px) {
          .speed-dial-wrapper {
            transform: scale(0.85);
            transform-origin: center center;
          }
        }
      `}</style>
    </>
  );
};

export default DraggableSpeedDial;