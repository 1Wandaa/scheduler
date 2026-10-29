// src/pages/management/AssignmentHub.jsx
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { db } from '../../config/firebase';
import { doc, writeBatch, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { DEPARTMENTS, getDeptColor, PROGRAM_DEPARTMENTS } from '../../config/constants';
import QuickCreateModal from '../../components/QuickCreateModal/QuickCreateModal';
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
import './AssignmentHub.css';

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
 * Ultra-lightweight inline faculty selector for section subject rows.
 * Defers rendering large lists of faculty options until hovered, focused, or clicked,
 * reducing initial DOM elements on page mount by >98% and making opening instantaneous.
 */
const InlineInstructorSelect = React.memo(({
  section,
  subRef,
  assignedProf,
  onAssign,
  getSubjectProfessors
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // If expanded, resolve the full list of options on-demand
  const { specProfs = [], otherProfs = [] } = isExpanded ? getSubjectProfessors(subRef) : {};

  const handleExpand = useCallback(() => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  }, [isExpanded]);

  return (
    <select
      className={`hub-instructor-select ${assignedProf ? 'has-assigned' : 'is-unassigned'}`}
      value={assignedProf?.id || ''}
      onMouseEnter={handleExpand}
      onFocus={handleExpand}
      onPointerDown={handleExpand}
      onTouchStart={handleExpand}
      onChange={(e) => {
        onAssign(section, subRef, e.target.value);
      }}
    >
      {!isExpanded ? (
        // Ultra-minimal idle state (1 DOM option node instead of 100+)
        assignedProf ? (
          <option value={assignedProf.id}>
            👤 {assignedProf.name || `${assignedProf.lastName}, ${assignedProf.firstName}`} ({assignedProf.department})
          </option>
        ) : (
          <option value="">⚠️ — Assign Faculty to this Subject —</option>
        )
      ) : (
        // Expanded state with full categorized options
        <>
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
        </>
      )}
    </select>
  );
});

const AssignmentHub = ({
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

  // --- High-Performance Pre-Indexed Lookups (O(1)) ---
  const subjectLookup = useMemo(() => {
    const mapById = new Map();
    const mapByCode = new Map();
    const mapByName = new Map();
    
    subjects.forEach(s => {
      if (s.id) mapById.set(String(s.id).toLowerCase(), s);
      if (s.code && !mapByCode.has(String(s.code).toLowerCase())) mapByCode.set(String(s.code).toLowerCase(), s);
      if (s.name && !mapByName.has(String(s.name).toLowerCase())) mapByName.set(String(s.name).toLowerCase(), s);
    });
    
    return { mapById, mapByCode, mapByName };
  }, [subjects]);

  const getSubject = useCallback((subRef) => {
    if (!subRef) return null;
    if (typeof subRef === 'object' && subRef !== null) return subRef;
    
    const key = String(subRef).toLowerCase();
    return subjectLookup.mapById.get(key) || 
           subjectLookup.mapByCode.get(key) || 
           subjectLookup.mapByName.get(key) || 
           null;
  }, [subjectLookup]);

  const profMap = useMemo(() => {
    const map = new Map();
    professors.forEach(p => {
      map.set(String(p.id), p);
    });
    return map;
  }, [professors]);

  // Pre-indexed sections map for instant O(1) lookups by id or name
  const sectionMap = useMemo(() => {
    const map = new Map();
    sections.forEach(s => {
      if (s.id) map.set(String(s.id).toLowerCase(), s);
      if (s.name) map.set(String(s.name).toLowerCase(), s);
    });
    return map;
  }, [sections]);

  const profsBySectionMap = useMemo(() => {
    const map = new Map();
    professors.forEach(p => {
      (p.assignedSections || []).forEach(secRef => {
        if (!secRef) return;
        const key = String(secRef).toLowerCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(p);
      });
    });
    return map;
  }, [professors]);

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
    professors.forEach(p => {
      (p.specialization || []).forEach(specRef => {
        if (!specRef) return;
        const key = String(specRef).toLowerCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(p);
      });
    });
    return map;
  }, [professors]);

  // On-demand lazy cache for specialized & other faculty per subject (computed only when needed)
  const subjectProfOptionsCacheMap = useMemo(() => {
    void subjects; void professors; void profsBySubjectKey;
    return new Map();
  }, [subjects, professors, profsBySubjectKey]);
  const subjectProfOptionsCache = { current: subjectProfOptionsCacheMap };

  const getSubjectProfessors = useCallback((subRef) => {
    if (!subRef) return { specProfs: [], otherProfs: professors };
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
    const otherProfs = professors.filter(p => !seen.has(p.id)).sort((a, b) => {
      const nameA = a.name || `${a.lastName || ''}, ${a.firstName || ''}`;
      const nameB = b.name || `${b.lastName || ''}, ${b.firstName || ''}`;
      return nameA.localeCompare(nameB);
    });
    const result = { specProfs, otherProfs };
    keys.forEach(k => subjectProfOptionsCache.current.set(String(k).toLowerCase(), result));
    subjectProfOptionsCache.current.set(cacheKey, result);
    return result;
  }, [getSubject, profsBySubjectKey, professors, subjectProfOptionsCache]);

  // Pre-indexed set of enrolled and specialized subject keys for instant O(1) attention filtering
  const enrolledSubjectCodesSet = useMemo(() => {
    const set = new Set();
    sections.forEach(sec => {
      (sec.subjects || []).forEach(s => {
        if (s) set.add(String(s).toLowerCase());
      });
    });
    return set;
  }, [sections]);

  const specializedSubjectCodesSet = useMemo(() => {
    const set = new Set();
    professors.forEach(p => {
      (p.specialization || []).forEach(s => {
        if (s) set.add(String(s).toLowerCase());
      });
    });
    return set;
  }, [professors]);

  // Pre-indexed mapping of subject -> sections for viewMode === 'subjects'
  const sectionsBySubjectKey = useMemo(() => {
    const map = new Map();
    sections.forEach(sec => {
      (sec.subjects || []).forEach(subRef => {
        if (!subRef) return;
        const key = String(subRef).toLowerCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(sec);
      });
    });
    return map;
  }, [sections]);

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
  const assignedProfCacheMap = useMemo(() => {
    void sections; void professors; void subjects;
    return new Map();
  }, [sections, professors, subjects]);
  const assignedProfCache = { current: assignedProfCacheMap };

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

    let result = null;

    // 1. Direct match on section.subjectInstructors (most authoritative)
    if (sec.subjectInstructors) {
      const pId = sec.subjectInstructors[subKeyFound] || sec.subjectInstructors[subId] || sec.subjectInstructors[subRef];
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
        return mappedSubs.some(s => String(s) === String(subKeyFound) || String(s) === String(subId) || String(s) === String(subRef));
      });
      if (profByMap) result = profByMap;
    }

    // 3. Fallback: only if exactly 1 professor assigned to this section specializes in this subject
    if (!result) {
      const sectionProfs = getSectionProfs(sec);
      const candidateProfs = sectionProfs.filter(p => {
        return (p.specialization || []).some(sp => String(sp) === String(subId) || String(sp) === String(subKeyFound) || (subObj.name && String(sp) === String(subObj.name)));
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

    return result;
  }, [getSubject, profMap, getSectionProfs, assignedProfCache]);

  // --- KPI Stats Calculation ---
  const stats = useMemo(() => {
    let totalEnrolledLinks = 0;
    let totalAssignedLinks = 0;
    let sectionsNeedingTeachers = 0;

    sections.forEach(sec => {
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
    sections.forEach(sec => {
      (sec.subjects || []).forEach(subRef => {
        const sub = getSubject(subRef);
        if (sub?.hasLecLab) totalLecLabEnrolled++;
      });
    });

    return {
      totalSections: sections.length,
      totalProfessors: professors.length,
      totalSubjects: subjects.length,
      totalLecLabSubjects,
      totalLecLabEnrolled,
      totalEnrolledLinks,
      totalAssignedLinks,
      sectionsNeedingTeachers
    };
  }, [sections, professors, subjects, getAssignedProf, getSubject]);

  // --- Inline Instructor Change for a Section Subject ---
  const handleAssignInstructorInline = async (section, subRef, newProfId) => {
    const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef };
    const subCode = sub.id || sub.code;

    try {
      const batch = writeBatch(db);

      // 1. Update section's subjectInstructors mapping
      const nextSubjectInstructors = { ...(section.subjectInstructors || {}) };
      if (newProfId) {
        nextSubjectInstructors[subCode] = newProfId;
        nextSubjectInstructors[sub.id] = newProfId;
      } else {
        delete nextSubjectInstructors[subCode];
        delete nextSubjectInstructors[sub.id];
        delete nextSubjectInstructors[subRef];
      }

      batch.update(doc(db, 'sections', String(section.id)), {
        subjectInstructors: nextSubjectInstructors
      });

      // 2. Identify the old professor who taught this subject
      const oldProf = getAssignedProf(section, subRef);
      if (oldProf && oldProf.id !== newProfId) {
        const oldMap = { ...(oldProf.sectionSubjectMap || {}) };
        const oldSecSubs = (oldMap[section.id] || []).filter(s => s !== subCode && s !== sub.id && s !== subRef);
        oldMap[section.id] = oldSecSubs;

        let updatedSecs = oldProf.assignedSections || [];
        if (oldSecSubs.length === 0) {
          delete oldMap[section.id];
          updatedSecs = updatedSecs.filter(s => s !== section.id && s !== section.name);
        }

        batch.update(doc(db, 'professors', String(oldProf.id)), {
          assignedSections: updatedSecs,
          sectionSubjectMap: oldMap
        });
      }

      // 3. Update the newly assigned professor
      if (newProfId) {
        const targetProf = professors.find(p => p.id === newProfId);
        if (targetProf) {
          const curSecs = targetProf.assignedSections || [];
          const updatedSecs = curSecs.includes(section.id) || (section.name && curSecs.includes(section.name))
            ? curSecs
            : [...curSecs, section.id];

          const curSpecs = targetProf.specialization || [];
          const updatedSpecs = curSpecs.some(sp => String(sp) === String(sub.id) || String(sp) === String(sub.code) || String(sp) === String(subCode))
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
      assignedProfCache.current.clear();

      const profObj = professors.find(p => p.id === newProfId);
      logActivity({
        user,
        action: LOG_ACTIONS.UPDATE_SECTION,
        details: profObj
          ? `Assigned ${profObj.name} to teach ${subCode} for section ${section.name}`
          : `Removed assigned instructor for ${subCode} in section ${section.name}`
      });

      toast.success(profObj ? `Assigned ${profObj.name} to ${subCode}!` : `Instructor cleared for ${subCode}`);
    } catch (err) {
      console.error("Error updating instructor inline:", err);
      toast.error("Failed to update assignment.");
    }
  };

  // Inline removal of an enrolled or orphan subject from a section
  const handleRemoveSubjectFromSectionInline = async (section, subRef) => {
    try {
      const batch = writeBatch(db);
      const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef };
      const keys = [subRef, sub.id, sub.code].filter(Boolean);

      const nextSubjects = (section.subjects || []).filter(s => !keys.includes(s));
      const nextSubjectInstructors = { ...(section.subjectInstructors || {}) };
      keys.forEach(k => delete nextSubjectInstructors[k]);

      batch.update(doc(db, 'sections', String(section.id)), {
        subjects: nextSubjects,
        subjectInstructors: nextSubjectInstructors
      });

      await batch.commit();
      assignedProfCache.current.clear();
      toast.success(`Removed ${subRef} from section ${section.name}!`);
    } catch (err) {
      console.error("Error removing subject from section inline:", err);
      toast.error("Failed to remove subject.");
    }
  };

  // Auto-Match Teachers for a Section
  const handleAutoMatchSectionTeachers = async (sec) => {
    const enrolled = sec.subjects || [];
    let matchCount = 0;
    const batch = writeBatch(db);
    const updatedSubjectInstructors = { ...(sec.subjectInstructors || {}) };
    const profUpdates = {}; // profId -> { assignedSections, sectionSubjectMap }

    enrolled.forEach(subRef => {
      const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef);
      const subCode = sub?.id || sub?.code || subRef;
      const alreadyAssigned = getAssignedProf(sec, subRef);

      if (!alreadyAssigned && sub) {
        const candidates = professors.filter(p => (p.specialization || []).some(sp => String(sp) === String(sub.id) || String(sp) === String(sub.code) || String(sp) === String(sub.name)));
        if (candidates.length > 0) {
          // Choose candidate with lowest current assigned section count
          const best = [...candidates].sort((a, b) => {
            const countA = (profUpdates[a.id]?.assignedSections || a.assignedSections || []).length;
            const countB = (profUpdates[b.id]?.assignedSections || b.assignedSections || []).length;
            return countA - countB;
          })[0];

          updatedSubjectInstructors[subCode] = best.id;
          updatedSubjectInstructors[sub.id] = best.id;

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
      batch.update(doc(db, 'sections', String(sec.id)), {
        subjectInstructors: updatedSubjectInstructors
      });

      Object.entries(profUpdates).forEach(([pId, data]) => {
        batch.update(doc(db, 'professors', String(pId)), data);
      });

      await batch.commit();
      assignedProfCache.current.clear();
      toast.success(`Automatically matched teachers for ${matchCount} subject(s) in ${sec.name}!`);
    } else {
      toast.info(`All subjects in ${sec.name} already have instructors or no specialized faculty were found.`);
    }
  };

  // Auto-Match Teachers across ALL sections
  const handleAutoMatchAllSections = async () => {
    let totalMatches = 0;
    const batch = writeBatch(db);
    const secUpdates = {}; // secId -> updatedSubjectInstructors
    const profUpdates = {}; // profId -> { assignedSections, sectionSubjectMap }

    sections.forEach(sec => {
      const enrolled = sec.subjects || [];
      const updatedMap = { ...(secUpdates[sec.id] || sec.subjectInstructors || {}) };

      enrolled.forEach(subRef => {
        const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef);
        const subCode = sub?.id || sub?.code || subRef;
        const alreadyAssigned = getAssignedProf(sec, subRef);

        if (!alreadyAssigned && sub) {
          const candidates = professors.filter(p => (p.specialization || []).some(sp => String(sp) === String(sub.id) || String(sp) === String(sub.code) || String(sp) === String(sub.name)));
          if (candidates.length > 0) {
            const best = [...candidates].sort((a, b) => {
              const countA = (profUpdates[a.id]?.assignedSections || a.assignedSections || []).length;
              const countB = (profUpdates[b.id]?.assignedSections || b.assignedSections || []).length;
              return countA - countB;
            })[0];

            updatedMap[subCode] = best.id;
            updatedMap[sub.id] = best.id;
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
      Object.entries(secUpdates).forEach(([sId, subjInstMap]) => {
        batch.update(doc(db, 'sections', String(sId)), { subjectInstructors: subjInstMap });
      });

      Object.entries(profUpdates).forEach(([pId, data]) => {
        batch.update(doc(db, 'professors', String(pId)), data);
      });

      await batch.commit();
      assignedProfCache.current.clear();
      toast.success(`Auto-matched ${totalMatches} teacher assignment(s) across all sections!`);
    } else {
      toast.info("All sections are already fully assigned or no matching specialized faculty were found.");
    }
  };

  // Auto-fill in the Configure modal
  const handleAutoAssignStagedTeachers = () => {
    const nextMap = { ...stagedFacultyMap };
    let count = 0;
    stagedAssignedSubjects.forEach(subRef => {
      const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef);
      const key = sub?.id || sub?.code || subRef;
      if (!nextMap[key] && !nextMap[subRef]) {
        const candidates = professors.filter(p => sub && (p.specialization || []).some(sp => String(sp) === String(sub.id) || String(sp) === String(sub.code) || String(sp) === String(sub.name)));
        if (candidates.length > 0) {
          const best = [...candidates].sort((a, b) => (a.assignedSections || []).length - (b.assignedSections || []).length)[0];
          nextMap[key] = best.id;
          nextMap[subRef] = best.id;
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
        const sub = subjects.find(s => String(s.id) === String(subRef) || String(s.code) === String(subRef) || String(s.name) === String(subRef)) || { id: subRef, code: subRef };
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
        const subObj = subjects.find(s => String(s.id) === String(ref) || String(s.code) === String(ref) || String(s.name) === String(ref));
        const key = subObj ? String(subObj.id) : String(ref);
        if (!seenSubs.has(key)) {
          seenSubs.add(key);
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
      const secSubjectMap = { ...(item.sectionSubjectMap || {}) };
      const assignedSecs = item.assignedSections || [];
      assignedSecs.forEach(secId => {
        const sec = sections.find(s => String(s.id) === String(secId) || String(s.name) === String(secId));
        if (sec && (!secSubjectMap[sec.id] || secSubjectMap[sec.id].length === 0)) {
          const matching = (sec.subjects || []).filter(subRef => {
            const assigned = getAssignedProf(sec, subRef);
            return assigned && assigned.id === item.id;
          });
          secSubjectMap[sec.id] = matching;
        }
      });

      const uniqueSecs = [];
      const seenSecs = new Set();
      assignedSecs.forEach(ref => {
        const secObj = sections.find(s => String(s.id) === String(ref) || String(s.name) === String(ref));
        const key = secObj ? String(secObj.id) : String(ref);
        if (!seenSecs.has(key)) {
          seenSecs.add(key);
          uniqueSecs.push(key);
        }
      });

      const uniqueSpecs = [];
      const seenSpecs = new Set();
      (item.specialization || []).forEach(ref => {
        const subObj = subjects.find(s => String(s.id) === String(ref) || String(s.code) === String(ref) || String(s.name) === String(ref));
        const key = subObj ? String(subObj.id) : String(ref);
        if (!seenSpecs.has(key)) {
          seenSpecs.add(key);
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

      const enrolled = sections.filter(s =>
        (s.subjects || []).some(sub => String(sub) === String(item.id) || String(sub) === String(item.code) || String(sub) === String(item.name))
      ).map(s => s.id);
      const specialized = professors.filter(p =>
        (p.specialization || []).some(sub => String(sub) === String(item.id) || String(sub) === String(item.code) || String(sub) === String(item.name))
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
    const prof = professors.find(p => String(p.id) === String(profId));
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
    const sec = sections.find(s => String(s.id) === String(secId) || String(s.name) === String(secId));
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
        const code = (form.code || '').trim().toUpperCase();
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

  // --- Save Staged Entity in Modal ---
  const handleSaveModal = async () => {
    if (!editingEntity) return;
    setModalError(null);
    setIsSaving(true);
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
        const isDuplicate = sections.some(s => String(s.id) !== String(item.id) && s.name?.trim().toUpperCase() === name.toUpperCase());
        if (isDuplicate) {
          setModalError(`A section named "${name}" already exists.`);
          setIsSaving(false);
          return;
        }

        // 1. Update section's document
        batch.update(doc(db, 'sections', String(item.id)), {
          name,
          program,
          yearLevel: Number(stagedEntityForm.yearLevel) || 1,
          subjects: stagedAssignedSubjects,
          subjectInstructors: stagedFacultyMap
        });

        // 2. Map professors: profId -> list of subjects taught in this section
        const profToSubjects = {};
        Object.entries(stagedFacultyMap).forEach(([subRef, pId]) => {
          if (pId && stagedAssignedSubjects.some(s => String(s) === String(subRef))) {
            if (!profToSubjects[pId]) profToSubjects[pId] = [];
            profToSubjects[pId].push(subRef);
          }
        });

        // 3. Update professors who are assigned
        Object.entries(profToSubjects).forEach(([pId, subRefs]) => {
          const prof = professors.find(p => p.id === pId);
          if (prof) {
            const curSecs = prof.assignedSections || [];
            const newSecs = curSecs.some(id => String(id) === String(item.id) || (name && String(id) === String(name)) || (item.name && String(id) === String(item.name)))
              ? curSecs
              : [...curSecs, item.id];

            let curSpecs = [...(prof.specialization || [])];
            subRefs.forEach(subRef => {
              const subObj = subjects.find(s => String(s.id) === String(subRef) || String(s.code) === String(subRef));
              const codeOrId = subObj?.id || subObj?.code || subRef;
              if (!curSpecs.some(sp => String(sp) === String(codeOrId)) && (!subObj || !curSpecs.some(sp => String(sp) === String(subObj.id)))) {
                curSpecs.push(codeOrId);
              }
            });

            const curMap = { ...(prof.sectionSubjectMap || {}) };
            curMap[item.id] = subRefs;

            batch.update(doc(db, 'professors', String(prof.id)), {
              assignedSections: newSecs,
              specialization: curSpecs,
              sectionSubjectMap: curMap
            });
          }
        });

        // 4. Remove section from professors no longer teaching here
        professors.forEach(prof => {
          const hadSec = (prof.assignedSections || []).some(id => String(id) === String(item.id) || (item.name && String(id) === String(item.name)));
          if (hadSec && !profToSubjects[prof.id]) {
            const newSecs = (prof.assignedSections || []).filter(s => String(s) !== String(item.id) && String(s) !== String(item.name) && String(s) !== String(name));
            const newMap = { ...(prof.sectionSubjectMap || {}) };
            delete newMap[item.id];
            delete newMap[item.name];
            delete newMap[name];

            batch.update(doc(db, 'professors', String(prof.id)), {
              assignedSections: newSecs,
              sectionSubjectMap: newMap
            });
          }
        });

        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_SECTION,
          details: `Updated section: ${name} (${program})`
        });
        toast.success(`Section ${name} saved successfully!`);

      } else if (type === 'faculty') {
        const fName = (stagedEntityForm.firstName || '').trim();
        const lName = (stagedEntityForm.lastName || '').trim();
        if (!fName || !lName) {
          setModalError("First and last names are required.");
          setIsSaving(false);
          return;
        }
        const combinedName = `${lName}, ${fName}`;
        const isDuplicate = professors.some(p => String(p.id) !== String(item.id) && (p.name || '').trim().toLowerCase() === combinedName.toLowerCase());
        if (isDuplicate) {
          setModalError(`A faculty member named "${combinedName}" already exists.`);
          setIsSaving(false);
          return;
        }

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
          sectionSubjectMap: stagedFacultyMap
        });

        // 2. Synchronize sections to reflect this professor's specific subject assignments
        sections.forEach(sec => {
          const isNowAssignedSection = stagedAssignedSections.some(id => String(id) === String(sec.id) || String(id) === String(sec.name));
          const wasAssignedSection = (item.assignedSections || []).some(id => String(id) === String(sec.id) || String(id) === String(sec.name));
          
          let updatedSubjs = [...(sec.subjects || [])];
          const updatedSubjectInstructors = { ...(sec.subjectInstructors || {}) };
          let secChanged = false;

          if (isNowAssignedSection) {
            const chosenSubs = stagedFacultyMap[sec.id] || [];
            
            chosenSubs.forEach(subRef => {
              const subObj = subjects.find(s => String(s.id) === String(subRef) || String(s.code) === String(subRef) || String(s.name) === String(subRef));
              const val = subObj?.id || subObj?.code || subRef;
              
              if (!updatedSubjs.some(existing => String(existing) === String(val) || (subObj && (String(existing) === String(subObj.id) || String(existing) === String(subObj.code))))) {
                updatedSubjs.push(val);
                secChanged = true;
              }
              if (updatedSubjectInstructors[val] !== item.id) {
                updatedSubjectInstructors[val] = item.id;
                secChanged = true;
              }
              if (subObj && subObj.id && updatedSubjectInstructors[subObj.id] !== item.id) {
                updatedSubjectInstructors[subObj.id] = item.id;
                secChanged = true;
              }
            });

            const oldChosenSubs = item.sectionSubjectMap?.[sec.id] || [];
            oldChosenSubs.forEach(oldSubRef => {
              const subObj = subjects.find(s => String(s.id) === String(oldSubRef) || String(s.code) === String(oldSubRef) || String(s.name) === String(oldSubRef));
              const val = subObj?.code || subObj?.id || oldSubRef;
              
              const isStillChosen = chosenSubs.some(c => String(c) === String(oldSubRef) || String(c) === String(val) || (subObj && (String(c) === String(subObj.id) || String(c) === String(subObj.code))));
              if (!isStillChosen) {
                if (updatedSubjectInstructors[val] === item.id) {
                  delete updatedSubjectInstructors[val];
                  secChanged = true;
                }
                if (subObj && subObj.id && updatedSubjectInstructors[subObj.id] === item.id) {
                  delete updatedSubjectInstructors[subObj.id];
                  secChanged = true;
                }
              }
            });
            
          } else if (wasAssignedSection) {
            const oldChosenSubs = item.sectionSubjectMap?.[sec.id] || [];
            oldChosenSubs.forEach(oldSubRef => {
              const subObj = subjects.find(s => String(s.id) === String(oldSubRef) || String(s.code) === String(oldSubRef) || String(s.name) === String(oldSubRef));
              const val = subObj?.code || subObj?.id || oldSubRef;
              if (updatedSubjectInstructors[val] === item.id) {
                delete updatedSubjectInstructors[val];
                secChanged = true;
              }
              if (subObj && subObj.id && updatedSubjectInstructors[subObj.id] === item.id) {
                delete updatedSubjectInstructors[subObj.id];
                secChanged = true;
              }
            });
          }

          if (secChanged) {
            batch.update(doc(db, 'sections', String(sec.id)), {
              subjects: updatedSubjs,
              subjectInstructors: updatedSubjectInstructors
            });
          }
        });

        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_FACULTY,
          details: `Updated faculty: ${combinedName} (${stagedEntityForm.department})`
        });
        toast.success(`Faculty ${combinedName} saved successfully!`);

      } else if (type === 'subject') {
        const code = (stagedEntityForm.code || '').trim().toUpperCase();
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
        const isCodeDuplicate = subjects.some(s => String(s.id) !== String(item.id) && s.code?.trim().toUpperCase() === code);
        if (isCodeDuplicate) {
          setModalError(`A subject with the code "${code}" already exists.`);
          setIsSaving(false);
          return;
        }
        const isNameDuplicate = subjects.some(s => String(s.id) !== String(item.id) && s.name?.trim().toLowerCase() === name.toLowerCase());
        if (isNameDuplicate) {
          setModalError(`A subject named "${name}" already exists.`);
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

        // 2. Sync sections
        const oldCode = item.code || item.id;
        sections.forEach(sec => {
          const wasEnrolled = (sec.subjects || []).some(s => String(s) === String(item.id) || String(s) === String(oldCode) || String(s) === String(code));
          const isNowEnrolled = stagedAssignedSections.some(id => String(id) === String(sec.id) || String(id) === String(sec.name));

          if (!wasEnrolled && isNowEnrolled) {
            batch.update(doc(db, 'sections', String(sec.id)), { subjects: [...(sec.subjects || []), code] });
          } else if (wasEnrolled && !isNowEnrolled) {
            const updated = (sec.subjects || []).filter(s => String(s) !== String(item.id) && String(s) !== String(oldCode) && String(s) !== String(code));
            const updatedInst = { ...(sec.subjectInstructors || {}) };
            delete updatedInst[oldCode];
            delete updatedInst[code];
            delete updatedInst[item.id];
            
            batch.update(doc(db, 'sections', String(sec.id)), {
              subjects: updated,
              subjectInstructors: updatedInst
            });

            // Clean professor map
            professors.forEach(prof => {
              const curMap = { ...(prof.sectionSubjectMap || {}) };
              const secSubs = curMap[sec.id] || [];
              if (secSubs.some(s => String(s) === String(item.id) || String(s) === String(oldCode) || String(s) === String(code))) {
                const newSecSubs = secSubs.filter(s => String(s) !== String(item.id) && String(s) !== String(oldCode) && String(s) !== String(code));
                let newSecs = [...(prof.assignedSections || [])];
                if (newSecSubs.length === 0) {
                  delete curMap[sec.id];
                  newSecs = newSecs.filter(s => String(s) !== String(sec.id) && String(s) !== String(sec.name));
                } else {
                  curMap[sec.id] = newSecSubs;
                }
                batch.update(doc(db, 'professors', String(prof.id)), {
                  sectionSubjectMap: curMap,
                  assignedSections: newSecs
                });
              }
            });
          } else if (wasEnrolled && isNowEnrolled && oldCode !== code) {
            const updated = (sec.subjects || []).map(s => (String(s) === String(oldCode) || String(s) === String(item.id)) ? code : s);
            const updatedInst = { ...(sec.subjectInstructors || {}) };
            if (updatedInst[oldCode]) {
              updatedInst[code] = updatedInst[oldCode];
              delete updatedInst[oldCode];
            }
            batch.update(doc(db, 'sections', String(sec.id)), {
              subjects: updated,
              subjectInstructors: updatedInst
            });
          }
        });

        // 3. Sync professors' specializations
        const profIds = stagedFacultyMap.assignedProfessors || [];
        professors.forEach(prof => {
          const wasAssigned = (prof.specialization || []).some(s => String(s) === String(item.id) || String(s) === String(oldCode) || String(s) === String(code));
          const isNowAssigned = profIds.some(id => String(id) === String(prof.id));

          if (!wasAssigned && isNowAssigned) {
            batch.update(doc(db, 'professors', String(prof.id)), { specialization: [...(prof.specialization || []), code] });
          } else if (wasAssigned && !isNowAssigned) {
            const updated = (prof.specialization || []).filter(s => String(s) !== String(item.id) && String(s) !== String(oldCode) && String(s) !== String(code));
            batch.update(doc(db, 'professors', String(prof.id)), { specialization: updated });
          } else if (wasAssigned && isNowAssigned && oldCode !== code) {
            const updated = (prof.specialization || []).map(s => (String(s) === String(oldCode) || String(s) === String(item.id)) ? code : s);
            batch.update(doc(db, 'professors', String(prof.id)), { specialization: updated });
          }
        });

        logActivity({
          user,
          action: LOG_ACTIONS.UPDATE_SUBJECT,
          details: `Updated subject: ${code} - ${name} (${subjectDocPayload.credits} units)`
        });
        toast.success(`Subject ${code} saved successfully!`);
      }

      await batch.commit();
      assignedProfCache.current.clear();
      subjectProfOptionsCache.current.clear();
      setEditingEntity(null);
    } catch (err) {
      console.error("Error saving assignments modal:", err);
      toast.error("Failed to save changes. Please try again.");
      setModalError("Failed to save changes. Please check fields and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Filtering & Searching ---
  const filteredSections = useMemo(() => {
    return sections.filter(sec => {
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
  }, [sections, departmentFilter, searchQuery, onlyNeedsAttention, onlyLecLab, getAssignedProf, getSubject]);

  const filteredFaculty = useMemo(() => {
    return professors.filter(prof => {
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
  }, [professors, departmentFilter, searchQuery, onlyNeedsAttention, onlyLecLab, getSubject, sectionMap, getAssignedProf]);

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

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleLimit(prev => prev + 12);
      }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, filteredSections.length, filteredFaculty.length, filteredSubjects.length]);

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
        <label
          className={`hub-checkbox-card ${form.hasLecLab ? 'active' : ''}`}
          onClick={() => setNestedEditing(prev => ({
            ...prev,
            form: {
              ...prev.form,
              hasLecLab: !prev.form.hasLecLab,
              requiredLab: !prev.form.hasLecLab ? (prev.form.requiredLab || !prev.form.isFoodLab) : prev.form.requiredLab
            }
          }))}
        >
          <input
            type="checkbox"
            checked={Boolean(form.hasLecLab)}
            onChange={() => {}}
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
              <select
                className="hub-form-select"
                value={form.lectureHours || 2}
                onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, lectureHours: Number(e.target.value) } }))}
              >
                <option value={1}>1.0 Hour</option>
                <option value={2}>2.0 Hours (Standard)</option>
                <option value={3}>3.0 Hours</option>
                <option value={4}>4.0 Hours</option>
              </select>
            </div>
            <div className="hub-form-field">
              <label className="hub-form-label">Lab Hours/wk</label>
              <select
                className="hub-form-select"
                value={form.labHours || 3}
                onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, labHours: Number(e.target.value) } }))}
              >
                <option value={2}>2.0 Hours</option>
                <option value={3}>3.0 Hours (Standard)</option>
                <option value={4}>4.0 Hours</option>
                <option value={5}>5.0 Hours</option>
                <option value={6}>6.0 Hours</option>
              </select>
            </div>
            <div className="hub-form-field">
              <label className="hub-form-label">Total Hours</label>
              <div style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.84rem', fontWeight: '700', color: '#7e22ce', display: 'flex', alignItems: 'center', height: '36px' }}>
                {Number(form.lectureHours || 2) + Number(form.labHours || 3)} hrs/wk
              </div>
            </div>
          </div>
        ) : (
          <div className="hub-form-field">
            <label className="hub-form-label">Hours Per Meeting</label>
            <select
              className="hub-form-select"
              value={form.hoursPerMeeting || 1.5}
              onChange={e => setNestedEditing(prev => ({ ...prev, form: { ...prev.form, hoursPerMeeting: Number(e.target.value) } }))}
            >
              <option value={1}>1.0 Hour</option>
              <option value={1.5}>1.5 Hours (e.g. 2x weekly)</option>
              <option value={2}>2.0 Hours</option>
              <option value={3}>3.0 Hours (1x weekly block)</option>
            </select>
          </div>
        )}

        {/* Lab Room Type Requirements */}
        <div className="hub-form-grid-2">
          <label
            className={`hub-checkbox-card ${form.requiredLab ? 'active' : ''}`}
            onClick={() => setNestedEditing(prev => ({
              ...prev,
              form: {
                ...prev.form,
                requiredLab: !prev.form.requiredLab,
                isFoodLab: !prev.form.requiredLab ? false : prev.form.isFoodLab
              }
            }))}
          >
            <input
              type="checkbox"
              checked={Boolean(form.requiredLab)}
              onChange={() => {}}
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

          <label
            className={`hub-checkbox-card ${form.isFoodLab ? 'active' : ''}`}
            onClick={() => setNestedEditing(prev => ({
              ...prev,
              form: {
                ...prev.form,
                isFoodLab: !prev.form.isFoodLab,
                requiredLab: !prev.form.isFoodLab ? false : prev.form.requiredLab
              }
            }))}
          >
            <input
              type="checkbox"
              checked={Boolean(form.isFoodLab)}
              onChange={() => {}}
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
              const id = typeof item === 'object' && item !== null ? (item.id || item.name) : item;
              setNestedEditing(prev => {
                const cur = prev.form.preferredRooms || [];
                const updated = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
                return { ...prev, form: { ...prev.form, preferredRooms: updated } };
              });
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
                Assignments Hub
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
            {displayedSections.map(sec => {
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
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                        Configure
                      </button>
                    </div>
                  </div>

                  {/* Enrolled Subjects List with Inline Teacher Selector */}
                  <div className="hub-mappings-list">
                    {enrolled.length === 0 ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                        No subjects enrolled for this section yet. Click "Configure" to enroll subjects.
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
            })}
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
            {displayedFaculty.map(prof => {
              const assignedSecs = prof.assignedSections || [];
              const specSubjects = prof.specialization || [];

              return (
                <div key={prof.id} className="hub-entity-card">
                  <div className="hub-entity-header">
                    <div className="hub-entity-title">
                      <strong className="hub-entity-name">{prof.name || `${prof.lastName}, ${prof.firstName}`}</strong>
                      <span className="hub-entity-badge" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                        {prof.department}
                      </span>
                    </div>

                    <button
                      className="hub-quick-btn"
                      onClick={() => handleOpenEditModal('faculty', prof)}
                    >
                      Configure
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Specialization Subjects */}
                    <div>
                      <span className="hub-card-section-label">Specialization Subjects:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
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
                                  fontSize: '0.72rem',
                                  fontWeight: '600',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  background: 'rgba(86, 69, 238, 0.1)',
                                  color: 'var(--accent-primary)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  cursor: 'pointer'
                                }}
                                title={`Click to configure subject ${sub.code}`}
                              >
                                <span>{sub.code}</span>
                                {sub.hasLecLab && (
                                  <span style={{ fontSize: '0.62rem', background: 'rgba(147, 51, 234, 0.15)', color: '#7e22ce', padding: '0 4px', borderRadius: '4px', fontWeight: '700' }}>
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
                      <span className="hub-card-section-label">Assigned Sections & Subjects Taught:</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                        {assignedSecs.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>No sections assigned</span>
                        ) : (
                          assignedSecs.map(secId => {
                            const sec = sectionMap.get(String(secId).toLowerCase()) || { id: secId, name: secId };
                            // Check which subjects this faculty is specifically assigned to teach for this section
                            const actuallyTaughtSubjects = (sec.subjects || []).filter(subRef => {
                              const assigned = getAssignedProf(sec, subRef);
                              return assigned && assigned.id === prof.id;
                            });

                            return (
                              <div key={sec.id} style={{
                                padding: '6px 10px',
                                background: 'var(--bg-main)',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.78rem'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: '700', color: 'var(--accent-dark)' }}>{sec.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal('section', sec)}
                                    className="hub-micro-action-btn"
                                    style={{ padding: '1px 5px', fontSize: '0.66rem' }}
                                    title={`Configure section ${sec.name}`}
                                  >
                                    <Layers size={10} /> Edit
                                  </button>
                                </div>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {actuallyTaughtSubjects.length > 0 ? (
                                    actuallyTaughtSubjects.map(mRef => {
                                      const mSub = getSubject(mRef) || { code: mRef };
                                      return (
                                        <span
                                          key={mRef}
                                          onClick={() => handleOpenEditModal('subject', mSub)}
                                          style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}
                                          title={`Click to configure subject ${mSub.code || mRef}`}
                                        >
                                          <span>{mSub?.code || mRef}</span>
                                          {mSub?.hasLecLab && (
                                            <span style={{ fontSize: '0.6rem', color: '#047857', opacity: 0.85 }}>(Lec+Lab)</span>
                                          )}
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>General section faculty</span>
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
            })}
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
            {displayedSubjects.map(sub => {
              const enrolledSecs = getSectionsForSubject(sub);
              const { specProfs: qualifiedProfs } = getSubjectProfessors(sub);

              return (
                <div key={sub.id} className="hub-entity-card">
                  <div className="hub-entity-header">
                    <div className="hub-entity-title" style={{ flexWrap: 'wrap', gap: '6px' }}>
                      <strong className="hub-entity-name">{sub.code}</strong>
                      <span className="hub-entity-badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}>
                        {sub.credits} Units • {sub.category}
                      </span>
                      {sub.hasLecLab && (
                        <span className="hub-tag-leclab">
                          <FlaskConical size={10} />
                          Lec & Lab
                        </span>
                      )}
                    </div>

                    <button
                      className="hub-quick-btn"
                      onClick={() => handleOpenEditModal('subject', sub)}
                    >
                      Configure
                    </button>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {sub.name}
                  </div>

                  {sub.hasLecLab ? (
                    <div className="hub-subject-leclab-banner">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem' }}>
                        <span><strong>Lecture:</strong> {sub.lectureHours || 2} hrs/wk</span>
                        <span className="hub-leclab-divider">•</span>
                        <span><strong>Laboratory:</strong> {sub.labHours || 3} hrs/wk ({sub.isFoodLab ? 'Food Lab' : sub.requiredLab ? 'Computer Lab' : 'Lab Required'})</span>
                        <span className="hub-leclab-divider">•</span>
                        <span style={{ color: '#7e22ce', fontWeight: '700' }}>Total: {Number(sub.lectureHours || 2) + Number(sub.labHours || 3)} hrs/wk</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      {sub.hoursPerMeeting || 1.5} hrs/meeting • {sub.requiredLab ? 'Requires Computer Lab' : sub.isFoodLab ? 'Requires Food Lab' : 'Standard Classroom'}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Enrolled Sections & Assigned Instructors */}
                    <div>
                      <span className="hub-card-section-label">
                        Enrolled Sections ({enrolledSecs.length}):
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
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
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  background: assignedProf ? 'rgba(86, 69, 238, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                  color: assignedProf ? 'var(--accent-primary)' : '#dc2626',
                                  border: assignedProf ? '1px solid rgba(86, 69, 238, 0.2)' : '1px solid rgba(239, 68, 68, 0.25)',
                                  cursor: 'pointer'
                                }}
                                title={assignedProf ? `Taught by ${assignedProf.name}. Click to configure section ${sec.name}` : `Needs instructor. Click to configure section ${sec.name}`}
                              >
                                {sec.name} {assignedProf ? `(${assignedProf.name?.split(' ')[0] || assignedProf.lastName})` : '— Unassigned'}
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
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {qualifiedProfs.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#ef4444' }}>No faculty specialized</span>
                        ) : (
                          qualifiedProfs.map(prof => (
                            <span
                              key={prof.id}
                              onClick={() => handleOpenEditModal('faculty', prof)}
                              style={{ fontSize: '0.72rem', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', cursor: 'pointer' }}
                              title={`Click to configure faculty ${prof.name}`}
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
            })}
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
                        const id = typeof item === 'object' && item !== null ? item.id : item;
                        const code = typeof item === 'object' && item !== null ? item.code : null;
                        const name = typeof item === 'object' && item !== null ? item.name : null;
                        setStagedAssignedSubjects(prev => {
                          const isSelected = prev.some(x => String(x) === String(id) || (code && String(x) === String(code)) || (name && String(x) === String(name)));
                          if (isSelected) return prev.filter(x => String(x) !== String(id) && String(x) !== String(code) && String(x) !== String(name));
                          return [...prev, id];
                        });
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
                        const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef, name: subRef };
                        const subKey = sub.id || sub.code;
                        const curProfId = stagedFacultyMap[subKey] || stagedFacultyMap[subRef] || '';
                        const specProfs = professors.filter(p => (p.specialization || []).some(sp => String(sp) === String(sub.id) || String(sp) === String(sub.code) || String(sp) === String(sub.name))).sort((a, b) => {
                          const nameA = a.name || `${a.lastName || ''}, ${a.firstName || ''}`;
                          const nameB = b.name || `${b.lastName || ''}, ${b.firstName || ''}`;
                          return nameA.localeCompare(nameB);
                        });
                        
                        const otherProfs = professors.filter(p => !specProfs.some(sp => sp.id === p.id)).sort((a, b) => {
                          const nameA = a.name || `${a.lastName || ''}, ${a.firstName || ''}`;
                          const nameB = b.name || `${b.lastName || ''}, ${b.firstName || ''}`;
                          return nameA.localeCompare(nameB);
                        });

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
                                <select
                                  className="hub-instructor-select"
                                  value={curProfId}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setStagedFacultyMap(prev => ({
                                      ...prev,
                                      [subKey]: val,
                                      [subRef]: val
                                    }));
                                  }}
                                >
                                  <option value="">No Instructor Assigned</option>
                                  {specProfs.length > 0 && (
                                    <optgroup label="Specialized in this subject">
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
                                      Edit Prof
                                      {isEditingThisProf ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                    </button>
                                  )}
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
                        placeholder="e.g. Maria"
                      />
                    </div>
                    <div className="hub-form-field">
                      <label className="hub-form-label">Last Name *</label>
                      <input
                        type="text"
                        className="hub-form-input"
                        value={stagedEntityForm.lastName || ''}
                        onChange={e => setStagedEntityForm(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="e.g. Santos"
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
                        const id = typeof item === 'object' && item !== null ? (item.id || item.name) : item;
                        setStagedEntityForm(prev => {
                          const cur = prev.preferredRooms || [];
                          const updated = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
                          return { ...prev, preferredRooms: updated };
                        });
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
                        const id = typeof item === 'object' && item !== null ? item.id : item;
                        setStagedAssignedSubjects(prev => {
                          const isSelected = prev.some(x => String(x) === String(id) || (item.code && String(x) === String(item.code)) || (item.name && String(x) === String(item.name)));
                          if (isSelected) return prev.filter(x => String(x) !== String(id) && String(x) !== String(item.code) && String(x) !== String(item.name));
                          return [...prev, id];
                        });
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
                        const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef, name: subRef };
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
                      allOptions={sections}
                      options={sections}
                      selectedIds={stagedAssignedSections}
                      onToggle={(item) => {
                        const id = typeof item === 'object' && item !== null ? item.id : item;
                        setStagedAssignedSections(prev =>
                          prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                        );
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
                        const sec = sections.find(s => s.id === secId || s.name === secId) || { id: secId, name: secId };
                        const chosenSubs = stagedFacultyMap[sec.id] || [];

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
                                const sub = subjects.find(s => s.id === subRef || s.code === subRef || s.name === subRef) || { id: subRef, code: subRef };
                                const subKey = sub.id || sub.code;
                                const isChecked = chosenSubs.some(s => String(s) === String(subKey) || String(s) === String(sub.id));

                                return (
                                  <button
                                    key={subKey}
                                    type="button"
                                    onClick={() => {
                                      setStagedFacultyMap(prev => {
                                        const current = prev[sec.id] || [];
                                        const updated = current.some(s => String(s) === String(subKey) || String(s) === String(sub.id))
                                          ? current.filter(s => String(s) !== String(subKey) && String(s) !== String(sub.id))
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
                                      border: isChecked ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                      background: isChecked ? 'rgba(86, 69, 238, 0.12)' : 'var(--bg-main)',
                                      color: isChecked ? 'var(--accent-primary)' : 'var(--text-muted)'
                                    }}
                                    title={sub.name ? `${sub.code ? `${sub.code}: ` : ''}${sub.name}` : sub.code}
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
                  <label
                    className={`hub-checkbox-card ${stagedEntityForm.hasLecLab ? 'active' : ''}`}
                    onClick={() => {
                      setUserLabModified(true);
                      setStagedEntityForm(prev => ({
                        ...prev,
                        hasLecLab: !prev.hasLecLab,
                        requiredLab: !prev.hasLecLab ? (prev.requiredLab || !prev.isFoodLab) : prev.requiredLab
                      }));
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(stagedEntityForm.hasLecLab)}
                      onChange={() => {}}
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
                        <select
                          className="hub-form-select"
                          value={stagedEntityForm.lectureHours || 2}
                          onChange={e => setStagedEntityForm(prev => ({ ...prev, lectureHours: Number(e.target.value) }))}
                        >
                          <option value={1}>1.0 Hour</option>
                          <option value={2}>2.0 Hours (Standard)</option>
                          <option value={3}>3.0 Hours</option>
                          <option value={4}>4.0 Hours</option>
                        </select>
                      </div>
                      <div className="hub-form-field">
                        <label className="hub-form-label">Laboratory Hours (Weekly)</label>
                        <select
                          className="hub-form-select"
                          value={stagedEntityForm.labHours || 3}
                          onChange={e => setStagedEntityForm(prev => ({ ...prev, labHours: Number(e.target.value) }))}
                        >
                          <option value={2}>2.0 Hours</option>
                          <option value={3}>3.0 Hours (Standard)</option>
                          <option value={4}>4.0 Hours</option>
                          <option value={5}>5.0 Hours</option>
                          <option value={6}>6.0 Hours</option>
                        </select>
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
                        <select
                          className="hub-form-select"
                          value={stagedEntityForm.hoursPerMeeting || 1.5}
                          onChange={e => setStagedEntityForm(prev => ({ ...prev, hoursPerMeeting: Number(e.target.value) }))}
                        >
                          <option value={1}>1.0 Hour (e.g. 3x weekly)</option>
                          <option value={1.5}>1.5 Hours (e.g. 2x weekly TTh / WF)</option>
                          <option value={2}>2.0 Hours</option>
                          <option value={3}>3.0 Hours (1x weekly block)</option>
                        </select>
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
                      <label
                        className={`hub-checkbox-card ${stagedEntityForm.requiredLab ? 'active' : ''}`}
                        onClick={() => {
                          setUserLabModified(true);
                          setStagedEntityForm(prev => ({
                            ...prev,
                            requiredLab: !prev.requiredLab,
                            isFoodLab: !prev.requiredLab ? false : prev.isFoodLab
                          }));
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(stagedEntityForm.requiredLab)}
                          onChange={() => {}}
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

                      <label
                        className={`hub-checkbox-card ${stagedEntityForm.isFoodLab ? 'active' : ''}`}
                        onClick={() => {
                          setUserLabModified(true);
                          setStagedEntityForm(prev => ({
                            ...prev,
                            isFoodLab: !prev.isFoodLab,
                            requiredLab: !prev.isFoodLab ? false : prev.requiredLab
                          }));
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(stagedEntityForm.isFoodLab)}
                          onChange={() => {}}
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
                      allOptions={sections}
                      options={sections}
                      selectedIds={stagedAssignedSections}
                      onToggle={(item) => {
                        const id = typeof item === 'object' && item !== null ? item.id : item;
                        setStagedAssignedSections(prev =>
                          prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                        );
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
                        const sec = sections.find(s => s.id === secId || s.name === secId) || { id: secId, name: secId };
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
                      allOptions={professors}
                      options={professors}
                      selectedIds={stagedFacultyMap.assignedProfessors || []}
                      onToggle={(item) => {
                        const profId = typeof item === 'object' && item !== null ? item.id : item;
                        setStagedFacultyMap(prev => {
                          const cur = prev.assignedProfessors || [];
                          const updated = cur.includes(profId) ? cur.filter(id => id !== profId) : [...cur, profId];
                          return { ...prev, assignedProfessors: updated };
                        });
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
                        const prof = professors.find(p => p.id === profId) || { id: profId, name: profId };
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

            <div className="mgmt-modal-actions" style={{ marginTop: '20px' }}>
              <button className="mgmt-cancel-btn" onClick={() => setEditingEntity(null)} disabled={isSaving}>
                Cancel
              </button>
              <button className="btn" onClick={handleSaveModal} disabled={isSaving}>
                {isSaving ? 'Saving Changes...' : 'Save Changes'}
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
        sections={sections}
        professors={professors}
        user={user}
        activeSemester={activeSemester}
        onSuccess={(newItem, type) => {
          toast.success(`Created new ${type}: ${newItem.name || newItem.code}`);
        }}
      />
    </div>
  );
};

export default AssignmentHub;