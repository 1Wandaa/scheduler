import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TIME_SLOTS, DAYS } from '../../config/constants';
import { slotsNeededFromIndex, getMeetingTimeLabel, schedulesOverlap } from '../../utils/scheduleUtils';
import '../../styles/ScheduleTable.css';

function ScheduleTable({ schedules, onRemove, onUpdateSchedule, title = "ROOM SCHEDULE GRID" }) {
  const LOGO_SRC = '/logo.png?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  const [dragOverCell, setDragOverCell] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'cards'
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [errorToast, setErrorToast] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const [fitScale, setFitScale] = useState(1);
  const [previewImage, setPreviewImage] = useState(null);

  const showToast = (msg, isError = true) => {
    if (isError) {
      setErrorToast(msg);
      setTimeout(() => setErrorToast(null), 5000);
    } else {
      setSuccessToast(msg);
      setTimeout(() => setSuccessToast(null), 3000);
    }
  };

  const handleDownloadImage = () => {
    if (!previewImage) return;
    const link = document.createElement('a');
    link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_schedule.png`;
    link.href = previewImage;
    link.click();
    setPreviewImage(null);
    showToast('Image saved successfully!', false);
  };

  const handleExportImage = async () => {
    if (!containerRef.current) return;
    try {
      showToast('Generating image, please wait...', false);
      const html2canvas = (await import('html2canvas')).default;
      
      const oldViewMode = viewMode;
      setViewMode('grid');
      
      await new Promise(r => setTimeout(r, 200));

      const toolbar = containerRef.current.querySelector('.schedule-toolbar');
      if (toolbar) toolbar.style.display = 'none';

      const canvas = await html2canvas(containerRef.current, { 
          scale: 2, 
          useCORS: true,
          backgroundColor: '#ffffff'
      });

      if (toolbar) toolbar.style.display = 'flex';

      const imgData = canvas.toDataURL('image/png');
      
      setViewMode(oldViewMode);
      setPreviewImage(imgData);
    } catch (err) {
      console.error(err);
      showToast('Failed to export image.');
    }
  };

  // Init once
  useEffect(() => {
    if (window.innerWidth <= 768) {
      setViewMode('cards');
    }
  }, []);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // Auto-switch to cards on mobile if still in grid
      setViewMode(prev => {
        if (isFullscreen || document.fullscreenElement) return 'grid';
        if (mobile && prev === 'grid') return 'cards';
        if (!mobile && prev === 'cards') return 'grid';
        return prev;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isFullscreen]);

  // Fullscreen: lock body scroll when fullscreen
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  // Handle Fit Scale for Mobile Fullscreen
  useEffect(() => {
    if (!isFullscreen) {
      setFitScale(1);
      return;
    }
    const updateFitScale = () => {
      // The fullscreen container has 1rem padding = 32px total horizontal padding
      const padding = 32; 
      const availableWidth = window.innerWidth - padding;
      const minTableWidth = 680; // from CSS
      
      if (availableWidth < minTableWidth) {
        setFitScale(availableWidth / minTableWidth);
      } else {
        setFitScale(1);
      }
    };
    
    updateFitScale();
    window.addEventListener('resize', updateFitScale);
    return () => window.removeEventListener('resize', updateFitScale);
  }, [isFullscreen]);

  // Listen to native fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      if (isFS) {
        setViewMode('grid');
      } else {
        if (window.innerWidth <= 768) {
          setViewMode('cards');
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        setIsFullscreen(true); // fallback
        setViewMode('grid');
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleDragStart = (e, schedule) => {
    e.dataTransfer.setData('scheduleId', schedule.id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      setDraggingId(schedule.id);
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverCell(null);
  };

  const handleDragOver = (e, day, timeSlotId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cellKey = `${day}-${timeSlotId}`;
    if (dragOverCell !== cellKey) setDragOverCell(cellKey);
  };



  const handleDrop = async (e, day, timeSlotId) => {
    e.preventDefault();
    setDragOverCell(null);
    setDraggingId(null);
    const scheduleId = e.dataTransfer.getData('scheduleId');
    if (!scheduleId || !onUpdateSchedule) return;
    const movingSchedule = schedules.find(s => s.id === scheduleId);
    if (!movingSchedule) return;
    if (movingSchedule.day === day && String(movingSchedule.timeSlot?.id) === String(timeSlotId)) return;
    const newTimeSlot = TIME_SLOTS.find(ts => String(ts.id) === String(timeSlotId));
    const candidate = { ...movingSchedule, day, timeSlot: newTimeSlot };
    const overlap = schedules.find(s => s.id !== scheduleId && schedulesOverlap(candidate, s));
    if (overlap) {
      showToast('Cannot move schedule: the new time overlaps an existing class (room, faculty, or section).');
      return;
    }
    const result = await onUpdateSchedule(scheduleId, day, timeSlotId);
    if (result && result.ok === false) {
      showToast(`Cannot move schedule:\n${result.errors?.join('\n') || result.error || 'Unknown error'}`);
    } else if (result && result.ok) {
      showToast('Schedule successfully updated.', false);
    }
  };

  // Group schedules by day for card view
  const schedulesByDay = DAYS.reduce((acc, day) => {
    acc[day] = schedules.filter(s => s.day === day).sort((a, b) => (a.timeSlot?.id ?? 0) - (b.timeSlot?.id ?? 0));
    return acc;
  }, {});

  const DAY_COLORS = {
    Monday: '#5645EE',
    Tuesday: '#02B974',
    Wednesday: '#F5A623',
    Thursday: '#EF2A66',
    Friday: '#0288d1',
  };

  // Department color mapping
  const DEPT_COLORS = {
    BSCS: { bg: '#109EEF', text: '#030813' },  // Blue (original)
    BSFT: { bg: '#16A34A', text: '#030813' },  // Green
    BSOA: { bg: '#8B5CF6', text: '#FFFFFF' },  // Purple
    BAEL: { bg: '#EAB308', text: '#030813' },  // Yellow
  };
  const DEFAULT_DEPT_COLOR = { bg: '#109EEF', text: '#030813' };

  const getDeptColor = (schedule) => {
    // 1. Try to find a known department in the section name (e.g. "BSCS 1A", "BSOA-1B")
    const sectionName = (schedule?.section?.name || '').toUpperCase();
    for (const dept of Object.keys(DEPT_COLORS)) {
      if (sectionName.includes(dept)) {
        return DEPT_COLORS[dept];
      }
    }

    // 2. Fallback: check subject.departments array or legacy subject.department string
    const subj = schedule?.subject;
    if (subj) {
      const depts = Array.isArray(subj.departments) ? subj.departments : (subj.department ? [subj.department] : []);
      for (const d of depts) {
        const upperD = String(d).toUpperCase();
        for (const dept of Object.keys(DEPT_COLORS)) {
          if (upperD.includes(dept)) {
            return DEPT_COLORS[dept];
          }
        }
      }
    }
    return DEFAULT_DEPT_COLOR;
  };

  const GridView = () => (
    <div className="table-wrapper">
      <table 
        className="schedule-table"
        style={isFullscreen && fitScale < 1 ? { zoom: fitScale } : {}}
      >
        <thead>
          <tr>
            <th>Time Slot</th>
            {DAYS.map(day => <th key={day}>{day}</th>)}
          </tr>
        </thead>
        <tbody>
          {TIME_SLOTS.map((timeSlot, tIdx) => {
            const isEven = tIdx % 2 === 0;
            let hourLabel = '';
            if (isEven) {
              const startLabel = timeSlot.label.split(' - ')[0];
              const nextSlot = TIME_SLOTS[tIdx + 1];
              const endLabel = nextSlot ? nextSlot.label.split(' - ')[1] : '';
              hourLabel = `${startLabel} - ${endLabel}`;
            }

            return (
              <React.Fragment key={timeSlot.id}>
                {tIdx === 10 && (
                  <tr className="lunch-break-row" style={{ height: '40px', backgroundColor: '#f1f5f9' }}>
                    <td className="time-label" style={{ borderTop: '2px solid var(--border-color)', borderBottom: '2px solid var(--border-color)' }}>
                      <strong>12:00 - 1:00</strong>
                    </td>
                    <td colSpan={DAYS.length} style={{ textAlign: 'center', letterSpacing: '8px', color: '#64748b', fontSize: '0.9rem', borderTop: '2px solid var(--border-color)', borderBottom: '2px solid var(--border-color)' }}>
                      <strong>LUNCH BREAK</strong>
                    </td>
                  </tr>
                )}
                <tr className={isEven ? 'hour-row' : 'half-hour-row'}>
                  {isEven && (
                    <td className="time-label" rowSpan={2}>
                      <strong>{hourLabel}</strong>
                    </td>
                  )}
              {DAYS.map(day => {
                const cellKey = `${day}-${timeSlot.id}`;
                if (window[`skip_cell_${cellKey}`]) {
                  delete window[`skip_cell_${cellKey}`];
                  return null;
                }
                const isDropTarget = dragOverCell === cellKey;
                const cellSchedules = schedules.filter(s => s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
                let rowSpan = 1;
                for (const s of cellSchedules) {
                  const needed = slotsNeededFromIndex(tIdx, s.subject?.hoursPerMeeting);
                  if (needed > rowSpan) rowSpan = needed;
                }
                if (rowSpan > 1) {
                  for (let skip = 1; skip < rowSpan; skip++) {
                    const skipSlot = TIME_SLOTS[tIdx + skip];
                    if (skipSlot) window[`skip_cell_${day}-${skipSlot.id}`] = true;
                  }
                }
                return (
                  <td
                    key={cellKey}
                    rowSpan={rowSpan}
                    className={`schedule-cell ${isDropTarget ? 'drag-over' : ''} ${cellSchedules.length > 0 ? 'has-schedule' : ''}`}
                    onDragOver={(e) => handleDragOver(e, day, timeSlot.id)}
                    onDrop={(e) => handleDrop(e, day, timeSlot.id)}
                    style={cellSchedules.length > 0 ? { backgroundColor: getDeptColor(cellSchedules[0]).bg, padding: 0 } : {}}
                  >
                    {cellSchedules.map(schedule => {
                      const deptColor = getDeptColor(schedule);
                      return (
                        <div
                          key={schedule.id}
                          className={`schedule-item ${draggingId === schedule.id ? 'dragging' : ''}`}
                          draggable={!!onUpdateSchedule}
                          onDragStart={(e) => handleDragStart(e, schedule)}
                          onDragEnd={handleDragEnd}
                          style={{ cursor: onUpdateSchedule ? 'grab' : 'default' }}
                        >
                          <div className="schedule-content" style={{ display: 'flex', flexDirection: 'column' }}>
                            <p className="subject" style={{ color: deptColor.text, fontWeight: 'bold', margin: 0 }}>
                              {schedule.subject?.code ?? '—'}
                            </p>
                            <div className="details" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <p className="professor" style={{ color: deptColor.text, fontWeight: 'bold', margin: 0, lineHeight: '1.2' }}>
                                {schedule.professor?.name ? (() => {
                                  const name = schedule.professor.name.trim();
                                  if (name.includes(',')) {
                                    const [surname, firstNames] = name.split(',').map(s => s.trim());
                                    const initial = firstNames ? firstNames[0].toUpperCase() : '';
                                    return initial ? `${initial}. ${surname}` : surname;
                                  } else {
                                    const parts = name.split(/\s+/);
                                    if (parts.length === 1) return parts[0];
                                    const initial = parts[0][0].toUpperCase();
                                    const surname = parts.slice(1).join(' ');
                                    return `${initial}. ${surname}`;
                                  }
                                })() : '—'}
                              </p>
                              <p className="room" style={{ color: deptColor.text, fontWeight: 'bold', margin: 0, lineHeight: '1.2' }}>{schedule.room?.name ?? '—'}</p>
                              {schedule.section && (
                                <p className="section" style={{ color: deptColor.text, fontWeight: 'bold', margin: 0, lineHeight: '1.2' }}>{schedule.section.name}</p>
                              )}
                            </div>
                          </div>
                          {onRemove && (
                            <button className="remove-btn" onClick={() => onRemove(schedule.id)} title="Remove schedule">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </td>
                );
              })}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const CardView = () => (
    <div className="schedule-card-view">
      {DAYS.map(day => {
        const daySched = schedulesByDay[day];
        return (
          <div key={day} className="schedule-day-group">
            <div className="schedule-day-header" style={{ borderLeftColor: DAY_COLORS[day] }}>
              <span style={{ color: DAY_COLORS[day] }}>{day}</span>
              <span className="schedule-day-count">{daySched.length} class{daySched.length !== 1 ? 'es' : ''}</span>
            </div>
            {daySched.length === 0 ? (
              <div className="schedule-day-empty">No classes</div>
            ) : (
              daySched.map(schedule => {
                const deptColor = getDeptColor(schedule);
                return (
                  <div key={schedule.id} className="schedule-card-item" style={{ borderLeftColor: deptColor.bg, backgroundColor: `${deptColor.bg}12` }}>
                    <div className="schedule-card-time">
                      {getMeetingTimeLabel(schedule.timeSlot, schedule.subject?.hoursPerMeeting) || schedule.timeSlot?.label || '—'}
                    </div>
                    <div className="schedule-card-body">
                      <div className="schedule-card-subject">
                        {schedule.subject?.code ?? '—'}
                        {schedule.section && (
                          <span className="schedule-card-section"> · {schedule.section.name}</span>
                        )}
                        {schedule.subject?.credits && (
                          <span className="schedule-card-section"> ({schedule.subject.credits} Units)</span>
                        )}
                      </div>
                      <div className="schedule-card-meta">
                        <span>👤 {schedule.professor?.name ? (() => {
                          const parts = schedule.professor.name.trim().split(/\s+/);
                          if (parts.length === 1) return parts[0];
                          return `${parts[0][0].toUpperCase()}.${parts[parts.length - 1]}`;
                        })() : '—'}</span>
                        <span>🏫 {schedule.room?.name ?? '—'}</span>
                      </div>
                    </div>
                    {onRemove && (
                      <button className="remove-btn" onClick={() => onRemove(schedule.id)} title="Remove schedule">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );

  const content = (
    <div ref={containerRef} className={`schedule-table-container ${isFullscreen ? 'schedule-fullscreen' : ''}`}>

      {/* Toolbar row */}
      <div className="schedule-toolbar">
        {/* View toggle */}
        <div className="schedule-view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <span>Grid</span>
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Card view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            <span>Cards</span>
          </button>
        </div>

        {/* Export Actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', marginRight: '4px' }}>ORDINARY FORMAT:</span>
            <button
            className="fullscreen-btn"
            onClick={handleExportImage}
            title="Export Schedule as Image"
            style={{ background: '#e6f4ea', color: '#137333', border: '1px solid #ceead6' }}
            >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            <span style={{ fontWeight: 600 }}>Save Image</span>
            </button>

            <button
            className="fullscreen-btn"
            onClick={async () => {
                if (!containerRef.current) return;
                try {
                  showToast('Preparing print, please wait...', false);
                  const html2canvas = (await import('html2canvas')).default;
                  
                  const oldViewMode = viewMode;
                  setViewMode('grid');
                  
                  await new Promise(r => setTimeout(r, 200));

                  const toolbar = containerRef.current.querySelector('.schedule-toolbar');
                  if (toolbar) toolbar.style.display = 'none';

                  const canvas = await html2canvas(containerRef.current, { 
                      scale: 2, 
                      useCORS: true,
                      backgroundColor: '#ffffff'
                  });

                  if (toolbar) toolbar.style.display = 'flex';
                  setViewMode(oldViewMode);

                  const imgData = canvas.toDataURL('image/png');
                  
                  const iframe = document.createElement('iframe');
                  iframe.style.position = 'fixed';
                  iframe.style.top = '-10000px';
                  iframe.style.left = '-10000px';
                  document.body.appendChild(iframe);
                  
                  const doc = iframe.contentDocument || iframe.contentWindow.document;
                  doc.open();
                  doc.write(`
                      <html>
                      <head>
                          <title>Print Schedule</title>
                          <style>
                              @page { size: landscape; margin: 0.5in; }
                              body { margin: 0; padding: 0; display: flex; justify-content: center; background: #fff; }
                              img { max-width: 100%; height: auto; }
                          </style>
                      </head>
                      <body>
                          <img src="${imgData}" />
                      </body>
                      </html>
                  `);
                  doc.close();
                  
                  iframe.contentWindow.focus();
                  setTimeout(() => {
                      iframe.contentWindow.print();
                      setTimeout(() => {
                          if (document.body.contains(iframe)) {
                              document.body.removeChild(iframe);
                          }
                      }, 1000);
                  }, 300);

                } catch (err) {
                  console.error(err);
                  showToast('Failed to print schedule.');
                }
            }}
            title="Print Schedule"
            style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}
            >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            <span style={{ fontWeight: 600 }}>Print</span>
            </button>
        </div>

        {/* Fullscreen toggle (grid view only) */}
        {viewMode === 'grid' && (
          <button
            className="fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            )}
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
        )}
      </div>

      {/* Header */}
      <div className="schedule-doc-header">
        <div className="schedule-doc-logo">
          <img
            src={LOGO_SRC}
            alt="Logo"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_LOGO; }}
          />
        </div>
        <div className="schedule-doc-title">
          <h2>CAPIZ STATE UNIVERSITY</h2>
          <h3>{title}</h3>
        </div>
        <div className="schedule-doc-meta">
          <div><strong>Doc. Code:</strong> CAPSU-F-045</div>
          <div><strong>Revision No.:</strong> 01</div>
          <div><strong>Effectivity:</strong> August 2026</div>
        </div>
      </div>



      {/* Content */}
      {viewMode === 'grid' || isFullscreen ? <GridView /> : <CardView />}

      {/* Floating exit fullscreen button for presentation mode */}
      {isFullscreen && (
        <>
          <button
            className="floating-exit-btn"
            onClick={() => {
              if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen();
              } else {
                setIsFullscreen(false);
                if (window.innerWidth <= 768) setViewMode('cards');
              }
            }}
            title="Exit Fullscreen"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
          </button>
          
          {/* Rotate hint for mobile devices in portrait */}
          <div className="rotate-device-hint">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.34-11.14l1.5 1.5"/></svg>
            <span>Rotate for best view</span>
          </div>
        </>
      )}


      {/* Preview Modal */}
      {previewImage && createPortal(
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '900px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Schedule Preview</h3>
              <button onClick={() => setPreviewImage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '20px', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'center' }}>
              <img src={previewImage} alt="Schedule Preview" style={{ maxWidth: '100%', height: 'auto' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn" style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)' }} onClick={() => setPreviewImage(null)}>
                Cancel
              </button>
              <button className="btn" onClick={handleDownloadImage} style={{ background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download Image
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notification */}
      {(errorToast || successToast) && createPortal(
        <div style={{
          position: 'fixed',
          bottom: '30px',
          right: '30px',
          background: errorToast ? 'var(--danger)' : 'var(--success)',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '12px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          zIndex: 999999,
          animation: 'fadeIn 0.3s ease-out',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          maxWidth: '400px'
        }}>
          {errorToast ? (
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          ) : (
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '4px' }}>
                {errorToast ? 'Error' : 'Success'}
            </span>
            <span style={{ fontSize: '0.85rem', opacity: 0.9, whiteSpace: 'pre-line', lineHeight: '1.4' }}>
                {errorToast || successToast}
            </span>
          </div>
          <button 
            onClick={() => { setErrorToast(null); setSuccessToast(null); }}
            style={{ background: 'transparent', border: 'none', color: 'white', opacity: 0.7, cursor: 'pointer', marginLeft: 'auto', padding: '4px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>,
        document.body
      )}
    </div>
  );

  return content;
}

export default ScheduleTable;