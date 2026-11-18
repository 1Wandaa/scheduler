// src/pages/management/TeachingLoadManagement.jsx
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { db } from '../../config/firebase';
import { doc, writeBatch, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { DEPARTMENTS, getDeptColor, PROGRAM_DEPARTMENTS } from '../../config/constants';
import QuickCreateModal from '../../components/QuickCreateModal/QuickCreateModal';
import HoursPerMeetingSelect from '../../components/HoursPerMeetingSelect/HoursPerMeetingSelect';
import AutocompleteMultiSelect from '../../components/AutocompleteMultiSelect/AutocompleteMultiSelect';
import { logActivity, LOG_ACTIONS } from '../../utils/activityLogger';
import { detectLabRequirement, suggestDepartmentFromCode } from '../../utils/subjectLabDetector';
import {
  Building2,
  BookOpen,
  Users,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Search,
  X,
  Plus,
  ArrowLeft,
  ArrowRightLeft,
  Check,
  FlaskConical,
  Monitor,
  Utensils,
  Clock,
  Layers,
  Sliders,
  CheckSquare,
  Square,
  UserCheck,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Settings2,
  Edit3
} from 'lucide-react';
import './TeachingLoadManagement.css';

/**
 * Normalizes program name or department code to standard department code.
 */
function resolveDeptCode(val) {
  if (!val) return null;
  const trimmed = String(val).trim();
  if (PROGRAM_DEPARTMENTS[trimmed]) return PROGRAM_DEPARTMENTS[trimmed];
  const upper = trimmed.toUpperCase();
  if (Object.values(PROGRAM_DEPARTMENTS).includes(upper)) return upper;
  if (DEPARTMENTS.includes(upper)) return upper;
  if (upper.includes('COMPUTER') || upper.includes('BSCS')) return 'BSCS';
  if (upper.includes('FOOD') || upper.includes('BSFT')) return 'BSFT';
  if (upper.includes('OFFICE') || upper.includes('BSOA')) return 'BSOA';
  if (upper.includes('ENGLISH') || upper.includes('BAEL')) return 'BAEL';
  return upper;
}

/**
 * Inline faculty selector for section subject rows.
 * Static options rendering eliminates hover events, DOM mutations, and animation glitches.
 * Optimistic local value binding ensures zero lag when selecting instructors.
 */
const InlineInstructorSelect = React.memo(({
  section,
  subRef,
  assignedProf,
  onAssign,
  getSubjectProfessors
}) => {
  const [optimisticProfId, setOptimisticProfId] = useState(assignedProf?.id || '');

  useEffect(() => {
    setOptimisticProfId(assignedProf?.id || '');
  }, [assignedProf?.id]);

  const { specProfs = [], otherProfs = [] } = getSubjectProfessors(subRef) || {};

  return (
    <select
      className={`hub-instructor-select ${optimisticProfId ? 'has-assigned' : 'is-unassigned'}`}
      value={optimisticProfId}
      onChange={(e) => {
        const val = e.target.value;
        setOptimisticProfId(val);
        onAssign(section, subRef, val);
      }}
    >
      <option value="">— Assign Faculty...</option>
      {specProfs.length > 0 && (
        <optgroup label="Specialized in this Subject">
          {specProfs.map(p => (
            <option key={p.id} value={p.id}>
              {p.name || `${p.lastName}, ${p.firstName}`} ({p.department})
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Other Faculty Members">
        {otherProfs.map(p => (
          <option key={p.id} value={p.id}>
            {p.name || `${p.lastName}, ${p.firstName}`} ({p.department})
          </option>
        ))}
      </optgroup>
    </select>
  );
});

/**
 * Direct selector for instructors inside the Section Configure modal.
 */
const ModalSubjectInstructorSelect = React.memo(({
  subRef,
  value,
  onChange,
  getSubjectProfessors
}) => {
  const { specProfs = [], otherProfs = [] } = getSubjectProfessors(subRef) || {};

  return (
    <select
      className={`hub-instructor-select ${value ? 'has-assigned' : 'is-unassigned'}`}
      value={value || ''}
      onChange={onChange}
      style={{ maxWidth: '280px' }}
    >
      <option value="">No Instructor Assigned</option>
      {specProfs.length > 0 && (
        <optgroup label="Specialized in this Subject">
          {specProfs.map(p => (
            <option key={p.id} value={p.id}>
              {p.name || `${p.lastName}, ${p.firstName}`} ({p.department})
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="All Faculty">
        {otherProfs.map(p => (
          <option key={p.id} value={p.id}>
            {p.name || `${p.lastName}, ${p.firstName}`} ({p.department})
          </option>
        ))}
      </optgroup>
    </select>
  );
});

const TeachingLoadManagement = ({
  sections = [],
  professors = [],
  subjects = [],
  departments = [],
  courses = [],
  rooms = [],
  activeSemester,
  user,
  onBack
}) => {
  const [viewMode, setViewMode] = useState('sections'); // 'sections' | 'faculty' | 'subjects'
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);
  const [onlyLecLab, setOnlyLecLab] = useState(false);
  const [quickCreateState, setQuickCreateState] = useState({ isOpen: false, type: 'subject' });

  // Local optimistic state for instant zero-latency UI responses
  const [localSections, setLocalSections] = useState(sections);
  const [localProfessors, setLocalProfessors] = useState(professors);

  useEffect(() => {
    setLocalSections(sections);
  }, [sections]);

  useEffect(() => {
    setLocalProfessors(professors);
  }, [professors]);

  // Modal state for editing an entity's in-depth configuration & connections
  const [editingEntity, setEditingEntity] = useState(null); // { type: 'section'|'faculty'|'subject', item: obj }
  const [stagedEntityForm, setStagedEntityForm] = useState({});
  const [modalError, setModalError] = useState(null);
  const [userLabModified, setUserLabModified] = useState(false);
  const [autoDetectedReason, setAutoDetectedReason] = useState(null);
  const [stagedAssignedSubjects, setStagedAssignedSubjects] = useState([]);
  const [stagedAssignedSections, setStagedAssignedSections] = useState([]);
  const [stagedFacultyMap, setStagedFacultyMap] = useState({}); // for section: subjectRef -> profId, for faculty: secId -> [subjectRefs]
  const [isSaving, setIsSaving] = useState(false);

  // Nested / Cross-Entity editor state (enables editing a Subject, Professor, or Section right inside any field)
  const [nestedEditing, setNestedEditing] = useState(null); // { type: 'subject'|'faculty'|'section', id: string, form: obj }
  const [isSavingNested, setIsSavingNested] = useState(false);

  const availableDepts = useMemo(() => {
    return departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS;
  }, [departments]);

  const availablePrograms = useMemo(() => {
    if (courses.length > 0) return courses.map(c => c.code || c.name);
    return availableDepts;
  }, [courses, availableDepts]);

  const normToken = useCallback((val) => String(val ?? '').trim().toLowerCase(), []);

  // --- High-Performance Pre-Indexed Lookups (O(1)) ---
  const subjectLookup = useMemo(() => {
    const mapById = new Map();
    const mapByCode = new Map();
    const mapByName = new Map();
    
    subjects.forEach(s => {
      if (s.id) mapById.set(String(s.id).trim().toLowerCase(), s);
      if (s.code && !mapByCode.has(String(s.code).trim().toLowerCase())) mapByCode.set(String(s.code).trim().toLowerCase(), s);
      if (s.name && !mapByName.has(String(s.name).trim().toLowerCase())) mapByName.set(String(s.name).trim().toLowerCase(), s);
    });
    
    return { mapById, mapByCode, mapByName };
  }, [subjects]);

  const getSubject = useCallback((subRef) => {
    if (!subRef) return null;
    if (typeof subRef === 'object' && subRef !== null) return subRef;
    
    const key = String(subRef).trim().toLowerCase();
    return subjectLookup.mapById.get(key) || 
           subjectLookup.mapByCode.get(key) || 
           subjectLookup.mapByName.get(key) || 
           null;
  }, [subjectLookup]);

  const profMap = useMemo(() => {
    const map = new Map();
    localProfessors.forEach(p => {
      map.set(String(p.id), p);
    });
    return map;
  }, [localProfessors]);

  // Pre-indexed sections map for instant O(1) lookups by id or name
  const sectionMap = useMemo(() => {
    const map = new Map();
    localSections.forEach(s => {
      if (s.id) map.set(String(s.id).trim().toLowerCase(), s);
      if (s.name) map.set(String(s.name).trim().toLowerCase(), s);
    });
    return map;
  }, [localSections]);

  const getSubjectMatchTokens = useCallback((item, { includeName = false } = {}) => {
    const tokens = new Set();
    const rawId = typeof item === 'object' && item !== null ? item.id : item;
    const resolved = getSubject(item) || (typeof item === 'object' && item !== null ? item : null);
    [rawId, resolved?.id, resolved?.code].forEach(v => {
      const t = normToken(v);
      if (t) tokens.add(t);
    });
    if (includeName && resolved?.name) {
      const t = normToken(resolved.name);
      if (t) tokens.add(t);
    }
    return tokens;
  }, [getSubject, normToken]);

  const getSectionMatchTokens = useCallback((item) => {
    const tokens = new Set();
    const raw = typeof item === 'object' && item !== null ? (item.id ?? item.name) : item;
    const rawTok = normToken(raw);
    if (rawTok) tokens.add(rawTok);
    const matched = typeof item === 'object' && item !== null
      ? item
      : sectionMap.get(rawTok);
    if (matched) {
      if (matched.id !== undefined && matched.id !== null) tokens.add(normToken(matched.id));
      if (matched.name) tokens.add(normToken(matched.name));
    }
    return tokens;
  }, [sectionMap, normToken]);

  const getRoomMatchTokens = useCallback((item) => {
    const tokens = new Set();
    const raw = typeof item === 'object' && item !== null ? (item.id ?? item.name) : item;
    const rawTok = normToken(raw);
    if (rawTok) tokens.add(rawTok);
    const matched = typeof item === 'object' && item !== null
      ? item
      : rooms.find(r => normToken(r.id) === rawTok || (r.name && normToken(r.name) === rawTok));
    if (matched) {
      if (matched.id !== undefined && matched.id !== null) tokens.add(normToken(matched.id));
      if (matched.name) tokens.add(normToken(matched.name));
    }
    return tokens;
  }, [rooms, normToken]);

  const getFacultyMatchTokens = useCallback((item) => {
    const tokens = new Set();
    const raw = typeof item === 'object' && item !== null ? (item.id ?? item.name) : item;
    const rawTok = normToken(raw);
    if (rawTok) tokens.add(rawTok);
    const matched = typeof item === 'object' && item !== null
      ? item
      : localProfessors.find(p => normToken(p.id) === rawTok || (p.name && normToken(p.name) === rawTok));
    if (matched) {
      if (matched.id !== undefined && matched.id !== null) tokens.add(normToken(matched.id));
      if (matched.name) tokens.add(normToken(matched.name));
    }
    return tokens;
  }, [localProfessors, normToken]);

  const toggleMultiList = useCallback((prev, item, getTokensFn, getCanonicalIdFn) => {
    const list = prev || [];
    const tokens = getTokensFn(item);
    if (list.some(x => tokens.has(normToken(x)))) {
      return list.filter(x => !tokens.has(normToken(x)));
    }
    const id = getCanonicalIdFn(item);
    return id ? [...list, id] : list;
  }, [normToken]);

  const batchSelectMultiList = useCallback((prev, items, getTokensFn, getCanonicalIdFn) => {
    const list = [...(prev || [])];
    const existingTokens = new Set(list.map(normToken));
    items.forEach(item => {
      const tokens = getTokensFn(item);
      if (!Array.from(tokens).some(t => existingTokens.has(t))) {
        const id = getCanonicalIdFn(item);
        if (id) {
          list.push(id);
          tokens.forEach(t => existingTokens.add(t));
        }
      }
    });
    return list;
  }, [normToken]);

  const batchDeselectMultiList = useCallback((prev, items, getTokensFn) => {
    const tokensToRemove = new Set();
    items.forEach(item => {
      getTokensFn(item).forEach(t => tokensToRemove.add(t));
    });
    return (prev || []).filter(x => !tokensToRemove.has(normToken(x)));
  }, [normToken]);

  const pruneSectionInstructorKeys = useCallback((prevMap, itemsToRemove) => {
    const tokensToDelete = new Set();
    itemsToRemove.forEach(item => {
      getSubjectMatchTokens(item).forEach(t => tokensToDelete.add(t));
    });
    const next = { ...(prevMap || {}) };
    Object.keys(next).forEach(k => {
      if (tokensToDelete.has(normToken(k))) {
        delete next[k];
      }
    });
    return next;
  }, [getSubjectMatchTokens, normToken]);

  const pruneFacultyMapSections = useCallback((prevMap, sectionsToRemove) => {
    const tokensToDelete = new Set();
    sectionsToRemove.forEach(secItem => {
      getSectionMatchTokens(secItem).forEach(t => tokensToDelete.add(t));
    });
    const next = { ...(prevMap || {}) };
    Object.keys(next).forEach(k => {
      if (tokensToDelete.has(normToken(k))) {
        delete next[k];
      }
    });
    return next;
  }, [getSectionMatchTokens, normToken]);

  const pruneFacultyMapSubjects = useCallback((prevMap, subjectsToRemove) => {
    const tokensToDelete = new Set();
    subjectsToRemove.forEach(subItem => {
      getSubjectMatchTokens(subItem).forEach(t => tokensToDelete.add(t));
    });
    const next = {};
    Object.entries(prevMap || {}).forEach(([secId, subList]) => {
      next[secId] = Array.isArray(subList)
        ? subList.filter(s => !tokensToDelete.has(normToken(s)))
        : subList;
    });
    return next;
  }, [getSubjectMatchTokens, normToken]);

  const profsBySectionMap = useMemo(() => {
    const map = new Map();
    localProfessors.forEach(p => {
      (p.assignedSections || []).forEach(secRef => {
        if (!secRef) return;
        const key = String(secRef).toLowerCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(p);
      });
    });
    return map;
  }, [localProfessors]);

  const getSectionProfs = useCallback((sec) => {
    if (!sec) return [];
    const key1 = sec.id ? String(sec.id).toLowerCase() : null;
    const key2 = sec.name ? String(sec.name).toLowerCase() : null;
    const list1 = key1 ? profsBySectionMap.get(key1) || [] : [];
    const list2 = key2 ? profsBySectionMap.get(key2) || [] : [];
    if (list2.length === 0) return list1;
    if (list1.length === 0) return list2;
    const seen = new Set();
    const combined = [];
    for (let i = 0; i < list1.length; i++) {
      seen.add(list1[i].id);
      combined.push(list1[i]);
    }
    for (let i = 0; i < list2.length; i++) {
      if (!seen.has(list2[i].id)) {
        seen.add(list2[i].id);
        combined.push(list2[i]);
      }
    }
    return combined;
  }, [profsBySectionMap]);

  const profsBySubjectKey = useMemo(() => {
    const map = new Map();
    localProfessors.forEach(p => {
      (p.specialization || []).forEach(specRef => {
        if (!specRef) return;
        const key = String(specRef).toLowerCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(p);
      });
    });
    return map;
  }, [localProfessors]);

  // On-demand lazy cache for specialized & other faculty per subject (computed only when needed)
  const subjectProfOptionsCache = useRef(new Map());
  useEffect(() => {
    subjectProfOptionsCache.current.clear();
  }, [subjects, localProfessors, profsBySubjectKey]);

  const getSubjectProfessors = useCallback((subRef) => {
    if (!subRef) return { specProfs: [], otherProfs: localProfessors };
    const cacheKey = String(subRef).toLowerCase();
    if (subjectProfOptionsCache.current.has(cacheKey)) {
      return subjectProfOptionsCache.current.get(cacheKey);
    }

    const sub = getSubject(subRef) || { id: subRef, code: subRef };
    const keys = [sub.id, sub.code, sub.name, subRef].filter(Boolean);
    const specProfs = [];
    const seen = new Set();
    keys.forEach(k => {
      (profsBySubjectKey.get(String(k).toLowerCase()) || []).forEach(p => {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          specProfs.push(p);
        }
      });
    });
    specProfs.sort((a, b) => {
      const nameA = a.name || `${a.lastName || ''}, ${a.firstName || ''}`;
      const nameB = b.name || `${b.lastName || ''}, ${b.firstName || ''}`;
      return nameA.localeCompare(nameB);
    });
    const otherProfs = localProfessors.filter(p => !seen.has(p.id)).sort((a, b) => {
      const nameA = a.name || `${a.lastName || ''}, ${a.firstName || ''}`;
      const nameB = b.name || `${b.lastName || ''}, ${b.firstName || ''}`;
      return nameA.localeCompare(nameB);
    });
    const result = { specProfs, otherProfs };
    keys.forEach(k => subjectProfOptionsCache.current.set(String(k).toLowerCase(), result));
    subjectProfOptionsCache.current.set(cacheKey, result);
    return result;
  }, [getSubject, profsBySubjectKey, localProfessors]);

  // Pre-indexed set of enrolled and specialized subject keys for instant O(1) attention filtering
  const enrolledSubjectCodesSet = useMemo(() => {
    const set = new Set();
    localSections.forEach(sec => {
      (sec.subjects || []).forEach(s => {
        if (s) set.add(String(s).toLowerCase());
      });
    });
    return set;
  }, [localSections]);

  const specializedSubjectCodesSet = useMemo(() => {
    const set = new Set();
    localProfessors.forEach(p => {
      (p.specialization || []).forEach(s => {
        if (s) set.add(String(s).toLowerCase());
      });
    });
    return set;
  }, [localProfessors]);

  // Pre-indexed mapping of subject -> sections for viewMode === 'subjects'
  const sectionsBySubjectKey = useMemo(() => {
    const map = new Map();
    localSections.forEach(sec => {
      (sec.subjects || []).forEach(subRef => {
        if (!subRef) return;
        const key = String(subRef).toLowerCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(sec);
      });
    });
    return map;
  }, [localSections]);

  const getSectionsForSubject = useCallback((sub) => {
    if (!sub) return [];
    const keys = [sub.id, sub.code, sub.name].filter(Boolean);
    const seen = new Set();
    const result = [];
    keys.forEach(k => {
      (sectionsBySubjectKey.get(String(k).toLowerCase()) || []).forEach(sec => {
        if (!seen.has(sec.id)) {
          seen.add(sec.id);
          result.push(sec);
        }
      });
    });
    return result;
  }, [sectionsBySubjectKey]);

  // Fast memoized cache for assigned professors: `${sec.id}_${subRef}` -> prof
  const assignedProfCache = useRef(new Map());
  useEffect(() => {
    assignedProfCache.current.clear();
  }, [localSections, localProfessors, subjects]);

  // Helper to accurately resolve assigned professor for a specific section and subject in O(1)
  const getAssignedProf = useCallback((sec, subRef) => {
    if (!sec || !subRef) return null;
    const secKey = String(sec.id || sec.name || '').toLowerCase();
    const subKey = String(subRef).toLowerCase();
    const cacheKey = `${secKey}:::${subKey}`;

    if (assignedProfCache.current.has(cacheKey)) {
      return assignedProfCache.current.get(cacheKey);
    }

    const subObj = getSubject(subRef) || { id: subRef, code: subRef };
    const subKeyFound = subObj.id || subObj.code;
    const subId = subObj.id;
    const subCode = subObj.code;
    const subName = subObj.name;

    let result = null;

    const subMatchTokens = new Set(
      [subKeyFound, subId, subRef, subCode, subName].map(normToken).filter(Boolean)
    );

    // 1. Direct match on section.subjectInstructors (most authoritative)
    if (sec.subjectInstructors) {
      let pId = sec.subjectInstructors[subKeyFound] ||
                sec.subjectInstructors[subId] ||
                sec.subjectInstructors[subRef] ||
                (subCode && sec.subjectInstructors[subCode]) ||
                (subName && sec.subjectInstructors[subName]);
      if (!pId) {
        for (const [k, v] of Object.entries(sec.subjectInstructors)) {
          if (v && subMatchTokens.has(normToken(k))) {
            pId = v;
            break;
          }
        }
      }
      if (pId) {
        const found = profMap.get(String(pId));
        if (found) result = found;
      }
    }

    // 2. Direct match on professor's sectionSubjectMap
    if (!result) {
      const sectionProfs = getSectionProfs(sec);
      const profByMap = sectionProfs.find(p => {
        const mappedSubs = (p.sectionSubjectMap && (p.sectionSubjectMap[sec.id] || (sec.name && p.sectionSubjectMap[sec.name]))) || [];
        return mappedSubs.some(s => subMatchTokens.has(normToken(s)));
      });
      if (profByMap) result = profByMap;
    }

    // 3. Fallback: only if exactly 1 professor assigned to this section specializes in this subject
    //    AND does not already have an explicit per-subject map configured for this section
    if (!result) {
      const sectionProfs = getSectionProfs(sec);
      const candidateProfs = sectionProfs.filter(p => {
        const hasExplicitMap = p.sectionSubjectMap && (
          Object.prototype.hasOwnProperty.call(p.sectionSubjectMap, sec.id) ||
          (sec.name && Object.prototype.hasOwnProperty.call(p.sectionSubjectMap, sec.name))
        );
        if (hasExplicitMap) return false;
        return (p.specialization || []).some(sp => subMatchTokens.has(normToken(sp)));
      });

      if (candidateProfs.length === 1) {
        result = candidateProfs[0];
      }
    }

    assignedProfCache.current.set(cacheKey, result);
    if (subKeyFound && String(subKeyFound).toLowerCase() !== subKey) {
      assignedProfCache.current.set(`${secKey}:::${String(subKeyFound).toLowerCase()}`, result);
    }
    if (subId && String(subId).toLowerCase() !== subKey) {
      assignedProfCache.current.set(`${secKey}:::${String(subId).toLowerCase()}`, result);
    }
    if (subCode && String(subCode).toLowerCase() !== subKey) {
      assignedProfCache.current.set(`${secKey}:::${String(subCode).toLowerCase()}`, result);
    }

    return result;
  }, [getSubject, profMap, getSectionProfs, assignedProfCache, normToken]);

  // --- KPI Stats Calculation ---
  const stats = useMemo(() => {
    let totalEnrolledLinks = 0;
    let totalAssignedLinks = 0;
    let sectionsNeedingTeachers = 0;

    localSections.forEach(sec => {
      const enrolled = sec.subjects || [];
      totalEnrolledLinks += enrolled.length;
      let hasMissing = false;

      enrolled.forEach(subRef => {
        const assignedProf = getAssignedProf(sec, subRef);
        if (assignedProf) {
          totalAssignedLinks++;
        } else {
          hasMissing = true;
        }
      });

      if (hasMissing || enrolled.length === 0) {
        sectionsNeedingTeachers++;
      }
    });

    const totalLecLabSubjects = subjects.filter(s => s.hasLecLab).length;
    let totalLecLabEnrolled = 0;
    localSections.forEach(sec => {
      (sec.subjects || []).forEach(subRef => {
        const sub = getSubject(subRef);
        if (sub?.hasLecLab) totalLecLabEnrolled++;
      });
    });

    return {
      totalSections: localSections.length,
      totalProfessors: localProfessors.length,
      totalSubjects: subjects.length,
      totalLecLabSubjects,
      totalLecLabEnrolled,
      totalEnrolledLinks,
      totalAssignedLinks,
      sectionsNeedingTeachers
    };
  }, [localSections, localProfessors, subjects, getAssignedProf, getSubject]);

  // --- Inline Instructor Change for a Section Subject (Optimistic Instant Response) ---
  const handleAssignInstructorInline = async (section, subRef, newProfId) => {
    const sub = getSubject(subRef) || { id: subRef, code: subRef };
    const subCode = sub.code || sub.id;
    const subId = sub.id || subRef;
    const keys = [subCode, subId, subRef].filter(Boolean);

    const prevSections = localSections;
    const prevProfessors = localProfessors;

    const nextSubjectInstructors = { ...(section.subjectInstructors || {}) };
    if (newProfId) {
      keys.forEach(k => { nextSubjectInstructors[k] = newProfId; });
    } else {
      keys.forEach(k => { delete nextSubjectInstructors[k]; });
    }

    const updatedSection = {
      ...section,
      subjectInstructors: nextSubjectInstructors
    };

    const oldProf = getAssignedProf(section, subRef);

    // Apply immediate optimistic state update (0ms delay)
    setLocalSections(prev => prev.map(s => String(s.id) === String(section.id) ? updatedSection : s));

    setLocalProfessors(prev => prev.map(p => {
      if (oldProf && String(p.id) === String(oldProf.id) && String(oldProf.id) !== String(newProfId)) {
        const oldMap = { ...(p.sectionSubjectMap || {}) };
        const oldSecSubs = (oldMap[section.id] || []).filter(s => !keys.includes(String(s)));
        let updatedSecs = p.assignedSections || [];
        if (oldSecSubs.length === 0) {
          delete oldMap[section.id];
          updatedSecs = updatedSecs.filter(s => String(s) !== String(section.id) && String(s) !== String(section.name));
        } else {
          oldMap[section.id] = oldSecSubs;
        }
        return { ...p, assignedSections: updatedSecs, sectionSubjectMap: oldMap };
      }
      if (newProfId && String(p.id) === String(newProfId)) {
        const curSecs = p.assignedSections || [];
        const updatedSecs = curSecs.some(s => String(s) === String(section.id) || (section.name && String(s) === String(section.name)))
          ? curSecs
          : [...curSecs, section.id];
        const curSpecs = p.specialization || [];
        const updatedSpecs = curSpecs.some(sp => keys.includes(String(sp)))
          ? curSpecs
          : [...curSpecs, subCode];
        const curMap = { ...(p.sectionSubjectMap || {}) };
        const curSecSubs = curMap[section.id] || [];
        const updatedSubs = curSecSubs.includes(subCode) ? curSecSubs : [...curSecSubs, subCode];
        curMap[section.id] = updatedSubs;
        return { ...p, assignedSections: updatedSecs, specialization: updatedSpecs, sectionSubjectMap: curMap };
      }
      return p;
    }));

    assignedProfCache.current.clear();

    const profObj = localProfessors.find(p => String(p.id) === String(newProfId));
    toast.success(profObj ? `Assigned ${profObj.name || `${profObj.lastName}, ${profObj.firstName}`} to ${subCode}!` : `Instructor cleared for ${subCode}`);

    // Commit to Firestore in background
    try {
      const batch = writeBatch(db);

      batch.update(doc(db, 'sections', String(section.id)), {
        subjectInstructors: nextSubjectInstructors
      });

      if (oldProf && String(oldProf.id) !== String(newProfId)) {
        const oldMap = { ...(oldProf.sectionSubjectMap || {}) };
        const oldSecSubs = (oldMap[section.id] || []).filter(s => !keys.includes(String(s)));
        oldMap[section.id] = oldSecSubs;

        let updatedSecs = oldProf.assignedSections || [];
        if (oldSecSubs.length === 0) {
          delete oldMap[section.id];
          updatedSecs = updatedSecs.filter(s => String(s) !== String(section.id) && String(s) !== String(section.name));
        }

        batch.update(doc(db, 'professors', String(oldProf.id)), {
          assignedSections: updatedSecs,
          sectionSubjectMap: oldMap
        });
      }

      if (newProfId) {
        const targetProf = localProfessors.find(p => String(p.id) === String(newProfId));
        if (targetProf) {
          const curSecs = targetProf.assignedSections || [];
          const updatedSecs = curSecs.some(s => String(s) === String(section.id) || (section.name && String(s) === String(section.name)))
            ? curSecs
            : [...curSecs, section.id];

          const curSpecs = targetProf.specialization || [];
          const updatedSpecs = curSpecs.some(sp => keys.includes(String(sp)))
            ? curSpecs
            : [...curSpecs, subCode];

          const curMap = { ...(targetProf.sectionSubjectMap || {}) };
          const curSecSubs = curMap[section.id] || [];
          if (!curSecSubs.includes(subCode) && !curSecSubs.includes(sub.id)) {
            curMap[section.id] = [...curSecSubs, subCode];
          }

          batch.update(doc(db, 'professors', String(targetProf.id)), {
            assignedSections: updatedSecs,
            specialization: updatedSpecs,
            sectionSubjectMap: curMap
          });
        }
      }

      await batch.commit();

      logActivity({
        user,
        action: LOG_ACTIONS.UPDATE_SECTION,
        details: profObj
          ? `Assigned ${profObj.name || `${profObj.lastName}, ${profObj.firstName}`} to teach ${subCode} for section ${section.name}`
          : `Removed assigned instructor for ${subCode} in section ${section.name}`
      });
    } catch (err) {
      console.error("Error updating instructor inline:", err);
      setLocalSections(prevSections);
      setLocalProfessors(prevProfessors);
      assignedProfCache.current.clear();
      toast.error("Failed to update assignment on server.");
    }
  };

  // Inline removal of an enrolled or orphan subject from a section (Optimistic)
  const handleRemoveSubjectFromSectionInline = async (section, subRef) => {
    const sub = getSubject(subRef) || { id: subRef, code: subRef };
    const tokens = getSubjectMatchTokens(subRef, { includeName: true });
    const secToks = getSectionMatchTokens(section);

    const prevSections = localSections;
    const prevProfessors = localProfessors;

    const nextSubjects = (section.subjects || []).filter(s => !tokens.has(normToken(s)));
    const nextSubjectInstructors = { ...(section.subjectInstructors || {}) };
    Object.keys(nextSubjectInstructors).forEach(k => {
      if (tokens.has(normToken(k))) delete nextSubjectInstructors[k];
    });

    const profPatches = new Map();
    localProfessors.forEach(prof => {
      const curMap = { ...(prof.sectionSubjectMap || {}) };
      const matchingMapKeys = Object.keys(curMap).filter(k => secToks.has(normToken(k)));
      let changed = false;
      let remainingCount = 0;

      matchingMapKeys.forEach(mapKey => {
        const list = Array.isArray(curMap[mapKey]) ? curMap[mapKey] : [];
        if (list.some(s => tokens.has(normToken(s)))) {
          const nextList = list.filter(s => !tokens.has(normToken(s)));
          changed = true;
          if (nextList.length === 0) {
            delete curMap[mapKey];
          } else {
            curMap[mapKey] = nextList;
            remainingCount += nextList.length;
          }
        } else {
          remainingCount += list.length;
        }
      });

      if (changed) {
        let nextSecs = prof.assignedSections || [];
        if (remainingCount === 0) {
          nextSecs = nextSecs.filter(s => !secToks.has(normToken(s)));
        }
        profPatches.set(String(prof.id), {
          sectionSubjectMap: curMap,
          assignedSections: nextSecs
        });
      }
    });

    // Optimistic local update
    setLocalSections(prev => prev.map(s => String(s.id) === String(section.id) ? {
      ...s,
      subjects: nextSubjects,
      subjectInstructors: nextSubjectInstructors
    } : s));

    if (profPatches.size > 0) {
      setLocalProfessors(prev => prev.map(p => profPatches.has(String(p.id)) ? { ...p, ...profPatches.get(String(p.id)) } : p));
    }

    assignedProfCache.current.clear();
    toast.success(`Removed ${sub.code || subRef} from section ${section.name}!`);

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'sections', String(section.id)), {
        subjects: nextSubjects,
        subjectInstructors: nextSubjectInstructors
      });
      profPatches.forEach((patch, pId) => {
        batch.update(doc(db, 'professors', pId), patch);
      });

      await batch.commit();
    } catch (err) {
      console.error("Error removing subject from section inline:", err);
      setLocalSections(prevSections);
      setLocalProfessors(prevProfessors);
      assignedProfCache.current.clear();
      toast.error("Failed to remove subject on server.");
    }
  };

  // Auto-Match Teachers for a Section (Optimistic)
  const handleAutoMatchSectionTeachers = async (sec) => {
    const enrolled = sec.subjects || [];
    let matchCount = 0;
    const updatedSubjectInstructors = { ...(sec.subjectInstructors || {}) };
    const profUpdates = {}; // profId -> { assignedSections, sectionSubjectMap }

    enrolled.forEach(subRef => {
      const sub = getSubject(subRef) || { id: subRef, code: subRef };
      const subCode = sub.code || sub.id;
      const subId = sub.id || subRef;
      const alreadyAssigned = getAssignedProf(sec, subRef);

      if (!alreadyAssigned && sub) {
        const candidates = localProfessors.filter(p => (p.specialization || []).some(sp => 
          String(sp) === String(sub.id) || String(sp) === String(sub.code) || String(sp) === String(sub.name)
        ));
        if (candidates.length > 0) {
          const best = [...candidates].sort((a, b) => {
            const countA = (profUpdates[a.id]?.assignedSections || a.assignedSections || []).length;
            const countB = (profUpdates[b.id]?.assignedSections || b.assignedSections || []).length;
            return countA - countB;
          })[0];

          updatedSubjectInstructors[subCode] = best.id;
          updatedSubjectInstructors[subId] = best.id;
          updatedSubjectInstructors[subRef] = best.id;

          if (!profUpdates[best.id]) {
            profUpdates[best.id] = {
              assignedSections: [...(best.assignedSections || [])],
              sectionSubjectMap: { ...(best.sectionSubjectMap || {}) }
            };
          }

          if (!profUpdates[best.id].assignedSections.includes(sec.id)) {
            profUpdates[best.id].assignedSections.push(sec.id);
          }

          const existingSubs = profUpdates[best.id].sectionSubjectMap[sec.id] || [];
          if (!existingSubs.includes(subCode)) {
            profUpdates[best.id].sectionSubjectMap[sec.id] = [...existingSubs, subCode];
          }

          matchCount++;
        }
      }
    });

    if (matchCount > 0) {
      const prevSections = localSections;
      const prevProfessors = localProfessors;

      // Optimistic update
      setLocalSections(prev => prev.map(s => String(s.id) === String(sec.id) ? {
        ...s,
        subjectInstructors: updatedSubjectInstructors
      } : s));

      setLocalProfessors(prev => prev.map(p => {
        if (profUpdates[p.id]) {
          return {
            ...p,
            assignedSections: profUpdates[p.id].assignedSections,
            sectionSubjectMap: profUpdates[p.id].sectionSubjectMap
          };
        }
        return p;
      }));

      assignedProfCache.current.clear();
      toast.success(`Automatically matched teachers for ${matchCount} subject(s) in ${sec.name}!`);

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'sections', String(sec.id)), {
          subjectInstructors: updatedSubjectInstructors
        });

        Object.entries(profUpdates).forEach(([pId, data]) => {
          batch.update(doc(db, 'professors', String(pId)), data);
        });

        await batch.commit();
      } catch (err) {
        console.error("Error committing auto-match:", err);
        setLocalSections(prevSections);
        setLocalProfessors(prevProfessors);
        assignedProfCache.current.clear();
        toast.error("Failed to save auto-matched assignments to server.");
      }
    } else {
      toast.info(`All subjects in ${sec.name} already have instructors or no specialized faculty were found.`);
    }
  };

  // Auto-Match Teachers across ALL sections (Optimistic)
  const handleAutoMatchAllSections = async () => {
    let totalMatches = 0;
    const secUpdates = {}; // secId -> updatedSubjectInstructors
    const profUpdates = {}; // profId -> { assignedSections, sectionSubjectMap }

    localSections.forEach(sec => {
      const enrolled = sec.subjects || [];
      const updatedMap = { ...(secUpdates[sec.id] || sec.subjectInstructors || {}) };

      enrolled.forEach(subRef => {
        const sub = getSubject(subRef) || { id: subRef, code: subRef };
        const subCode = sub.code || sub.id;
        const subId = sub.id || subRef;
        const alreadyAssigned = getAssignedProf(sec, subRef);

        if (!alreadyAssigned && sub) {
          const candidates = localProfessors.filter(p => (p.specialization || []).some(sp => 
            String(sp) === String(sub.id) || String(sp) === String(sub.code) || String(sp) === String(sub.name)
          ));
          if (candidates.length > 0) {
            const best = [...candidates].sort((a, b) => {
              const countA = (profUpdates[a.id]?.assignedSections || a.assignedSections || []).length;
              const countB = (profUpdates[b.id]?.assignedSections || b.assignedSections || []).length;
              return countA - countB;
            })[0];

            updatedMap[subCode] = best.id;
            updatedMap[subId] = best.id;
            updatedMap[subRef] = best.id;
            secUpdates[sec.id] = updatedMap;

            if (!profUpdates[best.id]) {
              profUpdates[best.id] = {
                assignedSections: [...(best.assignedSections || [])],
                sectionSubjectMap: { ...(best.sectionSubjectMap || {}) }
              };
            }

            if (!profUpdates[best.id].assignedSections.includes(sec.id)) {
              profUpdates[best.id].assignedSections.push(sec.id);
            }

            const existingSubs = profUpdates[best.id].sectionSubjectMap[sec.id] || [];
            if (!existingSubs.includes(subCode)) {
              profUpdates[best.id].sectionSubjectMap[sec.id] = [...existingSubs, subCode];
            }

            totalMatches++;
          }
        }
      });
    });

    if (totalMatches > 0) {
      const prevSections = localSections;
      const prevProfessors = localProfessors;

      setLocalSections(prev => prev.map(s => secUpdates[s.id] ? { ...s, subjectInstructors: secUpdates[s.id] } : s));
      setLocalProfessors(prev => prev.map(p => profUpdates[p.id] ? {
        ...p,
        assignedSections: profUpdates[p.id].assignedSections,
        sectionSubjectMap: profUpdates[p.id].sectionSubjectMap
      } : p));

      assignedProfCache.current.clear();
      toast.success(`Auto-matched ${totalMatches} teacher assignment(s) across all sections!`);

      try {
        const batch = writeBatch(db);
        Object.entries(secUpdates).forEach(([sId, subjInstMap]) => {
          batch.update(doc(db, 'sections', String(sId)), { subjectInstructors: subjInstMap });
        });

        Object.entries(profUpdates).forEach(([pId, data]) => {
          batch.update(doc(db, 'professors', String(pId)), data);
        });

        await batch.commit();
      } catch (err) {
        console.error("Error committing batch auto-match:", err);
        setLocalSections(prevSections);
        setLocalProfessors(prevProfessors);
        assignedProfCache.current.clear();
        toast.error("Failed to save assignments on server.");
      }
    } else {
      toast.info("All sections are already fully assigned or no matching specialized faculty were found.");
    }
  };

  // Auto-fill in the Configure modal
  const handleAutoAssignStagedTeachers = () => {
    const nextMap = { ...stagedFacultyMap };
    let count = 0;
    stagedAssignedSubjects.forEach(subRef => {
      const sub = getSubject(subRef) || { id: subRef, code: subRef };
      const key = sub.id || sub.code || subRef;
      if (!nextMap[key] && !nextMap[subRef]) {
        const candidates = localProfessors.filter(p => (p.specialization || []).some(sp => 
          String(sp) === String(sub.id) || String(sp) === String(sub.code) || String(sp) === String(sub.name)
        ));
        if (candidates.length > 0) {
          const best = [...candidates].sort((a, b) => (a.assignedSections || []).length - (b.assignedSections || []).length)[0];
          nextMap[key] = best.id;
          nextMap[subRef] = best.id;
          if (sub.id) nextMap[sub.id] = best.id;
          if (sub.code) nextMap[sub.code] = best.id;
          count++;
        }
      }
    });
    setStagedFacultyMap(nextMap);
    if (count > 0) {
      toast.success(`Automatically filled ${count} instructor(s)!`);
    } else {
      toast.info("All subjects already have instructors or no specialized faculty were found.");
    }
  };

  const handleSubjectCodeChange = (newCode) => {
    const suggestedDept = suggestDepartmentFromCode(newCode);
    setStagedEntityForm(prev => {
      let nextDepts = [...(prev.departments || [])];
      if (suggestedDept && !nextDepts.includes(suggestedDept)) {
        nextDepts.push(suggestedDept);
      }
      const nextForm = {
        ...prev,
        code: newCode,
        departments: nextDepts
      };
      if (!userLabModified) {
        const detection = detectLabRequirement(nextForm, subjects);
        setAutoDetectedReason(detection.reason);
        return {
          ...nextForm,
          requiredLab: detection.requiredLab,
          isFoodLab: detection.isFoodLab
        };
      }
      return nextForm;
    });
  };

  const handleSubjectDepartmentToggle = (dept) => {
    setStagedEntityForm(prev => {
      const cur = prev.departments || [];
      const updated = cur.includes(dept) ? cur.filter(d => d !== dept) : [...cur, dept];
      const nextForm = { ...prev, departments: updated };
      if (!userLabModified) {
        const detection = detectLabRequirement(nextForm, subjects);
        setAutoDetectedReason(detection.reason);
        return {
          ...nextForm,
          requiredLab: detection.requiredLab,
          isFoodLab: detection.isFoodLab
        };
      }
      return nextForm;
    });
  };

  // --- Open Edit Modal for an Entity ---
  const handleOpenEditModal = (type, item) => {
    setEditingEntity({ type, item });
    setModalError(null);
    setNestedEditing(null);

    if (type === 'section') {
      const subInstructorMap = { ...(item.subjectInstructors || {}) };
      (item.subjects || []).forEach(subRef => {
        const sub = getSubject(subRef) || { id: subRef, code: subRef };
        const subCode = sub.id || sub.code;
        if (!subInstructorMap[subCode] && !subInstructorMap[subRef]) {
          const assignedProf = getAssignedProf(item, subRef);
          if (assignedProf) {
            subInstructorMap[subCode] = assignedProf.id;
            subInstructorMap[subRef] = assignedProf.id;
          }
        }
      });

      const uniqueSubs = [];
      const seenSubs = new Set();
      (item.subjects || []).forEach(ref => {
        const subObj = getSubject(ref);
        const key = subObj ? String(subObj.id) : String(ref);
        const tok = normToken(key);
        if (tok && !seenSubs.has(tok)) {
          seenSubs.add(tok);
          uniqueSubs.push(key);
        }
      });

      setStagedEntityForm({
        id: item.id || '',
        name: item.name || '',
        program: item.program || availablePrograms[0] || 'BSCS',
        yearLevel: Number(item.yearLevel) || 1
      });
      setStagedAssignedSubjects(uniqueSubs);
      setStagedFacultyMap(subInstructorMap);

    } else if (type === 'faculty') {
      const resolveSec = (ref) => sectionMap.get(normToken(ref));

      const rawSecSubjectMap = { ...(item.sectionSubjectMap || {}) };
      const secSubjectMap = {};
      Object.entries(rawSecSubjectMap).forEach(([secRef, subList]) => {
        const secObj = resolveSec(secRef);
        const canonicalSecId = secObj ? String(secObj.id) : String(secRef);
        const existing = secSubjectMap[canonicalSecId] || [];
        const seen = new Set(existing.map(normToken));
        const normalizedSubs = [...existing];
        (Array.isArray(subList) ? subList : []).forEach(ref => {
          const subObj = getSubject(ref);
          const key = subObj ? String(subObj.id) : String(ref);
          const tok = normToken(key);
          if (tok && !seen.has(tok)) {
            seen.add(tok);
            normalizedSubs.push(key);
          }
        });
        secSubjectMap[canonicalSecId] = normalizedSubs;
      });

      const uniqueSecs = [];
      const seenSecs = new Set();
      const addUniqueSec = (secRef) => {
        const secObj = resolveSec(secRef);
        const key = secObj ? String(secObj.id) : String(secRef);
        const tok = normToken(key);
        if (tok && !seenSecs.has(tok)) {
          seenSecs.add(tok);
          uniqueSecs.push(key);
        }
      };

      (item.assignedSections || []).forEach(addUniqueSec);
      localSections.forEach(sec => {
        if (sec.subjectInstructors && Object.values(sec.subjectInstructors).some(pId => String(pId) === String(item.id))) {
          addUniqueSec(sec.id);
        }
      });

      uniqueSecs.forEach(secId => {
        const sec = resolveSec(secId);
        if (!sec) return;
        const hasExplicitEntry = Object.prototype.hasOwnProperty.call(secSubjectMap, sec.id);
        if (!hasExplicitEntry) {
          const matching = (sec.subjects || [])
            .filter(subRef => {
              const assigned = getAssignedProf(sec, subRef);
              return assigned && String(assigned.id) === String(item.id);
            })
            .map(subRef => {
              const subObj = getSubject(subRef);
              return subObj ? String(subObj.id) : String(subRef);
            });
          secSubjectMap[sec.id] = Array.from(new Set(matching));
        } else if (sec.subjectInstructors) {
          const existing = secSubjectMap[sec.id] || [];
          const seen = new Set(existing.map(normToken));
          const merged = [...existing];
          (sec.subjects || []).forEach(subRef => {
            const subObj = getSubject(subRef);
            const keysToCheck = [subObj?.id, subObj?.code, subObj?.name, subRef].filter(Boolean);
            const assignedHere = keysToCheck.some(k => String(sec.subjectInstructors[k]) === String(item.id)) ||
              Object.entries(sec.subjectInstructors).some(([k, pId]) =>
                String(pId) === String(item.id) &&
                keysToCheck.some(ck => normToken(ck) === normToken(k))
              );
            if (assignedHere) {
              const canonical = subObj ? String(subObj.id) : String(subRef);
              if (!seen.has(normToken(canonical))) {
                seen.add(normToken(canonical));
                merged.push(canonical);
              }
            }
          });
          secSubjectMap[sec.id] = merged;
        }
      });

      const uniqueSpecs = [];
      const seenSpecs = new Set();
      (item.specialization || []).forEach(ref => {
        const subObj = getSubject(ref);
        const key = subObj ? String(subObj.id) : String(ref);
        const tok = normToken(key);
        if (tok && !seenSpecs.has(tok)) {
          seenSpecs.add(tok);
          uniqueSpecs.push(key);
        }
      });

      let fName = item.firstName || '';
      let lName = item.lastName || '';
      if (!fName && !lName && item.name) {
        if (item.name.includes(',')) {
          const parts = item.name.split(',');
          lName = parts[0].trim();
          fName = parts.slice(1).join(',').trim();
        } else {
          const titles = ['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'Engr.', 'Atty.'];
          let parts = item.name.trim().split(/\s+/);
          let title = '';
          if (parts.length > 0 && titles.includes(parts[0])) title = parts.shift();
          if (parts.length >= 2) {
            lName = parts.pop();
            fName = (title ? title + ' ' : '') + parts.join(' ');
          } else {
            lName = item.name;
          }
        }
      }

      setStagedEntityForm({
        id: item.id || '',
        firstName: fName,
        lastName: lName,
        department: item.department || availableDepts[0] || 'BSCS',
        maxUnits: item.maxUnits !== undefined ? Number(item.maxUnits) : 12,
        preferredRooms: item.preferredRooms || []
      });
      setStagedAssignedSections(uniqueSecs);
      setStagedAssignedSubjects(uniqueSpecs);
      setStagedFacultyMap(secSubjectMap);

    } else if (type === 'subject') {
      const depts = Array.isArray(item.departments) && item.departments.length > 0
        ? item.departments
        : (item.department ? [item.department] : []);

      const cat = item.category || 'Major';
      const sem = (item.semester && item.semester !== 'Both')
        ? item.semester
        : (cat === 'Minor' ? 'Both' : (activeSemester || '1st Semester'));

      const detection = detectLabRequirement({
        code: item.code,
        name: item.name,
        category: cat,
        departments: depts
      }, subjects);

      setAutoDetectedReason(detection.reason);
      setUserLabModified(true);

      setStagedEntityForm({
        id: item.id || '',
        code: item.code || '',
        name: item.name || '',
        category: cat,
        departments: depts,
        credits: item.credits !== undefined ? Number(item.credits) : 3,
        hoursPerMeeting: item.hoursPerMeeting !== undefined ? Number(item.hoursPerMeeting) : 1.5,
        semester: sem,
        hasLecLab: Boolean(item.hasLecLab),
        requiredLab: Boolean(item.requiredLab),
        isFoodLab: Boolean(item.isFoodLab),
        lectureHours: item.lectureHours !== undefined ? Number(item.lectureHours) : 2,
        labHours: item.labHours !== undefined ? Number(item.labHours) : 3,
      });

      const subTokens = getSubjectMatchTokens(item, { includeName: true });
      const enrolled = localSections.filter(s =>
        (s.subjects || []).some(sub => subTokens.has(normToken(sub)))
      ).map(s => s.id);
      const specialized = localProfessors.filter(p =>
        (p.specialization || []).some(sub => subTokens.has(normToken(sub)))
      ).map(p => p.id);
      setStagedAssignedSections(enrolled);
      setStagedFacultyMap({ assignedProfessors: specialized });
    }
  };

  // --- Nested Cross-Entity Editing Handlers ---
  const handleToggleNestedSubject = (subRef) => {
    const sub = subjects.find(s => String(s.id) === String(subRef) || String(s.code) === String(subRef) || String(s.name) === String(subRef)) || { id: subRef, code: subRef, name: subRef };
    const subKey = sub.id || sub.code || subRef;

    if (nestedEditing && nestedEditing.type === 'subject' && nestedEditing.id === subKey) {
      setNestedEditing(null);
      return;
    }

    const depts = Array.isArray(sub.departments) && sub.departments.length > 0
      ? sub.departments
      : (sub.department ? [sub.department] : []);

    setNestedEditing({
      type: 'subject',
      id: subKey,
      original: sub,
      form: {
        id: sub.id || subKey,
        code: sub.code || subKey,
        name: sub.name || subKey,
        category: sub.category || 'Major',
        departments: depts,
        credits: sub.credits !== undefined ? Number(sub.credits) : 3,
        semester: sub.semester || '1st Semester',
        hasLecLab: Boolean(sub.hasLecLab),
        requiredLab: Boolean(sub.requiredLab),
        isFoodLab: Boolean(sub.isFoodLab),
        lectureHours: sub.lectureHours !== undefined ? Number(sub.lectureHours) : 2,
        labHours: sub.labHours !== undefined ? Number(sub.labHours) : 3,
        hoursPerMeeting: sub.hoursPerMeeting !== undefined ? Number(sub.hoursPerMeeting) : 1.5,
      }
    });
  };

  const handleToggleNestedFaculty = (profId) => {
    if (!profId) return;
    const prof = localProfessors.find(p => String(p.id) === String(profId));
    if (!prof) return;

    if (nestedEditing && nestedEditing.type === 'faculty' && nestedEditing.id === prof.id) {
      setNestedEditing(null);
      return;
    }

    let fName = prof.firstName || '';
    let lName = prof.lastName || '';
    if (!fName && !lName && prof.name) {
      if (prof.name.includes(',')) {
        const parts = prof.name.split(',');
        lName = parts[0].trim();
        fName = parts.slice(1).join(',').trim();
      } else {
        lName = prof.name;
      }
    }

    setNestedEditing({
      type: 'faculty',
      id: prof.id,
      original: prof,
      form: {
        id: prof.id,
        firstName: fName,
        lastName: lName,
        department: prof.department || availableDepts[0] || 'BSCS',
        maxUnits: prof.maxUnits !== undefined ? Number(prof.maxUnits) : 12,
        preferredRooms: prof.preferredRooms || []
      }
    });
  };

  const handleToggleNestedSection = (secId) => {
    if (!secId) return;
    const sec = localSections.find(s => String(s.id) === String(secId) || String(s.name) === String(secId));
    if (!sec) return;

    if (nestedEditing && nestedEditing.type === 'section' && nestedEditing.id === sec.id) {
      setNestedEditing(null);
      return;
    }

    setNestedEditing({
      type: 'section',
      id: sec.id,
      original: sec,
      form: {
        id: sec.id,
        name: sec.name || '',
        program: sec.program || availablePrograms[0] || 'BSCS',
        yearLevel: Number(sec.yearLevel) || 1
      }
    });
  };

  // Instant quick toggle for lab requirements on a subject
  const handleQuickToggleSubjectLab = async (subRef, mode) => {
    const sub = subjects.find(s => String(s.id) === String(subRef) || String(s.code) === String(subRef) || String(s.name) === String(subRef));
    if (!sub || !sub.id) {
      toast.error("Subject record not found in database.");
      return;
    }

    try {
      let updatePayload = {};
      if (mode === 'leclab') {
        const nextVal = !sub.hasLecLab;
        updatePayload = {
          hasLecLab: nextVal,
          requiredLab: nextVal ? (sub.requiredLab || !sub.isFoodLab) : sub.requiredLab
        };
      } else if (mode === 'complab') {
        const nextVal = !sub.requiredLab;
        updatePayload = {
          requiredLab: nextVal,
          isFoodLab: nextVal ? false : sub.isFoodLab
        };
      } else if (mode === 'foodlab') {
        const nextVal = !sub.isFoodLab;
        updatePayload = {
          isFoodLab: nextVal,
          requiredLab: nextVal ? false : sub.requiredLab
        };
      }

      await updateDoc(doc(db, 'subjects', String(sub.id)), updatePayload);
      toast.success(`Updated ${sub.code} lab settings!`);
    } catch (err) {
      console.error("Error quick toggling subject lab:", err);
      toast.error("Failed to update subject lab settings: " + err.message);
    }
  };

  // Save the currently expanded nested entity (subject, faculty, or section)
  const handleSaveNested = async () => {
    if (!nestedEditing) return;
    setIsSavingNested(true);
    try {
      const { type, form } = nestedEditing;
      const targetId = String(form.id || nestedEditing.id);

      if (type === 'subject') {
        const code = (form.code || '').trim();
        const name = (form.name || '').trim();
        if (!code || !name) {
          toast.error("Subject code and name are required.");
          setIsSavingNested(false);
          return;
        }

        await updateDoc(doc(db, 'subjects', targetId), {
          code,
          name,
          category: form.category || 'Major',
          departments: form.departments || [],
          department: form.departments?.[0] || '',
          credits: Number(form.credits) || 3,
          semester: form.semester || '1st Semester',
          hasLecLab: Boolean(form.hasLecLab),
          requiredLab: Boolean(form.requiredLab),
          isFoodLab: Boolean(form.isFoodLab),
          lectureHours: Number(form.lectureHours) || 2,
          labHours: Number(form.labHours) || 3,
          hoursPerMeeting: Number(form.hoursPerMeeting) || 1.5,
        });

        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_SUBJECT,
          details: `Updated subject ${code}: ${name} (${form.hasLecLab ? 'Lec & Lab' : 'Lecture'}, ${form.requiredLab ? 'Computer Lab' : form.isFoodLab ? 'Food Lab' : 'Standard'})`
        });

        toast.success(`Subject ${code} updated successfully!`);
        setNestedEditing(null);

      } else if (type === 'faculty') {
        const fName = (form.firstName || '').trim();
        const lName = (form.lastName || '').trim();
        if (!fName || !lName) {
          toast.error("First and last names are required.");
          setIsSavingNested(false);
          return;
        }
        const combinedName = `${lName}, ${fName}`;

        setLocalProfessors(prev => prev.map(p => {
          if (String(p.id) === targetId) {
            return {
              ...p,
              firstName: fName,
              lastName: lName,
              name: combinedName,
              department: form.department,
              maxUnits: Number(form.maxUnits) || 12,
              preferredRooms: form.preferredRooms || []
            };
          }
          return p;
        }));

        await updateDoc(doc(db, 'professors', targetId), {
          firstName: fName,
          lastName: lName,
          name: combinedName,
          department: form.department,
          maxUnits: Number(form.maxUnits) || 12,
          preferredRooms: form.preferredRooms || []
        });

        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_FACULTY,
          details: `Updated faculty ${combinedName} (${form.department}, Max ${form.maxUnits} units)`
        });

        toast.success(`Faculty ${combinedName} updated successfully!`);
        setNestedEditing(null);

      } else if (type === 'section') {
        const name = (form.name || '').trim();
        if (!name) {
          toast.error("Section name is required.");
          setIsSavingNested(false);
          return;
        }

        setLocalSections(prev => prev.map(s => {
          if (String(s.id) === targetId) {
            return {
              ...s,
              name,
              program: form.program,
              yearLevel: Number(form.yearLevel) || 1
            };
          }
          return s;
        }));

        await updateDoc(doc(db, 'sections', targetId), {
          name,
          program: form.program,
          yearLevel: Number(form.yearLevel) || 1
        });

        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_SECTION,
          details: `Updated section ${name} (${form.program} Y${form.yearLevel})`
        });

        toast.success(`Section ${name} updated successfully!`);
        setNestedEditing(null);
      }
    } catch (err) {
      console.error("Error saving nested entity:", err);
      toast.error("Failed to update: " + err.message);
    } finally {
      setIsSavingNested(false);
    }
  };

  // --- Save Staged Entity in Modal (Optimistic Zero-Latency UI) ---
  const handleSaveModal = async () => {
    if (!editingEntity) return;
    setModalError(null);
    setIsSaving(true);

    const prevSections = localSections;
    const prevProfessors = localProfessors;

    try {
      const batch = writeBatch(db);
      const { type, item } = editingEntity;

      if (type === 'section') {
        const name = (stagedEntityForm.name || '').trim();
        const program = stagedEntityForm.program;
        if (!name || !program) {
          setModalError("Section name and program are required.");
          setIsSaving(false);
          return;
        }
        const isDuplicate = localSections.some(s => String(s.id) !== String(item.id) && s.name?.trim().toUpperCase() === name.toUpperCase());
        if (isDuplicate) {
          setModalError(`A section named "${name}" already exists.`);
          setIsSaving(false);
          return;
        }

        // 1. Build cleaned subjectInstructors strictly for currently enrolled subjects & map professors
        const cleanedSubjectInstructors = {};
        const profToSubjects = {};
        stagedAssignedSubjects.forEach(subRef => {
          const subObj = getSubject(subRef);
          const subKey = subObj?.id || subObj?.code || subRef;
          const pId = stagedFacultyMap[subKey] ||
                      stagedFacultyMap[subRef] ||
                      (subObj?.id && stagedFacultyMap[subObj.id]) ||
                      (subObj?.code && stagedFacultyMap[subObj.code]) ||
                      (subObj?.name && stagedFacultyMap[subObj.name]);
          if (pId) {
            const canonical = subObj?.id || subObj?.code || subRef;
            [subKey, subRef, subObj?.id, subObj?.code].filter(Boolean).forEach(k => {
              cleanedSubjectInstructors[k] = pId;
            });
            if (!profToSubjects[pId]) profToSubjects[pId] = [];
            if (!profToSubjects[pId].includes(canonical)) {
              profToSubjects[pId].push(canonical);
            }
          }
        });

        batch.update(doc(db, 'sections', String(item.id)), {
          name,
          program,
          yearLevel: Number(stagedEntityForm.yearLevel) || 1,
          subjects: stagedAssignedSubjects,
          subjectInstructors: cleanedSubjectInstructors
        });

        // 2. Update professors who are assigned or removed from this section
        const secRemovalTokens = new Set([item.id, item.name, name].map(normToken).filter(Boolean));
        const profUpdatesMap = new Map();

        Object.entries(profToSubjects).forEach(([pId, subRefs]) => {
          const prof = localProfessors.find(p => String(p.id) === String(pId));
          if (prof) {
            const curSecs = prof.assignedSections || [];
            const newSecs = curSecs.some(id => secRemovalTokens.has(normToken(id)))
              ? curSecs
              : [...curSecs, item.id];

            let curSpecs = [...(prof.specialization || [])];
            subRefs.forEach(subRef => {
              const subObj = getSubject(subRef);
              const codeOrId = subObj?.id || subObj?.code || subRef;
              const tokens = getSubjectMatchTokens(subRef);
              if (!curSpecs.some(sp => tokens.has(normToken(sp)))) {
                curSpecs.push(codeOrId);
              }
            });

            const curMap = { ...(prof.sectionSubjectMap || {}) };
            if (item.name && item.name !== item.id) delete curMap[item.name];
            if (name && name !== item.id) delete curMap[name];
            curMap[item.id] = subRefs;

            const patch = {
              assignedSections: newSecs,
              specialization: curSpecs,
              sectionSubjectMap: curMap
            };
            profUpdatesMap.set(String(prof.id), patch);
            batch.update(doc(db, 'professors', String(prof.id)), patch);
          }
        });

        // 3. Remove section from professors no longer teaching here
        localProfessors.forEach(prof => {
          if (profUpdatesMap.has(String(prof.id))) return;
          const hadInAssigned = (prof.assignedSections || []).some(id => secRemovalTokens.has(normToken(id)));
          const curMap = { ...(prof.sectionSubjectMap || {}) };
          const mapKeysToDelete = Object.keys(curMap).filter(k => secRemovalTokens.has(normToken(k)));
          if (hadInAssigned || mapKeysToDelete.length > 0) {
            const newSecs = (prof.assignedSections || []).filter(s => !secRemovalTokens.has(normToken(s)));
            mapKeysToDelete.forEach(k => delete curMap[k]);

            const patch = {
              assignedSections: newSecs,
              sectionSubjectMap: curMap
            };
            profUpdatesMap.set(String(prof.id), patch);
            batch.update(doc(db, 'professors', String(prof.id)), patch);
          }
        });

        // OPTIMISTIC LOCAL STATE UPDATE (0ms delay)
        const updatedSection = {
          ...item,
          name,
          program,
          yearLevel: Number(stagedEntityForm.yearLevel) || 1,
          subjects: stagedAssignedSubjects,
          subjectInstructors: cleanedSubjectInstructors
        };

        setLocalSections(prev => prev.map(s => String(s.id) === String(item.id) ? updatedSection : s));
        if (profUpdatesMap.size > 0) {
          setLocalProfessors(prev => prev.map(p => profUpdatesMap.has(String(p.id)) ? { ...p, ...profUpdatesMap.get(String(p.id)) } : p));
        }

        assignedProfCache.current.clear();
        subjectProfOptionsCache.current.clear();
        setEditingEntity(null);
        toast.success(`Section ${name} saved successfully!`);

        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_SECTION,
          details: `Updated section: ${name} (${program})`
        });

        await batch.commit();

      } else if (type === 'faculty') {
        const fName = (stagedEntityForm.firstName || '').trim();
        const lName = (stagedEntityForm.lastName || '').trim();
        if (!fName || !lName) {
          setModalError("First and last names are required.");
          setIsSaving(false);
          return;
        }
        const combinedName = `${lName}, ${fName}`;
        const isDuplicate = localProfessors.some(p => String(p.id) !== String(item.id) && (p.name || '').trim().toLowerCase() === combinedName.toLowerCase());
        if (isDuplicate) {
          setModalError(`A faculty member named "${combinedName}" already exists.`);
          setIsSaving(false);
          return;
        }

        const stagedSpecTokens = new Set();
        stagedAssignedSubjects.forEach(subRef => {
          getSubjectMatchTokens(subRef).forEach(t => stagedSpecTokens.add(t));
        });

        // Normalize & prune sectionSubjectMap strictly to assigned sections and current specializations
        const cleanedSectionSubjectMap = {};
        stagedAssignedSections.forEach(secRef => {
          const sec = sectionMap.get(normToken(secRef));
          const canonicalSecId = sec ? String(sec.id) : String(secRef);
          const rawSubs = stagedFacultyMap[canonicalSecId] ||
                          stagedFacultyMap[secRef] ||
                          (sec?.name && stagedFacultyMap[sec.name]) ||
                          [];
          const deduped = [];
          const seen = new Set();
          (Array.isArray(rawSubs) ? rawSubs : []).forEach(subRef => {
            const subObj = getSubject(subRef);
            const canonicalSub = subObj ? String(subObj.id) : String(subRef);
            const subToks = getSubjectMatchTokens(subRef);
            const isInSpec = Array.from(subToks).some(t => stagedSpecTokens.has(t));
            if (isInSpec && !seen.has(normToken(canonicalSub))) {
              seen.add(normToken(canonicalSub));
              deduped.push(canonicalSub);
            }
          });
          cleanedSectionSubjectMap[canonicalSecId] = deduped;
        });

        // 1. Update professor doc
        batch.update(doc(db, 'professors', String(item.id)), {
          firstName: fName,
          lastName: lName,
          name: combinedName,
          department: stagedEntityForm.department,
          maxUnits: Number(stagedEntityForm.maxUnits) || 12,
          preferredRooms: stagedEntityForm.preferredRooms || [],
          specialization: stagedAssignedSubjects,
          assignedSections: stagedAssignedSections,
          sectionSubjectMap: cleanedSectionSubjectMap
        });

        // 2. Synchronize sections to reflect this professor's specific subject assignments
        const updatedSecsList = [];
        localSections.forEach(sec => {
          const secToks = getSectionMatchTokens(sec);
          const isNowAssignedSection = stagedAssignedSections.some(id => secToks.has(normToken(id)));

          let updatedSubjs = [...(sec.subjects || [])];
          const updatedSubjectInstructors = { ...(sec.subjectInstructors || {}) };
          let secChanged = false;

          if (isNowAssignedSection) {
            const chosenSubs = cleanedSectionSubjectMap[sec.id] || [];
            const chosenTokens = new Set();

            chosenSubs.forEach(subRef => {
              const subObj = getSubject(subRef);
              const val = subObj?.id || subObj?.code || subRef;
              const subToks = getSubjectMatchTokens(subRef);
              subToks.forEach(t => chosenTokens.add(t));

              if (!updatedSubjs.some(existing => subToks.has(normToken(existing)))) {
                updatedSubjs.push(val);
                secChanged = true;
              }
              [val, subObj?.id, subObj?.code].filter(Boolean).forEach(k => {
                if (String(updatedSubjectInstructors[k]) !== String(item.id)) {
                  updatedSubjectInstructors[k] = item.id;
                  secChanged = true;
                }
              });
            });

            // Remove ANY key on section.subjectInstructors pointing to this prof for unchecked subjects
            Object.entries(updatedSubjectInstructors).forEach(([k, pId]) => {
              if (String(pId) === String(item.id)) {
                const kSub = getSubject(k);
                const kTokens = kSub
                  ? [kSub.id, kSub.code, k].filter(Boolean).map(normToken)
                  : [normToken(k)];
                const stillChosen = kTokens.some(t => chosenTokens.has(t));
                if (!stillChosen) {
                  delete updatedSubjectInstructors[k];
                  secChanged = true;
                }
              }
            });
          } else {
            // Section is not assigned to this professor: clear all subjectInstructors pointing to item.id
            Object.entries(updatedSubjectInstructors).forEach(([k, pId]) => {
              if (String(pId) === String(item.id)) {
                delete updatedSubjectInstructors[k];
                secChanged = true;
              }
            });
          }

          if (secChanged) {
            batch.update(doc(db, 'sections', String(sec.id)), {
              subjects: updatedSubjs,
              subjectInstructors: updatedSubjectInstructors
            });
            updatedSecsList.push({ id: sec.id, subjects: updatedSubjs, subjectInstructors: updatedSubjectInstructors });
          }
        });

        // OPTIMISTIC LOCAL UPDATE
        setLocalProfessors(prev => prev.map(p => String(p.id) === String(item.id) ? {
          ...p,
          firstName: fName,
          lastName: lName,
          name: combinedName,
          department: stagedEntityForm.department,
          maxUnits: Number(stagedEntityForm.maxUnits) || 12,
          preferredRooms: stagedEntityForm.preferredRooms || [],
          specialization: stagedAssignedSubjects,
          assignedSections: stagedAssignedSections,
          sectionSubjectMap: cleanedSectionSubjectMap
        } : p));

        if (updatedSecsList.length > 0) {
          const secMapUpdates = new Map(updatedSecsList.map(s => [String(s.id), s]));
          setLocalSections(prev => prev.map(s => secMapUpdates.has(String(s.id)) ? { ...s, ...secMapUpdates.get(String(s.id)) } : s));
        }

        assignedProfCache.current.clear();
        subjectProfOptionsCache.current.clear();
        setEditingEntity(null);
        toast.success(`Faculty ${combinedName} saved successfully!`);

        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_FACULTY,
          details: `Updated faculty: ${combinedName} (${stagedEntityForm.department})`
        });

        await batch.commit();

      } else if (type === 'subject') {
        if (!item.id) {
          setModalError("Subject record not found in database.");
          setIsSaving(false);
          return;
        }
        const code = (stagedEntityForm.code || '').trim();
        const name = (stagedEntityForm.name || '').trim();
        if (!code || !name) {
          setModalError("Subject code and name are required.");
          setIsSaving(false);
          return;
        }
        if (stagedEntityForm.category !== 'Minor' && (!stagedEntityForm.departments || stagedEntityForm.departments.length === 0)) {
          setModalError("Major subjects must have at least one department assigned.");
          setIsSaving(false);
          return;
        }
        const isCodeDuplicate = subjects.some(s => String(s.id) !== String(item.id) && (s.code || '').trim().toUpperCase() === code.toUpperCase());
        if (isCodeDuplicate) {
          setModalError(`A subject with the code "${code}" already exists.`);
          setIsSaving(false);
          return;
        }

        const subjectDocPayload = {
          code,
          name,
          category: stagedEntityForm.category || 'Major',
          departments: stagedEntityForm.departments || [],
          department: stagedEntityForm.departments?.[0] || (stagedEntityForm.category === 'Minor' ? 'SHARED' : ''),
          credits: Number(stagedEntityForm.credits) || 3,
          semester: stagedEntityForm.semester || activeSemester || '1st Semester',
          hasLecLab: Boolean(stagedEntityForm.hasLecLab),
          requiredLab: Boolean(stagedEntityForm.requiredLab),
          isFoodLab: Boolean(stagedEntityForm.isFoodLab),
          lectureHours: Number(stagedEntityForm.lectureHours) || 2,
          labHours: Number(stagedEntityForm.labHours) || 3,
          hoursPerMeeting: Number(stagedEntityForm.hoursPerMeeting) || 1.5,
        };

        // 1. Update the subject document in Firestore!
        batch.update(doc(db, 'subjects', String(item.id)), subjectDocPayload);

        // 2. Sync sections & accumulate professor updates (single batch update per professor)
        const oldCode = item.code || item.id;
        const subjectTokens = new Set(
          [item.id, oldCode, code, item.name, name].map(normToken).filter(Boolean)
        );
        const stagedSecTokens = new Set(stagedAssignedSections.map(normToken).filter(Boolean));
        const updatedSectionsMap = new Map();
        const profPatchMap = new Map();

        const getOrInitProfPatch = (prof) => {
          const pKey = String(prof.id);
          if (!profPatchMap.has(pKey)) {
            profPatchMap.set(pKey, {
              assignedSections: [...(prof.assignedSections || [])],
              sectionSubjectMap: { ...(prof.sectionSubjectMap || {}) },
              specialization: [...(prof.specialization || [])],
              changed: false
            });
          }
          return profPatchMap.get(pKey);
        };

        localSections.forEach(sec => {
          const secToks = getSectionMatchTokens(sec);
          const wasEnrolled = (sec.subjects || []).some(s => subjectTokens.has(normToken(s)));
          const isNowEnrolled = Array.from(secToks).some(t => stagedSecTokens.has(t));

          if (!wasEnrolled && isNowEnrolled) {
            const canonicalSub = item.id || code;
            const updated = [...(sec.subjects || []), canonicalSub];
            batch.update(doc(db, 'sections', String(sec.id)), { subjects: updated });
            updatedSectionsMap.set(String(sec.id), { subjects: updated });
          } else if (wasEnrolled && !isNowEnrolled) {
            const updated = (sec.subjects || []).filter(s => !subjectTokens.has(normToken(s)));
            const updatedInst = { ...(sec.subjectInstructors || {}) };
            Object.keys(updatedInst).forEach(k => {
              if (subjectTokens.has(normToken(k))) {
                delete updatedInst[k];
              }
            });

            batch.update(doc(db, 'sections', String(sec.id)), {
              subjects: updated,
              subjectInstructors: updatedInst
            });
            updatedSectionsMap.set(String(sec.id), {
              subjects: updated,
              subjectInstructors: updatedInst
            });

            // Clean professor map across all keys matching this section
            localProfessors.forEach(prof => {
              const patch = getOrInitProfPatch(prof);
              const matchingMapKeys = Object.keys(patch.sectionSubjectMap).filter(k => secToks.has(normToken(k)));
              let removedFromThisSec = false;
              let remainingInThisSec = 0;

              matchingMapKeys.forEach(mapKey => {
                const secSubs = Array.isArray(patch.sectionSubjectMap[mapKey]) ? patch.sectionSubjectMap[mapKey] : [];
                if (secSubs.some(s => subjectTokens.has(normToken(s)))) {
                  const newSecSubs = secSubs.filter(s => !subjectTokens.has(normToken(s)));
                  removedFromThisSec = true;
                  patch.changed = true;
                  if (newSecSubs.length === 0) {
                    delete patch.sectionSubjectMap[mapKey];
                  } else {
                    patch.sectionSubjectMap[mapKey] = newSecSubs;
                    remainingInThisSec += newSecSubs.length;
                  }
                } else {
                  remainingInThisSec += secSubs.length;
                }
              });

              if (removedFromThisSec && remainingInThisSec === 0) {
                patch.assignedSections = patch.assignedSections.filter(s => !secToks.has(normToken(s)));
              }
            });
          } else if (wasEnrolled && isNowEnrolled && oldCode !== code) {
            let secChanged = false;
            const updated = (sec.subjects || []).map(s => {
              if (normToken(s) === normToken(oldCode)) {
                secChanged = true;
                return code;
              }
              return s;
            });
            const updatedInst = { ...(sec.subjectInstructors || {}) };
            Object.keys(updatedInst).forEach(k => {
              if (normToken(k) === normToken(oldCode)) {
                updatedInst[code] = updatedInst[k];
                if (k !== code) delete updatedInst[k];
                secChanged = true;
              }
            });
            if (secChanged) {
              batch.update(doc(db, 'sections', String(sec.id)), {
                subjects: updated,
                subjectInstructors: updatedInst
              });
              updatedSectionsMap.set(String(sec.id), {
                subjects: updated,
                subjectInstructors: updatedInst
              });
            }
          }
        });

        // 3. Sync professors' specializations into the same profPatchMap
        const profIdsSet = new Set((stagedFacultyMap.assignedProfessors || []).map(String));
        localProfessors.forEach(prof => {
          const patch = getOrInitProfPatch(prof);
          const wasAssigned = patch.specialization.some(s => subjectTokens.has(normToken(s)));
          const isNowAssigned = profIdsSet.has(String(prof.id));

          if (!wasAssigned && isNowAssigned) {
            patch.specialization = [...patch.specialization, item.id || code];
            patch.changed = true;
          } else if (wasAssigned && !isNowAssigned) {
            patch.specialization = patch.specialization.filter(s => !subjectTokens.has(normToken(s)));
            patch.changed = true;
          } else if (wasAssigned && isNowAssigned && oldCode !== code) {
            patch.specialization = patch.specialization.map(s => normToken(s) === normToken(oldCode) ? code : s);
            patch.changed = true;
          }
        });

        // Commit accumulated professor updates (one update per professor)
        const optimisticProfPatches = new Map();
        profPatchMap.forEach((patch, pId) => {
          if (patch.changed) {
            const payload = {
              assignedSections: patch.assignedSections,
              sectionSubjectMap: patch.sectionSubjectMap,
              specialization: patch.specialization
            };
            batch.update(doc(db, 'professors', pId), payload);
            optimisticProfPatches.set(pId, payload);
          }
        });

        // OPTIMISTIC LOCAL STATE UPDATE (0ms delay)
        if (updatedSectionsMap.size > 0) {
          setLocalSections(prev => prev.map(s => updatedSectionsMap.has(String(s.id)) ? { ...s, ...updatedSectionsMap.get(String(s.id)) } : s));
        }
        if (optimisticProfPatches.size > 0) {
          setLocalProfessors(prev => prev.map(p => optimisticProfPatches.has(String(p.id)) ? { ...p, ...optimisticProfPatches.get(String(p.id)) } : p));
        }

        assignedProfCache.current.clear();
        subjectProfOptionsCache.current.clear();
        setEditingEntity(null);
        toast.success(`Subject ${code} saved successfully!`);

        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_SUBJECT,
          details: `Updated subject: ${code} - ${name} (${subjectDocPayload.credits} units)`
        });

        await batch.commit();
      }
    } catch (err) {
      console.error("Error saving assignments modal:", err);
      setLocalSections(prevSections);
      setLocalProfessors(prevProfessors);
      assignedProfCache.current.clear();
      subjectProfOptionsCache.current.clear();
      toast.error("Failed to save changes. Please try again.");
      setModalError("Failed to save changes. Please check fields and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Filtering & Searching ---
  const filteredSections = useMemo(() => {
    return localSections.filter(sec => {
      const secDept = resolveDeptCode(sec.program) || resolveDeptCode(sec.department);
      const matchDept = departmentFilter === 'All' || secDept === departmentFilter;
      const cleanStr = (s) => String(s || '').toLowerCase().replace(/[\s\-_]/g, '');
      const q = cleanStr(searchQuery);
      const matchSearch = !searchQuery.trim() ||
        cleanStr(sec.name).includes(q) ||
        cleanStr(sec.program).includes(q);
      if (!matchDept || !matchSearch) return false;

      if (onlyNeedsAttention) {
        const enrolled = sec.subjects || [];
        if (enrolled.length === 0) return true;
        const hasMissing = enrolled.some(subRef => !getAssignedProf(sec, subRef));
        return hasMissing;
      }

      if (onlyLecLab) {
        const enrolled = sec.subjects || [];
        const hasLecLabSubject = enrolled.some(subRef => {
          const sub = getSubject(subRef);
          return sub?.hasLecLab;
        });
        if (!hasLecLabSubject) return false;
      }

      return true;
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [localSections, departmentFilter, searchQuery, onlyNeedsAttention, onlyLecLab, getAssignedProf, getSubject]);

  const filteredFaculty = useMemo(() => {
    return localProfessors.filter(prof => {
      const profDept = resolveDeptCode(prof.department);
      const matchDept = departmentFilter === 'All' || profDept === departmentFilter || prof.department === departmentFilter;
      const cleanStr = (s) => String(s || '').toLowerCase().replace(/[\s\-_]/g, '');
      const q = cleanStr(searchQuery);
      const fullName = (prof.name || `${prof.lastName || ''} ${prof.firstName || ''}`);
      const matchSearch = !searchQuery.trim() || cleanStr(fullName).includes(q);
      if (!matchDept || !matchSearch) return false;

      if (onlyNeedsAttention) {
        return (prof.assignedSections || []).length === 0 || (prof.specialization || []).length === 0;
      }

      if (onlyLecLab) {
        const specs = prof.specialization || [];
        const assignedSecs = prof.assignedSections || [];
        const specHasLecLab = specs.some(sRef => getSubject(sRef)?.hasLecLab);
        const teachesLecLab = assignedSecs.some(secId => {
          const sec = sectionMap.get(String(secId).toLowerCase());
          return (sec?.subjects || []).some(subRef => {
            const sub = getSubject(subRef);
            return sub?.hasLecLab && getAssignedProf(sec, subRef)?.id === prof.id;
          });
        });
        if (!specHasLecLab && !teachesLecLab) return false;
      }

      return true;
    }).sort((a, b) => {
      const nameA = a.name || `${a.lastName || ''}, ${a.firstName || ''}`;
      const nameB = b.name || `${b.lastName || ''}, ${b.firstName || ''}`;
      return nameA.localeCompare(nameB);
    });
  }, [localProfessors, departmentFilter, searchQuery, onlyNeedsAttention, onlyLecLab, getSubject, sectionMap, getAssignedProf]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter(sub => {
      // Filter by active semester if applicable
      if (activeSemester && sub.semester && sub.semester !== 'Both' && sub.semester !== activeSemester) {
        return false;
      }
      
      const subDepts = (sub.departments || (sub.department ? [sub.department] : [])).map(resolveDeptCode);
      const matchDept = departmentFilter === 'All' || subDepts.includes(departmentFilter);
      const cleanStr = (s) => String(s || '').toLowerCase().replace(/[\s\-_]/g, '');
      const q = cleanStr(searchQuery);
      const matchSearch = !searchQuery.trim() || cleanStr(sub.code).includes(q) || cleanStr(sub.name).includes(q);
      if (!matchDept || !matchSearch) return false;

      if (onlyNeedsAttention) {
        const isEnrolled = (sub.id && enrolledSubjectCodesSet.has(String(sub.id).toLowerCase())) ||
          (sub.code && enrolledSubjectCodesSet.has(String(sub.code).toLowerCase())) ||
          (sub.name && enrolledSubjectCodesSet.has(String(sub.name).toLowerCase()));
        const hasProf = (sub.id && specializedSubjectCodesSet.has(String(sub.id).toLowerCase())) ||
          (sub.code && specializedSubjectCodesSet.has(String(sub.code).toLowerCase())) ||
          (sub.name && specializedSubjectCodesSet.has(String(sub.name).toLowerCase()));
        return !isEnrolled || !hasProf;
      }

      if (onlyLecLab && !sub.hasLecLab) {
        return false;
      }

      return true;
    }).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  }, [subjects, departmentFilter, searchQuery, onlyNeedsAttention, onlyLecLab, enrolledSubjectCodesSet, specializedSubjectCodesSet, activeSemester]);

  // Progressive windowing: start with 12 items for instant (<16ms) initial render
  const [visibleLimit, setVisibleLimit] = useState(12);
  const sentinelRef = useRef(null);

  useEffect(() => {
    setVisibleLimit(12);
  }, [viewMode, departmentFilter, searchQuery, onlyNeedsAttention, onlyLecLab]);

  // Lock body & main content scrolling when configuration modal is open to prevent background scrolling & re-render flicker
  useEffect(() => {
    if (editingEntity) {
      const originalBodyOverflow = document.body.style.overflow;
      const mainContentEl = document.querySelector('.main-content');
      const originalMainOverflow = mainContentEl ? mainContentEl.style.overflow : '';

      document.body.style.overflow = 'hidden';
      if (mainContentEl) {
        mainContentEl.style.overflow = 'hidden';
      }

      return () => {
        document.body.style.overflow = originalBodyOverflow;
        if (mainContentEl) {
          mainContentEl.style.overflow = originalMainOverflow;
        }
      };
    }
  }, [editingEntity]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !editingEntity) {
        setVisibleLimit(prev => prev + 12);
      }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, filteredSections.length, filteredFaculty.length, filteredSubjects.length, editingEntity]);

  const displayedSections = useMemo(() => filteredSections.slice(0, visibleLimit), [filteredSections, visibleLimit]);
  const displayedFaculty = useMemo(() => filteredFaculty.slice(0, visibleLimit), [filteredFaculty, visibleLimit]);
  const displayedSubjects = useMemo(() => filteredSubjects.slice(0, visibleLimit), [filteredSubjects, visibleLimit]);

  // Render chip helper for AutocompleteMultiSelect in modal
  const renderSubjectChip = (sub, onRemove) => {
    const codeVal = sub.code || sub.courseCode || sub.subjectCode;
    const nameVal = sub.name || sub.title;
    return (
      <div className="hub-chip hub-chip-purple" title={nameVal ? `${codeVal ? `${codeVal} - ` : ''}${nameVal}` : undefined}>
        <span className="hub-chip-code">{codeVal || nameVal}</span>
        {nameVal && codeVal && nameVal !== codeVal && (
          <span className="hub-chip-subname">
            ({nameVal})
          </span>
        )}
        {sub.hasLecLab && (
          <span className="hub-tag-leclab-micro">
            Lec+Lab
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hub-chip-remove"
          title="Remove"
        >
          <X size={12} />
        </button>
      </div>
    );
  };

  // Render option helper for AutocompleteMultiSelect in modal
  const renderSubjectOption = (sub) => {
    const codeVal = sub.code || sub.courseCode || sub.subjectCode;
    const nameVal = sub.name || sub.title;
    const hasDistinctCode = codeVal && nameVal && String(codeVal).trim().toLowerCase() !== String(nameVal).trim().toLowerCase();

    return (
      <div className="hub-select-option-row">
        {hasDistinctCode ? (
          <>
            <span className="hub-subject-code">{codeVal}</span>
            <span className="hub-subject-name" title={nameVal}>{nameVal}</span>
          </>
        ) : (
          <span className="hub-subject-name" style={{ fontWeight: 600 }} title={codeVal || nameVal || sub.id}>
            {codeVal || nameVal || sub.id}
          </span>
        )}
        {sub.hasLecLab && (
          <span className="hub-tag-leclab" style={{ flexShrink: 0 }}>
            <FlaskConical size={10} />
            Lec & Lab
          </span>
        )}
        {sub.credits && (
          <span className="hub-badge-credits">
            {sub.credits}u
          </span>
        )}
      </div>
    );
  };

  const renderSectionChip = (sec, onRemove) => (
    <div className="hub-chip hub-chip-green">
      <span className="hub-chip-code">{sec.name}</span>
      {sec.program && <span className="hub-chip-subname">({sec.program})</span>}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="hub-chip-remove"
        title="Remove"
      >
        <X size={12} />
      </button>
    </div>
  );

  const renderSectionOption = (sec) => (
    <div className="hub-select-option-row">
      <span className="hub-option-title">{sec.name}</span>
      {sec.program && (
        <span className="hub-chip-green" style={{ height: '20px', padding: '0 6px', fontSize: '0.68rem', fontWeight: 700 }}>
          {sec.program}
        </span>
      )}
      {sec.yearLevel && (
        <span className="hub-chip-meta">
          Y{sec.yearLevel}
        </span>
      )}
    </div>
  );

  const renderFacultyChip = (prof, onRemove) => (
    <div className="hub-chip hub-chip-blue">
      <span className="hub-chip-code">{prof.name || `${prof.lastName}, ${prof.firstName}`}</span>
      {prof.department && <span className="hub-chip-subname">({prof.department})</span>}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="hub-chip-remove"
        title="Remove"
      >
        <X size={12} />
      </button>
    </div>
  );

  const renderFacultyOption = (prof) => (
    <div className="hub-select-option-row">
      <span className="hub-option-title" style={{ flex: 1 }}>
        {prof.name || `${prof.lastName}, ${prof.firstName}`}
      </span>
      {prof.department && (
        <span className="hub-chip-blue" style={{ height: '20px', padding: '0 6px', fontSize: '0.68rem', fontWeight: 700 }}>
          {prof.department}
        </span>
      )}
    </div>
  );

  const renderRoomChip = (room, onRemove) => {
    const r = typeof room === 'object' && room !== null ? room : { name: room, id: room };
    return (
      <div className="hub-chip hub-chip-blue">
        <span className="hub-chip-code">{r.name || r.id}</span>
        {r.type && <span className="hub-chip-subname">({r.type})</span>}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hub-chip-remove"
          title="Remove"
        >
          <X size={12} />
        </button>
      </div>
    );
  };

  const renderRoomOption = (room) => (
    <div className="hub-select-option-row" style={{ justifyContent: 'space-between' }}>
      <span className="hub-option-title">{room.name || room.id}</span>
      {room.type && (
        <span className="hub-chip-meta">
          {room.type}
        </span>
      )}
    </div>
  );

  // --- Nested Inline Renderers ---
  const renderNestedSubjectEditor = (subRef) => {
    if (!nestedEditing || nestedEditing.type !== 'subject') return null;
    if (String(nestedEditing.id) !== String(subRef) && String(nestedEditing.form?.code) !== String(subRef) && String(nestedEditing.form?.id) !== String(subRef)) return null;
    const { form } = nestedEditing;

    return (
      <div className="hub-nested-editor-card">
        <div className="hub-nested-editor-header">
          <span className="hub-nested-editor-title">
            <Sliders size={14} />
            Configure Subject: {form.code || form.name}
          </span>
          <button
            type="button"
            onClick={() => setNestedEditing(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="hub-form-grid-2">
          <div className="hub-form-field">
            <label className="hub-form-label">Course Code *</label>
            <input
              type="text"
              className="hub-form-input"
              value={form.code || ''}
              onChange={e => {
                const newCode = e.target.value;
                const sug = suggestDepartmentFromCode(newCode);
                setNestedEditing(prev => {
                  let depts = [...(prev.form.departments || [])];
                  if (sug && !depts.includes(sug)) depts.push(sug);
                  return {
                    ...prev,
                    form: { ...prev.form, code: newCode, departments: depts }
                  };
                });
              }}
              placeholder="e.g. CS 101"
            />
          </div>
          <div className="hub-form-field">
            <label className="hub-form-label">Subject Title *</label>
            <input
              type="text"
              className="hub-form-input"
              value={form.name || ''}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, name: e.target.value } }))}
              placeholder="e.g. Data Structures"
            />
          </div>
        </div>

        <div className="hub-form-grid-3">
          <div className="hub-form-field">
            <label className="hub-form-label">Category</label>
            <select
              className="hub-form-select"
              value={form.category || 'Major'}
              onChange={e => {
                const cat = e.target.value;
                setNestedEditing(prev => ({
                  ...prev,
                  form: {
                    ...prev.form,
                    category: cat,
                    semester: cat === 'Minor' ? 'Both' : (prev.form.semester === 'Both' ? '1st Semester' : prev.form.semester)
                  }
                }));
              }}
            >
              <option value="Major">Major</option>
              <option value="Minor">Minor / GenEd</option>
            </select>
          </div>
          <div className="hub-form-field">
            <label className="hub-form-label">Units / Credits</label>
            <input
              type="number"
              min={1}
              max={10}
              className="hub-form-input"
              value={form.credits || 3}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, credits: Number(e.target.value) } }))}
            />
          </div>
          <div className="hub-form-field">
            <label className="hub-form-label">Target Semester</label>
            <select
              className="hub-form-select"
              value={form.semester || '1st Semester'}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, semester: e.target.value } }))}
            >
              <option value="1st Semester">1st Semester</option>
              <option value="2nd Semester">2nd Semester</option>
              <option value="Summer">Summer</option>
              <option value="Both">Both Semesters</option>
            </select>
          </div>
        </div>

        <div className="hub-form-field">
          <label className="hub-form-label">Offering Department(s)</label>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {availableDepts.map(dept => {
              const isSelected = (form.departments || []).includes(dept);
              return (
                <button
                  key={dept}
                  type="button"
                  className={`hub-dept-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setNestedEditing(prev => {
                      const cur = prev.form.departments || [];
                      const updated = cur.includes(dept) ? cur.filter(d => d !== dept) : [...cur, dept];
                      return { ...prev, form: { ...prev.form, departments: updated } };
                    });
                  }}
                  style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                >
                  {dept}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lec & Lab Split Toggle */}
        <label className={`hub-checkbox-card ${form.hasLecLab ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={Boolean(form.hasLecLab)}
            onChange={(e) => {
              const checked = e.target.checked;
              setNestedEditing(prev => ({
                ...prev,
                form: {
                  ...prev.form,
                  hasLecLab: checked,
                  requiredLab: checked ? (prev.form.requiredLab || !prev.form.isFoodLab) : prev.form.requiredLab
                }
              }));
            }}
            style={{ marginTop: '3px' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <strong style={{ fontSize: '0.84rem' }}>Lecture & Laboratory Split Course</strong>
              <span className="hub-tag-leclab">
                <FlaskConical size={10} />
                Splits into 2 Class Sessions
              </span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Directly guides scheduling AI to book separate classroom lecture and laboratory slots.
            </span>
          </div>
        </label>

        {form.hasLecLab ? (
          <div className="hub-form-grid-3">
            <div className="hub-form-field">
              <label className="hub-form-label">Lecture Hours/wk</label>
              <HoursPerMeetingSelect
                value={form.lectureHours || 2}
                onChange={val => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, lectureHours: Number(val) || 2 } }))}
                selectClassName="hub-form-select"
                inputClassName="hub-form-input"
              />
            </div>
            <div className="hub-form-field">
              <label className="hub-form-label">Lab Hours/wk</label>
              <HoursPerMeetingSelect
                value={form.labHours || 3}
                onChange={val => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, labHours: Number(val) || 3 } }))}
                selectClassName="hub-form-select"
                inputClassName="hub-form-input"
              />
            </div>
            <div className="hub-form-field">
              <label className="hub-form-label">Total Hours</label>
              <div style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.84rem', fontWeight: '700', color: '#7e22ce', display: 'flex', alignItems: 'center', height: '36px' }}>
                {Number(form.lectureHours || 2) + Number(form.labHours || 3)} hrs/wk
              </div>
            </div>
          </div>
        ) : (
          <div className="hub-form-grid-2">
            <div className="hub-form-field">
              <label className="hub-form-label">Hours Per Meeting</label>
              <HoursPerMeetingSelect
                value={form.hoursPerMeeting || 1.5}
                onChange={val => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, hoursPerMeeting: val } }))}
                selectClassName="hub-form-select"
                inputClassName="hub-form-input"
              />
            </div>
            <div className="hub-form-field">
              <label className="hub-form-label">Classroom Mode</label>
              <div className="hub-single-session-box">
                Single classroom session schedule
              </div>
            </div>
          </div>
        )}

        {/* Lab Room Type Requirements */}
        <div className="hub-form-grid-2">
          <label className={`hub-checkbox-card ${form.requiredLab ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={Boolean(form.requiredLab)}
              onChange={(e) => {
                const checked = e.target.checked;
                setNestedEditing(prev => ({
                  ...prev,
                  form: {
                    ...prev.form,
                    requiredLab: checked,
                    isFoodLab: checked ? false : prev.form.isFoodLab
                  }
                }));
              }}
              style={{ marginTop: '3px' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Monitor size={14} color="#059669" />
                <strong style={{ fontSize: '0.82rem' }}>Requires Computer Lab</strong>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assigned to rooms with PC workstations</span>
            </div>
          </label>

          <label className={`hub-checkbox-card ${form.isFoodLab ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={Boolean(form.isFoodLab)}
              onChange={(e) => {
                const checked = e.target.checked;
                setNestedEditing(prev => ({
                  ...prev,
                  form: {
                    ...prev.form,
                    isFoodLab: checked,
                    requiredLab: checked ? false : prev.form.requiredLab
                  }
                }));
              }}
              style={{ marginTop: '3px' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Utensils size={14} color="#d97706" />
                <strong style={{ fontSize: '0.82rem' }}>Requires Food Lab</strong>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assigned to culinary kitchen facilities</span>
            </div>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
          <button
            type="button"
            className="hub-nested-cancel-btn"
            onClick={() => setNestedEditing(null)}
            disabled={isSavingNested}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hub-nested-save-btn"
            onClick={handleSaveNested}
            disabled={isSavingNested}
          >
            {isSavingNested ? 'Saving...' : 'Save Subject Changes'}
          </button>
        </div>
      </div>
    );
  };

  const renderNestedFacultyEditor = (profId) => {
    if (!nestedEditing || nestedEditing.type !== 'faculty') return null;
    if (String(nestedEditing.id) !== String(profId) && String(nestedEditing.form?.id) !== String(profId)) return null;
    const { form } = nestedEditing;

    return (
      <div className="hub-nested-editor-card">
        <div className="hub-nested-editor-header">
          <span className="hub-nested-editor-title">
            <UserCheck size={14} />
            Configure Faculty: {form.firstName} {form.lastName}
          </span>
          <button
            type="button"
            onClick={() => setNestedEditing(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="hub-form-grid-2">
          <div className="hub-form-field">
            <label className="hub-form-label">First Name *</label>
            <input
              type="text"
              className="hub-form-input"
              value={form.firstName || ''}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, firstName: e.target.value } }))}
            />
          </div>
          <div className="hub-form-field">
            <label className="hub-form-label">Last Name *</label>
            <input
              type="text"
              className="hub-form-input"
              value={form.lastName || ''}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, lastName: e.target.value } }))}
            />
          </div>
        </div>

        <div className="hub-form-grid-2">
          <div className="hub-form-field">
            <label className="hub-form-label">Department *</label>
            <select
              className="hub-form-select"
              value={form.department || ''}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, department: e.target.value } }))}
            >
              {availableDepts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="hub-form-field">
            <label className="hub-form-label">Max Teaching Units (Weekly)</label>
            <input
              type="number"
              min={1}
              max={36}
              className="hub-form-input"
              value={form.maxUnits || 12}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, maxUnits: Number(e.target.value) } }))}
            />
          </div>
        </div>

        <div className="hub-form-field">
          <label className="hub-form-label">Preferred Rooms (Scheduling AI Guide)</label>
          <AutocompleteMultiSelect
            allOptions={rooms}
            options={rooms}
            selectedIds={form.preferredRooms || []}
            onToggle={(item) => {
              setNestedEditing(prev => ({
                ...prev,
                form: {
                  ...prev.form,
                  preferredRooms: toggleMultiList(
                    prev.form.preferredRooms,
                    item,
                    getRoomMatchTokens,
                    (r) => (typeof r === 'object' && r !== null ? (r.id || r.name) : r)
                  )
                }
              }));
            }}
            onBatchSelect={(items) => {
              setNestedEditing(prev => ({
                ...prev,
                form: {
                  ...prev.form,
                  preferredRooms: batchSelectMultiList(
                    prev.form.preferredRooms,
                    items,
                    getRoomMatchTokens,
                    (r) => (typeof r === 'object' && r !== null ? (r.id || r.name) : r)
                  )
                }
              }));
            }}
            onBatchDeselect={(items) => {
              setNestedEditing(prev => ({
                ...prev,
                form: {
                  ...prev.form,
                  preferredRooms: batchDeselectMultiList(prev.form.preferredRooms, items, getRoomMatchTokens)
                }
              }));
            }}
            renderChip={renderRoomChip}
            renderOption={renderRoomOption}
            placeholder="Select preferred rooms..."
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
          <button
            type="button"
            className="hub-nested-cancel-btn"
            onClick={() => setNestedEditing(null)}
            disabled={isSavingNested}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hub-nested-save-btn"
            onClick={handleSaveNested}
            disabled={isSavingNested}
          >
            {isSavingNested ? 'Saving...' : 'Save Faculty Changes'}
          </button>
        </div>
      </div>
    );
  };

  const renderNestedSectionEditor = (secId) => {
    if (!nestedEditing || nestedEditing.type !== 'section') return null;
    if (String(nestedEditing.id) !== String(secId) && String(nestedEditing.form?.id) !== String(secId)) return null;
    const { form } = nestedEditing;

    return (
      <div className="hub-nested-editor-card">
        <div className="hub-nested-editor-header">
          <span className="hub-nested-editor-title">
            <Layers size={14} />
            Configure Section: {form.name}
          </span>
          <button
            type="button"
            onClick={() => setNestedEditing(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="hub-form-grid-3">
          <div className="hub-form-field">
            <label className="hub-form-label">Section Name *</label>
            <input
              type="text"
              className="hub-form-input"
              value={form.name || ''}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, name: e.target.value } }))}
            />
          </div>
          <div className="hub-form-field">
            <label className="hub-form-label">Program *</label>
            <select
              className="hub-form-select"
              value={form.program || ''}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, program: e.target.value } }))}
            >
              {availablePrograms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="hub-form-field">
            <label className="hub-form-label">Year Level *</label>
            <select
              className="hub-form-select"
              value={form.yearLevel || 1}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, yearLevel: Number(e.target.value) } }))}
            >
              <option value={1}>1st Year</option>
              <option value={2}>2nd Year</option>
              <option value={3}>3rd Year</option>
              <option value={4}>4th Year</option>
              <option value={5}>5th Year</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
          <button
            type="button"
            className="hub-nested-cancel-btn"
            onClick={() => setNestedEditing(null)}
            disabled={isSavingNested}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hub-nested-save-btn"
            onClick={handleSaveNested}
            disabled={isSavingNested}
          >
            {isSavingNested ? 'Saving...' : 'Save Section Changes'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="assignment-hub-container">
      {/* Top Header & Executive Control Dock */}
      <div className="hub-main-header">
        {/* Header Top: Title & Actions */}
        <div className="hub-header-top">
          <div className="hub-header-branding">
            {onBack && (
              <button type="button" className="hub-back-btn" onClick={onBack}>
                <ArrowLeft size={15} />
                Back
              </button>
            )}
            <div className="hub-header-title-group">
              <h2 className="hub-header-title">
                <span className="hub-header-icon-badge">
                  <ArrowRightLeft size={18} />
                </span>
                Teaching Load Management
              </h2>
              <p className="hub-header-desc">
                Integrated coordinator for Section, Subject, and Faculty relationships
              </p>
            </div>
          </div>

          <div className="hub-header-actions">
            {stats.sectionsNeedingTeachers > 0 && (
              <button
                type="button"
                className="hub-btn-automatch"
                onClick={handleAutoMatchAllSections}
                title="Automatically assign specialized faculty to all unassigned subjects"
              >
                <Sparkles size={15} />
                <span>Auto-Match Teachers</span>
                <span className="hub-btn-badge">{stats.sectionsNeedingTeachers}</span>
              </button>
            )}

            <div className="hub-quick-add-group">
              <button
                type="button"
                className="hub-quick-add-btn"
                onClick={() => setQuickCreateState({ isOpen: true, type: 'section' })}
                title="Quick Add Section"
              >
                <Plus size={14} /> Section
              </button>
              <button
                type="button"
                className="hub-quick-add-btn"
                onClick={() => setQuickCreateState({ isOpen: true, type: 'subject' })}
                title="Quick Add Subject"
              >
                <Plus size={14} /> Subject
              </button>
              <button
                type="button"
                className="hub-quick-add-btn"
                onClick={() => setQuickCreateState({ isOpen: true, type: 'faculty' })}
                title="Quick Add Faculty"
              >
                <Plus size={14} /> Faculty
              </button>
            </div>
          </div>
        </div>

        {/* Executive KPI Metrics Grid */}
        <div className="hub-metrics-grid">
          <div className="hub-metric-card">
            <div className="hub-metric-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
              <Building2 size={20} />
            </div>
            <div className="hub-metric-content">
              <div className="hub-metric-value">{stats.totalSections}</div>
              <div className="hub-metric-label">Total Sections</div>
            </div>
          </div>

          <div className="hub-metric-card">
            <div className="hub-metric-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
              <BookOpen size={20} />
            </div>
            <div className="hub-metric-content">
              <div className="hub-metric-value">{stats.totalEnrolledLinks}</div>
              <div className="hub-metric-label">Enrolled Subjects</div>
            </div>
          </div>

          <div className="hub-metric-card">
            <div className="hub-metric-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
              <Users size={20} />
            </div>
            <div className="hub-metric-content">
              <div className="hub-metric-value">{stats.totalAssignedLinks}</div>
              <div className="hub-metric-label">Assigned Teachers</div>
            </div>
          </div>

          <div className="hub-metric-card">
            <div className="hub-metric-icon" style={{ background: 'rgba(147, 51, 234, 0.1)', color: '#7e22ce' }}>
              <FlaskConical size={20} />
            </div>
            <div className="hub-metric-content">
              <div className="hub-metric-value" style={{ color: '#7e22ce' }}>{stats.totalLecLabSubjects}</div>
              <div className="hub-metric-label">Lec & Lab Subjects</div>
            </div>
          </div>

          <div className={`hub-metric-card ${stats.sectionsNeedingTeachers > 0 ? 'needs-attention' : 'all-good'}`}>
            <div className="hub-metric-icon" style={{
              background: stats.sectionsNeedingTeachers > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              color: stats.sectionsNeedingTeachers > 0 ? '#dc2626' : '#059669'
            }}>
              {stats.sectionsNeedingTeachers > 0 ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            </div>
            <div className="hub-metric-content">
              <div className="hub-metric-value" style={{ color: stats.sectionsNeedingTeachers > 0 ? '#dc2626' : '#059669' }}>
                {stats.sectionsNeedingTeachers}
              </div>
              <div className="hub-metric-label">
                {stats.sectionsNeedingTeachers > 0 ? 'Sections Need Attention' : 'All Sections Assigned'}
              </div>
            </div>
          </div>
        </div>

        {/* Unified Control Bar: Tabs, Filters, Search */}
        <div className="hub-control-bar">
          <div className="hub-control-top">
            <div className="hub-tabs">
              <button
                type="button"
                className={`hub-tab-btn ${viewMode === 'sections' ? 'active' : ''}`}
                onClick={() => setViewMode('sections')}
              >
                <Building2 size={15} />
                <span>By Section</span>
                <span className="hub-tab-count">{filteredSections.length}</span>
              </button>
              <button
                type="button"
                className={`hub-tab-btn ${viewMode === 'faculty' ? 'active' : ''}`}
                onClick={() => setViewMode('faculty')}
              >
                <Users size={15} />
                <span>By Faculty</span>
                <span className="hub-tab-count">{filteredFaculty.length}</span>
              </button>
              <button
                type="button"
                className={`hub-tab-btn ${viewMode === 'subjects' ? 'active' : ''}`}
                onClick={() => setViewMode('subjects')}
              >
                <BookOpen size={15} />
                <span>By Subject</span>
                <span className="hub-tab-count">{filteredSubjects.length}</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`hub-leclab-filter-btn ${onlyLecLab ? 'active' : ''}`}
                onClick={() => setOnlyLecLab(!onlyLecLab)}
                title="Filter sections and subjects with both Lecture and Laboratory components"
              >
                <FlaskConical size={14} />
                <span>Lec & Lab</span>
                {stats.totalLecLabSubjects > 0 && (
                  <span className="hub-leclab-count-badge">{stats.totalLecLabSubjects}</span>
                )}
              </button>

              <button
                type="button"
                className={`hub-attention-filter-btn ${onlyNeedsAttention ? 'active' : ''}`}
                onClick={() => setOnlyNeedsAttention(!onlyNeedsAttention)}
              >
                <span className="hub-attention-dot"></span>
                <span>Needs Attention Only</span>
                {stats.sectionsNeedingTeachers > 0 && (
                  <span className="hub-attention-badge">{stats.sectionsNeedingTeachers}</span>
                )}
              </button>
            </div>
          </div>

          <div className="hub-control-bottom">
            <div className="hub-dept-filters">
              <span className="hub-filter-caption">Department:</span>
              <div className="hub-dept-pills">
                {['All', ...(departments.length > 0 ? departments.map(d => d.id) : DEPARTMENTS)].map(dept => {
                  const deptColor = departments.find(d => d.id === dept)?.color || getDeptColor(dept);
                  const isActive = departmentFilter === dept;
                  return (
                    <button
                      key={dept}
                      type="button"
                      className={`hub-dept-pill ${isActive ? 'active' : ''}`}
                      onClick={() => setDepartmentFilter(dept)}
                      style={isActive ? { background: deptColor, borderColor: deptColor, color: '#fff' } : undefined}
                    >
                      {dept}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hub-search-box">
              <Search size={15} className="hub-search-icon" />
              <input
                type="text"
                className="hub-search-input"
                placeholder={`Search ${viewMode}...`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" className="hub-search-clear" onClick={() => setSearchQuery('')} title="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- PERSPECTIVE VIEW 1: BY SECTION --- */}
      {viewMode === 'sections' && (
        <>
          <div className="hub-cards-grid">
            {displayedSections.length === 0 ? (
              <div className="hub-empty-state-card">
                <div className="hub-empty-state-icon">
                  <Building2 size={24} />
                </div>
                <h4 className="hub-empty-state-title">No sections found</h4>
                <p className="hub-empty-state-desc">
                  No sections match your current filters. Try resetting your search query or department filter.
                </p>
                {(searchQuery || departmentFilter !== 'All' || onlyNeedsAttention || onlyLecLab) && (
                  <button
                    type="button"
                    className="hub-quick-btn"
                    onClick={() => {
                      setSearchQuery('');
                      setDepartmentFilter('All');
                      setOnlyNeedsAttention(false);
                      setOnlyLecLab(false);
                    }}
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            ) : (
              displayedSections.map(sec => {
                const enrolled = sec.subjects || [];
                const missingCount = enrolled.filter(subRef => !getAssignedProf(sec, subRef)).length;

                return (
                  <div key={sec.id} className="hub-entity-card">
                    <div className="hub-entity-header">
                      <div className="hub-entity-title">
                        <strong className="hub-entity-name">{sec.name}</strong>
                        <span className="hub-entity-badge" style={{ background: 'rgba(86, 69, 238, 0.1)', color: 'var(--accent-primary)' }}>
                          {sec.program} • Y{sec.yearLevel}
                        </span>
                        <span className="hub-badge-credits" style={{ background: 'rgba(86, 69, 238, 0.08)', color: 'var(--accent-primary)' }}>
                          {enrolled.length} Subject{enrolled.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {missingCount > 0 ? (
                          <>
                            <span className="hub-alert-chip">
                              <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                              {missingCount} unassigned
                            </span>
                            <button
                              className="hub-quick-btn"
                              style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                              onClick={() => handleAutoMatchSectionTeachers(sec)}
                              title="Automatically assign specialized faculty to unassigned subjects"
                            >
                              <Sparkles size={12} /> Auto-Match
                            </button>
                          </>
                        ) : enrolled.length > 0 ? (
                          <span className="hub-success-chip">
                            <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                            Fully Assigned
                          </span>
                        ) : (
                          <span className="hub-alert-chip">No subjects enrolled</span>
                        )}
                        <button
                          className="hub-quick-btn"
                          onClick={() => handleOpenEditModal('section', sec)}
                        >
                          <Settings2 size={13} />
                          Configure
                        </button>
                      </div>
                    </div>

                    {/* Enrolled Subjects List with Inline Teacher Selector */}
                    <div className="hub-mappings-list">
                      {enrolled.length === 0 ? (
                        <div className="hub-empty-section-notice">
                          <BookOpen size={16} />
                          <span>No subjects enrolled for this section yet. Click "Configure" to enroll subjects.</span>
                        </div>
                      ) : (
                        enrolled.map(subRef => {
                          const foundSub = getSubject(subRef);
                          const sub = foundSub || { id: subRef, code: subRef, name: subRef };
                          const isOrphan = !foundSub;
                          const assignedProf = getAssignedProf(sec, subRef);

                          return (
                            <div
                              key={subRef}
                              className={`hub-section-subject-row ${isOrphan ? 'is-orphan' : ''}`}
                            >
                              {/* Top Line: Subject Code, Badges & Quick Action Controls */}
                              <div className="hub-subject-row-header">
                                <div className="hub-subject-badge-group">
                                  <span
                                    className="hub-subject-code"
                                    style={{
                                      color: isOrphan ? '#dc2626' : 'var(--accent-dark)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    {isOrphan && <AlertTriangle size={12} style={{ flexShrink: 0 }} />}
                                    {sub.code}
                                  </span>
                                  {sub.hasLecLab && (
                                    <span className="hub-tag-leclab" title="Requires separate Lecture and Laboratory sessions">
                                      <FlaskConical size={10} />
                                      Lec & Lab
                                    </span>
                                  )}
                                  {sub.credits && (
                                    <span className="hub-badge-credits">{sub.credits}u</span>
                                  )}
                                </div>

                                <div className="hub-subject-row-actions">
                                  {!isOrphan && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditModal('subject', sub)}
                                      className="hub-micro-action-btn"
                                      title={`Configure subject ${sub.code} (Lec/Lab, Computer Lab, Food Lab, etc.)`}
                                    >
                                      <Sliders size={11} />
                                      <span>Edit Subj</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSubjectFromSectionInline(sec, subRef)}
                                    className="hub-micro-delete-btn"
                                    title={isOrphan ? `Remove orphan ${subRef} from section` : `Unenroll ${sub.code} from section`}
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Subject Title */}
                              <div
                                className="hub-subject-title-line"
                                style={isOrphan ? { color: '#b91c1c' } : undefined}
                                title={sub.name}
                              >
                                {isOrphan ? 'Legacy / Unmatched ID' : sub.name}
                              </div>

                              {/* Lec/Lab Breakdown if applicable */}
                              {sub.hasLecLab && (
                                <div className="hub-leclab-hours-strip">
                                  <span>Lec: {sub.lectureHours || 2}h</span>
                                  <span className="hub-leclab-divider">•</span>
                                  <span>Lab: {sub.labHours || 3}h ({sub.isFoodLab ? 'Food Lab' : sub.requiredLab ? 'Comp Lab' : 'Lab Required'})</span>
                                </div>
                              )}

                              {/* Dedicated Full-Width Faculty Assignment Bar - Maximum Legibility */}
                              {!isOrphan && (
                                <div className="hub-instructor-bar">
                                  <div className="hub-instructor-select-wrapper">
                                    <InlineInstructorSelect
                                      section={sec}
                                      subRef={subRef}
                                      assignedProf={assignedProf}
                                      onAssign={handleAssignInstructorInline}
                                      getSubjectProfessors={getSubjectProfessors}
                                    />
                                  </div>
                                  {assignedProf && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditModal('faculty', assignedProf)}
                                      className="hub-micro-action-btn hub-prof-action-btn"
                                      title={`Configure faculty ${assignedProf.name} (Max units, preferred rooms)`}
                                    >
                                      <UserCheck size={11} />
                                      <span>Prof</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div ref={sentinelRef} style={{ height: '1px' }} />
          {filteredSections.length > visibleLimit && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <button
                type="button"
                className="hub-quick-btn"
                onClick={() => setVisibleLimit(prev => prev + 12)}
                style={{ padding: '8px 20px', fontSize: '0.82rem', fontWeight: '700' }}
              >
                Load More Sections ({filteredSections.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {/* --- PERSPECTIVE VIEW 2: BY FACULTY --- */}
      {viewMode === 'faculty' && (
        <>
          <div className="hub-cards-grid">
            {displayedFaculty.length === 0 ? (
              <div className="hub-empty-state-card">
                <div className="hub-empty-state-icon">
                  <Users size={24} />
                </div>
                <h4 className="hub-empty-state-title">No faculty found</h4>
                <p className="hub-empty-state-desc">
                  No faculty members match your current filters. Try resetting your search query or department filter.
                </p>
                {(searchQuery || departmentFilter !== 'All' || onlyNeedsAttention || onlyLecLab) && (
                  <button
                    type="button"
                    className="hub-quick-btn"
                    onClick={() => {
                      setSearchQuery('');
                      setDepartmentFilter('All');
                      setOnlyNeedsAttention(false);
                      setOnlyLecLab(false);
                    }}
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            ) : (
              displayedFaculty.map(prof => {
                const assignedSecs = prof.assignedSections || [];
                const specSubjects = prof.specialization || [];

                return (
                  <div key={prof.id} className="hub-entity-card">
                    <div className="hub-entity-header">
                      <div className="hub-entity-title">
                        <strong className="hub-entity-name">{prof.name || `${prof.lastName}, ${prof.firstName}`}</strong>
                        <span className="hub-entity-badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                          {prof.department}
                        </span>
                        {prof.maxUnits && (
                          <span className="hub-badge-credits" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#059669' }}>
                            Max {prof.maxUnits}u
                          </span>
                        )}
                      </div>

                      <button
                        className="hub-quick-btn"
                        onClick={() => handleOpenEditModal('faculty', prof)}
                      >
                        <Settings2 size={13} />
                        Configure
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Specialization Subjects */}
                      <div>
                        <span className="hub-card-section-label">Specialization Subjects ({specSubjects.length}):</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                          {specSubjects.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>None assigned</span>
                          ) : (
                            specSubjects.map(subRef => {
                              const sub = getSubject(subRef) || { code: subRef };
                              return (
                                <span
                                  key={subRef}
                                  onClick={() => handleOpenEditModal('subject', sub)}
                                  style={{
                                    fontSize: '0.73rem',
                                    fontWeight: '600',
                                    padding: '3px 10px',
                                    borderRadius: '14px',
                                    background: 'rgba(86, 69, 238, 0.08)',
                                    border: '1px solid rgba(86, 69, 238, 0.15)',
                                    color: 'var(--accent-primary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    cursor: 'pointer'
                                  }}
                                  title={sub.name ? `${sub.code} — ${sub.name}` : `Configure subject ${sub.code}`}
                                >
                                  <span>{sub.code}</span>
                                  {sub.hasLecLab && (
                                    <span style={{ fontSize: '0.6rem', background: 'rgba(147, 51, 234, 0.12)', color: '#7e22ce', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>
                                      Lec+Lab
                                    </span>
                                  )}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Assigned Sections and specific subjects taught */}
                      <div>
                        <span className="hub-card-section-label">Assigned Sections ({assignedSecs.length}):</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                          {assignedSecs.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>No sections assigned</span>
                          ) : (
                            assignedSecs.map(secId => {
                              const sec = sectionMap.get(String(secId).toLowerCase()) || { id: secId, name: secId };
                              const actuallyTaughtSubjects = (sec.subjects || []).filter(subRef => {
                                const assigned = getAssignedProf(sec, subRef);
                                return assigned && assigned.id === prof.id;
                              });

                              return (
                                <div key={sec.id} style={{
                                  padding: '8px 12px',
                                  background: 'var(--bg-main)',
                                  borderRadius: '8px',
                                  border: '1px solid var(--border-color)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                  fontSize: '0.78rem'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                    <span style={{ fontWeight: '700', color: 'var(--accent-dark)', whiteSpace: 'nowrap' }}>{sec.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditModal('section', sec)}
                                      className="hub-micro-action-btn"
                                      style={{ padding: '1px 6px', fontSize: '0.66rem' }}
                                      title={`Configure section ${sec.name}`}
                                    >
                                      <Layers size={10} /> Edit
                                    </button>
                                  </div>
                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {actuallyTaughtSubjects.length > 0 ? (
                                      actuallyTaughtSubjects.map(mRef => {
                                        const mSub = getSubject(mRef) || { code: mRef };
                                        return (
                                          <span
                                            key={mRef}
                                            onClick={() => handleOpenEditModal('subject', mSub)}
                                            style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '5px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: 'pointer', border: '1px solid rgba(16, 185, 129, 0.15)' }}
                                            title={mSub.name ? `${mSub.code} — ${mSub.name}` : `Configure subject ${mSub.code || mRef}`}
                                          >
                                            <span>{mSub?.code || mRef}</span>
                                            {mSub?.hasLecLab && (
                                              <span style={{ fontSize: '0.6rem', color: '#047857', opacity: 0.85 }}>(L+L)</span>
                                            )}
                                          </span>
                                        );
                                      })
                                    ) : (
                                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>General faculty</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div ref={sentinelRef} style={{ height: '1px' }} />
          {filteredFaculty.length > visibleLimit && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <button
                type="button"
                className="hub-quick-btn"
                onClick={() => setVisibleLimit(prev => prev + 12)}
                style={{ padding: '8px 20px', fontSize: '0.82rem', fontWeight: '700' }}
              >
                Load More Faculty ({filteredFaculty.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {/* --- PERSPECTIVE VIEW 3: BY SUBJECT --- */}
      {viewMode === 'subjects' && (
        <>
          <div className="hub-cards-grid">
            {displayedSubjects.length === 0 ? (
              <div className="hub-empty-state-card">
                <div className="hub-empty-state-icon">
                  <BookOpen size={24} />
                </div>
                <h4 className="hub-empty-state-title">No subjects found</h4>
                <p className="hub-empty-state-desc">
                  No subjects match your current filters. Try resetting your search query or department filter.
                </p>
                {(searchQuery || departmentFilter !== 'All' || onlyNeedsAttention || onlyLecLab) && (
                  <button
                    type="button"
                    className="hub-quick-btn"
                    onClick={() => {
                      setSearchQuery('');
                      setDepartmentFilter('All');
                      setOnlyNeedsAttention(false);
                      setOnlyLecLab(false);
                    }}
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            ) : (
              displayedSubjects.map(sub => {
                const enrolledSecs = getSectionsForSubject(sub);
                const { specProfs: qualifiedProfs } = getSubjectProfessors(sub);
                const subDepts = (sub.departments || (sub.department ? [sub.department] : []));

                return (
                  <div key={sub.id} className="hub-entity-card">
                    <div className="hub-entity-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
                      <div className="hub-entity-title" style={{ flexWrap: 'wrap', gap: '8px' }}>
                        <strong className="hub-entity-name">{sub.code}</strong>
                        <span className="hub-entity-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
                          {sub.credits} Units • {sub.category}
                        </span>
                        {sub.hasLecLab && (
                          <span className="hub-tag-leclab">
                            <FlaskConical size={10} />
                            Lec & Lab
                          </span>
                        )}
                        {subDepts.length > 0 && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', padding: '2px 7px', borderRadius: '4px', background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
                            {subDepts.join(', ')}
                          </span>
                        )}
                      </div>

                      <button
                        className="hub-quick-btn"
                        onClick={() => handleOpenEditModal('subject', sub)}
                      >
                        <Settings2 size={13} />
                        Configure
                      </button>
                    </div>

                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {sub.name}
                    </div>

                    {sub.hasLecLab ? (
                      <div className="hub-subject-leclab-banner">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '0.76rem' }}>
                          <span><strong>Lecture:</strong> {sub.lectureHours || 2} hrs/wk</span>
                          <span className="hub-leclab-divider">•</span>
                          <span><strong>Lab:</strong> {sub.labHours || 3} hrs/wk ({sub.isFoodLab ? 'Food Lab' : sub.requiredLab ? 'Computer Lab' : 'Lab Required'})</span>
                          <span className="hub-leclab-divider">•</span>
                          <span style={{ color: '#7e22ce', fontWeight: '700' }}>Total: {Number(sub.lectureHours || 2) + Number(sub.labHours || 3)} hrs/wk</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={12} />
                        {sub.hoursPerMeeting || 1.5} hrs/meeting • {sub.requiredLab ? 'Requires Computer Lab' : sub.isFoodLab ? 'Requires Food Lab' : 'Standard Classroom'}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Enrolled Sections & Assigned Instructors */}
                      <div>
                        <span className="hub-card-section-label">
                          Enrolled Sections ({enrolledSecs.length}):
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                          {enrolledSecs.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>No sections enrolled</span>
                          ) : (
                            enrolledSecs.map(sec => {
                              const assignedProf = getAssignedProf(sec, sub.code || sub.id);
                              return (
                                <span
                                  key={sec.id}
                                  onClick={() => handleOpenEditModal('section', sec)}
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: '600',
                                    padding: '3px 10px',
                                    borderRadius: '14px',
                                    background: assignedProf ? 'rgba(86, 69, 238, 0.08)' : 'rgba(239, 68, 68, 0.06)',
                                    color: assignedProf ? 'var(--accent-primary)' : '#dc2626',
                                    border: assignedProf ? '1px solid rgba(86, 69, 238, 0.18)' : '1px solid rgba(239, 68, 68, 0.2)',
                                    cursor: 'pointer'
                                  }}
                                  title={assignedProf ? `Taught by ${assignedProf.name}` : `Needs instructor — click to configure section ${sec.name}`}
                                >
                                  {sec.name} {assignedProf ? `(${assignedProf.name?.split(',')[0] || assignedProf.lastName || ''})` : '— Unassigned'}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Qualified Faculty */}
                      <div>
                        <span className="hub-card-section-label">
                          Specialized Faculty ({qualifiedProfs.length}):
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                          {qualifiedProfs.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#ef4444' }}>No faculty specialized</span>
                          ) : (
                            qualifiedProfs.map(prof => (
                              <span
                                key={prof.id}
                                onClick={() => handleOpenEditModal('faculty', prof)}
                                style={{ fontSize: '0.72rem', fontWeight: '600', padding: '3px 10px', borderRadius: '14px', background: 'rgba(59, 130, 246, 0.08)', color: '#2563eb', cursor: 'pointer', border: '1px solid rgba(59, 130, 246, 0.15)' }}
                                title={`Configure faculty ${prof.name}`}
                              >
                                {prof.name || `${prof.lastName}, ${prof.firstName}`}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div ref={sentinelRef} style={{ height: '1px' }} />
          {filteredSubjects.length > visibleLimit && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <button
                type="button"
                className="hub-quick-btn"
                onClick={() => setVisibleLimit(prev => prev + 12)}
                style={{ padding: '8px 20px', fontSize: '0.82rem', fontWeight: '700' }}
              >
                Load More Subjects ({filteredSubjects.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {/* --- IN-DEPTH CONFIGURATION MODAL --- */}
      {editingEntity && ReactDOM.createPortal(
        <div className="hub-modal-overlay">
          <div className="hub-modal-content" onClick={e => e.stopPropagation()}>
            <div className="hub-modal-header">
              <div>
                <h3 className="hub-modal-title">
                  Configure {editingEntity.type === 'section'
                    ? `Section: ${stagedEntityForm.name || editingEntity.item.name}`
                    : editingEntity.type === 'faculty'
                    ? `Faculty: ${stagedEntityForm.firstName ? `${stagedEntityForm.lastName}, ${stagedEntityForm.firstName}` : editingEntity.item.name}`
                    : `Subject: ${stagedEntityForm.code || editingEntity.item.code}`}
                </h3>
                <span className="hub-modal-subtitle">
                  Manage parameters, relations, and room preferences connected to the AI scheduling engine.
                </span>
              </div>
              <button
                type="button"
                className="hub-modal-close-btn"
                onClick={() => !isSaving && setEditingEntity(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error Banner */}
            {modalError && (
              <div className="hub-modal-error">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            {/* ========================================================================= */}
            {/* SECTION EDITING FORM */}
            {/* ========================================================================= */}
            {editingEntity.type === 'section' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Card 1: Section Profile */}
                <div className="hub-modal-section-card">
                  <div className="hub-modal-section-header">
                    <span className="hub-modal-section-title">
                      <Layers size={16} color="var(--accent-primary)" />
                      Section Details & Academic Level
                    </span>
                  </div>
                  <div className="hub-form-grid-3">
                    <div className="hub-form-field">
                      <label className="hub-form-label">Section Name *</label>
                      <input
                        type="text"
                        className="hub-form-input"
                        value={stagedEntityForm.name || ''}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. BSCS 3A"
                      />
                    </div>
                    <div className="hub-form-field">
                      <label className="hub-form-label">Academic Program *</label>
                      <select
                        className="hub-form-select"
                        value={stagedEntityForm.program || ''}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, program: e.target.value }))}
                      >
                        {availablePrograms.map(prog => (
                          <option key={prog} value={prog}>{prog}</option>
                        ))}
                      </select>
                    </div>
                    <div className="hub-form-field">
                      <label className="hub-form-label">Year Level *</label>
                      <select
                        className="hub-form-select"
                        value={stagedEntityForm.yearLevel || 1}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, yearLevel: Number(e.target.value) }))}
                      >
                        <option value={1}>1st Year</option>
                        <option value={2}>2nd Year</option>
                        <option value={3}>3rd Year</option>
                        <option value={4}>4th Year</option>
                        <option value={5}>5th Year</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Card 2: Enrolled Subjects & Teacher Assignments */}
                <div className="hub-modal-section-card">
                  <div className="hub-modal-section-header">
                    <span className="hub-modal-section-title">
                      <BookOpen size={16} color="var(--accent-primary)" />
                      Curriculum Enrollment ({stagedAssignedSubjects.length} Subjects)
                    </span>
                    {stagedAssignedSubjects.length > 0 && (
                      <button
                        type="button"
                        onClick={handleAutoAssignStagedTeachers}
                        className="hub-quick-btn"
                        style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#059669', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                      >
                        <Sparkles size={13} /> Auto-Assign Teachers
                      </button>
                    )}
                  </div>

                  <div className="hub-form-field">
                    <label className="hub-form-label">Enrolled Subjects</label>
                    <AutocompleteMultiSelect
                      allOptions={subjects}
                      options={subjects}
                      selectedIds={stagedAssignedSubjects}
                      onToggle={(item) => {
                        const tokens = getSubjectMatchTokens(item);
                        const isCurrentlySelected = stagedAssignedSubjects.some(x => tokens.has(normToken(x)));
                        setStagedAssignedSubjects(prev =>
                          toggleMultiList(prev, item, getSubjectMatchTokens, (it) => (typeof it === 'object' && it !== null ? it.id : it))
                        );
                        if (isCurrentlySelected) {
                          setStagedFacultyMap(prev => pruneSectionInstructorKeys(prev, [item]));
                        }
                      }}
                      onBatchSelect={(items) => {
                        setStagedAssignedSubjects(prev =>
                          batchSelectMultiList(prev, items, getSubjectMatchTokens, (it) => (typeof it === 'object' && it !== null ? it.id : it))
                        );
                      }}
                      onBatchDeselect={(items) => {
                        setStagedAssignedSubjects(prev => batchDeselectMultiList(prev, items, getSubjectMatchTokens));
                        setStagedFacultyMap(prev => pruneSectionInstructorKeys(prev, items));
                      }}
                      renderChip={renderSubjectChip}
                      renderOption={renderSubjectOption}
                      placeholder="Search subject code or name..."
                      matchIdOnly={true}
                    />
                  </div>

                  {stagedAssignedSubjects.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                      <label className="hub-form-label">Assigned Instructor per Subject</label>
                      {stagedAssignedSubjects.map(subRef => {
                        const sub = getSubject(subRef) || { id: subRef, code: subRef, name: subRef };
                        const subKey = sub.id || sub.code;
                        const curProfId = stagedFacultyMap[subKey] ||
                                          stagedFacultyMap[subRef] ||
                                          (sub.code && stagedFacultyMap[sub.code]) ||
                                          (sub.name && stagedFacultyMap[sub.name]) ||
                                          '';

                        const isEditingThisSub = nestedEditing?.type === 'subject' && (String(nestedEditing?.id) === String(subKey) || String(nestedEditing?.id) === String(sub.id));
                        const isEditingThisProf = nestedEditing?.type === 'faculty' && String(nestedEditing?.id) === String(curProfId);

                        return (
                          <div key={subRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div className="hub-mapping-row">
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span className="hub-subject-code">{sub.code}</span>
                                  {sub.hasLecLab && (
                                    <span className="hub-tag-leclab">
                                      <FlaskConical size={10} />
                                      Lec & Lab
                                    </span>
                                  )}
                                  {sub.credits && (
                                    <span className="hub-badge-credits">
                                      {sub.credits}u
                                    </span>
                                  )}
                                </div>
                                <span className="hub-subject-name">
                                  {sub.name}
                                </span>

                                {/* Quick Lab & Room Toggles right in the section field! */}
                                <div className="hub-quick-toggles-bar" style={{ marginTop: '4px' }}>
                                  <button
                                    type="button"
                                    className={`hub-inline-toggle-btn ${sub.hasLecLab ? 'active-leclab' : ''}`}
                                    onClick={() => handleQuickToggleSubjectLab(subRef, 'leclab')}
                                    title="Click to toggle Lecture & Laboratory split"
                                  >
                                    <FlaskConical size={10} />
                                    {sub.hasLecLab ? 'Lec & Lab' : 'Single Session'}
                                  </button>
                                  <button
                                    type="button"
                                    className={`hub-inline-toggle-btn ${sub.requiredLab ? 'active-comp' : ''}`}
                                    onClick={() => handleQuickToggleSubjectLab(subRef, 'complab')}
                                    title="Click to toggle Computer Lab requirement"
                                  >
                                    <Monitor size={10} />
                                    Comp Lab
                                  </button>
                                  <button
                                    type="button"
                                    className={`hub-inline-toggle-btn ${sub.isFoodLab ? 'active-food' : ''}`}
                                    onClick={() => handleQuickToggleSubjectLab(subRef, 'foodlab')}
                                    title="Click to toggle Food Lab requirement"
                                  >
                                    <Utensils size={10} />
                                    Food Lab
                                  </button>
                                  {sub.hasLecLab && (
                                    <span className="hub-leclab-note">
                                      (Lec: {sub.lectureHours || 2}h | Lab: {sub.labHours || 3}h)
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <ModalSubjectInstructorSelect
                                  subRef={subRef}
                                  value={curProfId}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setStagedFacultyMap(prev => {
                                      const next = { ...prev };
                                      [subKey, sub.id, sub.code, subRef].filter(Boolean).forEach(k => {
                                        if (val) next[k] = val;
                                        else delete next[k];
                                      });
                                      return next;
                                    });
                                  }}
                                  getSubjectProfessors={getSubjectProfessors}
                                />

                                <div className="hub-inline-btn-group">
                                  <button
                                    type="button"
                                    className={`hub-micro-action-btn ${isEditingThisSub ? 'active' : ''}`}
                                    onClick={() => handleToggleNestedSubject(subKey)}
                                    title="Configure this subject directly (Title, Credits, Hours, Room Type)"
                                  >
                                    <Sliders size={12} />
                                    Edit Subj
                                    {isEditingThisSub ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                  </button>
                                  {curProfId && (
                                    <button
                                      type="button"
                                      className={`hub-micro-action-btn ${isEditingThisProf ? 'active' : ''}`}
                                      onClick={() => handleToggleNestedFaculty(curProfId)}
                                      title="Configure assigned faculty (Max units, Preferred rooms)"
                                    >
                                      <UserCheck size={12} />
                                      Prof
                                      {isEditingThisProf ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="hub-micro-action-btn delete-btn"
                                    onClick={() => {
                                      const tokensToRemove = getSubjectMatchTokens(subRef);
                                      setStagedAssignedSubjects(prev => prev.filter(x => !tokensToRemove.has(normToken(x))));
                                      setStagedFacultyMap(prev => pruneSectionInstructorKeys(prev, [subRef]));
                                    }}
                                    title="Remove this subject from section"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Render Inline Sub-Form for this Subject or Professor right inside the Section field! */}
                            {renderNestedSubjectEditor(subKey)}
                            {curProfId && renderNestedFacultyEditor(curProfId)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* FACULTY EDITING FORM */}
            {/* ========================================================================= */}
            {editingEntity.type === 'faculty' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Card 1: Faculty Identification & Load */}
                <div className="hub-modal-section-card">
                  <div className="hub-modal-section-header">
                    <span className="hub-modal-section-title">
                      <UserCheck size={16} color="var(--accent-primary)" />
                      Faculty Profile & Workload Limits
                    </span>
                  </div>
                  <div className="hub-form-grid-2">
                    <div className="hub-form-field">
                      <label className="hub-form-label">First Name *</label>
                      <input
                        type="text"
                        className="hub-form-input"
                        value={stagedEntityForm.firstName || ''}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, firstName: e.target.value }))}
                      />
                    </div>
                    <div className="hub-form-field">
                      <label className="hub-form-label">Last Name *</label>
                      <input
                        type="text"
                        className="hub-form-input"
                        value={stagedEntityForm.lastName || ''}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, lastName: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="hub-form-grid-2">
                    <div className="hub-form-field">
                      <label className="hub-form-label">Primary Department *</label>
                      <select
                        className="hub-form-select"
                        value={stagedEntityForm.department || ''}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, department: e.target.value }))}
                      >
                        {availableDepts.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div className="hub-form-field">
                      <label className="hub-form-label">Max Teaching Units (Weekly)</label>
                      <input
                        type="number"
                        min={1}
                        max={36}
                        className="hub-form-input"
                        value={stagedEntityForm.maxUnits || 12}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, maxUnits: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="hub-form-field">
                    <label className="hub-form-label">Preferred Rooms (Scheduling Guide)</label>
                    <AutocompleteMultiSelect
                      allOptions={rooms}
                      options={rooms}
                      selectedIds={stagedEntityForm.preferredRooms || []}
                      onToggle={(item) => {
                        setStagedEntityForm(prev => ({
                          ...prev,
                          preferredRooms: toggleMultiList(
                            prev.preferredRooms,
                            item,
                            getRoomMatchTokens,
                            (r) => (typeof r === 'object' && r !== null ? (r.id || r.name) : r)
                          )
                        }));
                      }}
                      onBatchSelect={(items) => {
                        setStagedEntityForm(prev => ({
                          ...prev,
                          preferredRooms: batchSelectMultiList(
                            prev.preferredRooms,
                            items,
                            getRoomMatchTokens,
                            (r) => (typeof r === 'object' && r !== null ? (r.id || r.name) : r)
                          )
                        }));
                      }}
                      onBatchDeselect={(items) => {
                        setStagedEntityForm(prev => ({
                          ...prev,
                          preferredRooms: batchDeselectMultiList(prev.preferredRooms, items, getRoomMatchTokens)
                        }));
                      }}
                      renderChip={renderRoomChip}
                      renderOption={renderRoomOption}
                      placeholder="Search and select preferred rooms..."
                    />
                  </div>
                </div>

                {/* Card 2: Specializations & Assigned Sections */}
                <div className="hub-modal-section-card">
                  <div className="hub-modal-section-header">
                    <span className="hub-modal-section-title">
                      <GraduationCap size={16} color="var(--accent-primary)" />
                      Specializations & Assigned Sections
                    </span>
                  </div>

                  <div className="hub-form-field">
                    <label className="hub-form-label">Specialization Subjects (Qualified to Teach)</label>
                    <AutocompleteMultiSelect
                      allOptions={subjects}
                      options={subjects}
                      selectedIds={stagedAssignedSubjects}
                      onToggle={(item) => {
                        const tokens = getSubjectMatchTokens(item);
                        const isCurrentlySelected = stagedAssignedSubjects.some(x => tokens.has(normToken(x)));
                        setStagedAssignedSubjects(prev =>
                          toggleMultiList(prev, item, getSubjectMatchTokens, (it) => (typeof it === 'object' && it !== null ? it.id : it))
                        );
                        if (isCurrentlySelected) {
                          setStagedFacultyMap(prev => pruneFacultyMapSubjects(prev, [item]));
                        }
                      }}
                      onBatchSelect={(items) => {
                        setStagedAssignedSubjects(prev =>
                          batchSelectMultiList(prev, items, getSubjectMatchTokens, (it) => (typeof it === 'object' && it !== null ? it.id : it))
                        );
                      }}
                      onBatchDeselect={(items) => {
                        setStagedAssignedSubjects(prev => batchDeselectMultiList(prev, items, getSubjectMatchTokens));
                        setStagedFacultyMap(prev => pruneFacultyMapSubjects(prev, items));
                      }}
                      renderChip={renderSubjectChip}
                      renderOption={renderSubjectOption}
                      placeholder="Search subject code or name..."
                      matchIdOnly={true}
                    />
                  </div>

                  {stagedAssignedSubjects.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      <label className="hub-form-label" style={{ fontSize: '0.74rem' }}>Specialized Subjects Settings & Lab Config</label>
                      {stagedAssignedSubjects.map(subRef => {
                        const sub = getSubject(subRef) || { id: subRef, code: subRef, name: subRef };
                        const subKey = sub.id || sub.code;
                        const isEditingSub = nestedEditing?.type === 'subject' && (String(nestedEditing?.id) === String(subKey) || String(nestedEditing?.id) === String(sub.id));

                        return (
                          <div key={subKey} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div className="hub-mapping-row" style={{ padding: '6px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: '700', fontSize: '0.84rem', color: 'var(--accent-dark)' }}>{sub.code}</span>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{sub.name}</span>
                                <button
                                  type="button"
                                  className={`hub-inline-toggle-btn ${sub.hasLecLab ? 'active-leclab' : ''}`}
                                  onClick={() => handleQuickToggleSubjectLab(subRef, 'leclab')}
                                  title="Toggle Lecture & Lab split"
                                >
                                  <FlaskConical size={10} /> {sub.hasLecLab ? 'Lec & Lab' : 'Single Lec'}
                                </button>
                                <button
                                  type="button"
                                  className={`hub-inline-toggle-btn ${sub.requiredLab ? 'active-comp' : ''}`}
                                  onClick={() => handleQuickToggleSubjectLab(subRef, 'complab')}
                                  title="Toggle Computer Lab requirement"
                                >
                                  <Monitor size={10} /> Comp Lab
                                </button>
                                <button
                                  type="button"
                                  className={`hub-inline-toggle-btn ${sub.isFoodLab ? 'active-food' : ''}`}
                                  onClick={() => handleQuickToggleSubjectLab(subRef, 'foodlab')}
                                  title="Toggle Food Lab requirement"
                                >
                                  <Utensils size={10} /> Food Lab
                                </button>
                              </div>
                              <button
                                type="button"
                                className={`hub-micro-action-btn ${isEditingSub ? 'active' : ''}`}
                                onClick={() => handleToggleNestedSubject(subKey)}
                                title="Configure this subject directly"
                              >
                                <Sliders size={12} /> Edit Subj {isEditingSub ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                            </div>
                            {renderNestedSubjectEditor(subKey)}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="hub-form-field">
                    <label className="hub-form-label">Assigned Sections</label>
                    <AutocompleteMultiSelect
                      allOptions={localSections}
                      options={localSections}
                      selectedIds={stagedAssignedSections}
                      onToggle={(item) => {
                        const tokens = getSectionMatchTokens(item);
                        const isCurrentlySelected = stagedAssignedSections.some(x => tokens.has(normToken(x)));
                        setStagedAssignedSections(prev =>
                          toggleMultiList(prev, item, getSectionMatchTokens, (s) => (typeof s === 'object' && s !== null ? s.id : s))
                        );
                        if (isCurrentlySelected) {
                          setStagedFacultyMap(prev => pruneFacultyMapSections(prev, [item]));
                        }
                      }}
                      onBatchSelect={(items) => {
                        setStagedAssignedSections(prev =>
                          batchSelectMultiList(prev, items, getSectionMatchTokens, (s) => (typeof s === 'object' && s !== null ? s.id : s))
                        );
                      }}
                      onBatchDeselect={(items) => {
                        setStagedAssignedSections(prev => batchDeselectMultiList(prev, items, getSectionMatchTokens));
                        setStagedFacultyMap(prev => pruneFacultyMapSections(prev, items));
                      }}
                      renderChip={renderSectionChip}
                      renderOption={renderSectionOption}
                      placeholder="Search section..."
                    />
                  </div>

                  {stagedAssignedSections.length > 0 && stagedAssignedSubjects.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                      <label className="hub-form-label">Choose Specific Subject(s) Taught per Section</label>
                      {stagedAssignedSections.map(secId => {
                        const sec = sectionMap.get(normToken(secId)) || { id: secId, name: secId };
                        const chosenSubs = stagedFacultyMap[sec.id] || (sec.name && stagedFacultyMap[sec.name]) || [];

                        return (
                          <div key={sec.id} style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{sec.name}</span>
                              <button
                                type="button"
                                className={`hub-micro-action-btn ${nestedEditing?.type === 'section' && String(nestedEditing?.id) === String(sec.id) ? 'active' : ''}`}
                                onClick={() => handleToggleNestedSection(sec.id)}
                                title="Configure this section directly"
                              >
                                <Layers size={12} /> Edit Section {nestedEditing?.type === 'section' && String(nestedEditing?.id) === String(sec.id) ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                            </div>
                            {renderNestedSectionEditor(sec.id)}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {stagedAssignedSubjects.map(subRef => {
                                const sub = getSubject(subRef) || { id: subRef, code: subRef };
                                const subKey = sub.id || sub.code;
                                const subToks = getSubjectMatchTokens(subRef);
                                const matchesSub = (s) => subToks.has(normToken(s));
                                const isChecked = chosenSubs.some(matchesSub);
                                const isEnrolledInSec = (sec.subjects || []).some(s => subToks.has(normToken(s)));

                                return (
                                  <button
                                    key={subKey}
                                    type="button"
                                    onClick={() => {
                                      setStagedFacultyMap(prev => {
                                        const current = prev[sec.id] || [];
                                        const updated = current.some(matchesSub)
                                          ? current.filter(s => !matchesSub(s))
                                          : [...current, subKey];
                                        return { ...prev, [sec.id]: updated };
                                      });
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '4px 10px',
                                      borderRadius: '16px',
                                      fontSize: '0.75rem',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      border: isChecked
                                        ? '1px solid var(--accent-primary)'
                                        : isEnrolledInSec
                                        ? '1px solid var(--border-color)'
                                        : '1px dashed var(--border-color)',
                                      background: isChecked ? 'rgba(86, 69, 238, 0.12)' : 'var(--bg-main)',
                                      color: isChecked ? 'var(--accent-primary)' : 'var(--text-muted)',
                                      opacity: isChecked || isEnrolledInSec ? 1 : 0.78
                                    }}
                                    title={`${sub.name ? `${sub.code ? `${sub.code}: ` : ''}${sub.name}` : sub.code}${isEnrolledInSec ? ` (Enrolled in ${sec.name})` : ` (Not yet enrolled in ${sec.name} — checking will enroll)`}`}
                                  >
                                    {isChecked ? <Check size={12} /> : <Plus size={11} />}
                                    <span style={{ fontWeight: '700' }}>{sub.code}</span>
                                    {sub.name && sub.name !== sub.code && (
                                      <span style={{ opacity: 0.8, fontSize: '0.72rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {sub.name}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* SUBJECT EDITING FORM */}
            {/* ========================================================================= */}
            {editingEntity.type === 'subject' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Card 1: Subject Identification & Curriculum */}
                <div className="hub-modal-section-card">
                  <div className="hub-modal-section-header">
                    <span className="hub-modal-section-title">
                      <BookOpen size={16} color="var(--accent-primary)" />
                      Subject Identification & Academic Offering
                    </span>
                  </div>
                  <div className="hub-form-grid-2">
                    <div className="hub-form-field">
                      <label className="hub-form-label">Course Code * (e.g. CS 101, IT 204)</label>
                      <input
                        type="text"
                        className="hub-form-input"
                        value={stagedEntityForm.code || ''}
                        onChange={e => handleSubjectCodeChange(e.target.value)}
                        placeholder="e.g. CS 101"
                      />
                    </div>
                    <div className="hub-form-field">
                      <label className="hub-form-label">Subject Title *</label>
                      <input
                        type="text"
                        className="hub-form-input"
                        value={stagedEntityForm.name || ''}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Data Structures and Algorithms"
                      />
                    </div>
                  </div>

                  <div className="hub-form-grid-3">
                    <div className="hub-form-field">
                      <label className="hub-form-label">Category *</label>
                      <select
                        className="hub-form-select"
                        value={stagedEntityForm.category || 'Major'}
                        onChange={e => {
                          const cat = e.target.value;
                          setStagedEntityForm(prev => ({
                            ...prev,
                            category: cat,
                            semester: cat === 'Minor' ? 'Both' : (prev.semester === 'Both' ? (activeSemester || '1st Semester') : prev.semester)
                          }));
                        }}
                      >
                        <option value="Major">Major</option>
                        <option value="Minor">Minor / General Education</option>
                      </select>
                    </div>
                    <div className="hub-form-field">
                      <label className="hub-form-label">Credits / Units *</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className="hub-form-input"
                        value={stagedEntityForm.credits || 3}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, credits: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="hub-form-field">
                      <label className="hub-form-label">Target Semester</label>
                      <select
                        className="hub-form-select"
                        value={stagedEntityForm.semester || '1st Semester'}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, semester: e.target.value }))}
                      >
                        <option value="1st Semester">1st Semester</option>
                        <option value="2nd Semester">2nd Semester</option>
                        <option value="Summer">Summer</option>
                        <option value="Both">Both Semesters</option>
                      </select>
                    </div>
                  </div>

                  <div className="hub-form-field">
                    <label className="hub-form-label">Offering Department(s)</label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {availableDepts.map(dept => {
                        const isSelected = (stagedEntityForm.departments || []).includes(dept);
                        return (
                          <button
                            key={dept}
                            type="button"
                            className={`hub-dept-pill ${isSelected ? 'active' : ''}`}
                            onClick={() => handleSubjectDepartmentToggle(dept)}
                          >
                            {dept}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Card 2: Laboratory & Lecture Setup */}
                <div className="hub-modal-section-card">
                  <div className="hub-modal-section-header">
                    <span className="hub-modal-section-title">
                      <Sliders size={16} color="var(--accent-primary)" />
                      Lecture & Laboratory Configuration (Scheduling Engine Guide)
                    </span>
                  </div>

                  {autoDetectedReason && (
                    <div className="hub-ai-banner">
                      <Sparkles size={14} />
                      <span>AI / Heuristic Detection: {autoDetectedReason}</span>
                    </div>
                  )}

                  {/* Lec & Lab Split Toggle */}
                  <label className={`hub-checkbox-card ${stagedEntityForm.hasLecLab ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(stagedEntityForm.hasLecLab)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUserLabModified(true);
                        setStagedEntityForm(prev => ({
                          ...prev,
                          hasLecLab: checked,
                          requiredLab: checked ? (prev.requiredLab || !prev.isFoodLab) : prev.requiredLab
                        }));
                      }}
                      style={{ marginTop: '3px' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)' }}>Lecture & Laboratory Split Course</strong>
                        <span className="hub-tag-leclab" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                          <FlaskConical size={10} />
                          Splits into 2 Class Sessions
                        </span>
                      </div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Generates separate lecture (standard classroom) and laboratory meeting slots for the scheduler algorithm.
                      </span>
                    </div>
                  </label>

                  {/* Hours Breakdown */}
                  {stagedEntityForm.hasLecLab ? (
                    <div className="hub-form-grid-3">
                      <div className="hub-form-field">
                        <label className="hub-form-label">Lecture Hours (Weekly)</label>
                        <HoursPerMeetingSelect
                          value={stagedEntityForm.lectureHours || 2}
                          onChange={val => setStagedEntityForm(prev => ({ ...prev, lectureHours: Number(val) || 2 }))}
                          selectClassName="hub-form-select"
                          inputClassName="hub-form-input"
                        />
                      </div>
                      <div className="hub-form-field">
                        <label className="hub-form-label">Laboratory Hours (Weekly)</label>
                        <HoursPerMeetingSelect
                          value={stagedEntityForm.labHours || 3}
                          onChange={val => setStagedEntityForm(prev => ({ ...prev, labHours: Number(val) || 3 }))}
                          selectClassName="hub-form-select"
                          inputClassName="hub-form-input"
                        />
                      </div>
                      <div className="hub-form-field">
                        <label className="hub-form-label">Weekly Contact Total</label>
                        <div className="hub-contact-hours-box">
                          {Number(stagedEntityForm.lectureHours || 2) + Number(stagedEntityForm.labHours || 3)} Hours/Week
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="hub-form-grid-2">
                      <div className="hub-form-field">
                        <label className="hub-form-label">Hours Per Meeting</label>
                        <HoursPerMeetingSelect
                          value={stagedEntityForm.hoursPerMeeting || 1.5}
                          onChange={val => setStagedEntityForm(prev => ({ ...prev, hoursPerMeeting: val }))}
                          selectClassName="hub-form-select"
                          inputClassName="hub-form-input"
                        />
                      </div>
                      <div className="hub-form-field">
                        <label className="hub-form-label">Classroom Mode</label>
                        <div className="hub-single-session-box">
                          Single classroom session schedule
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Laboratory Room Type Requirements */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <label className="hub-form-label">Laboratory Room Allocation Guide (Used by AI Scheduler)</label>
                    <div className="hub-form-grid-2">
                      <label className={`hub-checkbox-card ${stagedEntityForm.requiredLab ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(stagedEntityForm.requiredLab)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUserLabModified(true);
                            setStagedEntityForm(prev => ({
                              ...prev,
                              requiredLab: checked,
                              isFoodLab: checked ? false : prev.isFoodLab
                            }));
                          }}
                          style={{ marginTop: '3px' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Monitor size={14} color="#059669" />
                            <strong style={{ fontSize: '0.84rem', color: 'var(--text-main)' }}>Requires Computer Lab</strong>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Must be scheduled in a room with PC workstations and network setup.
                          </span>
                        </div>
                      </label>

                      <label className={`hub-checkbox-card ${stagedEntityForm.isFoodLab ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(stagedEntityForm.isFoodLab)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUserLabModified(true);
                            setStagedEntityForm(prev => ({
                              ...prev,
                              isFoodLab: checked,
                              requiredLab: checked ? false : prev.requiredLab
                            }));
                          }}
                          style={{ marginTop: '3px' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Utensils size={14} color="#d97706" />
                            <strong style={{ fontSize: '0.84rem', color: 'var(--text-main)' }}>Requires Food Laboratory</strong>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Must be scheduled in HM / Culinary cooking kitchen and food lab.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Card 3: Enrolled Sections & Specialized Faculty */}
                <div className="hub-modal-section-card">
                  <div className="hub-modal-section-header">
                    <span className="hub-modal-section-title">
                      <Layers size={16} color="var(--accent-primary)" />
                      Enrolled Sections & Specialized Faculty
                    </span>
                  </div>

                  <div className="hub-form-field">
                    <label className="hub-form-label">Enrolled Sections (Offering this Subject)</label>
                    <AutocompleteMultiSelect
                      allOptions={localSections}
                      options={localSections}
                      selectedIds={stagedAssignedSections}
                      onToggle={(item) => {
                        setStagedAssignedSections(prev =>
                          toggleMultiList(prev, item, getSectionMatchTokens, (s) => (typeof s === 'object' && s !== null ? s.id : s))
                        );
                      }}
                      onBatchSelect={(items) => {
                        setStagedAssignedSections(prev =>
                          batchSelectMultiList(prev, items, getSectionMatchTokens, (s) => (typeof s === 'object' && s !== null ? s.id : s))
                        );
                      }}
                      onBatchDeselect={(items) => {
                        setStagedAssignedSections(prev => batchDeselectMultiList(prev, items, getSectionMatchTokens));
                      }}
                      renderChip={renderSectionChip}
                      renderOption={renderSectionOption}
                      placeholder="Search section..."
                    />
                  </div>

                  {stagedAssignedSections.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      <label className="hub-form-label" style={{ fontSize: '0.74rem' }}>Enrolled Sections List & Quick Config</label>
                      {stagedAssignedSections.map(secId => {
                        const sec = sectionMap.get(normToken(secId)) || { id: secId, name: secId };
                        const isEditingSec = nestedEditing?.type === 'section' && String(nestedEditing?.id) === String(sec.id);

                        return (
                          <div key={sec.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div className="hub-mapping-row" style={{ padding: '6px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                <span style={{ fontWeight: '700', fontSize: '0.84rem' }}>{sec.name}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sec.program} • Y{sec.yearLevel}</span>
                              </div>
                              <button
                                type="button"
                                className={`hub-micro-action-btn ${isEditingSec ? 'active' : ''}`}
                                onClick={() => handleToggleNestedSection(sec.id)}
                                title="Configure this section directly"
                              >
                                <Layers size={12} /> Edit Section {isEditingSec ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                            </div>
                            {renderNestedSectionEditor(sec.id)}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="hub-form-field">
                    <label className="hub-form-label">Specialized Faculty (Eligible Instructors)</label>
                    <AutocompleteMultiSelect
                      allOptions={localProfessors}
                      options={localProfessors}
                      selectedIds={stagedFacultyMap.assignedProfessors || []}
                      onToggle={(item) => {
                        setStagedFacultyMap(prev => ({
                          ...prev,
                          assignedProfessors: toggleMultiList(
                            prev.assignedProfessors,
                            item,
                            getFacultyMatchTokens,
                            (p) => (typeof p === 'object' && p !== null ? p.id : p)
                          )
                        }));
                      }}
                      onBatchSelect={(items) => {
                        setStagedFacultyMap(prev => ({
                          ...prev,
                          assignedProfessors: batchSelectMultiList(
                            prev.assignedProfessors,
                            items,
                            getFacultyMatchTokens,
                            (p) => (typeof p === 'object' && p !== null ? p.id : p)
                          )
                        }));
                      }}
                      onBatchDeselect={(items) => {
                        setStagedFacultyMap(prev => ({
                          ...prev,
                          assignedProfessors: batchDeselectMultiList(prev.assignedProfessors, items, getFacultyMatchTokens)
                        }));
                      }}
                      renderChip={renderFacultyChip}
                      renderOption={renderFacultyOption}
                      placeholder="Search faculty..."
                    />
                  </div>

                  {(stagedFacultyMap.assignedProfessors || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      <label className="hub-form-label" style={{ fontSize: '0.74rem' }}>Specialized Faculty List & Quick Config</label>
                      {(stagedFacultyMap.assignedProfessors || []).map(profId => {
                        const prof = localProfessors.find(p => p.id === profId) || { id: profId, name: profId };
                        const isEditingProf = nestedEditing?.type === 'faculty' && String(nestedEditing?.id) === String(prof.id);

                        return (
                          <div key={prof.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div className="hub-mapping-row" style={{ padding: '6px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                <span style={{ fontWeight: '700', fontSize: '0.84rem' }}>{prof.name || `${prof.lastName}, ${prof.firstName}`}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{prof.department} • Max {prof.maxUnits || 12}u</span>
                              </div>
                              <button
                                type="button"
                                className={`hub-micro-action-btn ${isEditingProf ? 'active' : ''}`}
                                onClick={() => handleToggleNestedFaculty(prof.id)}
                                title="Configure this faculty directly"
                              >
                                <UserCheck size={12} /> Edit Faculty {isEditingProf ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                            </div>
                            {renderNestedFacultyEditor(prof.id)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mgmt-modal-actions" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="mgmt-cancel-btn" onClick={() => setEditingEntity(null)} disabled={isSaving}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveModal}
                disabled={isSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {isSaving ? 'Saving Changes...' : <><Check size={16} /> Save Changes</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Create Modal */}
      <QuickCreateModal
        isOpen={quickCreateState.isOpen}
        type={quickCreateState.type}
        defaultDepartment={departmentFilter !== 'All' ? departmentFilter : undefined}
        onClose={() => setQuickCreateState({ isOpen: false, type: 'subject' })}
        departments={departments}
        courses={courses}
        subjects={subjects}
        sections={localSections}
        professors={localProfessors}
        user={user}
        activeSemester={activeSemester}
        onSuccess={(newItem, type) => {
          toast.success(`Created new ${type}: ${newItem.name || newItem.code}`);
          if (type === 'section') {
            const id = newItem.id || newItem.docId;
            const sectionWithDefaults = {
              id,
              docId: id,
              subjects: [],
              subjectInstructors: {},
              ...newItem
            };
            setLocalSections(prev => {
              const exists = prev.some(s => String(s.id) === String(id));
              if (exists) return prev;
              return [sectionWithDefaults, ...prev];
            });
            setViewMode('sections');
            if (searchQuery) setSearchQuery('');
            const secDept = resolveDeptCode(sectionWithDefaults.program) || resolveDeptCode(sectionWithDefaults.department);
            if (departmentFilter !== 'All' && secDept && secDept !== departmentFilter) {
              setDepartmentFilter('All');
            }
            // Seamlessly open the Section Configure Modal right away so subjects and faculty can be assigned with 0 latency
            handleOpenEditModal('section', sectionWithDefaults);
          } else if (type === 'faculty') {
            const id = newItem.id || newItem.docId;
            const profWithDefaults = {
              id,
              docId: id,
              assignedSections: [],
              specialization: [],
              ...newItem
            };
            setLocalProfessors(prev => {
              const exists = prev.some(p => String(p.id) === String(id));
              if (exists) return prev;
              return [profWithDefaults, ...prev];
            });
            setViewMode('faculty');
            if (searchQuery) setSearchQuery('');
            const profDept = resolveDeptCode(profWithDefaults.department);
            if (departmentFilter !== 'All' && profDept && profDept !== departmentFilter) {
              setDepartmentFilter('All');
            }
            handleOpenEditModal('faculty', profWithDefaults);
          }
        }}
      />
    </div>
  );
};

export default TeachingLoadManagement;