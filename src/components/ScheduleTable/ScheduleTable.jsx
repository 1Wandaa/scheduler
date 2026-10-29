import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import { TIME_SLOTS, DAYS, FOUR_DAY_TIME_SLOTS, getScheduleConfig } from '../../config/constants';
import { slotsNeededFromIndex, getMeetingTimeLabel, schedulesOverlap, parseTimeToMinutes, getScheduleTimeRange } from '../../utils/scheduleUtils';
import { exportGridToWord, exportGridToExcel } from '../../utils/scheduleExportUtils';
import '../../styles/ScheduleTable.css';

// Department color palette
const DEPT_COLORS = {
  BSCS: { bg: '#109EEF', text: '#030813' },
  BSFT: { bg: '#16A34A', text: '#030813' },
  BSOA: { bg: '#8B5CF6', text: '#FFFFFF' },
  BAEL: { bg: '#EAB308', text: '#030813' },
};
const DEFAULT_DEPT_COLOR = { bg: '#109EEF', text: '#030813' };

const DAY_COLORS = {
  Monday: '#5645EE',
  Tuesday: '#02B974',
  Wednesday: '#F5A623',
  Thursday: '#EF2A66',
  Friday: '#0288d1',
};

const LOGO_SRC = '/logo.png?v=1';
const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png';

// Helper: Format professor name compactly
function formatProfessorName(name) {
  if (!name) return '—';
  const clean = name.trim();
  if (clean.includes(',')) {
    const [surname, firstNames] = clean.split(',').map(s => s.trim());
    const initial = firstNames ? firstNames[0].toUpperCase() : '';
    return initial ? `${initial}. ${surname}` : surname;
  }
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const initial = parts[0][0].toUpperCase();
  const surname = parts.slice(1).join(' ');
  return `${initial}. ${surname}`;
}

// Helper: Compute department color
function computeDeptColor(schedule, departments = []) {
  const sectionName = (schedule?.section?.name || '').toUpperCase();

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
}

