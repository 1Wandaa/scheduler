import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { TIME_SLOTS, DAYS, FOUR_DAY_TIME_SLOTS, getScheduleConfig } from '../../config/constants';
import { slotsNeededFromIndex, getMeetingTimeLabel, schedulesOverlap, parseTimeToMinutes, getScheduleTimeRange } from '../../utils/scheduleUtils';
import '../../styles/ScheduleTable.css';

function ScheduleTable({ schedules, onRemove, onUpdateSchedule, title = "ROOM SCHEDULE GRID", departments = [], scheduleMode, isDeleteMode, programName, semesterInfo }) {
  const { confirm } = useGlobalDialog();
  const getFullDepartmentName = () => {
    let deptAcronym = null;
    for (const s of schedules) {
        if (s.section?.name) {
             const name = s.section.name.toUpperCase();
             if (name.includes('BSCS')) deptAcronym = 'BSCS';
             else if (name.includes('BAEL')) deptAcronym = 'BAEL';
             else if (name.includes('BSOA')) deptAcronym = 'BSOA';
             else if (name.includes('BSFT')) deptAcronym = 'BSFT';
             if (deptAcronym) break;
        }
    }
    
    const prog = (programName || '').toUpperCase();
    if (!deptAcronym) {
       if (prog.includes('COMPUTER SCIENCE') || prog.includes('BSCS')) deptAcronym = 'BSCS';
       else if (prog.includes('ENGLISH LANGUAGE') || prog.includes('BAEL')) deptAcronym = 'BAEL';
       else if (prog.includes('OFFICE ADMINISTRATION') || prog.includes('BSOA')) deptAcronym = 'BSOA';
       else if (prog.includes('FOOD TECHNOLOGY') || prog.includes('BSFT')) deptAcronym = 'BSFT';
    }

    switch (deptAcronym) {
        case 'BSCS': return 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT';
        case 'BAEL': return 'BACHELOR OF ARTS IN ENGLISH LANGUAGE DEPARTMENT';
        case 'BSOA': return 'BACHELOR OF SCIENCE IN OFFICE ADMINISTRATION DEPARTMENT';
        case 'BSFT': return 'BACHELOR OF SCIENCE IN FOOD TECHNOLOGY DEPARTMENT';
        default: 
             if (programName) {
                 let formatted = programName.toUpperCase();
                 if (formatted.startsWith('BA ')) formatted = formatted.replace('BA ', 'BACHELOR OF ARTS IN ');
                 if (formatted.startsWith('BS ')) formatted = formatted.replace('BS ', 'BACHELOR OF SCIENCE IN ');
                 return `${formatted} DEPARTMENT`;
             }
             return 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT';
    }
  };

  // Resolve time slots and days based on schedule mode
  const config = getScheduleConfig(scheduleMode);
  const activeTimeSlots = config.timeSlots;
  // Always show all 5 days in the viewer (user requirement)
  const displayDays = DAYS;
  const LOGO_SRC = '/logo.png?v=1';
  const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

  const [dragOverCell, setDragOverCell] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const [, setIsMobile] = useState(window.innerWidth <= 768);
  const viewMode = 'grid'; // Statically set to grid
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

  // Helper: prepare a clean, desktop-like clone of the schedule for export
  const prepareExportClone = (clone, isPrint = true) => {
    // Hide toolbar and remove buttons in the clone
    const clonedToolbar = clone.querySelector('.schedule-toolbar');
    if (clonedToolbar) clonedToolbar.style.display = 'none';

    // Force the doc-meta section visible (hidden by mobile media query)
    const docMeta = clone.querySelector('.schedule-doc-meta');
    if (docMeta) {
      docMeta.style.display = 'flex';
      docMeta.style.flex = '0 0 160px';
    }

    // Force doc-logo to desktop size
    const docLogo = clone.querySelector('.schedule-doc-logo');
    if (docLogo) {
      docLogo.style.flex = '0 0 90px';
      const logoImg = docLogo.querySelector('img');
      if (logoImg) { logoImg.style.width = '58px'; logoImg.style.height = '58px'; }
    }

    // Force doc-title to desktop size
    const docTitle = clone.querySelector('.schedule-doc-title');
    if (docTitle) {
      const h2 = docTitle.querySelector('h2');
      const h3 = docTitle.querySelector('h3');
      if (h2) h2.style.fontSize = '1.05rem';
      if (h3) h3.style.fontSize = '0.82rem';
    }

    // Remove zoom / transform from the table (set by fitScale on mobile)
    const table = clone.querySelector('.schedule-table');
    if (table) {
      table.style.zoom = '1';
      table.style.transform = 'none';
      table.style.transformOrigin = 'unset';
      table.style.minWidth = '680px';
      table.style.width = '100%';
    }

    // Force container padding to desktop style
    clone.style.padding = '1rem';

    // Hide all remove buttons (the X to delete schedules)
    clone.querySelectorAll('.remove-btn').forEach(btn => btn.style.display = 'none');

    if (isPrint) {
      // Shrink the summary table for export so it fits on one page
      const summaryContainer = clone.querySelector('.schedule-summary-container');
    if (summaryContainer) {
      summaryContainer.style.margin = '5px 0';
      summaryContainer.style.padding = '0';
      
      const h3 = summaryContainer.querySelector('h3');
      if (h3) h3.style.fontSize = '0.9rem';
      const h4 = summaryContainer.querySelector('h4');
      if (h4) {
         h4.style.fontSize = '0.8rem';
         h4.style.margin = '2px 0';
      }
      const p = summaryContainer.querySelector('p');
      if (p) p.style.fontSize = '0.75rem';
      
      const summaryTable = clone.querySelector('.schedule-summary-table');
      if (summaryTable) {
         summaryTable.style.fontSize = '0.65rem';
         summaryTable.style.marginBottom = '5px';
         summaryTable.querySelectorAll('th, td').forEach(cell => {
             cell.style.padding = '2px';
         });
      }

      // Also shrink the main schedule grid
      const scheduleTable = clone.querySelector('.schedule-table');
      if (scheduleTable) {
         scheduleTable.style.fontSize = '0.7rem'; // scale down the font
         scheduleTable.querySelectorAll('th, td').forEach(cell => {
             cell.style.padding = '2px';
         });
         scheduleTable.querySelectorAll('.schedule-item').forEach(item => {
             item.style.padding = '2px';
             const details = item.querySelector('.details');
             if (details) details.style.marginTop = '2px';
         });
      }
    }
  }

    // Hide card view if it leaked through, force table-wrapper visible
    const cardView = clone.querySelector('.schedule-card-view');
    if (cardView) cardView.style.display = 'none';
    const tableWrapper = clone.querySelector('.table-wrapper');
    if (tableWrapper) {
      tableWrapper.style.display = 'block';
      tableWrapper.style.overflow = 'visible';
      tableWrapper.scrollLeft = 0; // Reset any horizontal scroll offset
    }

    // Remove position:sticky from time-label cells and header - sticky
    // positioning in an off-screen clone causes the time column to render
    // on the wrong side (right instead of left) on mobile devices
    clone.querySelectorAll('.time-label').forEach(cell => {
      cell.style.position = 'static';
      cell.style.left = 'auto';
      cell.style.zIndex = 'auto';
    });
    // Also fix the first <th> (Time Slot header) which has inline sticky styles
    const firstTh = clone.querySelector('.schedule-table th');
    if (firstTh) {
      firstTh.style.position = 'static';
      firstTh.style.left = 'auto';
      firstTh.style.zIndex = 'auto';
    }

    // Hide fullscreen-related elements
    const floatingBtn = clone.querySelector('.floating-exit-btn');
    if (floatingBtn) floatingBtn.style.display = 'none';
    const rotateHint = clone.querySelector('.rotate-device-hint');
    if (rotateHint) rotateHint.style.display = 'none';
  };

  const handleExportImage = async () => {
    if (!containerRef.current) return;
    try {
      showToast('Generating image, please wait...', false);
      const html2canvas = (await import('html2canvas')).default;

      // Wait for React to re-render to grid mode
      await new Promise(r => setTimeout(r, 500));

      const toolbar = containerRef.current.querySelector('.schedule-toolbar');
      if (toolbar) toolbar.style.display = 'none';

      // Clone the container into a fixed-width off-screen element
      const clone = containerRef.current.cloneNode(true);
      const wrapper = document.createElement('div');
      wrapper.style.position = 'absolute';
      wrapper.style.top = '-10000px';
      wrapper.style.left = '-10000px';

      // Match container width for exact layout instead of fixed 1100px
      wrapper.style.width = `${Math.max(containerRef.current.scrollWidth, 900)}px`;
      wrapper.style.height = 'auto';
      wrapper.style.backgroundColor = '#ffffff';
      wrapper.style.padding = '16px';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';

      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      // Apply desktop-like overrides to the clone, false means don't shrink fonts
      prepareExportClone(clone, false);
      clone.style.height = 'auto';
      clone.style.display = 'flex';
      clone.style.flexDirection = 'column';
      const tableWrapper = clone.querySelector('.table-wrapper');
      if (tableWrapper) {
        tableWrapper.style.display = 'flex';
        tableWrapper.style.flexDirection = 'column';
      }
      const table = clone.querySelector('.schedule-table');
      if (table) table.style.height = 'auto';

      // Wait for the browser to apply the new layout completely
      await new Promise(r => setTimeout(r, 150));

      const finalRect = wrapper.getBoundingClientRect();
      const finalWidth = finalRect.width;
      const finalHeight = finalRect.height;

      const canvas = await html2canvas(wrapper, {
        scale: 2, // 2x gives clear resolution but prevents choppy downscaling issues
        useCORS: true,
        backgroundColor: '#ffffff',
        width: finalWidth,
        height: finalHeight,
        windowWidth: finalWidth,
        windowHeight: finalHeight
      });

      document.body.removeChild(wrapper);
      if (toolbar) toolbar.style.display = 'flex';

      const imgData = canvas.toDataURL('image/png');

      setPreviewImage(imgData);
    } catch (err) {
      console.error(err);
      showToast('Failed to export image.');
    }
  };

  const handleExportPrint = async () => {
    if (!containerRef.current) return;
    try {
      showToast('Preparing print, please wait...', false);
      const html2canvas = (await import('html2canvas')).default;

      // Wait for React to re-render to grid mode
      await new Promise(r => setTimeout(r, 500));

      const toolbar = containerRef.current.querySelector('.schedule-toolbar');
      if (toolbar) toolbar.style.display = 'none';

      const clone = containerRef.current.cloneNode(true);
      const wrapper = document.createElement('div');
      wrapper.style.position = 'absolute';
      wrapper.style.top = '-10000px';
      wrapper.style.left = '-10000px';

      // Fixed width, let height be auto to capture full content without clipping
      wrapper.style.width = '1100px';
      wrapper.style.height = 'auto';
      wrapper.style.backgroundColor = '#ffffff';
      wrapper.style.padding = '16px';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';

      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      // Apply desktop-like overrides to the clone, true means shrink fonts for printing
      prepareExportClone(clone, true);
      clone.style.height = 'auto';
      clone.style.display = 'flex';
      clone.style.flexDirection = 'column';
      const tableWrapper = clone.querySelector('.table-wrapper');
      if (tableWrapper) {
        tableWrapper.style.display = 'flex';
        tableWrapper.style.flexDirection = 'column';
      }
      const table = clone.querySelector('.schedule-table');
      if (table) table.style.height = 'auto';

      // Wait for the browser to apply the new layout completely
      await new Promise(r => setTimeout(r, 150));

      const finalRect = wrapper.getBoundingClientRect();
      const finalWidth = finalRect.width;
      const finalHeight = finalRect.height;

      const canvas = await html2canvas(wrapper, {
        scale: 2, // HD quality, but scales smoothly
        useCORS: true,
        backgroundColor: '#ffffff',
        width: finalWidth,
        height: finalHeight,
        windowWidth: finalWidth,
        windowHeight: finalHeight
      });

      document.body.removeChild(wrapper);
      if (toolbar) toolbar.style.display = 'flex';

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
                  @page { size: portrait; margin: 0; }
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  html, body { width: 100%; height: 100%; background: #fff; overflow: hidden; }
                  body { display: flex; align-items: center; justify-content: center; }
                  /* The image maintains aspect ratio to perfectly fit on a single page */
                  img { display: block; max-width: 100vw; max-height: 100vh; width: auto; height: auto; object-fit: contain; }
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
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
        }, 1000);
      }, 300);

    } catch (err) {
      console.error(err);
      showToast('Failed to print schedule.');
    }
  };

  useEffect(() => {
    const onExportImage = () => handleExportImage();
    const onExportPrint = () => handleExportPrint();
    window.addEventListener('export-ordinary-image', onExportImage);
    window.addEventListener('export-ordinary-print', onExportPrint);
    return () => {
      window.removeEventListener('export-ordinary-image', onExportImage);
      window.removeEventListener('export-ordinary-print', onExportPrint);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, schedules, title]);


  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fullscreen: lock body scroll when fullscreen
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  // Handle Fit Scale for Mobile Fullscreen & Grid View
  useEffect(() => {
    const updateFitScale = () => {
      const padding = 32;
      const availableWidth = window.innerWidth - padding;
      const minTableWidth = 680; // from CSS

      if (availableWidth < minTableWidth && (isFullscreen || viewMode === 'grid')) {
        setFitScale(availableWidth / minTableWidth);
      } else {
        setFitScale(1);
      }
    };

    updateFitScale();
    window.addEventListener('resize', updateFitScale);
    return () => window.removeEventListener('resize', updateFitScale);
  }, [isFullscreen, viewMode]);

  // Listen to native fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
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

    // Check dynamic departments first
    if (departments && departments.length > 0) {
      for (const d of departments) {
        if (sectionName.includes((d.id || '').toUpperCase())) {
          return { bg: d.color, text: '#FFFFFF' };
        }
      }
    }

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

        if (departments && departments.length > 0) {
          for (const dynDept of departments) {
            if (upperD.includes((dynDept.id || '').toUpperCase())) {
              return { bg: dynDept.color, text: '#FFFFFF' };
            }
          }
        }

        for (const dept of Object.keys(DEPT_COLORS)) {
          if (upperD.includes(dept)) {
            return DEPT_COLORS[dept];
          }
        }
      }
    }
    return DEFAULT_DEPT_COLOR;
  };

  // Group unique subjects for the summary table
  const uniqueSubjectsMap = schedules.reduce((acc, current) => {
    const subjId = current.subject?.id || current.id;
    if (!acc[subjId]) {
      acc[subjId] = {
        ...current,
        rooms: new Set([current.room?.name].filter(Boolean)),
      };
    } else {
      if (current.room?.name) acc[subjId].rooms.add(current.room.name);
    }
    return acc;
  }, {});

  const uniqueSubjectsList = Object.values(uniqueSubjectsMap).map(s => ({
    ...s,
    roomNameList: Array.from(s.rooms).join(' / ') || 'TBA'
  })).sort((a, b) => {
    const codeA = (a.subject?.code || '').toString();
    const codeB = (b.subject?.code || '').toString();
    return codeA.localeCompare(codeB);
  });

  const totalUnits = uniqueSubjectsList.reduce((sum, s) => sum + (Number(s.subject?.credits) || 0), 0);

  // Determine the lunch break insertion index.
  // We insert the break BEFORE the slot whose id equals config.lunchAfterId.
  const lunchInsertIdx = activeTimeSlots.findIndex(ts => ts.id === config.lunchAfterId);

  const GridView = () => {
    const skippedCells = new Set();

    return (
      <div className="table-wrapper">
        <table
          className="schedule-table"
          style={(isFullscreen || viewMode === 'grid') && fitScale < 1 ? { zoom: fitScale } : {}}
        >
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--bg-main)' }}>Time Slot</th>
              {displayDays.map(day => <th key={day}>{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {activeTimeSlots.map((timeSlot, tIdx) => {
              const indexInSession = tIdx;

              let isHourGroupHead = false;
              let timeRowSpan = 1;
              let hourLabel = '';

              if (indexInSession % 2 === 0) {
                const nextSlot = activeTimeSlots[tIdx + 1];
                if (nextSlot) {
                  isHourGroupHead = true;
                  timeRowSpan = 2;
                  hourLabel = `${timeSlot.label.split(' - ')[0]} - ${nextSlot.label.split(' - ')[1]}`;
                } else {
                  isHourGroupHead = true;
                  timeRowSpan = 1;
                  hourLabel = timeSlot.label;
                }
              } else {
                isHourGroupHead = false;
                timeRowSpan = 0;
              }

              return (
                <React.Fragment key={timeSlot.id}>
                  <tr className={isHourGroupHead ? 'hour-row' : 'half-hour-row'}>
                    {isHourGroupHead && (
                      <td className="time-label" rowSpan={timeRowSpan} style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-main)' }}>
                        <strong>{hourLabel}</strong>
                      </td>
                    )}
                    {displayDays.map((day, dayIdx) => {
                      const cellKey = `${day}-${timeSlot.id}`;

                      if (skippedCells.has(cellKey)) {
                        return null;
                      }

                      const isDropTarget = dragOverCell === cellKey;
                      const cellSchedules = schedules.filter(s => s.day === day && String(s.timeSlot?.id) === String(timeSlot.id));
                      let rowSpan = 1;
                      for (const s of cellSchedules) {
                        const range = getScheduleTimeRange(s, scheduleMode);
                        if (range.start > 0 && range.end > 0) {
                          const durationMins = range.end - range.start;
                          let needed = Math.ceil(durationMins / 30);
                          if (needed < 1) needed = 1;
                          if (needed > rowSpan) rowSpan = needed;
                        } else {
                          const needed = slotsNeededFromIndex(tIdx, s.subject?.hoursPerMeeting, scheduleMode);
                          if (needed > rowSpan) rowSpan = needed;
                        }
                      }
                      if (rowSpan > 1) {
                        for (let skip = 1; skip < rowSpan; skip++) {
                          const skipSlot = activeTimeSlots[tIdx + skip];
                          if (skipSlot) skippedCells.add(`${day}-${skipSlot.id}`);
                        }
                      }

                      return (
                        <td
                          key={cellKey}
                          rowSpan={rowSpan}
                          className={`schedule-cell ${isDropTarget ? 'drag-over' : ''} ${cellSchedules.length > 0 ? 'has-schedule' : ''}`}
                          onDragOver={(e) => handleDragOver(e, day, timeSlot.id)}
                          onDrop={(e) => handleDrop(e, day, timeSlot.id)}
                          style={
                            cellSchedules.length > 0
                              ? { backgroundColor: getDeptColor(cellSchedules[0]).bg, padding: 0 }
                              : {}
                          }
                        >
                          {cellSchedules.map((schedule) => {
                            const deptColor = getDeptColor(schedule);
                            return (
                              <div
                                key={schedule.id}
                                className={`schedule-item ${draggingId === schedule.id ? 'dragging' : ''}`}
                                draggable={!!onUpdateSchedule && isDeleteMode}
                                onDragStart={(e) => handleDragStart(e, schedule)}
                                onDragEnd={handleDragEnd}
                                style={{ cursor: (onUpdateSchedule && isDeleteMode) ? 'grab' : 'default' }}
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
                                {onRemove && isDeleteMode && (
                      <button className="remove-btn" onClick={async (e) => {
  e.stopPropagation();
  const isConfirmed = await confirm({
    title: 'Delete Schedule',
    text: 'Are you sure you want to delete this schedule?',
    icon: 'warning',
    confirmButtonText: 'Delete',
    isDestructive: true
  });
  if (isConfirmed) {
    onRemove(schedule.id);
  }
}} title="Remove schedule">
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
  };

  const CardView = () => (
    <div className="schedule-card-view">
      {DAYS.map((day, dayIndex) => {
        const daySched = schedulesByDay[day] || [];
        return (
          <div key={day} className="schedule-day-group" style={{ animationDelay: `${dayIndex * 0.05}s` }}>
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
                      {schedule.timeSlot?.customLabel || getMeetingTimeLabel(schedule.timeSlot, schedule.subject?.hoursPerMeeting) || schedule.timeSlot?.label || '—'}
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
                    {onRemove && isDeleteMode && (
                      <button className="remove-btn" onClick={async (e) => {
  e.stopPropagation();
  const isConfirmed = await confirm({
    title: 'Delete Schedule',
    text: 'Are you sure you want to delete this schedule?',
    icon: 'warning',
    confirmButtonText: 'Delete',
    isDestructive: true
  });
  if (isConfirmed) {
    onRemove(schedule.id);
  }
}} title="Remove schedule">
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
        {/* View toggle removed */}

        <div style={{ marginLeft: 'auto' }}></div>

        {/* Fullscreen toggle (grid view only) */}
        {viewMode === 'grid' && (
          <button
            className="fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
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
            onError={(e) => {
              if (e.currentTarget.src !== FALLBACK_LOGO) {
                e.currentTarget.src = FALLBACK_LOGO;
              }
            }}
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



      {/* Subject Summary Table */}
      <div className="schedule-summary-container" style={{ margin: '20px 0', padding: '0 10px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
           <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#033279', textTransform: 'uppercase' }}>{getFullDepartmentName()}</h3>
           <h4 style={{ margin: '5px 0', fontSize: '0.9rem', color: '#000' }}>SCHEDULE OF CLASSES</h4>
           <p style={{ margin: 0, fontSize: '0.85rem', color: '#000' }}>{semesterInfo || 'First Semester, School Year 2026 - 2027'}</p>
        </div>
        <table className="schedule-summary-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#000', marginBottom: '20px' }}>
            <thead>
                <tr>
                    <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', backgroundColor: '#fff', fontWeight: 'bold' }}>Subject</th>
                    <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', backgroundColor: '#fff', fontWeight: 'bold' }}>Description</th>
                    <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', backgroundColor: '#fff', fontWeight: 'bold' }}>Unit</th>
                    <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', backgroundColor: '#fff', fontWeight: 'bold' }}>Faculty</th>
                    <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', backgroundColor: '#fff', fontWeight: 'bold' }}>Room</th>
                </tr>
            </thead>
            <tbody>
                {uniqueSubjectsList.map(s => (
                    <tr key={s.subject?.id || s.id}>
                        <td style={{ border: '1px solid #000', padding: '6px' }}>{s.subject?.code || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '6px' }}>{s.subject?.title || s.subject?.description || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{s.subject?.credits || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '6px' }}>{s.professor?.name || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '6px' }}>{s.roomNameList}</td>
                    </tr>
                ))}
                <tr>
                    <td colSpan="2" style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>Total</td>
                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{totalUnits}</td>
                    <td colSpan="2" style={{ border: '1px solid #000', padding: '6px' }}></td>
                </tr>
            </tbody>
        </table>
      </div>

      {/* Content */}
      {GridView()}

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
              }
            }}
            title="Exit Fullscreen"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
          </button>

          {/* Rotate hint for mobile devices in portrait */}
          <div className="rotate-device-hint">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.34-11.14l1.5 1.5" /></svg>
            <span>Rotate for best view</span>
          </div>
        </>
      )}


      {/* Preview Modal */}
      {previewImage && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100000, display: 'flex', flexDirection: 'column', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', margin: 'auto', padding: '20px', borderRadius: '12px', maxWidth: '90vw', width: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Schedule Preview</h3>
            <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '20px', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'center' }}>
              <img src={previewImage} alt="Schedule Preview" style={{ maxWidth: '100%', height: 'auto', imageRendering: 'high-quality' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-outline" onClick={() => setPreviewImage(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDownloadImage}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
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