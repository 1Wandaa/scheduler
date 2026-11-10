import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Copy,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Search,
  ArrowRight,
  RotateCcw,
  SlidersHorizontal,
  ShieldCheck,
  Info,
  Clock,
  X,
  Play,
  RefreshCw,
  Square,
  Trash2
} from 'lucide-react';
import { suggestProfessorMatches } from '../../utils/scheduleAI';
import { TIME_SLOTS, DAYS, SCHEDULE_MODES } from '../../config/constants';
import {
  getMeetingTimeLabel,
  professorMatchesSubject,
  getEligibleProfessors,
  isRoomAllowedFor
} from '../../utils/scheduleUtils';
import '../../styles/AutoScheduler.css';
import { toast } from 'sonner';
import { useGlobalDialog } from '../../context/GlobalDialogContext';
import CustomSelect from '../CustomSelect/CustomSelect';

function AutoScheduler({
  validator,
  subjects,
  sections,
  professors,
  rooms,
  schedules = [],
  activeSemester,
  activeSchoolYear,
  onNavigateTab,
  onLogHistory,
  onBack
}) {
  const navigate = useNavigate();
  const { confirm } = useGlobalDialog();
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, placed: 0, total: 0, pass: 0 });
  const [resultFilter, setResultFilter] = useState('');
  const abortRef = useRef(null);
  const progressRef = useRef(null);

  const [engineMode, setEngineMode] = useState('full');
  const [targetId, setTargetId] = useState('');
  const [scheduleMode, setScheduleMode] = useState(SCHEDULE_MODES.STANDARD);

  // Scheduling Constraints
  const [respectLabs, setRespectLabs] = useState(true);
  const [preventDoubleBooking, setPreventDoubleBooking] = useState(true);
  const [aiAssisted, setAiAssisted] = useState(true);
  const [aiStatus, setAiStatus] = useState('');

  const runTargetedRef = useRef(null);

  // Listen for custom events to change engine mode from mobile Speed Dial
  useEffect(() => {
    const handleModeChange = (e) => {
      if (e.detail) {
        setEngineMode(e.detail);
        setTargetId('');
        setResult(null);
        setResultFilter('');
      }
    };
    const handleExecuteEvent = (e) => {
      if (e.detail) {
        const isFull = e.detail === 'ga' || e.detail.mode === 'ga' || e.detail === 'full' || e.detail.mode === 'full';
        const newMode = isFull ? 'full' : e.detail.mode;
        const newTargetId = isFull ? '' : (e.detail.targetId || '');
        setEngineMode(newMode);
        setTargetId(newTargetId);
        setResult(null);
        setResultFilter('');
        runTargetedRef.current?.({ mode: newMode, targetId: newTargetId });
      }
    };
    window.addEventListener('change-autoscheduler-mode', handleModeChange);
    window.addEventListener('execute-autoscheduler', handleExecuteEvent);
    return () => {
      window.removeEventListener('change-autoscheduler-mode', handleModeChange);
      window.removeEventListener('execute-autoscheduler', handleExecuteEvent);
    };
  }, []);

  // Filter subjects for the active semester
  const activeSemesterSubjects = useMemo(() => {
    return (subjects || []).filter(sub => !sub.semester || sub.semester === 'Both' || sub.semester === activeSemester);
  }, [subjects, activeSemester]);

  const activeSubjectIdSet = useMemo(() => {
    return new Set(activeSemesterSubjects.flatMap(s => [String(s.id), s.code]).filter(Boolean));
  }, [activeSemesterSubjects]);

  const targetName = useMemo(() => {
    if (!targetId || engineMode === 'full') return '';
    if (engineMode === 'faculty') return professors?.find(p => String(p.id) === String(targetId))?.name || 'Selected Faculty';
    if (engineMode === 'section') return sections?.find(s => String(s.id) === String(targetId))?.name || 'Selected Section';
    if (engineMode === 'room') return rooms?.find(r => String(r.id) === String(targetId))?.name || 'Selected Room';
    return '';
  }, [engineMode, targetId, professors, sections, rooms]);

  const targetSchedules = useMemo(() => {
    if (engineMode === 'full' || !targetId || !schedules?.length) return [];
    if (engineMode === 'section') {
      return schedules.filter(s => String(s.section?.id) === String(targetId) || String(s.section) === String(targetId));
    }
    if (engineMode === 'faculty') {
      return schedules.filter(s => String(s.professor?.id) === String(targetId) || String(s.professor) === String(targetId));
    }
    if (engineMode === 'room') {
      return schedules.filter(s => String(s.room?.id) === String(targetId) || String(s.room) === String(targetId));
    }
    return [];
  }, [engineMode, targetId, schedules]);

  const handleNavigateView = (tab) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    } else {
      navigate(`/dashboard/${tab}`);
      window.dispatchEvent(new CustomEvent('change-tab', { detail: tab }));
    }
  };

  // CLEAR ALL SCHEDULES for the active semester
  const handleClearAll = async () => {
    const termLabel = `${activeSemester || 'Active Term'}${activeSchoolYear ? ` (${activeSchoolYear})` : ''}`;
    const isConfirmed = await confirm({
      title: 'Clear All Schedules?',
      text: `Are you sure you want to delete all schedules for ${termLabel}? This cannot be undone.`,
      icon: 'warning',
      confirmButtonText: 'Yes, Clear All',
      isDestructive: true
    });

    if (!isConfirmed) return;

    setClearing(true);
    try {
      await validator.clearAllSchedules();
      setResult(null);
      setAiStatus('');
      toast.success(`Removed all schedules for ${termLabel}.`);
    } catch (e) {
      console.error('Failed to clear schedules:', e);
      toast.error('Failed to clear schedules.');
    }
    setClearing(false);
  };

  // CLEAR TARGET SCHEDULES ONLY
  const handleClearTarget = async () => {
    if (!targetSchedules.length || !validator.removeSchedulesBatch) return;
    const isConfirmed = await confirm({
      title: `Clear ${targetName} Schedules?`,
      text: `Delete all ${targetSchedules.length} schedules for ${targetName}? Other schedules will remain untouched.`,
      icon: 'warning',
      confirmButtonText: `Delete ${targetSchedules.length} Classes`,
      isDestructive: true
    });

    if (!isConfirmed) return;

    setClearing(true);
    try {
      const ids = targetSchedules.map(s => s.id);
      const res = await validator.removeSchedulesBatch(ids);
      if (res?.ok === false) {
        toast.error(`Failed to clear schedules for ${targetName}.`);
      } else {
        toast.success(`Removed ${ids.length} schedules for ${targetName}.`);
        setResult(null);
      }
    } catch (e) {
      console.error('Failed to clear target schedules:', e);
      toast.error('Error clearing target schedules.');
    }
    setClearing(false);
  };

  // Cancel execution
  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setResult({ schedule: [], unscheduled: [], prescriptions: [], error: 'Scheduling stopped by user.', mode: engineMode });
    setLoading(false);
    setAiStatus('');
    setProgress({ percent: 0, placed: 0, total: 0, pass: 0 });
  };

  // Run the Allocation Engine
  const runTargeted = async (overrideParams = null) => {
    const activeEngineMode = overrideParams?.mode || engineMode;
    const activeTargetId = overrideParams?.targetId !== undefined ? overrideParams.targetId : targetId;

    if (activeEngineMode !== 'full' && !activeTargetId) {
      toast.error(`Please select a ${activeEngineMode} first.`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setResult(null);
    setProgress({ percent: 0, placed: 0, total: 0, pass: 0 });
    setAiStatus('');
    setTimeout(() => progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);

    try {
      let aiProfessorMap = null;
      if (aiAssisted) {
        try {
          setAiStatus('Matching professors with subjects...');
          aiProfessorMap = await suggestProfessorMatches(professors, activeSemesterSubjects, sections, schedules);
          if (controller.signal.aborted) return;

          if (aiProfessorMap) {
            setAiStatus('Matching complete. Scheduling classes...');
          } else {
            setAiStatus('Scheduling classes...');
          }
        } catch (aiError) {
          if (controller.signal.aborted) return;
          console.warn('[AutoScheduler] Pre-processing fallback to standard matching:', aiError);
          setAiStatus('Scheduling classes...');
        }
      }

      if (controller.signal.aborted) return;

      const constraints = { respectLabs, preventDoubleBooking, aiProfessorMap, scheduleMode, aiAssisted };
      const schedulerOptions = {
        onProgress: (p) => setProgress(p),
        signal: controller.signal,
      };

      let r = null;
      if (activeEngineMode === 'full') {
        r = await validator.autoScheduleFull(constraints, schedulerOptions);
      } else if (activeEngineMode === 'faculty') {
        r = await validator.autoScheduleForFaculty(activeTargetId, constraints, schedulerOptions);
      } else if (activeEngineMode === 'room') {
        r = await validator.autoScheduleForRoom(activeTargetId, constraints, schedulerOptions);
      } else if (activeEngineMode === 'section') {
        r = await validator.autoScheduleForSection(activeTargetId, constraints, schedulerOptions);
      } else {
        throw new Error('Invalid mode selected.');
      }

      if (controller.signal.aborted) return;

      const rawPlaced = r?.results || [];
      const unscheduledResults = r?.unscheduled || [];

      if (rawPlaced.length > 0) {
        setAiStatus('Saving schedules...');
        const batchResult = await validator.addSchedulesBatch(rawPlaced, scheduleMode, { respectLabs });

        if (!batchResult?.ok) {
          const saveErrMsg = Array.isArray(batchResult?.errors)
            ? batchResult.errors.join('; ')
            : (batchResult?.errors || 'Database write rejected');
          console.error('Batch save error:', batchResult?.errors);
          toast.error('Could not save schedules to the database.');

          setResult({
            schedule: [],
            unscheduled: [
              ...unscheduledResults,
              ...rawPlaced.map(s => ({
                subject: s.subject,
                section: s.section,
                reason: `Save error: ${saveErrMsg}`
              }))
            ],
            prescriptions: [],
            error: `Failed to save: ${saveErrMsg}`,
            mode: activeEngineMode
          });
          setAiStatus('Could not save schedules. Please check errors below.');
        } else {
          const writtenCount = batchResult.writtenCount ?? rawPlaced.length;
          const savedSchedules = rawPlaced.slice(0, writtenCount);
          const rejectedBatch = rawPlaced.slice(writtenCount).map((s, idx) => ({
            subject: s.subject,
            section: s.section,
            reason: batchResult.errors?.[idx] || 'Not saved due to conflict'
          }));

          const finalUnscheduled = [...unscheduledResults, ...rejectedBatch];

          setResult({
            schedule: savedSchedules,
            unscheduled: finalUnscheduled,
            prescriptions: [],
            error: r.error || null,
            mode: activeEngineMode
          });

          toast.success(`Saved ${writtenCount} schedule${writtenCount > 1 ? 's' : ''}!`, {
            action: {
              label: 'View Timetable',
              onClick: () => {
                navigate('/dashboard/view-schedules');
                window.dispatchEvent(new CustomEvent('change-tab', { detail: 'view-schedules' }));
              }
            }
          });

          if (finalUnscheduled.length === 0) {
            setAiStatus('All classes scheduled successfully!');
          } else {
            setAiStatus(`Done. ${finalUnscheduled.length} class${finalUnscheduled.length > 1 ? 'es' : ''} could not be scheduled.`);
          }

          if (onLogHistory) {
            onLogHistory({
              engineMode: activeEngineMode,
              totalAttempted: rawPlaced.length + unscheduledResults.length,
              successCount: writtenCount,
              errorCount: finalUnscheduled.length,
              errors: finalUnscheduled.map(u => ({
                subject: u.subject?.code || u.subject?.name || 'Unknown',
                section: u.section?.name || 'Unknown',
                reason: u.reason || 'No open slot or conflict',
                details: u.details || null
              }))
            });
          }
        }
      } else {
        setResult({
          schedule: [],
          unscheduled: unscheduledResults,
          prescriptions: [],
          error: r.error || (unscheduledResults.length > 0 ? null : 'No classes found to schedule.'),
          mode: activeEngineMode
        });

        if (unscheduledResults.length > 0) {
          setAiStatus(`${unscheduledResults.length} class${unscheduledResults.length > 1 ? 'es' : ''} could not be scheduled. See details below.`);
        } else {
          setAiStatus('No classes found for this selection.');
        }

        if (onLogHistory && unscheduledResults.length > 0) {
          onLogHistory({
            engineMode: activeEngineMode,
            totalAttempted: unscheduledResults.length,
            successCount: 0,
            errorCount: unscheduledResults.length,
            errors: unscheduledResults.map(u => ({
              subject: u.subject?.code || u.subject?.name || 'Unknown',
              section: u.section?.name || 'Unknown',
              reason: u.reason || 'No open slot or conflict',
              details: u.details || null
            }))
          });
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        console.error('[AutoScheduler] Engine run failed:', e);
        setResult({ schedule: [], unscheduled: [], prescriptions: [], error: e.message, mode: activeEngineMode });
        setAiStatus('Scheduling failed. Please try again.');
      }
    } finally {
      if (!controller.signal.aborted) {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setLoading(false);
      }
    }
  };

  runTargetedRef.current = runTargeted;

  const handleExecute = () => {
    runTargeted();
  };

  const targetOptions = useMemo(() => {
    if (engineMode === 'faculty') {
      return (professors || [])
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(p => ({
          value: p.id,
          label: p.department ? `${p.name} (${p.department})` : p.name
        }));
    }
    if (engineMode === 'room') {
      return Object.entries(
        (rooms || []).reduce((acc, r) => {
          const b = r.building || 'General Classrooms';
          if (!acc[b]) acc[b] = [];
          acc[b].push(r);
          return acc;
        }, {})
      )
        .sort(([bA], [bB]) => bA.localeCompare(bB))
        .map(([building, bRooms]) => ({
          label: building,
          options: bRooms
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
            .map(r => ({
              value: r.id,
              label: r.name + (r.type && r.type !== 'Lecture' ? ` [${r.type}]` : '')
            }))
        }));
    }
    if (engineMode === 'section') {
      return (sections || [])
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
        .map(s => ({
          value: s.id,
          label: (s.department || s.program) ? `${s.name} (${s.department || s.program})` : s.name
        }));
    }
    return [];
  }, [engineMode, professors, rooms, sections]);

  const targetPlaceholder =
    engineMode === 'faculty' ? 'Choose faculty...' :
    engineMode === 'room' ? 'Choose room...' :
    engineMode === 'section' ? 'Choose section...' :
    'Select target...';

  // Mode-dependent preflight summary
  const preflightStats = useMemo(() => {
    if (engineMode === 'section') {
      if (!targetId) {
        return {
          isReady: false,
          totalSubs: 0,
          label: 'Select a section to see required subjects.'
        };
      }
      const sec = sections?.find(s => String(s.id) === String(targetId));
      const matchingSubs = (sec?.subjects || []).filter(subRef => activeSubjectIdSet.has(String(subRef)));
      return {
        isReady: true,
        totalSubs: matchingSubs.length,
        label: `${matchingSubs.length} subjects for ${sec?.name || 'Section'} (${activeSemester})`
      };
    }

    if (engineMode === 'faculty') {
      if (!targetId) {
        return {
          isReady: false,
          totalSubs: 0,
          label: 'Select a faculty member to see eligible classes.'
        };
      }
      const prof = professors?.find(p => String(p.id) === String(targetId));
      let count = 0;
      (sections || []).forEach(sec => {
        (sec.subjects || []).forEach(subRef => {
          if (!activeSubjectIdSet.has(String(subRef))) return;
          const sub = (subjects || []).find(s => String(s.id) === String(subRef) || s.code === subRef);
          if (sub && professorMatchesSubject(prof, sub)) {
            const eligible = getEligibleProfessors(professors, sub, sec);
            if (eligible.some(p => String(p.id) === String(prof.id))) {
              count++;
            }
          }
        });
      });
      return {
        isReady: true,
        totalSubs: count,
        label: `${count} classes available for ${prof?.name || 'Faculty'} (${activeSemester})`
      };
    }

    if (engineMode === 'room') {
      if (!targetId) {
        return {
          isReady: false,
          totalSubs: 0,
          label: 'Select a room to see compatible classes.'
        };
      }
      const room = rooms?.find(r => String(r.id) === String(targetId));
      let count = 0;
      (sections || []).forEach(sec => {
        (sec.subjects || []).forEach(subRef => {
          if (!activeSubjectIdSet.has(String(subRef))) return;
          const sub = (subjects || []).find(s => String(s.id) === String(subRef) || s.code === subRef);
          if (!sub) return;
          if (respectLabs) {
            if (sub.requiredLab && !room?.hasComputers) return;
            if (sub.isFoodLab && !room?.isFoodLab) return;
          }
          if (isRoomAllowedFor(room, sub, sec)) {
            count++;
          }
        });
      });
      return {
        isReady: true,
        totalSubs: count,
        label: `${count} classes fit in ${room?.name || 'Room'} (${activeSemester})`
      };
    }

    // Full engine mode
    let totalSubs = 0;
    (sections || []).forEach(sec => {
      const matching = (sec.subjects || []).filter(subRef => activeSubjectIdSet.has(String(subRef)));
      totalSubs += matching.length;
    });
    return {
      isReady: true,
      totalSubs,
      label: `${totalSubs} subjects across ${(sections || []).length} sections (${activeSemester})`
    };
  }, [engineMode, targetId, sections, subjects, professors, rooms, activeSubjectIdSet, activeSemester, respectLabs]);

  const resultStats = useMemo(() => {
    if (!result) return null;
    const placed = result.schedule?.length || 0;
    const unplaced = result.unscheduled?.length || 0;
    const total = placed + unplaced;
    const successRate = total > 0 ? Math.round((placed / total) * 100) : 0;
    const uniqueRooms = new Set(result.schedule.map(s => s.room?.id).filter(Boolean)).size;
    const uniqueProfs = new Set(result.schedule.map(s => s.professor?.id).filter(Boolean)).size;
    return { placed, unplaced, total, successRate, uniqueRooms, uniqueProfs };
  }, [result]);

  const filteredGroupedSchedule = useMemo(() => {
    if (!result?.schedule?.length) return {};
    const q = resultFilter.trim().toLowerCase();
    const map = {};
    for (const curr of result.schedule) {
      if (q) {
        const matchesSub = (curr.subject?.code || '').toLowerCase().includes(q) || (curr.subject?.name || '').toLowerCase().includes(q);
        const matchesSec = (curr.section?.name || '').toLowerCase().includes(q);
        const matchesProf = (curr.professor?.name || '').toLowerCase().includes(q);
        const matchesRoom = (curr.room?.name || '').toLowerCase().includes(q);
        if (!matchesSub && !matchesSec && !matchesProf && !matchesRoom) continue;
      }
      if (!map[curr.day]) map[curr.day] = [];
      map[curr.day].push(curr);
    }
    return map;
  }, [result?.schedule, resultFilter]);

  const hasFilteredClasses = useMemo(() => {
    return Object.values(filteredGroupedSchedule).some(arr => arr && arr.length > 0);
  }, [filteredGroupedSchedule]);

  const dataIssues = useMemo(() => {
    return (result?.unscheduled || []).filter(u => {
      const r = (u.reason || '').toLowerCase();
      return r.includes('no faculty') || r.includes('not eligible') || r.includes('no computer lab') || r.includes('no food lab') || r.includes('no available');
    });
  }, [result?.unscheduled]);

  const slotConflicts = useMemo(() => {
    return (result?.unscheduled || []).filter(u => {
      const r = (u.reason || '').toLowerCase();
      return !(r.includes('no faculty') || r.includes('not eligible') || r.includes('no computer lab') || r.includes('no food lab') || r.includes('no available'));
    });
  }, [result?.unscheduled]);

  const handleCopyConflictReport = async () => {
    if (!result?.unscheduled?.length) return;
    const lines = [
      `=== SCHEDULE CONFLICT REPORT ===`,
      `Term: ${activeSemester || ''} ${activeSchoolYear || ''}`,
      `Mode: ${result.mode || engineMode}`,
      `Date: ${new Date().toLocaleString()}`,
      `Summary: Placed ${result.schedule?.length || 0} | Unscheduled ${result.unscheduled.length}`,
      ``,
      `UNSCHEDULED CLASSES (${result.unscheduled.length}):`
    ];
    result.unscheduled.forEach((u, i) => {
      lines.push(`${i + 1}. ${u.subject?.code || u.subject?.name || 'Subject'} (${u.section?.name || 'Section'})`);
      lines.push(`   Reason: ${u.reason || 'No open slot'}`);
      if (u.details?.suggestion) lines.push(`   Fix: ${u.details.suggestion}`);
    });

    const reportText = lines.join('\n');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(reportText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = reportText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      toast.success('Conflict report copied to clipboard.');
    } catch (err) {
      console.error('Clipboard copy error:', err);
      toast.error('Could not copy report to clipboard.');
    }
  };

  return (
    <div className="card autosched-container" style={{ overflow: 'visible' }}>
      {/* Header */}
      <div className="autosched-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button type="button" className="back-btn" onClick={onBack} title="Return to Dashboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back
            </button>
          )}
          <div className="autosched-header-title">
            <SlidersHorizontal size={20} className="autosched-header-icon" />
            <div>
              <h2>Auto Scheduler</h2>
              <p>Generate class schedules automatically without conflicts.</p>
            </div>
          </div>
        </div>
        <div className="autosched-term-badge">
          <Calendar size={13} />
          <span>{activeSemester || 'Active Term'}{activeSchoolYear ? ` • ${activeSchoolYear}` : ''}</span>
        </div>
      </div>

      {/* Scope / Engine Mode Selection */}
      <div className="autosched-form-row">
        <div className="form-group" style={{ flex: '1 1 240px' }}>
          <label className="form-label">Schedule By</label>
          <select
            className="form-select"
            value={engineMode}
            onChange={(e) => {
              setEngineMode(e.target.value);
              setTargetId('');
              setResult(null);
              setResultFilter('');
            }}
          >
            <option value="full">All Sections</option>
            <option value="section">By Section</option>
            <option value="faculty">By Faculty</option>
            <option value="room">By Room</option>
          </select>
        </div>

        {engineMode !== 'full' && (
          <div className="form-group" style={{ flex: '2 1 320px' }}>
            <label className="form-label">
              Select {engineMode === 'faculty' ? 'Faculty' : engineMode === 'room' ? 'Room' : 'Section'}
            </label>
            <CustomSelect
              name="targetId"
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setResult(null);
              }}
              placeholder={targetPlaceholder}
              options={targetOptions}
            />
          </div>
        )}
      </div>

      {/* Scheduling Rules */}
      <div className="autosched-constraints-panel">
        <div className="autosched-constraints-title">
          <ShieldCheck size={16} />
          <span>Scheduling Rules</span>
        </div>
        <div className="autosched-constraints-grid">
          <label className="autosched-constraint-item">
            <input
              type="checkbox"
              checked={preventDoubleBooking}
              onChange={(e) => setPreventDoubleBooking(e.target.checked)}
            />
            <div>
              <strong>Prevent Double Booking</strong>
              <span>Avoid overlapping times for rooms, faculty, and sections</span>
            </div>
          </label>

          <label className="autosched-constraint-item">
            <input
              type="checkbox"
              checked={respectLabs}
              onChange={(e) => setRespectLabs(e.target.checked)}
            />
            <div>
              <strong>Match Lab Rooms</strong>
              <span>Assign lab subjects to computer or food labs</span>
            </div>
          </label>

          <label className="autosched-constraint-item">
            <input
              type="checkbox"
              checked={aiAssisted}
              onChange={(e) => setAiAssisted(e.target.checked)}
            />
            <div>
              <strong>Smart Professor Matching</strong>
              <span>Match professors based on their subjects and load limits</span>
            </div>
          </label>
        </div>
      </div>

      {/* Schedule Type (5-Day vs 4-Day) */}
      <div className="autosched-schedule-type-section">
        <label className="autosched-section-label">Schedule Type</label>
        <div className="segmented-control">
          <button
            type="button"
            onClick={() => setScheduleMode(SCHEDULE_MODES.STANDARD)}
            className={`segmented-btn ${scheduleMode === SCHEDULE_MODES.STANDARD ? 'active' : ''}`}
          >
            5-Day (Mon–Fri)
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode(SCHEDULE_MODES.FOUR_DAY)}
            className={`segmented-btn ${scheduleMode === SCHEDULE_MODES.FOUR_DAY ? 'active' : ''}`}
          >
            4-Day (Mon–Thu)
          </button>
        </div>

        <div className="autosched-schedule-callout">
          <Clock size={14} className="text-muted" style={{ flexShrink: 0, marginTop: '2px' }} />
          {scheduleMode === SCHEDULE_MODES.FOUR_DAY ? (
            <p>
              <strong>Mon–Thu:</strong> Morning (7:00 AM – 11:30 AM), Lunch (11:30 AM – 12:30 PM), Afternoon (12:30 PM – 6:00 PM).
            </p>
          ) : (
            <p>
              <strong>Mon–Fri:</strong> Morning (7:30 AM – 11:30 AM), Lunch (11:30 AM – 12:30 PM), Afternoon (12:30 PM – 5:00 PM).
            </p>
          )}
        </div>
      </div>

      {/* Summary before running */}
      <div className="autosched-preflight-card">
        <div className="autosched-preflight-info">
          <Info size={16} className="autosched-preflight-icon" />
          <div>
            <strong>Ready to Schedule:</strong>{' '}
            <span className="autosched-preflight-text">{preflightStats.label}</span>
          </div>
        </div>
        {targetSchedules.length > 0 && (
          <div className="autosched-preflight-badge">
            <Calendar size={13} />
            <span>{targetSchedules.length} already scheduled</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="autosched-actions-row">
        {!loading ? (
          <>
            <button
              id="btn-execute-autoschedule"
              type="button"
              onClick={handleExecute}
              disabled={clearing || (engineMode !== 'full' && !targetId)}
              className="btn autosched-btn-primary"
            >
              <Play size={16} />
              <span>Generate Schedule</span>
            </button>

            <div className="autosched-secondary-actions">
              {engineMode !== 'full' && targetId && targetSchedules.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearTarget}
                  disabled={clearing}
                  className="btn-danger-outline"
                  title={`Delete only the ${targetSchedules.length} schedules of ${targetName}`}
                >
                  <Trash2 size={15} />
                  <span>{clearing ? 'Clearing...' : `Clear ${targetName} (${targetSchedules.length})`}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearing}
                className="btn-danger-outline"
              >
                <RotateCcw size={15} />
                <span>{clearing ? 'Clearing...' : 'Clear All Schedules'}</span>
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={handleCancel}
            className="btn-danger-outline autosched-btn-cancel"
          >
            <Square size={14} />
            <span>Cancel</span>
          </button>
        )}
      </div>

      {/* Helper text if target is not selected */}
      {engineMode !== 'full' && !targetId && (
        <p className="autosched-helper-warn">
          <AlertCircle size={14} />
          <span>Please select a {engineMode} above to continue.</span>
        </p>
      )}

      {/* Progress Bar */}
      {loading && (
        <div ref={progressRef} className="autosched-progress-wrapper">
          <div className="autosched-progress-meta">
            <span className="autosched-pass-label">
              Step {progress.pass > 0 ? progress.pass : 1} of {aiAssisted ? '4' : '3'} &mdash; {progress.percent}%
            </span>
            <span className="autosched-count-label">
              {progress.placed > 0 ? `${progress.placed} of ${progress.total} classes placed` : 'Preparing schedule...'}
            </span>
          </div>
          <div className="autosched-progress-bar-track">
            <div
              className="autosched-progress-bar-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="autosched-progress-detail">
            {progress.pass === 1 && 'Step 1: Assigning main rooms and days...'}
            {progress.pass === 2 && 'Step 2: Checking shared rooms and alternate days...'}
            {progress.pass === 3 && 'Step 3: Fitting remaining classes in open rooms...'}
            {progress.pass === 4 && 'Step 4: Resolving remaining conflicts...'}
            {progress.pass === 0 && 'Starting scheduler...'}
          </p>
        </div>
      )}

      {/* Status banner */}
      {aiStatus && (
        <div className="autosched-status-banner">
          {loading ? (
            <RefreshCw size={15} className="autosched-spin-icon" />
          ) : result?.unscheduled?.length > 0 ? (
            <AlertTriangle size={15} className="text-warning" />
          ) : (
            <CheckCircle2 size={15} className="text-success" />
          )}
          <span>{aiStatus}</span>
        </div>
      )}

      {/* Results Section */}
      {result && !loading && (
        <div className="autosched-results-wrapper">

          {/* Error Message */}
          {result.error && (
            <div className="autosched-error-banner">
              <AlertCircle size={18} />
              <div>
                <strong>Notice:</strong> {result.error}
              </div>
            </div>
          )}

          {/* Quick Stats */}
          {resultStats && (
            <div className="autosched-kpi-bar">
              <div className="autosched-kpi-card">
                <span className="kpi-label">Success Rate</span>
                <span className={`kpi-value ${resultStats.successRate === 100 ? 'text-success' : resultStats.successRate >= 80 ? 'text-warning' : 'text-danger'}`}>
                  {resultStats.successRate}%
                </span>
              </div>
              <div className="autosched-kpi-card">
                <span className="kpi-label">Scheduled</span>
                <span className="kpi-value text-success">{resultStats.placed}</span>
              </div>
              <div className="autosched-kpi-card">
                <span className="kpi-label">Unscheduled</span>
                <span className={`kpi-value ${resultStats.unplaced > 0 ? 'text-danger' : 'text-success'}`}>
                  {resultStats.unplaced}
                </span>
              </div>
              <div className="autosched-kpi-card">
                <span className="kpi-label">Rooms Used</span>
                <span className="kpi-value">{resultStats.uniqueRooms}</span>
              </div>
              <div className="autosched-kpi-card">
                <span className="kpi-label">Faculty Assigned</span>
                <span className="kpi-value">{resultStats.uniqueProfs}</span>
              </div>
            </div>
          )}

          {/* Search & Actions Toolbar */}
          <div className="autosched-results-actions">
            <div className="autosched-search-wrapper">
              <Search size={15} className="autosched-search-icon" />
              <input
                type="text"
                className="autosched-search-input"
                placeholder="Search by subject, section, faculty, or room..."
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
              />
              {resultFilter && (
                <button
                  type="button"
                  className="autosched-search-clear"
                  onClick={() => setResultFilter('')}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="autosched-action-buttons">
              <button
                type="button"
                className="autosched-action-btn"
                onClick={() => handleNavigateView('view-schedules')}
              >
                <Calendar size={15} />
                <span>View Timetable</span>
              </button>
              {result.unscheduled?.length > 0 && (
                <button
                  type="button"
                  className="autosched-action-btn"
                  onClick={handleCopyConflictReport}
                  title="Copy list of unscheduled classes"
                >
                  <Copy size={15} />
                  <span>Copy Conflict Report</span>
                </button>
              )}
            </div>
          </div>

          {/* Missing Assignments (Faculty or Lab) */}
          {dataIssues.length > 0 && (
            <div className="result-section data-issues-section">
              <div className="result-section-header">
                <AlertTriangle size={18} className="text-warning" />
                <h3>Missing Assignments ({dataIssues.length})</h3>
              </div>
              <p className="section-description">
                These classes cannot be scheduled because they need an assigned professor or a lab room.
              </p>
              <div className="card-list">
                {dataIssues.map((p, idx) => {
                  const isMissingProf = (p.reason || '').toLowerCase().includes('faculty') || (p.reason || '').toLowerCase().includes('eligible');
                  const isMissingRoom = (p.reason || '').toLowerCase().includes('lab') || (p.reason || '').toLowerCase().includes('room');

                  return (
                    <div key={idx} className="data-issue-card">
                      <div className="card-title">
                        {p.subject?.code || p.subject?.name} {p.section?.name ? `— ${p.section.name}` : ''}
                      </div>
                      <div className="card-reason">{p.reason}</div>
                      {isMissingProf && (
                        <button
                          type="button"
                          className="autosched-fix-btn"
                          onClick={() => handleNavigateView('assignments')}
                        >
                          <span>Assign Professor</span>
                          <ArrowRight size={13} />
                        </button>
                      )}
                      {isMissingRoom && (
                        <button
                          type="button"
                          className="autosched-fix-btn"
                          onClick={() => handleNavigateView('rooms')}
                        >
                          <span>Manage Rooms</span>
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time Slot & Room Conflicts */}
          {slotConflicts.length > 0 && (
            <div className="result-section prescriptions-section">
              <div className="result-section-header">
                <AlertCircle size={18} className="text-danger" />
                <h3>Time & Room Conflicts ({slotConflicts.length})</h3>
              </div>
              <p className="section-description">
                These classes could not find an open time slot, room, or professor without overlap.
              </p>
              <div className="card-list">
                {slotConflicts.map((s, idx) => {
                  const subjectCredits = s?.subject?.credits || 3;
                  const hoursPerMeeting = s?.subject?.hoursPerMeeting || 1.5;
                  const labLabel = s?.subject?.isFoodLab ? 'Food Lab' : s?.subject?.requiredLab ? 'Computer Lab' : null;

                  return (
                    <div key={idx} className="prescription-card">
                      <div className="prescription-card-header">
                        <div className="prescription-card-title">
                          <span>{s?.subject?.code || s?.subject?.name || 'Subject'}</span>
                          {s?.section?.name && (
                            <span className="prescription-card-section">&mdash; {s.section.name}</span>
                          )}
                        </div>
                        <div className="prescription-meta-badges">
                          <span className="meta-pill">{subjectCredits} Units</span>
                          <span className="meta-pill">{hoursPerMeeting}h / session</span>
                          {labLabel && <span className="meta-pill lab-pill">{labLabel}</span>}
                        </div>
                      </div>

                      <div className="prescription-reason-banner">
                        <AlertCircle size={16} className="text-danger" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <strong>Conflict: </strong>
                          <span>{s?.reason || 'No open time slot found'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty Search Filter State */}
          {resultFilter && !hasFilteredClasses && (
            <div className="autosched-empty-filter">
              <Search size={26} className="text-muted" />
              <p>No classes match &ldquo;<strong>{resultFilter}</strong>&rdquo;</p>
              <button
                type="button"
                className="autosched-clear-filter-btn"
                onClick={() => setResultFilter('')}
              >
                Clear search
              </button>
            </div>
          )}

          {/* Placed Schedule List Grouped by Day */}
          {result.schedule?.length > 0 && hasFilteredClasses && (
            <div className="result-section success-section">
              <div className="result-section-header">
                <CheckCircle2 size={18} className="text-success" />
                <h3>
                  Scheduled Classes ({result.schedule.length})
                  {resultFilter && (
                    <span className="autosched-filter-tag">Filtered</span>
                  )}
                </h3>
              </div>

              <div className="schedule-list">
                {DAYS.map(day => {
                  const dayClasses = filteredGroupedSchedule[day];
                  if (!dayClasses || dayClasses.length === 0) return null;

                  return (
                    <div key={day} className="day-group">
                      <div className="day-group-header">
                        <h4>{day}</h4>
                        <span className="day-count-badge">{dayClasses.length} class{dayClasses.length > 1 ? 'es' : ''}</span>
                      </div>
                      <div className="card-list">
                        {dayClasses.map((item, idx) => (
                          <div key={idx} className={`schedule-card ${item.prescriptionNote ? 'warning-border' : 'success-border'}`}>
                            <div className="schedule-card-header">
                              <span className="schedule-card-subject">
                                {item.subject.code} {item.section ? `(${item.section.name})` : ''}
                              </span>
                              <span className="schedule-card-time">
                                {getMeetingTimeLabel(item.timeSlot, item.hours || item.subject?.hoursPerMeeting) || item.timeSlot?.label}
                              </span>
                            </div>
                            <div className="schedule-card-body">
                              <span>{item.room?.name || 'Room TBA'}</span>
                              <span className="schedule-card-divider">&bull;</span>
                              <span>Prof. {item.professor?.name || 'TBA'}</span>
                            </div>
                            {item.prescriptionNote && (
                              <div className="schedule-card-warning">
                                <AlertCircle size={13} />
                                <span>{item.prescriptionNote}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default AutoScheduler;