const ScheduleTable = React.memo(function ScheduleTable({
  schedules = [],
  activeSchedules = [],
  onRemove,
  onUpdateSchedule,
  title = "ROOM SCHEDULE GRID",
  departments = [],
  scheduleMode,
  isDeleteMode,
  programName,
  targetDepartment,
  semesterInfo,
  user,
  isAdmin = false,
  onDeleteAll,
  onToggleDeleteMode
}) {
  const { confirm } = useGlobalDialog();

  // Full department title resolution
  const fullDepartmentName = useMemo(() => {
    // 1. Check explicit targetDepartment, programName, or title first
    const candidateTexts = [
      targetDepartment,
      programName,
      title
    ].filter(Boolean).map(t => String(t).toUpperCase());

    for (const text of candidateTexts) {
      if (text.includes('BSCS') || text.includes('COMPUTER SCIENCE')) return 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT';
      if (text.includes('BAEL') || text.includes('ENGLISH LANGUAGE')) return 'BACHELOR OF ARTS IN ENGLISH LANGUAGE DEPARTMENT';
      if (text.includes('BSOA') || text.includes('OFFICE ADMINISTRATION')) return 'BACHELOR OF SCIENCE IN OFFICE ADMINISTRATION DEPARTMENT';
      if (text.includes('BSFT') || text.includes('FOOD TECHNOLOGY')) return 'BACHELOR OF SCIENCE IN FOOD TECHNOLOGY DEPARTMENT';

      // Check against dynamic departments list
      for (const d of (departments || [])) {
        const dCode = (d.id || d.code || '').toUpperCase();
        const dName = (d.name || d.fullName || '').toUpperCase();
        if (dCode && (text === dCode || text.includes(` ${dCode}`) || text.includes(`:${dCode}`) || text.includes(`: ${dCode}`))) {
          return dName.endsWith('DEPARTMENT') ? dName : `${dName} DEPARTMENT`;
        }
      }
    }

    // 2. Fallback: Determine majority department among scheduled sections
    const deptCounts = {};
    for (const s of schedules) {
      let code = null;
      if (s.section?.name) {
        const name = s.section.name.toUpperCase();
        if (name.includes('BSCS')) code = 'BSCS';
        else if (name.includes('BAEL')) code = 'BAEL';
        else if (name.includes('BSOA')) code = 'BSOA';
        else if (name.includes('BSFT')) code = 'BSFT';
      }
      if (!code && s.subject) {
        const subDepts = Array.isArray(s.subject.departments) ? s.subject.departments : (s.subject.department ? [s.subject.department] : []);
        if (subDepts.includes('BSCS')) code = 'BSCS';
        else if (subDepts.includes('BAEL')) code = 'BAEL';
        else if (subDepts.includes('BSOA')) code = 'BSOA';
        else if (subDepts.includes('BSFT')) code = 'BSFT';
      }
      if (code) {
        deptCounts[code] = (deptCounts[code] || 0) + 1;
      }
    }

    let majorityDept = null;
    let maxCount = 0;
    for (const [d, count] of Object.entries(deptCounts)) {
      if (count > maxCount) {
        maxCount = count;
        majorityDept = d;
      }
    }

    if (majorityDept === 'BSCS') return 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT';
    if (majorityDept === 'BAEL') return 'BACHELOR OF ARTS IN ENGLISH LANGUAGE DEPARTMENT';
    if (majorityDept === 'BSOA') return 'BACHELOR OF SCIENCE IN OFFICE ADMINISTRATION DEPARTMENT';
    if (majorityDept === 'BSFT') return 'BACHELOR OF SCIENCE IN FOOD TECHNOLOGY DEPARTMENT';

    if (programName) {
      let formatted = programName.toUpperCase();
      if (formatted.startsWith('BA ')) formatted = formatted.replace('BA ', 'BACHELOR OF ARTS IN ');
      if (formatted.startsWith('BS ')) formatted = formatted.replace('BS ', 'BACHELOR OF SCIENCE IN ');
      return formatted.endsWith('DEPARTMENT') ? formatted : `${formatted} DEPARTMENT`;
    }

    return 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT';
  }, [schedules, programName, targetDepartment, title, departments]);

  // Resolve time slots and days based on schedule mode
  const config = useMemo(() => getScheduleConfig(scheduleMode), [scheduleMode]);
  const activeTimeSlots = config.timeSlots;
  const displayDays = DAYS;

  const [dragOverCell, setDragOverCell] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const [errorToast, setErrorToast] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const [fitScale, setFitScale] = useState(1);
  const [previewImage, setPreviewImage] = useState(null);

  const showToast = useCallback((msg, isError = true) => {
    if (isError) {
      setErrorToast(msg);
      setTimeout(() => setErrorToast(null), 5000);
    } else {
      setSuccessToast(msg);
      setTimeout(() => setSuccessToast(null), 3000);
    }
  }, []);

  const handleDownloadImage = useCallback(() => {
    if (!previewImage) return;
    const link = document.createElement('a');
    link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_schedule.png`;
    link.href = previewImage;
    link.click();
    setPreviewImage(null);
    showToast('Image saved successfully!', false);
  }, [previewImage, title, showToast]);

  // Optimized O(1) cell lookup map
  const scheduleGridMap = useMemo(() => {
    const map = new Map();
    for (const s of schedules) {
      if (!s.day || !s.timeSlot?.id) {
        console.warn('[ScheduleTable] Found schedule missing day or timeSlot.id', s);
        continue;
      }
      const key = `${s.day}-${s.timeSlot.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    console.log('[ScheduleTable] scheduleGridMap built. Size:', map.size, 'Total passed schedules:', schedules.length);
    return map;
  }, [schedules]);

  // Pre-calculate cell span mapping & skipped multi-slot cells
  const { cellSpanMap, skippedCellsSet } = useMemo(() => {
    const spanMap = new Map();
    const skipped = new Set();

    activeTimeSlots.forEach((timeSlot, tIdx) => {
      displayDays.forEach(day => {
        const cellKey = `${day}-${timeSlot.id}`;
        if (skipped.has(cellKey)) return;

        const cellSchedules = scheduleGridMap.get(cellKey) || [];
        let rowSpan = 1;
        for (const s of cellSchedules) {
          const range = getScheduleTimeRange(s, scheduleMode);
          if (range.start > 0 && range.end > 0) {
            const durationMins = range.end - range.start;
            let needed = Math.ceil(durationMins / 30);
            if (needed < 1) needed = 1;
            if (needed > rowSpan) rowSpan = needed;
          } else {
            const sHours = Number(s.hours) || (s.subject?.hasLecLab ? (s.component === 'Lecture' ? ((Number(s.subject.lectureHours) || 2) / 2) : ((Number(s.subject.labHours) || 3) / 2)) : (Number(s.subject?.hoursPerMeeting) || 1.5));
            const needed = slotsNeededFromIndex(tIdx, sHours, scheduleMode);
            if (needed > rowSpan) rowSpan = needed;
          }
        }
        spanMap.set(cellKey, rowSpan);
        if (rowSpan > 1) {
          for (let skip = 1; skip < rowSpan; skip++) {
            const skipSlot = activeTimeSlots[tIdx + skip];
            if (skipSlot) skipped.add(`${day}-${skipSlot.id}`);
          }
        }
      });
    });

    return { cellSpanMap: spanMap, skippedCellsSet: skipped };
  }, [activeTimeSlots, displayDays, scheduleGridMap, scheduleMode]);

  // Department colors per schedule ID
  const deptColorMap = useMemo(() => {
    const map = new Map();
    for (const s of schedules) {
      if (!s.id) continue;
      map.set(s.id, computeDeptColor(s, departments));
    }
    return map;
  }, [schedules, departments]);

  const getDeptColor = useCallback((schedule) => {
    return deptColorMap.get(schedule?.id) || computeDeptColor(schedule, departments);
  }, [deptColorMap, departments]);

  // Summary unique subjects map
  const { uniqueSubjectsList, totalUnits } = useMemo(() => {
    const uniqueSubjectsMap = {};
    let units = 0;

    schedules.forEach(current => {
      const subjKey = `${current.subject?.id || current.id}${current.component ? '-' + current.component : ''}`;
      const compHours = current.subject?.hasLecLab
        ? (current.component === 'Lecture' ? (Number(current.subject.lectureHours) || 2) : (Number(current.subject.labHours) || 3))
        : (Number(current.hours) || Number(current.subject?.credits) || 3);

      if (!uniqueSubjectsMap[subjKey]) {
        uniqueSubjectsMap[subjKey] = {
          ...current,
          displayUnits: compHours,
          rooms: new Set([current.room?.name].filter(Boolean)),
        };
      } else {
        if (current.room?.name) uniqueSubjectsMap[subjKey].rooms.add(current.room.name);
      }

      const range = getScheduleTimeRange(current, scheduleMode);
      if (range && range.start > 0 && range.end > 0) {
        units += (range.end - range.start) / 60;
      } else {
        units += (Number(current.hours) || compHours);
      }
    });

    const list = Object.values(uniqueSubjectsMap).map(s => ({
      ...s,
      roomNameList: Array.from(s.rooms).join(' / ') || 'TBA'
    })).sort((a, b) => {
      const codeA = (a.subject?.code || '').toString();
      const codeB = (b.subject?.code || '').toString();
      return codeA.localeCompare(codeB);
    });

    return { uniqueSubjectsList: list, totalUnits: units };
  }, [schedules, scheduleMode]);

  // Schedules grouped by day for mobile card view
  const schedulesByDay = useMemo(() => {
    return DAYS.reduce((acc, day) => {
      acc[day] = schedules.filter(s => s.day === day).sort((a, b) => (a.timeSlot?.id ?? 0) - (b.timeSlot?.id ?? 0));
      return acc;
    }, {});
  }, [schedules]);

  // Helper: prepare a clean, desktop-like clone of the schedule for export / print
  const prepareExportClone = useCallback((clone) => {
    // 1. Remove non-printable and interactive elements
    clone.querySelectorAll('.schedule-toolbar, .floating-exit-btn, .rotate-device-hint, .schedule-card-view, .remove-btn, .dept-legend').forEach(el => el.remove());

    // 2. Base container styling
    clone.style.width = '100%';
    clone.style.maxWidth = '100%';
    clone.style.margin = '0';
    clone.style.padding = '0';
    clone.style.background = '#ffffff';
    clone.style.boxShadow = 'none';
    clone.style.borderRadius = '0';
    clone.style.overflow = 'visible';

    // 3. Document header
    const docHeader = clone.querySelector('.schedule-doc-header');
    if (docHeader) {
      docHeader.style.display = 'flex';
      docHeader.style.width = '100%';
      docHeader.style.border = '1px solid #cbd5e1';
      docHeader.style.borderRadius = '8px';
      docHeader.style.marginBottom = '8px';
      docHeader.style.backgroundColor = '#ffffff';
      docHeader.style.overflow = 'hidden';
    }

    const docLogo = clone.querySelector('.schedule-doc-logo');
    if (docLogo) {
      docLogo.style.display = 'flex';
      docLogo.style.flex = '0 0 75px';
      docLogo.style.padding = '6px';
      docLogo.style.alignItems = 'center';
      docLogo.style.justifyContent = 'center';
      docLogo.style.borderRight = '1px solid #cbd5e1';
      docLogo.style.backgroundColor = '#f8fafc';

      const logoImg = docLogo.querySelector('img');
      if (logoImg) {
        logoImg.style.width = '48px';
        logoImg.style.height = '48px';
        logoImg.style.borderRadius = '50%';
        logoImg.style.objectFit = 'cover';
        if (logoImg.complete && logoImg.naturalWidth > 0) {
          try {
            const c = document.createElement('canvas');
            c.width = logoImg.naturalWidth;
            c.height = logoImg.naturalHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(logoImg, 0, 0);
            logoImg.src = c.toDataURL('image/png');
          } catch {
            // keep src as is
          }
        }
      }
    }

    const docTitle = clone.querySelector('.schedule-doc-title');
    if (docTitle) {
      docTitle.style.display = 'flex';
      docTitle.style.flex = '1';
      docTitle.style.flexDirection = 'column';
      docTitle.style.justifyContent = 'center';
      docTitle.style.textAlign = 'center';
      docTitle.style.padding = '6px 12px';
      docTitle.style.borderRight = '1px solid #cbd5e1';

      const h2 = docTitle.querySelector('h2');
      if (h2) {
        h2.style.margin = '0 0 2px 0';
        h2.style.fontSize = '1.0rem';
        h2.style.fontWeight = '700';
        h2.style.color = '#033279';
        h2.style.letterSpacing = '0.5px';
      }
      const h3 = docTitle.querySelector('h3');
      if (h3) {
        h3.style.margin = '0';
        h3.style.fontSize = '0.78rem';
        h3.style.fontWeight = '600';
        h3.style.color = '#475569';
        h3.style.letterSpacing = '1px';
        h3.style.textTransform = 'uppercase';
      }
    }

    const docMeta = clone.querySelector('.schedule-doc-meta');
    if (docMeta) {
      docMeta.style.display = 'flex';
      docMeta.style.flex = '0 0 150px';
      docMeta.style.flexDirection = 'column';
      docMeta.style.justifyContent = 'center';
      docMeta.style.padding = '6px 10px';
      docMeta.style.fontSize = '0.68rem';
      docMeta.style.color = '#475569';
      docMeta.style.gap = '2px';
      docMeta.style.backgroundColor = '#f8fafc';
      docMeta.querySelectorAll('div').forEach((d, idx, arr) => {
        d.style.borderBottom = idx < arr.length - 1 ? '1px solid #cbd5e1' : 'none';
        d.style.paddingBottom = '2px';
      });
    }

    // 4. Subject summary container
    const summaryContainer = clone.querySelector('.schedule-summary-container');
    if (summaryContainer) {
      summaryContainer.style.display = 'block';
      summaryContainer.style.margin = '8px 0';
      summaryContainer.style.padding = '0';
      summaryContainer.style.overflow = 'visible';

      const h3 = summaryContainer.querySelector('h3');
      if (h3) {
        h3.style.margin = '0';
        h3.style.fontSize = '0.90rem';
        h3.style.fontWeight = '700';
        h3.style.color = '#033279';
        h3.style.textTransform = 'uppercase';
        h3.style.textAlign = 'center';
      }
      const h4 = summaryContainer.querySelector('h4');
      if (h4) {
        h4.style.margin = '2px 0';
        h4.style.fontSize = '0.78rem';
        h4.style.fontWeight = '700';
        h4.style.color = '#000000';
        h4.style.textAlign = 'center';
      }
      const p = summaryContainer.querySelector('p');
      if (p) {
        p.style.margin = '0 0 6px 0';
        p.style.fontSize = '0.72rem';
        p.style.color = '#000000';
        p.style.textAlign = 'center';
      }

      const summaryTable = clone.querySelector('.schedule-summary-table');
      if (summaryTable) {
        summaryTable.style.width = '100%';
        summaryTable.style.borderCollapse = 'collapse';
        summaryTable.style.fontSize = '0.68rem';
        summaryTable.style.color = '#000000';
        summaryTable.style.marginBottom = '8px';
        summaryTable.querySelectorAll('th, td').forEach(cell => {
          cell.style.border = '1px solid #000000';
          cell.style.padding = '3px 6px';
          cell.style.boxSizing = 'border-box';
        });
        summaryTable.querySelectorAll('th').forEach(th => {
          th.style.backgroundColor = '#f1f5f9';
          th.style.fontWeight = 'bold';
        });
      }
    }

    // 5. Main table wrapper & schedule table
    const tableWrapper = clone.querySelector('.table-wrapper');
    if (tableWrapper) {
      tableWrapper.style.display = 'block';
      tableWrapper.style.overflow = 'visible';
      tableWrapper.style.zoom = '1';
      tableWrapper.style.transform = 'none';
      tableWrapper.style.width = '100%';
      tableWrapper.style.borderRadius = '0';
      tableWrapper.style.boxShadow = 'none';
      tableWrapper.style.border = 'none';
      tableWrapper.scrollLeft = 0;
    }

    const scheduleTable = clone.querySelector('.schedule-table');
    if (scheduleTable) {
      scheduleTable.style.width = '100%';
      scheduleTable.style.minWidth = '100%';
      scheduleTable.style.maxWidth = '100%';
      scheduleTable.style.tableLayout = 'fixed';
      scheduleTable.style.borderCollapse = 'separate';
      scheduleTable.style.borderSpacing = '0';
      scheduleTable.style.fontSize = '0.70rem';
      scheduleTable.style.zoom = '1';
      scheduleTable.style.transform = 'none';
      scheduleTable.style.borderTop = '1px solid #cbd5e1';
      scheduleTable.style.borderLeft = '1px solid #cbd5e1';

      scheduleTable.querySelectorAll('thead th').forEach(th => {
        th.style.backgroundColor = '#f8fafc';
        th.style.color = '#475569';
        th.style.fontWeight = '700';
        th.style.fontSize = '0.72rem';
        th.style.textAlign = 'center';
        th.style.padding = '4px 3px';
        th.style.borderBottom = '1px solid #cbd5e1';
        th.style.borderRight = '1px solid #cbd5e1';
        th.style.position = 'static';
        th.style.left = 'auto';
        th.style.zIndex = 'auto';
      });

      const firstTh = scheduleTable.querySelector('thead th.sticky-col, thead th:first-child');
      if (firstTh) {
        firstTh.style.width = '80px';
        firstTh.style.minWidth = '80px';
        firstTh.style.maxWidth = '80px';
      }

      scheduleTable.querySelectorAll('tbody tr').forEach(tr => {
        tr.style.height = '30px';
      });

      scheduleTable.querySelectorAll('.time-label').forEach(cell => {
        cell.style.position = 'static';
        cell.style.left = 'auto';
        cell.style.zIndex = 'auto';
        cell.style.width = '80px';
        cell.style.minWidth = '80px';
        cell.style.maxWidth = '80px';
        cell.style.padding = '2px 4px';
        cell.style.fontSize = '0.70rem';
        cell.style.fontWeight = '700';
        cell.style.textAlign = 'center';
        cell.style.verticalAlign = 'middle';
        cell.style.backgroundColor = '#f8fafc';
        cell.style.color = '#1e293b';
        cell.style.borderRight = '1px solid #cbd5e1';
        cell.style.borderBottom = '1px solid #cbd5e1';
      });

      scheduleTable.querySelectorAll('.schedule-cell').forEach(cell => {
        cell.style.height = '30px';
        cell.style.padding = '0';
        cell.style.verticalAlign = 'top';
        cell.style.boxSizing = 'border-box';
        cell.style.borderRight = '1px solid #e2e8f0';
        cell.style.borderBottom = '1px solid #e2e8f0';
        cell.style.position = 'relative';

        if (cell.classList.contains('has-schedule')) {
          cell.style.border = '2px solid #ffffff';
          cell.style.borderRadius = '4px';
        }
      });

      scheduleTable.querySelectorAll('.schedule-item').forEach(item => {
        item.style.padding = '4px 6px';
        item.style.height = '100%';
        item.style.boxSizing = 'border-box';
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.justifyContent = 'flex-start';
        item.style.border = 'none';
        item.style.backgroundColor = 'transparent';

        const content = item.querySelector('.schedule-content');
        if (content) {
          content.style.display = 'flex';
          content.style.flexDirection = 'column';
          content.style.width = '100%';
          content.style.padding = '0';
        }

        const subj = item.querySelector('.subject');
        if (subj) {
          subj.style.fontSize = '0.74rem';
          subj.style.fontWeight = 'bold';
          subj.style.lineHeight = '1.2';
          subj.style.margin = '0';
          subj.style.wordBreak = 'break-word';

          const compSpan = subj.querySelector('span');
          if (compSpan) {
            compSpan.style.display = 'block';
            compSpan.style.fontSize = '0.64rem';
            compSpan.style.fontWeight = 'normal';
            compSpan.style.opacity = '0.9';
            compSpan.style.margin = '0';
          }
        }

        const details = item.querySelector('.details');
        if (details) {
          details.style.marginTop = '4px';
          details.style.display = 'flex';
          details.style.flexDirection = 'column';
          details.style.gap = '2px';
        }

        item.querySelectorAll('.professor, .room, .section').forEach(p => {
          p.style.margin = '0';
          p.style.fontSize = '0.67rem';
          p.style.lineHeight = '1.2';
          p.style.fontWeight = '600';
          p.style.whiteSpace = 'nowrap';
          p.style.overflow = 'hidden';
          p.style.textOverflow = 'ellipsis';
        });
      });
    }
  }, []);

  const handleExportImage = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      showToast('Generating image, please wait...', false);
      const html2canvas = (await import('html2canvas')).default;

      const toolbar = containerRef.current.querySelector('.schedule-toolbar');
      if (toolbar) toolbar.style.display = 'none';

      const clone = containerRef.current.cloneNode(true);
      const wrapper = document.createElement('div');
      wrapper.className = 'schedule-export-wrapper';
      wrapper.style.position = 'absolute';
      wrapper.style.top = '-10000px';
      wrapper.style.left = '-10000px';
      wrapper.style.width = '880px';
      wrapper.style.minWidth = '880px';
      wrapper.style.maxWidth = '880px';
      wrapper.style.height = 'auto';
      wrapper.style.backgroundColor = '#ffffff';
      wrapper.style.padding = '12px 14px';
      wrapper.style.boxSizing = 'border-box';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';

      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      prepareExportClone(clone);

      await new Promise(r => setTimeout(r, 150));

      const finalRect = wrapper.getBoundingClientRect();
      const finalWidth = Math.round(finalRect.width) || 880;
      const finalHeight = Math.round(finalRect.height) || 900;

      const canvas = await html2canvas(wrapper, {
        scale: 2.5,
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
  }, [prepareExportClone, showToast]);

  const handleExportPrint = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      showToast('Preparing print, please wait...', false);

      const toolbar = containerRef.current.querySelector('.schedule-toolbar');
      if (toolbar) toolbar.style.display = 'none';

      const clone = containerRef.current.cloneNode(true);
      if (toolbar) toolbar.style.display = 'flex';

      prepareExportClone(clone);

      // Collect all stylesheets from parent document to ensure vector fonts, grid styling & colors are crisp
      const styleSheets = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(el => el.outerHTML)
        .join('\n');

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '100vw';
      iframe.style.height = '100vh';
      iframe.style.visibility = 'hidden';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.zIndex = '-99999';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(`
          <!DOCTYPE html>
          <html>
          <head>
              <title>Print Schedule</title>
              ${styleSheets}
              <style>
                  @page {
                      size: landscape;
                      margin: 0.2in 0.3in;
                  }
                  *, *::before, *::after {
                      -webkit-print-color-adjust: exact !important;
                      print-color-adjust: exact !important;
                      box-sizing: border-box !important;
                  }
                  html, body {
                      margin: 0 !important;
                      padding: 0 !important;
                      width: 100% !important;
                      background: #ffffff !important;
                      color: #000000 !important;
                      -webkit-font-smoothing: antialiased !important;
                      -moz-osx-font-smoothing: grayscale !important;
                      text-rendering: optimizeLegibility !important;
                  }
                  .print-vector-wrapper {
                      width: 100% !important;
                      max-width: 100% !important;
                      margin: 0 auto !important;
                      padding: 0 !important;
                      page-break-inside: avoid !important;
                      break-inside: avoid !important;
                  }
                  .schedule-table-container {
                      padding: 0 !important;
                      margin: 0 !important;
                      box-shadow: none !important;
                      border-radius: 0 !important;
                      width: 100% !important;
                  }
                  .schedule-table {
                      width: 100% !important;
                      table-layout: fixed !important;
                  }
                  .no-print, .schedule-toolbar, .floating-exit-btn, .rotate-device-hint, .remove-btn {
                      display: none !important;
                  }
              </style>
          </head>
          <body>
              <div class="print-vector-wrapper">
                  ${clone.outerHTML}
              </div>
          </body>
          </html>
      `);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (printErr) {
          console.error('Print trigger error', printErr);
        }
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 2000);
      }, 350);

    } catch (err) {
      console.error(err);
      showToast('Failed to print schedule.');
    }
  }, [prepareExportClone, showToast]);

  useEffect(() => {
    const onExportImage = () => handleExportImage();
    const onExportPrint = () => handleExportPrint();
    const onExportWord = () => exportGridToWord(containerRef.current, user);
    const onExportExcel = () => exportGridToExcel(containerRef.current, user);

    window.addEventListener('export-ordinary-image', onExportImage);
    window.addEventListener('export-ordinary-print', onExportPrint);
    window.addEventListener('export-ordinary-word', onExportWord);
    window.addEventListener('export-ordinary-excel', onExportExcel);

    return () => {
      window.removeEventListener('export-ordinary-image', onExportImage);
      window.removeEventListener('export-ordinary-print', onExportPrint);
      window.removeEventListener('export-ordinary-word', onExportWord);
      window.removeEventListener('export-ordinary-excel', onExportExcel);
    };
  }, [handleExportImage, handleExportPrint, user]);

  // Fullscreen: lock body scroll when fullscreen
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  // Fullscreen resize handler
  useEffect(() => {
    if (!isFullscreen) return;
    const updateFitScale = () => {
      const padding = 32;
      const availableWidth = window.innerWidth - padding;
      const availableHeight = window.innerHeight - padding;
      const tableEl = containerRef.current?.querySelector('.schedule-table');
      const contentWidth = tableEl ? (tableEl.offsetWidth / (fitScale || 1)) : 680;
      const contentHeight = tableEl ? (tableEl.offsetHeight / (fitScale || 1)) : 500;
      const scaleX = availableWidth / Math.max(contentWidth, 680);
      const scaleY = availableHeight / Math.max(contentHeight, 300);
      const isMobilePortrait = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
      const scale = isMobilePortrait ? Math.max(0.85, Math.min(scaleX, scaleY)) : Math.min(scaleX, scaleY);
      setFitScale(scale);
    };
    updateFitScale();
    window.addEventListener('resize', updateFitScale);
    return () => window.removeEventListener('resize', updateFitScale);
  }, [isFullscreen, fitScale]);

  // Native fullscreen changes listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && !isFullscreen) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(err => {
          console.error(`Error enabling fullscreen: ${err.message}`);
          setIsFullscreen(true);
        });
      } else if (containerRef.current?.webkitRequestFullscreen) {
        containerRef.current.webkitRequestFullscreen();
        setIsFullscreen(true);
      } else {
        setIsFullscreen(true);
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => setIsFullscreen(false));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
        setIsFullscreen(false);
      } else {
        setIsFullscreen(false);
      }
    }
  }, [isFullscreen]);

  const handleDragStart = useCallback((e, schedule) => {
    e.dataTransfer.setData('scheduleId', schedule.id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      setDraggingId(schedule.id);
    }, 0);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverCell(null);
  }, []);

  const handleDragOver = useCallback((e, day, timeSlotId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cellKey = `${day}-${timeSlotId}`;
    setDragOverCell(prev => (prev === cellKey ? prev : cellKey));
  }, []);

  const handleDrop = useCallback(async (e, day, timeSlotId) => {
    e.preventDefault();
    setDragOverCell(null);
    setDraggingId(null);
    const scheduleId = e.dataTransfer.getData('scheduleId');
    if (!scheduleId || !onUpdateSchedule) return;
    const movingSchedule = schedules.find(s => String(s.id) === String(scheduleId));
    if (!movingSchedule) return;
    if (movingSchedule.day === day && String(movingSchedule.timeSlot?.id) === String(timeSlotId)) return;

    const baseTimeSlot = TIME_SLOTS.find(ts => String(ts.id) === String(timeSlotId));
    let finalTimeSlot = { ...baseTimeSlot };

    if (movingSchedule.timeSlot && movingSchedule.timeSlot.customLabel) {
      const range = getScheduleTimeRange(movingSchedule, scheduleMode);
      if (range.start > 0 && range.end > 0) {
        const durationMins = range.end - range.start;
        const newStartStr = baseTimeSlot.time.split('-')[0].trim();
        const newStartMins = parseTimeToMinutes(newStartStr);
        if (newStartMins !== null) {
          const newEndMins = newStartMins + durationMins;
          const formatMin = (mins) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            const period = h >= 12 ? 'PM' : 'AM';
            const displayH = h % 12 === 0 ? 12 : h % 12;
            const displayM = m.toString().padStart(2, '0');
            return `${displayH}:${displayM} ${period}`;
          };
          finalTimeSlot.customLabel = `${newStartStr} - ${formatMin(newEndMins)}`;
        }
      }
    }

    // ALWAYS preserve duration by computing customLabel even if original had none, if it visually spanned > 30mins
    const originalRange = getScheduleTimeRange(movingSchedule, scheduleMode);
    if (!movingSchedule.timeSlot?.customLabel && originalRange.start > 0 && originalRange.end > 0) {
      const durationMins = originalRange.end - originalRange.start;
      if (durationMins > 30) {
        const newStartStr = baseTimeSlot.time.split('-')[0].trim();
        const newStartMins = parseTimeToMinutes(newStartStr);
        if (newStartMins !== null) {
          const newEndMins = newStartMins + durationMins;
          const formatMin = (mins) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            const period = h >= 12 ? 'PM' : 'AM';
            const displayH = h % 12 === 0 ? 12 : h % 12;
            const displayM = m.toString().padStart(2, '0');
            return `${displayH}:${displayM} ${period}`;
          };
          finalTimeSlot.customLabel = `${newStartStr} - ${formatMin(newEndMins)}`;
        }
      }
    }

    const candidate = { ...movingSchedule, day, timeSlot: finalTimeSlot };

    const schedulesToCheck = activeSchedules && activeSchedules.length > 0 ? activeSchedules : schedules;
    const overlap = schedulesToCheck.find(s => String(s.id) !== String(scheduleId) && schedulesOverlap(candidate, s, scheduleMode));

    if (overlap) {
      const roomConflict = candidate.room?.id && overlap.room?.id && String(candidate.room.id) === String(overlap.room.id);
      const profConflict = candidate.professor?.id && overlap.professor?.id && String(candidate.professor.id) === String(overlap.professor.id);
      const sectionConflict = candidate.section?.id && overlap.section?.id && String(candidate.section.id) === String(overlap.section.id);

      let reasons = [];
      if (roomConflict) reasons.push(`Room`);
      if (profConflict) reasons.push(`Faculty`);
      if (sectionConflict) reasons.push(`Section`);

      const reasonStr = reasons.join(' and ');
      const isHidden = !schedules.some(vs => String(vs.id) === String(overlap.id));

      // Build specific details string
      const subjStr = overlap.subject?.code || overlap.subject?.name || 'Unknown Subject';
      const secStr = overlap.section?.name || 'Unknown Section';
      const profStr = overlap.professor?.name || 'Unknown Faculty';
      const roomStr = overlap.room?.name || 'Unknown Room';
      const timeStr = overlap.timeSlot?.customLabel || overlap.timeSlot?.label || overlap.timeSlot?.time || 'Unknown Time';
      const dayStr = overlap.day || 'Unknown Day';

      const detailsMsg = `Conflict in ${reasonStr}:\nOverlaps with ${subjStr} (${secStr})\nProf. ${profStr} • ${roomStr}\n${dayStr} @ ${timeStr}`;

      if (isHidden) {
        showToast(`Cannot move schedule (Hidden Class):\n${detailsMsg}`);
      } else {
        showToast(`Cannot move schedule:\n${detailsMsg}`);
      }
      return;
    }
    const result = await onUpdateSchedule(scheduleId, day, finalTimeSlot);
    if (result && result.ok === false) {
      showToast(`Cannot move schedule:\n${result.errors?.join('\n') || result.error || 'Unknown error'}`);
    } else if (result && result.ok) {
      showToast('Schedule successfully updated.', false);
    }
  }, [schedules, onUpdateSchedule, scheduleMode, showToast]);

  return (
    <div ref={containerRef} className={`schedule-table-container ${isFullscreen ? 'schedule-fullscreen' : ''}`}>

      {/* Toolbar Row */}
      <div className="schedule-toolbar no-print">
        {(isAdmin && (onDeleteAll || onToggleDeleteMode)) ? (
          <div className="schedule-toolbar-actions">
            {onDeleteAll && (
              <button
                className="btn btn-sm schedule-viewer-btn schedule-viewer-delete-btn"
                onClick={onDeleteAll}
                style={{
                  backgroundColor: 'var(--danger-bg, #fee2e2)',
                  color: 'var(--danger-text, #ef4444)',
                  border: '1px solid currentColor',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Delete all schedules in current view"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete All
              </button>
            )}
            {onToggleDeleteMode && (
              <button
                className={`btn btn-sm schedule-viewer-btn schedule-viewer-edit-btn ${isDeleteMode ? 'btn-danger' : 'btn-outline'}`}
                onClick={onToggleDeleteMode}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isDeleteMode ? '#fee2e2' : 'white',
                  color: isDeleteMode ? '#dc2626' : 'var(--text-main)',
                  border: `1px solid ${isDeleteMode ? '#fca5a5' : 'var(--border-color)'}`
                }}
                title="Toggle edit mode to delete individual schedules"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                {isDeleteMode ? 'Done Editing' : 'Edit Schedules'}
              </button>
            )}
          </div>
        ) : (
          <div style={{ marginLeft: 'auto' }}></div>
        )}

        {/* Fullscreen Toggle Button */}
        <button
          className="fullscreen-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          style={{ marginLeft: isAdmin ? 'auto' : undefined }}
        >
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
          )}
          <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        </button>
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
      <div className="schedule-summary-container" style={{ margin: '20px 0', padding: '0 10px', width: '100%', overflowX: 'auto', overscrollBehaviorY: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#033279', textTransform: 'uppercase' }}>{fullDepartmentName}</h3>
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
            {uniqueSubjectsList.map(s => {
              const rowKey = `${s.subject?.id || s.id}${s.component ? '-' + s.component : ''}`;
              return (
                <tr key={rowKey}>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>{s.subject?.code || ''}{s.component ? ` (${s.component})` : ''}</td>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>{s.subject?.title || s.subject?.description || ''}</td>
                  <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{s.displayUnits ?? s.subject?.credits ?? ''}</td>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>{s.professor?.name || ''}</td>
                  <td style={{ border: '1px solid #000', padding: '6px' }}>{s.roomNameList}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="2" style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>Total</td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{totalUnits}</td>
              <td colSpan="2" style={{ border: '1px solid #000', padding: '6px' }}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Main Grid View */}
      <div className="table-wrapper" style={{ overscrollBehaviorY: 'auto' }}>
        <table
          className="schedule-table"
          style={isFullscreen && fitScale !== 1 ? { transform: `scale(${fitScale})`, transformOrigin: 'top center' } : undefined}
        >
          <thead>
            <tr>
              <th className="sticky-col" style={{ width: '130px', minWidth: '130px', backgroundClip: 'padding-box', backgroundColor: 'var(--table-header, #F8FAFC)', borderRight: '1px solid var(--border-color)' }}>Time Slot</th>
              {displayDays.map(day => <th key={day} style={{ backgroundClip: 'padding-box', backgroundColor: 'var(--table-header, #F8FAFC)' }}>{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {activeTimeSlots.map((timeSlot, tIdx) => {
              const isHourGroupHead = tIdx % 2 === 0;
              const nextSlot = activeTimeSlots[tIdx + 1];
              const timeRowSpan = isHourGroupHead ? (nextSlot ? 2 : 1) : 0;
              const hourLabel = isHourGroupHead
                ? (nextSlot ? `${timeSlot.label.split(' - ')[0]} - ${nextSlot.label.split(' - ')[1]}` : timeSlot.label)
                : '';

              return (
                <tr key={timeSlot.id} className={isHourGroupHead ? 'hour-row' : 'half-hour-row'}>
                  {isHourGroupHead && (
                    <td className="time-label sticky-col" rowSpan={timeRowSpan} style={{ borderRight: '1px solid var(--border-color)' }}>
                      <strong>{hourLabel}</strong>
                    </td>
                  )}
                  {displayDays.map(day => {
                    const cellKey = `${day}-${timeSlot.id}`;

                    if (skippedCellsSet.has(cellKey)) {
                      return null;
                    }

                    const isDropTarget = dragOverCell === cellKey;
                    const cellSchedules = scheduleGridMap.get(cellKey) || [];
                    const rowSpan = cellSpanMap.get(cellKey) || 1;
                    const primaryColor = cellSchedules.length > 0 ? getDeptColor(cellSchedules[0]) : null;

                    return (
                      <td
                        key={cellKey}
                        rowSpan={rowSpan}
                        className={`schedule-cell ${isDropTarget ? 'drag-over' : ''} ${cellSchedules.length > 0 ? 'has-schedule' : ''}`}
                        onDragOver={(e) => handleDragOver(e, day, timeSlot.id)}
                        onDrop={(e) => handleDrop(e, day, timeSlot.id)}
                        style={primaryColor ? { backgroundColor: primaryColor.bg, padding: 0 } : undefined}
                      >
                        {cellSchedules.map((schedule) => {
                          const deptColor = getDeptColor(schedule);
                          const profFormatted = formatProfessorName(schedule.professor?.name);

                          return (
                            <div
                              key={schedule.id}
                              className={`schedule-item ${draggingId === schedule.id ? 'dragging' : ''}`}
                              draggable={!!onUpdateSchedule && isDeleteMode}
                              onDragStart={(e) => handleDragStart(e, schedule)}
                              onDragEnd={handleDragEnd}
                              style={{ cursor: (onUpdateSchedule && isDeleteMode) ? 'grab' : 'default' }}
                            >
                              <div className="schedule-content" style={{ display: 'flex', flexDirection: 'column', paddingRight: (onRemove && isDeleteMode) ? '24px' : '0' }}>
                                <p className="subject" style={{ color: deptColor.text, fontWeight: 'bold', margin: 0 }}>
                                  {schedule.subject?.code ?? '—'}
                                  {schedule.component && <span style={{ fontSize: '0.7em', display: 'block', fontWeight: 'normal', opacity: 0.9 }}>{schedule.component}</span>}
                                </p>
                                <div className="details" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <p className="professor" style={{ color: deptColor.text, fontWeight: 'bold', margin: 0, lineHeight: '1.2' }}>
                                    {profFormatted}
                                  </p>
                                  <p className="room" style={{ color: deptColor.text, fontWeight: 'bold', margin: 0, lineHeight: '1.2' }}>
                                    {schedule.room?.name ?? '—'}
                                  </p>
                                  {schedule.section && (
                                    <p className="section" style={{ color: deptColor.text, fontWeight: 'bold', margin: 0, lineHeight: '1.2' }}>
                                      {schedule.section.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {onRemove && isDeleteMode && (
                                <button
                                  className="remove-btn"
                                  onClick={async (e) => {
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
                                  }}
                                  title="Delete schedule"
                                  aria-label="Delete schedule"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    <line x1="10" y1="11" x2="10" y2="17" />
                                    <line x1="14" y1="11" x2="14" y2="17" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Floating Exit Fullscreen Button */}
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

          <div className="rotate-device-hint">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.34-11.14l1.5 1.5" /></svg>
            <span>Rotate for best view</span>
          </div>
        </>
      )}

      {/* Preview Modal */}
      {previewImage && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100000, display: 'flex', flexDirection: 'column', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', margin: 'auto', padding: '16px', borderRadius: '12px', maxWidth: '95vw', width: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.1rem' }}>Schedule Preview</h3>
            <div style={{ maxHeight: '65vh', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '16px', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '8px' }}>
              <img src={previewImage} alt="Schedule Preview" style={{ maxWidth: '100%', width: 'auto', height: 'auto', display: 'block', margin: '0 auto', imageRendering: 'high-quality' }} />
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
});

export default ScheduleTable;