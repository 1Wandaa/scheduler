import React, { useState, useEffect, useRef } from 'react';

const DraggableSpeedDial = ({ onAddSchedule, onAutoScheduleAction, isHidden }) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 76, y: window.innerHeight - 136 });
  const [isOpen, setIsOpen] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0, dragged: false, isDragging: false });

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 56),
        y: Math.min(prev.y, window.innerHeight - 56)
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
      setPosition({
        x: Math.max(0, Math.min(dragRef.current.initialX + dx, window.innerWidth - 56)),
        y: Math.max(0, Math.min(dragRef.current.initialY + dy, window.innerHeight - 56))
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

  return (
    <>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setIsOpen(false)} />
      )}
      <div 
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
          bottom: '68px',
          right: '0px',
          display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end',
          opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none',
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
          transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Full Timetable (GA)</span>
            <button onClick={() => { setIsOpen(false); onAutoScheduleAction('ga'); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: '#6366f1', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Gen. by Faculty</span>
            <button onClick={() => { setIsOpen(false); onAutoScheduleAction('faculty'); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: '#10b981', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Gen. by Room</span>
            <button onClick={() => { setIsOpen(false); onAutoScheduleAction('room'); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: '#f59e0b', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Gen. by Section</span>
            <button onClick={() => { setIsOpen(false); onAutoScheduleAction('section'); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: '#8b5cf6', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>Manual Schedule</span>
            <button onClick={() => { setIsOpen(false); onAddSchedule(); }} style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff', color: 'var(--accent-primary)', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
        </div>

        {/* Main FAB */}
        <button
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
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
    </>
  );
};

export default DraggableSpeedDial;
